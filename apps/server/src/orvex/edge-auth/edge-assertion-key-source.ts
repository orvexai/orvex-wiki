// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { createLocalJWKSet } from 'jose';
import type { CompactVerifyGetKey, JSONWebKeySet } from 'jose';

/** The key type {@link EdgeAssertionVerifier} resolves and verifies with. */
export type EdgeAssertionKey = Awaited<ReturnType<CompactVerifyGetKey>>;

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
 * The one-argument shape this class actually calls `createLocalJWKSet`'s
 * result with. jose's public `CompactVerifyGetKey` type requires a second
 * (`token`) argument, but `LocalJWKSet#getKey`'s real implementation only
 * ever reads an optional `token.header` off it (verified against
 * `jose/dist/*\/jwks/local.js`) — omitting it is runtime-safe. Narrowing the
 * local type this way avoids fabricating a fake `FlattenedJWSInput`.
 */
type LocalGetKey = (header: { alg: string; kid?: string }) => Promise<EdgeAssertionKey>;

/**
 * A static, non-refreshing {@link EdgeAssertionKeySource} over an in-memory
 * JWKS. Used by tests (built from the committed real-shaped corpus fixture,
 * `jose.createLocalJWKSet`, never a hand-authored key — CS §5) and by any
 * caller that legitimately has the full key set up front. `refresh()` is a
 * genuine no-op here (there is no further source to consult), which is why
 * the ADR-0049 "unknown kid" case against this source is expected to still
 * reject after the verifier's one refresh attempt.
 */
export class StaticEdgeAssertionKeySource implements EdgeAssertionKeySource {
  private readonly getKey: LocalGetKey;

  constructor(jwks: JSONWebKeySet) {
    this.getKey = createLocalJWKSet(jwks) as unknown as LocalGetKey;
  }

  async resolve(kid: string): Promise<EdgeAssertionKey | undefined> {
    try {
      return await this.getKey({ alg: 'ES256', kid });
    } catch {
      // createLocalJWKSet throws JWKSNoMatchingKey / JWKSMultipleMatchingKeys
      // on a miss/ambiguous match — both are "no key", never a thrown
      // surprise the caller has to special-case.
      return undefined;
    }
  }

  async refresh(): Promise<void> {
    // No further source to consult — see class doc.
  }
}
