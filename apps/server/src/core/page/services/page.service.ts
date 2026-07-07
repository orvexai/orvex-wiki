import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
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
import { executeTx } from '@docmost/db/utils';
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
  htmlToJson,
  jsonToNode,
  jsonToText,
} from 'src/collaboration/collaboration.util';
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
import { markdownToHtml } from '@docmost/editor-ext';
import { WatcherService } from '../../watcher/watcher.service';
import { sql } from 'kysely';
import { TransclusionService } from '../transclusion/transclusion.service';

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

    let page: Page;
    try {
      page = await this.pageRepo.insertPage({
        slugId: generateSlugId(),
        title: createPageDto.title,
        position: await this.nextPagePosition(
          createPageDto.spaceId,
          parentPageId,
        ),
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
      }, trx);
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

  private computeContentHash(prosemirrorJson: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(prosemirrorJson))
      .digest('hex');
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

      const created = await this.create(userId, workspaceId, {
        title: dto.title,
        icon: dto.icon,
        parentPageId: dto.parentPageId,
        spaceId: dto.spaceId,
        content: dto.content,
        format: dto.format ?? (dto.content !== undefined ? 'json' : undefined),
      } as CreatePageDto);

      let contentHash: string | null = null;
      if (dto.content !== undefined) {
        const parsed = await this.parseProsemirrorContent(
          dto.content,
          dto.format ?? 'json',
        );
        contentHash = this.computeContentHash(parsed);
      }

      await this.db
        .insertInto('orvexPageMeta')
        .values({
          pageId: created.id,
          externalId: dto.externalId ?? null,
          contentHash,
          version: 1,
          workspaceId,
        })
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
    let inboundHash: string | undefined;
    if (dto.content !== undefined) {
      const parsed = await this.parseProsemirrorContent(
        dto.content,
        dto.format ?? 'json',
      );
      inboundHash = this.computeContentHash(parsed);
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
        content: dto.content,
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
  ): Promise<Page> {
    const contributors = new Set<string>(page.contributorIds);
    contributors.add(user.id);
    const contributorIds = Array.from(contributors);

    await this.pageRepo.updatePage(
      {
        title: updatePageDto.title,
        icon: updatePageDto.icon,
        lastUpdatedById: user.id,
        updatedAt: new Date(),
        contributorIds: contributorIds,
      },
      page.id,
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

    return await this.pageRepo.findById(page.id, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
    });
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

  async movePage(dto: MovePageDto, movedPage: Page) {
    // validate position value by attempting to generate a key
    try {
      generateJitteredKeyBetween(dto.position, null);
    } catch (err) {
      throw new BadRequestException('Invalid move position');
    }

    let parentPageId = null;
    if (movedPage.parentPageId === dto.parentPageId) {
      parentPageId = undefined;
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
      }
    }

    await this.pageRepo.updatePage(
      {
        position: dto.position,
        parentPageId: parentPageId,
      },
      dto.pageId,
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

  private async parseProsemirrorContent(
    content: string | object,
    format: ContentFormat,
  ): Promise<any> {
    let prosemirrorJson: any;

    switch (format) {
      case 'markdown': {
        const html = await markdownToHtml(content as string);
        prosemirrorJson = htmlToJson(html as string);
        break;
      }
      case 'html': {
        prosemirrorJson = htmlToJson(content as string);
        break;
      }
      case 'json':
      default: {
        prosemirrorJson = content;
        break;
      }
    }

    try {
      jsonToNode(prosemirrorJson);
    } catch (err) {
      throw new BadRequestException('Invalid content format');
    }

    return prosemirrorJson;
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
