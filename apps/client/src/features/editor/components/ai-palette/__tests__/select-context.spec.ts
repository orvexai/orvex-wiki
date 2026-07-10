import { describe, test, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { captureSelectionOrBlock } from "../select-context";

/**
 * ENG-1395 AC1 — captureSelectionOrBlock snapshots a fixed range at
 * open-time so later palette typing (which never mutates the document)
 * cannot shift it.
 */
describe("captureSelectionOrBlockSpec", () => {
  function makeEditor(content: string) {
    return new Editor({ extensions: [Document, Paragraph, Text], content });
  }

  test("captures the exact selection range + text in replace mode", () => {
    const editor = makeEditor("<p>hello world</p>");
    editor.commands.setTextSelection({ from: 1, to: 6 });

    const captured = captureSelectionOrBlock(editor);

    expect(captured).toEqual({ from: 1, to: 6, text: "hello", mode: "replace" });
    editor.destroy();
  });

  test("captures the enclosing block range + text in append mode when the cursor has no selection", () => {
    const editor = makeEditor("<p>hello world</p>");
    editor.commands.setTextSelection(3);

    const captured = captureSelectionOrBlock(editor);

    expect(captured.mode).toBe("append");
    expect(captured.text).toBe("hello world");
    expect(captured.from).toBe(1);
    expect(captured.to).toBe(12);
    editor.destroy();
  });

  test("the captured range stays fixed even if selection state later changes", () => {
    const editor = makeEditor("<p>hello world</p>");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const captured = captureSelectionOrBlock(editor);

    // Simulate "later palette typing" — selection moves, captured snapshot
    // must not follow it.
    editor.commands.setTextSelection({ from: 7, to: 12 });

    expect(captured).toEqual({ from: 1, to: 6, text: "hello", mode: "replace" });
    editor.destroy();
  });
});
