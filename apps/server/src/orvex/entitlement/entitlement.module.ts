// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { BILLING_ENTITLEMENT_PORT } from './entitlement-billing.port';
import { HttpBillingEntitlementPort } from './entitlement-http-billing.port';
import { ENTITLEMENT_CACHE, RedisEntitlementCache } from './entitlement-cache';
import { EntitlementChangedConsumer } from './entitlement-changed.consumer';
import { QuotaFastCounter } from './quota-fast-counter';
import { QuotaReconciliationService } from './quota-reconciliation.service';
import { assertNoPaidPlanSellableWhileInterimFree } from './entitlement.types';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { OrvexConfigModule } from '../config/orvex-config.module';

/**
 * ENG-1382 — the F-QUOTA / feature-unlock module. `Global` so the write
 * chokepoints in `page`, `attachment`, and `workspace-invitation` can inject
 * `EntitlementService` without each declaring an import cycle back here.
 *
 * ENG-2489 — also hosts `EntitlementChangedConsumer` (the
 * `billing.entitlement.changed` PUSH-eviction leg) and runs the AC4
 * paid-plan swap-point guard at construction: boot fails loudly if a paid
 * plan is ever marked sellable while the interim hardcode-Free fallback is
 * still the active billing-absent code path.
 */
@Global()
@Module({
  imports: [EnvironmentModule, OrvexConfigModule],
  providers: [
    EntitlementService,
    EntitlementChangedConsumer,
    QuotaFastCounter,
    QuotaReconciliationService,
    { provide: BILLING_ENTITLEMENT_PORT, useClass: HttpBillingEntitlementPort },
    { provide: ENTITLEMENT_CACHE, useClass: RedisEntitlementCache },
  ],
  exports: [EntitlementService, QuotaFastCounter],
})
export class EntitlementModule {
  constructor() {
    assertNoPaidPlanSellableWhileInterimFree();
  }
}
