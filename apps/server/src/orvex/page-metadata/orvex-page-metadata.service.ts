import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';
import { dbOrTx } from '../../database/utils';
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
} from '@orvex/extensions';

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
   */
  async applyMetadata(
    pageId: string,
    dto: OrvexPageMetadataDto,
    trx?: KyselyTransaction,
  ): Promise<OrvexPageMetaFields> {
    const db = dbOrTx(this.db, trx);

    const page = await db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'deletedAt'])
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

    // Archive-reason enforcement (v2 lifecycle contract, ported invariant).
    if (dto.status === PageStatus.ARCHIVED) {
      const reason = dto.archiveReason;
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException({ error: 'ARCHIVE_REASON_REQUIRED' });
      }
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
  ): Promise<OrvexPageMetaFields> {
    return this.applyMetadata(
      pageId,
      { status, archiveReason: opts?.archiveReason },
      trx,
    );
  }

  /** Marks a page superseded-by another, atomically, in a transaction. */
  async supersedeAtomic(
    pageId: string,
    supersededBy: string,
    trx?: KyselyTransaction,
  ): Promise<OrvexPageMetaFields> {
    return this.applyMetadata(
      pageId,
      { status: PageStatus.SUPERSEDED, supersededBy },
      trx,
    );
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
