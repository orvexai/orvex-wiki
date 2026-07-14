import { isDeepStrictEqual } from 'node:util';
import { stripUndefinedDeep } from '../strip-undefined-deep.util';

/**
 * ENG-1469 — safety-contract unit suite for `stripUndefinedDeep`.
 *
 * Covers AC3 (one-sided undefined must NOT look equal), AC4 (null vs absent
 * is preserved), AC5 (arrays are recursed, never filtered), and AC6 (empty /
 * falsy defined values survive untouched). This helper is a pure,
 * dependency-free function — tested directly with zero mocks (CS §5 / ❌#4).
 */
describe('stripUndefinedDeep', () => {
  it('drops nested object keys whose value is undefined (AC3/AC6 baseline)', () => {
    const input = { a: 1, b: undefined, c: { d: undefined, e: 2 } };
    expect(stripUndefinedDeep(input)).toEqual({ a: 1, c: { e: 2 } });
  });

  it('reports one-sided undefined as NOT equal (AC3 — never a false no-op)', () => {
    const sideA = { k: undefined };
    const sideB = { k: 'value' };
    expect(
      isDeepStrictEqual(stripUndefinedDeep(sideA), stripUndefinedDeep(sideB)),
    ).toBe(false);
  });

  it('also reports the reverse one-sided undefined as NOT equal (AC3)', () => {
    const sideA = { k: 'value' };
    const sideB = { k: undefined };
    expect(
      isDeepStrictEqual(stripUndefinedDeep(sideA), stripUndefinedDeep(sideB)),
    ).toBe(false);
  });

  it('preserves an explicit null key (never collapsed with undefined) (AC4)', () => {
    const withNull = { k: null };
    expect(stripUndefinedDeep(withNull)).toEqual({ k: null });
  });

  it('treats null-present vs key-absent as NOT equal (AC4)', () => {
    const withNull = { k: null };
    const absent = {};
    expect(
      isDeepStrictEqual(
        stripUndefinedDeep(withNull),
        stripUndefinedDeep(absent),
      ),
    ).toBe(false);
  });

  it('recurses arrays element-by-element and never filters elements (AC5)', () => {
    const input = [1, undefined, 3];
    const result = stripUndefinedDeep(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(1);
    expect(result[1]).toBeUndefined();
    expect(result[2]).toBe(3);
  });

  it('strips undefined-valued keys from objects nested inside arrays (AC5)', () => {
    const input = [{ a: 1, b: undefined }, { c: undefined }];
    expect(stripUndefinedDeep(input)).toEqual([{ a: 1 }, {}]);
  });

  it('leaves empty/falsy defined values untouched (AC6)', () => {
    const input = { a: '', b: 0, c: false, d: [], e: {} };
    expect(stripUndefinedDeep(input)).toEqual({
      a: '',
      b: 0,
      c: false,
      d: [],
      e: {},
    });
  });

  it('does not mutate the input value', () => {
    const input = { a: 1, b: undefined };
    const clone = { ...input };
    stripUndefinedDeep(input);
    expect(input).toEqual(clone);
  });

  it('passes primitives and null through untouched', () => {
    expect(stripUndefinedDeep(null)).toBeNull();
    expect(stripUndefinedDeep(42)).toBe(42);
    expect(stripUndefinedDeep('x')).toBe('x');
    expect(stripUndefinedDeep(false)).toBe(false);
  });
});
