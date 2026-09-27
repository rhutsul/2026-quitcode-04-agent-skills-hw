---
name: integrating-n8n-webhooks
description: >-
  The team contract for connecting a Next.js 16 App Router app to n8n workflows: triggering a
  workflow from a Server Action (one server-only client, production /webhook URL, x-n8n-token,
  idempotency-key, timeout and retries, call inside after()), long workflows as 202 + signed
  callback, and the callback Route Handler (raw body, HMAC-SHA256 with timingSafeEqual, ±300 s
  window, idempotency). Includes a static contract checker and an offline n8n mock. Use when code
  sends data to n8n or a webhook, starts an automation or workflow, receives a callback from n8n,
  or when an n8n call is slow, fails with 403/404/524, or loses data. Triggers: «запусти воркфлоу
  n8n», «відправ заявку в n8n», «вебхук n8n», «колбек від n8n», «n8n повідомить, коли готово»,
  "trigger an n8n workflow", "n8n webhook", "n8n callback". Not for building or editing workflows
  in the n8n editor, code for n8n Code nodes, or exporting/importing workflow JSON.
metadata:
  owner: studio-nova-dev
  version: "0.1.0"
---

# Integrating n8n webhooks

A form starts a workflow in the client's n8n; n8n reports back when the result is ready. Every project
must answer the same questions the same way — URL, auth, signature, response mode, retries — or it hits
the same bugs: test URLs in `.env`, users staring at a spinner until n8n Cloud returns 524, an open
callback endpoint anyone can call, duplicate updates on retry, personal data in logs.

## When to use

- Code that calls an n8n webhook, or any workflow/automation URL, from Next.js.
- A Route Handler that n8n calls back (`/api/n8n/<event>`).
- Debugging 403 / 404 / 524 from n8n, missing or duplicated callbacks.
- **Not** for building workflows in the n8n editor, n8n Code-node code, or workflow JSON.

## The contract in short

Full details and reasons: [references/contract.md](references/contract.md).

| Env variable (server-only, never `NEXT_PUBLIC_`) | Local value |
|---|---|
| `N8N_WEBHOOK_BASE_URL` — production base, ends with `/webhook` | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` — value of header `x-n8n-token` (n8n Header Auth) | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` — HMAC secret for callbacks (n8n Crypto credential) | `change-me-callback-secret` |
| `APP_BASE_URL` — where n8n reaches the app's callback endpoints | `http://127.0.0.1:3000` |

**Next.js → n8n.** `POST ${N8N_WEBHOOK_BASE_URL}/<event>` (event in kebab-case, one path per event),
only from `lib/n8n/client.ts` whose first line is `import "server-only"`. Headers: `content-type:
application/json`, `x-n8n-token`, `idempotency-key` (UUID created once per business operation, stored
with the record, reused on every retry), `x-correlation-id`. Body is an envelope
`{ version: 1, event, data, callbackUrl? }` with the **minimum** data the workflow needs — never the DB
row. Every attempt: `signal: AbortSignal.timeout(10_000)`. Retry at most 2 times (1 s, then 3 s) only
on network error, timeout, 5xx, 524. Never retry 4xx. Judge the response by status code only.

**Who waits.** The Server Action checks session and input itself (Vercel rule `server-auth-actions`),
saves the record (e.g. `status: "queued"`), returns `{ status, id }`, and runs the n8n call inside
`after()` (`server-after-nonblocking`). Anything that may take close to 100 s is async: n8n answers
**202 `{ job_id }`** at once (Respond to Webhook), the result comes by callback. Unsure how long a
workflow runs → it is async. Modes and URLs: [references/response-modes.md](references/response-modes.md).

**n8n → Next.js callback.** `app/api/n8n/[event]/route.ts`, Node runtime (never `runtime = "edge"`).
Order is fixed:

1. unknown event → 404; `content-type` not `application/json` → 415 (before reading the body);
2. read the raw text once with a bounded reader that streams `req.body` and stops past 64 KB (template:
   `readBodyLimited`); plain `req.text()` only where the host already caps the body size — no `req.json()`, no
   `JSON.parse` before step 5;
3. body > 64 KB → 413 (refuse by `content-length` before reading, re-check the real size after);
4. `x-n8n-timestamp` more than 300 s from now (either way) → 401;
5. `x-n8n-signature` = `sha256=` + hex HMAC-SHA256(`N8N_CALLBACK_SECRET`, `` `${timestamp}.${raw}` ``):
   compare lengths, then `crypto.timingSafeEqual` — never `===` → 401 with no details;
6. claim `idempotency-key` (unique); already seen → 200 `{ "duplicate": true }`;
7. now `JSON.parse(raw)`, validate shape; body `event` ≠ `` `${pathEvent}.completed` `` or key ≠
   `` `${data.jobId}:${body.event}` `` (e.g. `5f0c…:quote-request.completed`) → 400
   (and release the key);
8. save the minimal state **before** responding (release the key if saving fails);
9. respond 202 `{ "ok": true }`; slow follow-ups go to `after()`.

