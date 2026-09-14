// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// ENG-2507 — the single named DoD test (H1):
// `TestThinUiSseReaderHasNoServerAiLogic`.
//
// Proves the D-S4 carve-out end to end (Part of ENG-2507):
//   AC2 — the client's SSE handler is a pure `ReadableStream` reader over a
//         stream the caller (the `ai` satellite) supplies: it forwards each
//         `data:` line's parsed JSON untouched and constructs no
//         prompt/system-message string. Proven (a) at runtime by driving the
//         REAL `sendChatMessage` + `useChatStream` against the committed real
//         SSE transcript fixture (never a mock of own code, CS §5 ❌#4), and
//         (b) statically by `scripts/ci/client-ai-thinness-guard.sh` exit 0.
//   AC3 — the engine SERVER carries zero AI-prompting / chat-completion /
//         mermaid→drawio/excalidraw-conversion implementation. Static scan of
//         apps/server/src shipped code (see the scan notes inline for the
//         known non-logic name collisions the ticket itself documents).
//   AC1 — the D-S4 affordances render as thin UI and call the satellite over
//         the ingress (REST/SSE), never in-process. The MCP-settings-page
//         sub-clause is resolved as a recorded DEFERRAL (see
//         docs/eng-2507-mcp-affordance-decision.md, asserted below) — never
//         silently dropped, never fabricated.
//   AC4 — the mcp-affordance SSE ownership finding is RECORDED (no affordance
//         calls mcp directly over SSE; all AI affordances ride `ai`'s frozen
//         ENG-2097 contract) — asserted against the committed decision record.
//   AC5 — an `ai` satellite outage degrades gracefully: inline error UI, no
//         unhandled rejection, and the session recovers (a later send against
//         a restored satellite succeeds). Core-editor typing/saving during an
//         outage is e2e (Playwright) scope — jsdom cannot mount the full
//         TipTap page editor honestly; the containment + recovery assertions
//         here are the sound jsdom subset, disclosed per CS §11.
//
// Determinism: fixed committed fixtures; assertions are on message
// CONTENT/ROLE/ORDER and rendered DOM state, never on the `Date.now()`-keyed
// synthesized local ids (❌#9 note in the ticket) and never on internal
// symbol names — an internal rename of the hook's setters or the service's
// buffer parser does not touch this spec.
//
// NFR never-white-screen: the committed transcript itself carries a `cost`
// frame that is NOT in the reader's known vocabulary — the happy-path
// assertion below therefore re-proves the forward-compat no-op against a
// REAL producer frame (the dedicated unknown-type unit lives in
// hooks/__tests__/use-chat-stream.spec.tsx — extended here, not duplicated).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  waitFor,
  act,
  fireEvent,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { createStore, Provider as JotaiProvider } from "jotai";
import { HelmetProvider } from "react-helmet-async";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { ReactNode } from "react";

const postMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

