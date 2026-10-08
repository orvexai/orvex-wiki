import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { Json } from '../../database/types/db';
import { executeTx } from '../../database/utils';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';

export const ACCOUNT_DELETION_STEP_REQUESTED =
  'identity.account.deletion.step.requested';
export const ACCOUNT_DELETION_STEP_ACKNOWLEDGED =
  'identity.account.deletion.step.acknowledged';
export const WIKI_DELETE_STEP = 'wiki_delete' as const;

export interface AccountDeletionStepRequested {
  deletionId: string;
  requestId: string;
  requestedAt: string;
  step: string;
  subjectRef: string;
}

/** Pinned to identity/account-deletion-step-ack.schema.json in contracts. */
export interface AccountDeletionStepAck {
  acknowledgedAt: string;
  deletionId: string;
  outcome: 'completed' | 'retryable_failure' | 'paused';
  reasonCode?:
    | 'dependency_unavailable'
    | 'ownership_transfer_required'
    | 'subject_mapping_missing';
  requestId: string;
  step: typeof WIKI_DELETE_STEP;
}

export type WikiDeleteActionResult =
  | { outcome: 'completed'; resultNote?: 'nothing_to_delete' }
  | {
      outcome: 'paused';
      reasonCode: 'ownership_transfer_required';
      blockingWorkspaceIds: string[];
    };

export const WIKI_DELETE_ACTION = Symbol('WIKI_DELETE_ACTION');
export interface WikiDeleteAction {
  execute(
    subjectRef: string,
    orvexTenant: string,
  ): Promise<WikiDeleteActionResult>;
}

export interface WikiDeleteStepRepository {
  runLocked(
    deletionId: string,
    step: typeof WIKI_DELETE_STEP,
    requestId: string,
    orvexTenant: string,
    action: () => Promise<{
      ack: AccountDeletionStepAck;
      resultNote?: 'nothing_to_delete';
      blockingWorkspaceIds?: string[];
    }>,
  ): Promise<AccountDeletionStepAck>;
}

export const WIKI_DELETE_STEP_REPOSITORY = Symbol(
  'WIKI_DELETE_STEP_REPOSITORY',
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Serializes duplicate deliveries and stores only terminal acknowledgements. */
@Injectable()
export class KyselyWikiDeleteStepRepository implements WikiDeleteStepRepository {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly outbox: OutboxWriter,
  ) {}

  runLocked(
    deletionId: string,
    step: typeof WIKI_DELETE_STEP,
    requestId: string,
    orvexTenant: string,
    action: () => Promise<{
      ack: AccountDeletionStepAck;
      resultNote?: 'nothing_to_delete';
      blockingWorkspaceIds?: string[];
    }>,
  ): Promise<AccountDeletionStepAck> {
    const lockKey = `account-deletion:${deletionId}:${step}`;
    return executeTx(this.db, async (transaction) => {
      // Transaction-scoped locks remain safe under PgBouncer transaction
      // pooling; session locks can be acquired and released on different
      // backend connections there.
      await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(
        transaction,
      );
      const existing = await transaction
        .selectFrom('accountDeletionStepResults')
        .select(['ack', 'orvexTenant', 'resumableAt'])
        .where('deletionId', '=', deletionId)
        .where('step', '=', step)
        .executeTakeFirst();
      if (existing) {
        if (
          existing.orvexTenant === orvexTenant &&
          existing.resumableAt === null
        ) {
          return existing.ack as unknown as AccountDeletionStepAck;
        }
        if (existing.orvexTenant !== orvexTenant) {
          const mismatchAck: AccountDeletionStepAck = {
            deletionId,
            requestId,
            step: WIKI_DELETE_STEP,
            outcome: 'retryable_failure',
            reasonCode: 'dependency_unavailable',
            acknowledgedAt: new Date().toISOString(),
          };
          await this.outbox.enqueue(transaction, {
            type: ACCOUNT_DELETION_STEP_ACKNOWLEDGED,
            aggregateId: deletionId,
            workspaceId: null,
            orvexTenant,
            payload: mismatchAck as unknown as Record<string, unknown>,
          });
          return mismatchAck;
        }
        // A paused terminal result is re-evaluated only after its blockers
        // were removed and the resumable signal was committed.
        await transaction
          .deleteFrom('accountDeletionStepResults')
          .where('deletionId', '=', deletionId)
          .where('step', '=', step)
          .where('resumableAt', 'is not', null)
          .execute();
      }

      const execution = await action();
      if (execution.ack.outcome !== 'retryable_failure') {
        await transaction
          .insertInto('accountDeletionStepResults')
          .values({
            deletionId,
            step,
            orvexTenant,
            ack: execution.ack as unknown as Json,
            resultNote: execution.resultNote ?? null,
            resumableAt: null,
          })
          .execute();
        if (execution.ack.outcome === 'paused') {
          for (const workspaceId of execution.blockingWorkspaceIds ?? []) {
            await transaction
              .insertInto('accountDeletionPausedWorkspaces')
              .values({ deletionId, workspaceId, orvexTenant })
              .execute();
          }
        }
      }
      await this.outbox.enqueue(transaction, {
        type: ACCOUNT_DELETION_STEP_ACKNOWLEDGED,
        aggregateId: deletionId,
        workspaceId: null,
        orvexTenant,
        payload: execution.ack as unknown as Record<string, unknown>,
      });
      return execution.ack;
    });
  }
}

