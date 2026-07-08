import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePageDto, ContentFormat } from '../dto/create-page.dto';
import { ContentOperation, UpdatePageDto } from '../dto/update-page.dto';
import { UpsertPageDto } from '../dto/upsert-page.dto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { InsertablePage, Page, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  CursorPaginationResult,
  executeWithCursorPagination,
} from '@docmost/db/pagination/cursor-pagination';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { MovePageDto } from '../dto/move-page.dto';
import { generateSlugId } from '../../../common/helpers';
import { getPageTitle } from '../../../common/helpers';
import { executeTx, acquireWorkspaceQuotaLock } from '@docmost/db/utils';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { v7 as uuid7 } from 'uuid';
import {
  createYdocFromJson,
  getAttachmentIds,
  getProsemirrorContent,
  isAttachmentNode,
  removeMarkTypeFromDoc,
} from '../../../common/helpers/prosemirror/utils';
import {
  jsonToNode,
  jsonToText,
  stampBlockIds,
} from 'src/collaboration/collaboration.util';
import { computeContentHash as sharedComputeContentHash } from '../../../common/helpers/content-hash';
import {
  CopyPageMapEntry,
  ICopyPageAttachment,
} from '../dto/duplicate-page.dto';
import { Node as PMNode } from '@tiptap/pm/model';
import { StorageService } from '../../../integrations/storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { EventName } from '../../../common/events/event.contants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';
import {
  INTERNAL_LINK_REGEX,
  extractPageSlugId,
} from '../../../integrations/export/utils';
import { WatcherService } from '../../watcher/watcher.service';
import { sql } from 'kysely';
import { TransclusionService } from '../transclusion/transclusion.service';
import { IdempotencyStore } from '../../../integrations/redis/idempotency-store.service';
import {
  assertIfVersionMatches,
  isIntegerVersion,
  toIntegerVersion,
} from '../if-version.util';
import { EntitlementService } from '../../../orvex/entitlement/entitlement.service';

@Injectable()
export class PageService {
  private readonly logger = new Logger(PageService.name);

  constructor(
    private pageRepo: PageRepo,
    private pagePermissionRepo: PagePermissionRepo,
    private attachmentRepo: AttachmentRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    @InjectQueue(QueueName.GENERAL_QUEUE) private generalQueue: Queue,
    private eventEmitter: EventEmitter2,
    private collaborationGateway: CollaborationGateway,
    private readonly watcherService: WatcherService,
    private readonly transclusionService: TransclusionService,
    private readonly idempotencyStore: IdempotencyStore,
    private readonly entitlementService: EntitlementService,
  ) {}

  async findById(
    pageId: string,
    includeContent?: boolean,
    includeYdoc?: boolean,
    includeSpace?: boolean,
  ): Promise<Page> {
    return this.pageRepo.findById(pageId, {
      includeContent,
      includeYdoc,
      includeSpace,
    });
  }

  async create(
    userId: string,
    workspaceId: string,
    createPageDto: CreatePageDto,
    trx?: KyselyTransaction,
    isBase: boolean = false,
  ): Promise<Page> {
    let parentPageId = undefined;

    // check if parent page exists
    if (createPageDto.parentPageId) {
      const parentPage = await this.pageRepo.findById(
        createPageDto.parentPageId,
      );

      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== createPageDto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }

      parentPageId = parentPage.id;
    }

    let content = undefined;
    let textContent = undefined;
    let ydoc = undefined;

    if (createPageDto?.content && createPageDto?.format) {
      const prosemirrorJson = await this.parseProsemirrorContent(
        createPageDto.content,
        createPageDto.format,
      );

      content = prosemirrorJson;
      textContent = jsonToText(prosemirrorJson);
      ydoc = createYdocFromJson(prosemirrorJson);
    }

    const position = await this.nextPagePosition(
      createPageDto.spaceId,
      parentPageId,
    );

    let page: Page;
    try {
      // ENG-1382 fix pass 1 (F1) — count -> assert -> insert MUST be one
      // atomic critical section, not three separate awaits: two concurrent
      // requests both reading `cap - 1` would both pass the check and both
      // insert, exceeding the cap (the T6 attack). `acquireWorkspaceQuotaLock`
      // takes a Postgres advisory xact lock as the FIRST statement of this
      // transaction, so a second concurrent create() for the same workspace
      // blocks until this transaction commits or rolls back and then
      // re-reads the now-current count — never racing past the cap.
      //
      // (AC1/AC2/AC6) — the cap VALUE is read from billing via
      // EntitlementService — never hard-coded here (❌#10). Throws
      // `QuotaExceededException` (402) at-cap; a no-op under cap.
      page = await executeTx(
        this.db,
        async (quotaTrx) => {
          await acquireWorkspaceQuotaLock(quotaTrx, 'pages', workspaceId);

          const currentPageCount = await this.pageRepo.countByWorkspaceId(
            workspaceId,
            quotaTrx,
          );
          await this.entitlementService.assertWithinQuota(
            workspaceId,
            'pages',
            currentPageCount,
          );

          return this.pageRepo.insertPage(
            {
              slugId: generateSlugId(),
              title: createPageDto.title,
              position,
              icon: createPageDto.icon,
              parentPageId: parentPageId,
              spaceId: createPageDto.spaceId,
              creatorId: userId,
              workspaceId: workspaceId,
              lastUpdatedById: userId,
              isBase,
              content,
              textContent,
              ydoc,
            },
            quotaTrx,
          );
        },
        trx,
      );
    } catch (err: any) {
      // pages_unique_title_per_parent (ENG-1471) — a sibling with the same
      // title already exists at this location.
      if (err?.code === '23505') {
        throw new ConflictException(
          `A page named "${createPageDto.title}" already exists at this location`,
        );
      }
      throw err;
    }

