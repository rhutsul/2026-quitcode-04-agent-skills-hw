"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { triggerWorkflow } from "@/lib/n8n/client";
import { parseLeadForm, type LeadFormField } from "@/lib/lead-form";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>> }
  | { status: "ok" };

// Public form on / — no session check on purpose; everything else (validation) happens here.
export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  const lead = await db.insertLead({
    ...parsed.data,
    workspaceId: PUBLIC_FORM_WORKSPACE_ID,
    jobTitle: "",
    city: "",
    country: "",
    source: "website",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ipAddress,
    userAgent,
    rawPayload: {
      form: { id: "contact-main", version: "2026-07", fields: parsed.data },
      request: {
        ip: ipAddress,
        userAgent,
        acceptLanguage: requestHeaders.get("accept-language"),
        receivedAt: new Date().toISOString(),
      },
    },
  });

  // Fire-and-forget event (Respond: Immediately): the visitor does not wait for n8n or the audit.
  // n8n gets the contact fields it needs — no IP, user agent, raw payload or internal notes.
  // Two separate after() callbacks: the audit entry must not wait for n8n's retries.
  after(() => logAudit("lead.created", lead.id));
  const idempotencyKey = randomUUID();
  after(async () => {
    const delivered = await triggerWorkflow(
      "lead-created",
      {
        leadId: lead.id,
        fullName: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        website: lead.website,
        budget: lead.budget,
        message: lead.message,
        source: lead.source,
        consentMarketing: lead.consentMarketing,
        createdAt: lead.createdAt,
      },
      { idempotencyKey },
    );
    // Fire-and-forget still leaves a trace when n8n did not take the lead (no personal data in it).
    if (!delivered.ok) await logAudit("lead.n8n_not_delivered", lead.id);
  });

  return { status: "ok" };
}

type LeadMutationResult = { status: "ok" } | { status: "forbidden" };

// Server Actions are public POST endpoints: the session and the lead's workspace are checked here,
// not only by the page that renders the buttons. No session → /login (getCurrentUser redirects).
async function ownLead(id: unknown) {
  const user = await getCurrentUser();
  if (typeof id !== "string") return null;
  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), getLead(id)]);
  return lead && lead.workspaceId === workspace.id ? lead : null;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<LeadMutationResult> {
  const lead = await ownLead(id);
  if (!lead || !LEAD_STATUSES.includes(status)) return { status: "forbidden" };
  await db.updateLeadStatus(lead.id, status);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${lead.id}`);
  return { status: "ok" };
}

export async function deleteLead(id: string): Promise<LeadMutationResult> {
  const lead = await ownLead(id);
  if (!lead) return { status: "forbidden" };
  await db.deleteLead(lead.id);
  revalidatePath("/dashboard");
  return { status: "ok" };
}
