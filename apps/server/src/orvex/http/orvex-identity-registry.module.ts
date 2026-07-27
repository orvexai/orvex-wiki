// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module, Provider } from '@nestjs/common';

import { OrvexConfigModule } from '../config/orvex-config.module';
import { OrvexConfigService } from '../config/orvex-config.service';
import {
  HttpIdentityRegistryClient,
  IdentityRegistryClient,
  NotConfiguredRegistryClient,
} from './identity-registry-client';

/** DI token for the identity global-registry port (ONE adapter, CS §3.2). */
export const IDENTITY_REGISTRY_CLIENT = Symbol('IDENTITY_REGISTRY_CLIENT');

/** Bounds a hung identity dependency into an honest failure (ms). */
export const IDENTITY_REGISTRY_TIMEOUT_MS = 5000;

/**
 * Compose the identity registry HTTP client (ACCEPT-DON'T-CREATE, CS §3.4 —
 * the ONE place the concrete adapter is built). `ORVEX_IDENTITY_URL` unset ⇒
 * the fail-closed {@link NotConfiguredRegistryClient}: every registry call
 * rejects with the typed `NOT_CONFIGURED` error, never a silent bypass and
 * never a fabricated reservation.
 */
export function composeIdentityRegistryClient(
  config: OrvexConfigService,
): IdentityRegistryClient {
  const identityUrl = config.identityUrl;
  if (identityUrl === null) {
    return new NotConfiguredRegistryClient();
  }
  return new HttpIdentityRegistryClient({
    baseUrl: identityUrl,
    timeoutMs: IDENTITY_REGISTRY_TIMEOUT_MS,
    fetch: (input, init) => fetch(input, init),
  });
}

/**
 * OrvexIdentityRegistryModule (ENG-2503) — the ONE composition point for the
 * `IdentityRegistryClient` port, `@Global()` and mounted UNCONDITIONALLY from
 * `app.module.ts`.
 *
 * WHY IT EXISTS (the wiring defect it closes): the port used to be a
 * module-PRIVATE provider inside `OrvexHttpModule`, which is itself only
 * mounted when `ORVEX_MODULES_ENABLED=true` (via `OrvexRootModule.register()`)
 * and exported nothing. `PrincipalProvisioningService` (AC4/AC5 mint-time
 * global-uniqueness delegation) and `WorkspaceUpgradeService` (AC3
 * upgrade-pass) both live in `core/**` and inject the port `@Optional()`, so
 * in the composed application Nest resolved `undefined` with NO boot error:
 * `reserveTenantGlobally` always took its early return and `upgradeToTeam`
 * always threw `RegistryClientNotConfiguredError`. The registry delegation
 * existed only in hand-wired tests.
 *
 * PLACEMENT PRECEDENT: `@Global()` + unconditional app.module import — exactly
 * `EntitlementModule` / `OrvexTenancyModule` / `OrvexSessionMintModule`. Core
 * tenancy seams must be governed whether or not the optional, flag-gated orvex
 * HTTP tree is enabled. It is safe to mount always because the composed client
 * is fail-closed when unconfigured (it has NO DatabaseModule/Kysely
 * dependency, so it also does not break the DB-free e2e harnesses).
 *
 * ONE ADAPTER (CS §3.2): `OrvexHttpModule` no longer composes its own second
 * instance — it imports this module and re-binds its own historical
 * `TENANT_MOVE_REGISTRY_CLIENT` token onto the SAME provider via
 * `useExisting`, so `OrvexTenantCellMoveService` (ENG-1578) keeps its token
 * while every consumer shares one adapter.
 */
@Global()
@Module({
  imports: [OrvexConfigModule],
  providers: [
    {
      provide: IDENTITY_REGISTRY_CLIENT,
      useFactory: (config: OrvexConfigService): IdentityRegistryClient =>
        composeIdentityRegistryClient(config),
      inject: [OrvexConfigService],
    } satisfies Provider,
  ],
  exports: [IDENTITY_REGISTRY_CLIENT],
})
export class OrvexIdentityRegistryModule {}
