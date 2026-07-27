// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';

import { KyselyDB } from '../../database/types/kysely.types';
import { EntitlementService } from '../entitlement/entitlement.service';

/**
 * ENG-2493 (FR-W14) — the history-retention prune cron.
 *
 * Page history is the one term in the store that grows without bound: every
 * save appends a `page_history` row and nothing ever removes one. This
 * service enforces the tenant's OWN `min(N versions, D days)` retention
 * bound — read per workspace from its entitlement (AC4), never a constant.
 *
 * SINGLETON (AC2): the deployment runs `replicas: 2`, so a naive `@Interval`
 * would fire the prune body once per replica — two passes racing the same
 * rows. A SESSION-level `pg_try_advisory_lock` makes exactly one replica win
 * the tick; the loser returns immediately having touched nothing. Session
 * scope (not `_xact_`) is deliberate: the prune is a sequence of per-tenant
 * statements rather than one transaction, and the lock must span all of
 * them. It is released in a `finally` so a throwing pass cannot wedge the
 * cron permanently.
 *
 * STORE CONFINEMENT (AC5): every statement here targets `page_history` and
 * nothing else. A page's live `pages` row — its current title/content/
 * version — is NEVER a prune target, no matter how aggressive the bound; a
 * tenant on `min(1, 1d)` still reads its current page.
 */
@Injectable()
export class PageHistoryPruneService {
  private readonly logger = new Logger(PageHistoryPruneService.name);

  /**
   * Advisory-lock key for the prune singleton. Distinct from every other
   * advisory lock in the engine (the migrator's `3853314791062309107`,
   * Kysely's own migration lock) so a prune pass can never block a boot
   * migration or vice versa.
   */
  static readonly PRUNE_LOCK_KEY = 7_742_310_558_204_119n;

  /** Hourly: the bound is measured in versions and DAYS, so sub-hourly ticks
   * would burn locks for no observable gain. */
  static readonly PRUNE_INTERVAL_MS = 60 * 60 * 1000;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Interval('orvex-history-prune', PageHistoryPruneService.PRUNE_INTERVAL_MS)
  async handleInterval(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      // A cron tick never crashes the process (CS §10 operability): log and
      // let the next tick retry.
      this.logger.error(
        `PageHistoryPruneService: prune pass failed — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * One prune pass across every workspace that has history.
   *
   * Returns `{ ran: false }` when another replica holds the singleton lock —
   * the AC2 observable: the loser executes no prune body at all.
   */
  async runOnce(): Promise<{
    ran: boolean;
    workspacesPruned: number;
    rowsDeleted: number;
  }> {
    // AC2 — SESSION-level try-lock: non-blocking, so the losing replica
    // returns instantly rather than queueing behind the winner.
    const acquired = await sql<{ locked: boolean }>`
      SELECT pg_try_advisory_lock(${sql.lit(
        PageHistoryPruneService.PRUNE_LOCK_KEY.toString(),
      )}::bigint) AS locked
    `.execute(this.db);

    if (!acquired.rows[0]?.locked) {
      this.logger.debug(
        'PageHistoryPruneService: another replica holds the prune lock — skipping this tick',
      );
      return { ran: false, workspacesPruned: 0, rowsDeleted: 0 };
    }

    try {
      return await this.pruneAllWorkspaces();
    } finally {
      await sql`
        SELECT pg_advisory_unlock(${sql.lit(
          PageHistoryPruneService.PRUNE_LOCK_KEY.toString(),
        )}::bigint)
      `.execute(this.db);
    }
  }

  private async pruneAllWorkspaces(): Promise<{
    ran: boolean;
    workspacesPruned: number;
    rowsDeleted: number;
  }> {
    const workspaces = await this.db
      .selectFrom('pageHistory')
      .select('workspaceId')
      .distinct()
      .execute();

    let rowsDeleted = 0;
    for (const { workspaceId } of workspaces) {
      rowsDeleted += await this.pruneWorkspace(workspaceId);
    }

    return {
      ran: true,
      workspacesPruned: workspaces.length,
      rowsDeleted,
    };
  }

  /**
   * AC1/AC4 — prune ONE workspace to its own `min(N, D)` bound.
   *
   * "Whichever bound is stricter for a given version" means a row is
   * retained only if it is BOTH within the newest `N` for its page AND
   * newer than `D` days. Both clauses are evaluated per page (the version
   * bound is per page, not per workspace) in a single statement, so a
   * workspace with many pages is one round trip rather than N.
   */
  async pruneWorkspace(workspaceId: string): Promise<number> {
    const { versions, days } =
      await this.entitlementService.getHistoryRetention(workspaceId);

    // Uncapped sentinel (mirrors `capValueForResource`): nothing to prune.
    if (versions <= 0 && days <= 0) {
      return 0;
    }

    const result = await sql<{ id: string }>`
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY page_id ORDER BY created_at DESC, id DESC
          ) AS rn,
          created_at
        FROM page_history
        WHERE workspace_id = ${workspaceId}
      )
      DELETE FROM page_history
      WHERE id IN (
        SELECT id FROM ranked
        WHERE
          (${sql.lit(versions)}::int > 0 AND rn > ${sql.lit(versions)}::int)
          OR (
            ${sql.lit(days)}::int > 0
            AND created_at < now() - (${sql.lit(days)}::int * INTERVAL '1 day')
          )
      )
      RETURNING id
    `.execute(this.db);

    if (result.rows.length > 0) {
      this.logger.debug(
        `PageHistoryPruneService: pruned ${result.rows.length} history row(s) for workspace ${workspaceId} (bound: min(${versions} versions, ${days} days))`,
      );
    }

    return result.rows.length;
  }
}
