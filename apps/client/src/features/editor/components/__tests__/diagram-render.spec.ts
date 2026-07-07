import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { Excalidraw } from "../../../../../../../packages/editor-ext/src/lib/excalidraw";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";

// --- AC1/AC2/AC3: pinned Mermaid config -------------------------------------------------

const initializeSpy = vi.fn();
const renderSpy = vi.fn().mockResolvedValue({ svg: "<svg></svg>" });

vi.mock("mermaid", () => ({
  default: {
    initialize: (...args: unknown[]) => initializeSpy(...args),
    render: (...args: unknown[]) => renderSpy(...args),
  },
}));

describe("DiagramRenderFidelity.spec", () => {
  beforeEach(() => {
    vi.resetModules();
    initializeSpy.mockClear();
    renderSpy.mockClear();
    // jsdom does not implement document.fonts; stub a resolved fonts.ready.
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC1: applies the pinned base config exactly once at module load", async () => {
    const mod = await import("../mermaid-config");
    mod.ensureMermaidConfig();
    mod.ensureMermaidConfig();
    mod.ensureMermaidConfig();

    expect(initializeSpy).toHaveBeenCalledTimes(1);
    expect(initializeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        suppressErrorRendering: true,
        securityLevel: "loose",
        flowchart: expect.objectContaining({ htmlLabels: true }),
        look: "handDrawn",
      }),
    );
  });

  it("AC2: theme change re-asserts the WHOLE base config (never resets look/securityLevel)", async () => {
    const mod = await import("../mermaid-config");
    mod.ensureMermaidConfig();
    initializeSpy.mockClear();

    mod.applyMermaidTheme("dark");

    expect(initializeSpy).toHaveBeenCalledTimes(1);
    const [config] = initializeSpy.mock.calls[0];
    expect(config).toMatchObject({
      securityLevel: "loose",
      look: "handDrawn",
      flowchart: { htmlLabels: true },
      theme: "dark",
    });
  });

  it("AC3: renderMermaid awaits the fonts.ready warm-up before the real render", async () => {
    const mod = await import("../mermaid-config");
    mod.ensureMermaidConfig();
    renderSpy.mockClear();

    await mod.renderMermaid("id-1", "graph TD; A-->B;");

    // warm-up render (throwaway) + the real render = at least 2 calls,
    // and the warm-up must have resolved (fonts.ready) before the real one.
    expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCallArgs = renderSpy.mock.calls[renderSpy.mock.calls.length - 1];
    expect(lastCallArgs[0]).toBe("id-1");
    expect(lastCallArgs[1]).toBe("graph TD; A-->B;");
  });

  it("AC3: warm-up only ever runs once across multiple renders", async () => {
    const mod = await import("../mermaid-config");
    mod.ensureMermaidConfig();
    renderSpy.mockClear();

    await mod.renderMermaid("id-1", "graph TD; A-->B;");
    const callsAfterFirst = renderSpy.mock.calls.length;
    await mod.renderMermaid("id-2", "graph TD; C-->D;");
    const callsAfterSecond = renderSpy.mock.calls.length;

    // second render should add exactly one call (no repeat warm-up)
    expect(callsAfterSecond - callsAfterFirst).toBe(1);
  });

  it("AC4: sceneAttachmentId attribute defaults to null (not undefined)", () => {
    const attrs = Excalidraw.config.addAttributes!.call({
      name: "excalidraw",
      options: { HTMLAttributes: {}, view: null, resize: false },
    } as any);

    expect(attrs.sceneAttachmentId.default).toBeNull();
    expect(attrs.sceneAttachmentId.default).not.toBeUndefined();
  });

  it("AC4: JSON->Yjs conversion writes no phantom sceneAttachmentId key (null is filtered, undefined would not be)", () => {
    const nodeSpec = {
      content: "block+",
    };
    const excalidrawSpec = {
      group: "block",
      atom: true,
      attrs: {
        src: { default: "" },
        attachmentId: { default: undefined },
        sceneAttachmentId: { default: null },
      },
      toDOM: () => ["div", 0] as const,
      parseDOM: [{ tag: "div[data-type=excalidraw]" }],
    };
    const textSpec = { group: "inline" };
    const schema = new Schema({
      nodes: {
        doc: nodeSpec,
        excalidraw: excalidrawSpec,
        text: textSpec,
      },
    });

    const json = {
      type: "doc",
      content: [{ type: "excalidraw", attrs: {} }],
    };

    const ydoc = prosemirrorJSONToYDoc(schema, json, "prosemirror");
    const yXmlFragment = ydoc.getXmlFragment("prosemirror");
    const excalidrawEl = yXmlFragment.get(0) as any;
    const attrs = excalidrawEl.getAttributes();

    // The undefined-default attribute IS the bug: y-prosemirror writes a
    // phantom `{ attachmentId: undefined }` key (only `null` gets filtered).
    expect(Object.keys(attrs)).toContain("attachmentId");
    expect(attrs.attachmentId).toBeUndefined();

    // The null-default attribute must never appear as a phantom key.
    expect(Object.keys(attrs)).not.toContain("sceneAttachmentId");
  });

  it("AC5: normalizes literal \\n escapes to <br/> before Mermaid, and back where the lib round-trips text", async () => {
    const mod = await import("../mermaid-config");

    expect(mod.normalizeMermaidLineBreaks('A["line1\\nline2"]')).toBe(
      'A["line1<br/>line2"]',
    );
    expect(mod.normalizeMermaidLineBreaks("A[\"line1\nline2\"]")).toBe(
      'A["line1<br/>line2"]',
    );
    expect(mod.denormalizeMermaidLineBreaks("line1<br/>line2")).toBe(
      "line1\nline2",
    );
    expect(mod.denormalizeMermaidLineBreaks("line1<br>line2")).toBe(
      "line1\nline2",
    );
  });

  it("AC5 regression: renderMermaid must not mangle multi-line code-block source (real mermaid.render call args)", async () => {
    const mod = await import("../mermaid-config");
    mod.ensureMermaidConfig();
    renderSpy.mockClear();

    const multiLineSource = "graph TD\n  A --> B\n  B --> C";
    await mod.renderMermaid("id-multiline", multiLineSource);

    const lastCallArgs = renderSpy.mock.calls[renderSpy.mock.calls.length - 1];
    expect(lastCallArgs[0]).toBe("id-multiline");
    // The whole code-block source must reach mermaid.render UNCHANGED —
    // real newlines are statement separators in Mermaid grammar; replacing
    // them with <br/> (as normalizeMermaidLineBreaks does) breaks parsing.
    expect(lastCallArgs[1]).toBe(multiLineSource);
  });
});

