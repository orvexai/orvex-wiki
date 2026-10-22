import RedisClient from 'ioredis';
import { awaitRedisSyncSubscription } from './await-redis-subscription';

describe('awaitRedisSyncSubscription adapter', () => {
  it('does not complete until Redis acknowledges all requested channels', async () => {
    let resolveSubscribe!: (count: number) => void;
    const subscribe = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveSubscribe = resolve;
        }),
    );
    const redis = { subscribe } as unknown as RedisClient;
    let completed = false;

    const extension = { sub: redis };
    const subscription = awaitRedisSyncSubscription(
      extension,
      'collabMsg',
      'collabMsg:test-server',
    ).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(subscribe).toHaveBeenCalledWith(
      'collabMsg',
      'collabMsg:test-server',
    );
    expect(completed).toBe(false);

    resolveSubscribe(2);
    await subscription;
    expect(completed).toBe(true);
  });

  it('fails loudly if the upstream extension no longer exposes its subscriber at `sub`', async () => {
    await expect(awaitRedisSyncSubscription({}, 'collabMsg')).rejects.toThrow(
      'RedisSyncExtension subscriber adapter expected an ioredis client at `sub`; upstream shape changed',
    );
  });
});
