import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from './canonical-json';

/**
 * ENG-1397 AC8/AC9 — the single content_hash accessor.
 *
 * Sha256 over the canonical (key-sorted) stringify: Postgres `jsonb` does
 * not preserve key insertion order on round-trip, so hashing with plain
 * `JSON.stringify` would make a freshly-built JS object hash differently
 * from the exact same content read back out of the `content` jsonb column,
 * breaking the idempotent-rewrite contract (AC3).
 *
 * Every caller that needs a content hash — the `PageService` write
 * chokepoint AND the AC4 backfill migration — MUST go through this one
 * function rather than re-deriving `sha256(canonicalJsonStringify(...))`
 * inline, so the two can never silently drift apart (F-B).
 */
export function computeContentHash(prosemirrorJson: unknown): string {
  return createHash('sha256')
    .update(canonicalJsonStringify(prosemirrorJson))
    .digest('hex');
}
