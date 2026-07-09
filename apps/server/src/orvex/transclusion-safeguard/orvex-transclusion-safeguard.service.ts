// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { executeTx } from '../../database/utils';
import { PageTransclusionReferencesRepo } from '../../database/repos/page-transclusions/page-transclusion-references.repo';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { TransclusionReferencesActiveException } from './exceptions/transclusion-references-active.exception';
import {
  TransclusionConflictMode,
  TransclusionEnforceContext,
  TransclusionImpactReport,
  TransclusionOperation,
  TransclusionReferenceDto,
} from './transclusion-safeguard.types';

/** AC4 — up to 100 impacted slugIds are named on the force-delete audit row. */
const FORCE_DELETE_AUDIT_SLUG_LIMIT = 100;

/**
 * OrvexTransclusionSafeguardService — ported from the fork at pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`apps/server/src/orvex/transclusion-safeguard/orvex-transclusion-safeguard.service.ts`
 * L37-72 `computeImpact`, L81-152 `enforceOrUnsync`).
 *
 * The deep module (CS §3): a two-method public surface
 * (`computeImpact`/`enforceOrUnsync`) hiding the live-reference join, the
 * four-mode verdict state machine, and the all-or-nothing unsync
 * transaction. Callers (the impact controller, the write-block
 * interceptor) are thin.
 */
@Injectable()
export class OrvexTransclusionSafeguardService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageTransclusionReferencesRepo: PageTransclusionReferencesRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /**
   * AC1 — inner-joins `page_transclusion_references` (aliased `ptr`) to
   * `pages` (aliased `refPage`) scoped to `sourcePageId = pageId`, counting
   * only rows whose reference page is still live (`refPage.deletedAt IS
   * NULL`). `canForce` is true iff the guarded operation is itself
   * `permanent-delete`.
   */
  async computeImpact(
    pageId: string,
    operation: TransclusionOperation,
  ): Promise<TransclusionImpactReport> {
    const rows = await this.db
      .selectFrom('pageTransclusionReferences as ptr')
      .innerJoin('pages as refPage', 'refPage.id', 'ptr.referencePageId')
      .select([
        'ptr.referencePageId as referencePageId',
        'ptr.transclusionId as transclusionId',
        'refPage.title as referencePageTitle',
        'refPage.slugId as referencePageSlugId',
      ])
      .where('ptr.sourcePageId', '=', pageId)
      .where('refPage.deletedAt', 'is', null)
      .execute();

    const references: TransclusionReferenceDto[] = rows.map((row) => ({
      referencePageId: row.referencePageId,
      referencePageTitle: (row.referencePageTitle as string | null) ?? null,
      referencePageSlugId: row.referencePageSlugId,
      transclusionId: row.transclusionId,
    }));

    return {
      pageId,
      operation,
      activeReferenceCount: references.length,
      canForce: operation === 'permanent-delete',
      references,
    };
  }

  /**
   * AC2-AC5 — the write-block verdict + enforcement.
   *
   * - `activeReferenceCount === 0` — fast path: no throw, no write, no
   *   audit, in ANY mode (AC5).
   * - `mode === 'force'` — only legal when `operation === 'permanent-delete'`
   *   (else 400); on permanent-delete it logs ONE critical
   *   `TRANSCLUSION_FORCE_DELETE` audit event (impacted slugIds, capped at
   *   100) and returns WITHOUT deleting the reference rows (AC4).
   * - `mode === 'block'` (default) — throws `TransclusionReferencesActiveException`
   *   (409) and mutates nothing (AC2).
   * - `mode === 'unsync'` — deletes exactly the live reference rows in ONE
   *   transaction (all-or-nothing), then emits one
   *   `TRANSCLUSION_REFERENCE_UNSYNCED` audit event per deleted row (AC3).
   */
  async enforceOrUnsync(
    pageId: string,
    operation: TransclusionOperation,
    mode: TransclusionConflictMode = 'block',
    context: TransclusionEnforceContext,
  ): Promise<TransclusionImpactReport> {
    const impact = await this.computeImpact(pageId, operation);

    if (impact.activeReferenceCount === 0) {
      return impact;
    }

    if (mode === 'force') {
      if (operation !== 'permanent-delete') {
        throw new BadRequestException(
          "'force' mode is only allowed for permanent-delete operations",
        );
      }

      await this.auditService.logWithContext(
        {
          event: AuditEvent.TRANSCLUSION_FORCE_DELETE,
          resourceType: AuditResource.PAGE,
          resourceId: pageId,
          metadata: {
            critical: true,
            impactedSlugIds: impact.references
              .slice(0, FORCE_DELETE_AUDIT_SLUG_LIMIT)
              .map((ref) => ref.referencePageSlugId),
          },
        },
        {
          workspaceId: context.workspaceId,
          actorId: context.actorId,
          actorType: context.actorType,
        },
      );

      return impact;
    }

    if (mode === 'block') {
      throw new TransclusionReferencesActiveException(impact);
    }

    // mode === 'unsync' — all-or-nothing transactional delete, then audit.
    await executeTx(this.db, async (trx) => {
      for (const ref of impact.references) {
        await this.pageTransclusionReferencesRepo.deleteOne(
          ref.referencePageId,
          pageId,
          ref.transclusionId,
          trx,
        );
      }
    });

    for (const ref of impact.references) {
      await this.auditService.logWithContext(
        {
          event: AuditEvent.TRANSCLUSION_REFERENCE_UNSYNCED,
          resourceType: AuditResource.PAGE,
          resourceId: ref.referencePageId,
          metadata: {
            sourcePageId: pageId,
            transclusionId: ref.transclusionId,
            reason: operation,
          },
        },
        {
          workspaceId: context.workspaceId,
          actorId: context.actorId,
          actorType: context.actorType,
        },
      );
    }

    return impact;
  }
}
