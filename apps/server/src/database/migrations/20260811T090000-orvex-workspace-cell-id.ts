import { type Kysely, sql } from 'kysely';

import { CELL_SOLO } from '../../orvex/config/orvex-config.service';
import { isCloudSoloCellAtBoot } from '../../orvex/config/orvex-cloud-mode';

/**
 * A-CELL — the per-workspace cell assignment.
 *
 * `cell_id` is NOT NULL so an unknown workspace cell is unrepresentable. The
 * `solo` default is a fail-closed sentinel for rows created without an
 * explicit cell assignment; real provisioning code supplies the deployment's
 * cell. Existing rows are backfilled from this deployment's `CELL_ID`.
 *
 * SAFETY GUARD (ENG-3789 AC1) — `CLOUD=true` together with an unset, blank, or
 * `solo` `CELL_ID` is an invalid deployment state. In that state, the request
 * path already rejects traffic with 421, so using `solo` to backfill every
 * workspace would turn a configuration error into persistent data corruption.
 * The guard is possible because CLOUD distinguishes a legitimate self-hosted
 * solo deployment (`CLOUD=false`) from the invalid cloud shape. It runs before
 * any schema or data mutation and throws loudly so the migration cannot be
 * recorded as successful with a partial backfill.
 *
 * AC2 is intentionally not implemented here: the process-level fail-fast
 * requires ENG-3788's crew posture decision and deployment verification,
 * owned by the ENG-3788 crew/platform decision owner. That gate must land
 * after this migration guard and before adding the main-process hard-stop.
 */
function deploymentCellId(): string {
  const raw = process.env.CELL_ID?.trim();
  return raw === undefined || raw === '' ? CELL_SOLO : raw;
}

export async function up(db: Kysely<any>): Promise<void> {
  if (isCloudSoloCellAtBoot()) {
    throw new Error(
      'ENG-3789 AC1: refusing workspace cell_id migration: CLOUD=true requires a non-solo CELL_ID; refusing to mutate workspaces until the deployment posture is corrected',
    );
  }

  await db.schema
    .alterTable('workspaces')
    .addColumn('cell_id', 'varchar', (col) => col.defaultTo(CELL_SOLO))
    .execute();

  await sql`UPDATE workspaces SET cell_id = ${sql.lit(deploymentCellId())}`.execute(
    db,
  );

  await db.schema
    .alterTable('workspaces')
    .alterColumn('cell_id', (col) => col.setNotNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('workspaces').dropColumn('cell_id').execute();
}
