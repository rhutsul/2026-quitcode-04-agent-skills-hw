import "server-only";

// Demo rate limit: a sliding window per key in process memory. Enough for one Node process (next start);
// on serverless or several instances it must live in a shared store (Redis/KV/DB) instead.
type Entry = { windowMs: number; times: number[] };
const hits = new Map<string, Entry>();
// Past this many keys, forget the ones with no hit inside their own window, at most once a minute,
// so the map cannot grow forever and a busy map is not scanned on every call.
const PRUNE_ABOVE_KEYS = 1_000;
const PRUNE_EVERY_MS = 60_000;
let lastPrune = 0;

/** true = allowed (and counted); false = the key already made `limit` calls within `windowMs`. */
export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (hits.size > PRUNE_ABOVE_KEYS && now - lastPrune > PRUNE_EVERY_MS) {
    lastPrune = now;
    for (const [k, entry] of hits) {
      if (!entry.times.some((at) => now - at < entry.windowMs)) hits.delete(k);
    }
  }
  const recent = (hits.get(key)?.times ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, { windowMs, times: recent });
    return false;
  }
  recent.push(now);
  hits.set(key, { windowMs, times: recent });
  return true;
}
