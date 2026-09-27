#!/usr/bin/env node
// Static check of a Next.js project against the team's n8n contract (see ../SKILL.md).
// Node built-ins only. Heuristic by design: it reads source text, it does not run the app.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `check-contract — static check of the n8n contract (integrating-n8n-webhooks skill)

Usage:
  node check-contract.mjs [--root <dir>] [--changed-since <git-ref>]
  node check-contract.mjs --help

Options:
  --root <dir>             Project to check (default: current directory).
  --changed-since <ref>    Report only what changed after <ref>: files changed since <ref> (working
                           tree vs <ref>) plus untracked files; in files that existed at <ref>, only
                           the added/changed lines. Needs <root> to be a git repository.
  -h, --help               Show this help.

Checks (each prints PASS or FAIL; FAIL lists file:line):
  C1  no /webhook-test/ URL in code or .env.example
  C2  no NEXT_PUBLIC_ n8n variables; no N8N_* or lib/n8n import in a "use client" file
  C3  n8n is called only from lib/n8n/*, and every lib/n8n/* module starts with import "server-only"
  C4  callback route reads the raw body (req.text() or a streaming reader) and parses JSON only after
      verifying the signature
  C5  callback signature: HMAC-SHA256, length check + timingSafeEqual, never === / !==
  C6  every fetch to n8n has signal: AbortSignal.timeout(...)
  C7  no bodies, personal data, secrets or whole error objects in console.* of n8n code
  C8  no runtime = "edge"
  C9  .env.example has the contract keys (change-me-… secrets, local /webhook URL); .env.local is
      git-ignored; every N8N_* / APP_BASE_URL used in code is listed in .env.example
  C10 every fetch to n8n sends x-n8n-token and idempotency-key; no secrets in the URL
  C11 callback route answers 415 (content-type), 413 (64 KB), 401 (x-n8n-timestamp ±300 s) and
      dedupes idempotency-key

What is scanned: *.ts *.tsx *.js *.jsx *.mjs *.cjs under <root>, except node_modules, .next, .git,
.claude, .agents, .cursor, .codex, tools, docs, materials, public, coverage, dist, build, out, and *.d.ts;
plus .env.example and .gitignore. Checks with nothing to look at (e.g. no callback route yet) PASS and
say so.

Exit code: 0 — no FAIL; 1 — at least one FAIL; 2 — usage error.

Examples:
  node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs
  node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs --root ../leaddesk-main
  node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs --root ../copy --changed-since base
`;

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

function usageError(message) {
  console.error(`check-contract: ${message}\n\n${USAGE}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      root: { type: "string" },
      "changed-since": { type: "string" },
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
if (args["changed-since"] !== undefined && !args["changed-since"].trim()) {
  usageError("--changed-since needs a git ref (e.g. base, main, a SHA); an empty value would silently check everything");
}

const ROOT = resolve(args.root ?? ".");
if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) usageError(`--root is not a directory: ${ROOT}`);

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".claude", ".agents", ".cursor", ".codex", "tools", "docs",
  "materials", "public", "coverage", "dist", "build", "out", ".vercel", ".turbo",
]);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...walk(join(dir, entry.name)));
    } else if (CODE_EXT.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

const rel = (abs) => relative(ROOT, abs).split(sep).join("/");

// ---------------------------------------------------------------------------------------------
// Source helpers: strip comments (keep strings and line numbers), find calls, resolve definitions
// ---------------------------------------------------------------------------------------------

/** Replace comments with spaces; keep strings, template literals and newlines where they were. */
function stripComments(src) {
  const out = src.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let i = 0;
  const templateDepth = []; // brace depth at which each open template's ${ } started
  let braceDepth = 0;
  let lastSignificant = "";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipQuoted(src, i, c);
      lastSignificant = c;
      continue;
    }
    if (c === "`") {
      i = skipTemplateChunk(src, i + 1, templateDepth, () => braceDepth);
      lastSignificant = "`";
      continue;
    }
    if (c === "/" && (lastSignificant === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSignificant) || /\breturn\s*$/.test(src.slice(Math.max(0, i - 8), i)))) {
      i = skipRegex(src, i);
      lastSignificant = "/";
      continue;
    }
    if (c === "{") braceDepth++;
    if (c === "}") {
      if (templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth) {
        templateDepth.pop();
        i = skipTemplateChunk(src, i + 1, templateDepth, () => braceDepth);
        lastSignificant = "`";
        continue;
      }
      braceDepth--;
    }
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return out.join("");
}

