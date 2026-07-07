import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import {
  KyselyDB,
  KyselyTransaction,
} from '../../../database/types/kysely.types';
import { executeTx } from '../../../database/utils';
import { Json } from '../../../database/types/db';

/**
 * ENG-1383 T1/T2 — the outbox write primitive.
 *
 * A concrete typed event (AC9 — no `any`, no CloudEvent envelope; the
 * envelope-shaping catalog leg is separate). `payload` is the only free-form
 * field, and it lands in a `jsonb` column at the true storage edge.
 */
export interface OutboxEvent {
  type: string;
  aggregateId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
}

/**
 * `orvex/events/outbox` — the deep module (CS §3). Small interface:
 * `enqueue(trx, event)` for the caller's own transaction (AC1/AC2 atomicity
 * — the outbox row commits or rolls back with the domain mutation), and
 * `enqueueDetached(event)` for listener-driven lifecycle events (AC7) that
 * don't have a caller transaction to enlist in — each detached enqueue is
 * still a single atomic INSERT, it just isn't joined to the original
 * mutation's transaction the way `enqueue` is.
 */
@Injectable()
export class OutboxWriter {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Insert the outbox row in the SAME transaction as the domain mutation.
   * Must be called with the mutation's own `trx` — never opens its own
   * transaction — so a mutation rollback takes the outbox row with it
   * (AC2) and a mutation commit carries exactly one outbox row (AC1).
   */
  async enqueue(trx: KyselyTransaction, event: OutboxEvent): Promise<void> {
    // NEVER JSON.stringify a jsonb value here — postgres.js double-encodes
    // a pre-stringified value into a jsonb STRING (see api-key.repo.ts's
    // `scopes` gotcha). Pass the plain object; the driver serializes it.
    await trx
      .insertInto('orvexEventOutbox')
      .values({
        type: event.type,
        aggregateId: event.aggregateId,
        workspaceId: event.workspaceId,
        payload: event.payload as unknown as Json,
      })
      .execute();
  }

  /**
   * Lifecycle-listener convenience wrapper (T3/AC7) for event sources that
   * fire post-commit via EventEmitter2 and have no caller transaction to
   * enlist in. Opens its own single-statement transaction so the INSERT
   * itself is atomic, but does not close the crash-window between the
   * original mutation's commit and this listener running — that gap is
   * inherent to any post-commit hook and is documented, not hidden.
   */
  async enqueueDetached(event: OutboxEvent): Promise<void> {
    await executeTx(this.db, (trx) => this.enqueue(trx, event));
  }
}