    // ENG-1413 — every page gets an `orvex_page_meta` row (ruling 4) from
    // creation, seeded at version 1, so the CAS/idempotency primitive on
    // `POST /pages/update` always has a baseline version to check against
    // (not just pages that went through `upsert`). Content is already
    // parsed above (`content`) — hash it directly, no re-parse.
    const initialContentHash =
      content !== undefined ? this.computeContentHash(content) : null;
    await (trx ?? this.db)
      .insertInto('orvexPageMeta')
      .values({
        pageId: page.id,
        externalId: null,
        contentHash: initialContentHash,
        version: 1,
        workspaceId,
      })
      .execute();

    if (trx) {
      // Add the watcher inside the caller's transaction so the async worker
      // never inserts against an uncommitted page (FK violation on bases).
      await this.watcherService.addPageWatchers(
        [userId],
        page.id,
        createPageDto.spaceId,
        workspaceId,
        trx,
      );
    } else {
      this.generalQueue
        .add(QueueJob.ADD_PAGE_WATCHERS, {
          userIds: [userId],
          pageId: page.id,
          spaceId: createPageDto.spaceId,
          workspaceId,
        })
        .catch((err) =>
          this.logger.warn(`Failed to queue add-page-watchers: ${err.message}`),
        );
    }

    return page;
  }

  /**
   * ENG-1397 AC8/AC9 — the single content_hash accessor. Delegates to the
   * shared `computeContentHash` helper (F-B) so this write chokepoint and
   * the AC4 backfill migration can never silently drift apart on how a
   * content hash is derived.
   */
  private computeContentHash(prosemirrorJson: unknown): string {
    return sharedComputeContentHash(prosemirrorJson);
  }

  /**
   * ENG-1471 — idempotent page write.
   *
   * Three-tier lookup (slugId -> externalId -> (spaceId,parentPageId,title));
   * a keyless retry with byte-identical `replace` content is a true no-op
   * (content-hash short-circuit); `ifVersion` is a CAS guard on the update
   * branch; the create branch requires `spaceId` and persists `externalId`
   * (side table, ruling 4) for future dimension-2 lookups.
   */
  async upsert(
    dto: UpsertPageDto,
    userId: string,
    workspaceId: string,
  ): Promise<{ page: Page; upserted: 'created' | 'updated' }> {
    let existing: Page | undefined;

    if (dto.slugId) {
      const bySlug = await this.pageRepo.findById(dto.slugId);
      if (bySlug && !bySlug.deletedAt && bySlug.workspaceId === workspaceId) {
        existing = bySlug;
      }
    }

    if (!existing && dto.externalId) {
      existing = await this.pageRepo.findByExternalId(
        dto.externalId,
        workspaceId,
      );
    }

    if (!existing && dto.spaceId && dto.title) {
      existing = await this.pageRepo.findBySpaceParentTitle(
        dto.spaceId,
        dto.parentPageId,
        dto.title,
      );
    }

    if (!existing) {
      if (!dto.spaceId) {
        throw new BadRequestException({ error: 'SPACE_ID_REQUIRED' });
      }

      // ENG-1397 — parse (+ block-ID stamp) ONCE and reuse the SAME
      // resulting json for both the actual page insert and the hash. The
      // chokepoint now mints fresh ids for previously-missing nodes; parsing
      // the raw `dto.content` independently a second time (the old
      // create-then-reparse-for-hash shape) would mint a DIFFERENT set of
      // random ids each time, and the stored `contentHash` would silently
      // stop matching the persisted content. Re-parsing the ALREADY-stamped
      // `preparedContent` inside `create()` below is safe/idempotent: no
      // ids are missing anymore, so `stampBlockIds` is a true no-op there.
      let preparedContent: string | object | undefined = dto.content;
      let contentHash: string | null = null;
      if (dto.content !== undefined) {
        preparedContent = await this.parseProsemirrorContent(
          dto.content,
          dto.format ?? 'json',
        );
        contentHash = this.computeContentHash(preparedContent);
      }

      const created = await this.create(userId, workspaceId, {
        title: dto.title,
        icon: dto.icon,
        parentPageId: dto.parentPageId,
        spaceId: dto.spaceId,
        content: preparedContent,
        format: preparedContent !== undefined ? 'json' : undefined,
      } as CreatePageDto);

      // ENG-1413 — `create()` above already seeded the `orvex_page_meta`
      // row at version 1 (every page gets one now, not just `upsert`'d
      // ones); this just layers the externalId on top via upsert — never
      // a second INSERT (that would 23505 on the pageId primary key).
      await this.db
        .insertInto('orvexPageMeta')
        .values({
          pageId: created.id,
          externalId: dto.externalId ?? null,
          contentHash,
          version: 1,
          workspaceId,
        })
        .onConflict((oc) =>
          oc.column('pageId').doUpdateSet({
            externalId: dto.externalId ?? null,
          }),
        )
        .execute();

      return { page: created, upserted: 'created' };
    }

    // --- update branch ---
    const meta = await this.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', existing.id)
      .executeTakeFirst();

    const operation = dto.operation ?? 'replace';
    // ENG-1397 — same single-parse-then-reuse rationale as the create
    // branch above: hash the SAME stamped json that actually gets written.
    let preparedContent: string | object | undefined = dto.content;
    let inboundHash: string | undefined;
    if (dto.content !== undefined) {
      preparedContent = await this.parseProsemirrorContent(
        dto.content,
        dto.format ?? 'json',
      );
      inboundHash = this.computeContentHash(preparedContent);
    }

    // The safe no-op case: a keyless `replace` retry with byte-identical
    // content, no ifVersion/title/icon change — everything else (append,
    // prepend, an explicit ifVersion, a title/icon change) falls through to
    // a real write.
    const noOpEligible =
      operation === 'replace' &&
      dto.ifVersion === undefined &&
      dto.content !== undefined &&
      dto.title === undefined &&
      dto.icon === undefined;

    if (
      noOpEligible &&
      meta?.contentHash &&
      inboundHash !== undefined &&
      inboundHash === meta.contentHash
    ) {
      const full = await this.pageRepo.findById(existing.id, {
        includeContent: true,
        includeSpace: true,
      });
      return { page: full, upserted: 'updated' };
    }

    if (
      dto.ifVersion !== undefined &&
      meta &&
      dto.ifVersion !== meta.version
    ) {
      throw new ConflictException({ error: 'VERSION_MISMATCH' });
    }

    const updated = await this.update(
      existing,
      {
        pageId: existing.id,
        title: dto.title,
        icon: dto.icon,
        content: preparedContent,
        operation: dto.operation,
        format: dto.format,
      } as UpdatePageDto,
      { id: userId } as User,
    );

    const nextVersion = (meta?.version ?? 0) + 1;
    const nextHash = inboundHash ?? meta?.contentHash ?? null;
    const nextExternalId = dto.externalId ?? meta?.externalId ?? null;

    await this.db
      .insertInto('orvexPageMeta')
      .values({
        pageId: existing.id,
        externalId: nextExternalId,
        contentHash: nextHash,
        version: nextVersion,
        workspaceId,
      })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({
          externalId: nextExternalId,
          contentHash: nextHash,
          version: nextVersion,
          updatedAt: new Date(),
        }),
      )
      .execute();

    return { page: updated, upserted: 'updated' };
  }

  async nextPagePosition(spaceId: string, parentPageId?: string) {
    let pagePosition: string;

    const lastPageQuery = this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1);

    if (parentPageId) {
      // check for children of this page
      const lastPage = await lastPageQuery
        .where('parentPageId', '=', parentPageId)
        .executeTakeFirst();

      if (!lastPage) {
        pagePosition = generateJitteredKeyBetween(null, null);
      } else {
        // if there is an existing page, we should get a position below it
        pagePosition = generateJitteredKeyBetween(lastPage.position, null);
      }
    } else {
      // for root page
      const lastPage = await lastPageQuery
        .where('parentPageId', 'is', null)
        .executeTakeFirst();

      // if no existing page, make this the first
      if (!lastPage) {
        pagePosition = generateJitteredKeyBetween(null, null); // we expect "a0"
      } else {
        // if there is an existing page, we should get a position below it
        pagePosition = generateJitteredKeyBetween(lastPage.position, null);
      }
    }

    return pagePosition;
  }

  async update(
    page: Page,
    updatePageDto: UpdatePageDto,
    user: User,
    casOpts?: { ifVersion?: number | string; idempotencyKey?: string },
    trx?: KyselyTransaction,
  ): Promise<Page> {
    // ENG-1413 — atomic integer CAS + cross-replica idempotency, gated on
    // the caller explicitly opting in via `casOpts` (the `/pages/update`
    // HTTP path). `upsert()`'s internal call into `update()` does NOT pass
    // `casOpts` — it manages the side-table meta row itself (ENG-1471,
    // AC7) — so this block never double-bumps `orvex_page_meta.version`.
    let meta: { version: number } | undefined;
    if (casOpts) {
      meta = await this.pageRepo.getPageMeta(page.id);

      // AC5: the CAS precondition is asserted BEFORE any idempotency slot
      // is claimed — a stale `ifVersion` 409s here, leaving the slot free.
      assertIfVersionMatches(page.updatedAt, casOpts.ifVersion, meta?.version);

      if (casOpts.idempotencyKey) {
        const claim = await this.idempotencyStore.claim<Page>(
          'page-update',
          page.id,
          user.id,
          casOpts.idempotencyKey,
        );

        if (!claim.claimed) {
          // AC3: the loser does not re-apply — return the winner's result
          // (or, if it hasn't been recorded yet, the page's current state).
          return (
            claim.result ??
            (await this.pageRepo.findById(page.id, {
              includeSpace: true,
              includeContent: true,
              includeCreator: true,
              includeLastUpdatedBy: true,
              includeContributors: true,
            }))
          );
        }
      }
    }

    const contributors = new Set<string>(page.contributorIds);
    contributors.add(user.id);
    const contributorIds = Array.from(contributors);

    let nextContentHash: string | null | undefined;
    if (updatePageDto.content !== undefined && updatePageDto.format) {
      const parsed = await this.parseProsemirrorContent(
        updatePageDto.content,
        updatePageDto.format,
      );
      nextContentHash = this.computeContentHash(parsed);
    }

    if (casOpts) {
      // AC1/AC6: fold the precondition into the atomic store-tier UPDATE —
      // zero-rowcount means the version drifted between the pre-check above
      // and here (a genuine cross-replica race), and THAT is the real,
      // race-proof guard (no read-then-write TOCTOU on the write decision).
      if (isIntegerVersion(casOpts.ifVersion)) {
        const expectedVersion = toIntegerVersion(casOpts.ifVersion);

        const casResult = await this.pageRepo.casIncrementMeta(
          page.id,
          expectedVersion,
          { contentHash: nextContentHash },
        );

        if (!casResult) {
          const current = await this.pageRepo.getPageMeta(page.id);
          throw new ConflictException({
            code: 'VERSION_MISMATCH',
            serverVersion: current?.version,
          });
        }
      } else {
        await this.pageRepo.bumpMeta(page.id, page.workspaceId, {
          contentHash: nextContentHash,
        });
      }
    }

    await this.pageRepo.updatePage(
      {
        title: updatePageDto.title,
        icon: updatePageDto.icon,
        lastUpdatedById: user.id,
        updatedAt: new Date(),
        contributorIds: contributorIds,
      },
      page.id,
      trx,
    );

    this.generalQueue
      .add(QueueJob.ADD_PAGE_WATCHERS, {
        userIds: [user.id],
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
      })
      .catch((err) =>
        this.logger.warn(`Failed to queue add-page-watchers: ${err.message}`),
      );

    if (
      updatePageDto.content &&
      updatePageDto.operation &&
      updatePageDto.format
    ) {
      await this.updatePageContent(
        page.id,
        updatePageDto.content,
        updatePageDto.operation,
        updatePageDto.format,
        user,
      );
    }

    const result = await this.pageRepo.findById(page.id, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
      trx,
    });

    if (casOpts?.idempotencyKey) {
      // Best-effort — losers polling this key see the winner's result.
      // Never blocks/fails the response (IdempotencyStore never throws).
      await this.idempotencyStore.record(
        'page-update',
        page.id,
        user.id,
        casOpts.idempotencyKey,
        result,
      );
    }

    return result;
  }

  async updatePageContent(
    pageId: string,
    content: string | object,
    operation: ContentOperation,
    format: ContentFormat,
    user: User,
  ): Promise<void> {
    const prosemirrorJson = await this.parseProsemirrorContent(content, format);

    const documentName = `page.${pageId}`;
    await this.collaborationGateway.handleYjsEvent(
      'updatePageContent',
      documentName,
      { operation, prosemirrorJson, user },
    );
  }

  async getSidebarPages(
    spaceId: string,
    pagination: PaginationOptions,
    pageId?: string,
    userId?: string,
    spaceCanEdit?: boolean,
  ): Promise<CursorPaginationResult<Partial<Page> & { hasChildren: boolean }>> {
    let query = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'position',
        'parentPageId',
        'spaceId',
        'creatorId',
        'isBase',
        'deletedAt',
      ])
      .select((eb) => this.pageRepo.withHasChildren(eb))
      .where('deletedAt', 'is', null)
      .where('spaceId', '=', spaceId);

    if (pageId) {
      query = query.where('parentPageId', '=', pageId);
    } else {
      query = query.where('parentPageId', 'is', null);
    }

    const result = await executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        {
          expression: 'position',
          direction: 'asc',
          orderModifier: (ob) => ob.collate('C').asc(),
          cursorExpression: sql`position collate "C"`,
        },
        { expression: 'id', direction: 'asc' },
      ],
      parseCursor: (cursor) => ({
        position: cursor.position,
        id: cursor.id,
      }),
    });

    if (userId && result.items.length > 0) {
      const hasRestrictions =
        await this.pagePermissionRepo.hasRestrictedPagesInSpace(spaceId);

      if (!hasRestrictions) {
        result.items = result.items.map((p: any) => ({
          ...p,
          canEdit: spaceCanEdit ?? true,
        }));
      } else {
        const pageIds = result.items.map((p: any) => p.id);

        const accessiblePages =
          await this.pagePermissionRepo.filterAccessiblePageIdsWithPermissions(
            pageIds,
            userId,
          );

        const permissionMap = new Map(
          accessiblePages.map((p) => [p.id, p.canEdit]),
        );

        result.items = result.items
          .filter((p: any) => permissionMap.has(p.id))
          .map((p: any) => ({
            ...p,
            canEdit: permissionMap.get(p.id) && (spaceCanEdit ?? true),
          }));

        const pagesWithChildren = result.items.filter(
          (p: any) => p.hasChildren,
        );
        if (pagesWithChildren.length > 0) {
          const parentIds = pagesWithChildren.map((p: any) => p.id);
          const parentsWithAccessibleChildren =
            await this.pagePermissionRepo.getParentIdsWithAccessibleChildren(
              parentIds,
              userId,
            );
          const hasAccessibleChildrenSet = new Set(
            parentsWithAccessibleChildren,
          );

          result.items = result.items.map((p: any) => ({
            ...p,
            hasChildren: p.hasChildren && hasAccessibleChildrenSet.has(p.id),
          }));
        }
      }
    }

    return result;
  }

  async movePageToSpace(rootPage: Page, spaceId: string, userId: string) {
    let childPageIds: string[] = [];

    const allPages = await this.pageRepo.getPageAndDescendants(rootPage.id, {
      includeContent: false,
    });

    // Filter to only accessible pages while maintaining tree integrity
    const accessiblePages = await this.filterAccessibleTreePages(
      allPages,
      rootPage.id,
      userId,
      rootPage.spaceId,
    );
    const accessibleIds = new Set(accessiblePages.map((p) => p.id));

    // Find inaccessible pages whose parent is being moved - these need to be orphaned
    const pagesToOrphan = allPages.filter(
      (p) =>
        !accessibleIds.has(p.id) &&
        p.parentPageId &&
        accessibleIds.has(p.parentPageId),
    );

    await executeTx(this.db, async (trx) => {
      // Orphan inaccessible child pages (make them root pages in original space)
      for (const page of pagesToOrphan) {
        const orphanPosition = await this.nextPagePosition(
          rootPage.spaceId,
          null,
        );
        await this.pageRepo.updatePage(
          { parentPageId: null, position: orphanPosition },
          page.id,
          trx,
        );
      }

      // Update root page
      const nextPosition = await this.nextPagePosition(spaceId);
      await this.pageRepo.updatePage(
        { spaceId, parentPageId: null, position: nextPosition },
        rootPage.id,
        trx,
      );

      const pageIdsToMove = accessiblePages.map((p) => p.id);

      childPageIds = pageIdsToMove.filter((id) => id !== rootPage.id);

      if (pageIdsToMove.length > 1) {
        // Update sub pages (all accessible pages except root)
        await this.pageRepo.updatePages({ spaceId }, childPageIds, trx);
      }

      if (pageIdsToMove.length > 0) {
        await trx
          .updateTable('pageAccess')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // update spaceId in shares
        await trx
          .updateTable('shares')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update comments
        await trx
          .updateTable('comments')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update page verifications
        await trx
          .updateTable('pageVerifications')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update notifications — access follows the page after a move
        await trx
          .updateTable('notifications')
          .set({ spaceId: spaceId })
          .where('pageId', 'in', pageIdsToMove)
          .execute();

        // Update attachments
        await this.attachmentRepo.updateAttachmentsByPageId(
          { spaceId },
          pageIdsToMove,
          trx,
        );

        // Update watchers and remove those without access to new space
        await this.watcherService.movePageWatchersToSpace(
          pageIdsToMove,
          spaceId,
          {
            trx,
          },
        );

        await this.aiQueue.add(QueueJob.PAGE_MOVED_TO_SPACE, {
          pageIds: pageIdsToMove,
          workspaceId: rootPage.workspaceId,
        });
      }
    });

    return { childPageIds };
  }

  /**
   * ENG-1471 — bumps (or appends) the " (N)" copy-title suffix, e.g.
   * `"Copy of Foo"` -> `"Copy of Foo (2)"` -> `"Copy of Foo (3)"`. Falls back
   * to a `Date.now()` suffix only as a last resort after 100 numbered
   * attempts would collide (never reached in the tested path).
   */
  private incrementCopyTitle(title: string): string {
    const match = title.match(/^(.*) \((\d+)\)$/);
    if (match) {
      const n = parseInt(match[2], 10);
      if (n < 100) {
        return `${match[1]} (${n + 1})`;
      }
      return `${match[1]} (${Date.now()})`;
    }
    return `${title} (2)`;
  }

  /**
   * ENG-1471 — best-effort pre-flight pick of a non-colliding copy title
   * before the first insert attempt (the 23505 retry loop in
   * `duplicatePage` is the actual correctness guarantee under concurrency).
   */
  private async resolveUniqueCopyTitle(
    spaceId: string,
    parentPageId: string | null | undefined,
    baseTitle: string,
  ): Promise<string> {
    let candidate = baseTitle;
    for (let i = 0; i < 100; i++) {
      const existing = await this.pageRepo.findBySpaceParentTitle(
        spaceId,
        parentPageId,
        candidate,
      );
      if (!existing) return candidate;
      candidate = this.incrementCopyTitle(candidate);
    }
    return `${baseTitle} (${Date.now()})`;
  }

  async duplicatePage(
    rootPage: Page,
    targetSpaceId: string | undefined,
    authUser: User,
  ) {
    const spaceId = targetSpaceId || rootPage.spaceId;
    const isDuplicateInSameSpace =
      !targetSpaceId || targetSpaceId === rootPage.spaceId;

    let nextPosition: string;

    if (isDuplicateInSameSpace) {
      // For duplicate in same space, position right after the original page
      nextPosition = generateJitteredKeyBetween(rootPage.position, null);
    } else {
      // For copy to different space, position at the end
      nextPosition = await this.nextPagePosition(spaceId);
    }

    const allPages = await this.pageRepo.getPageAndDescendants(rootPage.id, {
      includeContent: true,
    });

    // Filter to only accessible pages while maintaining tree integrity
    const pages = await this.filterAccessibleTreePages(
      allPages,
      rootPage.id,
      authUser.id,
      rootPage.spaceId,
    );

    const pageMap = new Map<string, CopyPageMapEntry>();
    pages.forEach((page) => {
      pageMap.set(page.id, {
        newPageId: uuid7(),
        newSlugId: generateSlugId(),
        oldSlugId: page.slugId,
      });
    });

    const slugIdMap = new Map<string, CopyPageMapEntry>();
    for (const [, entry] of pageMap) {
      slugIdMap.set(entry.oldSlugId, entry);
    }

    const attachmentMap = new Map<string, ICopyPageAttachment>();

    const insertablePages: InsertablePage[] = await Promise.all(
      pages.map(async (page) => {
        const pageContent = getProsemirrorContent(page.content);
        const pageFromMap = pageMap.get(page.id);

        const doc = jsonToNode(pageContent);
        const prosemirrorDoc = removeMarkTypeFromDoc(doc, 'comment');

        const attachmentIds = getAttachmentIds(prosemirrorDoc.toJSON());

        if (attachmentIds.length > 0) {
          attachmentIds.forEach((attachmentId: string) => {
            const newPageId = pageFromMap.newPageId;
            const newAttachmentId = uuid7();
            attachmentMap.set(attachmentId, {
              newPageId: newPageId,
              oldPageId: page.id,
              oldAttachmentId: attachmentId,
              newAttachmentId: newAttachmentId,
            });

            prosemirrorDoc.descendants((node: PMNode) => {
              if (isAttachmentNode(node.type.name)) {
                if (node.attrs.attachmentId === attachmentId) {
                  //@ts-ignore
                  node.attrs.attachmentId = newAttachmentId;

                  if (node.attrs.src) {
                    //@ts-ignore
                    node.attrs.src = node.attrs.src.replace(
                      attachmentId,
                      newAttachmentId,
                    );
                  }
                  if (node.attrs.src) {
                    //@ts-ignore
                    node.attrs.src = node.attrs.src.replace(
                      attachmentId,
                      newAttachmentId,
                    );
                  }
                }
              }
            });
          });
        }

        // Update internal page links in mention nodes
        prosemirrorDoc.descendants((node: PMNode) => {
          if (
            node.type.name === 'mention' &&
            node.attrs.entityType === 'page'
          ) {
            const referencedPageId = node.attrs.entityId;

            // Check if the referenced page is within the pages being copied
            if (referencedPageId && pageMap.has(referencedPageId)) {
              const mappedPage = pageMap.get(referencedPageId);
              //@ts-ignore
              node.attrs.entityId = mappedPage.newPageId;
              //@ts-ignore
              node.attrs.slugId = mappedPage.newSlugId;
            }
          }

          // Remap transclusion-reference source pages to their copies when
          // the source page is also being duplicated in the same operation.
          if (node.type.name === 'transclusionReference') {
            const sourcePageId = node.attrs.sourcePageId;
            if (sourcePageId && pageMap.has(sourcePageId)) {
              const mappedPage = pageMap.get(sourcePageId);
              //@ts-ignore
              node.attrs.sourcePageId = mappedPage.newPageId;
            }
          }

          // Update internal page links in link marks
          for (const mark of node.marks) {
            if (
              mark.type.name === 'link' &&
              mark.attrs.internal &&
              mark.attrs.href
            ) {
              const match = mark.attrs.href.match(INTERNAL_LINK_REGEX);
              if (match) {
                const slugId = extractPageSlugId(match[5]);
                if (slugId && slugIdMap.has(slugId)) {
                  const mappedPage = slugIdMap.get(slugId);
                  //@ts-ignore
                  mark.attrs.href = mark.attrs.href.replace(
                    slugId,
                    mappedPage.newSlugId,
                  );
                }
              }
            }
          }
        });

        const prosemirrorJson = prosemirrorDoc.toJSON();

        // Add "Copy of " prefix to the root page title only for duplicates in same space
        let title = page.title;
        if (isDuplicateInSameSpace && page.id === rootPage.id) {
          const originalTitle = getPageTitle(page.title);
          const baseTitle = `Copy of ${originalTitle}`;
          // Best-effort pre-flight (ENG-1471); the 23505 retry loop around
          // the insert is what actually guarantees uniqueness under a race.
          title = await this.resolveUniqueCopyTitle(
            spaceId,
            rootPage.parentPageId,
            baseTitle,
          );
        }

        return {
          id: pageFromMap.newPageId,
          slugId: pageFromMap.newSlugId,
          title: title,
          icon: page.icon,
          content: prosemirrorJson,
          textContent: jsonToText(prosemirrorJson),
          ydoc: createYdocFromJson(prosemirrorJson),
          position: page.id === rootPage.id ? nextPosition : page.position,
          spaceId: spaceId,
          workspaceId: page.workspaceId,
          creatorId: authUser.id,
          lastUpdatedById: authUser.id,
          parentPageId:
            page.id === rootPage.id
              ? isDuplicateInSameSpace
                ? rootPage.parentPageId
                : null
              : page.parentPageId
                ? pageMap.get(page.parentPageId)?.newPageId
                : null,
        };
      }),
    );

    // ENG-1471 AC6/AC7 — the subtree insert + transclusion rows commit in
    // ONE transaction (rollback leaves no partial subtree); a duplicate-title
    // collision on `pages_unique_title_per_parent` (23505) bumps the root
    // page's copy-title suffix and retries, bounded at 10 attempts, so a
    // storm of concurrent duplicates degrades to distinct titles rather than
    // a 500.
    const newRootId = pageMap.get(rootPage.id).newPageId;
    const rootEntry = insertablePages.find((p) => p.id === newRootId);

    for (let attempt = 0; ; attempt++) {
      try {
        await executeTx(this.db, async (trx) => {
          await trx.insertInto('pages').values(insertablePages).execute();

          // Extract transclusions from every duplicated page and persist
          // them in one statement. Duplication bypasses Yjs
          // onStoreDocument; brand-new pages never have prior rows so we
          // can skip the diff and just bulk-insert.
          await this.transclusionService.insertTransclusionsForPages(
            insertablePages.map((p) => ({
              id: p.id,
              workspaceId: p.workspaceId,
              content: p.content,
            })),
            trx,
          );

          await this.transclusionService.insertReferencesForPages(
            insertablePages.map((p) => ({
              id: p.id,
              workspaceId: p.workspaceId,
              content: p.content,
            })),
            trx,
          );
        });
        break;
      } catch (err: any) {
        if (err?.code === '23505' && rootEntry && attempt < 10) {
          rootEntry.title = this.incrementCopyTitle(
            rootEntry.title as string,
          );
          continue;
        }
        this.logger.error(
          'Failed to insert duplicated page subtree/transclusions',
          err,
        );
        throw err;
      }
    }

    const insertedPageIds = insertablePages.map((page) => page.id);
    this.eventEmitter.emit(EventName.PAGE_CREATED, {
      pageIds: insertedPageIds,
      workspaceId: authUser.workspaceId,
    });

    //TODO: best to handle this in a queue
    const attachmentsIds = Array.from(attachmentMap.keys());
    if (attachmentsIds.length > 0) {
      const attachments = await this.db
        .selectFrom('attachments')
        .selectAll()
        .where('id', 'in', attachmentsIds)
        .where('workspaceId', '=', rootPage.workspaceId)
        .execute();

      for (const attachment of attachments) {
        try {
          const pageAttachment = attachmentMap.get(attachment.id);

          // make sure the copied attachment belongs to the page it was copied from
          if (attachment.pageId !== pageAttachment.oldPageId) {
            continue;
          }

          const newAttachmentId = pageAttachment.newAttachmentId;

          const newPageId = pageAttachment.newPageId;

          const newPathFile = attachment.filePath.replace(
            attachment.id,
            newAttachmentId,
          );

          try {
            await this.storageService.copy(attachment.filePath, newPathFile);

            await this.db
              .insertInto('attachments')
              .values({
                id: newAttachmentId,
                type: attachment.type,
                filePath: newPathFile,
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                mimeType: attachment.mimeType,
                fileExt: attachment.fileExt,
                creatorId: attachment.creatorId,
                workspaceId: attachment.workspaceId,
                pageId: newPageId,
                spaceId: spaceId,
              })
              .execute();
          } catch (err) {
            this.logger.error(
              `Duplicate page: failed to copy attachment ${attachment.id}`,
              err,
            );
            // Continue with other attachments even if one fails
          }
        } catch (err) {
          this.logger.error(err);
        }
      }
    }

    const newPageId = pageMap.get(rootPage.id).newPageId;
    const duplicatedPage = await this.pageRepo.findById(newPageId, {
      includeSpace: true,
    });

    const hasChildren = pages.length > 1;
    const childPageIds = insertedPageIds.filter((id) => id !== newPageId);

    return {
      ...duplicatedPage,
      hasChildren,
      childPageIds,
    };
  }

  /**
   * ENG-889 / ENG-1372 (AC1, AC2, AC8): resolve a movePage `position` value —
   * either a keyword form (`child`, `before:<id>`, `after:<id>`) or an
   * already-concrete fractional-index key — into a real, persistable
   * fractional-index key.
   *
   * This is real branching over the sibling set (not a pass-through): the
   * keyword forms look up the actual neighbour(s) in `targetParentPageId`'s
   * children and call `generateJitteredKeyBetween` between them. Unknown
   * keyword forms (anything containing `:` that isn't `before:`/`after:`)
   * are rejected with a typed error rather than silently coerced (AC8).
   */
  async resolvePositionKey(
    position: string,
    spaceId: string,
    targetParentPageId: string | null,
    excludePageId?: string,
  ): Promise<string> {
    if (position.includes(':')) {
      const match = /^(before|after):(.+)$/.exec(position);
      if (!match) {
        throw new BadRequestException(
          `Unsupported move position keyword: ${position}`,
        );
      }
      const [, keyword, refId] = match;

      if (refId === excludePageId) {
        throw new BadRequestException('Invalid move position');
      }

      const refPage = await this.pageRepo.findById(refId);
      if (
        !refPage ||
        refPage.deletedAt ||
        refPage.spaceId !== spaceId ||
        (refPage.parentPageId ?? null) !== targetParentPageId
      ) {
        // AC6: reference id not resolvable in the caller's tree — reject,
        // mutate nothing.
        throw new BadRequestException('Invalid move position');
      }

      const siblings = await this.db
        .selectFrom('pages')
        .select(['id', 'position'])
        .where('spaceId', '=', spaceId)
        .where('deletedAt', 'is', null)
        .where(
          targetParentPageId ? 'parentPageId' : 'parentPageId',
          targetParentPageId ? '=' : 'is',
          targetParentPageId,
        )
        .orderBy('position', (ob) => ob.collate('C').asc())
        .execute();

      const idx = siblings.findIndex((s) => s.id === refPage.id);

      if (keyword === 'before') {
        const lower = idx > 0 ? siblings[idx - 1].position : null;
        const upper = refPage.position;
        return generateJitteredKeyBetween(lower, upper);
      }

      const lower = refPage.position;
      const upper =
        idx < siblings.length - 1 ? siblings[idx + 1].position : null;
      return generateJitteredKeyBetween(lower, upper);
    }

    if (position === 'child') {
      return this.nextPagePosition(spaceId, targetParentPageId ?? undefined);
    }

    // Not a keyword form — must already be a concrete, parseable key (AC2).
    try {
      generateJitteredKeyBetween(position, null);
    } catch (err) {
      throw new BadRequestException('Invalid move position');
    }
    return position;
  }

  async movePage(dto: MovePageDto, movedPage: Page) {
    let parentPageId: string | null | undefined = null;
    let targetParentPageId: string | null = movedPage.parentPageId ?? null;

    if (movedPage.parentPageId === dto.parentPageId) {
      parentPageId = undefined;
      targetParentPageId = movedPage.parentPageId ?? null;
    } else {
      // changing the page's parent
      if (dto.parentPageId) {
        const parentPage = await this.pageRepo.findById(dto.parentPageId);
        if (
          !parentPage ||
          parentPage.deletedAt ||
          parentPage.spaceId !== movedPage.spaceId
        ) {
          throw new NotFoundException('Parent page not found');
        }

        // ENG-1471 AC8 — reject moving a page under one of its own
        // descendants (would corrupt the tree into a cycle).
        if (dto.parentPageId === movedPage.id) {
          throw new BadRequestException(
            'Cannot move a page under one of its own descendants',
          );
        }
        const isDescendant = await this.isPageDescendantOf(
          dto.parentPageId,
          movedPage.id,
        );
        if (isDescendant) {
          throw new BadRequestException(
            'Cannot move a page under one of its own descendants',
          );
        }

        parentPageId = parentPage.id;
        targetParentPageId = parentPage.id;
      } else {
        parentPageId = null;
        targetParentPageId = null;
      }
    }

    const beforePosition = movedPage.position;
    const resolvedPosition = await this.resolvePositionKey(
      dto.position,
      movedPage.spaceId,
      targetParentPageId,
      movedPage.id,
    );

    // AC3: exactly one PAGE_UPDATED emit for the move, carrying before/after
    // position so search/AI reindex stay fresh (never-stale ruling).
    await this.pageRepo.updatePage(
      {
        position: resolvedPosition,
        parentPageId: parentPageId,
      },
      dto.pageId,
      undefined,
      { before: beforePosition, after: resolvedPosition },
    );
  }

  /**
   * ENG-1471 — true if `candidateId` is a descendant of `rootId` (used by
   * `movePage`'s cycle guard: the recursive CTE walks down from the moved
   * page and checks whether the proposed new parent shows up).
   */
  private async isPageDescendantOf(
    candidateId: string,
    rootId: string,
  ): Promise<boolean> {
    if (candidateId === rootId) return true;

    const descendants = await this.db
      .withRecursive('page_descendants', (db) =>
        db
          .selectFrom('pages')
          .select(['id'])
          .where('id', '=', rootId)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select(['p.id'])
              .innerJoin(
                'page_descendants as pd',
                'pd.id',
                'p.parentPageId',
              ),
          ),
      )
      .selectFrom('page_descendants')
      .select('id')
      .where('id', '=', candidateId)
      .executeTakeFirst();

    return !!descendants;
  }

  async getPageBreadCrumbs(childPageId: string) {
    const ancestors = await this.db
      .withRecursive('page_ancestors', (db) =>
        db
          .selectFrom('pages')
          .select([
            'id',
            'slugId',
            'title',
            'icon',
            'isBase',
            'position',
            'parentPageId',
            'spaceId',
            'deletedAt',
          ])
          .where('id', '=', childPageId)
          .where('deletedAt', 'is', null)
          .unionAll((exp) =>
            exp
              .selectFrom('pages as p')
              .select([
                'p.id',
                'p.slugId',
                'p.title',
                'p.icon',
                'p.isBase',
                'p.position',
                'p.parentPageId',
                'p.spaceId',
                'p.deletedAt',
              ])
              .innerJoin('page_ancestors as pa', 'pa.parentPageId', 'p.id')
              .where('p.deletedAt', 'is', null),
          ),
      )
      .selectFrom('page_ancestors')
      .selectAll('page_ancestors')
      .select((eb) =>
        eb
          .exists(
            eb
              .selectFrom('pages as child')
              .select(sql`1`.as('one'))
              .whereRef('child.parentPageId', '=', 'page_ancestors.id')
              .where('child.deletedAt', 'is', null),
          )
          .as('hasChildren'),
      )
      .execute();

    return ancestors.reverse();
  }

  async getRecentSpacePages(
    spaceId: string,
    userId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getRecentPagesInSpace(
      spaceId,
      pagination,
    );

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
          spaceId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async getRecentPages(
    userId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getRecentPages(userId, pagination);

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async getCreatedByPages(
    creatorId: string,
    requestingUserId: string,
    pagination: PaginationOptions,
    spaceId?: string,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getCreatedByPages(
      creatorId,
      requestingUserId,
      pagination,
      spaceId,
    );

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId: requestingUserId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async getDeletedSpacePages(
    spaceId: string,
    userId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<Page>> {
    const result = await this.pageRepo.getDeletedPagesInSpace(
      spaceId,
      pagination,
    );

    if (result.items.length > 0) {
      const pageIds = result.items.map((p) => p.id);
      const accessibleIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
          spaceId,
        });
      const accessibleSet = new Set(accessibleIds);
      result.items = result.items.filter((p) => accessibleSet.has(p.id));
    }

    return result;
  }

  async forceDelete(pageId: string, workspaceId: string): Promise<void> {
    // Get all descendant IDs (including the page itself) using recursive CTE
    const descendants = await this.db
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

    const pageIds = descendants.map((d) => d.id);

    // Queue attachment deletion for all pages with unique job IDs to prevent duplicates
    for (const id of pageIds) {
      await this.attachmentQueue.add(
        QueueJob.DELETE_PAGE_ATTACHMENTS,
        {
          pageId: id,
        },
        {
          jobId: `delete-page-attachments-${id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
    }

    if (pageIds.length > 0) {
      await this.db.deleteFrom('pages').where('id', 'in', pageIds).execute();
      this.eventEmitter.emit(EventName.PAGE_DELETED, {
        pageIds: pageIds,
        workspaceId,
      });
    }
  }

  async removePage(
    pageId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.pageRepo.removePage(pageId, userId, workspaceId);
  }

  /**
   * ENG-1397 — the single block-ID-native write chokepoint.
   *
   * AC5/AC6: lossy write formats (markdown/html) and un-resolved dfm are
   * rejected up front with typed codes — this chokepoint only accepts
   * ProseMirror json, so no diagram/callout/column block-id is ever
   * silently dropped by a lossy round-trip.
   * AC7: malformed ProseMirror json is rejected (`INVALID_CONTENT_FORMAT`).
   * AC2: every configured block-level node is guaranteed an `id` — missing
   * ids are minted, existing ids are NEVER regenerated (`stampBlockIds` /
   * `backfillPageContent` only touch nodes that lack one), which is what
   * keeps re-stamping already-id'd content a true no-op (idempotent).
   */
  private async parseProsemirrorContent(
    content: string | object,
    format: ContentFormat,
  ): Promise<any> {
    switch (format) {
      case 'dfm':
        // AC6 — a server-bug guard: DfM content must be resolved to
        // ProseMirror json upstream (the `dfm-contracts-ts-serializer` leg,
        // blocked-by) before it ever reaches this chokepoint.
        throw new BadRequestException({
          code: 'DFM_NOT_PRE_RESOLVED',
          message:
            'DfM content must be resolved to ProseMirror json before reaching the write chokepoint',
        });
      case 'markdown':
      case 'html':
        // AC5 — lossy write formats are rejected: writes must be
        // block-ID-native ProseMirror json.
        throw new BadRequestException({
          code: 'LOSSY_WRITE_FORMAT_REJECTED',
          message: `Writing content as '${format}' is not supported; submit ProseMirror json instead`,
        });
      case 'json':
      default:
        break;
    }

    const prosemirrorJson: any = content;

    try {
      jsonToNode(prosemirrorJson);
    } catch (err) {
      // AC7
      throw new BadRequestException({
        code: 'INVALID_CONTENT_FORMAT',
        message: 'Invalid content format',
      });
    }

    // AC2 — stamp missing block ids at the chokepoint.
    const { content: stamped } = stampBlockIds(prosemirrorJson);
    return stamped;
  }

  /**
   * Filters a list of pages to only those accessible to the user while maintaining tree integrity.
   * A page is included only if:
   * 1. The user has access to it
   * 2. Its parent is also included (or it's the root page)
   * This ensures that if a middle page is inaccessible, its entire subtree is excluded.
   */
  private async filterAccessibleTreePages<
    T extends { id: string; parentPageId: string | null },
  >(
    pages: T[],
    rootPageId: string,
    userId: string,
    spaceId?: string,
  ): Promise<T[]> {
    if (pages.length === 0) return [];

    const pageIds = pages.map((p) => p.id);
    const accessibleIds = await this.pagePermissionRepo.filterAccessiblePageIds(
      {
        pageIds,
        userId,
        spaceId,
      },
    );
    const accessibleSet = new Set(accessibleIds);

    // Prune: include a page only if it's accessible AND its parent chain to root is included
    const includedIds = new Set<string>();

    // Process pages in a way that ensures parents are processed before children
    // We do this by iterating until no more pages can be added
    let changed = true;
    while (changed) {
      changed = false;
      for (const page of pages) {
        if (includedIds.has(page.id)) continue;
        if (!accessibleSet.has(page.id)) continue;

        // Root page: include if accessible
        if (page.id === rootPageId) {
          includedIds.add(page.id);
          changed = true;
          continue;
        }

        // Non-root: include if parent is already included
        if (page.parentPageId && includedIds.has(page.parentPageId)) {
          includedIds.add(page.id);
          changed = true;
        }
      }
    }

    return pages.filter((p) => includedIds.has(p.id));
  }
}