/**
 * Wiki's saga step implementation. The caller validates the CloudEvent envelope
 * and request data before invoking this service; this class enforces exact-step
 * routing again so a misconfigured Trigger cannot dispatch a different step.
 */
@Injectable()
export class WikiDeleteStepService {
  constructor(
    @Inject(WIKI_DELETE_STEP_REPOSITORY)
    private readonly results: WikiDeleteStepRepository,
    @Inject(WIKI_DELETE_ACTION)
    private readonly deletion: WikiDeleteAction,
  ) {}

  async handle(
    request: AccountDeletionStepRequested,
    orvexTenant: string,
  ): Promise<AccountDeletionStepAck> {
    if (request.step !== WIKI_DELETE_STEP) {
      throw new BadRequestException('Unsupported account deletion step');
    }
    if (!UUID_PATTERN.test(orvexTenant)) {
      throw new BadRequestException(
        'Invalid account deletion tenant extension',
      );
    }

    return this.results.runLocked(
      request.deletionId,
      WIKI_DELETE_STEP,
      request.requestId,
      orvexTenant,
      async () => {
        try {
          const result = await this.deletion.execute(
            request.subjectRef,
            orvexTenant,
          );
          if (
            result.outcome === 'paused' &&
            (result.blockingWorkspaceIds.length === 0 ||
              result.blockingWorkspaceIds.some(
                (workspaceId) => !UUID_PATTERN.test(workspaceId),
              ))
          ) {
            throw new Error('Paused deletion requires blocking workspace ids');
          }
          return {
            ack: {
              deletionId: request.deletionId,
              requestId: request.requestId,
              step: WIKI_DELETE_STEP,
              outcome: result.outcome,
              ...(result.outcome === 'paused'
                ? { reasonCode: result.reasonCode }
                : {}),
              acknowledgedAt: new Date().toISOString(),
            },
            ...(result.outcome === 'completed' && result.resultNote
              ? { resultNote: result.resultNote }
              : {}),
            ...(result.outcome === 'paused'
              ? { blockingWorkspaceIds: result.blockingWorkspaceIds }
              : {}),
          };
        } catch {
          // Retryable failures are deliberately not stored by the repository.
          return {
            ack: {
              deletionId: request.deletionId,
              requestId: request.requestId,
              step: WIKI_DELETE_STEP,
              outcome: 'retryable_failure',
              reasonCode: 'dependency_unavailable',
              acknowledgedAt: new Date().toISOString(),
            },
          };
        }
      },
    );
  }
}

export function isAccountDeletionStepRequested(
  value: unknown,
): value is AccountDeletionStepRequested {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data).sort();
  return (
    keys.join(',') === 'deletionId,requestId,requestedAt,step,subjectRef' &&
    typeof data.deletionId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.deletionId,
    ) &&
    typeof data.requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.requestId,
    ) &&
    typeof data.subjectRef === 'string' &&
    /^[0-9a-f]{64}$/.test(data.subjectRef) &&
    data.step === WIKI_DELETE_STEP &&
    typeof data.requestedAt === 'string' &&
    Number.isFinite(Date.parse(data.requestedAt))
  );
}
