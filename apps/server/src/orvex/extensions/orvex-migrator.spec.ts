import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { OrvexMigrationProvider } from '@orvex/extensions';

import { OrvexMigratorService } from './orvex-migrator.service';
import { buildOrvexMigrations } from './orvex-migration-registry';
import { KyselyDB } from '../../database/types/kysely.types';

// AGPL import-guard (A-BOUNDARY): orvex/* never statically imports
// @docmost/*, so this test builds its own throwaway Kysely client typed only
// against `KyselyDB`'s shape via a structural cast (mirrors
// orvex-migrator.concurrency.spec.ts, ENG-1389).
function toKyselyDB(db: Kysely<Record<string, never>>): KyselyDB {
  return db as unknown as KyselyDB;
}

/**
 * ENG-1411 §5a — NAMED DoD TEST (binary gate), reconciled per PD-4d
 * (2026-07-08): "OrvexMigratorService › serializes all package migrations
 * under one advisory lock, idempotent + ordered", expressed against the
 * MERGED ENG-1389 migrator fed by the package-local `OrvexMigrationProvider`
 * registry via `buildOrvexMigrations` — the seam this ticket delivers.
 *
 * Real Postgres (testcontainers), never mocked (own package — CS ❌#4).
 * Three concurrent callers simulate three replicas booting at once, each
 * driving `OrvexMigratorService.migrateToLatest()` — the only exported entry
 * point (behaviour-through-service-API; survives internal rename).
 */
describe('OrvexMigratorService › serializes all package migrations under one advisory lock, idempotent + ordered', () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let adminSql: ReturnType<typeof postgres>;
  let adminDb: KyselyDB;
  let tmpRoot: string;

  function newConnection(): KyselyDB {
    return toKyselyDB(
      new Kysely<Record<string, never>>({
        dialect: new PostgresJSDialect({
          postgres: postgres(container.getConnectionUri()),
        }),
        plugins: [new CamelCasePlugin()],
      }),
    );
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    adminSql = postgres(container.getConnectionUri());
    adminDb = newConnection();

    tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'orvex-migrator-provider-spec-'),
    );

    // Two package dirs, three migration files, to exercise cross-package
    // lexicographic `package/NNN-stem` ordering (AC5): pkg-a before pkg-b;
    // 001 before 002 within pkg-b.
    const pkgADir = path.join(tmpRoot, 'pkg-a');
    const pkgBDir = path.join(tmpRoot, 'pkg-b');
    await fs.mkdir(pkgADir, { recursive: true });
    await fs.mkdir(pkgBDir, { recursive: true });

    const migrationSource = (label: string) => `
      exports.up = async (db) => {
        await db.insertInto('migration_side_effects').values({ id: '${label}' }).execute();
      };
    `;
    await fs.writeFile(
      path.join(pkgADir, '001-a-first.js'),
      migrationSource('pkg-a/001-a-first'),
    );
    await fs.writeFile(
      path.join(pkgBDir, '001-b-first.js'),
      migrationSource('pkg-b/001-b-first'),
    );
    await fs.writeFile(
      path.join(pkgBDir, '002-b-second.js'),
      migrationSource('pkg-b/002-b-second'),
    );

    await sql`
      CREATE TABLE migration_side_effects (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(adminDb);
  });

  afterAll(async () => {
    await adminDb.destroy();
    await adminSql.end();
    await container.stop();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('applies every pending package migration exactly once, in package/NNN-stem lexicographic order, from 3 concurrent replicas; a second run applies zero', async () => {
    const provider = new OrvexMigrationProvider([
      { package: 'pkg-a', migrationsDir: path.join(tmpRoot, 'pkg-a') },
      { package: 'pkg-b', migrationsDir: path.join(tmpRoot, 'pkg-b') },
    ]);
    const migrations = await buildOrvexMigrations(provider);

    expect(Object.keys(migrations)).toEqual([
      'pkg-a/001-a-first',
      'pkg-b/001-b-first',
      'pkg-b/002-b-second',
    ]);

    // AC2: 3 concurrent callers (3 "replicas"), each on its own pooled
    // connection, race to migrate — must all settle, never hang or double-apply.
    const services = [newConnection(), newConnection(), newConnection()].map(
      (db) => new OrvexMigratorService(db, migrations),
    );
    await Promise.all(services.map((service) => service.migrateToLatest()));

    // AC3: each migration's side effect ran exactly once (a duplicate-key
    // error on the PK insert would have thrown and failed this test).
    const { rows: effectRows } = await sql<{
      id: string;
    }>`SELECT id FROM migration_side_effects ORDER BY applied_at ASC`.execute(
      adminDb,
    );
    expect(effectRows.map((r) => r.id)).toEqual([
      'pkg-a/001-a-first',
      'pkg-b/001-b-first',
      'pkg-b/002-b-second',
    ]);

    // AC3: the ledger recorded exactly one row per migration, package
    // correctly attributed.
    const { rows: ledgerRows } = await sql<{
      name: string;
      package: string;
    }>`SELECT name, package FROM orvex_migrations ORDER BY name ASC`.execute(
      adminDb,
    );
    expect(ledgerRows).toEqual([
      { name: 'pkg-a/001-a-first', package: 'pkg-a' },
      { name: 'pkg-b/001-b-first', package: 'pkg-b' },
      { name: 'pkg-b/002-b-second', package: 'pkg-b' },
    ]);

    // AC1: the lock is transaction-scoped and auto-releases on commit — a
    // 4th "replica" booting later must complete promptly, proving no
    // session-level lock leaked from any prior caller.
    const fourthService = new OrvexMigratorService(
      newConnection(),
      migrations,
    );
    await expect(fourthService.migrateToLatest()).resolves.toBeUndefined();

    // Idempotency: a second full run applies nothing new.
    await Promise.all(services.map((service) => service.migrateToLatest()));
    const { rows: effectRowsAfterRerun } = await sql<{
      id: string;
    }>`SELECT id FROM migration_side_effects`.execute(adminDb);
    expect(effectRowsAfterRerun).toHaveLength(3);
  });
});
