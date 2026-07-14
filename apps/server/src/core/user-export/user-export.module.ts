import { Module } from '@nestjs/common';
import { UserExportController } from './user-export.controller';
import { UserThrottlerGuard } from '../../integrations/throttle/user-throttler.guard';

/**
 * ENG-1473 — PORT of `orvex-user-export.module.ts` @ orvexai/docmost HEAD
 * `050187676624f2395c55b36ec60e365f87fd4a9f` (retain-and-test, ruling 10).
 * See `user-export.controller.ts` for the placement-deviation note (lives in
 * `core/`, not `orvex/` — A-BOUNDARY).
 */
@Module({
  controllers: [UserExportController],
  providers: [UserThrottlerGuard],
})
export class UserExportModule {}
