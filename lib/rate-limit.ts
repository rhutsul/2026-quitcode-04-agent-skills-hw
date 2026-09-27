import "server-only";

// Demo rate limit: a sliding window per key in process memory. Enough for one Node process (next start);
// on serverless or several instances it must live in a shared store (Redis/KV/DB) instead.
const hits = new Map<string, number[]>();
// Past this many keys, forget the ones with no hit inside their window, so the map cannot grow forever.
const PRUNE_ABOVE_KEYS = 1_000;

/** true = allowed (and counted); false = the key already made `limit` calls within `windowMs`. */
export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (hits.size > PRUNE_ABOVE_KEYS) {
    for (const [k, times] of hits) if (!times.some((at) => now - at < windowMs)) hits.delete(k);
  }
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
