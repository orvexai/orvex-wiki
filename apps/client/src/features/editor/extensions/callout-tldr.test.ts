// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Callout } from "@docmost/editor-ext";

/**
 * ENG-1377 (AC4, AC7) — the tldr lead callout is the ONE editable P7 visual
 * primitive (the other three — Changelog/FreshnessRibbon/Chart — are
 * read-only atoms). This exercises the real `Callout` node/commands
 * (never mocked — ❌#4) through a minimal real editor, no DOM rendering
 * required.
 */
function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, Callout],
  });
}

describe("Callout tldr role (AC4)", () => {
  it("setTldrCallout inserts a callout carrying role=tldr / data-orvex-role", () => {
    const editor = makeEditor();
    editor.commands.setTldrCallout();

    let found: { type: string; attrs: Record<string, unknown> } | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "callout") {
        found = { type: node.type.name, attrs: node.attrs };
      }
    });

    expect(found).not.toBeNull();
    expect(found!.attrs.role).toBe("tldr");

    const html = editor.getHTML();
    expect(html).toContain('data-orvex-role="tldr"');

    editor.destroy();
  });

  it("an ordinary callout (no role) never emits data-orvex-role", () => {
    const editor = makeEditor();
    editor.commands.setCallout({ type: "info" });

    const html = editor.getHTML();
    expect(html).not.toContain("data-orvex-role");

    editor.destroy();
  });

  it("AC4/AC7 — the callout node accepts editable text content, unlike the read-only atoms", () => {
    const editor = makeEditor();
    editor.commands.setTldrCallout();
    editor.commands.insertContent("This page in one sentence.");

    expect(editor.getText()).toContain("This page in one sentence.");

    editor.destroy();
  });
});
