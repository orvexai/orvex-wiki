// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { compactVerify, errors } from 'jose';
import type { CompactVerifyGetKey } from 'jose';

import type { EdgeAssertionKeySource } from './edge-assertion-key-source';
import {
  EdgeAssertionClaims,
  EdgeAssertionErrorCode,
  EdgeAssertionVerificationError,
} from './edge-assertion.types';

/**
 * Construction dependencies for {@link EdgeAssertionVerifier}. Fixed set,
 * all required (ADR-0049: "no check may be disabled by configuration") —
 * the constructor fails fast on any missing/mistyped dep rather than
 * silently defaulting one away.
 */
export interface EdgeAssertionVerifierDeps {
  /** JWKS resolution port (CS §5 network seam). See {@link EdgeAssertionKeySource}. */
  readonly keys: EdgeAssertionKeySource;
  /** identity's configured edge-authn issuer. Enforced exactly (ADR-0049 check 4). */
  readonly issuer: string;
  /**
   * This verifier's expected `aud[0]` value. Per ADR-0049 this MUST be a
   * generated compile-time constant from the AD-31 contracts service table
   * on every OTHER (closed-source) consumer — never config, never a local
   * literal, no interim exception. This AGPL engine is the AD-8 exception:
   * it cannot import the closed generated package, so the CALLER (the
   * composition root wiring this verifier for a real deployment) is
   * responsible for sourcing this value from the same AD-31 table by a
   * route that stays AGPL-clean (e.g. a small script reading
   * `orvex-studio-contracts`' service registry, never a config/env
   * fallback). The verifier itself only enforces equality — it never
   * decides the value, so it cannot introduce a config-fallback path.
   */
  readonly audience: string;
  /**
   * Clock-skew tolerance (seconds), applied ONLY to `iat`/`nbf` — NEVER to
   * `exp`, which always gets zero leeway (ADR-0049 check 3). A constructor
   * dependency, not a module constant, so it is visible and testable at
   * the call site rather than buried in this file.
   */
  readonly skewToleranceSeconds: number;
}

/**
 * Generic ES256 edge-assertion verifier — the AD-8 exception (ADR-0049).
 *
 * Every OTHER consumer of identity's `/v1/edge-authn` assertion adopts
 * `pkg/auth` (Go, ENG-2408) or `@orvex/auth-node` (TS, ENG-3062); neither
 * is importable here (AGPL/closed-license boundary). This class is the
 * ONE sanctioned from-scratch implementation, and its correctness is
 * proven not by trusting this file but by replaying the SAME shared
 * conformance corpus those two verifiers replay
 * (`orvex-studio-contracts` `identity/vectors/edge-assertion`, pinned
 * `v0.1.4`) — see `edge-assertion-verifier.spec.ts`.
 *
 * The five ADR-0049 checks run in the order the ADR requires — signature
 * BEFORE any claim is read, full stop:
 *
 *   1. header parse (jose, `compactVerify`)
 *   2. alg-pin — `algorithms: ['ES256']` allowlist; jose evaluates this
 *      against the header BEFORE ever calling the key resolver (verified
 *      against `jose/dist/*\/jws/flattened/verify.js`), so `alg: none` /
 *      `HS256` / `RS256` never reach step 3.
 *   3. kid resolve — via the injected {@link EdgeAssertionKeySource}, with
 *      this class's own exactly-one-refresh-then-reject orchestration
 *      (never jose's opaque internal retry policy).
 *   4. signature verify — over the raw JWS bytes, still inside
 *      `compactVerify`. Nothing below this line has been reached yet if
 *      this throws.
 *   5. (only now) payload is decoded and the remaining three claim checks
 *      run in this order: audience-value, expiry (zero-leeway `exp` +
 *      skewed `iat`/`nbf`), issuer.
 *
 * `compactVerify` — the JWS layer, not `jwtVerify` — is used deliberately:
 * jose's JWT-layer claims validator applies ONE `clockTolerance` to both
 * `exp` and `nbf`, which cannot express ADR-0049's asymmetric rule (zero
 * leeway on `exp`, up to `skewToleranceSeconds` on `iat`/`nbf`). Claims are
 * therefore validated by hand, below, after jose has finished the
 * signature-and-header half.
 *
 * NO DECODE-WITHOUT-VERIFY: the only public method is `verify()`. There is
 * no `decode()`/`unsafeDecode()`/static claim reader — claims are
 * physically unreachable without every check above having passed.
 */