describe("DiagramRenderFidelity.spec (real mermaid, unmocked)", () => {
  // Full SVG layout (dagre + getBBox) is not available under jsdom, so this
  // exercises the real grammar/parser only — the exact surface the
  // regression broke (a parse error, not a layout error). This is the same
  // check the ENG-1391 review used to empirically confirm the bug.
  it("AC5 regression: a real multi-line Mermaid source parses without a grammar error (the string reaching mermaid must be untouched)", async () => {
    vi.resetModules();
    vi.doUnmock("mermaid");

    const realMermaid = (await import("mermaid")).default;
    const { normalizeMermaidLineBreaks } = await import("../mermaid-config");

    const multiLineSource = "graph TD\n  A --> B\n  B --> C";

    // Sanity: prove the pre-fix behavior (normalizing the whole source)
    // really does break the grammar, so this test would have caught it.
    await expect(
      realMermaid.parse(normalizeMermaidLineBreaks(multiLineSource)),
    ).rejects.toThrow(/Parse error/);

    // The actual regression check: raw multi-line source (what
    // renderMermaid now forwards unchanged) must parse cleanly.
    await expect(realMermaid.parse(multiLineSource)).resolves.not.toThrow();

    vi.doMock("mermaid", () => ({
      default: {
        initialize: (...args: unknown[]) => initializeSpy(...args),
        render: (...args: unknown[]) => renderSpy(...args),
      },
    }));
  });
});
