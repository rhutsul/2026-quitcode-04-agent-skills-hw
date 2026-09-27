# n8n integrations

Contract: `.claude/skills/integrating-n8n-webhooks`. One row per event.

| event | direction | n8n path | mode | owner |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → callback `/api/n8n/quote-request` | `/webhook/quote-request` | Respond to Webhook 202 `{job_id}` + signed callback (workflow runs 40–90 s) | Ruslan Hutsul |
| `lead-created` | Next.js → n8n | `/webhook/lead-created` | Immediately (fire-and-forget) | Ruslan Hutsul |

## lead-created

- Trigger: Server Action `submitLead` (`app/actions.ts`) from the public form on `/`; the n8n call and the
  audit entry run in `after()`, the visitor sees «Дякуємо» at once.
- Request `data`: `leadId`, `fullName`, `email`, `phone`, `company`, `website`, `budget`, `message`,
  `source`, `consentMarketing`, `createdAt` — no IP, user agent, raw form payload or internal notes.
- `idempotency-key`: a UUID created once per submitted lead. Success = any 2xx; no callback.
- Path decision: the previous `.env.example` pointed at the editor's test URL for `lead-created`; per
  the team contract the event name is the production path. Confirm it is published in the client's n8n.

## quote-request

- Trigger: Server Action `requestQuote` (`app/quotes/actions.ts`) from `/quotes/new`; the n8n call runs in
  `after()`, the user is redirected to `/quotes/[id]` at once.
- Request `data`: `quoteId`, `company`, `email`, `description`, `budget` (USD, integer).
- `idempotency-key`: `Quote.idempotencyKey`, created once per quote. Success = exactly `202` with `job_id`,
  stored as `Quote.jobId`.
- Callback: `POST /api/n8n/quote-request`, body event `quote-request.completed`,
  `data.status` = `completed` (`result.documentUrl` — an `https://` link to the PDF) or `failed`
  (`error.code`). Matched by `data.jobId`, or by `data.requestIdempotencyKey` if the callback arrives
  before the 202 is processed.
- Quote statuses: `queued` → `processing` → `ready` | `failed`. `failed` without a callback means n8n was
  not reached or did not answer 202.
- Rate limit (demo): at most 5 valid quote requests per client IP (`x-forwarded-for`, then `x-real-ip`) per
  10 minutes, checked in `requestQuote` before the record is stored or n8n is called; the 6th gets
  `{ status: "rate_limited" }` and keeps the typed values. `lib/rate-limit.ts` keeps the window in process
  memory — fine for one `next start` process; on serverless or several instances move it to a shared store
  (Redis/KV/DB). The IP is used only as the key and is not logged. Keys with no hit inside the window are
  pruned (at most once a minute, each key by its own window) once the map holds more than 1000 of them. `x-forwarded-for` is trusted as the client IP only because
  the app is meant to run behind the hosting proxy that sets it; exposed directly, a client could spoof it —
  then key by the socket address or the proxy's verified header instead.
- Status page: polls every 3 s, says «slower than usual» after 3 min and stops polling after 15 min without a
  callback (the text then says so).
