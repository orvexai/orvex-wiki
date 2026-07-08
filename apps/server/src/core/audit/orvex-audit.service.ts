import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { AuditLogData } from '../../common/events/audit-events';

/**
 * ENG-1380 — clean-room AGPL audit writer.
 *
 * A small, independently-authored (no EE lineage) service that persists
 * audit rows to the in-tree AGPL `audit` table (migration
 * `20260228T223532-audit.ts`). This is DELIBERATELY separate from the
 * global `AUDIT_SERVICE`/`NoopAuditService` wiring (`integrations/audit`),
 * which stays a no-op by design elsewhere in the engine — this leg needs a
 * REAL, transactionally-consistent sink (AC7: exactly one audit row per
 * mutation, in the SAME transaction) so callers can assert on rows, not
 * mocked call counts (CS §5d).
 */
@Injectable()
export class OrvexAuditService {
  private readonly logger = new Logger(OrvexAuditService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Insert an audit row as part of the caller's transaction. Failure here
   * MUST fail the whole mutation (a mutation without its audit trail is not
   * considered committed) — never swallow errors.
   */
  async logAndCommit(
    trx: KyselyTransaction,
    data: AuditLogData,
  ): Promise<void> {
    await trx
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
      })
      .execute();
  }

  /**
   * Fire-and-forget variant (AC8: `AUTH_FAILED` must never block the 403
   * response it accompanies). Errors are logged, never rethrown. Returns the
   * underlying promise (resolved, never rejected) so callers that DO need
   * to know when the write has landed (e.g. a test, or a caller chaining
   * cleanup) may await it — existing fire-and-forget callers are unaffected
   * as long as they keep not awaiting it.
   */
  logFireAndForget(data: AuditLogData): Promise<void> {
    return this.db
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
      })
      .execute()
      .then(() => undefined)
      .catch((err) => {
        this.logger.error(
          `Failed to persist fire-and-forget audit event ${data.event}`,
          err instanceof Error ? err.stack : undefined,
        );
      });
  }
}
