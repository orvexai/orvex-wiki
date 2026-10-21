import RedisClient from 'ioredis';
import { awaitRedisSubscription } from '../../../orvex/collaboration/await-redis-subscription';

describe('awaitRedisSubscription', () => {
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

    const subscription = awaitRedisSubscription(
      redis,
      'collabMsg',
      'collabMsg:test-server',
    ).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(subscribe).toHaveBeenCalledWith('collabMsg', 'collabMsg:test-server');
    expect(completed).toBe(false);

    resolveSubscribe(2);
    await subscription;
    expect(completed).toBe(true);
  });
});
