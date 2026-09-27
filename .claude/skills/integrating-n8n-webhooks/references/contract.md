# n8n contract — full version

Read this when implementing or reviewing either direction. `SKILL.md` has the short form.

```text
Next.js (Server Action / Route Handler)              n8n
  lib/n8n/client.ts ── POST /webhook/<event> ───────▶ Webhook node (Header Auth)
                       x-n8n-token, idempotency-key,   └─ Respond to Webhook: 202 {job_id}
                       x-correlation-id                     … workflow runs …
  app/api/n8n/[event]/route.ts ◀── POST (signed) ──── HTTP Request node
                       x-n8n-timestamp, x-n8n-signature,   (Crypto node computes the HMAC)
                       idempotency-key, x-correlation-id
```

## 1. Environment variables

All server-only. Next.js inlines only `NEXT_PUBLIC_*` variables into the client bundle, so no `N8N_*`
variable ever has that prefix.

| Variable | Meaning | Local example |
|---|---|---|
| `N8N_WEBHOOK_BASE_URL` | Base of production webhook URLs, ends with `/webhook` | `http://127.0.0.1:5678/webhook` |
| `N8N_WEBHOOK_TOKEN` | Value of `x-n8n-token` (same as the Header Auth credential in n8n) | `change-me-webhook-token` |
| `N8N_CALLBACK_SECRET` | HMAC secret for callbacks (same as Hmac Secret of the Crypto credential) | `change-me-callback-secret` |
| `APP_BASE_URL` | App origin n8n uses for callback endpoints | `http://127.0.0.1:3000` |

- Real values live only in `.env.local` (git-ignored) and in the hosting settings. `.env.example` has the
  four keys, secrets as `change-me-…`, local URLs, never `/webhook-test/`.
- Generate secrets, do not invent them: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- A secret never goes to a query string, a Client Component, a log or an error message.
- The app refuses to send `x-n8n-token` to a remote `http:` URL: plain `http` only for `127.0.0.1`,
  `::1`, `localhost`; everything else must be `https`.

## 2. Next.js → n8n

**Where.** One module, `lib/n8n/client.ts`, first line `import "server-only"` (built into Next.js 16 —
no package to install); importing it from a Client Component is then a build error. No direct `fetch`
to n8n anywhere else.

**Request.** `POST ${N8N_WEBHOOK_BASE_URL}/<event>`, `<event>` in kebab-case (`lead-created`,
`quote-request`). One event = one path: n8n allows one webhook per path + method.

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-token` | `N8N_WEBHOOK_TOKEN` |
| `idempotency-key` | UUID created **once** per business operation and stored with the record; the same on every retry |
| `x-correlation-id` | UUID of the chain of actions; the same id goes into both systems' logs |

**Body — envelope:**

```json
{
  "version": 1,
  "event": "quote-request",
  "data": { "quoteId": "q_0042", "company": "Nova Dental", "budget": 1500 },
  "callbackUrl": "http://127.0.0.1:3000/api/n8n/quote-request"
}
```

- `version` — envelope version. A new optional field keeps the version; renaming a field or changing
  its meaning is a new version, and the workflow accepts both for a while.
- `data` — the **minimum** the workflow needs. Never the whole DB row: IP, user agent, internal notes,
  raw form payload are not for n8n.
- `callbackUrl` — only for async workflows, built from `APP_BASE_URL` (`${APP_BASE_URL}/api/n8n/<event>`).

**Timeout.** Every attempt: `fetch(url, { …, signal: AbortSignal.timeout(10_000) })`; on expiry `fetch`
rejects with `TimeoutError`. 10 s is our decision: in async mode n8n answers right after receiving the
request, so a long answer is a failure, not a slow workflow.

**Retries.** At most 2 (3 attempts total), wait 1 s then 3 s, **only** for network error, timeout, 5xx
and 524. Always with the same `idempotency-key`. Never retry 4xx: 403 = wrong token, 404 = workflow not
published or a test URL. Those need fixing, not retrying.

**Who calls.**

- UI action → Server Action. It is a public POST endpoint: authentication, permissions and validation
  happen inside it (Vercel rule `server-auth-actions`).
- The user does not wait for n8n. The action saves the record (e.g. `status: "queued"`), returns only
  `{ status, id }`, and the n8n call with retries runs in `after()` (`server-after-nonblocking`). Also:
  Next.js runs Server Actions one at a time per client, so a long await blocks that user's next action.
- Non-React caller (another service, cron) → Route Handler.
- Never `export const runtime = "edge"`: deprecated in Next.js 16, and we need `node:crypto`.

**Response.** Look at the **status code** only. Do not parse the message: the docs say «Workflow got
started», the n8n code returns `{"message":"Workflow was started"}`. For async workflows success is
exactly `202` with a non-empty `job_id`; store `job_id` with the record. Anything else is a failure:
set the record to `failed` (or keep it for a manual retry) — never leave it `queued` forever.

## 3. n8n → Next.js: callback

**Endpoint.** `POST /api/n8n/<event>` — Route Handler `app/api/n8n/[event]/route.ts`. A Route Handler is
a public endpoint; trust only the signature.

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-n8n-timestamp` | Unix time in seconds when n8n signed the request |
| `x-n8n-signature` | `sha256=<hex HMAC-SHA256(N8N_CALLBACK_SECRET, "${timestamp}.${rawBody}")>` |
| `idempotency-key` | `<data.jobId>:<event>` — the same values as in the signed body |
| `x-correlation-id` | copied from the request that started the workflow |

