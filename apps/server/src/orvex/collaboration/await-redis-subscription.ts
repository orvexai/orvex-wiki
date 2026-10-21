import Redis from 'ioredis';

/** Wait for Redis to acknowledge each channel subscription before startup. */
export async function awaitRedisSubscription(
  redis: Pick<Redis, 'subscribe'>,
  ...channels: string[]
): Promise<void> {
  await redis.subscribe(...channels);
}
