import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { Json } from '../../database/types/db';

export const ACCOUNT_DELETION_STEP_REQUESTED =
  'identity.account.deletion.step.requested';
export const ACCOUNT_DELETION_STEP_ACKNOWLEDGED =
  'identity.account.deletion.step.acknowledged';
export const WIKI_DELETE_STEP = 'wiki_delete' as const;

export interface AccountDeletionStepRequested {
  deletionId: string;
  requestedAt: string;
  step: string;
  subjectRef: string;
}

/** Pinned to identity/account-deletion-step-ack.schema.json in contracts. */
export interface AccountDeletionStepAck {
  acknowledgedAt: string;
  deletionId: string;
  outcome: 'completed' | 'retryable_failure' | 'paused';
  reasonCode?: 'dependency_unavailable' | 'ownership_transfer_required';
  step: typeof WIKI_DELETE_STEP;
}

export type WikiDeleteActionResult =
  | { outcome: 'completed' }
  | { outcome: 'paused'; reasonCode: 'ownership_transfer_required' };

export const WIKI_DELETE_ACTION = Symbol('WIKI_DELETE_ACTION');
export interface WikiDeleteAction {
  execute(subjectRef: string): Promise<WikiDeleteActionResult>;
}

export interface WikiDeleteStepRepository {
  runLocked(
    deletionId: string,
    step: typeof WIKI_DELETE_STEP,
    action: () => Promise<AccountDeletionStepAck>,
  ): Promise<AccountDeletionStepAck>;
}

export const WIKI_DELETE_STEP_REPOSITORY = Symbol(
  'WIKI_DELETE_STEP_REPOSITORY',
);

/** Serializes duplicate deliveries and stores only terminal acknowledgements. */
@Injectable()
export class KyselyWikiDeleteStepRepository implements WikiDeleteStepRepository {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  runLocked(
    deletionId: string,
    step: typeof WIKI_DELETE_STEP,
    action: () => Promise<AccountDeletionStepAck>,
  ): Promise<AccountDeletionStepAck> {
    const lockKey = `account-deletion:${deletionId}:${step}`;
    return this.db.transaction().execute(async (transaction) => {
      // Transaction-scoped locks remain safe under PgBouncer transaction
      // pooling; session locks can be acquired and released on different
      // backend connections there.
      await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(
        transaction,
      );
      const existing = await transaction
          .selectFrom('accountDeletionStepResults')
          .select('ack')
          .where('deletionId', '=', deletionId)
          .where('step', '=', step)
          .executeTakeFirst();
      if (existing) {
        return existing.ack as unknown as AccountDeletionStepAck;
      }

      const ack = await action();
      if (ack.outcome !== 'retryable_failure') {
        await transaction
          .insertInto('accountDeletionStepResults')
          .values({
            deletionId,
            step,
            ack: ack as unknown as Json,
          })
          .execute();
      }
      return ack;
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

  async handle(request: AccountDeletionStepRequested): Promise<AccountDeletionStepAck> {
    if (request.step !== WIKI_DELETE_STEP) {
      throw new BadRequestException('Unsupported account deletion step');
    }

    return this.results.runLocked(request.deletionId, WIKI_DELETE_STEP, async () => {
      try {
        const result = await this.deletion.execute(request.subjectRef);
        return {
          deletionId: request.deletionId,
          step: WIKI_DELETE_STEP,
          outcome: result.outcome,
          ...(result.outcome === 'paused'
            ? { reasonCode: result.reasonCode }
            : {}),
          acknowledgedAt: new Date().toISOString(),
        };
      } catch {
        // Retryable failures are deliberately not stored by the repository.
        return {
          deletionId: request.deletionId,
          step: WIKI_DELETE_STEP,
          outcome: 'retryable_failure',
          reasonCode: 'dependency_unavailable',
          acknowledgedAt: new Date().toISOString(),
        };
      }
    });
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
    keys.join(',') === 'deletionId,requestedAt,step,subjectRef' &&
    typeof data.deletionId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    data.deletionId,
    ) &&
    typeof data.subjectRef === 'string' &&
    data.subjectRef.length > 0 &&
    data.subjectRef.length <= 256 &&
    data.step === WIKI_DELETE_STEP &&
    typeof data.requestedAt === 'string' &&
    Number.isFinite(Date.parse(data.requestedAt))
  );
}
