// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";

// ENG-1440 fix1 (F1) — PageHeader must mount the real PageStatusControl
// (and, via the banner slot below, the lifecycle banner) so the status
// badge is user-reachable. CS §4f — substitute at the service boundary
// only; the page-query hooks themselves stay real.
vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, getPageById: vi.fn() };
});

import { getPageById } from "@/features/page/services/page-service";
import PageHeader from "@/features/page/components/header/page-header";

const mockedGetPageById = vi.mocked(getPageById);

function renderAt(path: string, pageId: string, page: unknown) {
  const queryClient = new QueryClient();
  // Seed the cache the way the real page shell does: `PageContent` only
  // ever mounts `PageHeader` once its own `usePageQuery` has resolved, so
  // `PageHeader`'s (and `PageHeaderMenu`'s) own cache-sharing `usePageQuery`
  // call reads hydrated data on first render, never a `data === undefined`
  // frame.
  queryClient.setQueryData(["pages", pageId], page);
  const store = createStore();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/s/:spaceSlug/p/:pageSlug"
                element={<PageHeader />}
              />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("PageHeader — orphan-UI fix (F1)", () => {
  beforeEach(() => {
    mockedGetPageById.mockReset();
  });

  test("mounts the real status control and reflects the page's status", async () => {
    const page = {
      id: "1",
      slugId: "page-1",
      status: "draft",
      permissions: { canEdit: true },
      creator: { name: "Ada" },
      lastUpdatedBy: { name: "Ada" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockedGetPageById.mockResolvedValue(page as any);

    renderAt("/s/space-a/p/page-1", "1", page);

    const badge = await screen.findByTestId("page-status-badge");
    expect(badge.textContent).toMatch(/draft/i);
    // Editor (not readOnly) gets the dropdown trigger (AC1).
    expect(screen.getByTestId("page-status-trigger")).toBeTruthy();
  });
});
