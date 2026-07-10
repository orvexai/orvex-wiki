import { useCallback, useRef } from "react";
import { Editor } from "@tiptap/core";
import { captureSelectionOrBlock, CapturedContext } from "./select-context";

/**
 * ENG-1395 AC1 — snapshots `{from,to,text,mode}` into a ref exactly once,
 * at palette open-time (wired to `Spotlight.Root`'s `onSpotlightOpen`), so
 * later palette typing — which never touches the tiptap document — cannot
 * shift the captured range. `runAction` reads `capturedContextRef.current`,
 * never re-derives it from the editor's live selection while the palette
 * is open.
 */
export function useCapturedContext(editor: Editor | null) {
  const capturedContextRef = useRef<CapturedContext | null>(null);

  const captureNow = useCallback(() => {
    if (!editor) {
      capturedContextRef.current = null;
      return;
    }
    capturedContextRef.current = captureSelectionOrBlock(editor);
  }, [editor]);

  const clear = useCallback(() => {
    capturedContextRef.current = null;
  }, []);

  return { capturedContextRef, captureNow, clear };
}
