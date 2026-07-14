// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import type { NodeViewProps } from "@tiptap/react";
import freshnessResponseFixture from "./__fixtures__/freshness-response.json";

const postMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import FreshnessRibbonView from "./freshness-ribbon-view";

function renderWithClient(props: NodeViewProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <FreshnessRibbonView {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

function fakeNodeViewProps(pageId: string | undefined): NodeViewProps {
  return {
    editor: { storage: { pageId } } as any,
    node: {} as any,
    getPos: () => 0,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    extension: {} as any,
    decorations: [] as any,
    innerDecorations: {} as any,
    selected: false,
    view: {} as any,
    HTMLAttributes: {},
  } as unknown as NodeViewProps;
}

describe("FreshnessRibbonView", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("AC2 — renders the tone class + stamps from a replayed engine response", async () => {
    postMock.mockResolvedValue({ data: freshnessResponseFixture });

    const { container } = renderWithClient(fakeNodeViewProps("page-1"));

    await waitFor(() => screen.getByTestId("freshness-ribbon-nodeview"));

    const badge = container.querySelector(
      `.orvex-freshness-tone-${freshnessResponseFixture.tone}`,
    );
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("data-tone")).toBe(freshnessResponseFixture.tone);
    expect(badge?.textContent).toContain(freshnessResponseFixture.status);

    expect(
      screen.getByText(
        `Verified against ${freshnessResponseFixture.verifiedAgainst.slice(0, 8)}`,
      ),
    ).toBeDefined();
  });

  it("AC2 — reflects a stale tone with a different class", async () => {
    postMock.mockResolvedValue({
      data: { ...freshnessResponseFixture, tone: "stale", status: "published" },
    });
    const { container } = renderWithClient(fakeNodeViewProps("page-1"));
    await waitFor(() => screen.getByTestId("freshness-ribbon-nodeview"));
    expect(container.querySelector(".orvex-freshness-tone-stale")).not.toBeNull();
  });

  it("AC6 — renders nothing that throws while loading (non-blocking chrome)", () => {
    postMock.mockReturnValue(new Promise(() => {}));
    expect(() => renderWithClient(fakeNodeViewProps("page-1"))).not.toThrow();
    expect(screen.getByTestId("freshness-ribbon-loading")).toBeDefined();
  });

  it("AC6 — renders an inline error instead of throwing when the fetch fails", async () => {
    postMock.mockRejectedValue(new Error("network down"));
    renderWithClient(fakeNodeViewProps("page-1"));
    await waitFor(() => screen.getByTestId("freshness-ribbon-error"));
  });

  it("AC8 — tolerates unknown extra fields on the projection response", async () => {
    postMock.mockResolvedValue({
      data: { ...freshnessResponseFixture, futureField: 42 },
    });
    renderWithClient(fakeNodeViewProps("page-1"));
    await waitFor(() => screen.getByTestId("freshness-ribbon-nodeview"));
  });
});
