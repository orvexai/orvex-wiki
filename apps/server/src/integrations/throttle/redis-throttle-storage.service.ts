// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

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
