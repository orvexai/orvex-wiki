import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService polling backoff', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('backs off exponentially after broker failures and resets after recovery', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T08:00:00.000Z'));
    const relay = new OutboxRelayService(
      {} as never,
      {} as never,
      {
        cellId: 'crew-yafet',
        kafkaBrokersConfigured: true,
        kafkaOutboxTopic: 'wiki-events.crew-yafet',
      },
    );
    const run = jest
      .spyOn(relay, 'run')
      .mockResolvedValue({ published: 0, failed: 1 });

    await relay.poll();
    await relay.poll();
    expect(run).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2_000);
    await relay.poll();
    expect(run).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(3_999);
    await relay.poll();
    expect(run).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1);
    run.mockResolvedValueOnce({ published: 3, failed: 0 });
    await relay.poll();
    expect(run).toHaveBeenCalledTimes(3);

    await relay.poll();
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('stops the current batch after a broker failure and leaves later rows unrelayed', async () => {
    const rows = [
      { id: 'row-1', type: 'test', workspaceId: 'workspace-1' },
      { id: 'row-2', type: 'test', workspaceId: 'workspace-1' },
    ].map((row) => ({
      ...row,
      aggregateId: 'aggregate-1',
      createdAt: new Date('2026-10-08T08:00:00.000Z'),
      correlationId: 'correlation-1',
      payload: {},
      traceparent: null,
      tracestate: null,
    }));
    const selectQuery = {
      selectAll: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(rows),
    };
    const db = {
      selectFrom: jest.fn().mockReturnValue(selectQuery),
      updateTable: jest.fn(),
    };
    const publisher = { publish: jest.fn().mockRejectedValue(new Error('broker unavailable')) };
    const relay = new OutboxRelayService(
      db as never,
      publisher as never,
      {
        cellId: 'crew-yafet',
        kafkaBrokersConfigured: true,
        kafkaOutboxTopic: 'wiki-events.crew-yafet',
      },
    );

    await expect(relay.run()).resolves.toEqual({ published: 0, failed: 1 });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(db.updateTable).not.toHaveBeenCalled();
  });
});
