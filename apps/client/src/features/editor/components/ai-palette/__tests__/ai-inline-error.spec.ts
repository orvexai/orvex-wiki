import { describe, test, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
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

    // The partial transform's final commit is still a SINGLE history entry
    // (interim flushes are non-history) — one undo reverts the whole
    // partial transform, leaving the doc exactly as it was pre-transform.
    editor.commands.undo();
    expect(editor.state.doc.toJSON()).toEqual(preTransformDoc);

    editor.destroy();
  });
});
