import { describe, test, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import { runAction } from "../run-action";
import { PALETTE_ACTIONS } from "../constants";
import { replaySseTranscript } from "./test-helpers/replay-sse";
import sseTranscript from "../__fixtures__/ai-inline-stream.sse.txt?raw";

/**
 * ENG-1395 — `runAction` behavioural tests.
 *
 * AC6 (Apply modes reach the doc): Replace overwrites the captured range;
 * Insert-below inserts at the range's `to`, leaving prior content intact.
 * AC10 (forward-compat): an unrecognized future action mode is a safe
 * no-op — no throw, doc unchanged, `streamFn` never invoked.
 */
describe("runAction", () => {
  function makeEditor() {
    return new Editor({
      extensions: [Document, Paragraph, Text, History],
      content: "<p>hello world</p>",
    });
  }

  test("AC6 — Replace overwrites the captured range with the streamed markdown", async () => {
    const editor = makeEditor();
    const action = PALETTE_ACTIONS.find((a) => a.id === "improve-writing")!;

    // "world" occupies positions 7-12 in "<p>hello world</p>".
    await runAction(
      editor,
      action,
      { mode: "replace", range: { from: 7, to: 12 }, content: "world" },
      { streamFn: replaySseTranscript(sseTranscript) },
    );

    const finalText = "The quick brown fox jumps.";
    expect(editor.state.doc.textBetween(1, editor.state.doc.content.size, "\n")).toBe(
      `hello ${finalText}`,
    );

    editor.destroy();
  });

  test("AC6 — Insert-below leaves prior content unchanged and appends the streamed markdown after it", async () => {
    const editor = makeEditor();
    const action = PALETTE_ACTIONS.find((a) => a.id === "summarize")!;
    const preExisting = editor.state.doc.textBetween(1, 12, "\n");

    await runAction(
      editor,
      action,
      { mode: "insert-below", range: { from: 1, to: 12 }, content: "hello world" },
      { streamFn: replaySseTranscript(sseTranscript) },
    );

    const finalText = "The quick brown fox jumps.";
    // Prior content ("hello world") is untouched...
    expect(editor.state.doc.textBetween(1, 12, "\n")).toBe(preExisting);
    // ...and the streamed text follows immediately at the old range's `to`.
    expect(
      editor.state.doc.textBetween(12, 12 + finalText.length, "\n"),
    ).toBe(finalText);

    editor.destroy();
  });

  test("AC10 — an unknown/future action mode is a safe no-op: no throw, doc unchanged, streamFn never called", async () => {
    const editor = makeEditor();
    const preTransformDoc = editor.state.doc.toJSON();
    let streamFnCalled = false;

    await expect(
      runAction(
        editor,
        { id: "future-mode", label: "Future mode", action: "some_future_mode" },
        { mode: "replace", range: { from: 7, to: 12 }, content: "world" },
        {
          streamFn: async (_data, _onChunk, _onError, onComplete) => {
            streamFnCalled = true;
            onComplete?.();
            return new AbortController();
          },
        },
      ),
    ).resolves.not.toThrow();

    expect(streamFnCalled).toBe(false);
    expect(editor.state.doc.toJSON()).toEqual(preTransformDoc);

    editor.destroy();
  });

  test("AC10 — existing modes still run unaffected after a prior unknown-mode no-op", async () => {
    const editor = makeEditor();
    const action = PALETTE_ACTIONS.find((a) => a.id === "improve-writing")!;

    await runAction(
      editor,
      { id: "future-mode", label: "Future mode", action: "some_future_mode" },
      { mode: "replace", range: { from: 7, to: 12 }, content: "world" },
      { streamFn: replaySseTranscript(sseTranscript) },
    );
    await runAction(
      editor,
      action,
      { mode: "replace", range: { from: 7, to: 12 }, content: "world" },
      { streamFn: replaySseTranscript(sseTranscript) },
    );

    const finalText = "The quick brown fox jumps.";
    expect(editor.state.doc.textBetween(7, 7 + finalText.length, "\n")).toBe(
      finalText,
    );

    editor.destroy();
  });
});
