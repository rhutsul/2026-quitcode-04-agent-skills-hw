# Next.js 16 templates

Copy, rename, keep the checks. Examples use event `quote-request` (async, 202 + callback) and
`lead-created` (fire-and-forget). `server-only` is built into Next.js 16 — do not install a package.

## `lib/n8n/client.ts` — the only place that calls n8n

```ts
import "server-only";
import { randomUUID } from "node:crypto";

// The only module that calls n8n. Contract: .claude/skills/integrating-n8n-webhooks.

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // at most 2 retries → 3 attempts
const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);

export type TriggerOptions = {
  /** Created once per business operation, stored with the record, reused on every retry. */
  idempotencyKey: string;
  correlationId?: string;
  /** Async workflows only: success is then exactly 202 with a job_id. */
  callbackUrl?: string;
};

export type TriggerResult =
  | { ok: true; status: number; jobId?: string }
  | { ok: false; status?: number; reason: "config" | "rejected" | "unavailable" };

/** `${APP_BASE_URL}/api/n8n/<event>`, or null when APP_BASE_URL is missing or invalid. */
export function callbackUrlFor(event: string): string | null {
  try {
    return new URL(`/api/n8n/${event}`, process.env.APP_BASE_URL).toString();
  } catch {
    return null;
  }
}

function webhookUrl(event: string): URL | null {
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  if (!base || !/^[a-z0-9-]+$/.test(event)) return null;
  let url: URL;
  try {
    url = new URL(`${base.replace(/\/+$/, "")}/${event}`);
  } catch {
    return null;
  }
  // The token must not travel in clear text: plain http only to this machine.
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
  return secure && !url.search ? url : null;
}

const retryable = (status: number) => status >= 500; // includes 524 from n8n Cloud

export async function triggerWorkflow(
  event: string,
  data: Record<string, unknown>,
  options: TriggerOptions,
): Promise<TriggerResult> {
  const url = webhookUrl(event);
  const token = process.env.N8N_WEBHOOK_TOKEN;
  // With a callback the answer comes signed with N8N_CALLBACK_SECRET: without it every callback would be
  // refused and the record would wait forever, so do not start such a workflow at all.
  if (!url || !token || (options.callbackUrl && !process.env.N8N_CALLBACK_SECRET)) {
    console.error(`[n8n] ${event}: not sent, n8n settings are missing or invalid`);
    return { ok: false, reason: "config" };
  }
  const correlationId = options.correlationId ?? randomUUID();
  const envelope = JSON.stringify({
    version: 1,
    event,
    data,
    ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
  });

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-n8n-token": token,
          "idempotency-key": options.idempotencyKey,
          "x-correlation-id": correlationId,
        },
        body: envelope,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        // A redirect would carry x-n8n-token to another host (fetch strips only authorization/cookie):
        // never follow it — a 3xx ends up as "rejected" below.
        redirect: "manual",
      });
      console.info(
        `[n8n] ${event} -> ${response.status} in ${Date.now() - started} ms (attempt ${attempt}, correlation ${correlationId})`,
      );
      if (response.ok) {
        if (!options.callbackUrl) return { ok: true, status: response.status };
        const jobId = response.status === 202 ? await readJobId(response) : null;
        return jobId ? { ok: true, status: 202, jobId } : { ok: false, status: response.status, reason: "rejected" };
      }
      if (!retryable(response.status)) return { ok: false, status: response.status, reason: "rejected" };
    } catch (error) {
      // TimeoutError / TypeError (network). Log the name only: the error may carry the URL.
      console.warn(
        `[n8n] ${event} failed: ${error instanceof Error ? error.name : "error"} (attempt ${attempt}, correlation ${correlationId})`,
      );
    }
    const wait = RETRY_DELAYS_MS[attempt - 1];
    if (wait !== undefined) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return { ok: false, reason: "unavailable" };
}

async function readJobId(response: Response): Promise<string | null> {
  try {
    const json: unknown = await response.json();
    const jobId = json && typeof json === "object" ? (json as { job_id?: unknown }).job_id : undefined;
    return typeof jobId === "string" && jobId !== "" ? jobId : null;
  } catch {
    return null;
  }
}
```

## `lib/n8n/callback.ts` — signature, time window, size

