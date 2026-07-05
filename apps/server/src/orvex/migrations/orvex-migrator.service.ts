import { Injectable, Logger } from '@nestjs/common';

/**
 * OrvexMigrator — runs the SEPARATE `orvex_migrations` ledger (FR-W22 /
 * A-IMPORT), distinct from the upstream Kysely `kysely_migration` chain.
 *
 * A `pg_advisory_xact_lock` serialises replica boots so concurrent
 * `migrateToLatest` runs never race the chain (crashloop / half-apply). This is
 * the same guard the runner exposes so migration can also move out-of-band to an
 * ArgoCD PreSync Job.
 *
 * SCAFFOLD: not wired to the vanilla boot path (that would change boot
 * behaviour). The Kysely handle is typed `unknown` so the skeleton compiles
 * without `@docmost/db`.
 */
@Injectable()
export class OrvexMigrator {
  private readonly logger = new Logger(OrvexMigrator.name);

  /** A stable 64-bit key for the advisory lock (namespaced to orvex). */
  static readonly ADVISORY_LOCK_KEY = 0x0072_7665_78_6d69; // "orvexmi"

  /**
   * Apply every unapplied orvex migration after the v0.95 tip, under the
   * advisory lock, idempotently.
   */
  async migrateToLatest(_db: unknown): Promise<void> {
    // TODO(fold-in WS-2): SELECT pg_advisory_xact_lock(KEY); ensure the
    // orvex_migrations table exists; run appended ./ledger/*.ts in order.
    this.logger.log('orvex migrations: scaffold no-op (not wired to boot)');
  }
}
