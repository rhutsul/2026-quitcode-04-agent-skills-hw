#!/usr/bin/env node
// Sends a matrix of n8n-style callbacks to a running callback route and checks each status code.
// Node built-ins only. Never prints the secret, signatures or bodies.

import { createHmac, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const CASES = [
  { name: "valid", expect: [202], about: "correctly signed callback" },
  { name: "duplicate", expect: [200], about: "the same callback again (same idempotency-key) → {duplicate:true}" },
  { name: "bad-signature", expect: [401], about: "signature made with another secret" },
  { name: "missing-signature", expect: [401], about: "no x-n8n-signature header" },
  { name: "stale-timestamp", expect: [401], about: "x-n8n-timestamp 310 s in the past" },
  { name: "future-timestamp", expect: [401], about: "x-n8n-timestamp 310 s in the future" },
  { name: "reformatted-body", expect: [401], about: "body pretty-printed after signing (bytes differ)" },
  { name: "wrong-content-type", expect: [415], about: "content-type text/plain" },
  { name: "unknown-event", expect: [404], about: "last path segment replaced with an unknown event" },
  { name: "key-mismatch", expect: [400], about: "idempotency-key does not match data.jobId:event of the signed body" },
  { name: "oversized", expect: [413], about: "signed body larger than 64 KB" },
];

const USAGE = `send-signed-callback — callback matrix against a running route (integrating-n8n-webhooks skill)

Usage:
  node --env-file=.env.local send-signed-callback.mjs --url <callback-url> [options]

Options:
  --url <url>        Callback endpoint, e.g. http://127.0.0.1:3000/api/n8n/quote-request (required).
  --event <name>     "event" in the body (default: <last path segment>.completed).
  --job-id <id>      data.jobId for "valid"/"duplicate" — use the job_id stored for a real record
                     if the route looks records up (default: a random UUID).
  --only <a,b,…>     Run only these cases (names below; unknown names are an error).
  --timeout <ms>     Per-request timeout (default 10000).
  --list             Print the cases and exit.
  -h, --help         Show this help.

Environment:
  N8N_CALLBACK_SECRET   HMAC secret shared with the app (required; never pass it as a flag).

Cases (expected status):
${CASES.map((c) => `  ${c.name.padEnd(20)} ${String(c.expect.join("/")).padEnd(4)} ${c.about}`).join("\n")}

Exit code: 0 — every case got its expected status; 1 — a mismatch or a request failed; 2 — usage error.
`;

function usageError(message) {
  console.error(`send-signed-callback: ${message}\n\n${USAGE}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      url: { type: "string" },
      event: { type: "string" },
      "job-id": { type: "string" },
      only: { type: "string" },
      timeout: { type: "string" },
      list: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  }).values;
} catch (error) {
  usageError(error.message);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (args.list) {
  for (const c of CASES) console.log(`${c.name.padEnd(20)} ${c.expect.join("/")}  ${c.about}`);
  process.exit(0);
}

let url;
try {
  url = new URL(args.url ?? "");
  if (!/^https?:$/.test(url.protocol)) throw new Error();
} catch {
  usageError("--url must be an http(s) URL of the callback route");
}
const secret = process.env.N8N_CALLBACK_SECRET;
if (!secret) usageError("N8N_CALLBACK_SECRET is not set (run with node --env-file=.env.local …)");
const timeoutMs = args.timeout === undefined ? 10_000 : Number(args.timeout);
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) usageError("--timeout must be a positive integer (ms)");

let selected = CASES;
if (args.only !== undefined) {
  const names = args.only.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !CASES.some((c) => c.name === n));
  if (unknown.length) usageError(`unknown case(s) in --only: ${unknown.join(", ")}`);
  if (!names.length) usageError("--only selected no cases");
  selected = CASES.filter((c) => names.includes(c.name));
}

const pathEvent = url.pathname.split("/").filter(Boolean).pop() ?? "event";
const event = args.event ?? `${pathEvent}.completed`;
const jobId = args["job-id"] ?? randomUUID();
const correlationId = randomUUID();

const now = () => Math.floor(Date.now() / 1000);
// 10 s past the ±300 s window: a second ticking between signing and the server check cannot bring it back inside.
const WINDOW_MARGIN_S = 310;
const sign = (ts, raw, key = secret) => `sha256=${createHmac("sha256", key).update(`${ts}.${raw}`).digest("hex")}`;

function envelope(id, extra = {}) {
  return {
    version: 1,
    event,
    data: {
      jobId: id,
      status: "completed",
      correlationId,
      requestIdempotencyKey: randomUUID(),
      result: { documentUrl: `https://files.example.test/n8n/${id}.pdf` },
      completedAt: new Date().toISOString(),
      ...extra,
    },
  };
}

