import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely, sql } from 'kysely';
import {
  OrvexDb,
  OrvexMigrationProvider,
  ensureOrvexMigrationsTable,
} from '@orvex/extensions';

export interface OrvexMigratorStatus {
  applied: string[];
  pending: string[];
}

interface OrvexMigrationRow {
  name: string;
}

/**
 * ENG-1411 AC4/AC5 — serializes every package-local orvex migration under ONE
 * `pg_advisory_xact_lock` transaction so N concurrently-booting replicas apply
 * each migration exactly once, in deterministic lexicographic order, and a
 * second run is a no-op. Never mocked (own package — CS ❌#4): tested against
 * a real Postgres (see orvex-migrator.spec.ts).
 *
 * Reads/writes the `orvex_migrations` tracking table via the raw `sql` tag
 * rather than the schema-typed query builder (CS ❌#12: no `any` on this
 * package's exported surface — see OrvexDb).
 *
 * A single fixed advisory-lock key. Chosen arbitrarily but stably — changing
 * it would allow two deploys of different versions to race, so it must never
 * be derived from anything that varies across replicas/deploys.
 */
@Injectable()
export class OrvexMigratorService {
  private static readonly MIGRATION_LOCK_KEY = 7432819201;

  private readonly logger = new Logger(OrvexMigratorService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<OrvexDb>,
    @Optional()
    private readonly provider: OrvexMigrationProvider = new OrvexMigrationProvider(),
  ) {}

  /**
   * Applies every pending package migration exactly once, inside a single
   * `pg_advisory_xact_lock` transaction on one pooled connection (no
   * PgBouncer session-lock leak, no double-apply). Fails closed: a migration
   * error aborts the transaction and rethrows — never a half-migrated silent
   * state (CS §10).
   */
  async migrateToLatest(): Promise<{ applied: string[] }> {
    const migrations = await this.provider.getMigrations();
    const applied: string[] = [];

    await this.db.transaction().execute(async (trx) => {
      // The lock MUST be acquired before ensureOrvexMigrationsTable, not
      // after: `CREATE TABLE IF NOT EXISTS` is not atomic against concurrent
      // callers in Postgres (two replicas racing on first boot can both pass
      // the existence check and collide on catalog rows). Serializing the
      // whole read-check-apply sequence under the lock is what makes this
      // safe for N concurrently-booting replicas.
      await sql`SELECT pg_advisory_xact_lock(${OrvexMigratorService.MIGRATION_LOCK_KEY})`.execute(
        trx,
      );
      await ensureOrvexMigrationsTable(trx);

      const alreadyApplied = await sql<OrvexMigrationRow>`
        SELECT name FROM orvex_migrations
      `.execute(trx);
      const appliedSet = new Set(alreadyApplied.rows.map((row) => row.name));

      for (const [name, migration] of Object.entries(migrations)) {
        if (appliedSet.has(name)) continue;

        const [pkg] = name.split('/');
        await migration.up(trx);
        await sql`
          INSERT INTO orvex_migrations (name, package) VALUES (${name}, ${pkg})
        `.execute(trx);
        applied.push(name);
      }
    });

    if (applied.length > 0) {
      this.logger.log(
        `Applied ${applied.length} orvex migration(s): ${applied.join(', ')}`,
      );
    } else {
      this.logger.log('No pending orvex migrations');
    }

    return { applied };
  }

  async status(): Promise<OrvexMigratorStatus> {
    await ensureOrvexMigrationsTable(this.db);
    const migrations = await this.provider.getMigrations();
    const rows = await sql<OrvexMigrationRow>`
      SELECT name FROM orvex_migrations
    `.execute(this.db);
    const appliedSet = new Set(rows.rows.map((row) => row.name));
    const allNames = Object.keys(migrations);

    return {
      applied: allNames.filter((n) => appliedSet.has(n)),
      pending: allNames.filter((n) => !appliedSet.has(n)),
    };
  }

  /** Rolls back the single most-recently-applied migration, if it defines `down`. */
  async migrateDown(): Promise<{ rolledBack: string | null }> {
    await ensureOrvexMigrationsTable(this.db);
    const migrations = await this.provider.getMigrations();

    const lastAppliedResult = await sql<OrvexMigrationRow>`
      SELECT name FROM orvex_migrations ORDER BY applied_at DESC LIMIT 1
    `.execute(this.db);
    const lastApplied = lastAppliedResult.rows[0];

    if (!lastApplied) return { rolledBack: null };

    const migration = migrations[lastApplied.name];
    if (!migration?.down) return { rolledBack: null };

    await this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${OrvexMigratorService.MIGRATION_LOCK_KEY})`.execute(
        trx,
      );
      await migration.down(trx);
      await sql`
        DELETE FROM orvex_migrations WHERE name = ${lastApplied.name}
      `.execute(trx);
    });

    return { rolledBack: lastApplied.name };
  }
}
