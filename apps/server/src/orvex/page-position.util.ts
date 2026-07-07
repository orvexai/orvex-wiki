/**
 * Utilities for validating page `position` column values.
 *
 * `position` stores a fractional-index key produced by the
 * `fractional-indexing-jittered` library (base-62 charset). Some rows can end
 * up holding a literal keyword string instead (e.g. written by a movePage
 * call site that failed to resolve `child`/`before:<id>`/`after:<id>` into a
 * real key before persisting — ENG-889). This module provides the predicates
 * used by the ENG-889 repair script (`scripts/eng889-repair-positions.manual.ts`)
 * and any future tooling that needs to distinguish corrupt from valid keys.
 *
 * Keep this file free of NestJS / Kysely imports so it can be imported by
 * standalone scripts as well as Jest unit/integration tests.
 */

// ── Corrupt-position detection ───────────────────────────────────────────────

/** Keyword values that must never reach the position column unresolved. */
const KEYWORD_EXACT = new Set(['child', 'before', 'after']);

/** Prefixes that indicate a corrupt positional keyword with an id suffix. */
const KEYWORD_PREFIX = ['before:', 'after:'];

/**
 * Returns `true` when `position` is null/empty or holds a corrupt keyword
 * value that must be repaired (e.g. "child", "before", "after:<uuid>").
 */
export function isCorruptPosition(
  position: string | null | undefined,
): boolean {
  if (!position) return true;
  if (KEYWORD_EXACT.has(position)) return true;
  if (KEYWORD_PREFIX.some((p) => position.startsWith(p))) return true;
  if (!/^[A-Za-z0-9]{1,60}$/.test(position)) return true;
  return false;
}

// ── Valid-key regex ──────────────────────────────────────────────────────────

/**
 * Postgres regex that matches structurally valid fractional-index keys.
 *
 * The `fractional-indexing-jittered` library uses a base-62 charset
 * ([A-Za-z0-9]) and can produce keys well beyond 20 characters after many
 * repeated bisections between the same two adjacent keys. 60 characters is a
 * conservative upper bound that covers all realistic use-cases while still
 * excluding the corrupt keyword forms (which contain ":" or are empty).
 *
 * IMPORTANT: this constant is used verbatim in the ENG-889 repair script's
 * Postgres WHERE clause. If you change it, re-read the script to confirm the
 * updated regex continues to exclude keyword forms and include all valid
 * keys.
 */
export const VALID_POSITION_REGEX = '^[A-Za-z0-9]{1,60}$';
