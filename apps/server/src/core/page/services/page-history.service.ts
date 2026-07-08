import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page, PageHistory, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { CursorPaginationResult } from '@docmost/db/pagination/cursor-pagination';
import { jsonToText } from 'src/collaboration/collaboration.util';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { PageService } from './page.service';
import { OrvexAuditService } from '../../audit/orvex-audit.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';

@Injectable()
export class PageHistoryService {
  constructor(
    private pageHistoryRepo: PageHistoryRepo,
    private pageRepo: PageRepo,
    private pageService: PageService,
    private orvexAudit: OrvexAuditService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async findById(historyId: string): Promise<PageHistory> {
    return await this.pageHistoryRepo.findById(historyId, {
      includeContent: true,
    });
  }

  async findHistoryByPageId(
    pageId: string,
    paginationOptions: PaginationOptions,
  ): Promise<CursorPaginationResult<PageHistory>> {
    return this.pageHistoryRepo.findPageHistoryByPageId(
      pageId,
      paginationOptions,
    );
  }

  /**
   * ENG-1372 (AC4, AC5): restore a page's live content from ANY valid
   * history row belonging to that page (not restricted to the
   * latest/first — AC5), and guarantee the write actually lands — this must
   * never be a silent no-op (AC4). The engine-primitive restore path targets
   * the persisted `pages.content`/`textContent` columns that the read API,
   * search, and export surfaces serve; live collaborative-session sync
   * (Yjs/Hocuspocus) is a separate concern owned by the collaboration
   * gateway and out of scope for this engine primitive.
   */
  async restore(historyId: string, userId: string): Promise<Page> {
    const history = await this.pageHistoryRepo.findById(historyId, {
      includeContent: true,
    });
    if (!history) {
      throw new NotFoundException('Page history not found');
    }

    const page = await this.pageRepo.findById(history.pageId, {
      includeContent: true,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const restoredContent = (history.content ?? null) as any;
    const textContent = restoredContent ? jsonToText(restoredContent) : '';

    await this.pageRepo.updatePage(
      {
        content: restoredContent,
        textContent,
        lastUpdatedById: userId,
      },
      page.id,
    );

    return this.pageRepo.findById(page.id, { includeContent: true });
  }

  /**
   * ENG-1369: restore a page's live content from a history row, but unlike
   * the ENG-1372 `restore()` primitive above:
   *  - writes content through the collab/Yjs gateway
   *    (`PageService.updatePageContent`), never a raw `pages.content`
   *    UPDATE (AC1);
   *  - guards against a `historyId` belonging to a DIFFERENT page or
   *    workspace than the caller asserts (AC4 — IDOR guard);
   *  - skips the content write (but still bumps metadata + audits) when the
   *    history row's content is null (AC5 — never crash, never silently
   *    half-do it);
   *  - emits exactly one `page.history_restored` audit row in the SAME
   *    transaction as the metadata bump, so a fault-injected audit failure
   *    rolls the whole mutation back (AC3).
   */
  async restoreFromHistory(
    pageId: string,
    historyId: string,
    user: User,
    workspaceId: string,
  ): Promise<Page> {
    const history = await this.pageHistoryRepo.findById(historyId, {
      includeContent: true,
    });
    if (!history) {
      throw new NotFoundException('Page history not found');
    }

    const page = await this.pageRepo.findById(pageId, {
      includeContent: true,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    // AC4: reject a historyId that does not belong to THIS page/workspace.
    // Mutates nothing — checked before any write.
    if (history.pageId !== page.id || page.workspaceId !== workspaceId) {
      throw new BadRequestException({ error: 'INVALID_PAGE_HISTORY_REF' });
    }

    const restoredContent = (history.content ?? null) as any;

    // AC5: a null historical content is a valid, deliberate edge case
    // (e.g. a page that was briefly emptied) — skip the content write, but
    // still bump metadata + audit below. Never crash, never silently do
    // nothing at all.
    if (restoredContent != null) {
      // AC1: the collab-safe write path — never a raw `pages.content`
      // UPDATE from this service.
      await this.pageService.updatePageContent(
        page.id,
        restoredContent,
        'replace',
        'json',
        user,
      );
    }

    // AC3: page-mutation + audit commit or roll back together.
    await executeTx(this.db, async (trx) => {
      await this.pageRepo.updatePage(
        { lastUpdatedById: user.id },
        page.id,
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        workspaceId,
        actorId: user.id,
        actorType: 'user',
        event: AuditEvent.PAGE_HISTORY_RESTORED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        metadata: {
          restoredFromHistoryId: history.id,
          // AC9 (❌#9 time/rand in projection): derived from the history
          // row's own createdAt, never a fresh Date.now() call.
          restoredFromTimestamp: history.createdAt,
        },
      });
    });

    return this.pageRepo.findById(page.id, { includeContent: true });
  }
}
