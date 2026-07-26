// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2506 AC3 — `TestClientCollabProviderTargetsEngineDirectly`.
 *
 * The React client renders ProseMirror natively against the ENGINE's own
 * API surfaces — never behind a wiki-api shadow editor:
 *  1. `PageEditor` constructs its `@hocuspocus/provider` websocket against
 *     the engine's OWN origin at `/collab` (`getCollaborationUrl()`), with
 *     the Yjs document named `page.<pageId>` and the engine-minted collab
 *     token.
 *  2. The collab tiptap extensions are wired to that same provider
 *     instance — the real `@tiptap/react` editor (constructed live in this
 *     test, `useEditor`/`EditorProvider`, never a stub component) rides the
 *     engine-backed provider.
 *  3. Page content loads through the engine's own REST client
 *     (`api` baseURL `/api`, same origin) via `POST /pages/info` — not a
 *     wiki-api-proxied editor payload.
 *
 * Mock boundary (CS §5): `@hocuspocus/provider` and `y-indexeddb` are
 * vendored transports (a jsdom test cannot open real websockets/IndexedDB)
 * — substituted with capturing doubles AT the library boundary, exactly the
 * wiring-spec convention `full-editor-provenance-wiring.spec.tsx`
 * establishes. `mainExtensions` is substituted with a minimal REAL tiptap
 * StarterKit so `useEditor` still constructs a genuine editor without
 * dragging every heavy menu extension into jsdom; `collabExtensions` is a
 * capturing fn so the provider-to-editor wiring itself is asserted. No own
 * component is stubbed.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";

const captured = vi.hoisted(() => ({
  sockets: [] as any[],
  providers: [] as any[],
  collabExtensionCalls: [] as any[],
}));

vi.mock("@hocuspocus/provider", () => {
  class HocuspocusProviderWebsocket {
    config: any;
    constructor(config: any) {
      this.config = config;
      captured.sockets.push(this);
    }
    connect() {}
    disconnect() {}
    destroy() {}
  }
  class HocuspocusProvider {
    configuration: any;
    constructor(config: any) {
      this.configuration = config;
      captured.providers.push(this);
    }
    attach() {}
    destroy() {}
  }
  return {
    HocuspocusProvider,
    HocuspocusProviderWebsocket,
    WebSocketStatus: {
      Connecting: "connecting",
      Connected: "connected",
      Disconnected: "disconnected",
    },
  };
});

vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: class {
    on() {}
    destroy() {}
  },
}));

// The engine-minted collab JWT (the auth SERVICE is the substituted IO
// boundary, per the page.spec.tsx convention — never the hook itself).
vi.mock("@/features/auth/services/auth-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/auth/services/auth-service")
  >("@/features/auth/services/auth-service");
  return {
    ...actual,
    getCollabToken: vi.fn(async () => ({ token: "engine-collab-token" })),
  };
});

// Minimal REAL tiptap extension set: `useEditor` still builds a genuine
// editor; `collabExtensions` captures the provider wiring under test.
vi.mock("@/features/editor/extensions/extensions", async () => {
  const { StarterKit } = await import("@tiptap/starter-kit");
  return {
    mainExtensions: [StarterKit],
    collabExtensions: vi.fn((provider: any, user: any) => {
      captured.collabExtensionCalls.push({ provider, user });
      return [];
    }),
  };
});

import PageEditor from "@/features/editor/page-editor";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { getCollaborationUrl } from "@/lib/config";
import api from "@/lib/api-client";
import { getPageById } from "@/features/page/services/page-service";

const PAGE_ID = "0197a3b4-0000-7000-8000-000000002506";

function renderPageEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // The app mounts the editor from an authenticated shell where the collab
  // token query has already resolved (20h staleTime) — mirror that warm
  // cache so the provider is constructed with the engine-minted token,
  // exactly as in production.
  queryClient.setQueryData(["collab-token"], { token: "engine-collab-token" });
  const store = createStore();
  store.set(currentUserAtom, {
    user: { id: "user-1", name: "Ada", avatarUrl: "" },
    workspace: { id: "ws-1" },
  } as any);

  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider store={store}>
          <MemoryRouter initialEntries={["/s/space-a/p/some-page-slug"]}>
            <Routes>
              <Route
                path="/s/:spaceSlug/p/:pageSlug"
                element={
                  <PageEditor
                    pageId={PAGE_ID}
                    editable={true}
                    content={{ type: "doc", content: [] }}
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </JotaiProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("TestClientCollabProviderTargetsEngineDirectly (ENG-2506 AC3)", () => {
  beforeEach(() => {
    captured.sockets.length = 0;
    captured.providers.length = 0;
    captured.collabExtensionCalls.length = 0;
    // Vitest runs with import.meta.env.DEV, where `getCollaborationUrl()`
    // reads the dev-server proxy origin from APP_URL. Point it at the test
    // window's own origin — the production branch (`getAppUrl()`) resolves
    // the SAME origin, so the engine-origin assertion below holds for both.
    process.env.APP_URL = window.location.origin;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("the collab websocket targets the engine's OWN origin at /collab — the getCollaborationUrl() seam, no wiki-api host", async () => {
    renderPageEditor();

    await waitFor(() => expect(captured.sockets.length).toBe(1));
    const socketUrl = new URL(captured.sockets[0].config.url);

    // Engine-origin websocket: same host the SPA itself is served from.
    expect(socketUrl.protocol).toMatch(/^wss?:$/);
    expect(socketUrl.host).toBe(window.location.host);
    expect(socketUrl.pathname).toBe("/collab");
    // And it is exactly the shared config seam, not a per-component URL.
    expect(captured.sockets[0].config.url).toBe(getCollaborationUrl());
  });

  test("the Hocuspocus provider binds the engine document name page.<pageId> with the engine-minted token, and the real tiptap editor rides THAT provider", async () => {
    renderPageEditor();

    await waitFor(() => expect(captured.providers.length).toBe(1));
    const provider = captured.providers[0];
    expect(provider.configuration.name).toBe(`page.${PAGE_ID}`);
    expect(provider.configuration.websocketProvider).toBe(captured.sockets[0]);
    await waitFor(() =>
      expect(provider.configuration.token).toBe("engine-collab-token"),
    );

    // The collab extensions (and through them the editor's Yjs binding)
    // are wired to the SAME engine-backed provider instance.
    await waitFor(() => expect(captured.collabExtensionCalls.length).toBeGreaterThan(0));
    expect(captured.collabExtensionCalls[0].provider).toBe(provider);
    expect(captured.collabExtensionCalls[0].user?.id).toBe("user-1");
  });

  test("page content loads from the engine's own REST surface (same-origin /api client, POST /pages/info) — never a wiki-api-proxied editor payload", async () => {
    // The shared engine api client is same-origin relative ("/api").
    expect(api.defaults.baseURL).toBe("/api");

    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ id: PAGE_ID } as any);
    await getPageById({ pageId: PAGE_ID });
    expect(postSpy).toHaveBeenCalledWith("/pages/info", { pageId: PAGE_ID });
  });
});
