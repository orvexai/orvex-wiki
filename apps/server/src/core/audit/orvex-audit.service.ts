// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { v7 as uuidv7 } from 'uuid';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  ALL_WIKI_AUDIT_TYPES,
  AuditLogData,
  AuditLogPayload,
} from '../../common/events/audit-events';
import type {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';

type AuditRunner = KyselyDB | KyselyTransaction;

/**
 * ENG-3167 — the engine's ONE real audit writer, bound globally at
 * `AUDIT_SERVICE` (the silent-swallow `NoopAuditService` is DELETED, not
 * deprecated — hard-cut).
 *
 * AD-24: an audit record is an `orvexEventOutbox` row staged INSIDE the
 * caller's own mutating `KyselyTransaction` — commit-together-or-not-at-all.
 * The stage is a single synchronous INSERT through the existing `OutboxWriter`
 * deep module (§4e Sketch A — reusing the outbox writer keeps the AD-21
 * trace-triple capture in one place; a parallel direct INSERT would re-create
 * a shallow writer, ❌#7). It opens no second connection, constructs no
 * transport (the outbox→spine relay is a separate seam), and the ONLY audit
 * failure that may abort a user action is this in-transaction INSERT failing.
 * The former `setImmediate`/deferred/best-effort path is DELETED (no
 * post-commit emit, no log-only emit, no catch-and-swallow).
 *
 * AD-5/AD-8/AD-23: every staged `type` is a contracts-generated
 * `audit.<category>.<verb>` constant from the engine's own generation lane
 * (`audit-events.gen.ts`, pinned to orvex-studio-contracts under publisher
 * `orvex-wiki`); an unregistered type is a loud typed error (AD-3), never a
 * silent emit. AD-20: the event id is a UUIDv7 minted here, at enqueue,
 * inside the transaction (an active emission) — never at relay time.
 * AD-39 (AC4): the payload carries the closed reference field set only —
 * subjectId / resourceId / action / outcome — never page bodies, comment
 * text, or free-text `changes`/`metadata` blobs.
 *
 * AC9 NOTE (blocked leg, recorded deviation): the historical local `audit`
 * table write in `logAndCommit`/`logFireAndForget` is RETAINED unchanged in
 * shape (now always synchronous on the caller's runner) because the AC9
 * backfill target (`orvex-studio-audit`, #18) does not exist yet — the
 * table-drop + backfill migration is that leg's work, not this one's.
 */
@Injectable()
export class OrvexAuditService implements IAuditService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly outboxWriter: OutboxWriter,
  ) {}

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

  /**
   * AD-5 — the emitted type must resolve to a generated constant. The check
   * is DATA-DRIVEN off the generated `ALL_WIKI_AUDIT_TYPES` list: a newly
   * registered `audit.<category>.<verb>` type flows through after a regen
   * with a zero-line diff here (AC11); a hand-typed/unregistered literal is
   * a loud typed error (AD-3), never a silent emit (AD-23).
   */
  private assertGeneratedType(event: string): void {
    if (!(ALL_WIKI_AUDIT_TYPES as readonly string[]).includes(event)) {
      throw new Error(
        `Audit type '${event}' is not a generated orvex-studio-contracts ` +
          `constant (AD-5/AD-23 register-before-emit) — refusing to emit.`,
      );
    }
  }

  /**
   * AC4 (AD-39) — the closed reference field set. Data-driven from the
   * record: no free text can enter (the field names are fixed; every value
   * is an opaque id or a closed code). `changes`/`metadata` blobs are
   * deliberately unrepresentable here.
   */
  private closedPayload(data: AuditLogData): Record<string, unknown> {
    const action = data.event.split('.').slice(2).join('.');
    const payload: Record<string, unknown> = {
      action,
      outcome: data.outcome ?? 'success',
    };
    if (data.actorId != null) payload.subjectId = data.actorId;
    if (data.resourceId != null) payload.resourceId = data.resourceId;
    return payload;
  }

  /**
   * The one emit body (§3.6 — one tx-bearing emit behind the interface).
   * Stages exactly one audit-typed outbox row: on the caller's own
   * transaction when one is passed (AD-24 — the audited mutation and its
   * audit row commit or roll back together), otherwise as a single atomic
   * detached INSERT (a site that has no mutating transaction, e.g. a
   * deny/failure emission accompanying an error response).
   */
  private async stageAuditRow(
    data: AuditLogData,
    trx?: KyselyTransaction,
  ): Promise<void> {
    this.validateActor(data);
    this.assertGeneratedType(data.event);
    const event = {
      // AD-20/AD-24 — an active emission mints its UUIDv7 at enqueue,
      // inside the transaction; dedup identity is (source, id).
      id: uuidv7(),
      type: data.event,
      aggregateId: data.resourceId ?? data.actorId ?? data.workspaceId,
      workspaceId: data.workspaceId,
      payload: this.closedPayload(data),
    };
    if (trx) {
      await this.outboxWriter.enqueue(trx, event);
    } else {
      await this.outboxWriter.enqueueDetached(event);
    }
  }

  // ── IAuditService (the global AUDIT_SERVICE binding — the 25 sites) ───────

  async log(
    payload: AuditLogPayload,
    context?: AuditLogContext,
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (!context?.workspaceId) {
      // AD-3 — a loud typed error, never a success-shaped no-op: an audit
      // emit without workspace attribution cannot be recorded honestly.
      throw new Error(
        `Audit emit for '${payload.event}' carries no workspace context — ` +
          `pass an AuditLogContext (ENG-3167 tx-bearing signature).`,
      );
    }
    return this.logWithContext(payload, context, trx);
  }

  async logWithContext(
    payload: AuditLogPayload,
    context: AuditLogContext,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const data: AuditLogData = {
      ...payload,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      actorType:
        context.actorType ?? (context.actorId != null ? 'user' : 'system'),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      clientId: context.clientId,
    };
    await this.stageAuditRow(data, trx);
  }

  async logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
    trx?: KyselyTransaction,
  ): Promise<void> {
    for (const payload of payloads) {
      await this.logWithContext(payload, context, trx);
    }
  }

  // ── the pre-existing direct API (page-history / page-permission / api-key /
  //    provenance callers) — now always synchronous on the caller's runner ──

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
   * Transactional audit write on the caller's own `trx` (or the base db when
   * no transaction exists at the call site). The ENG-1396 `critical`-falsy
   * `setImmediate` deferred mode is DELETED (hard-cut, AD-24): every write
   * now rides the passed runner synchronously — a caller-tx rollback rolls
   * the audit row back WITH the mutation, and a failed write throws loudly
   * (no catch-and-swallow, no post-commit emit). Also stages the outbox row
   * (the family-sink route) on the same runner.
   */
  async logAndCommit(
    tx: KyselyTransaction | undefined,
    data: AuditLogData,
  ): Promise<void> {
    // Both prechecks run BEFORE any insert (loud, AD-3): neither the local
    // row nor the outbox row lands for an invalid actor pairing or an
    // unregistered type.
    this.validateActor(data);
    this.assertGeneratedType(data.event);
    const runner: AuditRunner = tx ?? this.db;
    await this.insertAuditRow(runner, data);
    await this.stageAuditRow(data, tx);
  }

  /**
   * No-caller-transaction variant (e.g. the AUTH_FAILED emission alongside a
   * 403). Each write is a single atomic INSERT; a failure REJECTS the
   * returned promise (loud, AD-3) — the former catch-and-log swallow is
   * deleted. Callers that fire-and-forget surface the failure as an
   * unhandled-rejection log; callers that await propagate it.
   */
  async logFireAndForget(data: AuditLogData): Promise<void> {
    this.validateActor(data);
    this.assertGeneratedType(data.event);
    await this.insertAuditRow(this.db, data);
    await this.stageAuditRow(data, undefined);
  }
}
