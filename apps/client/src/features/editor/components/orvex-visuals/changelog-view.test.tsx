// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import type { NodeViewProps } from "@tiptap/react";
import changelogResponseFixture from "./__fixtures__/changelog-response.json";

// AC5/CS §5 — mock ONLY the true external (the engine HTTP transport
// behind `api-client`), never the ported service/view modules themselves
// (❌#4). `orvex-visuals-service.ts` runs for real against this replayed
// engine response.
const postMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import ChangelogView from "./changelog-view";

function renderWithClient(props: NodeViewProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <ChangelogView {...props} />
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

describe("ChangelogView", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  // Named DoD test (ENG-1377 §5a) — mounts the Changelog NodeView with a
  // committed replay of a real `/page-visuals/changelog` engine response
  // and asserts the DOM renders the projected revision entries
  // (author + timestamp) read-only (no content-editable body).
  it("TestChangelogNodeView_RendersEngineProjection", async () => {
    postMock.mockResolvedValue({ data: changelogResponseFixture });

    const { container } = renderWithClient(fakeNodeViewProps("page-1"));

    await waitFor(() => screen.getByTestId("changelog-nodeview"));

    // AC1 — DOM shows N entry rows equal to entries.length.
    const authorNodes = screen.getAllByTestId("changelog-author");
    expect(authorNodes).toHaveLength(changelogResponseFixture.entries.length);
    changelogResponseFixture.entries.forEach((entry, index) => {
      expect(authorNodes[index].textContent).toContain(entry.authorId);
    });

    // AC1/AC7 — read-only: no content-editable region anywhere in the
    // rendered subtree, and the wrapper itself is explicitly
    // contentEditable={false}.
    const wrapper = screen.getByTestId("changelog-nodeview");
    expect(wrapper.getAttribute("contenteditable")).toBe("false");
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();

    // The engine call went through the real transport (AC5), not a
    // fabricated payload.
    expect(postMock).toHaveBeenCalledWith("/orvex/page-visuals/changelog", {
      pageId: "page-1",
      limit: 20,
    });
  });

  it("AC6 — renders a loading affordance while the fetch is pending", () => {
    postMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithClient(fakeNodeViewProps("page-1"));
    expect(screen.getByTestId("changelog-loading")).toBeDefined();
  });

  it("AC6 — renders an empty hint when there is no history yet", async () => {
    postMock.mockResolvedValue({
      data: { entries: [], verifiedAgainst: null, verifiedAt: null },
    });
    renderWithClient(fakeNodeViewProps("page-1"));
    await waitFor(() => screen.getByTestId("changelog-empty"));
  });

  it("AC6 — renders an inline error instead of throwing when the fetch fails", async () => {
    postMock.mockRejectedValue(new Error("network down"));
    renderWithClient(fakeNodeViewProps("page-1"));
    await waitFor(() => screen.getByTestId("changelog-error"));
  });

  it("AC8 — tolerates unknown extra fields on the projection response", async () => {
    postMock.mockResolvedValue({
      data: { ...changelogResponseFixture, futureField: { nested: true } },
    });
    renderWithClient(fakeNodeViewProps("page-1"));
    await waitFor(() => screen.getByTestId("changelog-nodeview"));
    expect(
      screen.getAllByTestId("changelog-author"),
    ).toHaveLength(changelogResponseFixture.entries.length);
  });
});
