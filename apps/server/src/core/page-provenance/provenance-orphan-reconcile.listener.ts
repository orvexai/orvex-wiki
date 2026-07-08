import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EventName } from '../../common/events/event.contants';
import { PageEvent } from '../../database/listeners/page.listener';

/**
 * ENG-1447 AC7 — defensive orphan-sweep backstop.
 *
 * ENG-1603: provenance now lives in the `orvex_page_meta` side table (moved
 * off `pages`, see `20260709T090000-migrate-provenance-trio-to-page-meta`).
 * `orvex_page_meta.page_id` carries an in-DB FK with `ON DELETE CASCADE`
 * (ENG-1471), so a hard page delete (`PageService.forceDelete`) removes the
 * meta row — provenance trio included — via the FK cascade the SAME
 * statement that removes the `pages` row triggers. There is no
 * separate-store orphan class for the CURRENT (single-DB) schema to
 * reconcile.
 *
 * This listener is still the real, wired backstop AC7 asks for: it reacts
 * to every `page.deleted` event (mirroring `ApiKeyOrphanReconcileListener`'s
 * ENG-1380 pattern) and re-checks each reported-deleted pageId against
 * `orvex_page_meta`. Under the cascade-backed schema this should ALWAYS
 * find nothing — but if it ever finds a lingering meta row still carrying a
 * provenance stamp (e.g. a future refactor moves `orvex_page_meta` to a
 * separate store with no cross-DB cascade available, per ruling 7), it
 * clears that row's provenance columns and logs loudly. It never silently
 * no-ops on a genuine orphan.
 */
@Injectable()
export class ProvenanceOrphanReconcileListener {
  private readonly logger = new Logger(
    ProvenanceOrphanReconcileListener.name,
  );

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @OnEvent(EventName.PAGE_DELETED)
  async handlePageDeleted(event: PageEvent): Promise<void> {
    const { pageIds } = event;
    if (!pageIds?.length) return;

    const lingering = await this.db
      .selectFrom('orvexPageMeta')
      .select(['pageId'])
      .where('pageId', 'in', pageIds)
      .where('provenanceStatus', 'is not', null)
      .execute();

    if (lingering.length === 0) return;

    const lingeringIds = lingering.map((row) => row.pageId);
    this.logger.error(
      `Provenance orphan-sweep: ${lingeringIds.length} page(s) reported ` +
        `deleted via page.deleted still carry a provenance stamp ` +
        `(${lingeringIds.join(', ')}). Clearing as a defensive backstop.`,
    );

    await this.db
      .updateTable('orvexPageMeta')
      .set({
        provenanceStatus: null,
        provenanceChangedAt: null,
        provenanceChangedById: null,
      } as any)
      .where('pageId', 'in', lingeringIds)
      .execute();
  }
}
