// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../database/types/kysely.types';

/**
 * ENG-1389 — orvex-owned boot-time migration ledger.
 *
 * Separate from Kysely's own `Migrator`/`kysely_migration` chain (which owns
 * the core Docmost schema via `DatabaseModule`/`MigrationService`). This
 * service exists for orvex-authored migrations that additive orvex/*
 * packages contribute at boot, tracked in their own `orvex_migrations`
 * ledger keyed by (name) with the owning package recorded alongside.
 *
 * PgBouncer transaction-pooling deadlock fix: `pg_advisory_lock`/
 * `pg_advisory_unlock` is a SESSION-level pair. Under PgBouncer transaction
 * pooling, the lock and unlock calls can be routed to two different backend
 * connections — the unlock silently no-ops, the lock is held forever, and
 * the next pod to boot blocks indefinitely (liveness kills it -> crash-loop).
 * `pg_advisory_xact_lock` is TRANSACTION-scoped: it auto-releases on COMMIT
 * or ROLLBACK of the very transaction that took it, so it is safe to call on
 * whatever connection PgBouncer happens to hand out for that transaction.
 */

export interface OrvexMigration {
  /** Name of the package/module contributing this migration. */
  package: string;
  /** Applies the migration on the given transaction. Must be idempotent-safe to run once. */
  up: (trx: KyselyTransaction) => Promise<void>;
}

export type OrvexMigrationMap = Record<string, OrvexMigration>;

export const ORVEX_MIGRATIONS = Symbol('ORVEX_MIGRATIONS');

// Fixed, stable advisory-lock key for the orvex migration ledger. Distinct
// from any lock key Kysely's own Migrator or other subsystems might use.
export const ORVEX_MIGRATION_LOCK_KEY = 823_477_001;

export interface OrvexMigrationStatusRow {
  name: string;
  package: string;
  applied: boolean;
}

@Injectable()
export class OrvexMigratorService {
  private readonly logger = new Logger(OrvexMigratorService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Optional()
    @Inject(ORVEX_MIGRATIONS)
    private readonly migrations: OrvexMigrationMap = {},
  ) {}

  /**
   * Runs every pending migration, in sorted-name order, exactly once —
   * safe to call concurrently from any number of booting replicas.
   */
  async migrateToLatest(): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Serializes all concurrent callers on this single transaction; the
      // lock is released automatically when this transaction commits or
      // rolls back, so it can never leak across a PgBouncer connection swap.
      await sql`SELECT pg_advisory_xact_lock(${ORVEX_MIGRATION_LOCK_KEY})`.execute(
        trx,
      );

      await this.ensureLedgerTable(trx);
      await this.runPendingMigrations(trx);
    });
  }

  /** Removes a single migration's ledger row so it re-applies on next boot. */
  async migrateDown(name: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${ORVEX_MIGRATION_LOCK_KEY})`.execute(
        trx,
      );
      await this.ensureLedgerTable(trx);
      await sql`DELETE FROM orvex_migrations WHERE name = ${name}`.execute(
        trx,
      );
    });
  }

  /** Applied/pending status for every registered migration, sorted by name. */
  async status(): Promise<OrvexMigrationStatusRow[]> {
    await this.ensureLedgerTable(this.db);
    const { rows } = await sql<{ name: string }>`
      SELECT name FROM orvex_migrations
    `.execute(this.db);
    const applied = new Set(rows.map((r) => r.name));

    return Object.keys(this.migrations)
      .sort()
      .map((name) => ({
        name,
        package: this.migrations[name].package,
        applied: applied.has(name),
      }));
  }

  private async ensureLedgerTable(
    executor: KyselyDB | KyselyTransaction,
  ): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS orvex_migrations (
        name text PRIMARY KEY,
        package text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(executor);
  }

  private async runPendingMigrations(trx: KyselyTransaction): Promise<void> {
    const { rows } = await sql<{ name: string }>`
      SELECT name FROM orvex_migrations
    `.execute(trx);
    const applied = new Set(rows.map((r) => r.name));

    const pendingNames = Object.keys(this.migrations)
      .filter((name) => !applied.has(name))
      .sort();

    if (pendingNames.length === 0) {
      this.logger.log('No pending orvex migrations');
      return;
    }

    for (const name of pendingNames) {
      const migration = this.migrations[name];
      await migration.up(trx);
      await sql`
        INSERT INTO orvex_migrations (name, package) VALUES (${name}, ${migration.package})
      `.execute(trx);
      this.logger.log(
        `Orvex migration "${name}" (package: ${migration.package}) applied successfully`,
      );
    }
  }
}
