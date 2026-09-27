# Security, logging, known traps, troubleshooting

## Secrets

- `N8N_WEBHOOK_TOKEN` and `N8N_CALLBACK_SECRET` exist only in `.env.local` / hosting settings. Never in
  git, `NEXT_PUBLIC_*`, Client Components, query strings, logs, error bodies, or chat.
- Do not read or print `.env.local`; ask the human to put values there. Generate new secrets with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- `x-n8n-token` goes only to `https://` or to loopback `http://127.0.0.1|::1|localhost`.
- The callback trusts only the HMAC: no IP checks as a substitute, no "shared token in the URL".
- n8n must not send callbacks to any URL a request asks for: parse `callbackUrl`, require its origin to equal the
  `APP_BASE_URL` origin exactly and its path to start with `/api/n8n/` (IF node in `n8n-side-setup.md`), or use a
  fixed URL — otherwise the webhook becomes an SSRF relay. Production callbacks are `https://`; `http://` only for
  `localhost`, `127.0.0.1`, `::1` in local development.

## Logging

| Log | Never log |
|---|---|
| event, direction, `x-correlation-id` | request/response bodies, envelopes, `FormData` |
| status code, duration, attempt number | name, email, phone, company text, IP |
| body length and sha256 | token, signature, secret, full URL with query |

`console.error(error)` on a failed `fetch` can print the URL and headers — log `error.name` instead.
Error responses from the callback route carry no details (`{"error":"unauthorized"}` is enough).

## Known traps in docs and other skills

- Docs say «Workflow got started», the n8n code returns `Workflow was started` — never parse the text.
- The official n8n skills package says Header Auth rejects with **401**; the n8n code returns **403**
  («Authorization data is wrong!»). 401 is for Basic Auth and JWT.
- The same package says the Crypto node secret cannot come from a credential. For Crypto v2 that is no
  longer true: the Hmac Secret of the Crypto credential is used.
- The Next.js docs' webhook example passes a token in `?token=` on a GET and compares with `!==`. GETs can
  be cached and logged. We use a header, an HMAC and `timingSafeEqual`.
- `req.json()` then `JSON.stringify()` to "get the raw body" changes the bytes — the signature fails.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 404 `The requested webhook "x" is not registered` | test URL, or the workflow is not published | use `/webhook/<path>`; ask the human to publish |
| 403 `Authorization data is wrong!` | `x-n8n-token` missing or different from the Header Auth credential | fix the env value; do not retry |
| 524 after ~100 s | synchronous wait on n8n Cloud | switch to Respond to Webhook 202 + callback |
| 200 instead of 202 in async mode | workflow ended before Respond to Webhook | treat as failure; ask the human to check the workflow |
| callback 401 | wrong secret, re-serialised body, clock skew > 300 s | same secret in both systems; sign and send one string; check clocks |
| callback 200 `duplicate` but no result saved | key claimed, then processing failed without releasing it | release the key on every 4xx/5xx after claiming |
| form waits several seconds | n8n call awaited in the action | move it into `after()` |
