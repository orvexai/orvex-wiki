import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

@Injectable()
export class RedisThrottleStorageService extends ThrottlerStorageRedisService {
  private readonly logger = new Logger(RedisThrottleStorageService.name);

  async onModuleDestroy(): Promise<void> {
    const redis = this.redis;
    if (!redis || redis.status === 'end') return;

    redis.on('error', (error: Error) => {
      this.logger.error('Redis throttle shutdown error', error.stack);
    });
    await redis.quit();
  }
}
