import { RedisThrottleStorageService } from './redis-throttle-storage.service';

describe('RedisThrottleStorageService', () => {
  it('waits for Redis quit after attaching a shutdown error handler', async () => {
    const events: string[] = [];
    let finishQuit!: () => void;
    const quitPromise = new Promise<void>((resolve) => {
      finishQuit = resolve;
    });
    const redis = {
      status: 'ready',
      on: jest.fn((event: string) => {
        events.push(`on:${event}`);
        return redis;
      }),
      quit: jest.fn(() => {
        events.push('quit');
        return quitPromise;
      }),
      disconnect: jest.fn(() => {
        events.push('disconnect');
      }),
    };
    const storage = Object.create(
      RedisThrottleStorageService.prototype,
    ) as RedisThrottleStorageService;
    storage.redis = redis as unknown as RedisThrottleStorageService['redis'];

    const shutdown = storage.onModuleDestroy();

    expect(events).toEqual(['on:error', 'quit']);
    expect(redis.disconnect).not.toHaveBeenCalled();
    let settled = false;
    void Promise.resolve(shutdown).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishQuit();
    await shutdown;
    expect(settled).toBe(true);
  });
});
