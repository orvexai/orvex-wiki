import { atom, type PrimitiveAtom, type WritableAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { MultiSelectKey, MultiSelectValue } from '../types/multi-select.types';

/**
 * The canonical empty selection. Never mutated in place — every mutation
 * produces a brand-new `Set` — so `selected === EMPTY_SET` is a valid,
 * referential "untouched" check (AC1).
 */
export const EMPTY_SET: MultiSelectValue = Object.freeze(new Set<string>());

export type MultiSelectUpdater = (current: MultiSelectValue) => MultiSelectValue;

/**
 * Client selection state, keyed by `(editorId, surfaceKey)`.
 *
 * - AC1: distinct `editorId` ⇒ independent atoms (different sets).
 * - AC2: distinct `surfaceKey` on the same editor ⇒ independent atoms too;
 *   equality requires BOTH fields to match.
 */
export const multiSelectAtomFamily = atomFamily(
  (_key: MultiSelectKey): WritableAtom<MultiSelectValue, [MultiSelectUpdater], void> => {
    const base = atom<MultiSelectValue>(EMPTY_SET);
    return atom(
      (get) => get(base),
      (get, set, updater: MultiSelectUpdater) => {
        set(base, updater(get(base)));
      },
    );
  },
  (a, b) => a.editorId === b.editorId && a.surfaceKey === b.surfaceKey,
);

/**
 * Internal-only anchor tracking (range-select origin), keyed the same way.
 * Not part of the curated public surface (§4e) — the hook owns exposing
 * anchor-derived behaviour (range/clear).
 */
// NB: `atom<string | null>(null)` is ambiguous under this repo's
// `strictNullChecks: false` tsconfig — the bare `null` literal can also
// match the single-arg *derived-read-atom* overload (`atom(read)`), since
// `null` is assignable to everything when strict null checks are off. Route
// through a typed local so the argument's static type (`string | null`,
// not a function) resolves to the primitive-atom overload unambiguously.
const NO_ANCHOR: string | null = null;

export const multiSelectAnchorAtomFamily = atomFamily(
  (_key: MultiSelectKey): PrimitiveAtom<string | null> => atom<string | null>(NO_ANCHOR),
  (a, b) => a.editorId === b.editorId && a.surfaceKey === b.surfaceKey,
);
