// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OrvexMigratorService, ORVEX_MIGRATIONS } from './orvex-migrator.service';
import { buildOrvexMigrations } from './orvex-migration-registry';

/**
 * OrvexMigratorModule (ENG-1604 AC1 DoD — "the migration-provider is wired
 * into the orvex boot path once it lands via ENG-1411") — this ticket only
 * WIRES the already-shipped `OrvexMigrationProvider`/`OrvexMigratorService`
 * (ENG-1389/ENG-1411), it does not re-author either.
 *
 * NOT mounted inside `OrvexRootModule.register()`: `OrvexMigratorService`
 * needs `@InjectKysely()` at construction, so mounting it there would
 * reintroduce the exact ENG-1371 DB-free-e2e-harness regression that
 * `OrvexPageMetadataModule`/`OrvexLlmsModule` are already excluded for (see
 * `orvex-root.module.ts`'s docstring). Instead this module is imported
 * DIRECTLY and UNCONDITIONALLY in `app.module.ts` — the identical
 * carve-out-(b) precedent already established for `OrvexPageProvenanceModule`
 * / `OrvexPageVisualsModule` / `OrvexTransclusionSafeguardModule` /
 * `OrvexEventsModule` (all DB-backed, all wired outside the gated root).
 *
 * Mirrors `DatabaseModule`'s own boot-migration gate exactly
 * (`onApplicationBootstrap`, `NODE_ENV === 'production'` only) so
 * `migrateToLatest()` never runs against ad-hoc dev/test databases outside
 * an explicit test's own setup.
 *
 * `EnvironmentService` is injected WITHOUT importing `EnvironmentModule`
 * here — same precedent as `ConfirmTokenService`/`RatifyTokenService`
 * (`orvex/page-metadata`): `EnvironmentModule` is `@Global()`, provided once
 * by `app.module.ts`, which is where this module is ALSO wired (see
 * `orvex-migrator.module.ts`'s own docstring above).
 */
@Module({
  providers: [
    OrvexMigratorService,
    {
      provide: ORVEX_MIGRATIONS,
      useFactory: () => buildOrvexMigrations(),
    },
  ],
  exports: [OrvexMigratorService],
})
export class OrvexMigratorModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrvexMigratorModule.name);

  constructor(
    private readonly migrator: OrvexMigratorService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.environmentService.getNodeEnv() === 'production') {
      this.logger.log('Running orvex migrations...');
      await this.migrator.migrateToLatest();
    }
  }
}
