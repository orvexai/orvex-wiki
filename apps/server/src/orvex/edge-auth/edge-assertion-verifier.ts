// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { webcrypto } from 'node:crypto';

import type { EdgeAssertionKeySource } from './edge-assertion-key-source';
import { EdgeAssertionClaims, EdgeAssertionVerificationError } from './edge-assertion.types';

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
 * is importable here (AGPL/closed-license boundary). AD-9's `jose_jwt`
 * substrate-allow list names exactly those two as the fleet's ONLY sanctioned
 * JWT/JOSE-library importers (`config/services.yaml` `lint.substrate_allow.
 * jose_jwt: [pkg/auth]`, TS peer `@orvexai/auth-node`) — with NO per-service
 * exemption route for a third implementation, not even a test-file one (the
 * ban's own declaration explicitly does not carry a `test_exempt_ref`,
 * unlike the `process-env` ban next to it). So this class is the ONE
 * sanctioned TRULY-from-scratch implementation: it verifies the JWS by hand
 * against Node's built-in Web Crypto `SubtleCrypto` (`node:crypto`
 * `webcrypto`, never a JWT/JOSE package), and its correctness is proven not
 * by trusting this file but by replaying the SAME shared conformance corpus
 * those two library-backed verifiers replay (`orvex-studio-contracts`
 * `identity/vectors/edge-assertion`, pinned `v0.1.4`) — see
 * `edge-assertion-verifier.spec.ts`.
 *
 * The five ADR-0049 checks run in the order the ADR requires — signature
 * BEFORE any claim is read, full stop:
 *
 *   1. header parse — split the compact JWS on `.`, base64url-decode all
 *      three segments, `JSON.parse` the header. A structural failure here
 *      (wrong segment count, bad base64url, non-object JSON) is MALFORMED.
 *   2. alg-pin — the header's `alg` must be EXACTLY `'ES256'`, checked
 *      BEFORE the key resolver is ever called, so `alg: none` / `HS256` /
 *      `RS256` never reach step 3.
 *   3. kid resolve — via the injected {@link EdgeAssertionKeySource}, with
 *      this class's own exactly-one-refresh-then-reject orchestration
 *      (a hand-rolled retry policy this class owns end-to-end, not a
 *      library's opaque internal one).
 *   4. signature verify — ECDSA/SHA-256 over the raw JWS signing-input bytes
 *      (`base64url(header) + '.' + base64url(payload)`) via
 *      `SubtleCrypto.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, ...)`.
 *      WebCrypto's ECDSA signature encoding is the raw IEEE-P1363 `r || s`
 *      concatenation — the SAME byte layout RFC 7515 §3.4 mandates for JWS
 *      ES256 — so no DER conversion is needed. Nothing below this line has
 *      been reached yet if this fails.
 *   5. (only now) payload is decoded and the remaining three claim checks
 *      run in this order: audience-value, expiry (zero-leeway `exp` +
 *      skewed `iat`/`nbf`), issuer.
 *
 * The asymmetric expiry rule (zero leeway on `exp`, up to
 * `skewToleranceSeconds` on `iat`/`nbf`) is why claims are validated by
 * hand below rather than through any all-in-one JWT-layer verifier: no
 * single `clockTolerance` knob can express two different tolerances for two
 * different claims.
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

    // Step 1: header parse. Split the compact JWS on '.', base64url-decode
    // and JSON.parse ONLY the header segment — the payload/signature
    // segments are deliberately NOT touched yet (see the ordering note
    // below step 3). Any structural failure here — wrong segment count,
    // bad base64url, non-object JSON — is MALFORMED, never a crash.
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new EdgeAssertionVerificationError('MALFORMED');
    }
    const [headerB64, payloadB64, signatureB64] = parts;

    let header: unknown;
    try {
      header = JSON.parse(Buffer.from(decodeBase64Url(headerB64)).toString('utf8'));
    } catch {
      throw new EdgeAssertionVerificationError('MALFORMED');
    }
    if (typeof header !== 'object' || header === null || Array.isArray(header)) {
      throw new EdgeAssertionVerificationError('MALFORMED');
    }
    const headerObj = header as Record<string, unknown>;

    // Step 2: alg-pin. Checked BEFORE the key resolver is ever called, so
    // `alg: none` / `HS256` / `RS256` never reach step 3 (verified below by
    // the ENG-3063 hardening suite's `counting.refreshCalls === 0`
    // assertion for a non-ES256 header) — and, just as importantly, before
    // the payload/signature segments are decoded at all: an `alg: none`
    // assertion legitimately carries an EMPTY signature segment (the
    // conformance corpus's `alg-none` vector does exactly this), which must
    // still resolve to ALG_REJECTED rather than a decode-triggered
    // MALFORMED racing ahead of it.
    if (headerObj.alg !== 'ES256') {
      throw new EdgeAssertionVerificationError('ALG_REJECTED');
    }

    // Step 3: kid resolve, with this class's own exactly-one-refresh-then-
    // reject orchestration (ADR-0049 check 4) — never a loop, never a
    // silent fall-through to accept. Still before the payload/signature
    // segments are decoded, for the same reason as step 2.
    const kid = headerObj.kid;
    if (typeof kid !== 'string' || kid.length === 0) {
      throw new EdgeAssertionVerificationError('UNKNOWN_KID');
    }
    let key = await this.keys.resolve(kid);
    if (key === undefined) {
      await this.keys.refresh();
      key = await this.keys.resolve(kid);
    }
    if (key === undefined) {
      throw new EdgeAssertionVerificationError('UNKNOWN_KID');
    }

    // Step 4: signature verify — ECDSA/SHA-256 over the raw JWS signing
    // input, via Node's built-in Web Crypto SubtleCrypto (never a JWT/JOSE
    // package — AD-9). WebCrypto's ECDSA signature encoding is the raw
    // IEEE-P1363 `r || s` concatenation, the SAME layout RFC 7515 §3.4
    // mandates for JWS ES256, so no DER conversion is needed. Nothing below
    // this line has been reached yet if this fails. The payload/signature
    // segments are decoded ONLY now — a malformed one here (alg was
    // confirmed ES256 and kid resolved) is MALFORMED, never a crash.
    let payloadBytes: Uint8Array<ArrayBuffer>;
    let signatureBytes: Uint8Array<ArrayBuffer>;
    try {
      payloadBytes = decodeBase64Url(payloadB64);
      signatureBytes = decodeBase64Url(signatureB64);
    } catch {
      throw new EdgeAssertionVerificationError('MALFORMED');
    }
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    let verified: boolean;
    try {
      verified = await webcrypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key as unknown as webcrypto.CryptoKey,
        signatureBytes,
        signingInput,
      );
    } catch (err: unknown) {
      // A key of the wrong type/curve or a malformed signature length
      // throws from SubtleCrypto rather than returning false — treated
      // identically to an unverified signature (never a crash, never an
      // accept).
      throw new EdgeAssertionVerificationError('BAD_SIGNATURE', err);
    }
    if (!verified) {
      throw new EdgeAssertionVerificationError('BAD_SIGNATURE');
    }

    // Signature has verified. Only now is the payload decoded — nothing
    // above this line has looked at a single claim.
    const payload = parsePayload(payloadBytes);
    const claims = narrowClaims(payload);

    // Check: audience-value. The cardinality half (len(aud)==1) was already
    // enforced inside narrowClaims — with the SAME code, AUDIENCE_REJECTED —
    // so by this line `claims.aud` is provably a single-element tuple and
    // only the VALUE comparison remains. A multi/zero-audience assertion and
    // a single-wrong-audience assertion are both "no single, matching
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
    typeof iss !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  ) {
    throw new EdgeAssertionVerificationError('MALFORMED');
  }

  // Audience CARDINALITY — the len(aud)==1 half of ADR-0049 check 1
  // ("audience value", of which cardinality alone is never sufficient). A
  // zero- or multi-audience assertion is an AUDIENCE failure, not a merely
  // malformed token: it gets the SAME AUDIENCE_REJECTED code as a
  // wrong-value single audience (see the code mapping in
  // edge-assertion.types.ts), so the two halves of check 1 fail as ONE
  // separately-named check. The verify() body then only compares the VALUE.
  if (aud.length !== 1 || typeof aud[0] !== 'string') {
    throw new EdgeAssertionVerificationError('AUDIENCE_REJECTED');
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
 * RFC 4648 §5 base64url decode, no padding — the exact alphabet JWS compact
 * serialisation uses for all three segments (RFC 7515 §3). Node's
 * `Buffer.from(str, 'base64url')` silently drops characters outside the
 * base64url alphabet rather than rejecting them, so the alphabet is
 * validated by hand first: a malformed segment must throw here (mapped to
 * MALFORMED by every caller), never silently decode a truncated/wrong value.
 */
function decodeBase64Url(segment: string): Uint8Array<ArrayBuffer> {
  if (segment.length === 0 || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error('invalid base64url segment');
  }
  const decoded = Buffer.from(segment, 'base64url');
  // Copied into a freshly-allocated (never shared) ArrayBuffer-backed
  // Uint8Array: SubtleCrypto's BufferSource typing rejects the
  // ArrayBufferLike-backed view Buffer.from returns directly.
  const out = new Uint8Array(decoded.length);
  out.set(decoded);
  return out;
}
