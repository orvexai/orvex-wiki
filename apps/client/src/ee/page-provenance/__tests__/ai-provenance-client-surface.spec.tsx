import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { AiAuthored, aiAuthoredMarkClass } from "@docmost/editor-ext";
import api from "@/lib/api-client";
import { PageProvenanceBadge } from "@/ee/page-provenance/components/page-provenance-badge";
import { getProvenanceLabel } from "@/ee/page-provenance/components/provenance-status";
import { ProvenanceStatus } from "@/ee/page-provenance/types/page-provenance.types";

/**
 * ENG-1460 — `AiProvenanceClientSurfaceSpec` (the ticket's named DoD test).
 *
 * (a) the `AiAuthored` mark parses from / renders to the
 *     `ai-authored-wash` span (round-trip) and `setAiAuthored`/
 *     `unsetAiAuthored` toggle it on a selection;
 * (b) the page-provenance badge maps engine status -> the correct label.
 *
 * CS §5 mocking rule: the ProseMirror editor is REAL (a real `@tiptap/core`
 * `Editor` instance, not a mock) — only the remote provenance query's HTTP
 * transport (`api.post`) is mocked, with a real `/pages/info` response
 * shape (the page row carrying `provenanceStatus`).
 *
 * Review F1 (fix pass 3): `api.post` resolves through `@/lib/api-client`'s
 * response interceptor, which unwraps the RAW axios envelope down to
 * `response.data` — but the SERVER also wraps every non-`@SkipTransform`
 * response body in `{ data, success, status }`
 * (`TransformHttpResponseInterceptor`). So the value `api.post(...)`
 * resolves with at runtime is `{ data: IPage, success, status }`, NOT the
 * bare `IPage` — a second `.data` unwrap is required (mirrors the sibling
 * `getPageById` in `page-service.ts`, which does exactly this). The mocks
 * below resolve the REAL double-wrapped shape so this suite would fail
 * against a client that reads the field off the wrong envelope.
 */
describe("AiProvenanceClientSurfaceSpec", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function makeEditor() {
    return new Editor({
      extensions: [Document, Paragraph, Text, AiAuthored],
      content: "<p>hello world</p>",
    });
  }

  // --- (a) mark parse/render round-trip (AC1) ---------------------------

  test("AiAuthored mark round-trips through the ai-authored-wash span", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.setAiAuthored();

    const html = editor.getHTML();
    expect(html).toContain(`class="${aiAuthoredMarkClass}"`);

    // Round-trip: feed the rendered HTML back into a fresh editor and
    // confirm the mark is recognized again from the `ai-authored-wash`
    // class (parseHTML symmetric with renderHTML).
    const roundTripped = new Editor({
      extensions: [Document, Paragraph, Text, AiAuthored],
      content: html,
    });
    let sawMark = false;
    roundTripped.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === "aiAuthored")) {
        sawMark = true;
      }
    });
    expect(sawMark).toBe(true);

    roundTripped.destroy();
    editor.destroy();
  });

  // --- (a) toggle commands (AC2) -----------------------------------------

  test("setAiAuthored / unsetAiAuthored toggle the mark on a selection", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(editor.isActive("aiAuthored")).toBe(false);

    editor.commands.setAiAuthored();
    expect(editor.isActive("aiAuthored")).toBe(true);

    editor.commands.unsetAiAuthored();
    expect(editor.isActive("aiAuthored")).toBe(false);

    editor.destroy();
  });

  // --- (b) badge status -> label mapping (AC3) ----------------------------

  test.each([
    ["ai_produced", "AI Produced"],
    ["ai_edited", "AI Edited"],
    ["human_verified", "Verified"],
    [null, ""],
  ] as [ProvenanceStatus, string][])(
    "getProvenanceLabel(%s) -> %s",
    (status, expected) => {
      expect(getProvenanceLabel(status, (k) => k)).toBe(expected);
    },
  );

  test("an unrecognized status renders no badge (never crashes)", () => {
    expect(
      getProvenanceLabel("something_unknown" as ProvenanceStatus, (k) => k),
    ).toBe("");
  });

  // --- (b) badge component wiring (AC3, AC5) ------------------------------

  function renderBadge(pageId: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <PageProvenanceBadge pageId={pageId} />
        </MantineProvider>
      </QueryClientProvider>,
    );
  }

  test("renders 'AI Produced' for an ai_produced page", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: { id: "page-1", provenanceStatus: "ai_produced" },
      success: true,
      status: 200,
    } as any);

    renderBadge("page-1");

    expect(await screen.findByText("AI Produced")).toBeTruthy();
  });

  test("renders 'Verified' for a human_verified page", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: { id: "page-1", provenanceStatus: "human_verified" },
      success: true,
      status: 200,
    } as any);

    renderBadge("page-1");

    expect(await screen.findByText("Verified")).toBeTruthy();
  });

  test("renders no badge for a null provenance status", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: { id: "page-1", provenanceStatus: null },
      success: true,
      status: 200,
    } as any);

    renderBadge("page-1");

    await waitFor(() => {
      expect(
        screen.queryByTestId("page-provenance-badge"),
      ).toBeNull();
    });
  });

  test("renders no badge (silent, logged) on a query transport error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(api, "post").mockRejectedValue(new Error("network down"));

    renderBadge("page-1");

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("page-provenance-badge")).toBeNull();
  });
});
