import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { EntitlementReader } from './entitlement-reader';
import { QuotaCounters } from './quota-counters';

@Module({
  providers: [QuotaService, EntitlementReader, QuotaCounters],
  exports: [QuotaService],
})
export class QuotaModule {}
