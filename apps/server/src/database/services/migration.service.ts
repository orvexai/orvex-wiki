import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { Migrator, FileMigrationProvider } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(`Database${MigrationService.name}`);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * ENG-2479 AC1 (core-chain half) — no `pg_advisory_xact_lock` call
   * appears anywhere in this file (verified: `grep -n "pg_advisory"` here
   * and in `database.module.ts` returns zero hits, and no lock is added
   * below either). That is intentional, not an open gap: Kysely's own
   * `PostgresAdapter#acquireMigrationLock`
   * (`kysely/dist/.../dialect/postgres/postgres-adapter.js`) unconditionally
   * takes `pg_advisory_xact_lock(3853314791062309107)` *inside* the same
   * transaction `Migrator#migrateToLatest` wraps its whole apply-batch in
   * (Postgres `supportsTransactionalDdl === true`), for ANY dialect whose
   * `createAdapter()` returns that class — which `kysely-postgres-js`'s
   * `PostgresJSDialect` does (byte-identical class, re-exported from
   * `kysely` itself), matching what `database.module.ts` configures in
   * production. So N concurrent boot-time replicas calling
   * `migrateToLatest()` already serialise on that lock today, with no code
   * in this file. Proven empirically (not just by reading the library) in
   * `__tests__/migration-service-concurrency.spec.ts`
   * (`TestCoreMigrationServiceSerialisesUnderConcurrency`): 3 concurrent
   * callers apply the full real migration chain exactly once, and a 4th
   * sequential caller no-ops.
   *
   * Do NOT add a second, hand-rolled lock on top of this. A session-level
   * `pg_advisory_lock`/`pg_advisory_unlock` pair (the only kind that could
   * be added *around* this call, since `Migrator` owns its own internal
   * transaction) reintroduces exactly the PgBouncer transaction-pooling
   * deadlock `OrvexMigratorService`'s own docstring warns against — it
   * would be redundant AND strictly riskier than what Kysely already does
   * here for free.
   */
  async migrateToLatest(): Promise<void> {
    const migrator = new Migrator({
      db: this.db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '..', 'migrations'),
      }),
    });

    const { error, results } = await migrator.migrateToLatest();

    if (results && results.length === 0) {
      this.logger.log('No pending database migrations');
      return;
    }

    results?.forEach((it) => {
      if (it.status === 'Success') {
        this.logger.log(
          `Migration "${it.migrationName}" executed successfully`,
        );
      } else if (it.status === 'Error') {
        this.logger.error(`Failed to execute migration "${it.migrationName}"`);
      }
    });

    if (error) {
      this.logger.error('Failed to run database migration. Exiting program.');
      this.logger.error(error);
      process.exit(1);
    }
  }
}
