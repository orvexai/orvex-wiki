import { mergeWorkspaceSettings } from './merge-settings';

/**
 * RED->GREEN unit gates for the pure {@link mergeWorkspaceSettings} helper.
 * ENG-1432 AC1-AC4, AC10.
 */
describe('mergeWorkspaceSettings', () => {
  it('AC1 — preserves sibling keys on a partial nested patch', () => {
    const existing = { ai: { chat: true, search: true } };
    const patch = { ai: { chat: false } };
    expect(mergeWorkspaceSettings(existing, patch)).toEqual({
      ai: { chat: false, search: true },
    });
  });

  it('AC2 — arrays REPLACE, never concatenate', () => {
    const existing = { ai: { models: ['a', 'b'] } };
    const patch = { ai: { models: ['c'] } };
    const result = mergeWorkspaceSettings(existing, patch);
    expect(result.ai.models).toEqual(['c']);
    expect(result.ai.models).toHaveLength(1);
  });

  it('AC3 — null is a delete sentinel (key removed, not set to null)', () => {
    const existing = { oidc: { enabled: true, issuerUrl: 'x' } };
    const patch = { oidc: { issuerUrl: null } };
    const result = mergeWorkspaceSettings(existing, patch);
    expect('issuerUrl' in result.oidc).toBe(false);
    expect(result.oidc.enabled).toBe(true);
  });

  it('AC4 — prototype-pollution safe via __proto__ key', () => {
    const existing = {};
    const patch = JSON.parse('{"__proto__":{"polluted":true}}');
    mergeWorkspaceSettings(existing, patch);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('AC4 — prototype-pollution safe via constructor/prototype keys', () => {
    const existing = {};
    const patch = JSON.parse(
      '{"constructor":{"prototype":{"polluted":true}}}',
    );
    mergeWorkspaceSettings(existing, patch);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('AC10 — unknown/forward-compat keys survive the merge verbatim', () => {
    const existing: Record<string, unknown> = {};
    const patch = { knowledge: { foo: 1 } };
    expect(mergeWorkspaceSettings(existing, patch).knowledge).toEqual({
      foo: 1,
    });
  });

  it('does not mutate the inputs', () => {
    const existing = { ai: { chat: true } };
    const patch = { ai: { chat: false } };
    mergeWorkspaceSettings(existing, patch);
    expect(existing).toEqual({ ai: { chat: true } });
    expect(patch).toEqual({ ai: { chat: false } });
  });

  it('is deterministic: contains no Date/Math.random/process.env reads', () => {
    const src = mergeWorkspaceSettings.toString();
    expect(src).not.toMatch(/Date\.now|Math\.random|process\.env/);
  });
});
