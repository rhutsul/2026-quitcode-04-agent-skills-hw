# n8n side — settings to hand to the human

The client's workflow is the client's property: we do not export or import workflow JSON and do not edit
it ourselves. Give the human these settings as text (example: event `quote-request`, async).

1. **Webhook** — HTTP Method `POST`, Path = event name (`quote-request`).
   Authentication **Header Auth**, credential Name `x-n8n-token`, Value = `N8N_WEBHOOK_TOKEN`. A missing or
   wrong header is rejected with **403** «Authorization data is wrong!».
   Respond — `Using 'Respond to Webhook' Node` (fast fire-and-forget events: `Immediately`).
   If the app host has fixed IPs — Options → IP(s) Allowlist (behind a reverse proxy — `N8N_PROXY_HOPS`).
   In later nodes the body is `$json.body`, headers are `$json.headers` (lower-case names).
2. **Remove Duplicates** — «Remove Items Processed in Previous Executions», value
   `{{ $json.headers['idempotency-key'] }}`.
3. **Respond to Webhook** — Respond With JSON, Response Code `202`, body `{"job_id": "{{ $execution.id }}"}`.
4. … the actual work (PDF generation etc.) …
5. **Edit Fields** — field `ts` = `{{ Math.floor($now.toSeconds()) }}`, field `body` =
   `{{ JSON.stringify({ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, status: 'completed', correlationId: $('Webhook').item.json.headers['x-correlation-id'], requestIdempotencyKey: $('Webhook').item.json.headers['idempotency-key'], result: { documentUrl: … }, completedAt: $now.toISO() } }) }}`.
   The body is signed and sent as **one and the same string**.
5a. **IF** (before signing) — continue only if
   `{{ String($('Webhook').item.json.body?.callbackUrl ?? '') === 'https://portal.client.example/api/n8n/quote-request' }}`
   is true. The workflow serves one event, so its callback URL is known in advance and must match **exactly**.
   Otherwise stop. Write the literal exactly as the app sends it (`new URL('/api/n8n/<event>', APP_BASE_URL)`):
   origin only (any path and trailing `/` of `APP_BASE_URL` are dropped), host in lower case, no default port
   (`:443`, `:80`), then `/api/n8n/<event>`. Safest is to copy `callbackUrl` from an execution the app itself
   started (a test submission of the form), not from a request someone else sent. A literal that
   differs by one character stops every callback, and the record stays `processing`. Do not compare a prefix
   (`startsWith`): `…/api/n8n/../../admin` or `…/api/n8n/%2e%2e/…` would pass it and still reach another path of
   the app with a valid signature. `body?.` and `String(… ?? '')` keep a request without `callbackUrl` from
   failing the expression. In production the URL is `https://`; plain `http://` only for local development on
   `localhost`, `127.0.0.1`, `[::1]` or `host.docker.internal` (n8n in Docker, app on the host — see step 7;
   a production build of the app refuses `http://host.docker.internal`, so run `next dev` for that setup).
   The URL comes from the request body: without this check anyone holding `x-n8n-token` could make n8n send
   signed requests to an address of their choice (SSRF). Simpler alternative: put the fixed callback URL into
   the HTTP Request node and ignore `callbackUrl`.
6. **Crypto** (v2) — Action `Hmac`, Type `SHA256`, Encoding `HEX`, value `{{ $json.ts + '.' + $json.body }}`,
   credential **Crypto** with Hmac Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request** — `POST` to `{{ $('Webhook').item.json.body.callbackUrl }}`. Headers:
   `x-n8n-timestamp` = `ts`, `x-n8n-signature` = `sha256=` + Crypto result, `idempotency-key` =
   `{{ $execution.id }}:quote-request.completed` (same `jobId` and `event` as in the body),
   `x-correlation-id` from the incoming headers. Body Content Type **Raw**, Content Type
   `application/json`, Body = field `body`. Options → Timeout `10000`. Settings → Retry On Fail,
   Max Tries `3`, Wait Between Tries `1000` (team setting for **callbacks** n8n → app). This is not the
   app's own retry policy (Next.js → n8n: 1 s, then 3 s, never on 4xx — `contract.md`): Retry On Fail waits a
   fixed interval and also repeats on 4xx; that is harmless here because the route answers 4xx only for bad or
   unknown callbacks and deduplicates by `idempotency-key`.
   If n8n runs in Docker and the app on the host — `host.docker.internal`, not `localhost`, and run the app
   with `next dev`: a production build accepts plain `http` only to loopback.
8. **Save** and **Publish**. Publish again after every change.

Why Raw and not «JSON → Using Fields Below»: n8n does not guarantee that serialising fields yields exactly
the bytes that were signed.

Fire-and-forget events (`lead-created`): steps 1–2 with Respond `Immediately`; no callback, no Crypto.

Out of scope for this skill: building workflows in the editor, n8n Code-node code, workflow JSON,
queues and background workers.
