// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpException, HttpStatus } from '@nestjs/common';
import { LargestFileEntry, QuotaResource } from './entitlement.types';

/**
 * ENG-2491 — the ADDITIVE enrichments the frozen `402` body may carry.
 * Additive only: the frozen `{error, resource, limit}` core (contract-shape
 * law, Contract Summary §1/§3) is never renamed or removed.
 *
 * - `upgradeUrl` (ENG-2491 AC1): a workspace-scoped upgrade/entitlement
 *   deep-link, built from the env-configured base (never a literal in this
 *   module, ❌#8); omitted when no base is configured — never fabricated.
 * - `largestFiles` (ENG-2491 AC3): the one-click top-N attachments list on
 *   a storage-shaped rejection; a real store read, degrading to `[]` on a
 *   transient query failure (never turning the 402 into a 500, CS §10).
 * - `redisUnavailable` (ENG-2492 AC2): distinguishes a fail-CLOSED
 *   storage-write rejection during a Redis usage-counter outage from a
 *   genuine over-cap verdict, still under the frozen envelope.
 */
export interface QuotaExceededExtras {
  upgradeUrl?: string;
  largestFiles?: LargestFileEntry[];
  redisUnavailable?: true;
}

/**
 * AC1/AC3/AC4 (ENG-1382) — `402 QUOTA_EXCEEDED`, thrown BEFORE any row is
 * written. Body shape keeps the frozen literal the DoD/AC assertions check —
 * `{ error: 'QUOTA_EXCEEDED', resource, limit }` — plus the ENG-2491/2492
 * additive extras above when supplied.
 */
export class QuotaExceededException extends HttpException {
  constructor(
    resource: QuotaResource,
    limit: number,
    extras?: QuotaExceededExtras,
  ) {
    super(
      { error: 'QUOTA_EXCEEDED', resource, limit, ...(extras ?? {}) },
      HttpStatus.PAYMENT_REQUIRED, // 402
    );
  }
}

/**
 * AC7 — the billing entitlement catalog is unreachable AND no last-known
 * cached projection exists. Fails CLOSED (never an unbounded allow, ruling
 * 5) with a typed, never-white-screen (CS §10) `503`.
 */
export class EntitlementUnavailableException extends HttpException {
  constructor() {
    super(
      { error: 'ENTITLEMENT_UNAVAILABLE' },
      HttpStatus.SERVICE_UNAVAILABLE, // 503
    );
  }
}
