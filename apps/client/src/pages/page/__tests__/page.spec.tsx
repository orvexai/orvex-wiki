// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";

// ENG-1440 fix1 (F1) — SupersededBanner must be mounted in the real page
// shell so a superseded/archived page shows the replacement/archive
// notice. Heavy leaf editors (Tiptap-backed) are stubbed — they are not
// the unit under test here; only the shell's composition is. CS §4f — the
// page-query / space-query services (real IO boundary) are substituted,
// never the hooks.
vi.mock("@/features/editor/full-editor", () => ({
  FullEditor: () => <div data-testid="mock-full-editor" />,
}));
vi.mock("@/features/editor/title-editor", () => ({
  TitleEditor: () => null,
}));
vi.mock("@/features/page-history/components/history-modal", () => ({
  default: () => null,
}));
vi.mock("@/ee/base/components/base-view", () => ({
  BaseView: () => null,
}));

vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, getPageById: vi.fn() };
});
vi.mock("@/features/space/services/space-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/space/services/space-service")
  >("@/features/space/services/space-service");
  return { ...actual, getSpaceById: vi.fn() };
});

import { getPageById } from "@/features/page/services/page-service";
import { getSpaceById } from "@/features/space/services/space-service";
import Page from "@/pages/page/page";

const mockedGetPageById = vi.mocked(getPageById);
const mockedGetSpaceById = vi.mocked(getSpaceById);

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const store = createStore();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/s/:spaceSlug/p/:pageSlug" element={<Page />} />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("Page shell — orphan-UI fix (F1): SupersededBanner mounted", () => {
  beforeEach(() => {
    mockedGetPageById.mockReset();
    mockedGetSpaceById.mockReset();
    mockedGetSpaceById.mockResolvedValue({
      id: "space-1",
      slug: "space-a",
      name: "Space A",
    } as any);
  });

  test("shows the superseded banner + replacement link for a superseded page", async () => {
    mockedGetPageById.mockResolvedValue({
      id: "1",
      slugId: "page-1",
      title: "Old page",
      status: "superseded",
      supersededBy: "canon-slug",
      space: { slug: "space-a" },
      permissions: { canEdit: true },
      creator: { name: "Ada" },
      lastUpdatedBy: { name: "Ada" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    renderAt("/s/space-a/p/page-1");

    expect(await screen.findByTestId("superseded-banner")).toBeTruthy();
    expect(screen.getByTestId("superseded-banner-link")).toBeTruthy();
  });

  test("does not show the banner for a draft page", async () => {
    mockedGetPageById.mockResolvedValue({
      id: "1",
      slugId: "page-1",
      title: "Draft page",
      status: "draft",
      space: { slug: "space-a" },
      permissions: { canEdit: true },
      creator: { name: "Ada" },
      lastUpdatedBy: { name: "Ada" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    renderAt("/s/space-a/p/page-1");

    expect(await screen.findByTestId("mock-full-editor")).toBeTruthy();
    expect(screen.queryByTestId("superseded-banner")).toBeNull();
  });
});
