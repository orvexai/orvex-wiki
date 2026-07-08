// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { SupersedePageModal } from "@/features/page/components/supersede-page-modal";
import { canConfirmSupersede } from "@/features/page/components/supersede-page-modal.utils";

vi.mock("@/features/search/services/search-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/search/services/search-service")
  >("@/features/search/services/search-service");
  return { ...actual, searchSuggestions: vi.fn() };
});

vi.mock("@/features/page/services/page-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/page/services/page-service")
  >("@/features/page/services/page-service");
  return { ...actual, supersedePage: vi.fn() };
});

import { searchSuggestions } from "@/features/search/services/search-service";
import { supersedePage } from "@/features/page/services/page-service";

const mockedSearch = vi.mocked(searchSuggestions);
const mockedSupersede = vi.mocked(supersedePage);

function renderModal() {
  const queryClient = new QueryClient();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <SupersedePageModal pageId="page-1" opened onClose={vi.fn()} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("SupersedePageModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearch.mockResolvedValue({
      pages: [{ id: "p2", slugId: "canonical-slug", title: "Canonical Page" }],
    } as never);
  });

  test("canConfirmSupersede gates on an actual page selection", () => {
    expect(canConfirmSupersede(null)).toBe(false);
    expect(canConfirmSupersede(undefined)).toBe(false);
    expect(
      canConfirmSupersede({ type: "page", slugId: "" } as never),
    ).toBe(false);
    expect(
      canConfirmSupersede({ type: "page", slugId: "canonical-slug" }),
    ).toBe(true);
  });

  // AC3 — Confirm disabled with no selection (negative)
  test("Confirm starts disabled with no selection", () => {
    renderModal();
    expect(
      (screen.getByTestId("supersede-confirm-button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  // AC3 — Confirm enabled + fires the mutation with the selected slugId (positive)
  test("selecting a page destination enables Confirm and fires the mutation once with its slugId", async () => {
    mockedSupersede.mockResolvedValue({
      status: "canonical",
      supersedes: null,
      supersededBy: null,
      archiveReason: null,
      version: 2,
    });

    renderModal();

    fireEvent.change(screen.getByTestId("supersede-search-input"), {
      target: { value: "canon" },
    });

    const result = await screen.findByTestId("supersede-search-result");
    fireEvent.click(result);

    const confirmButton = screen.getByTestId(
      "supersede-confirm-button",
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);

    await waitFor(() => expect(mockedSupersede).toHaveBeenCalledTimes(1));
    expect(mockedSupersede).toHaveBeenCalledWith({
      pageId: "page-1",
      supersededBy: "canonical-slug",
    });
  });

  // AC8 — a rejected mutation renders inline, never a white screen
  test("a rejected supersede mutation shows an inline error and keeps the modal mounted", async () => {
    mockedSupersede.mockRejectedValue({
      response: { data: { message: "CONFIRM_TOKEN_REQUIRED" } },
    });

    renderModal();

    fireEvent.change(screen.getByTestId("supersede-search-input"), {
      target: { value: "canon" },
    });
    const result = await screen.findByTestId("supersede-search-result");
    fireEvent.click(result);
    fireEvent.click(screen.getByTestId("supersede-confirm-button"));

    const error = await screen.findByTestId("supersede-inline-error");
    expect(error.textContent).toContain("CONFIRM_TOKEN_REQUIRED");
    // still mounted — never a white screen.
    expect(
      document.body.contains(screen.getByTestId("supersede-confirm-button")),
    ).toBe(true);
  });
});
