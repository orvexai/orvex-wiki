// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface FreshnessRibbonOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface FreshnessRibbonAttributes {}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    freshnessRibbon: {
      insertFreshnessRibbon: (
        attributes?: FreshnessRibbonAttributes,
      ) => ReturnType;
    };
  }
}

/**
 * ENG-1377 — ported (behavior-parity) from the fork's
 * `packages/editor-ext/src/lib/freshness-ribbon/freshness-ribbon.ts`.
 * FreshnessRibbon is an atom block that renders a page's freshness ribbon:
 * status + last_reviewed_at + verified_against, coloured
 * green=canonical&fresh, amber=stale, grey=draft/archived. It carries no
 * body content — the data is fetched read-side via the orvex page-visuals
 * `freshness` endpoint (CONTRACTS.md §2.10). Mirrors the Subpages atom.
 */
export const FreshnessRibbon = Node.create<FreshnessRibbonOptions>({
  name: "freshnessRibbon",

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  group: "block",
  atom: true,
  draggable: true,
  isolating: true,

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderText() {
    return "[Freshness]";
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      insertFreshnessRibbon:
        (attributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
    };
  },

  addNodeView() {
    // Force the react node view to render immediately using flush sync (https://github.com/ueberdosis/tiptap/blob/b4db352f839e1d82f9add6ee7fb45561336286d8/packages/react/src/ReactRenderer.tsx#L183-L191)
    this.editor.isInitialized = true;

    return ReactNodeViewRenderer(this.options.view);
  },
});