function skipQuoted(src, i, quote) {
  let k = i + 1;
  while (k < src.length && src[k] !== quote && src[k] !== "\n") k += src[k] === "\\" ? 2 : 1;
  return k + 1;
}

/** From inside a template literal: skip to its end, or to "${" (then push and return after it). */
function skipTemplateChunk(src, k, templateDepth, depth) {
  while (k < src.length) {
    if (src[k] === "\\") {
      k += 2;
      continue;
    }
    if (src[k] === "`") return k + 1;
    if (src[k] === "$" && src[k + 1] === "{") {
      templateDepth.push(depth());
      return k + 2;
    }
    k++;
  }
  return k;
}

function skipRegex(src, i) {
  let k = i + 1;
  let inClass = false;
  while (k < src.length && src[k] !== "\n") {
    if (src[k] === "\\") {
      k += 2;
      continue;
    }
    if (src[k] === "[") inClass = true;
    else if (src[k] === "]") inClass = false;
    else if (src[k] === "/" && !inClass) {
      k++;
      while (/[a-z]/i.test(src[k] ?? "")) k++;
      return k;
    }
    k++;
  }
  return k;
}

function lineStarts(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === "\n") starts.push(k + 1);
  return starts;
}
function lineAt(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Index just after the bracket that closes the one at `open` (string/template aware). */
function matchBracket(text, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const stack = [pairs[text[open]]];
  let k = open + 1;
  while (k < text.length && stack.length) {
    const c = text[k];
    if (c === '"' || c === "'") {
      k = skipQuoted(text, k, c);
      continue;
    }
    if (c === "`") {
      k = skipTemplateLiteral(text, k);
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) stack.pop();
    k++;
  }
  return k;
}

function skipTemplateLiteral(text, k) {
  k++;
  while (k < text.length) {
    if (text[k] === "\\") k += 2;
    else if (text[k] === "`") return k + 1;
    else if (text[k] === "$" && text[k + 1] === "{") k = matchBracket(text, k + 1);
    else k++;
  }
  return k;
}

/** Split an argument list (without the outer parens) at top-level commas. */
function splitArgs(inner) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < inner.length; k++) {
    const c = inner[k];
    if (c === '"' || c === "'") {
      k = skipQuoted(inner, k, c) - 1;
      continue;
    }
    if (c === "`") {
      k = skipTemplateLiteral(inner, k) - 1;
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      parts.push(inner.slice(start, k).trim());
      start = k + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

/** Calls of `name(` → { index, line, args[], text } (text = whole call). */
function findCalls(file, namePattern) {
  const calls = [];
  const re = new RegExp(`(^|[^\\w$.])(${namePattern})\\s*\\(`, "g");
  let m;
  while ((m = re.exec(file.code))) {
    const nameAt = m.index + m[1].length;
    const open = file.code.indexOf("(", nameAt + m[2].length);
    const close = matchBracket(file.code, open);
    const text = file.code.slice(nameAt, close);
    calls.push({ index: nameAt, line: lineAt(file.starts, nameAt), args: splitArgs(file.code.slice(open + 1, close - 1)), text });
  }
  return calls;
}

/** Source text of `const|let|var id = …` or `function id(…) {…}` in the same file ('' if none). */
function definitionOf(file, id) {
  if (!/^[A-Za-z_$][\w$]*$/.test(id)) return "";
  const code = file.code;
  const fn = new RegExp(`\\bfunction\\s+${id}\\s*\\(`).exec(code);
  if (fn) {
    const open = code.indexOf("{", matchBracket(code, code.indexOf("(", fn.index)));
    return open === -1 ? "" : code.slice(fn.index, matchBracket(code, open));
  }
  const v = new RegExp(`\\b(?:const|let|var)\\s+${id}\\b[^=;]*=`).exec(code);
  if (!v) return "";
  let k = v.index + v[0].length;
  let depth = 0;
  for (; k < code.length; k++) {
    const c = code[k];
    if (c === '"' || c === "'") {
      k = skipQuoted(code, k, c) - 1;
      continue;
    }
    if (c === "`") {
      k = skipTemplateLiteral(code, k) - 1;
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (depth < 0 || (depth === 0 && (c === ";" || c === "\n") && code.slice(v.index + v[0].length, k).trim())) break;
  }
  return code.slice(v.index, k);
}

const KEYWORDS = new Set("const let var function return await async new true false null undefined typeof in of if else".split(" "));

/** The text of an expression plus the definitions of the identifiers it uses (two levels deep). */
function expand(file, text, depth = 2) {
  let all = text;
  let frontier = text;
  const seen = new Set();
  for (let level = 0; level < depth; level++) {
    let added = "";
    for (const id of new Set(frontier.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
      if (seen.has(id) || KEYWORDS.has(id)) continue;
      seen.add(id);
      const def = definitionOf(file, id);
      if (def) added += `\n${def}`;
    }
    if (!added) break;
    all += added;
    frontier = added;
  }
  return all;
}

/** Only the code parts of an expression: string contents dropped, template ${…} kept. */
function codeOnly(text) {
  let out = "";
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (c === '"' || c === "'") {
      k = skipQuoted(text, k, c) - 1;
      out += '""';
      continue;
    }
    if (c === "`") {
      const end = skipTemplateLiteral(text, k);
      const inner = text.slice(k + 1, end - 1);
      for (const m of inner.matchAll(/\$\{/g)) {
        const open = m.index + 1;
        out += ` ${inner.slice(open + 1, matchBracket(inner, open) - 1)} `;
      }
      k = end - 1;
      continue;
    }
    out += c;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Load project
// ---------------------------------------------------------------------------------------------

const files = walk(ROOT).map((abs) => {
  const src = readFileSync(abs, "utf8");
  const code = stripComments(src);
  return { abs, path: rel(abs), src, code, starts: lineStarts(src) };
});
const byPath = new Map(files.map((f) => [f.path, f]));

const isLibN8n = (f) => /(^|\/)lib\/n8n\//.test(f.path);
const isClientFile = (f) => /^\s*(["'])use client\1/.test(f.code);
const mentionsN8n = (f) => isLibN8n(f) || /N8N_|n8n|webhook/i.test(f.code);

const envExamplePath = join(ROOT, ".env.example");
const envExample = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf8") : null;
const gitignorePath = join(ROOT, ".gitignore");
const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";

/** fetch() calls that go to n8n. */
function n8nFetches(file) {
  if (!mentionsN8n(file)) return [];
  return findCalls(file, "fetch").filter((call) => {
    const target = call.args[0] ?? "";
    if (isLibN8n(file)) return true;
    const literal = /^["'`]/.test(target);
    const targetText = literal ? target : expand(file, target, 1);
    // A literal like "/api/leads" is the app's own API, not n8n.
    return literal ? /N8N_|n8n|webhook/i.test(target) : /N8N_|n8n|webhook/i.test(targetText) || !/^["'`]\//.test(target);
  });
}

// Callback routes: app/**/route.* that export POST and deal with n8n / callbacks / signatures.
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(fromFile.abs), spec);
  else return null;
  for (const candidate of [base, ...[".ts", ".tsx", ".js", ".mjs"].map((e) => base + e), join(base, "index.ts"), join(base, "index.js")]) {
    const f = byPath.get(rel(candidate));
    if (f) return f;
  }
  return null;
}

function callbackUnits() {
  const units = [];
  for (const f of files) {
    if (!/(^|\/)app\/(.+\/)?route\.(ts|js|mjs)$/.test(f.path)) continue;
    if (!/export\s+(async\s+function\s+POST|function\s+POST|const\s+POST)\b/.test(f.code)) continue;
    if (!/n8n|N8N_|callback|signature|webhook/i.test(f.code)) continue;
    // Everything the route imports directly (verification often lives in a helper with any name),
    // plus n8n-looking modules those import in turn.
    const members = [f];
    const queue = [f];
    while (queue.length && members.length < 12) {
      const cur = queue.shift();
      for (const m of cur.code.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
        const dep = resolveImport(cur, m[1]);
        if (dep && !members.includes(dep) && (cur === f || isLibN8n(dep) || /n8n|signature|callback|idempot/i.test(dep.path))) {
          members.push(dep);
          queue.push(dep);
        }
      }
    }
    const param = /export\s+(?:async\s+)?function\s+POST\s*\(\s*([A-Za-z_$][\w$]*)/.exec(f.code)?.[1]
      ?? /export\s+const\s+POST\s*=\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)/.exec(f.code)?.[1]
      ?? "req";
    units.push({ route: f, members, param, text: members.map((m) => m.code).join("\n") });
  }
  return units;
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

const results = [];
function check(id, title, run) {
  const findings = [];
  const notes = [];
  run({
    // also: other files whose change should surface this finding under --changed-since (a callback route's helpers).
    fail: (path, line, message, fileLevel = false, also = []) => findings.push({ path, line, message, fileLevel, also }),
    note: (text) => notes.push(text),
  });
  results.push({ id, title, findings, notes });
}
const lineOf = (f, index) => lineAt(f.starts, index);

check("C1", "no /webhook-test/ URL in code or .env.example", ({ fail }) => {
  for (const f of files) for (const m of f.code.matchAll(/webhook-test/g)) fail(f.path, lineOf(f, m.index), "test webhook URL — use the production /webhook/<path>");
  envExample?.split(/\r?\n/).forEach((l, k) => {
    if (!l.trim().startsWith("#") && /webhook-test/.test(l)) fail(".env.example", k + 1, "test webhook URL in .env.example");
  });
});

check("C2", 'no NEXT_PUBLIC_ n8n variables; no N8N_* or lib/n8n import in a "use client" file', ({ fail }) => {
  const publicRe = /NEXT_PUBLIC_\w*(N8N|WEBHOOK|CALLBACK)\w*/g;
  for (const f of files) {
    for (const m of f.code.matchAll(publicRe)) fail(f.path, lineOf(f, m.index), `${m[0]} would be inlined into the client bundle`);
    if (!isClientFile(f)) continue;
    for (const m of f.code.matchAll(/\bN8N_\w+/g)) fail(f.path, lineOf(f, m.index), `${m[0]} in a Client Component`);
    for (const m of f.code.matchAll(/from\s+["'][^"']*lib\/n8n[^"']*["']/g)) fail(f.path, lineOf(f, m.index), "Client Component imports lib/n8n");
  }
  envExample?.split(/\r?\n/).forEach((l, k) => {
    if (!l.trim().startsWith("#") && /NEXT_PUBLIC_\w*(N8N|WEBHOOK|CALLBACK)/.test(l)) fail(".env.example", k + 1, "NEXT_PUBLIC_ n8n variable");
  });
});

check("C3", 'n8n is called only from lib/n8n/*, which starts with import "server-only"', ({ fail, note }) => {
  let any = false;
  for (const f of files) {
    if (isLibN8n(f)) {
      any = true;
      if (!/^\s*import\s+["']server-only["']/.test(f.code)) fail(f.path, 1, 'first statement must be import "server-only"', true);
    }
    if (isLibN8n(f)) continue;
    for (const call of n8nFetches(f)) {
      any = true;
      fail(f.path, call.line, "fetch to n8n outside lib/n8n/* — use the n8n client module");
    }
  }
  if (!any) note("no n8n calls in scope");
});

const units = callbackUnits();

check("C4", "callback route reads the raw body and parses JSON only after verifying the signature", ({ fail, note }) => {
  if (!units.length) return note("no callback route in scope");
  for (const u of units) {
    const r = u.route;
    for (const f of u.members) {
      for (const m of f.code.matchAll(new RegExp(`\\b${u.param}\\.(json|formData)\\(\\s*\\)`, "g"))) {
        fail(f.path, lineOf(f, m.index), `${u.param}.${m[1]}() — read the raw text first; re-serialising breaks the signature`);
      }
    }
    const helpers = u.members.map((m) => m.path);
    // Raw body: req.text()/arrayBuffer() in the route, or in a helper the route passes req to
    // (req.text() / arrayBuffer() / a reader that streams req.body).
    // Helper: a function the route calls with req (not the POST(req) signature itself) that is defined in one
    // of the route's modules and reads the body there.
    const calledWithReq = [...r.code.matchAll(new RegExp(`(?<!function\\s+)\\b([A-Za-z_$][\\w$]*)\\(\\s*${u.param}\\b`, "g"))]
      .map((m) => m[1])
      .filter((name) => !/^(POST|GET|PUT|PATCH|DELETE)$/.test(name));
    const helperReads = calledWithReq.some((name) =>
      u.members.some((m) => m !== r && /\.(text|arrayBuffer|getReader)\(\s*\)/.test(definitionOf(m, name))),
    );
    const readsRaw =
      new RegExp(`\\b${u.param}\\.(text|arrayBuffer)\\(\\s*\\)`).test(r.code) ||
      new RegExp(`\\b${u.param}\\.body\\s*[!?]?\\.\\s*getReader\\(\\s*\\)`).test(r.code) ||
      helperReads;
    if (!readsRaw) fail(r.path, 1, `raw body is never read (${u.param}.text() or a streaming reader)`, true, helpers);
    const verifyRe = /\b(timingSafeEqual|verify\w*|\w*[Ss]ignature\w*|\w*[Hh]mac\w*)\s*\(/g;
    const verifyAt = [...r.code.matchAll(verifyRe)].find((m) => !/^(createHmac|function)$/.test(m[1]));
    const unitVerifies = /timingSafeEqual|createHmac/.test(u.text);
    for (const f of u.members) {
      for (const m of f.code.matchAll(/\bJSON\.parse\s*\(/g)) {
        const line = lineOf(f, m.index);
        if (!unitVerifies) fail(f.path, line, "JSON.parse in a callback that never verifies an HMAC signature");
        else if (f === r && (!verifyAt || m.index < verifyAt.index)) fail(f.path, line, "JSON.parse before the signature check");
        else if (f !== r) {
          const safe = /timingSafeEqual/.exec(f.code);
          if (safe && m.index < safe.index) fail(f.path, line, "JSON.parse before timingSafeEqual");
        }
      }
    }
  }
});

check("C5", "callback signature: HMAC-SHA256, length check + timingSafeEqual, never === / !==", ({ fail, note }) => {
  if (!units.length) return note("no callback route in scope");
  for (const u of units) {
    const helpers = u.members.map((m) => m.path);
    if (!/createHmac\s*\(\s*["']sha256["']|subtle\.(sign|verify)/.test(u.text)) fail(u.route.path, 1, "no HMAC-SHA256 over the raw body", true, helpers);
    if (!/timingSafeEqual\s*\(/.test(u.text)) fail(u.route.path, 1, "signature not compared with crypto.timingSafeEqual", true, helpers);
    // A length check, or hashing both sides first (equal-length digests), keeps timingSafeEqual from throwing.
    else if (!/(\.length|byteLength)\s*(!==|===|!=|==)|(!==|===|!=|==)\s*[\w$.]+\.(length|byteLength)\b|createHash\s*\(/.test(u.text)) {
      fail(u.route.path, 1, "no length check before timingSafeEqual (it throws on different lengths)", true, helpers);
    }
    // Only files that deal with the signature; whole words, so "assignedTo" is not a "sig".
    const signatureWord = /\b(sig|sigs|signature\w*|\w+Signature\w*|signed\w*|expected\w*|computed\w*|digest\w*|\w+Digest\w*|hmac\w*|\w+Hmac\w*|mac)\b/i;
    for (const f of u.members.filter((m) => /signature|hmac|x-n8n/i.test(m.code))) {
      for (const m of f.code.matchAll(/[^\n;]*?(!==|===|!=|==)[^\n;]*/g)) {
        const expr = codeOnly(m[0]);
        // A key comparison (expectedKey, idempotency key) is not a signature comparison.
        const aboutKey = /\b\w*key\w*\b|idempot/i.test(expr) && !/sig|hmac|digest/i.test(expr);
        if (signatureWord.test(expr) && !aboutKey && !/\.(length|byteLength)\b|typeof\s/.test(expr)) {
          fail(f.path, lineOf(f, m.index), `signature compared with ${m[1]} — use timingSafeEqual`);
        }
      }
    }
  }
});

check("C6", "every fetch to n8n has signal: AbortSignal.timeout(...)", ({ fail, note }) => {
  let count = 0;
  for (const f of files) {
    for (const call of n8nFetches(f)) {
      count++;
      const init = expand(f, call.args.slice(1).join(","));
      if (!/\bsignal\s*[:,}]|\bsignal\b\s*$/m.test(init) && !/AbortSignal\.timeout/.test(init)) {
        fail(f.path, call.line, "fetch to n8n without a timeout (signal: AbortSignal.timeout(10_000))");
      }
    }
  }
  if (!count) note("no fetch to n8n in scope");
});

check("C7", "no bodies, personal data, secrets or whole error objects in console.* of n8n code", ({ fail }) => {
  const scoped = new Set(files.filter(mentionsN8n));
  for (const u of units) u.members.forEach((m) => scoped.add(m));
  const sensitive = /\b(body|raw|rawBody|payload|envelope|headers|formData|email|phone|token|secret|signature|password|ipAddress|userAgent)\b|JSON\.stringify/i;
  const wholeObject = /^(lead|data|quote|req|request|res|response|body|input|values|record|error|err|e)$/;
  for (const f of scoped) {
    for (const call of findCalls(f, "console\\.(?:log|info|warn|error|debug|trace)")) {
      const bad = call.args.find((a) => sensitive.test(codeOnly(a)) || wholeObject.test(a.trim()));
      if (bad !== undefined) fail(f.path, call.line, `console.* logs ${bad.length > 40 ? `${bad.slice(0, 40)}…` : bad} — log ids, status, duration only`);
    }
  }
});

check("C8", 'no runtime = "edge"', ({ fail }) => {
  for (const f of files) for (const m of f.code.matchAll(/export\s+const\s+runtime\s*=\s*["'`]edge/g)) fail(f.path, lineOf(f, m.index), "edge runtime — the contract needs node:crypto");
});

check("C9", ".env.example has the contract keys; .env.local is git-ignored; used N8N_* keys are listed", ({ fail }) => {
  const required = ["N8N_WEBHOOK_BASE_URL", "N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET", "APP_BASE_URL"];
  const listed = new Map();
  if (envExample === null) {
    fail(".env.example", 1, "missing .env.example", true);
  } else {
    envExample.split(/\r?\n/).forEach((l, k) => {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
      if (m) listed.set(m[1], { line: k + 1, value: m[2].trim().replace(/^["']|["']$/g, "") });
    });
    for (const key of required) if (!listed.has(key)) fail(".env.example", 1, `missing ${key}`, true);
    for (const [key, { line, value }] of listed) {
      if (/^N8N_/.test(key) && !required.includes(key)) fail(".env.example", line, `${key} is not a contract key (${required.slice(0, 3).join(", ")})`);
      if (/TOKEN|SECRET/.test(key) && !/^change-me/.test(value)) fail(".env.example", line, `${key} must be a change-me-… placeholder`);
      if (key === "N8N_WEBHOOK_BASE_URL" && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/webhook\/?$/.test(value)) fail(".env.example", line, "N8N_WEBHOOK_BASE_URL must be a local URL ending with /webhook");
      if (key === "APP_BASE_URL" && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(value)) fail(".env.example", line, "APP_BASE_URL must be a local URL");
    }
  }
  const ignored = gitignore.split(/\r?\n/).some((l) => /^\s*\/?\.env(\*|\.local|\*\.local|\.\*)?\s*$/.test(l) && l.trim() !== ".env");
  if (!ignored) fail(".gitignore", 1, ".env.local is not git-ignored (.env* or .env.local)", true);
  for (const f of files) {
    for (const m of f.code.matchAll(/process\.env\.((?:N8N_\w+)|APP_BASE_URL)\b|process\.env\[["']((?:N8N_\w+)|APP_BASE_URL)["']\]/g)) {
      const key = m[1] ?? m[2];
      if (envExample !== null && !listed.has(key)) fail(f.path, lineOf(f, m.index), `${key} is used but not listed in .env.example`);
    }
  }
});

check("C10", "every fetch to n8n sends x-n8n-token and idempotency-key; no secrets in the URL", ({ fail, note }) => {
  let count = 0;
  for (const f of files) {
    for (const call of n8nFetches(f)) {
      count++;
      const init = expand(f, call.args.slice(1).join(","));
      const missing = ["x-n8n-token", "idempotency-key"].filter((h) => !new RegExp(`["'\`]${h}["'\`]`, "i").test(init));
      if (missing.length) fail(f.path, call.line, `fetch to n8n without ${missing.join(" and ")}`);
      const url = expand(f, call.args[0] ?? "", 1);
      if (/[?&](token|secret|key|signature|auth)=|N8N_WEBHOOK_TOKEN|N8N_CALLBACK_SECRET/i.test(url)) fail(f.path, call.line, "secret in the webhook URL — send it in a header");
    }
  }
  if (!count) note("no fetch to n8n in scope");
});

check("C11", "callback route: 415 content-type, 413 64 KB, 401 x-n8n-timestamp ±300 s, idempotency-key", ({ fail, note }) => {
  if (!units.length) return note("no callback route in scope");
  for (const u of units) {
    const t = u.text;
    const at = u.route.path;
    const helpers = u.members.map((m) => m.path);
    if (!/content-type/i.test(t) || !/\b415\b/.test(t)) fail(at, 1, "no 415 for a non-JSON content-type", true, helpers);
    if (!/\b413\b/.test(t) || !/64\s*\*\s*1024|\b65_?536\b/.test(t)) fail(at, 1, "no 413 for bodies over 64 KB", true, helpers);
    if (!/x-n8n-timestamp/i.test(t)) fail(at, 1, "x-n8n-timestamp is not checked", true, helpers);
    else if (!/\b300\b|5\s*\*\s*60\b/.test(t)) fail(at, 1, "no ±300 s window for x-n8n-timestamp", true, helpers);
    if (!/idempotency-key/i.test(t)) fail(at, 1, "idempotency-key is not used to drop repeated callbacks", true, helpers);
    // The header is not covered by the HMAC: it must be compared with fields of the signed body (jobId:event).
    // A comparison of the key with something built from jobId (e.g. key !== `${data.jobId}:${event}`), also when
    // that value sits in a variable first (const expected = `${data.jobId}:…`; if (key !== expected)).
    else if (
      !u.members.some((f) =>
        f.code.split(/[\n;]/).some((stmt) => {
          if (!/(!==|===|!=|==)/.test(stmt) || !/\b\w*key\w*\b/i.test(stmt.replace(/jobId/g, ""))) return false;
          return /jobId/.test(stmt) || /jobId/.test(expand(f, stmt, 1).slice(stmt.length));
        }),
      )
    ) {
      fail(at, 1, "idempotency-key is not compared with the signed body (`${data.jobId}:${event}`)", true, helpers);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// --changed-since: keep only findings on changed lines / new files
// ---------------------------------------------------------------------------------------------

let scope = null;
if (args["changed-since"]) {
  const ref = args["changed-since"];
  const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  } catch {
    usageError(`--changed-since: "${ref}" is not a commit in ${ROOT} (is it a git repository?)`);
  }
  scope = { ref, changed: new Map(), untracked: new Set() };
  let current = null;
  // --relative: paths relative to --root even when it is a subdirectory of the repository.
  for (const line of git("diff", "--relative", "-U0", "--no-color", "--no-ext-diff", ref, "--").split("\n")) {
    const file = /^\+\+\+ b\/(.+)$/.exec(line);
    if (file) {
      current = new Set();
      scope.changed.set(file[1], current);
      continue;
    }
    if (/^\+\+\+ \/dev\/null/.test(line)) current = null;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let k = 0; k < count; k++) current.add(start + k);
    }
  }
  for (const p of git("ls-files", "--others", "--exclude-standard").split("\n")) if (p.trim()) scope.untracked.add(p.trim());
}

function inScope(finding) {
  if (!scope) return true;
  if (scope.untracked.has(finding.path)) return true;
  // A file-level finding about a callback route also counts when only one of its helpers changed.
  if (finding.fileLevel && finding.also.some((p) => scope.untracked.has(p) || scope.changed.has(p))) return true;
  const lines = scope.changed.get(finding.path);
  if (!lines) return false;
  return finding.fileLevel || lines.has(finding.line);
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

const header = scope
  ? `changed since ${scope.ref} (${scope.changed.size} changed + ${scope.untracked.size} untracked files)`
  : "all files";
console.log(`check-contract · root: ${ROOT} · scope: ${header}\n`);

let failed = 0;
let hidden = 0;
for (const r of results) {
  const shown = r.findings.filter(inScope);
  hidden += r.findings.length - shown.length;
  const status = shown.length ? "FAIL" : "PASS";
  if (shown.length) failed++;
  const note = !shown.length && r.notes.length ? ` (${r.notes.join("; ")})` : "";
  console.log(`${status}  ${r.id.padEnd(3)}  ${r.title}${note}`);
  for (const f of shown) console.log(`        ${f.path}:${f.line}  ${f.message}`);
}
console.log(`\n${results.length - failed} PASS, ${failed} FAIL${scope ? ` · ${hidden} finding(s) outside the changed lines not shown` : ""}`);
process.exitCode = failed ? 1 : 0;