export class EdgeAssertionVerifier {
  private readonly keys: EdgeAssertionKeySource;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly skewToleranceSeconds: number;

  constructor(deps: EdgeAssertionVerifierDeps) {
    if (
      !deps.keys ||
      typeof deps.issuer !== 'string' ||
      !deps.issuer ||
      typeof deps.audience !== 'string' ||
      !deps.audience ||
      typeof deps.skewToleranceSeconds !== 'number' ||
      !Number.isFinite(deps.skewToleranceSeconds) ||
      deps.skewToleranceSeconds < 0
    ) {
      // Fail fast at construction, never at first verify() — a caller
      // cannot end up with a half-configured verifier that silently
      // no-ops one of the five checks.
      throw new Error(
        'EdgeAssertionVerifier requires keys, issuer, audience and a non-negative skewToleranceSeconds',
      );
    }
    this.keys = deps.keys;
    this.issuer = deps.issuer;
    this.audience = deps.audience;
    this.skewToleranceSeconds = deps.skewToleranceSeconds;
  }

  /**
   * Verify a compact-JWS internal edge assertion and return its typed
   * claims.
   *
   * @param token the compact-JWS assertion (from `X-Orvex-Assertion` /
   *   the ForwardAuth-injected header — the caller's concern, not this
   *   class's).
   * @param opts.now injected verification clock (unix seconds). Defaults
   *   to the real wall clock; a corpus/unit test pins this to reproduce
   *   the golden corpus's fixed `now_unix`.
   * @throws {EdgeAssertionVerificationError} with a stable `code` on any
   *   rejection. Never carries claims, token bytes, or key material.
   */
  async verify(
    token: string,
    opts: { readonly now?: number } = {},
  ): Promise<EdgeAssertionClaims> {
    const now = opts.now ?? Math.floor(Date.now() / 1000);

    const getKey: CompactVerifyGetKey = async (protectedHeader) => {
      const kid = protectedHeader.kid;
      if (typeof kid !== 'string' || kid.length === 0) {
        throw new EdgeAssertionVerificationError('UNKNOWN_KID');
      }
      let key = await this.keys.resolve(kid);
      if (key === undefined) {
        // Exactly one refresh attempt (ADR-0049 check 4) — never a loop,
        // never a silent fall-through to accept.
        await this.keys.refresh();
        key = await this.keys.resolve(kid);
      }
      if (key === undefined) {
        throw new EdgeAssertionVerificationError('UNKNOWN_KID');
      }
      return key;
    };

    let payloadBytes: Uint8Array;
    try {
      const result = await compactVerify(token, getKey, { algorithms: ['ES256'] });
      payloadBytes = result.payload;
    } catch (err: unknown) {
      if (err instanceof EdgeAssertionVerificationError) {
        throw err;
      }
      throw new EdgeAssertionVerificationError(mapJoseError(err), err);
    }

    // Signature has verified. Only now is the payload decoded — nothing
    // above this line has looked at a single claim.
    const payload = parsePayload(payloadBytes);
    const claims = narrowClaims(payload);

    // Check: audience-value. Cardinality (len(aud)==1) is folded into the
    // same rejection here — a multi/zero-audience assertion and a
    // single-wrong-audience assertion are both "no single, matching
    // audience", so both are AUDIENCE_REJECTED (see edge-assertion.types.ts).
    if (claims.aud[0] !== this.audience) {
      throw new EdgeAssertionVerificationError('AUDIENCE_REJECTED');
    }

    // Check: expiry. `exp` gets ZERO leeway — this is the entire residual
    // revocation guarantee at an already-admitted service, so no grace is
    // ever applied here regardless of skewToleranceSeconds.
    if (claims.exp <= now) {
      throw new EdgeAssertionVerificationError('EXPIRED');
    }
    // `iat` (and `nbf`, if the minter ever adds one — additionalProperties
    // is true on the pinned schema) tolerate up to skewToleranceSeconds of
    // minter clock drift on the not-yet-valid side ONLY.
    if (claims.iat > now + this.skewToleranceSeconds) {
      throw new EdgeAssertionVerificationError('NOT_YET_VALID');
    }
    const nbf = (payload as { nbf?: unknown }).nbf;
    if (typeof nbf === 'number' && nbf > now + this.skewToleranceSeconds) {
      throw new EdgeAssertionVerificationError('NOT_YET_VALID');
    }

    // Check: issuer. kid already resolved in the trusted JWKS (step 3
    // above); this is the `iss` string-equality half of "issuer-kid".
    if (claims.iss !== this.issuer) {
      throw new EdgeAssertionVerificationError('WRONG_ISSUER');
    }

    return claims;
  }
}

