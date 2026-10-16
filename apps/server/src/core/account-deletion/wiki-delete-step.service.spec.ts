import { BadRequestException } from '@nestjs/common';
import {
  AccountDeletionStepAck,
  AccountDeletionStepRequested,
  WikiDeleteAction,
  WikiDeleteStepRepository,
  WikiDeleteStepService,
  WIKI_DELETE_STEP,
  isAccountDeletionStepRequested,
} from './wiki-delete-step.service';

const request = (overrides: Partial<AccountDeletionStepRequested> = {}) => ({
  deletionId: '550e8400-e29b-41d4-a716-446655440000',
  requestedAt: '2026-10-07T18:00:00Z',
  requestId: '650e8400-e29b-41d4-a716-446655440000',
  step: WIKI_DELETE_STEP,
  subjectRef: 'a'.repeat(64),
  ...overrides,
});
const REQUEST_ID = '650e8400-e29b-41d4-a716-446655440000';
const TENANT_ID = '8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa';

class InMemoryTerminalAckRepository implements WikiDeleteStepRepository {
  readonly results = new Map<string, AccountDeletionStepAck>();
  readonly attempts = new Map<string, AccountDeletionStepAck>();
  readonly resumable = new Set<string>();
  readonly outbox: Array<{
    ack: AccountDeletionStepAck;
    orvexTenant: string;
  }> = [];
  readonly resultNotes = new Map<string, string>();
  readonly blockers = new Map<string, string[]>();
  lastTenant: string | undefined;

  async runLocked(
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
    this.lastTenant = orvexTenant;
    const key = `${deletionId}:${step}`;
    const previousAttempt = this.attempts.get(requestId);
    if (previousAttempt) {
      const current = this.results.get(key);
      if (
        previousAttempt.outcome !== 'paused' ||
        (current?.outcome === 'paused' && !this.resumable.has(key))
      ) {
        this.outbox.push({ ack: previousAttempt, orvexTenant });
        return previousAttempt;
      }
      const stale: AccountDeletionStepAck = {
        deletionId,
        requestId,
        step,
        outcome: 'retryable_failure',
        reasonCode: 'dependency_unavailable',
        acknowledgedAt: new Date().toISOString(),
      };
      this.outbox.push({ ack: stale, orvexTenant });
      return stale;
    }

    const previous = this.results.get(key);
    if (previous && !this.resumable.has(key)) {
      const replay = { ...previous, requestId };
      this.attempts.set(requestId, replay);
      this.outbox.push({ ack: replay, orvexTenant });
      return replay;
    }
    if (this.resumable.has(key)) {
      this.results.delete(key);
      this.resumable.delete(key);
      this.blockers.delete(key);
    }

    const execution = await action();
    if (execution.ack.outcome !== 'retryable_failure') {
      this.results.set(key, execution.ack);
      this.attempts.set(requestId, execution.ack);
      if (execution.resultNote) this.resultNotes.set(key, execution.resultNote);
      if (execution.blockingWorkspaceIds) {
        this.blockers.set(key, execution.blockingWorkspaceIds);
      }
    }
    this.outbox.push({ ack: execution.ack, orvexTenant });
    return execution.ack;
  }
}

