// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { dbOrTx } from '../../database/utils';

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
}
