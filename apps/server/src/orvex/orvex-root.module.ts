// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { DynamicModule, Module } from '@nestjs/common';

import { OrvexConfigModule } from './config/orvex-config.module';
import { OrvexHttpModule } from './http/orvex-http.module';
import { OrvexEnforceSsoModule } from './enforce-sso/orvex-enforce-sso.module';
import { OrvexPageBlocksModule } from './page-blocks/page-blocks.module';
import { OrvexTracingModule } from './obs/orvex-tracing.module';
import { OrvexHealthModule } from './health/orvex-health.module';
import { OrvexMetricsModule } from './metrics/metrics.module';

/**
 * OrvexRootModule — the single aggregation point that mounts the additive orvex
 * surface into the upstream Docmost app (the ONE app.module.ts import).
 *
 * VANILLA BYTE-PARITY DOCTRINE: `register()` reads `process.env.ORVEX_MODULES_ENABLED`
 * and imports the orvex tree ONLY when it is EXACTLY the string 'true'. For any
 * other value it returns a COMPLETELY EMPTY dynamic module — no controllers, no
 * providers, no routes — so the engine runs byte-for-byte as upstream Docmost.
 *
 * `OrvexPageMetadataModule` (ENG-1371) is deliberately NOT mounted here.
 * `orvex-http.e2e.spec.ts` boots this `register()` tree in isolation via
 * `@nestjs/testing`, WITHOUT the app's `DatabaseModule` (it e2e-tests only
 * the 501-sentinel primitive surface); `OrvexPageMetadataService` needs
 * `@InjectKysely()`, so mounting it here throws
 * `Nest can't resolve dependencies ... KyselyModuleConnectionToken` in that
 * harness (verified: reverted after regressing 13 e2e tests). Its real
 * runtime delivery path is `PageModule` (`core/page/page.module.ts`), which
 * imports it unconditionally — the same core-integration precedent as
 * `OrvexPageProvenanceModule` (ENG-1447) — and binds
 * `OrvexMarkdownInterceptor` on `PageController.create`/`.update`
 * (review1 F1/F2).
 *
 * ENG-1604 AC1 — `OrvexMigratorService`/`OrvexLlmsModule` are likewise
 * deliberately NOT mounted here for the identical DB-DI-in-DB-free-harness
 * reason (both need `@InjectKysely()`); their real delivery paths are
 * `app.module.ts` (migrator, unconditional — same carve-out-(b) precedent as
 * Provenance/Visuals/Transclusion/Events) and `PageModule` (llms) respectively.
 * `OrvexHealthModule` (AC8) IS mounted here — it is deliberately built with
 * zero DatabaseModule/Kysely dependency (raw probes, see its docstring), so
 * it does not hit this constraint.
 */
@Module({})
export class OrvexRootModule {
  static register(): DynamicModule {
    if (process.env.ORVEX_MODULES_ENABLED !== 'true') {
      return { module: OrvexRootModule };
    }
    return {
      module: OrvexRootModule,
      imports: [
        OrvexConfigModule,
        OrvexHttpModule,
        OrvexEnforceSsoModule,
        OrvexPageBlocksModule,
        OrvexTracingModule,
        OrvexHealthModule,
        OrvexMetricsModule,
      ],
    };
  }
}
