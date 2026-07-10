// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { describe, it, expect } from "vitest";
import { extractCitations } from "../citation-metadata";

describe("extractCitations", () => {
  it("returns an empty array when no citations field is present", () => {
    expect(extractCitations(undefined)).toEqual([]);
    expect(extractCitations(null)).toEqual([]);
    expect(extractCitations({})).toEqual([]);
  });

  it("passes through well-formed citations", () => {
    const citations = [
      { id: "c1", pageId: "p1", title: "Page One", url: "/s/w/p/p1" },
    ];
    expect(extractCitations({ citations })).toEqual(citations);
  });

  it("filters out malformed entries missing required fields", () => {
    const citations = [
      { id: "c1", pageId: "p1", title: "Page One", url: "/s/w/p/p1" },
      { id: "", pageId: "p2", title: "Missing id", url: "/s/w/p/p2" },
      { id: "c3", pageId: "", title: "Missing pageId", url: "/s/w/p/p3" },
    ] as any;
    expect(extractCitations({ citations })).toEqual([citations[0]]);
  });
});
