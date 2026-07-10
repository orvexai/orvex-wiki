// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// AC6 (retry re-sends the last SendArgs) + AC8 (unknown SSE event types are
// a no-op) — unit-level, through the exported useChatStream interface.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useChatStream } from "../use-chat-stream";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function fakeSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = lines.map((l) => `data: ${l}\n\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("useChatStream", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC8 — an unknown SSE event type is ignored (no throw) and the stream still renders", async () => {
    (fetch as any).mockResolvedValue(
      fakeSseResponse([
        JSON.stringify({ type: "chat_created", chatId: "c1" }),
        JSON.stringify({ type: "content", text: "Hello" }),
        JSON.stringify({ type: "a_future_event_type", payload: { x: 1 } }),
        JSON.stringify({
          type: "done",
          messageId: "m1",
        }),
        "[DONE]",
      ]),
    );

    const { result } = renderHook(() => useChatStream(undefined), { wrapper });

    await act(async () => {
      result.current.sendMessage("hi", [], []);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)?.content).toBe("Hello");
  });

  it("AC6 — retry() re-sends the last SendArgs verbatim after a retryable error", async () => {
    (fetch as any).mockResolvedValue(
      fakeSseResponse([
        JSON.stringify({
          type: "error",
          message: "upstream hiccup",
          code: "UPSTREAM_ERROR",
          retryable: true,
        }),
        "[DONE]",
      ]),
    );

    const { result } = renderHook(() => useChatStream(undefined), { wrapper });

    await act(async () => {
      result.current.sendMessage("original content", [], [], undefined, "workspace", "gpt-x");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe("upstream hiccup");
    expect(result.current.isRetryable).toBe(true);

    (fetch as any).mockClear();
    (fetch as any).mockResolvedValue(
      fakeSseResponse([
        JSON.stringify({ type: "done", messageId: "m2" }),
        "[DONE]",
      ]),
    );

    await act(async () => {
      result.current.retry();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect((fetch as any).mock.calls.length).toBe(1);
    const [, requestInit] = (fetch as any).mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.content).toBe("original content");
    expect(sentBody.scope).toBe("workspace");
    expect(sentBody.model).toBe("gpt-x");
  });
});
