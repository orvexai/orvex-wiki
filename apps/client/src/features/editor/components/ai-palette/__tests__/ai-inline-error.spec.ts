import { describe, test, expect, vi } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { AiStreamChunk, AiStreamError } from "@docmost/editor-ext";
import { runAction } from "../run-action";
import { PALETTE_ACTIONS } from "../constants";
import { replaySseTranscript } from "./test-helpers/replay-sse";
import errorTranscript from "../__fixtures__/ai-inline-stream-error.sse.txt?raw";

/**
 * ENG-1395 AC7 — stream error surfaces inline, in-flight guard clears.
 *
 * KNOWN GAP (same honest flag as the DoD test's fixture): the error
 * transcript is wire-format-accurate but not captured from a live
 * `orvex-studio-ai` response — that service is blocked-by ENG-1415 and
 * does not exist to call yet. Re-verify against a real transcript once
 * ENG-1415 lands (ticket §5c review gate).
 */
describe("runAction — AC7 error path", () => {
  function makeEditor() {
    return new Editor({
      extensions: [Document, Paragraph, Text, History],
      content: "<p>hello world</p>",
    });
  }

  test("an {error} transcript leaves a consistent (reverted-by-undo) doc, clears in-flight, and surfaces the error", async () => {
    const editor = makeEditor();
    const preTransformDoc = editor.state.doc.toJSON();
    const action = PALETTE_ACTIONS.find((a) => a.id === "improve-writing")!;

    let inFlight = false;
    let surfacedError: string | null = null;

    await runAction(
      editor,
      action,
      { mode: "replace", range: { from: 7, to: 12 }, content: "world" },
      {
        streamFn: replaySseTranscript(errorTranscript),
        setInFlight: (value) => {
          inFlight = value;
        },
        setError: (error) => {
          surfacedError = error;
        },
      },
    );

    // In-flight guard resets to false — never stuck spinning (never white-screen).
    expect(inFlight).toBe(false);
    // Inline error surfaced, not swallowed.
    expect(surfacedError).toBe("upstream model unavailable");

    // The partial transform's final commit is grouped into a SINGLE
    // undo-stack item with every interim flush that ran before it — one
    // undo reverts the whole partial transform, leaving the doc exactly
    // as it was pre-transform.
    editor.commands.undo();
    expect(editor.state.doc.toJSON()).toEqual(preTransformDoc);

    editor.destroy();
  });

  /**
   * PASS14/R3 FIX (F1 mirror for AC7): the test above never actually
   * exercises `flushInterim()` — with real timers and a stub that
   * resolves in microtasks only, the 50ms flush interval never fires
   * before `settle()` clears it, so the "single-undo" assertion above
   * was never proven against the path that broke it (a genuine interim
   * paint before the error settles the stream). This test forces exactly
   * that: gate the transcript after the first real chunk, cross a flush
   * boundary on the fake clock, THEN let the error settle the stream.
   */
  test("AC7 — a genuine interim flush paints before the error settles the stream, and a single undo still restores the ORIGINAL doc", async () => {
    vi.useFakeTimers();

    const editor = makeEditor();
    const preTransformDoc = editor.state.doc.toJSON();
    const action = PALETTE_ACTIONS.find((a) => a.id === "improve-writing")!;

    let inFlight = false;
    let surfacedError: string | null = null;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Reads the same committed error fixture's chunk content ("The ")
    // rather than hand-authoring new text, but pauses after it so the
    // fake clock can cross a real 50ms flush boundary before the error
    // (fixture's second `data:` line) settles the stream.
    const firstChunk = JSON.parse(
      errorTranscript
        .split("\n")
        .find((line) => line.startsWith("data: "))!
        .slice(6),
    ) as AiStreamChunk;

    const streamFn = async (
      _data: Record<string, unknown>,
      onChunk: (chunk: AiStreamChunk) => void,
      onError?: (error: AiStreamError) => void,
    ) => {
      const abortController = new AbortController();
      onChunk(firstChunk);
      await gate;
      onError?.({ error: "upstream model unavailable" });
      return abortController;
    };

    const runPromise = runAction(
      editor,
      action,
      { mode: "replace", range: { from: 7, to: 12 }, content: "world" },
      {
        streamFn,
        setInFlight: (value) => {
          inFlight = value;
        },
        setError: (error) => {
          surfacedError = error;
        },
      },
    );

    // Advance past one flush cycle WHILE gated — a genuine flushInterim
    // paint, not commitFinal running early.
    await vi.advanceTimersByTimeAsync(60);
    expect(
      editor.state.doc.textBetween(7, 7 + firstChunk.content.length, "\n"),
    ).toBe(firstChunk.content);

    release();
    await vi.advanceTimersByTimeAsync(60);
    await runPromise;

    expect(inFlight).toBe(false);
    expect(surfacedError).toBe("upstream model unavailable");

    // Single undo restores the TRUE original — not the interim paint
    // that was on-screen when the error settled the stream. Mutation
    // check (manual, see OrvexAiInlineHandler class doc): reintroduce
    // `addToHistory: false` on `flushInterim` and this goes RED.
    editor.commands.undo();
    expect(editor.state.doc.toJSON()).toEqual(preTransformDoc);

    editor.destroy();
    vi.useRealTimers();
  });
});
