import { Injectable } from '@nestjs/common';
import { QuotaEntitlement } from './quota.types';

/**
 * The billing↔engine entitlement read seam (FR-W11 / OQ-W2).
 *
 * The engine hard-codes NO plan numbers — it reads the tenant's effective
 * entitlement from orvex-studio-billing (via `ORVEX_BILLING_URL`, cached and
 * evicted on `billing.entitlement.changed`). The FR-W11 honest interim: the
 * free-only launch MAY hardcode the Free constant BEHIND this interface so
 * quota enforcement doesn't block on billing being built — but it MUST be
 * swapped for the billing system-of-record read before any paid plan is sold.
 *
 * The Free reference tier below is the D-S7 billing-owned value, cited here only
 * as the interim constant the enforcer applies.
 */
export const FREE_TIER_ENTITLEMENT: QuotaEntitlement = {
  maxPages: 200,
  storageBytesAggregate: 1 * 1024 * 1024 * 1024, // 1 GiB
  maxFileBytes: 10 * 1024 * 1024, // 10 MB
  maxFiles: 2000,
  maxMembers: 25,
  historyMaxVersions: 10,
  historyMaxDays: 180,
};

@Injectable()
export class EntitlementReader {
  /**
   * Effective entitlement for a tenant.
   * SCAFFOLD: returns the interim Free constant. TODO(fold-in WS-4): read the
   * billing system-of-record over ORVEX_BILLING_URL (cached, short-TTL).
   */
  async forTenant(_workspaceId: string): Promise<QuotaEntitlement> {
    return FREE_TIER_ENTITLEMENT;
  }
}
