// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { ExportModule } from '../../integrations/export/export.module';
import { SpaceModule } from '../space/space.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { InternalApiController } from './internal-api.controller';
import { InternalApiService } from './internal-api.service';
import { PrincipalProvisioningService } from './principal-provisioning.service';
import {
  INTERNAL_API_AUTH_CONFIG,
  InternalApiAuthConfig,
  readInternalApiAuthConfig,
} from './internal-api-auth';
import { InternalApiAuthGuard } from './internal-api-auth.guard';
import { OrvexConfigModule } from '../../orvex/config/orvex-config.module';

/**
 * InternalApiModule (ENG-1957) — mounts the `/internal/*` surface.
 * `PageRepo`/`PagePermissionRepo`/`SpaceAbilityFactory`/`SpaceRepo`/
 * `WorkspaceRepo`/`PageAccessService` are already `@Global()`-exported
 * elsewhere in the app (`PageAccessModule`, the Kysely repo providers) so
 * are resolved via DI without a re-import here; `ExportService` is not
 * global, so `ExportModule` is imported explicitly for it.
 *
 * ENG-1559 write-path — `PrincipalProvisioningService` composes the same
 * `@Global()` DatabaseModule repos (`UserRepo`, `WorkspaceRepo`, `GroupRepo`,
 * `GroupUserRepo`, `OutboxWriter`) + the global `AUDIT_SERVICE`, so it needs no
 * extra module import. `GroupRepo` (ENG-1559 R6) creates the default group of a
 * workspace materialized at a registry-issued UUID.
 */
/**
 * ENG-2503 — imports `WorkspaceModule` for `WorkspaceUpgradeService`, whose
 * `upgradeToTeam` this controller exposes at
 * `POST /internal/tenants/upgrade-to-team` (the personal→Teams upgrade-pass;
 * the actor is identity's provisioning/billing worker, the same one that
 * already drives `principals/provision`). The identity registry port itself is
 * resolved from the `@Global()` `OrvexIdentityRegistryModule`, so it needs no
 * extra import here.
 */
@Module({
  // A-CELL — `OrvexConfigService` supplies the `CELL_ID` that
  // `PrincipalProvisioningService.materializeWorkspace` stamps onto every
  // identity-federated tenant it mints.
  imports: [ExportModule, SpaceModule, WorkspaceModule, OrvexConfigModule],
  controllers: [InternalApiController],
  providers: [
    InternalApiService,
    PrincipalProvisioningService,
    InternalApiAuthGuard,
    {
      provide: INTERNAL_API_AUTH_CONFIG,
      useFactory: (): InternalApiAuthConfig =>
        readInternalApiAuthConfig(process.env),
    },
  ],
})
export class InternalApiModule {}
