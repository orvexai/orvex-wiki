import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { AuditLogData } from '../../common/events/audit-events';

type AuditRunner = KyselyDB | KyselyTransaction;

/**
 * ENG-1380 — clean-room AGPL audit writer.
 * ENG-1396 — in-process transactional audit SINK (feeds the outbox): adds
 * the critical/non-critical/no-tx durability modes, actor-pairing
 * validation, and the `client_id` column for a resolved `external_agent`
 * actor.
 *
 * A small, independently-authored (no EE lineage) service that persists
 * audit rows to the in-tree AGPL `audit` table (migration
 * `20260228T223532-audit.ts` + `20260709T110000-audit-client-id.ts`). This
 * is DELIBERATELY separate from the global `AUDIT_SERVICE`/
 * `NoopAuditService` wiring (`integrations/audit`), which stays a no-op by
 * design elsewhere in the engine — this leg needs a REAL,
 * transactionally-consistent sink so callers can assert on rows, not
 * mocked call counts (CS §5d).
 */
@Injectable()
export class OrvexAuditService {
  private readonly logger = new Logger(OrvexAuditService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * `validateActor` (M-59): a `system` actor must carry no `actorId`; a
   * `user` actor must carry one. Throws before any insert — never a
   * partially-written or misattributed row.
   */
  private validateActor(data: AuditLogData): void {
    if (data.actorType === 'system' && data.actorId != null) {
      throw new Error(
        `Invalid audit actor pairing: actorType='system' must not carry an actorId (got ${data.actorId})`,
      );
    }
    if (data.actorType === 'user' && data.actorId == null) {
      throw new Error(
        "Invalid audit actor pairing: actorType='user' requires a non-null actorId",
      );
    }
  }

  private insertAuditRow(
    runner: AuditRunner,
    data: AuditLogData,
  ): Promise<void> {
    return runner
      .insertInto('audit')
      .values({
        workspaceId: data.workspaceId,
        actorId: data.actorId ?? null,
        actorType: data.actorType,
        event: data.event,
        resourceType: data.resourceType,
        resourceId: data.resourceId ?? null,
        spaceId: data.spaceId ?? null,
        changes: data.changes ? JSON.stringify(data.changes) : null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        ipAddress: data.ipAddress ?? null,
        clientId: data.clientId ?? null,
      })
      .execute()
      .then(() => undefined);
  }

  /**
   * The transactional audit sink (ENG-1396 AC1-AC4). Durability mode is
   * selected by `data.critical`:
   *
   * - `critical === true` — the row is written on the caller's `tx` (or
   *   directly on the base db if no `tx` is given): a caller-tx rollback
   *   rolls the audit row back with it (fail-hard, e.g. auth/key
   *   integrity events).
   * - `critical` falsy (default) — always deferred via `setImmediate` onto
   *   the base db, off the response's critical path, regardless of
   *   whether a caller `tx` was given (H-30): it survives a caller-tx
   *   rollback and a write failure here never fails the business op.
   *   Deliberately NOT issued synchronously on `this.db`/a nested
   *   `this.db.transaction()` while a caller `tx` is still open —
   *   `kysely-postgres-js` serializes access through a single connection
   *   queue per Kysely instance, so any query on the base `db` made while
   *   the caller's `tx` callback is still in flight queues behind that
   *   still-open transaction and deadlocks. Deferring via `setImmediate`
   *   lets the caller's `tx` settle (commit/rollback, releasing its
   *   connection) before this write is issued. A write failure is logged,
   *   never thrown/unhandled.
   *
   * `validateActor` runs first and throws before any insert in every
   * mode.
   */
  async logAndCommit(
    tx: KyselyTransaction | undefined,
    data: AuditLogData,
  ): Promise<void> {
    this.validateActor(data);

    if (data.critical) {
      const runner: AuditRunner = tx ?? this.db;
      await this.insertAuditRow(runner, data);
      return;
    }

    setImmediate(() => {
      this.insertAuditRow(this.db, data).catch((err) => {
        this.logger.error(
          `Failed to persist non-critical audit event ${data.event}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
    });
  }

  /**
   * Fire-and-forget variant (AC8/legacy: `AUTH_FAILED` must never block the
   * 403 response it accompanies). Errors are logged, never rethrown.
   * Equivalent to `logAndCommit(undefined, { ...data, critical: false })`
   * but returns the underlying promise (resolved, never rejected) so
   * callers that DO need to know when the write has landed (e.g. a test,
   * or a caller chaining cleanup) may await it — existing fire-and-forget
   * callers are unaffected as long as they keep not awaiting it.
   */
  logFireAndForget(data: AuditLogData): Promise<void> {
    this.validateActor(data);
    return this.insertAuditRow(this.db, data).catch((err) => {
      this.logger.error(
        `Failed to persist fire-and-forget audit event ${data.event}`,
        err instanceof Error ? err.stack : undefined,
      );
    });
  }
}
