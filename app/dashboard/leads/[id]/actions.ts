"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { db } from "@/lib/db";
import { parseNoteForm, type NoteFormState } from "@/lib/note-form";

// Server Actions are public POST endpoints: session, workspace and input are
// checked here, not only by the page that renders the form.
export async function addLeadNote(_prevState: NoteFormState, formData: FormData): Promise<NoteFormState> {
  // Any workspace member (owner or manager) may add notes; no session → /login.
  const user = await getCurrentUser();
  // The id comes from the client like any other field: trust it only after
  // the workspace check below.
  const leadId = formData.get("leadId");
  // On a refusal the typed note comes back too, so the form does not lose it.
  const typed = { note: typeof formData.get("note") === "string" ? String(formData.get("note")) : "" };
  if (typeof leadId !== "string") return { status: "forbidden", values: typed };
  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), getLead(leadId)]);

  // Same answer for "missing" and "someone else's" so ids cannot be probed.
  if (!lead || lead.workspaceId !== workspace.id) return { status: "forbidden", values: typed };

  const parsed = parseNoteForm(formData);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: parsed.values };

  const appended = await db.appendLeadNote(lead.id, parsed.data.note);
  if (!appended) return { status: "forbidden", values: typed };

  after(() => logAudit("lead.note_added", lead.id));

  revalidatePath(`/dashboard/leads/${lead.id}`);
  return { status: "ok" };
}
