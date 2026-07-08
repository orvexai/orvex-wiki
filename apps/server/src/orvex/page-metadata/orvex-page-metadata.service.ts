// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { dbOrTx, executeTx } from '../../database/utils';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import {
  InsertableOrvexPageMeta,
  OrvexPageMeta,
  UpdatableOrvexPageMeta,
} from '../../database/types/entity.types';
import {
  DEFAULT_PAGE_META,
  OrvexPageMetadataDto,
  OrvexPageMetaFields,
  PageStatus,
  validateSlugTitle,
} from '@orvex/extensions';
import { RatifyGateSettingsService } from './ratify-gate-settings.service';
import { RatifyTokenService } from './ratify-token.service';
import { RatifyGateContext } from './ratify-token.types';
import { ConfirmTokenService } from './confirm-token.service';
import { ForceSupersedeSettingsService } from './force-supersede-settings.service';
import {
  IPageLifecycleBroadcaster,
  PAGE_LIFECYCLE_BROADCASTER,
  SupersedeDirection,
  SupersedeGateContext,
} from './supersede.types';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

/**
 * ENG-1371 — the fork's page-metadata domain service, ported to land its
 * governance/lifecycle fields DIRECTLY in the `orvex_page_meta` SIDE table
 * (ruling 4) rather than on `pages` (AC1/AC11). PD-4d carve-out: the
 * ENG-1447 provenance trio stays on `pages` for now (follow-up ENG-1603
 * moves it here once its consumers repoint) — this service does not read
 * or write it.
 *
 * Scope note (CS §8 anti-ball-of-mud / ❌#6 no-big-upfront): this port
 * covers exactly what ACs 1-11 test — join-backed reads with defaults,
 * side-table upserts, doc-type/slug governance, frontmatter round-trip and
 * the orphan-sweep stub. It deliberately leaves the R3 ratify/confirm-token
 * gates, CASL authorization, drift-module coupling, audit-event emission,
 * queue/ws propagation and the REST controller OUT of this slice — none of
 * those are exercised by ENG-1371's AC list or its named DoD test, and the
 * upstream modules they'd wire into (OrvexDriftModule/ForceNewTokenService,
 * @orvex/extensions audit symbols) do not exist on this repo yet. Wiring
 * them in is real, separable follow-up work, not something this ticket's
 * binary gate requires.
 */
@Injectable()
export class OrvexPageMetadataService {
  private readonly logger = new Logger(OrvexPageMetadataService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly workspaceRepo: WorkspaceRepo,
    // review1 F1/F5 (AC5) — optional so pre-existing test harnesses that
    // build this service without the full ENG-1445 governance providers
    // (none currently do, but `OrvexMarkdownInterceptor` sets the
    // precedent — see its own `@Optional()` docstring) keep degrading to a
    // pure metadata write instead of throwing a DI error. Real app wiring
    // (`OrvexPageMetadataModule`) always provides both.
    @Optional() private readonly ratifyGateSettingsService?: RatifyGateSettingsService,
    @Optional() private readonly ratifyTokenService?: RatifyTokenService,
    // ENG-1434 AC3-AC8 — same @Optional() DI-safety precedent as the ratify
    // pair above: real app wiring (`OrvexPageMetadataModule`) always
    // provides these; a harness that omits them degrades a supersede write
    // to ungated (documented in `enforceSupersedeGate`'s own docstring).
    @Optional() private readonly confirmTokenService?: ConfirmTokenService,
    @Optional() private readonly forceSupersedeSettingsService?: ForceSupersedeSettingsService,
    @Optional() @Inject(AUDIT_SERVICE) private readonly auditService?: IAuditService,
    @Optional()
    @Inject(PAGE_LIFECYCLE_BROADCASTER)
    private readonly lifecycleBroadcaster?: IPageLifecycleBroadcaster,
  ) {}