// ChatInput mounts a real TipTap/ProseMirror editor — a separately-tested
// leaf component that is not the unit under test here. Stubbed exactly the
// way the merged ENG-1359 DoD spec (ai-chat-stream-renders.spec.tsx) stubs
// it: substitute the heavy leaf, never the SSE reader/dispatcher/panel under
// test (CS §5 ❌#4 posture, precedent-reviewed).
vi.mock("../components/chat-input", () => ({
  default: ({
    onSend,
  }: {
    onSend: (content: string, mentions: unknown[], attachments: unknown[]) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-chat-input-send"
      onClick={() => onSend("Explain the flow", [], [])}
    >
      send
    </button>
  ),
}));

import { useChatStream } from "../hooks/use-chat-stream";
import AsideChatPanel from "../components/aside-chat-panel";
import { AskAiGroup } from "@/features/editor/components/fixed-toolbar/groups/ask-ai-group";
import {
  aiPalette,
  aiPaletteStore,
} from "@/features/editor/components/ai-palette/ai-palette";
import { generateAiContentStream } from "@/ee/ai/services/ai-service";
import { aiAnswers } from "@/ee/ai/services/ai-search-service";
import UserApiKeys from "@/ee/api-key/pages/user-api-keys";
import healthNominalFixture from "./fixtures/ai-health.nominal.json";

// __dirname = apps/client/src/ee/ai-chat/__tests__ → six levels up = repo root.
const repoRoot = resolve(__dirname, "../../../../../..");

const transcript = readFileSync(
  join(__dirname, "fixtures/sse-transcript.happy.txt"),
  "utf-8",
);

// Parse the committed real transcript ONCE, by the pinned wire format
// (`data: <json>` lines, sse/AI-CHAT.md) — the EXPECTED values below are
// derived from the fixture, not hand-authored, so "forwarded untouched" is
// byte-for-byte checkable.
const fixtureFrames: Array<Record<string, any>> = transcript
  .split("\n")
  .filter((line) => line.startsWith("data: "))
  .map((line) => JSON.parse(line.slice(6)));
const expectedAssistantContent = fixtureFrames
  .filter((f) => f.type === "token")
  .map((f) => f.token)
  .join("");
const fixtureCitationFrames = fixtureFrames.filter(
  (f) => f.type === "citation",
);

function sseResponseOf(body: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function hookWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store = createStore();
  return render(
    <HelmetProvider>
      <MantineProvider>
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={store}>
            <MemoryRouter initialEntries={["/ai"]}>{ui}</MemoryRouter>
          </JotaiProvider>
        </QueryClientProvider>
      </MantineProvider>
    </HelmetProvider>,
  );
}

// Shared static-scan helper (same posture as the merged ai-thinness-gate
// spec): shipped code only — `__tests__/**` and `*.spec.*` legitimately name
// banned identifiers to describe the gates and are excluded.
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      yield* walk(full);
    } else if (/\.(ts|tsx|css)$/.test(entry) && !/\.spec\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

function scanDetailed(
  dirs: string[],
  banned: RegExp,
): Array<{ file: string; ref: string }> {
  const hits: Array<{ file: string; ref: string }> = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (banned.test(line)) {
          hits.push({ file, ref: `${file}:${i + 1}: ${line.trim()}` });
        }
      });
    }
  }
  return hits;
}

function scan(dirs: string[], banned: RegExp): string[] {
  return scanDetailed(dirs, banned).map((h) => h.ref);
}

