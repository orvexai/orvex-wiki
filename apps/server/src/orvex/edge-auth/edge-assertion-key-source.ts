// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { webcrypto } from 'node:crypto';

import { createLocalEs256Jwks } from './local-es256-jwks';
import type { EdgeJwks, LocalEs256KeyResolver } from './local-es256-jwks';

export type { EdgeJwks } from './local-es256-jwks';

/**
 * The key type {@link EdgeAssertionVerifier} resolves and verifies with — a
 * Web Crypto `CryptoKey`, which is exactly what the verifier's
 * `SubtleCrypto.verify` call needs (ENG-3495: previously `jose`'s
 * `Awaited<ReturnType<CompactVerifyGetKey>>`, a union that had to be cast at
 * the verify site).
 */
export type EdgeAssertionKey = webcrypto.CryptoKey;

/**
 * Key-resolution port for {@link EdgeAssertionVerifier} (ADR-0049 §"Keys").
 *
 * ACCEPT-DON'T-CREATE (CS §3.4): this is a NETWORK SEAM (CS §5) — the
 * internal JWKS lives at identity's in-cluster endpoint (ENG-3060) — so it
 * is injected, never built inside the verifier. Deliberately two narrow
 * methods, not one: `resolve` is a pure cache lookup (never fetches,
 * returns `undefined` on a miss rather than throwing) and `refresh` is the
 * one explicit re-fetch operation. Keeping them separate is what lets the
 * verifier itself own and prove the ADR-0049 "unknown kid triggers exactly
 * ONE refresh, then reject — never falls through to accept" invariant,
 * rather than trusting an opaque library-internal retry policy.
 */
export interface EdgeAssertionKeySource {
  /** Look up `kid` in the CURRENTLY cached key material. Never fetches. */
  resolve(kid: string): Promise<EdgeAssertionKey | undefined>;
  /** Force exactly one re-fetch of the key material from the source of truth. */
  refresh(): Promise<void>;
}

/**
 * A static, non-refreshing {@link EdgeAssertionKeySource} over an in-memory
 * JWKS. Used by tests (built from the committed real-shaped corpus fixture,
 * never a hand-authored key — CS §5) and by any caller that legitimately has
 * the full key set up front. `refresh()` is a genuine no-op here (there is no
 * further source to consult), which is why the ADR-0049 "unknown kid" case
 * against this source is expected to still reject after the verifier's one
 * refresh attempt.
 */
export class StaticEdgeAssertionKeySource implements EdgeAssertionKeySource {
  private readonly getKey: LocalEs256KeyResolver;

  constructor(jwks: EdgeJwks) {
    this.getKey = createLocalEs256Jwks(jwks);
  }

  async resolve(kid: string): Promise<EdgeAssertionKey | undefined> {
    // `createLocalEs256Jwks` already folds every "no usable key" outcome
    // (absent kid, ambiguous kid, unimportable material) into `undefined`
    // and never throws — same contract this method has always presented.
    return this.getKey(kid);
  }

  async refresh(): Promise<void> {
    // No further source to consult — see class doc.
  }
}
