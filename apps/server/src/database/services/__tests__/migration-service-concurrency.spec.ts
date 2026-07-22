import { readdirSync } from 'fs';
import { join } from 'path';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { MigrationService } from '../migration.service';
import { KyselyDB } from '@docmost/db/types/kysely.types';

/**
 * ENG-2479 T3 — `TestCoreMigrationServiceSerialisesUnderConcurrency`.
 *
 * The core-chain half of AC1. Mirrors
 * `orvex/extensions/orvex-migrator.concurrency.spec.ts`'s own harness shape
 * (real testcontainers Postgres, N concurrent callers on independent
 * connections, no mock of the migrator or the driver — CS §5/❌#4), but
 * drives the PRODUCTION `MigrationService` (`database/services/migration.service.ts`)
 * against the REAL migration folder (`database/migrations/`, ~50+ files),
 * not a synthetic 2-migration set — this is the actual boot-time migrator
 * `DatabaseModule.onApplicationBootstrap` calls.
 *
 * Finding recorded here (see PR/Issue comment for the full writeup):
 * `MigrationService.migrateToLatest()` has no `pg_advisory_xact_lock` call
 * in ITS OWN source (grep confirms zero hits, matching the ticket's "Verified
 * live" note) — but Kysely's own `PostgresAdapter#acquireMigrationLock`
 * (`kysely/dist/.../dialect/postgres/postgres-adapter.js`) unconditionally
 * takes `pg_advisory_xact_lock(3853314791062309107)` *inside* the same
 * transaction `Migrator#runMigrations` wraps every apply-batch in, for ANY
 * Postgres dialect whose adapter is Kysely's own `PostgresAdapter` —
 * `kysely-postgres-js`'s `PostgresJSDialect.createAdapter()` returns exactly
 * that class, byte-identical to what `database.module.ts` uses in
 * production. So this half of AC1 ("two concurrent replica boots
 * serialise... no duplicate-apply") is asserted here as behaviour this repo
 * ALREADY gets for free from the upstream library — this spec is
 * regression-proof for that behaviour, not a RED-then-GREEN production-code
 * change. See the PR body for why no second (redundant, and for a
 * PgBouncer-fronted deployment, actively risky per `OrvexMigratorService`'s
 * own session-lock docstring) lock was added on top of it.
 */
describe('MigrationServiceConcurrency.spec', () => {
  jest.setTimeout(300_000);

  let container: StartedPostgreSqlContainer;
  let adminSql: ReturnType<typeof postgres>;
  let adminDb: KyselyDB;
  let exitSpy: jest.SpyInstance;

  const migrationsDir = join(__dirname, '../../migrations');
  const migrationFileCount = readdirSync(migrationsDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== '__tests__',
  ).length;

  function toKyselyDB(db: Kysely<Record<string, never>>): KyselyDB {
    return db as unknown as KyselyDB;
  }

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

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    adminSql = postgres(container.getConnectionUri());
    adminDb = toKyselyDB(
      new Kysely<Record<string, never>>({
        dialect: new PostgresJSDialect({ postgres: adminSql }),
        plugins: [new CamelCasePlugin()],
      }),
    );
  });

  afterAll(async () => {
    await adminDb.destroy();
    await container.stop();
  });

  beforeEach(() => {
    // Guard (plan risk #3): if a genuine race ever reappears, the service's
    // `process.exit(1)` on migrator error would kill the Jest worker before
    // any assertion could run. Stub it so a regression surfaces as a normal
    // thrown/rejected assertion instead of a silently-dead test process.
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit(${code}) called`);
      }) as unknown as jest.SpyInstance;
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('applies the full real migration chain exactly once from 3 concurrent MigrationService callers, then no-ops on a 4th sequential boot', async () => {
    const clients = [makeClient(), makeClient(), makeClient()];
    const services = clients.map(({ db }) => new MigrationService(db));

    // AC1 — N>=3 concurrent replicas booting simultaneously must serialise,
    // never duplicate-apply, never deadlock/hang.
    await Promise.all(services.map((service) => service.migrateToLatest()));

    expect(exitSpy).not.toHaveBeenCalled();

    // Exactly-once apply: the ledger has exactly one row per real migration
    // file — a race that double-applied (or double-recorded) any migration
    // would either violate `kysely_migration`'s primary key (surfacing as
    // an `error` -> `process.exit(1)`, caught by the spy above) or show up
    // here as a row-count mismatch.
    const { rows: ledgerRows } = await sql<{ name: string }>`
      SELECT name FROM kysely_migration ORDER BY name ASC
    `.execute(adminDb);
    expect(ledgerRows).toHaveLength(migrationFileCount);

    // A representative core table exists exactly once (no duplicate-CREATE
    // error was swallowed anywhere in the chain).
    const { rows: workspaceTables } = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'workspaces'
    `.execute(adminDb);
    expect(workspaceTables).toHaveLength(1);

    // AC1 — "second boot no-ops": a 4th replica booting after the race has
    // settled must complete promptly and apply nothing new.
    const { db: fourthDb, sqlClient: fourthSql } = makeClient();
    const fourthService = new MigrationService(fourthDb);
    await expect(fourthService.migrateToLatest()).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();

    const { rows: ledgerRowsAfter } = await sql<{ name: string }>`
      SELECT name FROM kysely_migration
    `.execute(adminDb);
    expect(ledgerRowsAfter).toHaveLength(migrationFileCount);

    await Promise.all(clients.map(({ sqlClient }) => sqlClient.end()));
    await Promise.all(clients.map(({ db }) => db.destroy()));
    await fourthSql.end();
    await fourthDb.destroy();
  });
});
