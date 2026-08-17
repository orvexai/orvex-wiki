import * as path from 'path';
import { promises as fs } from 'fs';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  sql,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/**
 * A-CELL — `workspaces.cell_id` BACKFILL fidelity.
 *
 * Every other harness runs `migrateToLatest()` against an EMPTY database and
 * inserts rows afterwards, so this migration's `UPDATE workspaces SET cell_id`
 * would never touch a row — only its end-state schema would be checked. But
 * the backfill is the half that runs against REAL tenant data on every
 * existing cell, and it is the half that decides whether a live deployment
 * keeps serving its own tenants or starts 421-ing all of them. So it is
 * exercised here the way it will actually run: pre-existing rows first, then
 * the migration, against a real testcontainers Postgres (CS §5).
 *
 * Driven through the real `Migrator` (not a direct function import) so the
 * exact production `up()`/`down()` entrypoints are what execute.
 */
describe('OrvexWorkspaceCellIdMigrationSpec', () => {
  jest.setTimeout(120_000);

  const PRE_MIGRATION = '20260726T110000-retire-billing';
  const TARGET_MIGRATION = '20260811T090000-orvex-workspace-cell-id';

  /** The cell this "deployment" is migrating — read from env by the migration. */
  const DEPLOYMENT_CELL = 'eu1';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let rawDb: Kysely<any>;
  let db: Kysely<any>;
  let migrator: Migrator;

  let legacyWorkspaceIds: string[];
  let cellIdBefore: string | undefined;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '../'),
      }),
    });

    // Step 1 — migrate to just BEFORE the migration under test: `workspaces`
    // exists and has no cell column at all, exactly like a live cell today.
    const { error: preError } = await migrator.migrateTo(PRE_MIGRATION);
    if (preError) throw preError;

    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    // Step 2 — pre-existing tenants, minted before any cell was recorded.
    const legacy = await db
      .insertInto('workspaces')
      .values([
        { name: 'legacy tenant one', hostname: 'legacy-one' },
        { name: 'legacy tenant two', hostname: 'legacy-two' },
      ])
      .returning('id')
      .execute();
    legacyWorkspaceIds = legacy.map((row: { id: string }) => row.id);

    // Step 3 — run the migration as the eu1 deployment would.
    cellIdBefore = process.env.CELL_ID;
    process.env.CELL_ID = DEPLOYMENT_CELL;
    const { error } = await migrator.migrateTo(TARGET_MIGRATION);
    if (error) throw error;
  });

  afterAll(async () => {
    if (cellIdBefore === undefined) {
      delete process.env.CELL_ID;
    } else {
      process.env.CELL_ID = cellIdBefore;
    }
    await db?.destroy();
    await rawDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('backfills every pre-existing workspace with THIS deployment\'s cell, not the solo sentinel', async () => {
    const rows = await db
      .selectFrom('workspaces')
      .select(['id', 'cellId'])
      .where('id', 'in', legacyWorkspaceIds)
      .execute();

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.cellId).toBe(DEPLOYMENT_CELL);
    }
  });

  it('leaves no workspace without a cell — the column is NOT NULL', async () => {
    const { rows } = await sql<{
      isNullable: string;
      columnDefault: string | null;
    }>`SELECT is_nullable AS "isNullable", column_default AS "columnDefault"
         FROM information_schema.columns
        WHERE table_name = 'workspaces' AND column_name = 'cell_id'`.execute(db);

    expect(rows).toHaveLength(1);
    expect(rows[0].isNullable).toBe('NO');
    expect(rows[0].columnDefault).toMatch(/solo/);
  });

  it('rejects an explicit NULL cell — "unknown cell" is unrepresentable, not merely discouraged', async () => {
    await expect(
      db
        .insertInto('workspaces')
        .values({ name: 'no cell', cellId: null })
        .execute(),
    ).rejects.toThrow();
  });

  it('defaults a row nobody stamped to the FAIL-CLOSED solo sentinel (which a real cell then refuses to serve)', async () => {
    const row = await db
      .insertInto('workspaces')
      .values({ name: 'unstamped tenant' })
      .returning(['cellId'])
      .executeTakeFirstOrThrow();

    // Not `eu1`: an unstamped row must never inherit the serving cell's
    // identity, or the request-time gate would wave through exactly the rows
    // whose provenance is unknown.
    expect(row.cellId).toBe('solo');
  });

  it('down() removes the column cleanly, so the migration is reversible', async () => {
    const { error } = await migrator.migrateTo(PRE_MIGRATION);
    expect(error).toBeUndefined();

    const { rows } = await sql<{ count: string }>`
      SELECT count(*)::text AS count
        FROM information_schema.columns
       WHERE table_name = 'workspaces' AND column_name = 'cell_id'`.execute(db);
    expect(rows[0].count).toBe('0');

    // Restore for any later reader of this container.
    const { error: reUpError } = await migrator.migrateTo(TARGET_MIGRATION);
    expect(reUpError).toBeUndefined();
  });
});
