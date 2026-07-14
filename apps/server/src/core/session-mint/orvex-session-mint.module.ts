// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module, Provider } from '@nestjs/common';

import { OrvexConfigModule } from '../../orvex/config/orvex-config.module';
import { OrvexConfigService } from '../../orvex/config/orvex-config.service';
import { OrvexSessionExchangeController } from './orvex-session-exchange.controller';
import { OrvexSessionMintService } from './orvex-session-mint.service';
import {
  HttpIdentityIntrospector,
  IDENTITY_INTROSPECTOR,
  IdentityIntrospector,
  NotConfiguredIntrospector,
} from './identity-introspector';

/** Bounds a hung identity dependency into an honest failure (ms). */
const INTROSPECT_TIMEOUT_MS = 5000;

/**
 * Compose the introspection port from configuration (ACCEPT-DON'T-CREATE: the
 * one place the HTTP adapter is built). When `ORVEX_IDENTITY_URL` is unset the
 * seam is UNCONFIGURED, so we bind the fail-closed introspector — every mint
 * attempt throws the typed NOT_CONFIGURED error (a 5xx), never a silent bypass.
 * Otherwise we bind the real adapter over identity's `POST /v1/introspect`, with
 * the optional introspection bearer (sent only when configured; never logged).
 */
function composeIntrospector(config: OrvexConfigService): IdentityIntrospector {
  const identityUrl = config.identityUrl;
  if (identityUrl === null) {
    return new NotConfiguredIntrospector();
  }
  return new HttpIdentityIntrospector({
    baseUrl: identityUrl,
    introspectionAuth: config.identityIntrospectionToken,
    timeoutMs: INTROSPECT_TIMEOUT_MS,
    // Node 18+ global fetch; the port is injectable so tests never touch it.
    fetch: (input, init) => fetch(input, init),
  });
}

/**
 * OrvexSessionMintModule (FR-W6 / A-AUTH) — mounts the real
 * `POST /api/orvex/session/exchange` session-mint surface.
 *
 * MOUNTED UNCONDITIONALLY (app.module.ts), NOT inside the flag-gated
 * `OrvexRootModule` tree — the same placement precedent as `InternalApiModule`:
 * a DB-backed engine seam that is fail-closed by default (no `ORVEX_IDENTITY_URL`
 * ⇒ the composed introspector rejects every mint), so mounting it always is safe
 * for a vanilla build and it does not hit the DB-free `OrvexRootModule` e2e
 * harness constraint (that harness boots `register()` WITHOUT `DatabaseModule`,
 * and this controller needs `UserRepo`/`SessionService`).
 *
 * `UserRepo`/`WorkspaceRepo` (global DatabaseModule repos), `SessionService`
 * (global `SessionModule`), `EnvironmentService` (global) and `AUDIT_SERVICE`
 * (global) are resolved via DI without a re-import; only `OrvexConfigModule` is
 * imported explicitly (for the introspector composition).
 */
@Module({
  imports: [OrvexConfigModule],
  controllers: [OrvexSessionExchangeController],
  providers: [
    OrvexSessionMintService,
    {
      provide: IDENTITY_INTROSPECTOR,
      useFactory: (config: OrvexConfigService): IdentityIntrospector =>
        composeIntrospector(config),
      inject: [OrvexConfigService],
    } satisfies Provider,
  ],
})
export class OrvexSessionMintModule {}
