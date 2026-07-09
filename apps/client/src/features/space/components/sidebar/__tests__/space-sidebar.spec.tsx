// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";

// ENG-1440 fix1 (F1) — the per-space "show superseded" toggle must be
// mounted in the running sidebar. CS §4f — substitute at the service
// boundary only.
vi.mock("@/features/space/services/space-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/space/services/space-service")
  >("@/features/space/services/space-service");
  return { ...actual, getSpaceById: vi.fn() };
});
vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, getSidebarPages: vi.fn(), getPageById: vi.fn() };
});

import { getSpaceById } from "@/features/space/services/space-service";
import { getSidebarPages } from "@/features/page/services/page-service";
import { SpaceSidebar } from "@/features/space/components/sidebar/space-sidebar";

const mockedGetSpaceById = vi.mocked(getSpaceById);
const mockedGetSidebarPages = vi.mocked(getSidebarPages);

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const store = createStore();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/s/:spaceSlug" element={<SpaceSidebar />} />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("SpaceSidebar — orphan-UI fix (F1)", () => {
  beforeEach(() => {
    mockedGetSpaceById.mockReset();
    mockedGetSidebarPages.mockReset();
    mockedGetSidebarPages.mockResolvedValue({
      items: [],
      meta: { hasNextPage: false, nextCursor: null },
    } as any);
  });

  test("mounts the real ShowSupersededToggle above the page tree", async () => {
    mockedGetSpaceById.mockResolvedValue({
      id: "space-1",
      slug: "space-a",
      name: "Space A",
      membership: { permissions: "admin" },
    } as any);

    renderAt("/s/space-a");

    expect(await screen.findByTestId("show-superseded-toggle")).toBeTruthy();
  });
});
