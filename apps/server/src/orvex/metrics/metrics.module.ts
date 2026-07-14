// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { OrvexMetricsService } from '@orvexai/metrics';

import { MetricsController } from './metrics.controller';
import {
  METRICS_AUTH_CONFIG,
  MetricsAuthConfig,
  readMetricsAuthConfig,
} from './metrics-auth';

/**
 * OrvexMetricsModule (ENG-1360, T4) — the single `@Global()` DI seam that
 * mounts the SHARED `OrvexMetricsService` (from the `@orvexai/metrics`
 * npm package, `orvex-studio-lib`) into this engine, and the `/metrics`
 * HTTP handler that exposes it.
 *
 * ONE-REGISTRY INVARIANT (po-ruling 10 / T4 / AC3 / AC7): this module
 * constructs exactly ONE `OrvexMetricsService` (which owns exactly one
 * `prom-client` `Registry`) and exports it. No engine code anywhere else
 * may instantiate a second `OrvexMetricsService`/`Registry` — that would
 * split the exposition surface into partial views, the exact failure mode
 * po-ruling 10 forbids. `OrvexMetricsService` is a shared, already-tested
 * OWN package (`@orvexai/metrics`, ENG-1610) — it is constructed here, not
 * wrapped or re-implemented (§3.1 deletion test: this module's value is the
 * fail-closed authz + route-exclusion the raw service does not provide).
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: OrvexMetricsService,
      useFactory: (): OrvexMetricsService => new OrvexMetricsService(),
    },
    {
      provide: METRICS_AUTH_CONFIG,
      useFactory: (): MetricsAuthConfig => readMetricsAuthConfig(process.env),
    },
  ],
  exports: [OrvexMetricsService],
})
export class OrvexMetricsModule {}
