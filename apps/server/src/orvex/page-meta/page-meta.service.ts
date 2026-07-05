import { Injectable, Logger } from '@nestjs/common';
import { OrvexPageMeta, OrvexPageStamp } from './page-meta.types';

/**
 * PageMetaService — the read/write seam for the `orvex_page_meta` side table
 * (FR-W3). It replaces the ~10 read sites that today read the 18 product
 * columns directly off upstream `pages`.
 *
 * SCAFFOLD: the bodies are TODO. The real implementation binds a Kysely
 * repository over `orvex_page_meta` + a join, run inside the same
 * transaction-scoped RLS as the mutation (A-TENANCY). Typed loosely (`unknown`
 * DB handle) so the skeleton compiles without wiring `@docmost/db`.
 */
@Injectable()
export class PageMetaService {
  private readonly logger = new Logger(PageMetaService.name);

  /** Load the side-table meta for a page (null when no row exists yet). */
  async get(_pageId: string): Promise<OrvexPageMeta | null> {
    // TODO(fold-in WS-2): SELECT from orvex_page_meta JOIN pages, RLS-scoped.
    return null;
  }

  /** Upsert the drift/spec-gate stamp fields (D-S8) that wiki-api writes. */
  async stamp(_pageId: string, _stamp: OrvexPageStamp): Promise<void> {
    // TODO(fold-in WS-2): UPSERT orvex_page_meta stamp columns in the mutation tx.
    this.logger.debug('stamp() is a scaffold no-op');
  }

  /** Bump the optimistic-concurrency version for the CAS chokepoint (FR-W1). */
  async bumpVersion(_pageId: string, _expected: number): Promise<number> {
    // TODO(fold-in WS-3): CAS bump; 409 on ifVersion mismatch.
    return 0;
  }
}
