// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpException, HttpStatus } from '@nestjs/common';
import { QuotaResource } from './entitlement.types';

/**
 * AC1/AC3/AC4 — `402 QUOTA_EXCEEDED`, thrown BEFORE any row is written.
 * Body shape is the literal one the DoD/AC assertions check:
 * `{ error: 'QUOTA_EXCEEDED', resource, limit }`.
 */
export class QuotaExceededException extends HttpException {
  constructor(resource: QuotaResource, limit: number) {
    super(
      { error: 'QUOTA_EXCEEDED', resource, limit },
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
