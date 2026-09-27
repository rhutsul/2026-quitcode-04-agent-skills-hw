import "server-only";
import { randomUUID } from "node:crypto";

// The only module that calls n8n. Contract: .claude/skills/integrating-n8n-webhooks.

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000]; // at most 2 retries → 3 attempts
const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);
// Plain http callbacks never leave this machine: loopback, and in development also n8n in Docker reaching the
// app on the host. A production build (next build / next start) drops host.docker.internal.
const LOCAL_CALLBACK_HOSTS =
  process.env.NODE_ENV === "production" ? LOOPBACK : new Set([...LOOPBACK, "host.docker.internal"]);

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

/**
 * `${APP_BASE_URL}/api/n8n/<event>`, or null when APP_BASE_URL is missing, invalid or not https (plain http only
 * to loopback, or to host.docker.internal outside production) — at least as strict as the rule the n8n side
 * applies before it sends a signed callback there.
 */
export function callbackUrlFor(event: string): string | null {
  try {
    const url = new URL(`/api/n8n/${event}`, process.env.APP_BASE_URL);
    const secure = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_CALLBACK_HOSTS.has(url.hostname));
    return secure ? url.toString() : null;
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
