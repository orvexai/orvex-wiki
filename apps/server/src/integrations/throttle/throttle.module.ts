import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { EnvironmentService } from '../environment/environment.service';
import { EnvironmentModule } from '../environment/environment.module';
import { parseRedisUrl } from '../../common/helpers';
import {
  ALL_THROTTLER_NAMES,
  AUTH_THROTTLER,
  AI_CHAT_THROTTLER,
  MCP_TOOL_THROTTLER,
  USER_EXPORT_THROTTLER,
} from '../../orvex/orvex-throttler-names';
import Redis from 'ioredis';

/**
 * Base ttl/limit registration per canonical throttler name (ENG-1436). A
 * `WorkspaceThrottlerGuard` consumer may override the *effective* limit
 * per-workspace at request time via `resolveLimit`; these are the framework
 * base values used otherwise (e.g. the plain `ThrottlerGuard`/
 * `UserThrottlerGuard` consumers already wired below).
 *
 * `mcp_tool` has no consumer route yet — this ticket (ENG-1436) lands only
 * the throttling substrate; the ai-chat/mcp/oidc legs wire their own
 * `@UseGuards(WorkspaceThrottlerGuard)` per §8 Dependencies of ENG-1436. Its
 * 120/min base is generous enough to be a no-op for existing traffic.
 */
const THROTTLE_REGISTRATIONS: Record<string, { ttl: number; limit: number }> =
  {
    [AUTH_THROTTLER]: { ttl: 60_000, limit: 10 },
    [AI_CHAT_THROTTLER]: { ttl: 60_000, limit: 25 },
    [MCP_TOOL_THROTTLER]: { ttl: 60_000, limit: 120 },
    // ENG-1473: GDPR user-data-export — 5 requests/hour (ratified
    // ceiling; not raised to make a test pass — CS ❌10).
    [USER_EXPORT_THROTTLER]: { ttl: 3_600_000, limit: 5 },
  };

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [EnvironmentModule],
      useFactory: (environmentService: EnvironmentService) => {
        const redisConfig = parseRedisUrl(environmentService.getRedisUrl());

        // ENG-1436 AC9: the registered throttler list is GENERATED from
        // ALL_THROTTLER_NAMES (single source, CS §5c) — it can never drift
        // out of sync with the canonical, Linear-scrubbed registry.
        const throttlers = ALL_THROTTLER_NAMES.map((name) => {
          const registration = THROTTLE_REGISTRATIONS[name];
          if (!registration) {
            throw new Error(
              `throttle.module: missing ttl/limit registration for throttler "${name}"`,
            );
          }
          return { name, ttl: registration.ttl, limit: registration.limit };
        });

        return {
          throttlers,
          errorMessage: 'Too many requests',
          storage: new ThrottlerStorageRedisService(
            new Redis({
              host: redisConfig.host,
              port: redisConfig.port,
              password: redisConfig.password,
              db: redisConfig.db,
              family: redisConfig.family,
              keyPrefix: 'throttle:',
            }),
          ),
        };
      },
      inject: [EnvironmentService],
    }),
  ],
})
export class ThrottleModule {}