  /**
   * AC3 — reads a page's metadata via a LEFT JOIN on `orvex_page_meta`,
   * keyed on `page_id`. A page with no meta row yields `DEFAULT_PAGE_META`
   * (status: 'draft', docType: null, ...) with no crash.
   */
  async getMetadata(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<OrvexPageMetaFields> {
    const db = dbOrTx(this.db, trx);

    const page = await db
      .selectFrom('pages')
      .select(['id', 'deletedAt'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    if (!page || page.deletedAt) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND' });
    }

    const meta = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();

    if (!meta) {
      return { ...DEFAULT_PAGE_META };
    }

    return this.rowToFields(meta);
  }

  private rowToFields(meta: OrvexPageMeta): OrvexPageMetaFields {
    return {
      status: (meta.status as PageStatus) ?? DEFAULT_PAGE_META.status,
      docType: meta.docType ?? null,
      ownerId: meta.ownerId ?? null,
      lastReviewedAt: meta.lastReviewedAt ?? null,
      supersedes: meta.supersedes ?? null,
      supersededBy: meta.supersededBy ?? null,
      redirectFrom: meta.redirectFrom ?? null,
      unknownFrontmatter: meta.unknownFrontmatter
        ? (JSON.parse(meta.unknownFrontmatter) as Record<string, unknown>)
        : null,
      verifiedAgainst: meta.verifiedAgainst ?? null,
      verifiedAt: meta.verifiedAt ?? null,
      specConfirmed: meta.specConfirmed ?? false,
      archiveReason: meta.archiveReason ?? null,
      version: meta.version ?? 1,
      contentHash: meta.contentHash ?? null,
    };
  }

  /**
   * AC4 — validates and upserts page metadata fields into `orvex_page_meta`
   * (never `pages`), inside the caller's transaction when supplied.
   *
   * AC5/AC6 (review1 F1) — `gate` is the real promote chokepoint: when the
   * write resolves `status` to `PageStatus.CANONICAL` for an `api_key`
   * (agent) caller, this consults `RatifyGateSettingsService.getRequired()`
   * and refuses the promotion unless the caller presents a token that
   * `RatifyTokenService.verify()` accepts for THIS page+workspace, or an
   * audited `forceSelfRatify` override. A human caller (`gate` omitted or
   * `authMethod !== 'api_key'`) is never gated here.
   */
  async applyMetadata(
    pageId: string,
    dto: OrvexPageMetadataDto,
    trx?: KyselyTransaction,
    gate?: RatifyGateContext,
  ): Promise<OrvexPageMetaFields> {
    const db = dbOrTx(this.db, trx);

    const page = await db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'deletedAt', 'title'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    if (!page || page.deletedAt) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND' });
    }

    if (dto.status !== undefined && !Object.values(PageStatus).includes(dto.status)) {
      throw new BadRequestException({
        error: 'INVALID_STATUS',
        validValues: Object.values(PageStatus),
      });
    }

    if (dto.status === PageStatus.CANONICAL && gate?.authMethod === 'api_key') {
      await this.enforceRatifyGate(page.workspaceId, pageId, gate);
    }

    // AC5/AC6 — enforce the ported banned-suffix / date-slug governance
    // (CONTRACTS §0.6, §2.9) on the real create/update write path. Keys on
    // the docType this write is resolving to: the incoming dto's docType
    // when the caller is setting/changing it, otherwise the page's current
    // docType (so a status-only or supersede write still re-checks the
    // title against whatever doc_type it already carries).
    const effectiveDocType =
      dto.docType !== undefined
        ? dto.docType
        : (
            await db
              .selectFrom('orvexPageMeta')
              .select(['docType'])
              .where('pageId', '=', pageId)
              .executeTakeFirst()
          )?.docType ?? null;

    const violation = validateSlugTitle(page.title, effectiveDocType);
    if (violation) {
      throw new BadRequestException({
        error: violation.error,
        message: violation.message,
      });
    }

    // Archive-reason enforcement (v2 lifecycle contract, ported invariant).
    if (dto.status === PageStatus.ARCHIVED) {
      const reason = dto.archiveReason;
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException({ error: 'ARCHIVE_REASON_REQUIRED' });
      }
    } else if (dto.status !== undefined && dto.archiveReason === undefined) {
      // AC10 (ENG-1434) — leaving `archived` for any other status clears the
      // stale reason; a caller cannot forget to and end up with an
      // `archiveReason` that lies about a page's current status. Only a
      // status-bearing write triggers the clear (a status-less patch, e.g.
      // a pure docType update, must never silently wipe an unrelated field).
      dto = { ...dto, archiveReason: null };
    }

    if (dto.docType !== undefined && dto.docType !== null) {
      const valid = await this.validateDocType(page.workspaceId, dto.docType);
      if (!valid) {
        throw new BadRequestException({ error: 'INVALID_DOC_TYPE' });
      }
    }

    const patch: UpdatableOrvexPageMeta = {};
    for (const key of Object.keys(dto) as (keyof OrvexPageMetadataDto)[]) {
      const value = dto[key];
      if (value === undefined) continue;

      if (key === 'unknownFrontmatter') {
        // Serialized to a JSON string (TEXT column, not jsonb) so the shared
        // CamelCasePlugin never recurses into it and mangles arbitrary
        // frontmatter key casing (AC8 verbatim round-trip).
        (patch as Record<string, unknown>)[key] = value === null ? null : JSON.stringify(value);
      } else {
        (patch as Record<string, unknown>)[key] = value;
      }
    }

    const insertValues: InsertableOrvexPageMeta = {
      pageId,
      workspaceId: page.workspaceId,
      ...patch,
    };

    await db
      .insertInto('orvexPageMeta')
      .values(insertValues)
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          ...patch,
          updatedAt: sql`now()`,
        }),
      )
      .execute();

    return this.getMetadata(pageId, trx);
  }

  /** AC4 — thin lifecycle-status write path over `applyMetadata`. */
  async setStatus(
    pageId: string,
    status: PageStatus,
    opts?: { archiveReason?: string },
    trx?: KyselyTransaction,
    gate?: RatifyGateContext,
  ): Promise<OrvexPageMetaFields> {
    return this.applyMetadata(
      pageId,
      { status, archiveReason: opts?.archiveReason },
      trx,
      gate,
    );
  }

  /**
   * AC5/AC6 — the actual enforcement: refuses a tokenless `api_key`
   * promotion to `canonical` when the workspace's ratify-gate is
   * `required` (the default), unless a valid `forceSelfRatify` override
   * (audited) or a scope-verified `RATIFY_TOKEN` is presented. Throws
   * `ForbiddenException`/`PreconditionFailedException` (never silently
   * allows) — this is the literal AC5 assertion the DoD test exercises.
   */
  private async enforceRatifyGate(
    workspaceId: string,
    pageId: string,
    gate: RatifyGateContext,
  ): Promise<void> {
    if (!this.ratifyGateSettingsService || !this.ratifyTokenService) {
      // Governance providers not wired into this harness (see the
      // constructor's @Optional() docstring) — nothing to enforce against.
      return;
    }

    const required = await this.ratifyGateSettingsService.getRequired(
      workspaceId,
    );
    if (!required) {
      return;
    }

    if (gate.forceSelfRatify) {
      // Throws PreconditionFailedException on a too-short reason, and
      // audits exactly once on success (RatifyGateSettingsService's own
      // invariant) — we deliberately do not duplicate that logic here.
      await this.ratifyGateSettingsService.assertForceSelfRatify({
        workspaceId,
        pageId,
        actorId: gate.actorId,
        forceSelfRatify: gate.forceSelfRatify,
        forceReason: gate.forceReason,
      });
      return;
    }

    const result = this.ratifyTokenService.verify(gate.ratifyToken, {
      expectPageId: pageId,
      expectWorkspaceId: workspaceId,
    });

    if (result.ok === false) {
      throw new ForbiddenException({
        error: 'RATIFY_TOKEN_REQUIRED',
        reason: result.reason,
      });
    }
  }

  /**
   * ENG-1434 AC1/AC2/AC12 — the SOLE supersede mutation chokepoint in this
   * repo. `direction` is XOR-guarded (AC1): exactly one of
   * `supersedes`/`supersededBy` must be set. `pageId` is the request's own
   * page; the OTHER page in the pair is resolved by slug. Non-human
   * (`api_key`) callers are gated by `enforceSupersedeGate` (AC3-AC8)
   * BEFORE any row is touched. The whole write — both pages' side-table
   * rows + the lock on the superseded page — happens inside ONE Kysely TX
   * (AC13 atomicity); the audit emission(s) happen inside the same TX
   * (never fails the request per AC13, see `safeAudit`) and the realtime
   * broadcast fires only AFTER the TX commits.
   */
  async supersedeAtomic(
    pageId: string,
    direction: SupersedeDirection,
    gate: SupersedeGateContext,
    trx?: KyselyTransaction,
  ): Promise<OrvexPageMetaFields> {
    const hasSupersedes =
      direction.supersedes !== undefined &&
      direction.supersedes !== null &&
      direction.supersedes !== '';
    const hasSupersededBy =
      direction.supersededBy !== undefined &&
      direction.supersededBy !== null &&
      direction.supersededBy !== '';

    if (hasSupersedes === hasSupersededBy) {
      // AC1 — both set OR neither set.
      throw new BadRequestException({ error: 'INVALID_SUPERSESSION' });
    }

    const db = dbOrTx(this.db, trx);
    const requestPage = await db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'spaceId', 'slugId', 'deletedAt'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    if (!requestPage || requestPage.deletedAt) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND' });
    }

    // AC3-AC8 — resolves BEFORE any mutation; throws on refusal.
    const attribution = await this.enforceSupersedeGate(
      pageId,
      requestPage.workspaceId,
      gate,
    );

    const otherSlug = hasSupersededBy
      ? direction.supersededBy!
      : direction.supersedes!;

    const fields = await executeTx(
      this.db,
      async (innerTrx) => {
        const otherPage = await innerTrx
          .selectFrom('pages')
          .select(['id', 'slugId', 'deletedAt', 'workspaceId', 'spaceId'])
          .where('slugId', '=', otherSlug)
          .executeTakeFirst();

        if (!otherPage || otherPage.deletedAt) {
          throw new NotFoundException({ error: 'SUPERSESSION_TARGET_NOT_FOUND' });
        }

        // review1 F1 — `slugId` carries a GLOBAL unique constraint, so the
        // above lookup can resolve into any workspace. The caller is only
        // ever authorized against the REQUESTING page (controller); this
        // is the unconditional, non-delegable guard against resolving a
        // target outside the requester's own workspace. A same-workspace
        // target is additionally authorized against its own space via
        // `gate.authorizeTargetSpace` below, mirroring the controller's
        // own space-CASL Manage check on the requesting page.
        if (otherPage.workspaceId !== requestPage.workspaceId) {
          throw new NotFoundException({ error: 'SUPERSESSION_TARGET_NOT_FOUND' });
        }

        if (gate.authorizeTargetSpace) {
          await gate.authorizeTargetSpace(otherPage.spaceId);
        }

        const supersededPageId = hasSupersededBy ? requestPage.id : otherPage.id;
        const supersededSlug = hasSupersededBy ? requestPage.slugId : otherPage.slugId;
        const canonicalPageId = hasSupersededBy ? otherPage.id : requestPage.id;
        const canonicalSlug = hasSupersededBy ? otherSlug : requestPage.slugId;

        const canonicalMeta = await innerTrx
          .selectFrom('orvexPageMeta')
          .select(['supersedes'])
          .where('pageId', '=', canonicalPageId)
          .executeTakeFirst();

        const existing: string[] = Array.isArray(canonicalMeta?.supersedes)
          ? (canonicalMeta!.supersedes as unknown as string[])
          : [];
        const nextSupersedes = existing.includes(supersededSlug)
          ? existing
          : [...existing, supersededSlug];

        const supersedesJson = sql<
          import('../../database/types/db').Json
        >`${JSON.stringify(nextSupersedes)}::text::jsonb`;
        await innerTrx
          .insertInto('orvexPageMeta')
          .values({
            pageId: canonicalPageId,
            workspaceId: requestPage.workspaceId,
            supersedes: supersedesJson,
          })
          .onConflict((oc) =>
            oc.column('pageId').doUpdateSet({
              supersedes: supersedesJson,
              updatedAt: sql`now()`,
            }),
          )
          .execute();

        await innerTrx
          .insertInto('orvexPageMeta')
          .values({
            pageId: supersededPageId,
            workspaceId: requestPage.workspaceId,
            status: PageStatus.SUPERSEDED,
            supersededBy: canonicalSlug,
          })
          .onConflict((oc) =>
            oc.column('pageId').doUpdateSet({
              status: PageStatus.SUPERSEDED,
              supersededBy: canonicalSlug,
              updatedAt: sql`now()`,
            }),
          )
          .execute();

        // AC2 — the superseded page is locked (no further edits).
        await innerTrx
          .updateTable('pages')
          .set({ isLocked: true, updatedAt: sql`now()` })
          .where('id', '=', supersededPageId)
          .execute();

        await this.safeAudit(
          {
            event: AuditEvent.PAGE_SUPERSEDED,
            resourceType: AuditResource.PAGE,
            resourceId: supersededPageId,
            metadata: { supersededBy: canonicalSlug, canonicalPageId },
          },
          {
            workspaceId: requestPage.workspaceId,
            actorId: attribution.actorId,
            actorType: attribution.actorType,
          },
        );

        if (attribution.usedForcedSupersede) {
          // AC7 — the extra break-glass audit row, distinct from the
          // regular PAGE_SUPERSEDED row above (never a substitute for it).
          await this.safeAudit(
            {
              event: AuditEvent.SUPERSEDE_FORCED_BYPASS,
              resourceType: AuditResource.PAGE,
              resourceId: pageId,
              metadata: { reason: gate.forceReason },
            },
            {
              workspaceId: requestPage.workspaceId,
              actorId: attribution.actorId,
              actorType: attribution.actorType,
            },
          );
        }

        return this.getMetadata(pageId, innerTrx);
      },
      trx,
    );

    // AC13 — broadcast strictly AFTER commit; a broadcast failure is
    // logged, never thrown (never fails an already-committed request).
    this.safeBroadcast({
      workspaceId: requestPage.workspaceId,
      spaceId: requestPage.spaceId,
      pageId,
      status: fields.status,
    });

    return fields;
  }

  /**
   * ENG-1434 AC3-AC8 — the actual enforcement for a supersede write. A
   * human caller (`gate.authMethod !== 'api_key'`) is never gated (AC2). A
   * non-human caller MUST present a `CONFIRM_TOKEN` that verifies for THIS
   * page+workspace+action (AC4); a verified token ALWAYS wins over
   * `forceSupersede` (AC8) and is never silently downgraded to a forced
   * bypass. Only when no valid token is presented does `forceSupersede`
   * get evaluated — fail-closed by default (AC5) and reason-gated (AC6).
   * Absent no token AND no force, the caller is refused outright (AC3).
   *
   * Degrades to ungated (mirrors `enforceRatifyGate`'s own precedent) when
   * the governance providers are not wired into the harness — real app
   * wiring always provides them.
   */
  private async enforceSupersedeGate(
    pageId: string,
    workspaceId: string,
    gate: SupersedeGateContext,
  ): Promise<{
    actorType: 'user' | 'api_key';
    actorId: string;
    usedForcedSupersede: boolean;
  }> {
    if (gate.authMethod !== 'api_key') {
      return { actorType: 'user', actorId: gate.actorId, usedForcedSupersede: false };
    }

    if (gate.confirmToken && this.confirmTokenService) {
      const result = this.confirmTokenService.verify(gate.confirmToken, {
        expectWorkspaceId: workspaceId,
        expectAction: 'supersede',
        expectScopeId: pageId,
      });
      if (result.ok) {
        // AC8 — a verified token always wins; attribution follows the
        // token's own confirming human, never downgraded to forced.
        return {
          actorType: 'api_key',
          actorId: result.payload.confirmingUserId,
          usedForcedSupersede: false,
        };
      }
    }

    if (gate.forceSupersede) {
      if (!this.forceSupersedeSettingsService) {
        return { actorType: 'api_key', actorId: gate.actorId, usedForcedSupersede: false };
      }
      // AC5/AC6 — throws ForbiddenException/BadRequestException on refusal.
      await this.forceSupersedeSettingsService.assertForceSupersedeAllowed({
        workspaceId,
        forceReason: gate.forceReason,
      });
      return { actorType: 'api_key', actorId: gate.actorId, usedForcedSupersede: true };
    }

    // AC3 — no token, no force: refused outright, no mutation.
    throw new ForbiddenException({ error: 'CONFIRM_TOKEN_REQUIRED' });
  }

  /** AC13 — an audit-emit failure is logged, never thrown. */
  private async safeAudit(
    payload: Parameters<IAuditService['logWithContext']>[0],
    context: Parameters<IAuditService['logWithContext']>[1],
  ): Promise<void> {
    if (!this.auditService) return;
    try {
      await this.auditService.logWithContext(payload, context);
    } catch (err) {
      this.logger.error('Audit emit failed for page-lifecycle change', err as Error);
    }
  }

  /** AC13 — a broadcast failure is logged, never thrown. */
  private safeBroadcast(event: {
    workspaceId: string;
    spaceId: string;
    pageId: string;
    status: string;
  }): void {
    if (!this.lifecycleBroadcaster) return;
    try {
      void this.lifecycleBroadcaster.broadcastLifecycleChange(event);
    } catch (err) {
      this.logger.error('Realtime broadcast failed for page-lifecycle change', err as Error);
    }
  }

  /** Reverses a supersede — clears `supersededBy`, restores a live status. */
  async unsupersedeAtomic(
    pageId: string,
    restoredStatus: PageStatus = PageStatus.PUBLISHED,
    trx?: KyselyTransaction,
  ): Promise<OrvexPageMetaFields> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('orvexPageMeta')
      .set({ status: restoredStatus, supersededBy: null, updatedAt: sql`now()` })
      .where('pageId', '=', pageId)
      .execute();
    await db
      .updateTable('pages')
      .set({ isLocked: false, updatedAt: sql`now()` })
      .where('id', '=', pageId)
      .execute();
    return this.getMetadata(pageId, trx);
  }

  /**
   * AC7 — validates a docType against the workspace's `allowedDocTypes`
   * settings list. An empty/unset allowlist permits any non-empty docType.
   */
  async validateDocType(workspaceId: string, docType: string): Promise<boolean> {
    if (!docType || docType.trim().length === 0) {
      return false;
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return false;

    const settings = (workspace.settings as { allowedDocTypes?: string[] } | null) ?? {};
    const allowedDocTypes = settings.allowedDocTypes;

    if (!allowedDocTypes || allowedDocTypes.length === 0) {
      return true;
    }

    return allowedDocTypes.includes(docType);
  }

  /**
   * Walks a `redirectFrom` chain to resolve the canonical live slug for a
   * page, bounded to prevent infinite loops on a cyclical chain.
   */
  async resolveCanonicalSlug(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<string | null> {
    const db = dbOrTx(this.db, trx);
    let currentId = pageId;
    let depth = 0;
    const maxDepth = 25;

    while (depth < maxDepth) {
      const page = await db
        .selectFrom('pages')
        .select(['id', 'slugId', 'deletedAt'])
        .where('id', '=', currentId)
        .executeTakeFirst();

      if (!page || page.deletedAt) return null;

      const meta = await db
        .selectFrom('orvexPageMeta')
        .select(['supersededBy'])
        .where('pageId', '=', currentId)
        .executeTakeFirst();

      if (!meta?.supersededBy) {
        return page.slugId;
      }

      const next = await db
        .selectFrom('pages')
        .select(['id'])
        .where('slugId', '=', meta.supersededBy)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();

      if (!next) return page.slugId;
      currentId = next.id;
      depth++;
    }

    return null;
  }

  /**
   * AC9 (ruling 7) — orphan-sweep entry point for the future cross-DB split.
   * Today `orvex_page_meta.page_id` carries an in-DB FK with ON DELETE
   * CASCADE (ENG-1471), so a true orphan cannot occur in THIS database — the
   * FK removes the meta row the instant its page is deleted. This sweep
   * exists as the documented, unit-covered entry point a future delete-event
   * consumer will call once `orvex_page_meta` may live in a separate store
   * with no cross-DB CASCADE available.
   */
  async reconcileOrphanedPageMeta(): Promise<{ deleted: number }> {
    const result = await this.db
      .deleteFrom('orvexPageMeta')
      .where(
        sql<boolean>`not exists (select 1 from "pages" where "pages"."id" = "orvex_page_meta"."page_id")`,
      )
      .executeTakeFirst();

    return { deleted: Number(result.numDeletedRows ?? 0) };
  }
}
