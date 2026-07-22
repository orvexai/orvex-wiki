/**
 * ENG-2479 — child-process fixture for
 * `migration-failure-exits.spec.ts` (`TestMigrationFailureExitsProcessNonZero`).
 *
 * `MigrationService.migrateToLatest()` calls `process.exit(1)` directly on a
 * genuine migrator error. Driving that in-process from Jest would kill the
 * whole worker before any assertion runs (a risk this ticket's own plan
 * flags). This script runs the REAL `MigrationService` against a REAL
 * Postgres (connection string passed via `DATABASE_URL`) in an isolated
 * child process, so the parent Jest process can observe the exit code
 * cleanly via `spawnSync` instead of dying with it.
 *
 * Failure is forced by the most realistic trigger available without
 * mocking the migrator itself (❌#4): pre-seed `kysely_migration` with a row
 * for a migration name that does not exist on disk. Kysely's own
 * `#ensureNoMissingMigrations` check (real library code, not stubbed) then
 * throws "corrupted migrations: previously executed migration ... is
 * missing", `Migrator#migrateToLatest` returns it as `{ error }` (never
 * throws, per its own contract), and `MigrationService` takes its existing,
 * unmodified `if (error) { ...; process.exit(1); }` branch.
 */
import postgres from 'postgres';
import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import { MigrationService } from '../../migration.service';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(2);
  }

  const sqlClient = postgres(databaseUrl);
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresJSDialect({ postgres: sqlClient }),
    plugins: [new CamelCasePlugin()],
  });

  // Seed a `kysely_migration` ledger with a row Kysely will never resolve
  // from the real migration folder, forcing a genuine, real error return
  // from `Migrator#migrateToLatest()` on the very first call.
  await sql`
    CREATE TABLE IF NOT EXISTS kysely_migration (
      name varchar(255) NOT NULL PRIMARY KEY,
      timestamp varchar(255) NOT NULL
    )
  `.execute(db);
  await sql`
    INSERT INTO kysely_migration (name, timestamp)
    VALUES ('00000000T000000-eng-2479-fixture-bogus-migration', ${new Date().toISOString()})
  `.execute(db);

  const service = new MigrationService(db as any);
  await service.migrateToLatest();

  // Only reached if migrateToLatest() did NOT exit — an unexpected-success
  // signal the parent test asserts against explicitly, rather than the
  // child process just hanging or exiting 0 ambiguously.
  console.log('ENG-2479-FIXTURE-UNEXPECTED-SUCCESS');
  await db.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('ENG-2479-FIXTURE-UNCAUGHT', err);
  process.exit(3);
});
