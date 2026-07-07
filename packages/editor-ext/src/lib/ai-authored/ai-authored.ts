import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * ENG-1447 — the `aiAuthored` mark: the write-path-driven schema primitive
 * for AI provenance.
 *
 * This is DELIBERATELY the bare schema-level mark only — no NodeView, no
 * badge UI, no click affordance. Those live in the separate
 * `provenance-wiki-badge` leg (client), which consumes this mark's presence
 * to render its badge. Server-side `markAiChangedBlocks` (page-provenance)
 * and the collaboration handler apply/detect this mark purely via the
 * ProseMirror schema, never via AI reasoning logic.
 */
export const AiAuthored = Mark.create({
  name: "aiAuthored",
  exitable: true,
  inclusive: false,

  parseHTML() {
    return [{ tag: "span[data-ai-authored]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-ai-authored": "true" }),
      0,
    ];
  },
});
