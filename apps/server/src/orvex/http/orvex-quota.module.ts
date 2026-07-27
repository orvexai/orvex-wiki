// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';

import { OrvexQuotaController } from './orvex-quota.controller';

/**
 * ENG-2493 — the quota-read primitive's DB-aware home.
 *
 * `GET /orvex/quota` stopped being a DB-less 501 stub when AC3 wired it to
 * the real usage-vs-caps read: it now needs `EntitlementService` (fast
 * counters, billing port) and `@InjectKysely()` (store-tier truth queries on
 * a cold counter miss). Both arrive from `@Global()` modules at runtime, so
 * this module only declares the controller.
 *
 * Deliberately NOT mounted by `OrvexHttpModule` any more — that module is
 * also booted by a DELIBERATELY DB-less flag-e2e harness
 * (`orvex-http.e2e.spec.ts`), which asserts the remaining 501 sentinels
 * without standing up Postgres or the entitlement graph. Leaving a
 * DB-dependent controller there would make that harness unbootable. This is
 * the same carve-out `orvexApplyOps` (ENG-1652) and `orvexSessionExchange`
 * (FR-W6) took when they graduated from stub to real; see
 * `OrvexApplyOpsModule`'s docstring.
 *
 * Mounted unconditionally by `PageModule` — its real DB-aware runtime home,
 * exactly as `OrvexApplyOpsModule` is. `OrvexRootModule` must NOT mount it:
 * that module is what the DB-less flag-e2e harness boots.
 */
@Module({
  controllers: [OrvexQuotaController],
})
export class OrvexQuotaModule {}