```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const CALLBACK_MAX_BYTES = 64 * 1024;
export const CALLBACK_WINDOW_S = 300;

export type CallbackCheck = { ok: true } | { ok: false; status: 401 | 413 | 500 };

/**
 * Step 2–3: the raw body as text, or null as soon as it grows past `limit` bytes — also when the
 * sender gives no content-length (chunked). Decoded like req.text(), so the signed bytes are the same.
 */
export async function readBodyLimited(req: Request, limit = CALLBACK_MAX_BYTES): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Steps 3–5 of the callback order. `raw` is the body exactly as received (readBodyLimited). */
export function verifyCallback(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  nowMs = Date.now(),
): CallbackCheck {
  if (Buffer.byteLength(raw, "utf8") > CALLBACK_MAX_BYTES) return { ok: false, status: 413 };
  const secret = process.env.N8N_CALLBACK_SECRET;
  if (!secret) return { ok: false, status: 500 };
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return { ok: false, status: 401 };
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > CALLBACK_WINDOW_S) return { ok: false, status: 401 };

  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`);
  const given = Buffer.from(signature ?? "");
  // timingSafeEqual throws on different lengths, so compare lengths first.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 401 };
  return { ok: true };
}
```

## `lib/n8n/idempotency.ts` — claim / release

```ts
import "server-only";

// Demo storage: process memory, like lib/db.ts. In production this is a table/KV with a unique
// constraint — serverless instances do not share memory.
const globalForKeys = globalThis as unknown as { leadDeskCallbackKeys?: Set<string> };
const claimed = (globalForKeys.leadDeskCallbackKeys ??= new Set<string>());

