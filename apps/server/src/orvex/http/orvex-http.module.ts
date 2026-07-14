// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module, Provider } from '@nestjs/common';

import { OrvexConfigModule } from '../config/orvex-config.module';
import { OrvexConfigService } from '../config/orvex-config.service';
import {
  HttpIdentityIntrospector,
  IdentityIntrospector,
  NotConfiguredIntrospector,
} from '../../core/session-mint/identity-introspector';
import {
  HttpIdentityRegistryClient,
  IdentityRegistryClient,
  NotConfiguredRegistryClient,
} from './identity-registry-client';
import { OrvexQuotaController } from './orvex-quota.controller';
import { OrvexSourceController } from './orvex-source.controller';
import { OrvexTenantMoveController } from './orvex-tenant-move.controller';
import {
  OrvexTenantCellMoveService,
  TENANT_MOVE_INTROSPECTOR,
  TENANT_MOVE_REGISTRY_CLIENT,
} from './orvex-tenant-cell-move.service';

/** Bounds a hung identity dependency into an honest failure (ms). */
const IDENTITY_CALL_TIMEOUT_MS = 5000;

/**
 * Compose the ENG-1578 tenant-move introspector — SEPARATE instance from
 * `core/session-mint`'s `IDENTITY_INTROSPECTOR` (that token is module-local
 * to `OrvexSessionMintModule`, which is DB-backed and NOT importable here —
 * see this module's own doc on why `orvexApplyOps`/`orvexSessionExchange`
 * had to move OUT of this DB-free module). Same composition logic, same
 * ACCEPT-DON'T-CREATE seam (`ORVEX_IDENTITY_URL` unset -> fail-closed).
 */
function composeTenantMoveIntrospector(
  config: OrvexConfigService,
): IdentityIntrospector {
  const identityUrl = config.identityUrl;
  if (identityUrl === null) {
    return new NotConfiguredIntrospector();
  }
  return new HttpIdentityIntrospector({
    baseUrl: identityUrl,
    introspectionAuth: config.identityIntrospectionToken,
    timeoutMs: IDENTITY_CALL_TIMEOUT_MS,
    fetch: (input, init) => fetch(input, init),
  });
}

/** Compose the ENG-1578 identity registry HTTP client (same seam/fallback). */
function composeTenantMoveRegistryClient(
  config: OrvexConfigService,
): IdentityRegistryClient {
  const identityUrl = config.identityUrl;
  if (identityUrl === null) {
    return new NotConfiguredRegistryClient();
  }
  return new HttpIdentityRegistryClient({
    baseUrl: identityUrl,
    timeoutMs: IDENTITY_CALL_TIMEOUT_MS,
    fetch: (input, init) => fetch(input, init),
  });
}

/**
 * Mounts the additive `/api/orvex/*` primitive surface (the paths traced by
 * `contracts/openapi.yaml`). Imports {@link OrvexConfigModule} because the REAL
 * source-offer controller injects {@link OrvexConfigService}. Only reachable
 * when the master flag is on — see {@link OrvexRootModule}.
 *
 * ENG-1652 — `OrvexApplyOpsController` (`POST /orvex/pages/:pageId/apply-ops`)
 * is deliberately NOT mounted here: its real orchestrator needs `PageRepo`/
 * `@InjectKysely()`, and `orvex-http.e2e.spec.ts` boots this module's
 * `OrvexRootModule.register()` tree WITHOUT `DatabaseModule` — the same
 * DB-dependency conflict documented on `OrvexModulesEnabledGuard` (which
 * this ticket reuses). It lives in `OrvexApplyOpsModule`
 * (`page-blocks/apply-ops.module.ts`), mounted unconditionally by
 * `PageModule`, same precedent as `OrvexLlmsModule`/`OrvexPageMetadataModule`.
 *
 * FR-W6 — `POST /api/orvex/session/exchange` left this module when it stopped
 * being a 501 stub: the REAL session-mint needs `UserRepo`/`SessionService`
 * (DB) — and the A-BOUNDARY fence forbids orvex/* from importing @docmost/* — so
 * it moved to the DB-backed, unconditionally-mounted `OrvexSessionMintModule`
 * under core (`core/session-mint/orvex-session-mint.module.ts`).
 *
 * ENG-1578 — `POST /api/orvex/tenant-move` (bare, the REGISTRY cross-cell
 * tenant-MOVE) stays IN this module, unlike the two carve-outs above: its
 * only dependencies are two NETWORK ports (identity introspection + the
 * identity registry HTTP client, both composed here from
 * {@link OrvexConfigService} alone) — no Kysely, no repo, no DB. It is
 * therefore safe inside the DB-free `orvex-http.e2e.spec.ts` harness the
 * same way `OrvexSourceController` is.
 */
@Module({
  imports: [OrvexConfigModule],
  controllers: [
    OrvexQuotaController,
    OrvexSourceController,
    OrvexTenantMoveController,
  ],
  providers: [
    OrvexTenantCellMoveService,
    {
      provide: TENANT_MOVE_INTROSPECTOR,
      useFactory: (config: OrvexConfigService): IdentityIntrospector =>
        composeTenantMoveIntrospector(config),
      inject: [OrvexConfigService],
    } satisfies Provider,
    {
      provide: TENANT_MOVE_REGISTRY_CLIENT,
      useFactory: (config: OrvexConfigService): IdentityRegistryClient =>
        composeTenantMoveRegistryClient(config),
      inject: [OrvexConfigService],
    } satisfies Provider,
  ],
})
export class OrvexHttpModule {}
