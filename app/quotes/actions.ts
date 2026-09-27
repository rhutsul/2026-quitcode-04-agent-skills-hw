"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { callbackUrlFor, triggerWorkflow } from "@/lib/n8n/client";
import { parseQuoteForm, type QuoteFormState } from "@/lib/quote-form";
import { takeRateLimit } from "@/lib/rate-limit";

const QUOTE_EVENT = "quote-request";
// Every accepted request starts a 40–90 s workflow that renders a PDF: cap it per client IP.
const QUOTES_PER_IP = 5;
const QUOTE_WINDOW_MS = 10 * 60 * 1000;

// Public form, like the lead form on /: no session, so the action validates everything itself.
export async function requestQuote(_prevState: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: parsed.values };

  // Counted only for valid requests, before anything is stored or sent to n8n. The IP is not logged.
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() || requestHeaders.get("x-real-ip") || "unknown";
  if (!takeRateLimit(`quote:${ip}`, QUOTES_PER_IP, QUOTE_WINDOW_MS)) {
    return { status: "rate_limited", values: { ...parsed.data, budget: String(parsed.data.budget) } };
  }

  const quote = await db.insertQuote({
    ...parsed.data,
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
  });

  // The workflow runs 40–90 s: n8n answers 202 { job_id } at once, the PDF arrives by callback.
  // The user does not wait even for the 202 — it happens after the redirect is sent.
  after(async () => {
    try {
      const callbackUrl = callbackUrlFor(QUOTE_EVENT);
      if (!callbackUrl) {
        // No callback could reach the app: do not start the workflow at all.
        console.error(`[n8n] ${QUOTE_EVENT}: not sent, APP_BASE_URL is missing or invalid (correlation ${quote.correlationId})`);
        await db.markQuoteNotStarted(quote.id, "config");
        return;
      }
      const result = await triggerWorkflow(
        QUOTE_EVENT,
        // The minimum the workflow needs to build the estimate.
        {
          quoteId: quote.id,
          company: quote.company,
          email: quote.email,
          description: quote.description,
          budget: quote.budget,
        },
        { idempotencyKey: quote.idempotencyKey, correlationId: quote.correlationId, callbackUrl },
      );

      if (result.ok && result.jobId) await db.markQuoteProcessing(quote.id, result.jobId);
      else await db.markQuoteNotStarted(quote.id, result.ok ? "rejected" : result.reason);
    } catch (error) {
      // Anything unexpected must not leave the quote queued forever (no callback will come).
      console.error(`[n8n] ${QUOTE_EVENT}: trigger failed (correlation ${quote.correlationId}): ${error instanceof Error ? error.name : "error"}`);
      await db.markQuoteNotStarted(quote.id, "error").catch(() => undefined);
    }
  });

  redirect(`/quotes/${quote.id}`);
}
