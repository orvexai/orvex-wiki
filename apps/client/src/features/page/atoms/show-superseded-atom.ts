// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { PageStatusValue } from "@/features/page/types/page.types";

/**
 * ENG-1440 (AC6, AC7, AC9) — per-space "show superseded" sidebar toggle.
 *
 * Ported from the fork's `show-superseded-atom.ts`. Each space gets its
 * own persisted boolean (AC6): space A's toggle never leaks into space
 * B's read. When there is no `window` (SSR/node/test import time), reads
 * and writes fall back to a single in-memory GLOBAL key instead of
 * throwing (AC9) — there is no localStorage to key per space in that
 * environment, so per-space isolation is a browser-only property.
 */

const GLOBAL_KEY = "showSuperseded";

function storageKey(spaceSlug: string | undefined): string {
  return spaceSlug ? `${GLOBAL_KEY}:${spaceSlug}` : GLOBAL_KEY;
}

// AC9 — the non-browser fallback store (no ReferenceError on `window`).
const memoryFallback = new Map<string, boolean>();

function readStored(spaceSlug: string | undefined): boolean {
  if (typeof window === "undefined") {
    return memoryFallback.get(GLOBAL_KEY) ?? false;
  }
  try {
    return window.localStorage.getItem(storageKey(spaceSlug)) === "true";
  } catch {
    return false;
  }
}

function writeStored(spaceSlug: string | undefined, value: boolean): void {
  if (typeof window === "undefined") {
    memoryFallback.set(GLOBAL_KEY, value);
    return;
  }
  try {
    window.localStorage.setItem(storageKey(spaceSlug), String(value));
  } catch {
    // best-effort persistence only — never throw out of a render path.
  }
}

// The primitive per-space cell (seeded once from storage) — this is what
// actually holds state and notifies React subscribers on `set`.
const baseValueFamily = atomFamily((spaceSlug: string | undefined) =>
  atom(readStored(spaceSlug)),
);

// The public read/write atom: reads the cell, and on write persists to
// storage AND updates the cell (so mounted consumers re-render).
const showSupersededFamily = atomFamily((spaceSlug: string | undefined) =>
  atom(
    (get) => get(baseValueFamily(spaceSlug)),
    (get, set, next: boolean) => {
      writeStored(spaceSlug, next);
      set(baseValueFamily(spaceSlug), next);
    },
  ),
);

/** Read/write the per-space toggle. `spaceSlug` undefined => the global key. */
export function showSupersededAtom(spaceSlug: string | undefined) {
  return showSupersededFamily(spaceSlug);
}

/** AC7 — every status, used as the "reveal everything" passthrough. */
export const ALL_PAGE_STATUSES: PageStatusValue[] = [
  "draft",
  "published",
  "canonical",
  "deprecated",
  "superseded",
  "archived",
];

/**
 * AC7 (S4 wiring note) — translate the toggle into the sidebar query's
 * status filter: ON passes through every status (superseded included);
 * OFF omits the filter so the sidebar query keeps its default (excludes
 * superseded) behaviour.
 */
export function toSidebarStatusFilter(
  showSuperseded: boolean,
): PageStatusValue[] | undefined {
  return showSuperseded ? [...ALL_PAGE_STATUSES] : undefined;
}