**Logs.** Event, direction, correlation id, status, duration, attempt, body length/sha256 — never bodies,
names, emails, phones, IPs, tokens, signatures, secrets or full URLs with query strings.

## How we build it

1. Read [references/nextjs-patterns.md](references/nextjs-patterns.md) and copy its templates:
   `lib/n8n/client.ts` (`triggerWorkflow`), `lib/n8n/callback.ts` (`verifyCallback`), the Route
   Handler, and the Server Action with `after()`. Adapt names; do not weaken the checks.
2. Add all four keys to `.env.example` with `change-me-…` secrets and local URLs; real values only in
   `.env.local`. Generate secrets: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Bring any **existing** n8n call in the project to the same client — two ways of calling n8n in one
   project is a contract violation, not legacy.
4. Tell the human how to configure the n8n side in words:
   [references/n8n-side-setup.md](references/n8n-side-setup.md). Add a row to `docs/n8n-integrations.md`.
5. Security and logging rules, known traps in docs and other skills:
   [references/security-checklist.md](references/security-checklist.md).

## Checklist

```text
- [ ] 1. No /webhook-test/ URL in code or .env.example; base URL ends with /webhook.
- [ ] 2. No NEXT_PUBLIC_N8N_*; no N8N_* or lib/n8n import in a "use client" file.
- [ ] 3. Every n8n fetch lives in lib/n8n/*, which starts with import "server-only".
- [ ] 4. Every n8n fetch has signal: AbortSignal.timeout(10_000) and sends x-n8n-token + idempotency-key.
- [ ] 5. Same idempotency-key on every retry; retries only on network/timeout/5xx/524, max 2.
- [ ] 6. The Server Action returns before n8n answers (the call runs in after()).
- [ ] 7. Long workflow = 202 + callback; callbackUrl built from APP_BASE_URL.
- [ ] 8. Callback: 404/415 → raw text → 413 → ±300 s → HMAC + timingSafeEqual → idempotency → parse → save → 202.
- [ ] 9. No bodies, personal data, tokens or signatures in logs or error responses.
- [ ] 10. .env.example has the four keys with change-me-… secrets; .env.local is git-ignored.
- [ ] 11. node <skill>/scripts/check-contract.mjs → 0 FAIL.
```

## Stop rules — stop and ask the human if:

- The only URL you have is a test URL (`/webhook-test/…`), or you do not know the production path.
- A token or secret would end up in a Client Component, a `NEXT_PUBLIC_` variable, a query string, a
  log line, an error message, git, or a chat message — or you would need to see a real secret value.
- The user would wait synchronously for a workflow that may run longer than a few seconds, or someone
  asks to raise timeouts instead of switching to 202 + callback.
- The workflow's response mode, event path or callback payload is unknown and cannot be checked with the
  mock — do not guess the client's n8n setup.
- The task needs changes inside the client's n8n (editor, workflow JSON, credentials), a new dependency,
  `runtime = "edge"`, or skipping signature/timestamp/idempotency checks "for now".

No exceptions of the kind "the task requires it": these are decisions for a human.

## Verify — done only when:

- [ ] `npm run lint` and `npm run build` pass.
- [ ] `node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs` → 0 FAIL, exit code 0
      (`--changed-since <ref>` to see only what you changed; `--help` for all checks).
- [ ] With the mock (`node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/mock-n8n.mjs --mode respond-202 --delay 5000`):
      the form answers in well under a second; the mock logs `POST /webhook/<event> -> 202 … auth=ok
      idempotency=new`; after ~5 s `callback POST … -> 202`; the status page shows the result.
- [ ] `node --env-file=.env.local .claude/skills/integrating-n8n-webhooks/scripts/send-signed-callback.mjs --url http://127.0.0.1:3000/api/n8n/<event> --job-id <id>`
      → every case gets its expected status (bad signature, stale time, reformatted body, replay…). `<id>` = the
      `job_id` of a quote that is still `processing` (mock log: `workflow <id> running…`; run the mock with a long
      `--delay`), otherwise `valid`/`duplicate` get 400 for an unknown job. Use a new `processing` job for every run:
      after one run its key is claimed and the quote is ready, so `valid` gets 200 (duplicate).
- [ ] The server log for the whole scenario has no bodies, emails, phones, tokens or signatures.

## Skill files

- [references/contract.md](references/contract.md) — full contract: env, request, envelope, retries, callback order, limits, why.
- [references/response-modes.md](references/response-modes.md) — Webhook response modes, 100 s / 524 rule, test vs production URL.
- [references/nextjs-patterns.md](references/nextjs-patterns.md) — code templates for Next.js 16.
- [references/n8n-side-setup.md](references/n8n-side-setup.md) — node-by-node n8n settings to hand to the human.
- [references/security-checklist.md](references/security-checklist.md) — secrets, logs, known traps, troubleshooting.
- `scripts/check-contract.mjs` — static contract check (C1–C11), `--root`, `--changed-since`, `--help`.
- `scripts/send-signed-callback.mjs` — callback matrix against a running route, `--help`.
- `scripts/mock-n8n.mjs` — offline n8n (Webhook, Respond to Webhook, Header Auth, signed callback), `--help`.
