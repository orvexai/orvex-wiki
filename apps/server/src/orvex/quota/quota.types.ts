/**
 * Quota enforcement contract (F-QUOTA / A-QUOTA / A-QUOTA-HARDENING).
 *
 * The engine enforces per-tenant resource caps at the write chokepoint against
 * billing-owned entitlements. The over-quota verdict is `402 QUOTA_EXCEEDED`
 * (the FROZEN cross-service error contract, pinned in orvex-studio-contracts —
 * never 429, never a delete). Reads/exports/deletes always succeed.
 */

/** The resource surfaces the engine meters (F-QUOTA / A-QUOTA). */
export type QuotaResource = 'pages' | 'bytes' | 'files' | 'members';

/**
 * Per-tenant entitlement values — OWNED by orvex-studio-billing (FR-W11). The
 * engine hard-codes no plan numbers; it reads the tenant's effective
 * entitlement (cached, short-TTL, evicted on `billing.entitlement.changed`).
 */
export interface QuotaEntitlement {
  maxPages: number;
  storageBytesAggregate: number;
  maxFileBytes: number;
  maxFiles: number;
  maxMembers: number;
  /** `min(N versions, D days)` — the only unbounded-in-time term (FR-W14). */
  historyMaxVersions: number;
  historyMaxDays: number;
}

/** The domain verdict (A-QUOTA-HARDENING F9: computed by the service, not the
 *  controller — the handler only marshals it into the 402 response). */
export interface QuotaVerdict {
  allowed: boolean;
  resource: QuotaResource;
  /** Frozen error code surfaced as HTTP 402 when `allowed === false`. */
  code: 'QUOTA_EXCEEDED' | 'OK';
  current: number;
  limit: number;
  /** Deep-link the client renders on the paywall (upgrade / largest-files). */
  upgradeUrl?: string;
}