/** Parse the verified JWS payload bytes as JSON. Any failure is MALFORMED. */
function parsePayload(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new EdgeAssertionVerificationError('MALFORMED');
  }
}

/**
 * Narrow an already-signature-verified payload to the pinned nine-claim
 * contract (`identity/edge-assertion-claims.schema.json`, v0.1.4). Any
 * missing/mistyped claim is MALFORMED, never silently coerced or defaulted.
 * A module-private free function, not a method — {@link EdgeAssertionVerifier}'s
 * prototype stays a single public behaviour (`verify`), so this never
 * becomes a second, decode-without-verify-shaped surface.
 */
function narrowClaims(payload: unknown): EdgeAssertionClaims {
  if (typeof payload !== 'object' || payload === null) {
    throw new EdgeAssertionVerificationError('MALFORMED');
  }
  const p = payload as Record<string, unknown>;
  const { sub, tenant, cell, scope, aud, iss, iat, exp } = p;
  const cellEpoch = p.cell_epoch;

  if (
    typeof sub !== 'string' ||
    typeof tenant !== 'string' ||
    typeof cell !== 'string' ||
    cell.length === 0 ||
    typeof cellEpoch !== 'number' ||
    !Number.isInteger(cellEpoch) ||
    cellEpoch < 0 ||
    typeof scope !== 'string' ||
    !Array.isArray(aud) ||
    aud.length !== 1 ||
    typeof aud[0] !== 'string' ||
    typeof iss !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  ) {
    throw new EdgeAssertionVerificationError('MALFORMED');
  }

  return {
    sub,
    tenant,
    cell,
    cellEpoch,
    scope,
    aud: [aud[0]] as const,
    iss,
    iat,
    exp,
  };
}

/**
 * Map a thrown jose error to a stable {@link EdgeAssertionErrorCode}. Codes
 * and class↔code correspondence are pinned by jose's public error taxonomy
 * (verified against jose 6.2.3) — mirrors the sibling mapper in
 * `../session-mint/exchange-token-verifier.ts`.
 */
function mapJoseError(err: unknown): EdgeAssertionErrorCode {
  if (err instanceof errors.JOSEAlgNotAllowed) {
    return 'ALG_REJECTED';
  }
  if (err instanceof errors.JWSSignatureVerificationFailed) {
    return 'BAD_SIGNATURE';
  }
  // JWSInvalid / JWKSNoMatchingKey / JWKSMultipleMatchingKeys / a raw
  // TypeError from a malformed key — the token could not be parsed or
  // matched to a usable key. Rejected as MALFORMED (this class's own
  // UNKNOWN_KID throw from inside getKey is caught before this function
  // ever runs — see the `instanceof EdgeAssertionVerificationError` guard
  // in `verify()`).
  return 'MALFORMED';
}
