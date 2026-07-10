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
//
// HONESTY NOTE (review1 F1, CS §11): fixtures/sse-transcript.happy.txt is
// hand-authored (contract-matched), NOT a recorded transcript from a live
// orvex-studio-ai instance — the ticket's §5c "recorded transcript" gate is
// blocked by ENG-1450 (the AI core that produces the SSE stream), which is
// unavailable in this sandbox. See the fixture's own leading `:` comment
// lines for the full provenance note and ENG-1359-fix1.md for the
// escalation. Do not remove the fixture's provenance comment, and do not
// tick the 5c/NFR-honesty review-gate boxes until a real recorded
// transcript replaces it.
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
import AiChatLayout from "../components/ai-chat-layout";
import healthDownFixture from "./fixtures/ai-health.litellm-down.json";
import healthNominalFixture from "./fixtures/ai-health.nominal.json";

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

// A controllable SSE response for AC9: lets a test push individual chunks
// and observe the mid-stream DOM (chat-streaming + incremental token
// paint) BEFORE the stream completes, instead of replaying a whole
// transcript synchronously in one enqueue.
function controlledSseResponse() {
  const encoder = new TextEncoder();
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    response: new Response(stream, { status: 200 }),
    push: (chunk: string) => controllerRef.enqueue(encoder.encode(chunk)),
    close: () => controllerRef.close(),
  };
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

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store = createStore();
  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={["/ai"]}>
            <AiChatLayout />
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

  // AC9 (review1 finding: wired-but-unasserted) — dedicated spec, per the
  // ticket's own §5b test-plan entry:
  // `ai-chat-stream-renders.spec.tsx › streaming indicator + empty state`.
  it("streaming indicator + empty state", async () => {
    // --- streaming indicator: mid-stream DOM, asserted BEFORE the stream
    // completes (never-blank + incremental token paint, H12/AC9).
    const controlled = controlledSseResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/ai/chats/send") {
          return Promise.resolve(controlled.response);
        }
        return Promise.reject(new Error(`unexpected fetch(${url})`));
      }),
    );

    const { container, unmount } = renderPanel();

    await act(async () => {
      screen.getByTestId("mock-chat-input-send").click();
    });

    // Push a chat_created + a partial content chunk only — no `done` yet —
    // so the assertion below observes a genuinely in-flight stream, not a
    // synchronously-resolved one.
    await act(async () => {
      controlled.push(
        'data: {"type":"chat_created","chatId":"chat-fixture-2"}\n\n' +
          'data: {"type":"content","text":"Partial answer chunk"}\n\n',
      );
    });

    // Streaming indicator present mid-stream (AC9 assertion #1).
    const streamingNode = await screen.findByTestId("chat-streaming");
    expect(streamingNode).not.toBeNull();
    // Incremental token paint: the partial chunk is visible before the
    // stream ends (AC9 assertion #2 — first token paints before stream end).
    expect(streamingNode.textContent).toContain("Partial answer chunk");

    // Finish the stream cleanly so no open handles leak into the next test.
    await act(async () => {
      controlled.push(
        'data: {"type":"done","messageId":"msg-fixture-2","citations":[]}\n\n' +
          "data: [DONE]\n\n",
      );
      controlled.close();
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="chat-streaming"]')).toBeNull();
    });
    unmount();

    // --- empty state: a fresh chat with zero messages renders the
    // dedicated empty-state surface, never a blank panel (AC9 assertion #3).
    // `chat-empty-state` is only mounted by AiChatLayout (the full-page
    // surface); AsideChatPanel's own zero-message branch is a distinct,
    // unlabeled affordance, so this half of AC9 must mount AiChatLayout.
    postMock.mockReset();
    postMock.mockImplementation((url: string) => {
      if (url === "/ai/health") {
        return Promise.resolve({ data: healthNominalFixture });
      }
      if (url === "/ai/models") {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error(`unexpected api.post(${url})`));
    });

    const layout = renderLayout();
    const emptyState = await layout.findByTestId("chat-empty-state");
    expect(emptyState).not.toBeNull();
    expect(
      layout.container.querySelectorAll('[data-testid="chat-message"]').length,
    ).toBe(0);
  });
});
