// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { jwtVerify, errors } from 'jose';
import type { JWTVerifyGetKey, JWTPayload } from 'jose';

import {
  ExchangeTokenClaims,
  ExchangeTokenErrorCode,
  ExchangeTokenVerificationError,
} from './exchange-token.types';

/**
 * Construction dependencies for {@link ExchangeTokenVerifier}.
 *
 * ACCEPT-DON'T-CREATE (CS §3.4): the JWKS source is a NETWORK SEAM (CS §5), so
 * the key-resolver is INJECTED, never built here. There is deliberately NO fetch,
 * no URL, and no `createRemoteJWKSet` call inside this class. In production the
 * `jwks` port is a single `createRemoteJWKSet(new URL(identityCertsUrl))` wired
 * once at module construction (a later stage); in tests it is a
 * `createLocalJWKSet(fixture)` built from the committed real-shaped Keycloak
 * response. The verifier cannot tell the two apart — that is the seam.
 */
export interface ExchangeTokenVerifierDeps {
  /** Key-resolver port (jose JWKS getKey). Injected — see class doc. */
  readonly jwks: JWTVerifyGetKey;
  /** Expected token issuer (identity realm issuer URL). Enforced. */
  readonly issuer: string;
  /** Expected token audience (this engine's client id). Enforced. */
  readonly audience: string;
}

/**
 * Verifies orvex-studio-identity-minted exchange tokens (A-AUTH / PRD FR-W6).
 *
 * SECURITY INVARIANTS (all enforced below, none configurable):
 *  - RS256 ONLY. `algorithms: ['RS256']` is the allowlist, so an `alg: none`
 *    token and an HS256 token (the RSA-public-key-as-HMAC-secret key-confusion
 *    attack) are both rejected before any key is touched → ALG_REJECTED.
 *  - issuer + audience + exp + nbf are all enforced (nbf/exp temporally, iss/aud
 *    by exact match). A token with no `exp` is rejected (exp presence enforced
 *    below — jose only checks exp when present, so we require it explicitly).
 *  - There is NO unsigned-claims path and NO test-mode bypass: the ONLY public
 *    method is verify(), which always runs full cryptographic verification.
 *
 * NO DECODE-WITHOUT-VERIFY (M7 gate): this class exposes exactly one behaviour —
 * verify(). There is intentionally no `decode()`, no `unsafeDecode()`, no static
 * claim reader — a caller physically cannot obtain claims from a token without
 * the signature, issuer, audience, exp and nbf checks having passed.
 */
export class ExchangeTokenVerifier {
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(deps: ExchangeTokenVerifierDeps) {
    this.jwks = deps.jwks;
    this.issuer = deps.issuer;
    this.audience = deps.audience;
  }

  /**
   * Verify a compact-JWS exchange token and return its typed claims.
   *
   * @throws {ExchangeTokenVerificationError} with a stable `code` on any
   *   rejection. The message never contains token bytes or key material.
   */
  async verify(token: string): Promise<ExchangeTokenClaims> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience,
        // exp/nbf are validated by jose whenever present, with zero clock
        // tolerance (the default). exp *presence* is enforced after verify().
      });
      payload = result.payload;
    } catch (err: unknown) {
      throw new ExchangeTokenVerificationError(mapJoseError(err), err);
    }

    return narrowClaims(payload);
  }
}

/**
 * Narrow the verified jose payload to our typed contract. jose has already
 * proven signature + iss + aud + (when present) exp/nbf; here we additionally
 * ENFORCE that the required claims exist with the right runtime types —
 * including exp presence, which jose does not require on its own. Any shortfall
 * is MALFORMED (a rejection), never a silently-coerced value.
 *
 * A module-private free function, not a method: the {@link ExchangeTokenVerifier}
 * prototype is kept to a single public behaviour (verify), so there is provably no
 * second surface a caller could reach. It also takes an already-jose-verified
 * payload, never a raw token, so it is not a decode-without-verify path.
 */
function narrowClaims(payload: JWTPayload): ExchangeTokenClaims {
  const { sub, iss, aud, exp } = payload;
  const workspaceId: unknown = payload.workspaceId;

  if (
    typeof sub !== 'string' ||
    typeof workspaceId !== 'string' ||
    typeof iss !== 'string' ||
    typeof exp !== 'number' ||
    (typeof aud !== 'string' && !Array.isArray(aud))
  ) {
    throw new ExchangeTokenVerificationError('MALFORMED');
  }

  return { sub, workspaceId, iss, aud, exp };
}

/**
 * Map a thrown jose error to a stable {@link ExchangeTokenErrorCode}. Codes and
 * class↔code correspondence are pinned by jose's public error taxonomy (verified
 * against jose 6.2.3). `JWTExpired` is checked before the generic claim-failure
 * branch because it `implements` (does not extend) `JWTClaimValidationFailed`.
 */
function mapJoseError(err: unknown): ExchangeTokenErrorCode {
  if (err instanceof errors.JOSEAlgNotAllowed) {
    return 'ALG_REJECTED';
  }
  if (err instanceof errors.JWTExpired) {
    return 'EXPIRED';
  }
  if (err instanceof errors.JWTClaimValidationFailed) {
    if (err.claim === 'iss') {
      return 'WRONG_ISSUER';
    }
    if (err.claim === 'aud') {
      return 'WRONG_AUDIENCE';
    }
    // Any other claim check (e.g. nbf-in-future) is a rejection; there is no
    // dedicated code in the closed set, so it folds into MALFORMED — the token
    // was well-formed but its claim set did not validate. Never an accept.
    return 'MALFORMED';
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    return 'BAD_SIGNATURE';
  }
  // JWSInvalid / JWTInvalid / JWKSNoMatchingKey / anything else: the token could
  // not be parsed or matched to a key. Rejected as MALFORMED.
  return 'MALFORMED';
}
