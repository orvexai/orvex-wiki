/**
 * ENG-1469 — phantom-key guard helper.
 *
 * WHY: a TipTap/ProseMirror node attr declared `default: undefined` (e.g.
 * `title`/`alt`/`attachmentId` on the Excalidraw node) round-trips through
 * Yjs as an explicit `{key: undefined}` own-property once a doc is built
 * from JSON into Yjs — `y-prosemirror`'s `createTypeFromElementNode` filters
 * attrs whose value is `null`, NOT `undefined`. Postgres JSONB silently
 * drops `undefined`-valued keys on write, so the two stored copies of a page
 * (`content` JSONB vs the live Yjs doc rebuilt via `TiptapTransformer`)
 * permanently disagree on those keys — making a direct `isDeepStrictEqual`
 * report "changed" on every VIEW of such a page, not just on a real edit.
 *
 * `stripUndefinedDeep` is applied to BOTH sides of that equality check
 * (never to what is actually persisted) so an `undefined`-only difference
 * can never, by itself, look like a change.
 *
 * SAFETY (never hides a real change):
 *  - Only `undefined`-valued own-keys of plain objects are removed.
 *  - `null`, `''`, `0`, `false`, `[]`, `{}` all survive untouched — `null`
 *    is a real, meaningful value and must never be collapsed with an
 *    absent key.
 *  - Arrays are recursed into element-by-element and NEVER filtered —
 *    removing an array element (even an `undefined` one) is a real
 *    structural change, not a phantom key.
 *  - The input is never mutated; a new structure is always returned.
 *
 * Kept dependency-free and in its own file: its natural home
 * (`persistence.extension.ts`) pulls `PageRepo -> @orvex/extensions`
 * (pino/sonic-boom), which breaks ts-jest's CJS transform unless mocked —
 * a zero-dependency helper is unit-testable with zero mock ceremony.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue; // drop ONLY undefined-valued keys
      result[key] = stripUndefinedDeep(v);
    }
    return result as T;
  }

  return value; // null / '' / 0 / false / primitives untouched
}
