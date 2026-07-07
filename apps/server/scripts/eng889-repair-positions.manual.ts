/**
 * MANUAL — human-review + run explicitly against prod; NOT an auto-run migration.
 *
 * ENG-889 / ENG-1372: data-repair script for pages whose `position` column
 * holds legacy drift — a literal keyword ("child", "before", "after", or the
 * "before:<id>"/"after:<id>" forms), a null value, or a value that duplicates
 * a sibling's position — instead of a valid, unique fractional-index key.
 * Drifted rows can cause intermittent 500s on otherwise-valid moves (the
 * fractional-indexing library rejects non-key inputs) and unstable sibling
 * ordering in the UI.
 *
 * DESIGN NOTE — "prior visual order": once a position is corrupt (null,
 * keyword, or duplicated), the position column itself can no longer tell us
 * what order the page used to render in. This script uses `created_at`
 * ascending as the best available proxy for that prior visual order and,
 * for every (space, parent) sibling group that contains at least one
 * corrupt/duplicate row, rewrites the WHOLE group's positions to fresh,
 * strictly-increasing fractional-index keys in `created_at` order. This never
 * changes which pages are siblings of which, and never changes their
 * relative (created_at) order — it only replaces the position values with
 * valid, unique ones.
 *
 * HOW TO RUN (against a local DB for testing):
 *   DATABASE_URL=postgres://... npx ts-node -P apps/server/tsconfig.json apps/server/scripts/eng889-repair-positions.manual.ts
 *
 * HOW TO RUN (against production — must be reviewed by a human first):
 *   1. Take a database snapshot / point-in-time backup.
 *   2. Run in DRY_RUN=true mode first; inspect the output.
 *   3. Run with DRY_RUN=false after verifying the plan looks correct.
 *   4. Verify by re-running in DRY_RUN=true — it should report 0 drifted groups.
 *
 * Environment variables:
 *   DATABASE_URL  — Postgres connection string (required)
 *   DRY_RUN       — "true" (default) prints what WOULD happen; "false" commits fixes
 */

import { Kysely, CamelCasePlugin } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { isCorruptPosition } from '../src/orvex/page-position.util';

interface SiblingRow {
  id: string;
  position: string | null;
  spaceId: string;
  parentPageId: string | null;
  createdAt: Date;
}

interface RepairPlanItem {
  id: string;
  from: string | null;
  to: string;
}

export function groupKey(row: Pick<SiblingRow, 'spaceId' | 'parentPageId'>) {
  return `${row.spaceId}::${row.parentPageId ?? 'ROOT'}`;
}

/**
 * Pure planning function (no DB/IO) so it can be unit/integration tested
 * without mocking Postgres. Given all non-deleted pages, returns the set of
 * writes needed to repair every sibling group that contains drift.
 */
export function planRepair(rows: SiblingRow[]): {
  drifted: RepairPlanItem[];
  groupsWithDrift: number;
} {
  const groups = new Map<string, SiblingRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const drifted: RepairPlanItem[] = [];
  let groupsWithDrift = 0;

  for (const siblings of groups.values()) {
    const seenPositions = new Set<string>();
    const duplicatePositions = new Set<string>();
    for (const s of siblings) {
      if (s.position && seenPositions.has(s.position)) {
        duplicatePositions.add(s.position);
      }
      if (s.position) seenPositions.add(s.position);
    }

    const hasDrift = siblings.some(
      (s) =>
        isCorruptPosition(s.position) ||
        (s.position && duplicatePositions.has(s.position)),
    );
    if (!hasDrift) continue;

    groupsWithDrift++;

    // Prior-visual-order proxy: created_at ascending (see header note).
    const ordered = [...siblings].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    let cursor: string | null = null;
    for (const s of ordered) {
      const newPosition = generateJitteredKeyBetween(cursor, null);
      drifted.push({ id: s.id, from: s.position, to: newPosition });
      cursor = newPosition;
    }
  }

  return { drifted, groupsWithDrift };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — only runs when invoked directly (not when imported by tests)
// ---------------------------------------------------------------------------

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const DRY_RUN = process.env.DRY_RUN !== 'false';
  console.log(
    `[eng889-repair] mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will commit)'}`,
  );
  console.log(`[eng889-repair] started at ${new Date().toISOString()}`);

  const db = new Kysely<any>({
    dialect: new PostgresJSDialect({
      postgres: postgres(DATABASE_URL, { onnotice: () => {} }),
    }),
    plugins: [new CamelCasePlugin()],
  });

  try {
    const rows = (await db
      .selectFrom('pages')
      .select(['id', 'position', 'spaceId', 'parentPageId', 'createdAt'])
      .where('deletedAt', 'is', null)
      .execute()) as SiblingRow[];

    const { drifted, groupsWithDrift } = planRepair(rows);

    if (drifted.length === 0) {
      console.log('[eng889-repair] no drifted sibling groups found — nothing to do');
      return;
    }

    console.log(
      `[eng889-repair] found ${groupsWithDrift} drifted sibling group(s), ${drifted.length} row(s) to rewrite:`,
    );
    for (const item of drifted) {
      console.log(`  page=${item.id} "${item.from}" -> "${item.to}"`);
    }

    if (DRY_RUN) {
      console.log('[eng889-repair] DRY RUN — set DRY_RUN=false to apply fixes');
      return;
    }

    let fixed = 0;
    let errors = 0;
    for (const item of drifted) {
      try {
        await db
          .updateTable('pages')
          .set({ position: item.to })
          .where('id', '=', item.id)
          .execute();
        fixed++;
      } catch (err) {
        console.error(`[eng889-repair] ERROR fixing page=${item.id}: ${(err as Error).message}`);
        errors++;
      }
    }

    console.log(
      `[eng889-repair] done: fixed=${fixed} errors=${errors} at ${new Date().toISOString()}`,
    );
    if (errors > 0) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[eng889-repair] fatal:', err);
    process.exit(1);
  });
}
