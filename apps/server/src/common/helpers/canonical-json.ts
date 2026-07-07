/**
 * ENG-1397 — deterministic (canonical) JSON stringify.
 *
 * `JSON.stringify` preserves a JS object's OWN key insertion order, but
 * Postgres's `jsonb` column type does NOT preserve insertion order on
 * round-trip (it re-orders keys internally, by key length then
 * lexicographically). Hashing a freshly-built JS object with plain
 * `JSON.stringify` before it's ever been through a `jsonb` column, and then
 * later re-hashing the SAME logical content after it's been read back out
 * of a `jsonb` column, can therefore produce two DIFFERENT hex digests for
 * byte-for-byte-identical content — silently breaking the content-hash
 * idempotency contract (AC3/AC8).
 *
 * Recursively sorting object keys before stringifying removes the
 * ambiguity: the digest depends only on the VALUES, never on key order or
 * which representation (fresh JS object vs. jsonb round-trip) produced it.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
