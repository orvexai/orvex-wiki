// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";
import { showSupersededAtom } from "@/features/page/atoms/show-superseded-atom";

// ENG-1440 fix1 (F2/AC7) — the sidebar query must actually be called with
// `includeSuperseded` derived from the per-space toggle atom, not just a
// pure helper nothing calls. CS §4f — substitute at the service boundary
// (`getSidebarPages`), never the page-query hooks themselves.
vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, getSidebarPages: vi.fn(), getPageById: vi.fn() };
});

import { getSidebarPages } from "@/features/page/services/page-service";
import SpaceTree from "@/features/page/tree/components/space-tree";

const mockedGetSidebarPages = vi.mocked(getSidebarPages);

function renderAt(path: string, store = createStore()) {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/s/:spaceSlug"
                element={<SpaceTree spaceId="space-1" readOnly={false} />}
              />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("SpaceTree — AC7 fix: sidebar query reflects the toggle", () => {
  beforeEach(() => {
    mockedGetSidebarPages.mockReset();
    mockedGetSidebarPages.mockResolvedValue({
      items: [],
      meta: { hasNextPage: false, nextCursor: null },
    } as any);
  });

  test("toggle OFF (default) — sidebar query omits includeSuperseded", async () => {
    renderAt("/s/space-a");

    await waitFor(() => {
      expect(mockedGetSidebarPages).toHaveBeenCalled();
    });
    const call = mockedGetSidebarPages.mock.calls[0][0];
    expect(call.spaceId).toBe("space-1");
    expect(call.includeSuperseded).toBeFalsy();
  });

  test("toggle ON for this space — sidebar query passes includeSuperseded: true", async () => {
    const store = createStore();
    store.set(showSupersededAtom("space-a"), true);

    renderAt("/s/space-a", store);

    await waitFor(() => {
      expect(mockedGetSidebarPages).toHaveBeenCalled();
    });
    const call = mockedGetSidebarPages.mock.calls[0][0];
    expect(call.includeSuperseded).toBe(true);
  });
});
