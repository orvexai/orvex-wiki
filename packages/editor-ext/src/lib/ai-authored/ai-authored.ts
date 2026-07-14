import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * ENG-1447 / ENG-1460 — the `aiAuthored` mark: the write-path-driven schema
 * primitive for AI provenance.
 *
 * This is DELIBERATELY the bare schema-level mark + toggle commands only —
 * no NodeView, no badge UI, no click affordance. Those live in the separate
 * client `page-provenance` badge (ENG-1460), which consumes this mark's
 * presence to render its badge. Server-side `markAiChangedBlocks`
 * (page-provenance) and the collaboration handler apply/detect this mark
 * purely via the ProseMirror schema, never via AI reasoning logic.
 */
export const aiAuthoredMarkClass = "ai-authored-wash";

export interface AiAuthoredOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiAuthored: {
      /** Apply the `aiAuthored` mark to the current selection. */
      setAiAuthored: () => ReturnType;
      /** Remove the `aiAuthored` mark from the current selection. */
      unsetAiAuthored: () => ReturnType;
    };
  }
}

export const AiAuthored = Mark.create<AiAuthoredOptions>({
  name: "aiAuthored",
  exitable: true,
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [{ tag: `span.${aiAuthoredMarkClass}` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: aiAuthoredMarkClass,
        "data-ai-authored": "true",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAiAuthored:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      unsetAiAuthored:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