describe("TestThinUiSseReaderHasNoServerAiLogic", () => {
  beforeEach(() => {
    if (!window.HTMLElement.prototype.scrollTo) {
      window.HTMLElement.prototype.scrollTo = vi.fn();
    }
    postMock.mockReset();
    postMock.mockImplementation((url: string) => {
      if (url === "/ai/health") {
        return Promise.resolve({ data: healthNominalFixture });
      }
      if (url === "/ai/models") {
        return Promise.resolve({ data: [] });
      }
      if (url === "/ai/chats/info") {
        return Promise.resolve({
          data: { chat: { id: "route-chat-1" }, messages: [] },
        });
      }
      if (url === "/api-keys") {
        return Promise.resolve({
          data: { items: [], meta: { hasNextPage: false, hasPrevPage: false } },
        });
      }
      return Promise.reject(new Error(`unexpected api.post(${url})`));
    });
  });

  afterEach(() => {
    // Keep independently-created mocks tidy between tests.
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // ───────────────────────── AC2 (runtime) ─────────────────────────
  it("AC2 — the SSE handler is a pure ReadableStream reader: fixture frames become message state verbatim, the request carries the user's content only, and the unknown `cost` frame is a no-op", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/ai/chats/send") {
        return Promise.resolve(sseResponseOf(transcript));
      }
      return Promise.reject(new Error(`unexpected fetch(${url})`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChatStream(undefined), {
      wrapper: hookWrapper,
    });

    await act(async () => {
      result.current.sendMessage("Explain the flow", [], []);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Content/role/order — never the Date.now()-keyed synthesized ids.
    await waitFor(() => expect(result.current.messages.length).toBe(2));
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Explain the flow");
    expect(result.current.messages[1].role).toBe("assistant");
    // Byte-for-byte the concatenation of the fixture's `token` frames — the
    // reader forwarded every frame untouched (no rewriting, no injection).
    expect(result.current.messages[1].content).toBe(expectedAssistantContent);
    // The fixture's real `citation` frame surfaced on the finalized message.
    expect(fixtureCitationFrames.length).toBe(1);
    expect(result.current.messages[1].citations?.length).toBe(1);
    expect(result.current.messages[1].citations?.[0]?.url).toBe(
      "/s/orvexwiki/p/architecture-abc123",
    );
    // The transcript's `cost` frame is outside the reader's known vocabulary
    // — forward-compat no-op, stream stayed alive, no error state.
    expect(fixtureFrames.some((f) => f.type === "cost")).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);

    // Ingress-only, zero prompt construction: one call, to the satellite's
    // SSE endpoint, cookie-session auth, and a request body that is exactly
    // the user's own send params — no system/prompt/template/messages key.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/ai/chats/send");
    expect(init.credentials).toBe("include");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.content).toBe("Explain the flow");
    const allowedSendKeys = new Set([
      "chatId",
      "content",
      "mentionedPageIds",
      "contextPageId",
      "attachmentIds",
      "scope",
      "model",
    ]);
    for (const key of Object.keys(sentBody)) {
      expect(allowedSendKeys.has(key), `unexpected send-body key: ${key}`).toBe(
        true,
      );
    }
    for (const banned of ["system", "prompt", "template", "messages", "instructions"]) {
      expect(sentBody[banned]).toBeUndefined();
    }
  });

  // ───────────────────────── AC2 (static) ─────────────────────────
  it("AC2 — client-ai-thinness-guard.sh exits 0 against apps/client/src/ee/ai-chat", () => {
    const script = join(repoRoot, "scripts/ci/client-ai-thinness-guard.sh");
    expect(existsSync(script)).toBe(true);
    // execFileSync throws on a non-zero exit — the assertion IS the call.
    const out = execFileSync("bash", [script, repoRoot], { encoding: "utf8" });
    expect(out).toMatch(/OK: client-ai-thinness/);
  });

  // ───────────────────────── AC3 (static) ─────────────────────────
  it("AC3 — the engine server ships zero AI-prompting/chat-completion/mermaid-conversion implementation", () => {
    const serverSrc = join(repoRoot, "apps/server/src");
    expect(existsSync(serverSrc)).toBe(true);

    // (1) The same banned-pattern set the client guard enforces, applied to
    // the SERVER: zero hits in shipped code. Read from the guard script
    // itself — single source of truth, and this spec (which lives inside the
    // directory that guard scans) never has to spell the banned literals out.
    const guardSource = readFileSync(
      join(repoRoot, "scripts/ci/client-ai-thinness-guard.sh"),
      "utf8",
    );
    const bannedFromGuard = guardSource.match(/^BANNED_REGEX='([^']+)'$/m);
    expect(bannedFromGuard).not.toBeNull();
    const bannedAiLogic = new RegExp(bannedFromGuard![1], "i");
    expect(scan([serverSrc], bannedAiLogic)).toEqual([]);

    // (2) No chat/completion call anywhere server-side.
    const bannedCompletion = /chat\/completions|createChatCompletion/i;
    expect(scan([serverSrc], bannedCompletion)).toEqual([]);

    // (3) No mermaid→drawio/excalidraw CONVERSION implementation. Scoped to
    // implementation identifiers/imports on purpose: the ticket's own AC3
    // documents the known non-logic name collisions — `orvex/llms` is a
    // static Markdown-export discovery surface (ENG-1492), and
    // `orvex/page-blocks/handlers/diagrams.ts` is a schema CATALOG whose
    // description strings document the separate orvex-wiki-api satellite's
    // transform (see its own scope note) — neither contains conversion code,
    // which is exactly what this identifier scan proves.
    const bannedMermaidConversion =
      /mermaid-to-excalidraw|mermaidToExcalidraw|@excalidraw\/mermaid|parseMermaid|convertMermaid|mermaidToDrawio|toMxGraph|from ['"]mermaid['"]/i;
    expect(scan([serverSrc], bannedMermaidConversion)).toEqual([]);
  });

  // ───────────────────────── AC1 (affordances) ─────────────────────────
  it("AC1 — the bubble-menu AskAiGroup renders and forwards to the Cmd+J AI palette (thin UI, no transport of its own)", () => {
    render(
      <MantineProvider>
        <AskAiGroup />
      </MantineProvider>,
    );
    const button = screen.getByRole("button", { name: /Ask AI/i });
    expect(aiPaletteStore.getState().opened).toBe(false);
    fireEvent.click(button);
    // The exported spotlight store (the palette's own public interface — the
    // same one bubble-menu.tsx subscribes to) observed the open.
    expect(aiPaletteStore.getState().opened).toBe(true);
    aiPalette.close();
  });

  it("AC1 — the Cmd+J palette's stream service calls the ai satellite over the ingress and forwards the DTO untouched", async () => {
    // The generate/stream wire uses a `data: [DONE]` completion sentinel
    // (unlike the chat wire) — supply it so onComplete observably fires.
    const fetchMock = vi.fn(() => Promise.resolve(sseResponseOf("data: [DONE]\n")));
    vi.stubGlobal("fetch", fetchMock);

    const dto = { action: "summarize", content: "Some selected text" } as any;
    const chunks: unknown[] = [];
    let completed = false;
    await generateAiContentStream(
      dto,
      (c) => chunks.push(c),
      undefined,
      () => {
        completed = true;
      },
    );
    await waitFor(() => expect(completed).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/ai/generate/stream");
    expect(init.credentials).toBe("include");
    // Forwarded untouched: the wire body IS the caller's DTO — no added
    // system-prompt/template key, no client-side prompting (AC2/AC8 bar).
    expect(JSON.parse(init.body as string)).toEqual(dto);
  });

  it("AC1 — the Cmd+K Ask-search transport (aiAnswers) is a pure SSE reader over the ingress", async () => {
    const frames =
      'data: {"content":"Queues decouple"}\n' +
      'data: {"content":" services."}\n' +
      'data: {"sources":[{"pageId":"p1","title":"Architecture","slugId":"abc123","spaceSlug":"orvexwiki","similarity":0.9,"distance":0.1,"chunkIndex":0,"excerpt":"..."}]}\n' +
      "data: [DONE]\n";
    const fetchMock = vi.fn(() => Promise.resolve(sseResponseOf(frames)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await aiAnswers({ query: "what is a queue" } as any);

    // The reader accumulated exactly what the stream supplied — untouched.
    expect(result.answer).toBe("Queues decouple services.");
    expect(result.sources?.length).toBe(1);
    expect(result.sources?.[0].title).toBe("Architecture");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/ai/answers");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      query: "what is a queue",
    });
  });

  it("AC1 — the API-key settings page renders as a thin CRUD over the engine's own REST surface", async () => {
    renderWithProviders(<UserApiKeys />);

    // The page rendered (settings title) and listed keys over the engine's
    // core/api-key REST op — the only transport it owns.
    expect(
      (await screen.findAllByText("API keys")).length,
    ).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(
        postMock.mock.calls.some(([url]) => url === "/api-keys"),
      ).toBe(true);
    });
  });

  // ───────────────────────── AC5 (error path) ─────────────────────────
  it("AC5 — an ai-satellite outage degrades gracefully: inline error, no unhandled rejection, and the session recovers", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    // Connection-refused analogue for a satellite outage.
    let satelliteUp = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/ai/chats/send") {
          return satelliteUp
            ? Promise.resolve(sseResponseOf(transcript))
            : Promise.reject(new TypeError("Failed to fetch"));
        }
        return Promise.reject(new Error(`unexpected fetch(${url})`));
      }),
    );

    try {
      const { container } = renderWithProviders(<AsideChatPanel />);

      await act(async () => {
        screen.getByTestId("mock-chat-input-send").click();
        await new Promise((r) => setTimeout(r, 0));
      });

      // Inline, contained error UI — the existing onError degrade path.
      const errorNode = await screen.findByTestId("chat-error");
      expect(errorNode.textContent).toContain("Failed to fetch");
      // The optimistic user turn is still rendered — nothing white-screened.
      expect(
        container.querySelectorAll('[data-testid="chat-message"]').length,
      ).toBe(1);

      // Session unaffected: the satellite comes back and the SAME panel, in
      // the SAME session, streams a full turn (interactivity intact — the
      // outage poisoned no shared state).
      satelliteUp = true;
      await act(async () => {
        screen.getByTestId("mock-chat-input-send").click();
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      });

      await waitFor(() => {
        expect(
          container.querySelectorAll('[data-testid="chat-message"]').length,
        ).toBe(3);
      }, { timeout: 3000 });
      expect(container.querySelector('[data-testid="chat-error"]')).toBeNull();

      // The outage produced no unhandled rejection anywhere in the session.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  // ─────────────── AC1 (MCP sub-clause) + AC4 (ownership) ───────────────
  it("AC1/AC4 — the MCP-settings-page sub-clause is a recorded deferral and the mcp SSE ownership finding is recorded — never silently assumed", () => {
    // No fabricated MCP settings surface exists (CS §11 ALL-REAL / ❌#6).
    // When a real client-facing MCP config lands, replace this assertion
    // with the new page's own render test.
    expect(existsSync(join(repoRoot, "apps/client/src/ee/mcp"))).toBe(false);

    // The client bundle's only \bmcp\b mention outside tests is the
    // incidental OSS-attribution string — no MCP settings surface, no MCP
    // tool-invocation code (AC1's own live-grep, test-ified).
    const clientSrc = join(repoRoot, "apps/client/src");
    const mcpHits = scanDetailed([clientSrc], /\bmcp\b/i);
    const allowedMcpFiles = [
      join(clientSrc, "ee", "licence", "components", "oss-details.tsx"),
    ];
    for (const hit of mcpHits) {
      expect(
        allowedMcpFiles.some((allowed) => hit.file === allowed),
        `unexpected mcp mention in client bundle: ${hit.ref}`,
      ).toBe(true);
    }

    // The decision record exists and carries both required findings.
    const record = readFileSync(
      join(repoRoot, "docs/eng-2507-mcp-affordance-decision.md"),
      "utf8",
    );
    // AC4: explicit no-direct-mcp-SSE finding, citing the owning contract.
    expect(record).toMatch(/no affordance in this repo calls mcp directly over SSE/i);
    expect(record).toMatch(/ENG-2097/);
    expect(record).toMatch(/sse\/AI-CHAT\.md/);
    // T4: explicit deferral naming the follow-up, not a silent drop.
    expect(record).toMatch(/DEFERRED/);
    expect(record).toMatch(/follow-up Issue/i);
  });

  // ───────────────────────── NFR (honesty) ─────────────────────────
  it("NFR — no aspirational stub markers in the AI client surface or the engine llms module", () => {
    const dirs = [
      join(repoRoot, "apps/client/src/ee/ai-chat"),
      join(repoRoot, "apps/server/src/orvex/llms"),
    ];
    // Zero unfinished-work markers in shipped code. (The AC's literal
    // `placeholder` grep predates chat-input's TipTap Placeholder extension
    // — a DOM input-hint API, not a stub marker; the aspirational SENSE is
    // what CS §11 bans, and that is what the second scan asserts.)
    expect(scan(dirs, /\b(TODO|FIXME|XXX|HACK)\b/)).toEqual([]);
    expect(
      scan(
        dirs,
        /\bplaceholder (for|until|implementation|logic|only)\b|\b(is|as) a placeholder\b/i,
      ),
    ).toEqual([]);
  });
});
