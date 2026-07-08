// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { SupersededBanner } from "@/features/page/components/superseded-banner";
import { buildPageLink } from "@/features/page/components/superseded-banner.utils";

vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, unsupersedePage: vi.fn() };
});

import { unsupersedePage } from "@/features/page/services/page-service";
const mockedUnsupersede = vi.mocked(unsupersedePage);

function renderBanner(props: Parameters<typeof SupersededBanner>[0]) {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <SupersededBanner {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("SupersededBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC4 — superseded banner shows the replacement link (positive)
  test("shows one alert with an anchor to the canonical replacement", () => {
    const { container } = renderBanner({
      page: { id: "p1", status: "superseded", supersededBy: "canon-slug" },
    });

    const alerts = container.querySelectorAll('[data-testid="superseded-banner"]');
    expect(alerts).toHaveLength(1);

    const anchor = screen.getByTestId(
      "superseded-banner-link",
    ) as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe(buildPageLink("canon-slug"));
  });

  // AC5 — archived reason + unarchive gating (positive)
  test("editor sees the archive reason and an Unarchive action", () => {
    renderBanner({
      page: {
        id: "p1",
        status: "archived",
        archiveReason: "stale content",
      },
      readOnly: false,
    });

    expect(
      screen.getByTestId("archived-banner").textContent,
    ).toContain("stale content");
    expect(screen.getByTestId("unarchive-button")).toBeTruthy();
  });

  // AC5 — read-only: no Unarchive action (edge)
  test("read-only hides the Unarchive action", () => {
    const { container } = renderBanner({
      page: { id: "p1", status: "archived", archiveReason: "stale content" },
      readOnly: true,
    });

    expect(
      container.querySelectorAll('[data-testid="unarchive-button"]'),
    ).toHaveLength(0);
  });

  // AC8 — a rejected unarchive mutation renders inline, page stays mounted
  test("a rejected unarchive mutation shows inline error and keeps rendering", async () => {
    mockedUnsupersede.mockRejectedValue({
      response: { data: { message: "CONFIRM_TOKEN_REQUIRED" } },
    });

    renderBanner({
      page: { id: "p1", status: "archived", archiveReason: "stale" },
    });

    fireEvent.click(screen.getByTestId("unarchive-button"));

    const error = await screen.findByTestId("unarchive-inline-error");
    expect(error.textContent).toContain("CONFIRM_TOKEN_REQUIRED");
    expect(
      document.body.contains(screen.getByTestId("archived-banner")),
    ).toBe(true);
  });

  test("renders nothing when the page has no lifecycle status", () => {
    const { container } = renderBanner({ page: { id: "p1" } });
    expect(container.querySelectorAll("[data-testid]")).toHaveLength(0);
  });
});
