import * as ThrottlerNamesRegistry from './orvex-throttler-names';
import {
  ALL_THROTTLER_NAMES,
  AUTH_THROTTLER,
  AI_CHAT_THROTTLER,
  MCP_TOOL_THROTTLER,
  USER_EXPORT_THROTTLER,
  SKIP_NON_EXPORT_THROTTLERS,
  __THROTTLER_NAMES_FOR_TESTS,
} from './orvex-throttler-names';

/**
 * RED->GREEN unit gates for the orvex-throttler-names registry. ENG-1436
 * AC9 (skip-map invariant, Linear-scrubbed).
 */
describe('orvex-throttler-names', () => {
  it('AC9 — SKIP_NON_EXPORT_THROTTLERS contains true for every canonical name except user_export', () => {
    expect(Object.keys(SKIP_NON_EXPORT_THROTTLERS).sort()).toEqual(
      [...ALL_THROTTLER_NAMES].filter((n) => n !== USER_EXPORT_THROTTLER).sort(),
    );
    expect(USER_EXPORT_THROTTLER in SKIP_NON_EXPORT_THROTTLERS).toBe(false);
  });

  it('AC9 — __THROTTLER_NAMES_FOR_TESTS equals the list throttle.module.ts configures', () => {
    expect([...__THROTTLER_NAMES_FOR_TESTS].sort()).toEqual(
      [...ALL_THROTTLER_NAMES].sort(),
    );
  });

  it('AC9 (Linear scrub) — linear_webhook / linear_write are absent from ALL_THROTTLER_NAMES', () => {
    expect(ALL_THROTTLER_NAMES.includes('linear_webhook')).toBe(false);
    expect(ALL_THROTTLER_NAMES.includes('linear_write')).toBe(false);
  });

  it('AC9 (Linear scrub) — no SKIP_NON_WEBHOOK_THROTTLERS / SKIP_NON_WRITE_THROTTLERS export exists', () => {
    const registry: Record<string, unknown> = ThrottlerNamesRegistry;
    expect('SKIP_NON_WEBHOOK_THROTTLERS' in registry).toBe(false);
    expect('SKIP_NON_WRITE_THROTTLERS' in registry).toBe(false);
    expect('LINEAR_WEBHOOK_THROTTLER' in registry).toBe(false);
    expect('LINEAR_WRITE_THROTTLER' in registry).toBe(false);
  });

  it('canonical names are exactly auth, ai-chat, mcp_tool, user_export', () => {
    expect([...ALL_THROTTLER_NAMES].sort()).toEqual(
      [AUTH_THROTTLER, AI_CHAT_THROTTLER, MCP_TOOL_THROTTLER, USER_EXPORT_THROTTLER].sort(),
    );
  });
});