describe('WikiDeleteStepService', () => {
  let repository: InMemoryTerminalAckRepository;
  let action: jest.Mocked<WikiDeleteAction>;
  let service: WikiDeleteStepService;

  beforeEach(() => {
    repository = new InMemoryTerminalAckRepository();
    action = { execute: jest.fn() };
    service = new WikiDeleteStepService(repository, action);
  });

  const invoke = (
    payload = request(),
    tenant = TENANT_ID,
    cloudEventId = REQUEST_ID,
  ) => service.handle(payload, cloudEventId, tenant);

  it('runs the first request and stores a completed terminal acknowledgement', async () => {
    action.execute.mockResolvedValue({ outcome: 'completed' });

    const ack = await invoke();

    expect(ack).toMatchObject({
      deletionId: request().deletionId,
      requestId: REQUEST_ID,
      step: WIKI_DELETE_STEP,
      outcome: 'completed',
    });
    expect(ack.acknowledgedAt).toEqual(expect.any(String));
    expect(
      repository.results.get(`${request().deletionId}:${WIKI_DELETE_STEP}`),
    ).toEqual(ack);
    expect(action.execute).toHaveBeenCalledTimes(1);
    expect(action.execute).toHaveBeenCalledWith('a'.repeat(64));
    expect(repository.lastTenant).toBe(TENANT_ID);
    expect(repository.outbox).toEqual([
      {
        ack,
        orvexTenant: TENANT_ID,
      },
    ]);
  });

  it('replays the first terminal acknowledgement without rerunning deletion', async () => {
    action.execute.mockResolvedValue({ outcome: 'completed' });

    const first = await invoke();
    const duplicate = await invoke();

    expect(duplicate).toEqual(first);
    expect(action.execute).toHaveBeenCalledTimes(1);
  });

  it('deduplicates by requestId and echoes a new attempt id when replaying a terminal result', async () => {
    action.execute.mockResolvedValue({ outcome: 'completed' });
    await invoke();

    const nextAttemptId = '750e8400-e29b-41d4-a716-446655440000';
    const replay = await invoke(
      request({ requestId: nextAttemptId }),
      TENANT_ID,
      nextAttemptId,
    );
    const duplicate = await invoke(
      request({ requestId: nextAttemptId }),
      TENANT_ID,
      nextAttemptId,
    );

    expect(replay.requestId).toBe(nextAttemptId);
    expect(duplicate).toEqual(replay);
    expect(action.execute).toHaveBeenCalledTimes(1);
    expect(repository.attempts.has(nextAttemptId)).toBe(true);
  });

  it('returns retryable failure without storing it, then retries the action', async () => {
    action.execute
      .mockRejectedValueOnce(new Error('temporary storage failure'))
      .mockResolvedValueOnce({ outcome: 'completed' });

    const failed = await invoke();
    expect(failed).toMatchObject({
      requestId: REQUEST_ID,
      outcome: 'retryable_failure',
      reasonCode: 'dependency_unavailable',
      step: WIKI_DELETE_STEP,
    });
    expect(repository.results.size).toBe(0);

    const retryId = '750e8400-e29b-41d4-a716-446655440000';
    const retried = await invoke(
      request({ requestId: retryId }),
      TENANT_ID,
      retryId,
    );
    expect(retried.outcome).toBe('completed');
    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(repository.results.size).toBe(1);
  });

  it('stores and replays ownership-transfer pause as a terminal result', async () => {
    action.execute.mockResolvedValue({
      outcome: 'paused',
      reasonCode: 'ownership_transfer_required',
      blockingWorkspaceIds: ['8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa'],
    });

    const first = await invoke();
    const duplicate = await invoke();

    expect(first).toMatchObject({
      outcome: 'paused',
      reasonCode: 'ownership_transfer_required',
    });
    expect(duplicate).toEqual(first);
    expect(action.execute).toHaveBeenCalledTimes(1);
    expect(
      repository.blockers.get(`${request().deletionId}:${WIKI_DELETE_STEP}`),
    ).toEqual(['8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa']);
  });

  it('does not replay a paused request after its resumable event; the new request id may rerun it', async () => {
    action.execute
      .mockResolvedValueOnce({
        outcome: 'paused',
        reasonCode: 'ownership_transfer_required',
        blockingWorkspaceIds: ['8b1a9953-c461-4b9a-9fdb-c1f4c8e7b1aa'],
      })
      .mockResolvedValueOnce({ outcome: 'completed' });
    const tenant = TENANT_ID;
    const first = await invoke();
    const key = `${request().deletionId}:${WIKI_DELETE_STEP}`;
    repository.resumable.add(key);

    const staleDuplicate = await invoke();
    expect(staleDuplicate.outcome).toBe('retryable_failure');
    expect(action.execute).toHaveBeenCalledTimes(1);

    const nextAttemptId = '750e8400-e29b-41d4-a716-446655440000';
    const resumed = await invoke(
      request({ requestId: nextAttemptId }),
      tenant,
      nextAttemptId,
    );
    expect(first.outcome).toBe('paused');
    expect(resumed).toMatchObject({
      outcome: 'completed',
      requestId: nextAttemptId,
    });
    expect(action.execute).toHaveBeenCalledTimes(2);
  });

  it('records a no-data completion internally while keeping the strict ack shape unchanged', async () => {
    action.execute.mockResolvedValue({
      outcome: 'completed',
      resultNote: 'nothing_to_delete',
    });

    const ack = await invoke();
    const key = `${request().deletionId}:${WIKI_DELETE_STEP}`;

    expect(ack).toMatchObject({ outcome: 'completed' });
    expect(ack).not.toHaveProperty('reasonCode');
    expect(repository.resultNotes.get(key)).toBe('nothing_to_delete');
  });

  it('rejects a request for another saga step before invoking deletion', async () => {
    await expect(
      invoke(request({ step: 'billing_cancel' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(action.execute).not.toHaveBeenCalled();
    expect(repository.results.size).toBe(0);
  });

  it('requires a valid inbound registry tenant before touching deletion state', async () => {
    await expect(invoke(request(), 'not-a-tenant-uuid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(action.execute).not.toHaveBeenCalled();
    expect(repository.results.size).toBe(0);
  });

  it('accepts the strict request payload shape and rejects extra fields', () => {
    expect(isAccountDeletionStepRequested(request())).toBe(true);
    expect(
      isAccountDeletionStepRequested({
        ...request(),
        requestId: REQUEST_ID,
        email: 'private@example.com',
      }),
    ).toBe(false);
  });

  it('rejects request data with an invalid step or overlong subjectRef', () => {
    expect(
      isAccountDeletionStepRequested({ ...request(), step: 'api_purge' }),
    ).toBe(false);
    expect(
      isAccountDeletionStepRequested({
        ...request(),
        subjectRef: 'x'.repeat(64),
      }),
    ).toBe(false);
  });

  it('rejects a non-UUID CloudEvent id before touching deletion state', async () => {
    await expect(
      invoke(request(), TENANT_ID, 'attempt-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(action.execute).not.toHaveBeenCalled();
    expect(repository.results.size).toBe(0);
  });

  it('rejects a requestId that differs from the CloudEvent id without writing or deleting', async () => {
    await expect(
      invoke(request({ requestId: '750e8400-e29b-41d4-a716-446655440000' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(action.execute).not.toHaveBeenCalled();
    expect(repository.results.size).toBe(0);
    expect(repository.attempts.size).toBe(0);
    expect(repository.outbox).toHaveLength(0);
  });
});
