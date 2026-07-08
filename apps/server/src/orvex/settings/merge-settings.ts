// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * mergeWorkspaceSettings — a pure deep-merge helper for `workspaces.settings`
 * (jsonb), ported for reuse at the `workspaces.settings` write path. NOT YET
 * wired as that path's entry point: the live handler
 * (`core/workspace/services/workspace.service.ts#update()`) still persists
 * `settings` via its own per-key repo writes and does not call this function
 * (ENG-1432 review #1, finding F1/F1c). Live wiring is deferred to ENG-1490.
 * Ported from the fork at pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`packages/orvex-extensions/src/settings/merge-settings.ts#L26-L57`).
 *
 * Rules (ENG-1432 AC1-AC4, AC10):
 *  - sibling keys at every nesting level are PRESERVED on a partial patch;
 *  - arrays REPLACE wholesale — never concatenated/merged (allow-lists must
 *    never silently grow via merge);
 *  - `null` on a leaf is a DELETE sentinel — the key is removed from the
 *    result rather than persisted as `null`;
 *  - `__proto__` / `constructor` / `prototype` keys are skipped on both sides
 *    (prototype-pollution safe) — the merge never writes through the
 *    prototype chain;
 *  - unknown/future keys not modelled by any DTO survive verbatim — the merge
 *    is schema-agnostic; DTO validation is an orthogonal, later gate.
 *
 * PURE: no I/O, no `Date`/`Math.random`/`process.env`, inputs are never
 * mutated — a fresh object is returned.
 */

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function mergeInto(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(patch)) {
    if (UNSAFE_KEYS.has(key)) {
      // Prototype-pollution guard: never read/write __proto__, constructor,
      // or prototype keys from an untrusted patch.
      continue;
    }

    const patchValue = patch[key];

    if (patchValue === null) {
      // null is a delete sentinel: drop the key rather than persist null.
      delete result[key];
      continue;
    }

    const baseValue = result[key];

    if (Array.isArray(patchValue)) {
      // Arrays REPLACE wholesale — never concatenated.
      result[key] = [...patchValue];
      continue;
    }

    if (isPlainObject(patchValue) && isPlainObject(baseValue)) {
      result[key] = mergeInto(
        baseValue as Record<string, unknown>,
        patchValue,
      );
      continue;
    }

    if (isPlainObject(patchValue)) {
      // Base has no matching object to merge into: recurse against an empty
      // base so nested __proto__/array/null rules still apply.
      result[key] = mergeInto({}, patchValue);
      continue;
    }

    result[key] = patchValue;
  }

  return result;
}

export function mergeWorkspaceSettings<T extends Record<string, unknown>>(
  existing: T,
  patch: Record<string, unknown>,
): T {
  return mergeInto(
    isPlainObject(existing) ? existing : {},
    isPlainObject(patch) ? patch : {},
  ) as T;
}