**Body:**

```json
{
  "version": 1,
  "event": "quote-request.completed",
  "data": {
    "jobId": "5f0c…",
    "status": "completed",
    "correlationId": "9b1e…",
    "requestIdempotencyKey": "c3d4…",
    "result": { "documentUrl": "https://files.example.test/n8n/5f0c….pdf" },
    "completedAt": "2026-09-21T12:00:00.000Z"
  }
}
```

`data.status` is `completed` or `failed` (then `error: { code }` instead of `result`). Match the callback
to your record by `data.jobId` (the `job_id` n8n returned) or `data.requestIdempotencyKey` (the key you
sent). The path segment is the trigger event (`quote-request`); the body event is `<path>.completed`.

**Processing order — exactly this:**

| # | Step | On failure |
|---|---|---|
| 1 | event from the path is known; `content-type` is `application/json` — **before** reading the body | 404 / 415 |
| 2 | `const raw = await readBodyLimited(req)` — a reader that streams `req.body` and stops past 64 KB (Route Handlers have no body-size limit of their own); plain `req.text()` only where the host caps the body size — body can be read once; no `req.json()`, no `JSON.parse` yet (re-serialising changes bytes, the signature would not match) | — |
| 3 | `content-length` over 64 KB → refuse before reading; then `Buffer.byteLength(raw) > 64 * 1024` | 413 |
| 4 | `x-n8n-timestamp` is an integer and `abs(now - ts) <= 300` s (anti-replay window, our decision) | 401 |
| 5 | HMAC over `` `${timestamp}.${raw}` ``; compare lengths first, then `crypto.timingSafeEqual` (it throws on different lengths). Never `===`. | 401, no details |
| 6 | claim `idempotency-key` (unique insert); already claimed | 200 `{"duplicate": true}` |
| 7 | `JSON.parse(raw)`, validate shape; body `event` must be `` `${pathEvent}.completed` ``; key must equal `` `${data.jobId}:${body.event}` `` (full body event, e.g. `quote-request.completed`) | 400 + release the key |
| 8 | save minimal state (`status = ready`, document URL) **before** the response | 5xx + release the key |
| 9 | respond | 202 `{"ok": true}` |
| 10 | slow follow-ups (emails, notifications) | in `after()` |

- Why save before responding: after a 2xx n8n will not retry. A critical write that lived only in
  `after()` and failed would be lost for good.
- Why the key is checked against the body: the `idempotency-key` header is not covered by the HMAC. A
  captured signed callback could be replayed within 300 s with a new key; when the key must equal fields
  of the signed body, a replay with the same key is a duplicate and with another key is 400.
- Why release the key on 4xx/5xx after step 6: n8n's Retry On Fail would otherwise get
  `{"duplicate": true}` and the result would be lost.
- Storage for keys: a DB table or KV with a unique constraint. Process memory is for demos only —
  serverless handlers do not share state between requests.

## 4. Idempotency on both sides

- Next.js → n8n: the same `idempotency-key` on every attempt. In n8n a **Remove Duplicates** node right
  after the Webhook («Remove Items Processed in Previous Executions», key `idempotency-key`) drops repeats.
- n8n → Next.js: HTTP Request with Retry On Fail repeats callbacks; the route drops repeats by key (step
  6) and accepts only a key that matches the signed body (step 7).
- Duplicates are certain, not rare: both our retries and n8n's Retry On Fail create them.

## 5. Logs

| Log | Never log |
|---|---|
| event, direction, `x-correlation-id` | request or response bodies |
| status code, duration, attempt number | name, email, phone, IP of the client |
| body length and its sha256 | token, signature, secret, full URL with query string |

Error responses carry no internals (stack, SQL, n8n URL).

## 6. Limits

| Limit | Value | Where from |
|---|---|---|
| Request body to an n8n webhook | 16 MB (`N8N_PAYLOAD_SIZE_MAX`, configurable on self-hosted) | n8n Webhook docs |
| Server Action body | 1 MB by default (`serverActions.bodySizeLimit`) | Next.js Server Actions guide |
| Webhook response on n8n Cloud | 100 s, then 524 | n8n Webhook common issues |
| Test URL | 120 s after «Listen for test event» | n8n workflow development |
| Callback into Next.js | 64 KB, time window 300 s | our decision |

Files are never sent — only links to them.

## 7. Integration register

Every integration is a row in the project's `docs/n8n-integrations.md`:

| event | direction | n8n path | mode | owner |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → callback | `/webhook/quote-request` | Respond to Webhook 202 + callback | responsible person |
