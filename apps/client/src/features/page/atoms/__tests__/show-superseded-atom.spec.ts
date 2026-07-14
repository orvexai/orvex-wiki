// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { createStore } from "jotai";
import {
  ALL_PAGE_STATUSES,
  showSupersededAtom,
  toSidebarStatusFilter,
} from "@/features/page/atoms/show-superseded-atom";

describe("showSupersededAtom", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // AC6 — per-space isolation (positive/edge)
  test("space A's toggle never leaks into space B's read", () => {
    const store = createStore();

    store.set(showSupersededAtom("space-a"), true);

    expect(store.get(showSupersededAtom("space-a"))).toBe(true);
    expect(store.get(showSupersededAtom("space-b"))).toBe(false);

    expect(window.localStorage.getItem("showSuperseded:space-a")).toBe(
      "true",
    );
    expect(window.localStorage.getItem("showSuperseded:space-b")).toBeNull();
  });

  test("toggling space B does not affect space A's already-set value", () => {
    const store = createStore();
    store.set(showSupersededAtom("space-a"), true);
    store.set(showSupersededAtom("space-b"), true);

    expect(store.get(showSupersededAtom("space-a"))).toBe(true);
    expect(window.localStorage.getItem("showSuperseded:space-a")).toBe(
      "true",
    );
    expect(window.localStorage.getItem("showSuperseded:space-b")).toBe(
      "true",
    );
  });

  // AC7 — ON translates to the full-status passthrough
  test("toSidebarStatusFilter passes through every status when ON", () => {
    expect(toSidebarStatusFilter(true)).toEqual(ALL_PAGE_STATUSES);
    expect(toSidebarStatusFilter(true)).toContain("superseded");
  });

  test("toSidebarStatusFilter omits the filter (excludes superseded) when OFF", () => {
    expect(toSidebarStatusFilter(false)).toBeUndefined();
  });

  // AC9 — SSR/node-safe fallback (forward-compat/edge)
  test("falls back to the global key without throwing when window is undefined", async () => {
    vi.resetModules();
    const originalWindow = globalThis.window;
    vi.stubGlobal("window", undefined);

    const mod = await import(
      "@/features/page/atoms/show-superseded-atom"
    );

    const store = createStore();
    expect(() =>
      store.set(mod.showSupersededAtom("space-a"), true),
    ).not.toThrow();
    expect(store.get(mod.showSupersededAtom("space-a"))).toBe(true);
    // A DIFFERENT space key resolves to the SAME global fallback value —
    // there is no per-space storage without `window`.
    expect(store.get(mod.showSupersededAtom("space-z"))).toBe(true);

    vi.stubGlobal("window", originalWindow);
    vi.resetModules();
  });
});
