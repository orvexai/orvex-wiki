// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { DynamicModule, Module, Provider } from '@nestjs/common';

import { EdgeAssertionVerifier, EdgeAssertionVerifierDeps } from './edge-assertion-verifier';

/**
 * Injection token for the edge-assertion verifier (ADR-0049 / ENG-3063).
 * Consumers inject the verifier via this token, not the concrete class.
 */
export const EDGE_ASSERTION_VERIFIER = Symbol('EDGE_ASSERTION_VERIFIER');

/**
 * Minimal Nest module for the edge-assertion verification seam.
 *
 * INERT: this module is deliberately NOT imported by `app.module.ts` and no
 * guard yet consumes {@link EDGE_ASSERTION_VERIFIER} — that per-route flip
 * (deleting whatever this engine's own request path uses today, wiring a
 * real ForwardAuth-fed header into a guard) is a LATER, separate ticket
 * (ADR-0049 build-plan Wave 5), gated on the edge (ENG-3071) actually
 * injecting the assertion. This ticket's scope is the verifier itself,
 * proven against the shared conformance corpus.
 *
 * ACCEPT-DON'T-CREATE (CS §3.4), same pattern as the sibling
 * `../session-mint/session-mint.module.ts`: the JWKS source is a network
 * seam (CS §5), so this module never builds one itself. The caller supplies
 * fully-built deps — in production, an
 * `EdgeAssertionKeySource` backed by identity's internal JWKS endpoint
 * (ENG-3060); in tests, `StaticEdgeAssertionKeySource` over the committed
 * corpus fixture. Exposed only through `register()` so there is no
 * half-wired default provider to instantiate by accident.
 */
@Module({})
export class EdgeAuthModule {
  static register(deps: EdgeAssertionVerifierDeps): DynamicModule {
    const verifierProvider: Provider = {
      provide: EDGE_ASSERTION_VERIFIER,
      useValue: new EdgeAssertionVerifier(deps),
    };

    return {
      module: EdgeAuthModule,
      providers: [verifierProvider],
      exports: [verifierProvider],
    };
  }
}
