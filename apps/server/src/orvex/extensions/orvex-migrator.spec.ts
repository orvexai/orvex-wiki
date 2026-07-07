import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { OrvexDb, OrvexMigrationProvider } from '@orvex/extensions';

import { OrvexMigratorService } from './orvex-migrator.service';

interface IdRow {
  id: string;
}

interface NameRow {
  name: string;
}

/**
 * ENG-1411 §5a — NAMED DoD TEST (binary gate):
 * "OrvexMigratorService — serializes all package migrations under one
 * advisory lock, idempotent + ordered".
 *
 * Real Postgres (this repo's dev DATABASE_URL), never mocked (own package —
 * CS ❌#4). Three concurrent callers simulate three replicas booting at once.
 */
describe('OrvexMigratorService › serializes all package migrations under one advisory lock, idempotent + ordered', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = Math.random().toString(36).slice(2, 10);
  const logTable = `orvex_migrator_test_log_${suffix}`;
  let tmpRoot: string;
  const connections: Kysely<OrvexDb>[] = [];

  function newConnection(): Kysely<OrvexDb> {
    return new Kysely<OrvexDb>({
      dialect: new PostgresJSDialect({
        postgres: postgres(databaseUrl, { max: 1, onnotice: () => {} }),
      }),
    });
  }

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not set — this DoD test requires a real Postgres ' +
          '(copy .env.dev into the worktree or export DATABASE_URL).',
      );
    }

    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orvex-migrator-spec-'));

    // Two packages, three migrations total, to exercise cross-package
    // lexicographic ordering (pkg-a before pkg-b; 001 before 002).
    const pkgADir = path.join(tmpRoot, 'pkg-a');
    const pkgBDir = path.join(tmpRoot, 'pkg-b');
    await fs.mkdir(pkgADir, { recursive: true });
    await fs.mkdir(pkgBDir, { recursive: true });

    // Plain CommonJS fixtures (not TS): a real orvex sibling package's
    // migrations are required from its BUILT dist/ output in production
    // (see resolveSiblingMigrationsDir), i.e. plain JS with no access to this
    // repo's tsconfig/node_modules — exactly what these on-disk fixtures
    // simulate. ts-jest emits a harmless "allowJs not set" warning for these
    // (jest's require hook inspects every required file); it is not an error.
    // The `db` argument is a live Kysely instance (no import needed — its
    // methods are already bound on the object the migrator passes in), so
    // these plain-JS fixtures use the ordinary query-builder methods, exactly
    // like a real sibling package's compiled migration would.
    const migrationSource = (label: string) => `
      exports.up = async (db) => {
        await db.insertInto('${logTable}').values({ id: '${label}' }).execute();
      };
      exports.down = async (db) => {
        await db.deleteFrom('${logTable}').where('id', '=', '${label}').execute();
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

    // Bootstrap connection: create the shared log table used by the fixture
    // migrations to record exactly-once application.
    const bootstrap = newConnection();
    connections.push(bootstrap);
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql.raw(logTable)} (
        id varchar PRIMARY KEY
      )
    `.execute(bootstrap);
  });

  afterAll(async () => {
    const cleanup = newConnection();
    await sql`DROP TABLE IF EXISTS ${sql.raw(logTable)}`.execute(cleanup);
    await sql`DELETE FROM orvex_migrations WHERE name LIKE 'pkg-%'`.execute(
      cleanup,
    );
    connections.push(cleanup);
    await Promise.all(connections.map((c) => c.destroy()));
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('applies every pending migration exactly once, in lexicographic order, under one pg_advisory_xact_lock; a second run applies zero', async () => {
    const provider = new OrvexMigrationProvider([
      { package: 'pkg-a', migrationsDir: path.join(tmpRoot, 'pkg-a') },
      { package: 'pkg-b', migrationsDir: path.join(tmpRoot, 'pkg-b') },
    ]);

    // Three replicas racing to migrate concurrently on independent pooled
    // connections — this is what pg_advisory_xact_lock must serialize.
    const replicaConnections = [
      newConnection(),
      newConnection(),
      newConnection(),
    ];
    connections.push(...replicaConnections);
    const services = replicaConnections.map(
      (db) => new OrvexMigratorService(db, provider),
    );

    const results = await Promise.all(
      services.map((s) => s.migrateToLatest()),
    );

    // Across the three concurrent callers, each of the 3 migrations was
    // applied by exactly one of them in total.
    const allApplied = results.flatMap((r) => r.applied).sort();
    expect(allApplied).toEqual([
      'pkg-a/001-a-first',
      'pkg-b/001-b-first',
      'pkg-b/002-b-second',
    ]);

    // Exactly-once execution: the fixture migrations INSERT into logTable
    // with a fixed PK per migration; a double-apply would have thrown a
    // duplicate-key error and failed this test above.
    const logRows = await sql<IdRow>`SELECT id FROM ${sql.raw(logTable)}`.execute(
      replicaConnections[0],
    );
    expect(logRows.rows.map((r) => r.id).sort()).toEqual([
      'pkg-a/001-a-first',
      'pkg-b/001-b-first',
      'pkg-b/002-b-second',
    ]);

    // Tracking table has exactly one row per migration key.
    const trackedRows = await sql<NameRow>`
      SELECT name FROM orvex_migrations WHERE name LIKE 'pkg-%'
    `.execute(replicaConnections[0]);
    expect(trackedRows.rows.map((r) => r.name).sort()).toEqual([
      'pkg-a/001-a-first',
      'pkg-b/001-b-first',
      'pkg-b/002-b-second',
    ]);

    // Second run (idempotency): applies zero, no error.
    const second = await services[0].migrateToLatest();
    expect(second.applied).toEqual([]);
  }, 30000);
});
