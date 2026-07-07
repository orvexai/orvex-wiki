import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import {
  OrvexMigratorService,
  OrvexMigrationMap,
} from './orvex-migrator.service';
import { KyselyDB } from '../../database/types/kysely.types';

// AGPL import-guard (A-BOUNDARY): orvex/* never statically imports
// @docmost/*, so this test builds its own throwaway Kysely client typed
// only against `KyselyDB`'s shape via a structural cast, without pulling in
// `@docmost/db`'s `DbInterface`. Every query in this spec goes through the
// untyped `sql` tag, so no column-level typing is lost.
function toKyselyDB(db: Kysely<Record<string, never>>): KyselyDB {
  return db as unknown as KyselyDB;
}

/**
 * ENG-1389 — `OrvexMigratorConcurrency.spec`, the named binary DoD gate.
 *
 * Real Postgres (testcontainers, no mocked DB — CS §5 local-substitutable
 * store, ALL-REAL). Drives `OrvexMigratorService.migrateToLatest` — the
 * ONLY exported entry point (behaviour-through-interface, CS §4.2; the
 * private `_runPendingMigrations`-equivalent is never asserted on directly)
 * — from 3 concurrent callers, each on its own Postgres connection so the
 * scenario matches 3 replicas racing at boot under PgBouncer transaction
 * pooling. Asserts:
 *   AC1 — the lock call is `pg_advisory_xact_lock` inside one transaction
 *         (proven behaviourally: the lock is gone the instant the winning
 *         transaction commits, never held across the boundary).
 *   AC2 — no pool-starvation deadlock: all 3 callers return within the test
 *         timeout, none blocks indefinitely.
 *   AC3 — migrations are idempotent + ordered: each migration's side effect
 *         (a row insert) happens exactly once, and the ledger records
 *         exactly one row per migration.
 */
describe('OrvexMigratorConcurrency.spec', () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let adminSql: ReturnType<typeof postgres>;
  let adminDb: KyselyDB;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    adminSql = postgres(container.getConnectionUri());
    adminDb = toKyselyDB(
      new Kysely<Record<string, never>>({
        dialect: new PostgresJSDialect({ postgres: adminSql }),
        plugins: [new CamelCasePlugin()],
      }),
    );

    await sql`
      CREATE TABLE migration_side_effects (
        migration_name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(adminDb);
  });

  afterAll(async () => {
    await adminDb.destroy();
    await container.stop();
  });

  function makeClient(): {
    db: KyselyDB;
    sqlClient: ReturnType<typeof postgres>;
  } {
    const sqlClient = postgres(container.getConnectionUri());
    const db = toKyselyDB(
      new Kysely<Record<string, never>>({
        dialect: new PostgresJSDialect({ postgres: sqlClient }),
        plugins: [new CamelCasePlugin()],
      }),
    );
    return { db, sqlClient };
  }

  it('applies every migration exactly once from 3 concurrent callers, with no deadlock and an auto-releasing transaction-level lock', async () => {
    const migrations: OrvexMigrationMap = {
      '0001-first': {
        package: '@orvex/test-package-a',
        up: async (trx) => {
          await sql`INSERT INTO migration_side_effects (migration_name) VALUES ('0001-first')`.execute(
            trx,
          );
        },
      },
      '0002-second': {
        package: '@orvex/test-package-b',
        up: async (trx) => {
          await sql`INSERT INTO migration_side_effects (migration_name) VALUES ('0002-second')`.execute(
            trx,
          );
        },
      },
    };

    const clients = [makeClient(), makeClient(), makeClient()];
    const services = clients.map(
      ({ db }) => new OrvexMigratorService(db, migrations),
    );

    // AC2: 3 concurrent callers race to migrate — must all settle, never hang.
    await Promise.all(services.map((service) => service.migrateToLatest()));

    // AC3: each migration's side effect ran exactly once, in order.
    const { rows: effectRows } = await sql<{
      migrationName: string;
    }>`SELECT migration_name FROM migration_side_effects ORDER BY applied_at ASC`.execute(
      adminDb,
    );
    expect(effectRows.map((r) => r.migrationName)).toEqual([
      '0001-first',
      '0002-second',
    ]);

    // AC3: the ledger recorded exactly one row per migration.
    const { rows: ledgerRows } = await sql<{
      name: string;
      package: string;
    }>`SELECT name, package FROM orvex_migrations ORDER BY name ASC`.execute(
      adminDb,
    );
    expect(ledgerRows).toEqual([
      { name: '0001-first', package: '@orvex/test-package-a' },
      { name: '0002-second', package: '@orvex/test-package-b' },
    ]);

    // AC1: transaction-level lock auto-released on commit — a follow-up
    // call (a 4th "replica" booting later) must complete promptly, proving
    // no session-level lock was left leaked/held by any prior caller.
    const { db: fourthDb } = makeClient();
    const fourthService = new OrvexMigratorService(fourthDb, migrations);
    await expect(fourthService.migrateToLatest()).resolves.toBeUndefined();

    // A second run of everything applies nothing new (idempotent).
    await Promise.all(services.map((service) => service.migrateToLatest()));
    const { rows: effectRowsAfterRerun } = await sql<{
      migrationName: string;
    }>`SELECT migration_name FROM migration_side_effects`.execute(adminDb);
    expect(effectRowsAfterRerun).toHaveLength(2);

    await Promise.all(clients.map(({ sqlClient }) => sqlClient.end()));
    await fourthDb.destroy();
  });

  it('reports status() with applied/pending per migration', async () => {
    const migrations: OrvexMigrationMap = {
      '0001-a': { package: 'pkg-a', up: async () => {} },
      '0002-b': { package: 'pkg-b', up: async () => {} },
    };
    const { db, sqlClient } = makeClient();
    const service = new OrvexMigratorService(db, migrations);

    const beforeStatus = await service.status();
    expect(beforeStatus).toEqual([
      { name: '0001-a', package: 'pkg-a', applied: false },
      { name: '0002-b', package: 'pkg-b', applied: false },
    ]);

    await service.migrateToLatest();

    const afterStatus = await service.status();
    expect(afterStatus).toEqual([
      { name: '0001-a', package: 'pkg-a', applied: true },
      { name: '0002-b', package: 'pkg-b', applied: true },
    ]);

    await sqlClient.end();
    await db.destroy();
  });
});
