// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import api from "@/lib/api-client";

/**
 * ENG-1377 (AC5) — client transport for the read-only P7 visual primitives
 * data (CONTRACTS.md §2.10). All three endpoints are JWT+CASL guarded reads
 * served by `OrvexPageVisualsController`
 * (`apps/server/src/orvex/page-visuals/orvex-page-visuals.controller.ts`,
 * ENG-1376); none of them mutate page content. The response types below
 * mirror that controller's wire shape exactly — JSON serializes each
 * `Date` field to an ISO string, so every timestamp here is typed
 * `string | null`, never `Date` (CS §7 seam).
 */

/** Lifecycle status values recognised by `orvex_page_meta` (ENG-1371). */
export type OrvexPageStatus =
  | "draft"
  | "published"
  | "canonical"
  | "deprecated"
  | "superseded"
  | "archived";

export type FreshnessTone = "draft" | "archived" | "fresh" | "stale";

export interface ISubpageCard {
  id: string;
  title: string | null;
  status: OrvexPageStatus;
  position: string | null;
  blurb: string | null;
}

export interface ISubpageCardsResponse {
  cards: ISubpageCard[];
  rollup: Record<string, number>;
}

export interface IFreshnessResponse {
  status: OrvexPageStatus;
  tone: FreshnessTone;
  verifiedAgainst: string | null;
  verifiedAt: string | null;
  lastReviewedAt: string | null;
}

export interface IChangelogEntry {
  version: number | null;
  title: string | null;
  createdAt: string;
  authorId: string | null;
}

export interface IChangelogResponse {
  entries: IChangelogEntry[];
  verifiedAgainst: string | null;
  verifiedAt: string | null;
}

export async function getSubpageCards(
  pageId: string,
): Promise<ISubpageCardsResponse> {
  const req = await api.post<ISubpageCardsResponse>(
    "/orvex/page-visuals/subpage-cards",
    { pageId },
  );
  return req.data;
}

export async function getPageFreshness(
  pageId: string,
): Promise<IFreshnessResponse> {
  const req = await api.post<IFreshnessResponse>(
    "/orvex/page-visuals/freshness",
    { pageId },
  );
  return req.data;
}

export async function getPageChangelog(
  pageId: string,
  limit = 20,
): Promise<IChangelogResponse> {
  const req = await api.post<IChangelogResponse>(
    "/orvex/page-visuals/changelog",
    { pageId, limit },
  );
  return req.data;
}
