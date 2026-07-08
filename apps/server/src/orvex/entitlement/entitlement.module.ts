import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { BILLING_ENTITLEMENT_PORT } from './entitlement-billing.port';
import { HttpBillingEntitlementPort } from './entitlement-http-billing.port';
import { ENTITLEMENT_CACHE, RedisEntitlementCache } from './entitlement-cache';
import { EnvironmentModule } from '../../integrations/environment/environment.module';

/**
 * ENG-1382 — the F-QUOTA / feature-unlock module. `Global` so the write
 * chokepoints in `page`, `attachment`, and `workspace-invitation` can inject
 * `EntitlementService` without each declaring an import cycle back here.
 */
@Global()
@Module({
  imports: [EnvironmentModule],
  providers: [
    EntitlementService,
    { provide: BILLING_ENTITLEMENT_PORT, useClass: HttpBillingEntitlementPort },
    { provide: ENTITLEMENT_CACHE, useClass: RedisEntitlementCache },
  ],
  exports: [EntitlementService],
})
export class EntitlementModule {}
