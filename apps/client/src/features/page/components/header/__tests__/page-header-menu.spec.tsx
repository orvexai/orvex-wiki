// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";

// ENG-1440 fix1 (F1) — the supersede modal must be reachable from the
// page's action menu. CS §4f — substitute at the service boundary only.
vi.mock("@/features/search/services/search-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/search/services/search-service")
  >("@/features/search/services/search-service");
  return { ...actual, searchSuggestions: vi.fn() };
});

import PageHeaderMenu from "@/features/page/components/header/page-header-menu";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";

function renderAt(path: string, pageId: string, page: unknown) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["pages", pageId], page);
  const store = createStore();
  store.set(currentUserAtom, {
    user: { id: "user-1", name: "Ada", settings: {} },
    workspace: {},
  } as any);
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/s/:spaceSlug/p/:pageSlug"
                element={<PageHeaderMenu />}
              />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("PageHeaderMenu — orphan-UI fix (F1): Supersede reachable from the action menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("opens the real SupersedePageModal from the page actions menu", async () => {
    const page = {
      id: "1",
      slugId: "page-1",
      spaceId: "space-1",
      status: "draft",
      permissions: { canEdit: true },
      creator: { name: "Ada" },
      lastUpdatedBy: { name: "Ada" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    renderAt("/s/space-a/p/page-1", "1", page);

    fireEvent.click(screen.getByLabelText("Page actions"));
    await waitFor(() => {
      expect(screen.queryByText("Supersede")).not.toBeNull();
    });
    fireEvent.click(screen.getByText("Supersede"));

    await waitFor(() => {
      expect(screen.getByTestId("supersede-search-input")).toBeTruthy();
    });
  });
});
