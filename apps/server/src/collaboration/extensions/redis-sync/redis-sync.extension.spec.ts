import RedisClient from 'ioredis';
import { Hocuspocus, onConfigurePayload } from '@hocuspocus/server';
import { RedisSyncExtension } from './redis-sync.extension';

describe('RedisSyncExtension startup', () => {
  it('waits for its initial Redis subscription before configuration completes', async () => {
    let resolveSubscribe!: (count: number) => void;
    const subscribe = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveSubscribe = resolve;
        }),
    );
    const pub = {
      on: jest.fn(),
      disconnect: jest.fn(),
    };
    const sub = {
      on: jest.fn(),
      subscribe,
      disconnect: jest.fn(),
    };
    const redis = {
      duplicate: jest.fn().mockReturnValueOnce(pub).mockReturnValueOnce(sub),
    };
    const extension = new RedisSyncExtension({
      redis: redis as unknown as RedisClient,
      pack: jest.fn() as any,
      unpack: jest.fn() as any,
      serverId: 'test-server',
    });
    let configureCompleted = false;

    const configure = extension
      .onConfigure({ instance: {} as Hocuspocus } as onConfigurePayload)
      .then(() => {
        configureCompleted = true;
      });

    await Promise.resolve();
    expect(configureCompleted).toBe(false);

    resolveSubscribe(2);
    await configure;
    expect(configureCompleted).toBe(true);
  });
});
