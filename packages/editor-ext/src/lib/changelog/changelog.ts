// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface ChangelogOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface ChangelogAttributes {}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    changelog: {
      insertChangelog: (attributes?: ChangelogAttributes) => ReturnType;
    };
  }
}

/**
 * ENG-1377 — ported (behavior-parity) from the fork's
 * `packages/editor-ext/src/lib/changelog/changelog.ts`. Changelog is an atom
 * block that renders a READ-ONLY projection of a page's history (revision
 * authorship + timestamps) plus its verified_against stamp. It is NOT a
 * hand- or AI-editable body block — history lives in git + page history +
 * this server-rendered projection (closes the P4 leak, CONTRACTS.md §2.10 /
 * MI-1). It carries no editable content; the client view fetches the data
 * from the orvex page-visuals `changelog` endpoint via
 * `orvex-visuals-service.ts`. Mirrors the Subpages atom.
 */
export const Changelog = Node.create<ChangelogOptions>({
  name: "changelog",

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
    return "[Changelog]";
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
      insertChangelog:
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
