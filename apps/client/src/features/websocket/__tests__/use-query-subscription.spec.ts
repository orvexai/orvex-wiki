import { describe, test, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { Socket } from "socket.io-client";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { useQuerySubscription } from "@/features/websocket/use-query-subscription.ts";
import { RQ_KEY } from "@/features/comment/queries/comment-query.ts";
import type { IComment } from "@/features/comment/types/comment.types.ts";

vi.mock("@/features/page/queries/page-query.ts", () => ({
  invalidateOnCreatePage: vi.fn(),
  invalidateOnDeletePage: vi.fn(),
  updateCacheOnMovePage: vi.fn(),
  invalidateOnUpdatePage: vi.fn(),
}));

import {
  invalidateOnCreatePage,
  invalidateOnDeletePage,
  updateCacheOnMovePage,
  invalidateOnUpdatePage,
} from "@/features/page/queries/page-query.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBSCRIPTION_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../use-query-subscription.ts"),
  "utf-8",
);

/** A minimal fake Socket.IO client: captures the "message" handler and lets tests emit events. */
function createFakeSocket() {
  const handlers: Record<string, (payload: unknown) => void> = {};
  const fake = {
    on: vi.fn((event: string, cb: (payload: unknown) => void) => {
      handlers[event] = cb;
      return fake;
    }),
    emit: (payload: unknown) => handlers["message"]?.(payload),
  };
  return fake as unknown as Socket & { emit: (payload: unknown) => void };
}

function renderSubscription(socket: Socket, queryClient: QueryClient) {
  const store = createStore();
  (store.set as any)(socketAtom, socket);
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      JotaiProvider,
      { store },
      React.createElement(QueryClientProvider, { client: queryClient }, children),
    );
  return renderHook(() => useQuerySubscription(), { wrapper });
}

describe("ClientShellRealtime.spec", () => {
  let queryClient: QueryClient;
  let socket: ReturnType<typeof createFakeSocket>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    socket = createFakeSocket();
  });

  test("AC1: invalidate op calls invalidateQueries with the Boolean-filtered key, AND AC2: the removed Linear branch no longer intercepts a linear invalidate message", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderSubscription(socket, queryClient);

    // AC1 — generic invalidate with id present
    socket.emit({ operation: "invalidate", entity: ["workspace"], id: "123" });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workspace", "123"],
    });

    invalidateSpy.mockClear();

    // AC1 — id absent is Boolean-filtered out of the key
    socket.emit({ operation: "invalidate", entity: ["workspace"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["workspace"] });

    invalidateSpy.mockClear();

    // AC2 — a linear-shaped invalidate message falls through to the generic
    // invalidate only; no Linear-specific `by-identifier` branch exists to
    // fire a second, different invalidation.
    socket.emit({
      operation: "invalidate",
      entity: ["linear", "issue"],
      id: "ENG-1",
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["linear", "issue", "ENG-1"],
    });

    // AC2 — source-level scrub gate: zero 'linear' references remain in the file.
    expect(
      (SUBSCRIPTION_SOURCE.match(/linear/gi) || []).length,
    ).toBe(0);
  });

  test("AC3: tree-node realtime ops invoke their cache handler with the payload", () => {
    renderSubscription(socket, queryClient);

    const addPayload = { data: { id: "p1", name: "Page 1" } };
    socket.emit({ operation: "addTreeNode", spaceId: "s1", payload: addPayload });
    expect(invalidateOnCreatePage).toHaveBeenCalledWith(addPayload.data);

    const movePayload = {
      id: "p1",
      parentId: "p2",
      oldParentId: "p0",
      index: 0,
      position: "a1",
      pageData: { id: "p1" },
    };
    socket.emit({ operation: "moveTreeNode", spaceId: "s1", payload: movePayload });
    expect(updateCacheOnMovePage).toHaveBeenCalledWith(
      "s1",
      movePayload.id,
      movePayload.oldParentId,
      movePayload.parentId,
      movePayload.pageData,
    );

    const deletePayload = { node: { id: "p1" } };
    socket.emit({ operation: "deleteTreeNode", spaceId: "s1", payload: deletePayload });
    expect(invalidateOnDeletePage).toHaveBeenCalledWith(deletePayload.node.id);

    socket.emit({
      operation: "updateOne",
      spaceId: "s1",
      entity: ["pages"],
      id: "p1",
      payload: { parentPageId: "p0", title: "New title", icon: "📄" },
    });
    expect(invalidateOnUpdatePage).toHaveBeenCalledWith(
      "s1",
      "p0",
      "p1",
      "New title",
      "📄",
    );

    const refetchSpy = vi.spyOn(queryClient, "refetchQueries");
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    socket.emit({ operation: "refetchRootTreeNodeEvent", spaceId: "s1" });
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: ["root-sidebar-pages", "s1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["recent-changes", "s1"],
    });
  });

  test("AC3/AC6: updateOne merges the payload into observable cache state for the matching key(s)", () => {
    queryClient.setQueryData(["pages", "slug-1"], { title: "old" });
    queryClient.setQueryData(["pages", "p1"], { title: "old" });
    renderSubscription(socket, queryClient);

    socket.emit({
      operation: "updateOne",
      spaceId: "s1",
      entity: ["pages"],
      id: "p1",
      payload: { slugId: "slug-1", title: "new title" },
    });

    expect(queryClient.getQueryData(["pages", "slug-1"])).toMatchObject({
      title: "new title",
    });
    expect(queryClient.getQueryData(["pages", "p1"])).toMatchObject({
      title: "new title",
    });
  });

  test("AC6: a repeated commentCreated message does not duplicate the comment in cache", () => {
    const pageId = "page-1";
    const existing: IComment = { id: "c1", pageId } as IComment;
    queryClient.setQueryData(RQ_KEY(pageId), {
      pages: [{ items: [existing], meta: {} }],
      pageParams: [undefined],
    });

    renderSubscription(socket, queryClient);

    socket.emit({ operation: "commentCreated", pageId, comment: existing });

    const cache = queryClient.getQueryData(RQ_KEY(pageId)) as {
      pages: { items: IComment[] }[];
    };
    expect(cache.pages[0].items).toHaveLength(1);
  });

  test("AC4: React-Query defaults keep retry:false (404-retry suppression)", async () => {
    // jsdom has no `#root` element in this test environment, so main.tsx's
    // guarded mount is skipped on import (see main.tsx) — importing it here
    // exercises the real, live `queryClient` singleton with zero DOM
    // side-effects. Lighten the import graph for the unrelated app tree.
    vi.resetModules();
    vi.doMock("@/App.tsx", () => ({ default: () => null }));
    vi.doMock("@/i18n", () => ({ default: {} }));
    vi.doMock("posthog-js/react", () => ({
      PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
    }));
    vi.doMock("posthog-js", () => ({ default: { init: vi.fn() } }));

    const mainModule = await import("@/main.tsx");
    expect(mainModule.queryClient.getDefaultOptions().queries.retry).toBe(false);

    vi.doUnmock("@/App.tsx");
    vi.doUnmock("@/i18n");
    vi.doUnmock("posthog-js/react");
    vi.doUnmock("posthog-js");
    vi.resetModules();
  });
});
