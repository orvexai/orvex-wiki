// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { ExportModule } from '../../integrations/export/export.module';
import { InternalApiController } from './internal-api.controller';
import { InternalApiService } from './internal-api.service';
import { PrincipalProvisioningService } from './principal-provisioning.service';
import {
  INTERNAL_API_AUTH_CONFIG,
  InternalApiAuthConfig,
  readInternalApiAuthConfig,
} from './internal-api-auth';
import { InternalApiAuthGuard } from './internal-api-auth.guard';

/**
 * InternalApiModule (ENG-1957) — mounts the `/internal/*` surface.
 * `PageRepo`/`PagePermissionRepo`/`SpaceAbilityFactory`/`SpaceRepo`/
 * `WorkspaceRepo`/`PageAccessService` are already `@Global()`-exported
 * elsewhere in the app (`PageAccessModule`, the Kysely repo providers) so
 * are resolved via DI without a re-import here; `ExportService` is not
 * global, so `ExportModule` is imported explicitly for it.
 *
 * ENG-1559 write-path — `PrincipalProvisioningService` composes the same
 * `@Global()` DatabaseModule repos (`UserRepo`, `WorkspaceRepo`,
 * `GroupUserRepo`, `OutboxWriter`) + the global `AUDIT_SERVICE`, so it needs no
 * extra module import.
 */
@Module({
  imports: [ExportModule],
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
