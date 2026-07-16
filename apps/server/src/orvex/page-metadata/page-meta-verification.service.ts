// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { dbOrTx } from '../../database/utils';
import { jsonToMarkdown } from '../../collaboration/collaboration.util';
import { computeContentHash } from '../../common/helpers/content-hash';

/** The one-round-trip drift-verify seed wiki-api's `GET .../verify-context`
 * reads (VerifyContext wire shape): the rendered body + a HEAD identifier to
 * hash/stamp, and the last verified baseline hash. `canEdit` is resolved by
 * the controller (CASL), not here. */
export interface VerifyContextSeed {
  currentBody: string;
  headSha: string;
  lastVerifiedHash: string;
  lastVerifiedFound: boolean;
}

/** One drifted-page row for wiki-api's `GET .../stamps` (GetDrift AC4). */
export interface DriftedStamp {
  page_id: string;
  verified_against: string;
}

/**
 * A sentinel HEAD identifier that never equals a real content hash. The
 * standalone-wiki drift mode ("sha", no git repo) has no single global HEAD
 * SHA every page compares against — so the engine computes per-page drift
 * itself (`verified_against <> content_hash`) and returns ONLY the drifted
 * pages, each carrying its real `verified_against` (≠ this sentinel). wiki-api's
 * `GetDrift(headSha, pages)` — "drifted = verified_against != headSha" — then
 * yields exactly that set, with no global HEAD the engine cannot honestly mint.
 */
export const ENGINE_DRIFT_HEAD_SENTINEL = '__engine_content_head__';

/**
 * ENG-1379 — thin stamp+read accessor for the `verified_against`/
 * `verified_at` drift-stamp fields on the `orvex_page_meta` side table
 * (ruling 4).
 *
 * SCOPE NOTE (CS §11 honesty — see the named DoD spec's file header for the
 * full account): this repo's `pages` table has never carried
 * `verified_against`/`verified_at` (they were added fresh, directly onto
 * `orvex_page_meta`, by ENG-1371's
 * `20260708T100000-orvex-page-meta-governance-cols.ts`), and
 * `apps/server/src/orvex/drift/**` (`OrvexDriftService`/
 * `OrvexDriftController`/`ForceNewTokenService`) has never existed in this
 * repo. So there is no `pages` column to drop and no drift module to
 * delete here — three prior non-claiming capacity-fill comments on this
 * ticket already flagged that premise mismatch. What genuinely did not
 * exist before this leg, and is what this file adds, is a DEDICATED,
 * additive-only, typed accessor for just these two fields — separate from
 * the omnibus `OrvexPageMetadataService.applyMetadata`/`getMetadata`
 * surface — so that the drift-verification decision logic being re-homed
 * to `orvex-wiki-api` (D-S8) has a small, stable persistence seam to call
 * into, per CS §3's small-interface / one-adapter guidance.
 *
 * Deletion test (CS §3.1): this accessor persists/reads exactly two
 * fields — no body-delta split, no audit emission, no HEAD-SHA comparison.
 * That logic belongs to wiki-api's future `OrvexDriftService`, not here.
 */
