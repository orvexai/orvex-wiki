import { DynamicModule, Module, Provider } from '@nestjs/common';
import { createRemoteJWKSet } from 'jose';

import { OrvexConfigModule } from './config/orvex-config.module';
import { OrvexConfigService } from './config/orvex-config.service';
import { OrvexHttpModule } from './http/orvex-http.module';
import { OrvexEnforceSsoModule } from './enforce-sso/orvex-enforce-sso.module';
import { OrvexPageBlocksModule } from './page-blocks/page-blocks.module';
import { ExchangeTokenVerifier } from './session-mint/exchange-token-verifier';
import type { ExchangeTokenVerifierDeps } from './session-mint/exchange-token-verifier';
import type { ExchangeTokenClaims } from './session-mint/exchange-token.types';
import {
  EXCHANGE_TOKEN_VERIFIER,
  SessionMintModule,
} from './session-mint/session-mint.module';

/**
 * Typed configuration failure raised by the session-mint verifier when the
 * identity JWKS seam is not configured. Distinct from a token-verification
 * rejection: it means the engine was never told where identity lives, so it
 * FAILS CLOSED on use (deny-by-default) rather than silently bypassing auth.
 */
export class OrvexIdentityNotConfiguredError extends Error {
  public readonly code = 'NOT_CONFIGURED';

  constructor() {
    super(
      'orvex identity verification is not configured (ORVEX_IDENTITY_URL unset)',
    );
    this.name = 'OrvexIdentityNotConfiguredError';
  }
}

/**
 * Compose the M7 SessionMintModule (FR-W6 / A-AUTH).
 *
 * ACCEPT-DON'T-CREATE (CS): the JWKS source is a network seam, so the remote
 * adapter is built HERE (the sanctioned wiring point per the M7 module comment)
 * and injected into the verifier. `createRemoteJWKSet` is CONSTRUCTION ONLY — the
 * remote fetch happens lazily at first verify(), never at boot.
 *
 * If `ORVEX_IDENTITY_URL` is unset, we compose a verifier that FAILS CLOSED with
 * the typed NOT_CONFIGURED error on use — never a silent bypass. (Both branches
 * are construction-only today: `orvexSessionExchange` is 501, so the verifier is
 * not invoked until the A-THIN session fold-in lands.)
 */
function composeSessionMint(config: OrvexConfigService): DynamicModule {
  const identityUrl = config.identityUrl;

  if (identityUrl === null) {
    const notConfiguredVerifier: Pick<ExchangeTokenVerifier, 'verify'> = {
      verify(): Promise<ExchangeTokenClaims> {
        return Promise.reject(new OrvexIdentityNotConfiguredError());
      },
    };
    const provider: Provider = {
      provide: EXCHANGE_TOKEN_VERIFIER,
      useValue: notConfiguredVerifier,
    };
    return {
      module: SessionMintModule,
      providers: [provider],
      exports: [provider],
    };
  }

  // Construction-only remote adapter (lazy fetch on first verify). issuer /
  // audience are derived from the single configured identity URL today; they are
  // refined into distinct realm-issuer / engine-client-id values at the A-THIN
  // session fold-in (delivery). Nothing is fabricated — every value is the real
  // configured URL, and the verifier fails closed on any mismatch.
  const deps: ExchangeTokenVerifierDeps = {
    jwks: createRemoteJWKSet(new URL(identityUrl)),
    issuer: identityUrl,
    audience: identityUrl,
  };
  return SessionMintModule.register(deps);
}

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
 */
@Module({})
export class OrvexRootModule {
  static register(): DynamicModule {
    if (process.env.ORVEX_MODULES_ENABLED !== 'true') {
      return { module: OrvexRootModule };
    }

    const config = new OrvexConfigService();
    return {
      module: OrvexRootModule,
      imports: [
        OrvexConfigModule,
        OrvexHttpModule,
        OrvexEnforceSsoModule,
        OrvexPageBlocksModule,
        composeSessionMint(config),
      ],
    };
  }
}
