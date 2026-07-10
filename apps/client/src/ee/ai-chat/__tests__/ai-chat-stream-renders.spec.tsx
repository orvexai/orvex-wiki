// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// ENG-1359 — the single named DoD test (H1). Mounts the exported chat
// panel component (AsideChatPanel, the shared surface that composes
// ChatMessageList + AiStatusBanner + ChatInput and owns the live SSE
// stream via useChatStream), drives it with (a) a committed SSE
// transcript behind a fetch/ReadableStream fake matching the exact wire
// contract in types/ai-chat.types.ts, AND (b) a committed /ai/health
// fixture (litellmDown:true), and asserts observable DOM only.
// Deterministic: fixed fixtures, no Date.now()/Math.random() in the
// assertion path. Never mocks @orvex/client or @docmost/editor-ext — the
// only true-external boundary substituted is the AI service transport
// (fetch + the api-client HTTP layer), per CS §5.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const postMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

// ChatInput mounts a real TipTap/ProseMirror editor — a separately-tested
// leaf component (CS §4f) that is not the unit under test for this DoD
// spec (rendering the streamed assistant turn). Stubbed the same way
// page.spec.tsx stubs FullEditor: substitute the heavy leaf, not the
// component under test. The stub exposes a send affordance so the test
// can drive `onSend` without touching ProseMirror internals.
vi.mock("../components/chat-input", () => ({
  default: ({ onSend }: { onSend: (content: string, mentions: any[], attachments: any[]) => void }) => (
    <button type="button" data-testid="mock-chat-input-send" onClick={() => onSend("Explain the flow", [], [])}>
      send
    </button>
  ),
}));

import AsideChatPanel from "../components/aside-chat-panel";
import healthDownFixture from "./fixtures/ai-health.litellm-down.json";

const transcript = readFileSync(
  join(__dirname, "fixtures/sse-transcript.happy.txt"),
  "utf-8",
);

function fakeSseResponse(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store = createStore();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={["/ai"]}>
            <AsideChatPanel />
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("ai-chat-stream-renders", () => {
  beforeEach(() => {
    // jsdom does not implement Element.scrollTo; ChatMessageList's
    // auto-scroll effect calls it unconditionally on mount.
    if (!window.HTMLElement.prototype.scrollTo) {
      window.HTMLElement.prototype.scrollTo = vi.fn();
    }
    postMock.mockReset();
    // /ai/health, /ai/models, /ai/chats/info — the REST calls the panel
    // makes outside the SSE stream (AC4/AC5 plumbing + post-create
    // rehydrate).
    postMock.mockImplementation((url: string) => {
      if (url === "/ai/health") {
        return Promise.resolve({ data: healthDownFixture });
      }
      if (url === "/ai/models") {
        return Promise.resolve({ data: [] });
      }
      if (url === "/ai/chats/info") {
        return Promise.resolve({
          data: { chat: { id: "chat-fixture-1" }, messages: [] },
        });
      }
      return Promise.reject(new Error(`unexpected api.post(${url})`));
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/ai/chats/send") {
          return Promise.resolve(fakeSseResponse(transcript));
        }
        return Promise.reject(new Error(`unexpected fetch(${url})`));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders streamed answer + citation hover-card + in-chat mermaid + health banner from a replayed real SSE transcript', async () => {
    const { container } = renderPanel();

    // Drive the send path through the exported component's real onSend
    // wiring (mocked leaf editor only) — this is the "When useChatStream
    // consumes it" trigger.
    await act(async () => {
      screen.getByTestId("mock-chat-input-send").click();
    });

    // Final answer text present (AC1).
    await screen.findByText(
      "The citation above documents this pattern.",
      undefined,
      { timeout: 3000 },
    );

    // Exactly one user turn + one assistant turn rendered (AC1 message
    // count invariant — survives internal field renames, asserts DOM
    // output only).
    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-testid="chat-message"]').length,
      ).toBe(2);
    });

    // Citation hover-card href byte-equal to the fixture citation URL
    // (AC2).
    const marker = await screen.findByTestId("citation-marker");
    fireEvent.mouseEnter(marker);
    const card = await screen.findByTestId("citation-card");
    const link = card.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "/s/orvexwiki/p/architecture-abc123",
    );

    // In-chat mermaid: svg-or-fallback present, never an empty node (AC3).
    await waitFor(() => {
      expect(
        container.querySelector('svg, [data-testid="mermaid-fallback"]'),
      ).not.toBeNull();
    });

    // Health banner: litellmDown:true fixture renders the amber alert
    // (AC4).
    expect(screen.getByRole("alert")).toBeDefined();
  });
});
