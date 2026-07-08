// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { PageStatus } from '@orvex/extensions';
import { extractTldrText } from '../page-blocks/page-blocks-utils';

/**
 * ENG-1376 — ported (re-authored, behavior-parity) from the fork's
 * `orvex-page-visuals.controller.ts#L37-L264`. Split here into a thin
 * controller (guard + CASL + delegate, see
 * {@link ../orvex-page-visuals.controller}) and this service, which holds
 * the actual read projections — each is ONE indexed Kysely query resolved
 * via the `orvex_page_meta` LEFT JOIN (ruling 4 / AC7), never the dropped
 * `pages` governance columns.
 *
 * CS §6 — pure read projections: no `Date.now()`/`Math.random`, every
 * timestamp returned here comes straight off a row (❌#9).
 */

export const VISIBLE_STATUSES: readonly PageStatus[] = [
  PageStatus.CANONICAL,
  PageStatus.DRAFT,
];

export type FreshnessTone = 'draft' | 'archived' | 'fresh' | 'stale';

export interface SubpageCard {
  id: string;
  title: string | null;
  status: PageStatus;
  position: string | null;
  blurb: string | null;
}

export interface SubpageCardsResult {
  cards: SubpageCard[];
  rollup: Record<string, number>;
}

export interface FreshnessResult {
  status: PageStatus;
  tone: FreshnessTone;
  verifiedAgainst: string | null;
  verifiedAt: Date | null;
  lastReviewedAt: Date | null;
}

export interface ChangelogEntry {
  version: number | null;
  title: string | null;
  createdAt: Date;
  authorId: string | null;
}

export interface ChangelogResult {
  entries: ChangelogEntry[];
  verifiedAgainst: string | null;
  verifiedAt: Date | null;
}

const ARCHIVED_TONE_STATUSES: readonly PageStatus[] = [
  PageStatus.SUPERSEDED,
  PageStatus.ARCHIVED,
  PageStatus.DEPRECATED,
];

@Injectable()
export class OrvexPageVisualsService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * AC1/AC2/AC3 — status-filtered subpage cards with tldr blurbs and a
   * status rollup. ONE LEFT JOIN query (AC7/AC9 — indexed on
   * `pages.position` / `orvex_page_meta` pkey), ordered by `position` so
   * the visible-status filter (done in-process — a page with no meta row
   * defaults to `draft`, which is itself visible, so the default can never
   * silently hide a real child — AC8) preserves document order.
   */
  async subpageCards(parentPageId: string): Promise<SubpageCardsResult> {
    const children = await this.db
      .selectFrom('pages')
      .leftJoin('orvexPageMeta', 'orvexPageMeta.pageId', 'pages.id')
      .select([
        'pages.id as id',
        'pages.title as title',
        'pages.content as content',
        'pages.position as position',
        'orvexPageMeta.status as status',
      ])
      .where('pages.parentPageId', '=', parentPageId)
      .where('pages.deletedAt', 'is', null)
      .orderBy('pages.position', 'asc')
      .execute();

    const rollup: Record<string, number> = {};
    const cards: SubpageCard[] = [];

    for (const child of children) {
      const status = (child.status as PageStatus | null) ?? PageStatus.DRAFT;
      if (!VISIBLE_STATUSES.includes(status)) {
        continue;
      }

      cards.push({
        id: child.id,
        title: child.title,
        status,
        position: child.position,
        blurb: extractTldrText(child.content),
      });
      rollup[status] = (rollup[status] ?? 0) + 1;
    }

    return { cards, rollup };
  }

  /**
   * AC4 — freshness tone. `canonical` requires BOTH `verifiedAgainst` and
   * `lastReviewedAt` to read `fresh`; missing either => `stale`. `draft`
   * always reads `draft`; `superseded`/`archived`/`deprecated` always read
   * `archived`. `published` (not covered by the named AC matrix) is graded
   * by the same evidence rule as `canonical` — it is a live/visible status
   * so "fresh" must still be earned by real verify stamps, never assumed.
   */
  async freshness(pageId: string): Promise<FreshnessResult> {
    const row = await this.db
      .selectFrom('pages')
      .leftJoin('orvexPageMeta', 'orvexPageMeta.pageId', 'pages.id')
      .select([
        'orvexPageMeta.status as status',
        'orvexPageMeta.verifiedAgainst as verifiedAgainst',
        'orvexPageMeta.verifiedAt as verifiedAt',
        'orvexPageMeta.lastReviewedAt as lastReviewedAt',
      ])
      .where('pages.id', '=', pageId)
      .executeTakeFirst();

    const status = (row?.status as PageStatus | null) ?? PageStatus.DRAFT;
    const verifiedAgainst = row?.verifiedAgainst ?? null;
    const verifiedAt = row?.verifiedAt ?? null;
    const lastReviewedAt = row?.lastReviewedAt ?? null;

    let tone: FreshnessTone;
    if (status === PageStatus.DRAFT) {
      tone = 'draft';
    } else if (ARCHIVED_TONE_STATUSES.includes(status)) {
      tone = 'archived';
    } else if (verifiedAgainst && lastReviewedAt) {
      tone = 'fresh';
    } else {
      tone = 'stale';
    }

    return { status, tone, verifiedAgainst, verifiedAt, lastReviewedAt };
  }

  /**
   * AC5 — read-only changelog projection: up to `limit` (clamped 1..100)
   * `page_history` entries newest-first, plus the current verify stamps.
   * Deliberately carries no content/body field (closes the P4 forgeable
   * "history block" leak).
   */
  async changelog(pageId: string, limit?: number): Promise<ChangelogResult> {
    const clamped = Math.min(100, Math.max(1, limit ?? 20));

    const [entries, meta] = await Promise.all([
      this.db
        .selectFrom('pageHistory')
        .select(['version', 'title', 'createdAt', 'lastUpdatedById'])
        .where('pageId', '=', pageId)
        .orderBy('createdAt', 'desc')
        .limit(clamped)
        .execute(),
      this.db
        .selectFrom('orvexPageMeta')
        .select(['verifiedAgainst', 'verifiedAt'])
        .where('pageId', '=', pageId)
        .executeTakeFirst(),
    ]);

    return {
      entries: entries.map((e) => ({
        version: e.version,
        title: e.title,
        createdAt: e.createdAt,
        authorId: e.lastUpdatedById,
      })),
      verifiedAgainst: meta?.verifiedAgainst ?? null,
      verifiedAt: meta?.verifiedAt ?? null,
    };
  }
}
