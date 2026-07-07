import { Injectable, NotFoundException } from '@nestjs/common';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page, PageHistory } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { CursorPaginationResult } from '@docmost/db/pagination/cursor-pagination';
import { jsonToText } from 'src/collaboration/collaboration.util';

@Injectable()
export class PageHistoryService {
  constructor(
    private pageHistoryRepo: PageHistoryRepo,
    private pageRepo: PageRepo,
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
}
