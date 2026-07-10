import { Editor } from "@tiptap/core";

/**
 * ENG-1395 AC1 — open-time selection/block capture.
 *
 * Ported from `apps/client/src/features/editor/components/ai-palette/select-context.ts`
 * (provenance thread, pin `orvexai/docmost@050187676624`, L15-L35).
 *
 * Snapshots `{from,to,text,mode}` at the moment the `AiPalette` opens so
 * later palette typing (which does not touch the document) never shifts
 * the captured range.
 */
export interface CapturedContext {
  from: number;
  to: number;
  text: string;
  mode: "replace" | "append";
}

export function captureSelectionOrBlock(editor: Editor): CapturedContext {
  const { state } = editor;
  const { from, to, empty, $from } = state.selection;

  if (!empty) {
    return {
      from,
      to,
      text: state.doc.textBetween(from, to, "\n"),
      mode: "replace",
    };
  }

  const blockStart = $from.start($from.depth);
  const blockEnd = $from.end($from.depth);

  return {
    from: blockStart,
    to: blockEnd,
    text: state.doc.textBetween(blockStart, blockEnd, "\n"),
    mode: "append",
  };
}
