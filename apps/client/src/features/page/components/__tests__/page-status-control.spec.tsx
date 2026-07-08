// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { PageStatusControl } from "@/features/page/components/page-status-control";
import { getAssignableStatuses } from "@/features/page/components/page-status-control.utils";

// CS §4f — substitute at the service boundary, never `jest.mock` our own
// page-query hooks' internals.
vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, setPageStatus: vi.fn() };
});

function renderControl(props: Parameters<typeof PageStatusControl>[0]) {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <PageStatusControl {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("PageStatusControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1 — assignable statuses render (positive)
  test("editor sees exactly one badge and the assignable-status menu", async () => {
    const { container } = renderControl({
      page: { id: "p1", status: "draft" },
    });

    expect(container.querySelectorAll('[data-testid="page-status-badge"]'))
      .toHaveLength(1);

    fireEvent.click(screen.getByTestId("page-status-trigger"));

    const expected = getAssignableStatuses("draft");
    const menuItems = await screen.findAllByRole("menuitem");
    expect(menuItems).toHaveLength(expected.length);
  });

  // AC2 — read-only variant (edge)
  test("read-only renders the badge with no dropdown trigger", () => {
    const { container } = renderControl({
      page: { id: "p1", status: "draft" },
      readOnly: true,
    });

    expect(container.querySelectorAll('[data-testid="page-status-badge"]'))
      .toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="page-status-trigger"]'),
    ).toHaveLength(0);
  });

  // AC10 — loading-null guard (NFR)
  test("renders nothing until page id and status are present", () => {
    const { container } = renderControl({ page: undefined });
    expect(
      container.querySelectorAll('[data-testid="page-status-badge"]'),
    ).toHaveLength(0);
  });

  test("renders nothing when status is missing even if id is present", () => {
    const { container } = renderControl({ page: { id: "p1" } });
    expect(
      container.querySelectorAll('[data-testid="page-status-badge"]'),
    ).toHaveLength(0);
  });
});
