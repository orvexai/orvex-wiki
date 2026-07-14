// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";
import { PageStatusControl } from "@/features/page/components/page-status-control";
import { SupersedePageModal } from "@/features/page/components/supersede-page-modal";
import { SupersededBanner } from "@/features/page/components/superseded-banner";
import { ShowSupersededToggle } from "@/features/page/components/show-superseded-toggle";
import { getAssignableStatuses } from "@/features/page/components/page-status-control.utils";
import { buildPageLink } from "@/features/page/components/superseded-banner.utils";

// CS §4f — replay the real `/api/orvex/pages/*` mutation shapes at the
// service boundary; never `jest.mock` the page-query hooks themselves.
vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return {
    ...actual,
    supersedePage: vi.fn(),
    unsupersedePage: vi.fn(),
    setPageStatus: vi.fn(),
  };
});
vi.mock("@/features/search/services/search-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/search/services/search-service")
  >("@/features/search/services/search-service");
  return { ...actual, searchSuggestions: vi.fn() };
});

import {
  supersedePage,
  unsupersedePage,
} from "@/features/page/services/page-service";
import { searchSuggestions } from "@/features/search/services/search-service";

const mockedSupersede = vi.mocked(supersedePage);
const mockedUnsupersede = vi.mocked(unsupersedePage);
const mockedSearch = vi.mocked(searchSuggestions);

function renderAt(path: string, ui: React.ReactNode, store = createStore()) {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/s/:spaceSlug" element={<>{ui}</>} />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("TestSupersededLifecycleUI (DoD, §5a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockedSearch.mockResolvedValue({
      pages: [{ id: "p2", slugId: "canon-slug", title: "Canonical Page" }],
    } as never);
  });

  test("status control: assignable dropdown for an editor, display-only for read-only", async () => {
    renderAt(
      "/s/space-a",
      <>
        <PageStatusControl page={{ id: "p1", status: "draft" }} />
      </>,
    );
    expect(
      document.body.querySelectorAll('[data-testid="page-status-badge"]'),
    ).toHaveLength(1);
    fireEvent.click(screen.getByTestId("page-status-trigger"));
    const items = await screen.findAllByRole("menuitem");
    expect(items).toHaveLength(getAssignableStatuses("draft").length);
  });

  test("status control: read-only has no dropdown trigger", () => {
    const { container } = renderAt(
      "/s/space-a",
      <PageStatusControl page={{ id: "p1", status: "draft" }} readOnly />,
    );
    expect(
      container.querySelectorAll('[data-testid="page-status-trigger"]'),
    ).toHaveLength(0);
  });

  test("supersede modal: confirm-gating and mutation payload on a real selection", async () => {
    mockedSupersede.mockResolvedValue({
      status: "canonical",
      supersedes: null,
      supersededBy: null,
      archiveReason: null,
      version: 2,
    });

    renderAt(
      "/s/space-a",
      <SupersedePageModal pageId="page-1" opened onClose={vi.fn()} />,
    );

    const confirmButton = screen.getByTestId(
      "supersede-confirm-button",
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("supersede-search-input"), {
      target: { value: "canon" },
    });
    fireEvent.click(await screen.findByTestId("supersede-search-result"));
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() => expect(mockedSupersede).toHaveBeenCalledTimes(1));
    expect(mockedSupersede).toHaveBeenCalledWith({
      pageId: "page-1",
      supersededBy: "canon-slug",
    });
  });

  test("banner: replacement link + archived reason/unarchive gating", () => {
    const { unmount } = renderAt(
      "/s/space-a",
      <SupersededBanner
        page={{ id: "p1", status: "superseded", supersededBy: "canon-slug" }}
      />,
    );
    const anchor = screen.getByTestId(
      "superseded-banner-link",
    ) as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe(buildPageLink("canon-slug"));
    unmount();

    renderAt(
      "/s/space-a",
      <SupersededBanner
        page={{ id: "p1", status: "archived", archiveReason: "stale" }}
        readOnly
      />,
    );
    expect(
      document.body.querySelectorAll('[data-testid="unarchive-button"]'),
    ).toHaveLength(0);
  });

  test("per-space toggle isolation + SSR fallback + ON->full-status passthrough", async () => {
    const store = createStore();

    renderAt(
      "/s/space-a",
      <ShowSupersededToggle />,
      store,
    );
    fireEvent.click(screen.getByTestId("show-superseded-toggle"));

    // space A persisted independently of space B.
    expect(window.localStorage.getItem("showSuperseded:space-a")).toBe(
      "true",
    );
    expect(window.localStorage.getItem("showSuperseded:space-b")).toBeNull();

    const { toSidebarStatusFilter, ALL_PAGE_STATUSES } = await import(
      "@/features/page/atoms/show-superseded-atom"
    );
    expect(toSidebarStatusFilter(true)).toEqual(ALL_PAGE_STATUSES);
    expect(toSidebarStatusFilter(false)).toBeUndefined();
  });

  test("mutation error renders inline and never white-screens", async () => {
    mockedUnsupersede.mockRejectedValue({
      response: { data: { message: "CONFIRM_TOKEN_REQUIRED" } },
    });

    renderAt(
      "/s/space-a",
      <SupersededBanner
        page={{ id: "p1", status: "archived", archiveReason: "stale" }}
      />,
    );

    fireEvent.click(screen.getByTestId("unarchive-button"));
    const error = await screen.findByTestId("unarchive-inline-error");
    expect(error.textContent).toContain("CONFIRM_TOKEN_REQUIRED");
    expect(
      document.body.contains(screen.getByTestId("archived-banner")),
    ).toBe(true);
  });
});
