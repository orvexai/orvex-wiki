// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, it, expect } from "vitest";
import { citationUrl } from "../citation-url";
import type { AiChatCitation } from "../../types/ai-chat.types";

function citation(overrides: Partial<AiChatCitation> = {}): AiChatCitation {
  return {
    id: "c1",
    pageId: "page-1",
    title: "A page",
    url: "",
    ...overrides,
  };
}

describe("citationUrl", () => {
  it("uses the pre-built url verbatim when present", () => {
    expect(citationUrl(citation({ url: "/s/orvexwiki/p/abc123" }))).toBe(
      "/s/orvexwiki/p/abc123",
    );
  });

  it("builds the canonical space/page path when spaceSlug + slugId are present but url is empty", () => {
    expect(
      citationUrl(
        citation({ url: "", spaceSlug: "orvexwiki", slugId: "abc123" }),
      ),
    ).toBe("/s/orvexwiki/p/abc123");
  });

  it("falls back to the bare pageId path when no url or space/slug is available", () => {
    expect(citationUrl(citation({ url: "", pageId: "page-42" }))).toBe(
      "/p/page-42",
    );
  });
});
