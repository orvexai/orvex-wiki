/**
 * orvex-throttler-names — the single canonical registry of workspace-scoped
 * throttler names, ported for the standalone `orvex-wiki` engine. ENG-1436.
 *
 * Ported from the fork at pin `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`apps/server/src/orvex/orvex-throttler-names.ts#L1-L118`) — **Linear-
 * scrubbed** on port: the fork's `LINEAR_WEBHOOK_THROTTLER`/
 * `LINEAR_WRITE_THROTTLER` constants, the `linear_webhook`/`linear_write`
 * names, and the `SKIP_NON_WEBHOOK_THROTTLERS`/`SKIP_NON_WRITE_THROTTLERS`
 * skip-maps are DROPPED — Linear is a wholesale orvex-wiki exclusion and no
 * Linear route exists in this repo to guard (ENG-1436 §1 Linear-scrub
 * call-out).
 *
 * `ALL_THROTTLER_NAMES` is the single source every skip-map is derived from
 * (CS §5c grep gate) — never hand-list a throttler name a second time.
 *
 * Scope of the CS §5c scrub claim (fix-pass-1, review F2): "Linear-scrubbed"
 * means the fork's Linear-specific THROTTLER IDENTIFIERS/CODE do not survive
 * the port — it is not a claim that the literal word "linear" has zero
 * matches repo-wide. This provenance comment, and others like it, legitimately
 * reference "Linear" by name to document what was removed and why; a
 * code-only grep (identifiers/config, comments excluded) is the correct
 * gate here, not a raw text grep.
 */

export const AUTH_THROTTLER = 'auth';
export const AI_CHAT_THROTTLER = 'ai-chat';
export const MCP_TOOL_THROTTLER = 'mcp_tool';

/**
 * The GDPR user-data-export endpoint's dedicated throttler (ENG-1473).
 * A ratified ceiling — never workspace-overridable (CS ❌10; see
 * `throttler-configs.ts`, which gives it an empty `settingsPath`).
 */
export const USER_EXPORT_THROTTLER = 'user_export';

/**
 * Canonical, Linear-scrubbed list of every throttler name configured in
 * `throttle.module.ts`. Every skip-map in this file is derived from this
 * array — it is the single source (CS §5c).
 */
export const ALL_THROTTLER_NAMES: readonly string[] = [
  AUTH_THROTTLER,
  AI_CHAT_THROTTLER,
  MCP_TOOL_THROTTLER,
  USER_EXPORT_THROTTLER,
];

/**
 * Builds a skip-map that skips every canonical throttler EXCEPT `name`, so a
 * route guarded ONLY by its own dedicated throttler is not preempted by an
 * unrelated, tighter shared counter (e.g. `auth` at 10/min gating the
 * user-export route ahead of its own 5/hour budget).
 */
export function skipAllExcept(name: string): Record<string, true> {
  const map: Record<string, true> = {};
  for (const throttlerName of ALL_THROTTLER_NAMES) {
    if (throttlerName !== name) {
      map[throttlerName] = true;
    }
  }
  return map;
}

/**
 * Pass to `@SkipThrottle()` on the user-export route so ONLY the
 * `USER_EXPORT_THROTTLER` limit applies. Keep in sync with the `throttlers`
 * array in `throttle.module.ts` — enforced structurally, since both derive
 * from `ALL_THROTTLER_NAMES`.
 */
export const SKIP_NON_EXPORT_THROTTLERS: Record<string, true> =
  skipAllExcept(USER_EXPORT_THROTTLER);

/**
 * Test-only escape hatch (ENG-1436 AC9): mirrors the throttler names actually
 * registered in `throttle.module.ts`, so the registry-sync invariant can be
 * asserted without booting a Nest application. `throttle.module.ts` builds
 * its `throttlers` array FROM `ALL_THROTTLER_NAMES` (single source, CS §5c),
 * so this is byte-identical to `ALL_THROTTLER_NAMES` by construction — the
 * two never drift because there is only one list.
 */
export const __THROTTLER_NAMES_FOR_TESTS: readonly string[] =
  ALL_THROTTLER_NAMES;
