import { Kysely } from 'kysely';
import { backfillPageContent } from '../../collaboration/backfill-block-ids.util';
import { tiptapExtensions } from '../../collaboration/collaboration.util';

/**
 * ENG-1397 AC4 — legacy block-ID backfill.
 *
 * Widening `UniqueID` coverage (AC1) only stamps ids going forward, at the
 * `PageService` write chokepoint (AC2). Pages that were last written before
 * this leg landed can still have blocks (of the newly-widened types —
 * callouts, columns, tables, media atoms, …) missing an `id`. This
 * migration walks every non-null page content and mints ids only for the
 * nodes that don't already have one — `backfillPageContent` (the SAME
 * helper the write chokepoint uses) never regenerates an existing id, so
 * re-running this migration (or running it after the chokepoint has
 * already stamped a page) is a true no-op for already-stamped rows.
 *
 * Batched by primary key to avoid loading the whole `pages` table at once.
 */
const BATCH_SIZE = 500;

export async function up(db: Kysely<any>): Promise<void> {
  let lastId: string | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = db
      .selectFrom('pages')
      .select(['id', 'content'])
      .where('content', 'is not', null)
      .orderBy('id', 'asc')
      .limit(BATCH_SIZE);

    if (lastId) {
      query = query.where('id', '>', lastId);
    }

    const rows = await query.execute();
    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of rows) {
      if (row.content) {
        const { content: stamped, nodesAdded } = backfillPageContent(
          row.content,
          tiptapExtensions,
        );

        if (nodesAdded > 0) {
          await db
            .updateTable('pages')
            .set({ content: stamped })
            .where('id', '=', row.id)
            .execute();
        }
      }

      lastId = row.id;
    }

    if (rows.length < BATCH_SIZE) {
      hasMore = false;
    }
  }
}

export async function down(): Promise<void> {
  // Additive-only (AC1i — ids are additive + backward-compatible): no
  // down-migration mints/removes ids. Nothing to revert.
}
