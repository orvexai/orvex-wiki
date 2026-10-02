// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module, Provider } from '@nestjs/common';

import { OrvexConfigModule } from '../../orvex/config/orvex-config.module';
import { OrvexConfigService } from '../../orvex/config/orvex-config.service';
import { OrvexSessionExchangeController } from './orvex-session-exchange.controller';
import {
  EdgeAssertionVerifierPort,
  OrvexSessionMintService,
} from './orvex-session-mint.service';
import {
  HttpIdentityIntrospector,
  IDENTITY_INTROSPECTOR,
  IdentityIntrospector,
  NotConfiguredIntrospector,
} from './identity-introspector';
import { EDGE_ASSERTION_VERIFIER } from '../../orvex/edge-auth/edge-auth.module';
import { EdgeAssertionVerifier } from '../../orvex/edge-auth/edge-assertion-verifier';
import type { EdgeAssertionClaims } from '../../orvex/edge-auth/edge-assertion.types';
import { RemoteEdgeAssertionKeySource } from '../../orvex/edge-auth/remote-edge-assertion-key-source';
import { WIKI_EDGE_AUDIENCE } from './wiki-edge-audience';

/** Bounds a hung identity dependency into an honest failure (ms). */
const INTROSPECT_TIMEOUT_MS = 5000;

/** Bounds a hung identity JWKS fetch into an honest failure (ms). */
const EDGE_JWKS_TIMEOUT_MS = 5000;

/**
 * Clock-skew tolerance applied ONLY to the assertion's `iat`/`nbf` (never
 * `exp`, which always gets zero leeway) — ADR-0049's ≤30s minter-drift bound.
 */
const EDGE_SKEW_TOLERANCE_SECONDS = 30;

/**
 * Typed configuration failure: the ADR-0049 edge-assertion seam is not
 * configured (`ORVEX_EDGE_ISSUER` / `ORVEX_EDGE_JWKS_URL` unset). Distinct from
 * an assertion rejection — it FAILS CLOSED on use (an honest 5xx) rather than
 * silently bypassing verification. Parity with `OrvexIntrospectionNotConfiguredError`.
 */
export class OrvexEdgeNotConfiguredError extends Error {
  public readonly code = 'NOT_CONFIGURED';

  constructor() {
    super(
      'orvex edge-assertion verification is not configured (ORVEX_EDGE_ISSUER / ORVEX_EDGE_JWKS_URL unset)',
    );
    this.name = 'OrvexEdgeNotConfiguredError';
  }
}

/**
 * Compose the ADR-0049 edge-assertion verifier from configuration
 * (ACCEPT-DON'T-CREATE: the one place the remote JWKS adapter is built). When
 * either `ORVEX_EDGE_ISSUER` or `ORVEX_EDGE_JWKS_URL` is unset the seam is
 * UNCONFIGURED, so we bind a fail-closed verifier — every `mintSessionFromAssertion`
 * throws the typed NOT_CONFIGURED error (a 5xx), never a silent bypass. Otherwise
 * we bind the real generic ES256 verifier:
 *   - keys:  `RemoteEdgeAssertionKeySource` over identity's internal JWKS (lazy
 *            fetch on first verify; the verifier owns the one-refresh invariant).
 *   - audience: `WIKI_EDGE_AUDIENCE` — the AGPL-clean baked `ServiceWiki` token,
 *            NEVER config (ADR-0049 audience rule / AD-8).
 *   - issuer: the configured `ORVEX_EDGE_ISSUER`, enforced exactly.
 */
function composeEdgeVerifier(
  config: OrvexConfigService,
): EdgeAssertionVerifierPort {
  const issuer = config.edgeIssuer;
  const jwksUrl = config.edgeJwksUrl;
  if (issuer === null || jwksUrl === null) {
    return {
      verify(): Promise<EdgeAssertionClaims> {
        return Promise.reject(new OrvexEdgeNotConfiguredError());
      },
    };
  }
  return new EdgeAssertionVerifier({
    keys: new RemoteEdgeAssertionKeySource({
      jwksUrl,
      timeoutMs: EDGE_JWKS_TIMEOUT_MS,
    }),
    issuer,
    audience: WIKI_EDGE_AUDIENCE,
    skewToleranceSeconds: EDGE_SKEW_TOLERANCE_SECONDS,
  });
}

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
 * imported explicitly (for the introspector + edge-verifier composition).
 *
 * DUAL-ACCEPT (ADR-0049 S2S, step 1 of the safe 3-step cutover): this module
 * now composes BOTH credential seams the controller routes between — the ES256
 * edge-assertion verifier (`EDGE_ASSERTION_VERIFIER`, the PREFERRED path) and
 * the TRANSIENT opaque-token introspector (`IDENTITY_INTROSPECTOR`). Both are
 * fail-closed by default (no edge config ⇒ the edge verifier rejects; no
 * `ORVEX_IDENTITY_URL` ⇒ the introspector rejects). The introspector path is a
 * TEMPORARY migration shim — once wiki-api (and ai) switch to sending an
 * assertion (obtained from identity's `/internal/edge-delegate`), it MUST be
 * removed together with the controller's `exchangeToken` branch (hard cut, no
 * fallback — see no-fallbacks-hard-cuts). Until then, keeping it live is what
 * lets the wiki product keep serving while the upstreams migrate.
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
    {
      provide: EDGE_ASSERTION_VERIFIER,
      useFactory: (config: OrvexConfigService): EdgeAssertionVerifierPort =>
        composeEdgeVerifier(config),
      inject: [OrvexConfigService],
    } satisfies Provider,
  ],
})
export class OrvexSessionMintModule {}
