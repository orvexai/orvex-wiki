import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { useCapturedContext } from "../use-captured-context";

/**
 * ENG-1395 AC1 — palette opens + captures context at open-time.
 *
 * Fixes the F5 "trivially stable" gap from the ENG-1395 review: this test
 * does not just diff a plain returned value against itself — it captures
 * the context, then MUTATES the real tiptap document (simulating a
 * keystroke landing elsewhere, e.g. in the palette's own search input
 * while the editor keeps focus/selection state), and asserts the
 * captured `{from,to}` in the ref is untouched by that live document
 * change, because the ref was snapshotted once at open-time and is never
 * re-derived from the editor's current selection while open.
 */
describe("useCapturedContext", () => {
  function makeEditor() {
    return new Editor({
      extensions: [Document, Paragraph, Text],
      content: "<p>hello world</p>",
    });
  }

  test("captured {from,to} survives a later document mutation (typing elsewhere)", () => {
    const editor = makeEditor();
    // Select "world" (positions 7-12).
    editor.commands.setTextSelection({ from: 7, to: 12 });

    const { result } = renderHook(() => useCapturedContext(editor));

    act(() => {
      result.current.captureNow();
    });

    const capturedAtOpen = result.current.capturedContextRef.current;
    expect(capturedAtOpen).toEqual({
      from: 7,
      to: 12,
      text: "world",
      mode: "replace",
    });

    // Simulate the document changing WHILE the palette stays open (e.g. a
    // concurrent edit, or the selection moving as a side effect of
    // rendering) — this must NOT be reflected in the already-captured ref.
    editor.commands.insertContentAt(0, "prefix ");
    editor.commands.setTextSelection({ from: 1, to: 1 });

    expect(result.current.capturedContextRef.current).toBe(capturedAtOpen);
    expect(result.current.capturedContextRef.current).toEqual({
      from: 7,
      to: 12,
      text: "world",
      mode: "replace",
    });

    // Sanity: the document actually did change (proves this isn't a
    // trivially-stable assertion against an untouched doc).
    expect(editor.state.doc.textContent.startsWith("prefix hello")).toBe(true);

    editor.destroy();
  });

  test("clear() resets the ref (palette close)", () => {
    const editor = makeEditor();
    const { result } = renderHook(() => useCapturedContext(editor));

    act(() => {
      result.current.captureNow();
    });
    expect(result.current.capturedContextRef.current).not.toBeNull();

    act(() => {
      result.current.clear();
    });
    expect(result.current.capturedContextRef.current).toBeNull();

    editor.destroy();
  });
});
