import { AuditLogPayload, ActorType } from '../../common/events/audit-events';
import type { KyselyTransaction } from '@docmost/db/types/kysely.types';

// ENG-3167 hard-cut: the silent-swallow `NoopAuditService` (whose every method
// body swallowed the emit — 25 @Inject(AUDIT_SERVICE) sites recorded NOTHING)
// is DELETED, not deprecated. `AUDIT_SERVICE` binds ONLY the real
// transactional writer (`core/audit/OrvexAuditService`, provided globally by
// `OrvexAuditModule`), which stages every audit record as an
// `orvexEventOutbox` row inside the caller's own mutating transaction (AD-24).
// This file keeps only the seam: the token and the tx-bearing interface.

export type AuditLogContext = {
  workspaceId: string;
  actorId?: string;
  actorType?: ActorType;
  ipAddress?: string;
  userAgent?: string;
  /**
   * ENG-1434 review2 F1 — the calling API key's own identity (distinct
   * from `actorId`, which for an `api_key` actor is the confirming human
   * behind the token/force). Optional: only `api_key`-attributed rows
   * populate it; `user`-attributed rows leave it undefined.
   */
  clientId?: string;
};

export type IAuditService = {
  /**
   * ENG-3167 — the tx-bearing emit signature (AD-24). A caller that runs a
   * mutating `KyselyTransaction` passes it so the audit record is staged as
   * an outbox row INSIDE that transaction (commit-together-or-not-at-all).
   * `context` carries the attribution (workspace/actor) the writer needs —
   * an emit without a workspace context is a loud typed error (AD-3), never
   * a silent no-op.
   */
  log(
    payload: AuditLogPayload,
    context?: AuditLogContext,
    trx?: KyselyTransaction,
  ): void | Promise<void>;
  logWithContext(
    payload: AuditLogPayload,
    context: AuditLogContext,
    trx?: KyselyTransaction,
  ): void | Promise<void>;
  logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
    trx?: KyselyTransaction,
  ): void | Promise<void>;
};

export const AUDIT_SERVICE = Symbol('AUDIT_SERVICE');