@Injectable()
export class PageMetaVerificationService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * AC1/AC5 — stamps `verifiedAgainst`/`verifiedAt` onto the caller's page,
   * upserting the `orvex_page_meta` row (lazily creating it) when none
   * exists yet.
   */
  async stampVerification(
    input: { pageId: string; verifiedAgainst: string; verifiedAt: Date },
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    const page = await db
      .selectFrom('pages')
      .select(['id', 'workspaceId'])
      .where('id', '=', input.pageId)
      .executeTakeFirst();

    if (!page) {
      throw new Error(`PAGE_NOT_FOUND: ${input.pageId}`);
    }

    await db
      .insertInto('orvexPageMeta')
      .values({
        pageId: input.pageId,
        workspaceId: page.workspaceId,
        verifiedAgainst: input.verifiedAgainst,
        verifiedAt: input.verifiedAt,
      })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          verifiedAgainst: input.verifiedAgainst,
          verifiedAt: input.verifiedAt,
          updatedAt: sql`now()`,
        }),
      )
      .execute();
  }

  /**
   * AC2/AC7 — reads the verification stamp via a join on `orvex_page_meta`
   * only. Returns `null` (never throws) when no meta row exists yet, or the
   * row exists but has not been stamped — an additive-only, concrete typed
   * result, never `any`.
   */
  async getVerification(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<{ verifiedAgainst: string; verifiedAt: Date } | null> {
    const db = dbOrTx(this.db, trx);

    const meta = await db
      .selectFrom('orvexPageMeta')
      .select(['verifiedAgainst', 'verifiedAt'])
      .where('pageId', '=', pageId)
      .executeTakeFirst();

    if (!meta || meta.verifiedAgainst === null || meta.verifiedAt === null) {
      return null;
    }

    return {
      verifiedAgainst: meta.verifiedAgainst,
      verifiedAt: meta.verifiedAt,
    };
  }

  /**
   * Assembles the drift verify-context seed for a page (amazing-MCP drift-502
   * fix) — the engine leg wiki-api's `GET /api/orvex/page-meta/:id/
   * verify-context` reads. Workspace-scoped (never leaks a page outside the
   * caller's tenant): returns `null` when the page is absent/deleted or not in
   * `workspaceId`, so the controller answers 404 (no-leak). In standalone
   * "sha" drift mode the HEAD identifier is the page's own current content
   * hash (`computeContentHash` — the SAME hash the write chokepoint stores as
   * `orvex_page_meta.content_hash`), so verifying stamps `verified_against` =
   * that hash and a later edit (new content hash) reads as drift.
   */
  async getVerifyContext(
    pageId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<VerifyContextSeed | null> {
    const db = dbOrTx(this.db, trx);

    const page = await db
      .selectFrom('pages')
      .select(['id', 'content'])
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!page) {
      return null;
    }

    const content = (page.content ?? { type: 'doc', content: [] }) as object;
    const headSha = computeContentHash(content);
    const currentBody = page.content ? jsonToMarkdown(page.content) : '';

    const verification = await this.getVerification(pageId, trx);

    return {
      currentBody,
      headSha,
      lastVerifiedHash: verification?.verifiedAgainst ?? '',
      lastVerifiedFound: verification !== null,
    };
  }

  /**
   * Lists the workspace's DRIFTED pages (amazing-MCP drift-502 fix) — the
   * engine leg wiki-api's `GET /api/orvex/page-meta/stamps` reads. A page is
   * drifted when it was verified against a content hash that no longer matches
   * its current `content_hash` (`verified_against <> content_hash`). Only
   * genuinely-drifted, stamped pages are returned; in-sync and never-verified
   * pages are omitted (not drifted). Workspace-scoped join (tenancy preserved).
   *
   * Honest limitation: `content_hash` is maintained by the CAS write chokepoint
   * (`apply-ops`/`apply-doc`/integer-CAS `update`); a page mutated ONLY through
   * the live collab editor may carry a stale `content_hash`, so its drift is
   * assessed against the last chokepoint write. Pages with no `content_hash`
   * yet are treated as not-assessable (omitted), never falsely reported.
   */
  async listDriftedStamps(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<DriftedStamp[]> {
    const db = dbOrTx(this.db, trx);

    const rows = await db
      .selectFrom('orvexPageMeta as pm')
      .innerJoin('pages as p', 'p.id', 'pm.pageId')
      .select(['pm.pageId as pageId', 'pm.verifiedAgainst as verifiedAgainst'])
      .where('pm.workspaceId', '=', workspaceId)
      .where('p.deletedAt', 'is', null)
      .where('pm.verifiedAgainst', 'is not', null)
      .where('pm.contentHash', 'is not', null)
      .whereRef('pm.verifiedAgainst', '<>', 'pm.contentHash')
      .execute();

    return rows.map((r) => ({
      page_id: r.pageId,
      verified_against: r.verifiedAgainst as string,
    }));
  }
}
