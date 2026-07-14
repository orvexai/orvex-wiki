import { lookupConfig, resolveLimit } from './throttler-configs';
import {
  AI_CHAT_THROTTLER,
  USER_EXPORT_THROTTLER,
} from '../orvex-throttler-names';

/**
 * RED->GREEN unit gates for the pure {@link resolveLimit} / {@link lookupConfig}
 * helpers. ENG-1436 AC4-AC6, AC10, AC11.
 */
describe('throttler-configs', () => {
  it('AC4 — resolveLimit returns the default when settings are null', () => {
    expect(resolveLimit(AI_CHAT_THROTTLER, null)).toBe(180);
  });

  it('AC5 — resolveLimit applies a valid override, floored', () => {
    expect(
      resolveLimit(AI_CHAT_THROTTLER, { ai: { throttle: { chatRpm: 42.9 } } }),
    ).toBe(42);
  });

  describe('AC6 — resolveLimit fails safe to the default on a malformed override', () => {
    it.each([
      ['zero', { ai: { throttle: { chatRpm: 0 } } }],
      ['negative', { ai: { throttle: { chatRpm: -5 } } }],
      ['NaN', { ai: { throttle: { chatRpm: NaN } } }],
      ['a numeric string', { ai: { throttle: { chatRpm: '120' } } }],
      ['a non-object mid-path segment', { ai: 'not-an-object' }],
    ])('%s yields the config default (180)', (_label, settings) => {
      expect(resolveLimit(AI_CHAT_THROTTLER, settings)).toBe(180);
    });
  });

  it('AC10 — lookupConfig returns null for an unknown throttler name', () => {
    expect(lookupConfig('unknown')).toBeNull();
  });

  it('AC11 — resolveLimit resolves the default when workspace settings are undefined (no throw)', () => {
    expect(() => resolveLimit(AI_CHAT_THROTTLER, undefined)).not.toThrow();
    expect(resolveLimit(AI_CHAT_THROTTLER, undefined)).toBe(180);
  });

  it('a ratified ceiling (user_export) has no override path — always the default', () => {
    expect(
      resolveLimit(USER_EXPORT_THROTTLER, {
        userExport: { throttle: { rpm: 999 } },
      }),
    ).toBe(5);
  });

  it('resolveLimit throws for an unregistered throttler name (programming-error guard)', () => {
    expect(() => resolveLimit('unknown', null)).toThrow();
  });

  it('is deterministic: contains no Date/Math.random/process.env reads', () => {
    expect(resolveLimit.toString()).not.toMatch(
      /Date\.now|Math\.random|process\.env/,
    );
  });
});
