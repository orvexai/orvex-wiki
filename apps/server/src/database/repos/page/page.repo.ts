import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx, executeTx } from '../../utils';
import {
  InsertablePage,
  Page,
  UpdatablePage,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { validate as isValidUUID } from 'uuid';
import { ExpressionBuilder, sql } from 'kysely';
import { DB } from '@docmost/db/types/db';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventName } from '../../../common/events/event.contants';
import { PageStatus } from '@orvex/extensions';
import { OutboxWriter } from '../../../orvex/events/outbox/outbox-writer.service';
import {
  EVT_PAGE_CREATED,
  EVT_PAGE_CONTENT_UPDATED,
} from '../../../orvex/events/constants/orvex-event-types';
import { WsService } from '../../../ws/ws.service';

@Injectable()
export class PageRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private spaceMemberRepo: SpaceMemberRepo,
    private eventEmitter: EventEmitter2,
    private readonly outboxWriter: OutboxWriter,
    private readonly wsService: WsService,
  ) {}

  private baseFields: Array<keyof Page> = [
    'id',
    'slugId',
    'title',
    'icon',
    'coverPhoto',
    'position',
    'parentPageId',
    'creatorId',
    'lastUpdatedById',
    'spaceId',
    'workspaceId',
    'isLocked',
    'isBase',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'contributorIds',
  ];

  async findById(
    pageId: string,
    opts?: {
      includeContent?: boolean;
      includeTextContent?: boolean;
      includeYdoc?: boolean;
      includeSpace?: boolean;
      includeCreator?: boolean;
      includeLastUpdatedBy?: boolean;
      includeContributors?: boolean;
      includeDeletedBy?: boolean;
      includeHasChildren?: boolean;
      withLock?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<Page> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db
      .selectFrom('pages')
      .select(this.baseFields)
      .$if(opts?.includeContent, (qb) => qb.select('content'))
      .$if(opts?.includeYdoc, (qb) => qb.select('ydoc'))
      .$if(opts?.includeTextContent, (qb) => qb.select('textContent'))
      .$if(opts?.includeHasChildren, (qb) =>
        qb.select((eb) => this.withHasChildren(eb)),
      );

    if (opts?.includeCreator) {
      query = query.select((eb) => this.withCreator(eb));
    }

    if (opts?.includeLastUpdatedBy) {
      query = query.select((eb) => this.withLastUpdatedBy(eb));
    }

    if (opts?.includeContributors) {
      query = query.select((eb) => this.withContributors(eb));
    }

    if (opts?.includeDeletedBy) {
      query = query.select((eb) => this.withDeletedBy(eb));
    }

    if (opts?.includeSpace) {
      query = query.select((eb) => this.withSpace(eb));
    }

    if (opts?.withLock && opts?.trx) {
      query = query.forUpdate();
    }

    if (isValidUUID(pageId)) {
      query = query.where('id', '=', pageId);
    } else {
      query = query.where('slugId', '=', pageId);
    }

    return query.executeTakeFirst();
  }

  /**
   * ENG-1471 dimension-2 lookup — resolves a page by its externalId within a
   * workspace (via the `orvex_page_meta` side table, ruling 4).
   */
  async findByExternalId(
    externalId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Page | undefined> {
    if (!externalId) return undefined;
    const db = dbOrTx(this.db, trx);

    const meta = await db
      .selectFrom('orvexPageMeta')
      .select('pageId')
      .where('externalId', '=', externalId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    if (!meta) return undefined;

    return db
      .selectFrom('pages')
      .select(this.baseFields)
      .where('id', '=', meta.pageId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  /**
   * ENG-1413 — read the side-table (`orvex_page_meta`, ruling 4) CAS/dedup
   * row for a page. Returns `undefined` when the page has no meta row yet.
   */
  async getPageMeta(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<
    | { pageId: string; externalId: string | null; contentHash: string | null; version: number; workspaceId: string }
    | undefined
  > {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  /**
   * The page's integer CAS version, exactly as the rest of the engine reports
   * it: the `orvex_page_meta.version` when a meta row exists, else the
   * documented baseline `1`. This is the SAME `meta?.version ?? 1` default
   * `ApplyOpsService.readSettledEnvelope` and the `withMetaVersion` callers
   * apply (CS §11 — one honest default, defined once, not re-guessed ad hoc).
   *
   * It exists so the read/create surfaces (`POST /api/pages/info`,
   * `POST /api/pages/create`) can hand the caller the INTEGER a subsequent
   * If-Match / ifVersion CAS (`apply-ops`, `casIncrementMeta`) actually
   * compares — never the `updatedAt` timestamp, which `strconv.ParseInt` on
   * the wiki-api edit path rejects. A freshly-created page (no meta row yet)
   * reads as `1`; its first `ifVersion:1` apply-ops CAS then seeds meta at
   * `2` (the ENG-2041 D2 seed-on-missing branch), so read-then-CAS-edit
   * round-trips on a brand-new page without a 409.
   */
  async getMetaVersion(pageId: string, trx?: KyselyTransaction): Promise<number> {
    const meta = await this.getPageMeta(pageId, trx);
    return meta?.version ?? 1;
  }

  /**
   * ENG-1413 (AC1, AC6) — the atomic integer-CAS store-tier primitive. Folds
   * the precondition into `UPDATE … WHERE page_id = ? AND version = ?`; a
   * zero-rowcount result (`undefined` return) means either `expectedVersion`
   * has drifted OR the meta row does not exist yet — the caller 409s.
   * There is NO separate read-then-write step here — this IS the check.
   *
   * ENG-2041 (D2) seed-on-missing — a page that has never been apply-ops'd
   * (legacy / imported / any row whose create did not seed the side table)
   * has NO `orvex_page_meta` row, yet the whole engine reports such a page as
   * version 1 (`meta?.version ?? 1` — `withMetaVersion`, `ApplyOpsService`,
   * `PageService.update`). Without this branch the bare `UPDATE … WHERE
   * version = ?` matches ZERO rows for ANY `expectedVersion`, so an honest
   * `ifVersion:1` CAS on such a page can NEVER succeed — `edit`/apply-ops and
   * the integer-CAS `/pages/update` path were permanently bricked for it
   * (the recorded serverVersion:0 "CAS reads the wrong current version"
   * symptom). So when the CAS UPDATE touched nothing AND `expectedVersion`
   * equals that documented baseline (1) AND a `workspaceId` is available, we
   * SEED the row race-safely: `INSERT … ON CONFLICT (page_id) DO NOTHING` at
   * version 2 (the honest 1→2 bump). ON CONFLICT DO NOTHING makes this a true
   * CAS still — a concurrent seeder or a row that actually already exists at
   * a drifted version loses the insert (returns `undefined` → caller 409s),
   * never a double-apply and never masking real drift. Any
   * `expectedVersion ≠ 1` on a missing row stays a genuine mismatch (the page
   * is logically at version 1, the caller claimed otherwise). No schema
   * change and no backfill — each meta-less page self-heals on its first CAS
   * write.
   */
  async casIncrementMeta(
    pageId: string,
    expectedVersion: number,
    patch: { contentHash?: string | null; externalId?: string | null },
    workspaceId?: string,
    trx?: KyselyTransaction,
  ): Promise<{ pageId: string; version: number } | undefined> {
    const db = dbOrTx(this.db, trx);
    const updated = await db
      .updateTable('orvexPageMeta')
      .set({
        version: sql`version + 1`,
        ...(patch.contentHash !== undefined
          ? { contentHash: patch.contentHash }
          : {}),
        ...(patch.externalId !== undefined
          ? { externalId: patch.externalId }
          : {}),
        updatedAt: new Date(),
      })
      .where('pageId', '=', pageId)
      .where('version', '=', expectedVersion)
      .returning(['pageId', 'version'])
      .executeTakeFirst();

    if (updated) {
      return updated;
    }

    // The CAS UPDATE matched nothing. Only the documented baseline
    // (expectedVersion === 1, i.e. a page the engine reports as v1 precisely
    // because it has no meta row yet) is eligible for the seed; every other
    // expected value on a missing row is genuine drift.
    if (expectedVersion !== 1 || !workspaceId) {
      return undefined;
    }

    return db
      .insertInto('orvexPageMeta')
      .values({
        pageId,
        workspaceId,
        externalId: patch.externalId ?? null,
        contentHash: patch.contentHash ?? null,
        version: 2,
      })
      .onConflict((oc) => oc.column('pageId').doNothing())
      .returning(['pageId', 'version'])
      .executeTakeFirst();
  }

  /**
   * ENG-1413 — unconditional version bump (no `ifVersion` supplied by the
   * caller, so there is no CAS precondition to enforce). Upserts the
   * side-table row defensively if it is somehow missing.
   */
  async bumpMeta(
    pageId: string,
    workspaceId: string,
    patch: { contentHash?: string | null; externalId?: string | null },
    trx?: KyselyTransaction,
  ): Promise<{ pageId: string; version: number }> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('orvexPageMeta')
      .values({
        pageId,
        workspaceId,
        externalId: patch.externalId ?? null,
        contentHash: patch.contentHash ?? null,
        version: 1,
      })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          version: sql`orvex_page_meta.version + 1`,
          ...(patch.contentHash !== undefined
            ? { contentHash: patch.contentHash }
            : {}),
          ...(patch.externalId !== undefined
            ? { externalId: patch.externalId }
            : {}),
          updatedAt: new Date(),
        }),
      )
      .returning(['pageId', 'version'])
      .executeTakeFirstOrThrow();
  }

  /**
   * ENG-1471 dimension-3 lookup — the fallback (spaceId, parentPageId,
   * title) resolution used when neither slugId nor externalId is supplied.
   */
  async findBySpaceParentTitle(
    spaceId: string,
    parentPageId: string | null | undefined,
    title: string,
    trx?: KyselyTransaction,
  ): Promise<Page | undefined> {
    if (!title) return undefined;
    const db = dbOrTx(this.db, trx);

    let query = db
      .selectFrom('pages')
      .select(this.baseFields)
      .where('spaceId', '=', spaceId)
      .where('title', '=', title)
      .where('deletedAt', 'is', null);

    query = parentPageId
      ? query.where('parentPageId', '=', parentPageId)
      : query.where('parentPageId', 'is', null);

    return query.executeTakeFirst();
  }

  async findManyByIds(
    pageIds: string[],
    opts?: {
      trx?: KyselyTransaction;
      workspaceId?: string;
    },
  ): Promise<Page[]> {
    if (pageIds.length === 0) return [];
    const db = dbOrTx(this.db, opts?.trx);

    let query = db
      .selectFrom('pages')
      .select(this.baseFields)
      .where('id', 'in', pageIds);

    if (opts?.workspaceId) {
      query = query
        .where('workspaceId', '=', opts.workspaceId)
        .where('deletedAt', 'is', null);
    }

    return query.execute();
  }

  async updatePage(
    updatablePage: UpdatablePage,
    pageId: string,
    trx?: KyselyTransaction,
    // ENG-1372 (AC3): optional extra fields merged into the single emitted
    // PAGE_UPDATED payload for this write (e.g. movePage's before/after
    // position) — never a second emit.
    eventExtra?: Record<string, unknown>,
    // ENG-1383 (AC5) fix-pass-2: optional extra fields merged ONLY into the
    // `page.content_updated` outbox payload (e.g. `changedBlockIds`) — never
    // written to the `pages` table, never merged into eventExtra above.
    contentOutboxExtra?: Record<string, unknown>,
  ) {
    return this.updatePages(
      updatablePage,
      [pageId],
      trx,
      eventExtra,
      contentOutboxExtra,
    );
  }

  /**
   * ENG-1383 F1 fix — `content` is the ONLY field on `pages` that a real
   * production write path (`PersistenceExtension.onStoreDocument`, which
   * BOTH the collab live-edit path and the REST `updatePageContent` path
   * converge on) ever sets here. When present, the `page.content_updated`
   * outbox row is written in the SAME transaction as the content write
   * (AC1/AC2-style atomicity — never a detached/post-commit emit for this
   * event). This is the actual AC5/AC8 delivery path.
   */
  private hasContentChange(data: UpdatablePage): boolean {
    return 'content' in data && data.content !== undefined;
  }

  private async runUpdatePages(
    activeDb: KyselyDB | KyselyTransaction,
    updatePageData: UpdatablePage,
    pageIds: string[],
    contentOutboxExtra?: Record<string, unknown>,
  ) {
    const rows = await activeDb
      .updateTable('pages')
      .set({ ...updatePageData, updatedAt: new Date() })
      .where(
        pageIds.some((pageId) => !isValidUUID(pageId)) ? 'slugId' : 'id',
        'in',
        pageIds,
      )
      .returning(['id', 'slugId', 'workspaceId', 'updatedAt'])
      .execute();

    // ENG-1383 F5 fix-pass-2: gate ONLY on the content change itself. The
    // real production caller (`PersistenceExtension.onStoreDocument`) never
    // sets `workspaceId` in the SET payload (you don't re-home a page during
    // a content edit) — the previous `&& updatePageData.workspaceId` guard
    // was therefore false on every real write and silently dropped the row.
    // `row.workspaceId` (from `.returning(...)`) is always present and is
    // what the enqueue below actually uses.
    if (this.hasContentChange(updatePageData)) {
      // Only reachable via the two branches below that guarantee `activeDb`
      // is a REAL transaction (the caller's own `trx`, or one this method
      // opens itself) — never the plain non-transactional `this.db`.
      const trx = activeDb as KyselyTransaction;
      for (const row of rows) {
        await this.outboxWriter.enqueue(trx, {
          type: EVT_PAGE_CONTENT_UPDATED,
          aggregateId: row.id,
          workspaceId: row.workspaceId,
          payload: {
            pageId: row.id,
            workspaceId: row.workspaceId,
            // ENG-1559 M5 AC8 — gen.ContentUpdatedData's actual decode shape
            // (orvex-studio-knowledge/gen/events.go): {tenant, pageIds[],
            // version}, additive alongside the pre-existing pageId/
            // workspaceId keys above (never renamed — ENG-1383 F5/AC5's own
            // integration tests assert on those verbatim). `version` is the
            // row's OWN just-written `updated_at` epoch-ms (row data, never
            // `Date.now()` at decision time, ❌#9) — monotonic per real
            // write, stable across a redelivery of the SAME row.
            tenant: row.workspaceId,
            pageIds: [row.id],
            version: new Date(row.updatedAt).getTime(),
            ...contentOutboxExtra,
          },
        });
      }
    }

    return rows;
  }

  async updatePages(
    updatePageData: UpdatablePage,
    pageIds: string[],
    trx?: KyselyTransaction,
    eventExtra?: Record<string, unknown>,
    contentOutboxExtra?: Record<string, unknown>,
  ) {
    const contentChange = this.hasContentChange(updatePageData);

    const rows = trx
      ? await this.runUpdatePages(
          trx,
          updatePageData,
          pageIds,
          contentOutboxExtra,
        )
      : contentChange
        ? await executeTx(this.db, (innerTrx) =>
            this.runUpdatePages(
              innerTrx,
              updatePageData,
              pageIds,
              contentOutboxExtra,
            ),
          )
        : await this.runUpdatePages(this.db, updatePageData, pageIds);

    this.eventEmitter.emit(EventName.PAGE_UPDATED, {
      pageIds: pageIds,
      workspaceId: updatePageData.workspaceId,
      ...eventExtra,
    });

    // ENG-1383 F3 fix — extend the realtime-invalidate sweep (previously
    // create-only) to every page mutation that goes through this shared
    // write path (content, title, status, move, etc.).
    for (const row of rows) {
      this.wsService.emitInvalidate(row.workspaceId, ['pages', row.slugId]);
    }

    return rows.length <= 1 ? rows[0] : rows;
  }

  /**
   * ENG-1382 (AC1/AC2) — the F-QUOTA `pages` usage count for a workspace.
   * Soft-deleted pages don't count against the cap (mirrors the fork's
   * trash semantics — a trashed page has already freed its quota slot).
   */
  async countByWorkspaceId(
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const result = await dbOrTx(this.db, trx)
      .selectFrom('pages')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * ENG-1383 AC1/AC2 — the page insert and its `page.created` outbox row
   * commit ATOMICALLY. When the caller passes its own `trx`, both writes
   * join it (a caller rollback takes the outbox row with it — AC2). When no
   * `trx` is passed, both writes are wrapped in one transaction here so a
   * page create still produces exactly one outbox row on commit (AC1).
   *
   * The legacy `EventName.PAGE_CREATED` EventEmitter2 emit and the
   * Socket.IO `invalidate` sweep (T5/AC6) both stay post-commit /
   * fire-and-forget — they are NOT the durable primitive (the outbox is);
   * losing one is a degraded UX (stale cache, missed in-process listener),
   * never a lost domain event.
   */
  async insertPage(
    insertablePage: InsertablePage,
    trx?: KyselyTransaction,
  ): Promise<Page> {
    const result = await executeTx(
      this.db,
      async (innerTrx) => {
        const row = await innerTrx
          .insertInto('pages')
          .values(insertablePage)
          .returning(this.baseFields)
          .executeTakeFirst();

        await this.outboxWriter.enqueue(innerTrx, {
          type: EVT_PAGE_CREATED,
          aggregateId: row.id,
          workspaceId: row.workspaceId,
          payload: { id: row.id, workspaceId: row.workspaceId },
        });

        // ENG-1559 M5 AC8 — a page created WITH initial content must be
        // indexable immediately: the indexer's projection pipeline
        // (orvex-studio-knowledge Orchestrator.Ingest) only actually embeds
        // + upserts on `wiki.page.content_updated`
        // (gen.TypeWikiPageContentUpdated) — `page.created` alone carries no
        // content-freshness contract and is left genuinely not-implemented
        // downstream. Mirrors `runUpdatePages`' `hasContentChange` gate
        // below — same-tx atomicity, never a detached/post-commit emit.
        if ('content' in insertablePage && insertablePage.content !== undefined) {
          await this.outboxWriter.enqueue(innerTrx, {
            type: EVT_PAGE_CONTENT_UPDATED,
            aggregateId: row.id,
            workspaceId: row.workspaceId,
            payload: {
              pageId: row.id,
              workspaceId: row.workspaceId,
              // gen.ContentUpdatedData (orvex-studio-knowledge/gen/events.go)
              // — the indexer's actual `data` decode shape: {tenant,
              // pageIds[], version}. A workspace IS the tenant boundary for
              // wiki.* events (obligations.tenant_extension). `version` is
              // the row's OWN `created_at` epoch-ms (row data, never
              // `Date.now()` at decision time, ❌#9) — monotonic per real
              // write and stable across a redelivery of the SAME row, which
              // is exactly what the indexer's idempotency comparison
              // (`existing.Version >= version` alongside a content_hash
              // match) needs.
              tenant: row.workspaceId,
              pageIds: [row.id],
              version: new Date(row.createdAt).getTime(),
            },
          });
        }

        return row;
      },
      trx,
    );

    this.eventEmitter.emit(EventName.PAGE_CREATED, {
      pageIds: [result.id],
      workspaceId: result.workspaceId,
    });

    this.wsService.emitInvalidate(result.workspaceId, ['pages', result.slugId]);

    return result;
  }

  async deletePage(pageId: string): Promise<void> {
    let query = this.db.deleteFrom('pages');

    if (isValidUUID(pageId)) {
      query = query.where('id', '=', pageId);
    } else {
      query = query.where('slugId', '=', pageId);
    }

    await query.execute();
  }

  async removePage(
    pageId: string,
    deletedById: string,
    workspaceId: string,
  ): Promise<void> {
    const currentDate = new Date();

    const descendants = await this.db
      .withRecursive('page_descendants', (db) =>
        db
          .selectFrom('pages')
          .select(['id'])
          .where('id', '=', pageId)
          .where('deletedAt', 'is', null)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select(['p.id'])
              .innerJoin('page_descendants as pd', 'pd.id', 'p.parentPageId')
              .where('p.deletedAt', 'is', null),
          ),
      )
      .selectFrom('page_descendants')
      .selectAll()
      .execute();

    const pageIds = descendants.map((d) => d.id);

    if (pageIds.length > 0) {
      await executeTx(this.db, async (trx) => {
        await trx
          .updateTable('pages')
          .set({
            deletedById: deletedById,
            deletedAt: currentDate,
          })
          .where('id', 'in', pageIds)
          .where('deletedAt', 'is', null)
          .execute();

        await trx.deleteFrom('shares').where('pageId', 'in', pageIds).execute();
      });

      this.eventEmitter.emit(EventName.PAGE_SOFT_DELETED, {
        pageIds: pageIds,
        workspaceId,
      });
    }
  }

  async restorePage(pageId: string, workspaceId: string): Promise<void> {
    // First, check if the page being restored has a deleted parent
    const pageToRestore = await this.db
      .selectFrom('pages')
      .select(['id', 'parentPageId'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    if (!pageToRestore) {
      return;
    }

    // Check if the parent is also deleted
    let shouldDetachFromParent = false;
    if (pageToRestore.parentPageId) {
      const parent = await this.db
        .selectFrom('pages')
        .select(['id', 'deletedAt'])
        .where('id', '=', pageToRestore.parentPageId)
        .executeTakeFirst();

      // If parent is deleted, we should detach this page from it
      shouldDetachFromParent = parent?.deletedAt !== null;
    }

    // Find all descendants to restore
    const pages = await this.db
      .withRecursive('page_descendants', (db) =>
        db
          .selectFrom('pages')
          .select(['id'])
          .where('id', '=', pageId)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select(['p.id'])
              .innerJoin('page_descendants as pd', 'pd.id', 'p.parentPageId'),
          ),
      )
      .selectFrom('page_descendants')
      .selectAll()
      .execute();

    const pageIds = pages.map((p) => p.id);

    // Restore all pages, but only detach the root page if its parent is deleted
    await this.db
      .updateTable('pages')
      .set({ deletedById: null, deletedAt: null })
      .where('id', 'in', pageIds)
      .execute();

    // If we need to detach the restored page from its deleted parent
    if (shouldDetachFromParent) {
      await this.db
        .updateTable('pages')
        .set({ parentPageId: null })
        .where('id', '=', pageId)
        .execute();
    }
    this.eventEmitter.emit(EventName.PAGE_RESTORED, {
      pageIds: pageIds,
      workspaceId: workspaceId,
    });
  }

  async getRecentPagesInSpace(
    spaceId: string,
    pagination: PaginationOptions,
    includeSuperseded?: boolean,
  ) {
    let query = this.db
      .selectFrom('pages')
      .select(this.baseFields)
      .select((eb) => this.withSpace(eb))
      .select((eb) => this.withMetaVersion(eb))
      .select((eb) => this.withMetaStatus(eb))
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null);
    query = this.excludeSupersededUnless(query, includeSuperseded);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'updatedAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        updatedAt: new Date(cursor.updatedAt),
        id: cursor.id,
      }),
    });
  }

  async getRecentPages(
    userId: string,
    pagination: PaginationOptions,
    includeSuperseded?: boolean,
  ) {
    let query = this.db
      .selectFrom('pages')
      .select(this.baseFields)
      .select((eb) => this.withSpace(eb))
      .select((eb) => this.withMetaVersion(eb))
      .select((eb) => this.withMetaStatus(eb))
      .where('spaceId', 'in', this.spaceMemberRepo.getUserSpaceIdsQuery(userId))
      .where('deletedAt', 'is', null);
    query = this.excludeSupersededUnless(query, includeSuperseded);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'updatedAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        updatedAt: new Date(cursor.updatedAt),
        id: cursor.id,
      }),
    });
  }

  async getCreatedByPages(creatorId: string, requestingUserId: string, pagination: PaginationOptions, spaceId?: string) {
    let query = this.db
      .selectFrom('pages')
      .select(this.baseFields)
      .select((eb) => this.withSpace(eb))
      .where('creatorId', '=', creatorId)
      .where('deletedAt', 'is', null);

    if (spaceId) {
      query = query.where('spaceId', '=', spaceId);
    } else {
      query = query.where('spaceId', 'in', this.spaceMemberRepo.getUserSpaceIdsQuery(requestingUserId));
    }

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'updatedAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        updatedAt: new Date(cursor.updatedAt),
        id: cursor.id,
      }),
    });
  }

  async getDeletedPagesInSpace(spaceId: string, pagination: PaginationOptions) {
    const query = this.db
      .selectFrom('pages')
      .select(this.baseFields)
      .select('content')
      .select((eb) => this.withSpace(eb))
      .select((eb) => this.withDeletedBy(eb))
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is not', null)
      // Only include pages that are either root pages (no parent) or whose parent is not deleted
      // This prevents showing orphaned pages when their parent has been soft-deleted
      .where((eb) =>
        eb.or([
          eb('parentPageId', 'is', null),
          eb.not(
            eb.exists(
              eb
                .selectFrom('pages as parent')
                .select('parent.id')
                .where('parent.id', '=', eb.ref('pages.parentPageId'))
                .where('parent.deletedAt', 'is not', null),
            ),
          ),
        ]),
      );

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'deletedAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        deletedAt: new Date(cursor.deletedAt),
        id: cursor.id,
      }),
    });
  }

  /**
   * ENG-1434 AC11 — discovery-hiding: a superseded page (side-table
   * `orvex_page_meta.status = 'superseded'`, ruling 4) is excluded from
   * discovery-surface reads (recent/sidebar/suggestions) by default; the
   * caller opts in explicitly to reveal it. A page with no meta row is
   * never superseded and always passes.
   */
  excludeSupersededUnless<T extends { where: (...args: any[]) => any }>(
    query: T,
    includeSuperseded: boolean | undefined,
  ): T {
    if (includeSuperseded) return query;
    return query.where((eb: any) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('orvexPageMeta')
            .select(sql`1`.as('one'))
            .whereRef('orvexPageMeta.pageId', '=', 'pages.id')
            .where('orvexPageMeta.status', '=', PageStatus.SUPERSEDED),
        ),
      ),
    );
  }

  withSpace(eb: ExpressionBuilder<DB, 'pages'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('spaces')
        .select(['spaces.id', 'spaces.name', 'spaces.slug'])
        .whereRef('spaces.id', '=', 'pages.spaceId'),
    ).as('space');
  }

  /**
   * 2026-07-13 root-fix (wiki-engine lane) — the `orvex_page_meta` side-table
   * CAS version, as a flat correlated scalar subquery (same pattern as
   * `withSpace` above, just unwrapped from `jsonObjectFrom` since a single
   * scalar column needs no object envelope). Used by `getRecentPages`/
   * `getRecentSpacePages` so the `POST /api/pages/recent` primitive can
   * honestly report each page's real integer version instead of wiki-api's
   * facade defaulting every page to a fabricated constant. A page with no
   * meta row yet (never apply-ops'd) has no real version row — `null`,
   * never silently coerced to a guessed number here; callers apply the SAME
   * `meta?.version ?? 1` default `ApplyOpsService` itself uses (CS §11 —
   * one honest default, defined once, not re-guessed ad hoc downstream).
   */
  withMetaVersion(eb: ExpressionBuilder<DB, 'pages'>) {
    return eb
      .selectFrom('orvexPageMeta')
      .select('orvexPageMeta.version')
      .whereRef('orvexPageMeta.pageId', '=', 'pages.id')
      .as('metaVersion');
  }

  /**
   * 2026-07-13 root-fix (wiki-engine lane) — the `orvex_page_meta` side-table
   * lifecycle status (draft/canonical/deprecated/archived/superseded), same
   * correlated-scalar-subquery posture as `withMetaVersion` above. `null`
   * when the page has no meta row yet (never explicitly stamped) — callers
   * treat that as the engine's own documented default, `canonical`
   * (`PageStatus.CANONICAL`), never a fabricated distinct value.
   */
  withMetaStatus(eb: ExpressionBuilder<DB, 'pages'>) {
    return eb
      .selectFrom('orvexPageMeta')
      .select('orvexPageMeta.status')
      .whereRef('orvexPageMeta.pageId', '=', 'pages.id')
      .as('metaStatus');
  }

  withCreator(eb: ExpressionBuilder<DB, 'pages'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'pages.creatorId'),
    ).as('creator');
  }

  withLastUpdatedBy(eb: ExpressionBuilder<DB, 'pages'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'pages.lastUpdatedById'),
    ).as('lastUpdatedBy');
  }

  withDeletedBy(eb: ExpressionBuilder<DB, 'pages'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'pages.deletedById'),
    ).as('deletedBy');
  }

  withContributors(eb: ExpressionBuilder<DB, 'pages'>) {
    return jsonArrayFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', sql`ANY(${eb.ref('pages.contributorIds')})`),
    ).as('contributors');
  }

  withHasChildren(eb: ExpressionBuilder<DB, 'pages'>) {
    return eb
      .selectFrom('pages as child')
      .select((eb) =>
        eb
          .case()
          .when(eb.fn.countAll(), '>', 0)
          .then(true)
          .else(false)
          .end()
          .as('count'),
      )
      .whereRef('child.parentPageId', '=', 'pages.id')
      .where('child.deletedAt', 'is', null)
      .limit(1)
      .as('hasChildren');
  }

  async getPageAndDescendants(
    parentPageId: string,
    opts: { includeContent: boolean },
  ) {
    return this.db
      .withRecursive('page_hierarchy', (db) =>
        db
          .selectFrom('pages')
          .select([
            'id',
            'slugId',
            'title',
            'icon',
            'position',
            'parentPageId',
            'spaceId',
            'workspaceId',
            'createdAt',
            'updatedAt',
          ])
          .$if(opts?.includeContent, (qb) => qb.select('content'))
          .where('id', '=', parentPageId)
          .where('deletedAt', 'is', null)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select([
                'p.id',
                'p.slugId',
                'p.title',
                'p.icon',
                'p.position',
                'p.parentPageId',
                'p.spaceId',
                'p.workspaceId',
                'p.createdAt',
                'p.updatedAt',
              ])
              .$if(opts?.includeContent, (qb) => qb.select('p.content'))
              .innerJoin('page_hierarchy as ph', 'p.parentPageId', 'ph.id')
              .where('p.deletedAt', 'is', null),
          ),
      )
      .selectFrom('page_hierarchy')
      .selectAll()
      .execute();
  }

  /**
   * Get page and all descendants, excluding restricted pages and their subtrees.
   * More efficient than getPageAndDescendants + filtering because:
   * 1. Single DB query (no separate restricted IDs query)
   * 2. Stops traversing at restricted pages (doesn't fetch data to discard)
   * 3. No in-memory filtering needed
   */
  async getPageAndDescendantsExcludingRestricted(
    parentPageId: string,
    opts: { includeContent: boolean },
  ) {
    return (
      this.db
        .withRecursive('page_hierarchy', (db) =>
          db
            .selectFrom('pages')
            .leftJoin('pageAccess', 'pageAccess.pageId', 'pages.id')
            .select([
              'pages.id',
              'pages.slugId',
              'pages.title',
              'pages.icon',
              'pages.position',
              'pages.parentPageId',
              'pages.spaceId',
              'pages.workspaceId',
              sql<boolean>`page_access.id IS NOT NULL`.as('isRestricted'),
            ])
            .$if(opts?.includeContent, (qb) => qb.select('pages.content'))
            .where('pages.id', '=', parentPageId)
            .where('pages.deletedAt', 'is', null)
            .unionAll((exp) =>
              exp
                .selectFrom('pages as p')
                .innerJoin('page_hierarchy as ph', 'p.parentPageId', 'ph.id')
                .leftJoin('pageAccess', 'pageAccess.pageId', 'p.id')
                .select([
                  'p.id',
                  'p.slugId',
                  'p.title',
                  'p.icon',
                  'p.position',
                  'p.parentPageId',
                  'p.spaceId',
                  'p.workspaceId',
                  sql<boolean>`page_access.id IS NOT NULL`.as('isRestricted'),
                ])
                .$if(opts?.includeContent, (qb) => qb.select('p.content'))
                .where('p.deletedAt', 'is', null)
                // Only recurse into children of non-restricted pages
                .where('ph.isRestricted', '=', false),
            ),
        )
        .selectFrom('page_hierarchy')
        .select([
          'id',
          'slugId',
          'title',
          'icon',
          'position',
          'parentPageId',
          'spaceId',
          'workspaceId',
        ])
        .$if(opts?.includeContent, (qb) => qb.select('content'))
        // Filter out restricted pages from the result
        .where('isRestricted', '=', false)
        .execute()
    );
  }
}
