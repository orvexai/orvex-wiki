import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { EventName } from '../../common/events/event.contants';
import { PageEvent } from '../../database/listeners/page.listener';

/**
 * ENG-1447 AC7 — defensive orphan-sweep backstop.
 *
 * Provenance is stored INLINE on `pages` (see the sibling
 * `20260708T090000-orvex-provenance-columns` migration), so a hard page
 * delete (`PageService.forceDelete`) removes a page's provenance columns in
 * the SAME `DELETE FROM pages` statement that removes the row — there is no
 * separate-store orphan class for the CURRENT schema to reconcile.
 *
 * This listener is still the real, wired backstop AC7 asks for: it reacts
 * to every `page.deleted` event (mirroring `ApiKeyOrphanReconcileListener`'s
 * ENG-1380 pattern) and re-checks each reported-deleted pageId against
 * `pages`. Under the inline-column schema this should ALWAYS find nothing —
 * but if it ever finds a lingering row still carrying a provenance stamp
 * (e.g. a future refactor reintroduces a separate provenance store, or a
 * soft-delete path leaves a row behind), it clears that row's provenance
 * columns and logs loudly. It never silently no-ops on a genuine orphan.
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
      .selectFrom('pages')
      .select(['id'])
      .where('id', 'in', pageIds)
      .where('provenanceStatus', 'is not', null)
      .execute();

    if (lingering.length === 0) return;

    const lingeringIds = lingering.map((row) => row.id);
    this.logger.error(
      `Provenance orphan-sweep: ${lingeringIds.length} page(s) reported ` +
        `deleted via page.deleted still carry a provenance stamp ` +
        `(${lingeringIds.join(', ')}). Clearing as a defensive backstop.`,
    );

    await this.db
      .updateTable('pages')
      .set({
        provenanceStatus: null,
        provenanceChangedAt: null,
        provenanceChangedById: null,
      } as any)
      .where('id', 'in', lingeringIds)
      .execute();
  }
}