/** Build the request for a case: { target, headers, body }. */
function build(name) {
  const ts = String(now());
  const validBody = JSON.stringify(envelope(jobId));
  const headers = (raw, t = ts, key = `${jobId}:${event}`) => ({
    "content-type": "application/json",
    "x-n8n-timestamp": t,
    "x-n8n-signature": sign(t, raw),
    "idempotency-key": key,
    "x-correlation-id": correlationId,
  });
  switch (name) {
    case "valid":
    case "duplicate":
      return { target: url, headers: headers(validBody), body: validBody };
    case "bad-signature": {
      const h = headers(validBody);
      h["x-n8n-signature"] = sign(ts, validBody, `${secret}-wrong`);
      return { target: url, headers: h, body: validBody };
    }
    case "missing-signature": {
      const h = headers(validBody);
      delete h["x-n8n-signature"];
      return { target: url, headers: h, body: validBody };
    }
    case "stale-timestamp": {
      const t = String(now() - WINDOW_MARGIN_S);
      return { target: url, headers: headers(validBody, t), body: validBody };
    }
    case "future-timestamp": {
      const t = String(now() + WINDOW_MARGIN_S);
      return { target: url, headers: headers(validBody, t), body: validBody };
    }
    case "reformatted-body": {
      const h = headers(validBody);
      return { target: url, headers: h, body: JSON.stringify(JSON.parse(validBody), null, 2) };
    }
    case "wrong-content-type": {
      const h = headers(validBody);
      h["content-type"] = "text/plain";
      return { target: url, headers: h, body: validBody };
    }
    case "unknown-event": {
      const other = new URL(url);
      other.pathname = other.pathname.replace(/[^/]+\/?$/, "no-such-event");
      return { target: other, headers: headers(validBody), body: validBody };
    }
    case "key-mismatch": {
      const id = randomUUID();
      const raw = JSON.stringify(envelope(id));
      return { target: url, headers: headers(raw, ts, `${randomUUID()}:${event}`), body: raw };
    }
    case "oversized": {
      const id = randomUUID();
      const raw = JSON.stringify(envelope(id, { padding: "x".repeat(65 * 1024) }));
      return { target: url, headers: headers(raw, ts, `${id}:${event}`), body: raw };
    }
    default:
      throw new Error(`no builder for ${name}`);
  }
}

async function send(name) {
  const { target, headers, body } = build(name);
  const started = Date.now();
  const response = await fetch(target, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
  await response.arrayBuffer();
  return { status: response.status, ms: Date.now() - started };
}

console.log(`send-signed-callback · ${url.origin}${url.pathname} · event ${event} · jobId ${jobId}\n`);
console.log(`${"case".padEnd(20)} ${"expected".padEnd(9)} ${"got".padEnd(5)} result`);

let failures = 0;
let validSent = false;
for (const c of selected) {
  try {
    if (c.name === "duplicate" && !validSent) {
      await send("valid"); // prime: the first delivery claims the key
      validSent = true;
    }
    const { status, ms } = await send(c.name);
    if (c.name === "valid") validSent = true;
    const ok = c.expect.includes(status);
    if (!ok) failures++;
    console.log(`${c.name.padEnd(20)} ${c.expect.join("/").padEnd(9)} ${String(status).padEnd(5)} ${ok ? "PASS" : "FAIL"}  (${ms} ms)`);
  } catch (error) {
    failures++;
    console.log(`${c.name.padEnd(20)} ${c.expect.join("/").padEnd(9)} ${"-".padEnd(5)} FAIL  (${error.name})`);
  }
}
console.log(`\n${selected.length - failures} PASS, ${failures} FAIL`);
// exitCode, not process.exit(): exiting while fetch sockets close crashes libuv on Windows.
process.exitCode = failures ? 1 : 0;
