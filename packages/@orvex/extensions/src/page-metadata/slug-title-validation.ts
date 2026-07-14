/**
 * slug-title-validation — the frozen banned-suffix + date-slug rules
 * (CONTRACTS §0.6, §2.9, PLAN §D.4).
 *
 * Defined ONCE here in the shared extensions package and consumed by BOTH:
 *   - the L3 create path (page.service.create + applyMetadata), and
 *   - (by re-implementation against the same constants) the L2 orvex-doc dup guard.
 *
 * Two rules:
 *   1. Banned title/slug suffixes — case-insensitive trailing segment in
 *      {-v2..-v9, -2..-9, -final, -new, -wip, -revised, -copy, -updated, -draft, -old}.
 *      Always rejected, regardless of doc_type, EXCEPT a phase-keyed PRD
 *      (`-phase-N`, doc_type: prd only — per PO ruling 2026-07-03).
 *   2. Date segments — a trailing/embedded date segment (yyyy, yyyy-mm, yyyy-mm-dd,
 *      yyyyQ1..Q4, where yyyy is constrained to a plausible 19xx/20xx year — see
 *      ENG-1348) is rejected UNLESS the page's doc_type is in the closed dated
 *      allow-list {release-notes, retrospective(=retro), adr}. Validation keys on
 *      doc_type, NOT on guessing intent from the slug text.
 */

/** CONTRACTS §0.6 — banned trailing suffix regex (case-insensitive). */
export const BANNED_SLUG_SUFFIX_REGEX =
  /[-_](v[2-9]|[2-9]|final|new|wip|revised|copy|updated|draft|old)$/i;

/**
 * CONTRACTS §0.6 — phase-keyed PRD exemption (per PO ruling 2026-07-03).
 * `-phase-N` is the legitimate keyed identity for a phase-scoped PRD (e.g.
 * "PRD Orvex AI Studio Phase 2"), not a versioned-duplicate rename. Scoped to
 * doc_type: prd only — every other doc_type still trips Rule 1 on a bare
 * trailing digit (e.g. "auth-design-2" still dies at the gate).
 */
export const PHASE_KEYED_PRD_SUFFIX_REGEX = /-phase-[1-9]$/i;

/**
 * CONTRACTS §0.6 — date segment regex (trailing or embedded).
 *
 * ENG-1348: the bare `\d{4}` year previously matched ANY 4-digit run
 * (ticket keys like "ENG-1327", port numbers like "8080", ids like
 * "1234"), so titles such as "ENG-1327 verify" were wrongly rejected
 * with DATE_SLUG_NOT_ALLOWED. Narrowed to plausible years (19xx/20xx)
 * only. Must stay in lockstep with the CLI's Go regex semantics.
 */
export const DATE_SLUG_REGEX =
  /[-_/]((?:19|20)\d{2}([-_]\d{2}){0,2}|(?:19|20)\d{2}q[1-4])([-_/]|$)/i;

/**
 * Closed dated allow-list (CONTRACTS §0.6, §2.9, cross-cutting invariant 8).
 * Both `retro` and its long form `retrospective` are accepted because the
 * universal catalog (CONTRACTS §4.1) uses `retrospective` while §0.6/§2.9 use
 * the shorthand `retro` — they are the same dated type.
 */
export const DATED_DOC_TYPES: ReadonlySet<string> = new Set([
  'release-notes',
  'retro',
  'retrospective',
  'adr',
  // Orvex wiki-capture ("Save to Wiki"): the deterministic default title is
  // `{Skill} — {YYYY-MM-DD}`, so wiki-answer is intentionally dated. Allow-listed
  // per PO ruling 2026-06-17 (Your-Wiki spec §2.3, fork change FK-1) so the
  // happy-path capture files successfully instead of forced-renaming.
  'wiki-answer',
]);

export type SlugTitleViolationCode =
  | 'BANNED_SLUG_SUFFIX'
  | 'DATE_SLUG_NOT_ALLOWED';

export interface SlugTitleViolation {
  error: SlugTitleViolationCode;
  /** The offending value (title or slug) that was validated. */
  value: string;
  message: string;
}

/**
 * Normalises a free-text title to a slug-like token so the suffix/date regexes
 * apply uniformly to either a raw title ("Auth Design v2") or an already-built
 * slug ("auth-design-v2"). Whitespace and `/` become `-`; the result is
 * lower-cased and stripped of redundant separators.
 */
export function normalizeForSlugCheck(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validates a candidate title/slug against the banned-suffix and date-slug
 * rules. Returns the first violation, or null when the value is acceptable.
 *
 * @param value   the raw title OR slug to validate (either is accepted)
 * @param docType the page's doc_type — controls the date-slug exception only
 */
export function validateSlugTitle(
  value: string | null | undefined,
  docType?: string | null,
): SlugTitleViolation | null {
  if (!value) return null;
  const normalized = normalizeForSlugCheck(value);
  if (!normalized) return null;

  // Rule 1 — banned suffix, always enforced, EXCEPT the phase-keyed PRD
  // exemption (per PO ruling 2026-07-03): "-phase-N" is a legitimate keyed
  // identity for doc_type: prd only, not a versioned-duplicate rename.
  const dtForExemption = (docType ?? '').trim().toLowerCase();
  const isPhaseKeyedPrd =
    dtForExemption === 'prd' && PHASE_KEYED_PRD_SUFFIX_REGEX.test(normalized);

  if (!isPhaseKeyedPrd && BANNED_SLUG_SUFFIX_REGEX.test(normalized)) {
    return {
      error: 'BANNED_SLUG_SUFFIX',
      value,
      message:
        `"${value}" ends in a banned versioning suffix. Update the existing ` +
        `page in place instead of creating a versioned duplicate (P1/P5).`,
    };
  }

  // Rule 2 — date segment, allowed only for the closed dated doc_type set.
  if (DATE_SLUG_REGEX.test(normalized)) {
    const dt = (docType ?? '').trim().toLowerCase();
    if (!DATED_DOC_TYPES.has(dt)) {
      return {
        error: 'DATE_SLUG_NOT_ALLOWED',
        value,
        message:
          `"${value}" contains a date segment, which is only permitted for ` +
          `dated doc types (${[...DATED_DOC_TYPES].join(', ')}). This doc_type ` +
          `is "${docType ?? '(none)'}" — keep the page living and date-free (P1/P4).`,
      };
    }
  }

  return null;
}
