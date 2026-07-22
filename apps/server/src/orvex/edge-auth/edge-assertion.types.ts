// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * Edge-assertion verification contract (ADR-0049 / ENG-3063, AD-8 exception).
 *
 * ADR-0049 terminates user auth once at the cluster edge and hands each
 * service a short-lived, signed internal identity assertion (ES256) to
 * verify cheaply against one internal JWKS. `pkg/auth` (Go, ENG-2408) and
 * `@orvex/auth-node` (TS, ENG-3062) are the ONE adopted implementation for
 * every closed-source consumer. This AGPL engine cannot import either
 * (AD-8) — it is the one sanctioned exception, performing a GENERIC JWT
 * verify against the same internal JWKS, enforcing the identical five
 * normative checks, and proving them against the SAME shared conformance
 * corpus (`orvex-studio-contracts` `identity/vectors/edge-assertion`,
 * pinned `v0.1.4`) rather than by a second hand-rolled business-logic
 * implementation.
 *
 * The nine claims below are exactly the pinned shape in
 * `identity/edge-assertion-claims.schema.json` (v0.1.4). `kid` and `alg`
 * live in the JWS protected header, never the payload — they are never
 * part of this claims contract (CS ❌#12: no `any` crosses this surface).
 */
export interface EdgeAssertionClaims {
  readonly sub: string;
  readonly tenant: string;
  readonly cell: string;
  readonly cellEpoch: number;
  readonly scope: string;
  /** Exactly one audience (AD-12: `len(aud)==1`); kept as the wire array shape. */
  readonly aud: readonly [string];
  readonly iss: string;
  readonly iat: number;
  readonly exp: number;
}

/**
 * Stable, machine-readable rejection codes — one per ADR-0049 normative
 * check, plus `MALFORMED` for a structurally-broken input (not one of the
 * five, but a verifier must reject *something* for a non-conforming token
 * rather than crash). A caller can switch exhaustively without ever parsing
 * a human message.
 *
 * Mapping to the ADR-0049 / contracts `x-verify-assertions` annex ids (the
 * `check` field the shared conformance corpus reports):
 *   - `ALG_REJECTED`      -> `alg-pin`
 *   - `UNKNOWN_KID`       -> `issuer-kid` (kid half)
 *   - `WRONG_ISSUER`      -> `issuer-kid` (iss half)
 *   - `BAD_SIGNATURE`     -> `signature-before-claims`
 *   - `AUDIENCE_REJECTED` -> `audience-value` (also covers the `len(aud)!=1`
 *     cardinality case — a single-audience assertion that names the wrong
 *     service and a multi/zero-audience assertion are both "no correct,
 *     single, matching audience", so both fold into one code here)
 *   - `EXPIRED`           -> `expiry` (the `exp` zero-leeway half)
 *   - `NOT_YET_VALID`     -> `expiry` (the `iat`/`nbf` skew half — a finer
 *     code than the annex needs, kept distinct from `EXPIRED` for
 *     operability; both are the SAME annex check id)
 *   - `MALFORMED`         -> not a semantic-reject id; a structural failure
 *     (unparsable JWS, non-object payload, wrong claim types/presence)
 */
export type EdgeAssertionErrorCode =
  | 'ALG_REJECTED'
  | 'UNKNOWN_KID'
  | 'WRONG_ISSUER'
  | 'BAD_SIGNATURE'
  | 'AUDIENCE_REJECTED'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'MALFORMED';

/**
 * DESIGN-IT-TWICE (CS §4), same shape as {@link ExchangeTokenVerificationError}
 * (`../session-mint/exchange-token.types`) and for the same reason: a thrown
 * typed error, not a `{ok,...}` result union, so `verify()` keeps returning
 * `Promise<EdgeAssertionClaims>` directly and the happy path never pays a tag
 * check. Every failure maps to a `401` at the delivery seam (ADR-0049: no
 * check may ever yield `421` — that is `pkg/cell`'s distinct, later,
 * authorization guard, never one of these five verify checks).
 *
 * The error NEVER carries claims, token bytes, or key material in `message`
 * or as an enumerable property — a caller cannot recover `cell`/`cell_epoch`
 * from a rejection, which is what makes "signature before claims" true at
 * the type level, not just by convention. The root cause is preserved on
 * `cause` for server-side diagnostics only.
 */
export class EdgeAssertionVerificationError extends Error {
  public readonly code: EdgeAssertionErrorCode;

  constructor(code: EdgeAssertionErrorCode, cause?: unknown) {
    super(`edge assertion rejected: ${code}`);
    this.name = 'EdgeAssertionVerificationError';
    this.code = code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}