/** true = first time we see this key; false = duplicate. */
export function claimKey(key: string): boolean {
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

export function releaseKey(key: string): void {
  claimed.delete(key);
}
```

## `app/api/n8n/[event]/route.ts` — the callback

```ts
import { db } from "@/lib/db"; // your data layer
import { CALLBACK_MAX_BYTES, readBodyLimited, verifyCallback } from "@/lib/n8n/callback";
import { claimKey, releaseKey } from "@/lib/n8n/idempotency";

// Callbacks from n8n. Public endpoint: only the HMAC signature is trusted.
// No `export const runtime = "edge"`: we need node:crypto.

type CallbackData = {
  jobId: string;
  status: "completed" | "failed";
  requestIdempotencyKey?: string;
  result?: { documentUrl?: unknown };
  error?: { code?: unknown };
};

// Path segment = the trigger event. Each handler saves the minimal state; false = unknown job / bad data.
const HANDLERS: Record<string, (data: CallbackData) => Promise<boolean>> = {
  "quote-request": async (data) => {
    const documentUrl = data.status === "completed" ? safeDocumentUrl(data.result?.documentUrl) : null;
    if (data.status === "completed" && !documentUrl) return false;
    const errorCode = typeof data.error?.code === "string" ? data.error.code.slice(0, 64) : null;
    return db.completeQuote({
      jobId: data.jobId,
      requestIdempotencyKey: typeof data.requestIdempotencyKey === "string" ? data.requestIdempotencyKey : null,
      status: data.status,
      documentUrl,
      errorCode,
    });
  },
};

export async function POST(req: Request, ctx: RouteContext<"/api/n8n/[event]">) {
  const { event } = await ctx.params;
  const handle = Object.hasOwn(HANDLERS, event) ? HANDLERS[event] : undefined;
  if (!handle) return Response.json({ error: "not_found" }, { status: 404 });
  const mediaType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return Response.json({ error: "unsupported_media_type" }, { status: 415 });
  // Refuse an oversized body before reading it; readBodyLimited also stops at 64 KB without content-length.
  if (Number(req.headers.get("content-length") ?? 0) > CALLBACK_MAX_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  const raw = await readBodyLimited(req); // the exact signed bytes; never req.json() here
  if (raw === null) return Response.json({ error: "payload_too_large" }, { status: 413 });
  const check = verifyCallback(raw, req.headers.get("x-n8n-timestamp"), req.headers.get("x-n8n-signature"));
  if (!check.ok) return Response.json({ error: "rejected" }, { status: check.status });

  const key = req.headers.get("idempotency-key");
  if (!key) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!claimKey(key)) return Response.json({ duplicate: true }, { status: 200 });

  const data = parseCallback(raw, event, key);
  if (!data) {
    releaseKey(key);
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (!(await handle(data))) {
      releaseKey(key);
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
  } catch {
    releaseKey(key); // let n8n's Retry On Fail try again
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  const correlationId = req.headers.get("x-correlation-id") ?? "-";
  console.info(`[n8n] callback ${event} ${data.status} accepted (correlation ${correlationId})`);
  return Response.json({ ok: true }, { status: 202 });
}

/** Step 7: parse only after the signature; the key must match the signed body. */
function parseCallback(raw: string, event: string, key: string): CallbackData | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const body = json as { version?: unknown; event?: unknown; data?: Record<string, unknown> };
  const data = body.data;
  if (body.version !== 1 || body.event !== `${event}.completed`) return null;
  if (!data || typeof data.jobId !== "string" || data.jobId === "") return null;
  if (data.status !== "completed" && data.status !== "failed") return null;
  if (key !== `${data.jobId}:${body.event}`) return null;
  return data as unknown as CallbackData;
}

// The link is rendered as <a href> on a public page: only https, no credentials.
function safeDocumentUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
```

## Server Action — save, return at once, call n8n in `after()`

```ts
"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { callbackUrlFor, triggerWorkflow } from "@/lib/n8n/client";

export async function requestQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  // Session/permissions first if the form is not public (server-auth-actions).
  const parsed = parseQuoteForm(formData); // server-side validation, no silent truncation
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: parsed.values };
  // A public form that starts a long workflow also needs a rate limit here (e.g. per client IP) before
  // anything is stored — see app/quotes/actions.ts + lib/rate-limit.ts in this project.

  // The idempotency key is created once and stored with the record: every retry reuses it,
  // and n8n echoes it back as data.requestIdempotencyKey.
  const quote = await db.insertQuote({
    ...parsed.data, // insertQuote stores it with status "queued"
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(), // the same id goes into both systems' logs
  });

  after(async () => {
    try {
      const callbackUrl = callbackUrlFor("quote-request");
      const result = callbackUrl
        ? await triggerWorkflow(
            "quote-request",
            // The minimum the workflow needs — never the whole row.
            { quoteId: quote.id, company: quote.company, email: quote.email, description: quote.description, budget: quote.budget },
            { idempotencyKey: quote.idempotencyKey, correlationId: quote.correlationId, callbackUrl },
          )
        : ({ ok: false, reason: "config" } as const);

      // Conditional transitions: a fast workflow's callback may already have set ready/failed.
      // Never overwrite that with an unconditional update.
      if (result.ok && result.jobId) await db.markQuoteProcessing(quote.id, result.jobId); // queued → processing
      else await db.markQuoteNotStarted(quote.id, result.ok ? "rejected" : result.reason); // queued → failed
    } catch (error) {
      // Anything unexpected must not leave the record queued forever: no callback will come for it.
      console.error(`[n8n] quote-request: trigger failed for ${quote.id}: ${error instanceof Error ? error.name : "error"}`);
      await db.markQuoteNotStarted(quote.id, "error").catch(() => undefined);
    }
  });

  redirect(`/quotes/${quote.id}`); // or return { status: "ok", id: quote.id }
}
```

The three state changes, each guarded (in-memory example; in a real DB — `UPDATE … WHERE status = 'queued'`):

```ts
markQuoteProcessing(id, jobId)   // jobId ??= jobId; if status === "queued" → "processing"
markQuoteNotStarted(id, code)    // only if status === "queued" → "failed" (no callback will come)
completeQuote(result)            // find by jobId, else by idempotencyKey while jobId is null → "ready" | "failed"
```

- The form answers in milliseconds; n8n's answer arrives later and only changes the record.
- The status page (`/quotes/[id]`) is a Server Component that reads the record; while it is `queued` or
  `processing`, a tiny Client Component calls `router.refresh()` every few seconds — and **stops** after a
  deadline (e.g. 15 min) with a message, because a callback that never came will not come by itself.

## Fire-and-forget event (existing `lead-created` style)

```ts
// Two after() callbacks: the audit entry must not wait for n8n's retries.
after(() => logAudit("lead.created", lead.id));
after(async () => {
  const delivered = await triggerWorkflow(
    "lead-created",
    { leadId: lead.id, fullName: lead.fullName, email: lead.email, message: lead.message, source: lead.source },
    { idempotencyKey }, // created once for this lead (store it with the record if you can)
  );
  if (!delivered.ok) await logAudit("lead.n8n_not_delivered", lead.id); // a trace, no personal data
});
```

Never `await fetch(process.env.SOME_N8N_URL, …)` straight from an action; never send the whole lead
(IP, user agent, raw payload, internal notes). When migrating an existing call, keep the fields the
client's workflow already uses — ask the human which ones if unsure (stop rule).

## `.env.example`

```bash
# n8n (server-only). Real values only in .env.local. Production base URL (never the editor's test URL).
N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook
N8N_WEBHOOK_TOKEN=change-me-webhook-token
N8N_CALLBACK_SECRET=change-me-callback-secret
APP_BASE_URL=http://127.0.0.1:3000
```
