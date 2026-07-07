import { createHash } from 'node:crypto';
import { computeContentHash } from '../content-hash';
import { canonicalJsonStringify } from '../canonical-json';

/**
 * ENG-1397 F-B — the ONE content-hash accessor.
 *
 * Both `PageService` (the write chokepoint, AC8/AC9) and the AC4 backfill
 * migration must hash content the exact same way (sha256 over the
 * canonical/key-sorted stringify). Prior to this fix the migration inlined
 * its own `sha256(canonicalJsonStringify(...))` call instead of importing
 * this helper — functionally identical today, but two independent
 * implementations of the same contract that can silently drift apart on a
 * future edit to either one. This spec pins the shared helper's behavior so
 * both call sites can depend on it instead of re-deriving it.
 */
describe('computeContentHash', () => {
  it('hashes via sha256 over the canonical (key-sorted) stringify', () => {
    const content = { b: 1, a: [{ z: 1, y: 2 }] };
    const expected = createHash('sha256')
      .update(canonicalJsonStringify(content))
      .digest('hex');

    expect(computeContentHash(content)).toBe(expected);
  });

  it('is insensitive to key order (matches the jsonb round-trip contract)', () => {
    const a = { foo: 1, bar: { nested: true, z: 3 } };
    const b = { bar: { z: 3, nested: true }, foo: 1 };

    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });
});
