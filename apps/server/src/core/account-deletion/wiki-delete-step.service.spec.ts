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
  requestId: '650e8400-e29b-41d4-a716-446655440000',
  requestedAt: '2026-10-07T18:00:00Z',
  step: WIKI_DELETE_STEP,
  subjectRef: 'a'.repeat(64),
  ...overrides,
});

class InMemoryTerminalAckRepository implements WikiDeleteStepRepository {
  readonly results = new Map<string, AccountDeletionStepAck>();
  readonly resultNotes = new Map<string, string>();

  async runLocked(
    deletionId: string,
    step: typeof WIKI_DELETE_STEP,
    action: () => Promise<{
      ack: AccountDeletionStepAck;
      resultNote?: 'nothing_to_delete';
    }>,
  ): Promise<AccountDeletionStepAck> {
    const key = `${deletionId}:${step}`;
    const previous = this.results.get(key);
    if (previous) return previous;

    const execution = await action();
    if (execution.ack.outcome !== 'retryable_failure') {
      this.results.set(key, execution.ack);
      if (execution.resultNote) this.resultNotes.set(key, execution.resultNote);
    }
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

  it('runs the first request and stores a completed terminal acknowledgement', async () => {
    action.execute.mockResolvedValue({ outcome: 'completed' });

    const ack = await service.handle(request());

    expect(ack).toMatchObject({
      deletionId: request().deletionId,
      requestId: request().requestId,
      step: WIKI_DELETE_STEP,
      outcome: 'completed',
    });
    expect(ack.acknowledgedAt).toEqual(expect.any(String));
    expect(repository.results.get(`${request().deletionId}:${WIKI_DELETE_STEP}`)).toEqual(
      ack,
    );
    expect(action.execute).toHaveBeenCalledTimes(1);
    expect(action.execute).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('replays the first terminal acknowledgement without rerunning deletion', async () => {
    action.execute.mockResolvedValue({ outcome: 'completed' });

    const first = await service.handle(request());
    const duplicate = await service.handle(request());

    expect(duplicate).toEqual(first);
    expect(action.execute).toHaveBeenCalledTimes(1);
  });

  it('returns retryable failure without storing it, then retries the action', async () => {
    action.execute
      .mockRejectedValueOnce(new Error('temporary storage failure'))
      .mockResolvedValueOnce({ outcome: 'completed' });

    const failed = await service.handle(request());
    expect(failed).toMatchObject({
      requestId: request().requestId,
      outcome: 'retryable_failure',
      reasonCode: 'dependency_unavailable',
      step: WIKI_DELETE_STEP,
    });
    expect(repository.results.size).toBe(0);

    const retried = await service.handle(request());
    expect(retried.outcome).toBe('completed');
    expect(action.execute).toHaveBeenCalledTimes(2);
    expect(repository.results.size).toBe(1);
  });

  it('stores and replays ownership-transfer pause as a terminal result', async () => {
    action.execute.mockResolvedValue({
      outcome: 'paused',
      reasonCode: 'ownership_transfer_required',
    });

    const first = await service.handle(request());
    const duplicate = await service.handle(request());

    expect(first).toMatchObject({
      outcome: 'paused',
      reasonCode: 'ownership_transfer_required',
    });
    expect(duplicate).toEqual(first);
    expect(action.execute).toHaveBeenCalledTimes(1);
  });

  it('records a no-data completion internally while keeping the strict ack shape unchanged', async () => {
    action.execute.mockResolvedValue({
      outcome: 'completed',
      resultNote: 'nothing_to_delete',
    });

    const ack = await service.handle(request());
    const key = `${request().deletionId}:${WIKI_DELETE_STEP}`;

    expect(ack).toMatchObject({ outcome: 'completed' });
    expect(ack).not.toHaveProperty('reasonCode');
    expect(repository.resultNotes.get(key)).toBe('nothing_to_delete');
  });

  it('rejects a request for another saga step before invoking deletion', async () => {
    await expect(
      service.handle(request({ step: 'billing_cancel' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(action.execute).not.toHaveBeenCalled();
    expect(repository.results.size).toBe(0);
  });

  it('accepts the strict request payload shape and rejects extra fields', () => {
    expect(isAccountDeletionStepRequested(request())).toBe(true);
    expect(
      isAccountDeletionStepRequested({ ...request(), email: 'private@example.com' }),
    ).toBe(false);
  });

  it('rejects request data with an invalid step or overlong subjectRef', () => {
    expect(
      isAccountDeletionStepRequested({ ...request(), step: 'api_purge' }),
    ).toBe(false);
    expect(
      isAccountDeletionStepRequested({ ...request(), subjectRef: 'x'.repeat(64) }),
    ).toBe(false);
  });

  it('rejects requests without a valid per-attempt requestId', () => {
    expect(
      isAccountDeletionStepRequested({ ...request(), requestId: 'attempt-1' }),
    ).toBe(false);
  });
});
