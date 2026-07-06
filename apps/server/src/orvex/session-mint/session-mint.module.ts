import { DynamicModule, Module, Provider } from '@nestjs/common';

import {
  ExchangeTokenVerifier,
  ExchangeTokenVerifierDeps,
} from './exchange-token-verifier';

/**
 * Injection token for the exchange-token verifier (A-AUTH / FR-W6).
 * Consumers inject the verifier via this token, not the concrete class.
 */
export const EXCHANGE_TOKEN_VERIFIER = Symbol('EXCHANGE_TOKEN_VERIFIER');

/**
 * Minimal Nest module for the exchange-token verification seam (Foundation M7).
 *
 * INERT AT M7: this module is deliberately NOT imported by app.module.ts. The
 * inert `OrvexRootModule` aggregation that mounts the orvex tree into the app
 * lands in the M8 skeleton stage — at that point OrvexRootModule imports
 * `SessionMintModule.register(...)`.
 *
 * ACCEPT-DON'T-CREATE (CS §3.4): the JWKS source is a network seam (CS §5), so
 * this module NEVER calls `createRemoteJWKSet` itself. The caller supplies the
 * fully-built deps — in production the aggregating module passes
 * `{ jwks: createRemoteJWKSet(new URL(identityCertsUrl)), issuer, audience }`
 * (that one remote-adapter call is the "later stage" wiring); a test can pass a
 * `createLocalJWKSet(...)` port instead. Exposed only through `register()` so
 * there is no half-wired default provider to instantiate by accident.
 */
@Module({})
export class SessionMintModule {
  /**
   * Bind and export the verifier, constructed from injected deps.
   */
  static register(deps: ExchangeTokenVerifierDeps): DynamicModule {
    const verifierProvider: Provider = {
      provide: EXCHANGE_TOKEN_VERIFIER,
      useValue: new ExchangeTokenVerifier(deps),
    };

    return {
      module: SessionMintModule,
      providers: [verifierProvider],
      exports: [verifierProvider],
    };
  }
}
