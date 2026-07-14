// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * Exchange-token verification contract (Foundation M7 / A-AUTH, PRD FR-W6).
 *
 * The engine's ONLY in-process auth addition is consuming an
 * orvex-studio-identity-minted EXCHANGE TOKEN: an RS256 JWT verified against the
 * identity issuer's JWKS. Identity owns mint/policy and fronts the dual-IdP
 * spine (Clerk + Keycloak); native login is removed (D-S3). This file declares
 * the typed claims the verifier returns and the typed failure it raises. No
 * `any` crosses this exported surface (CS ❌#12).
 */

/**
 * The verified claims the engine consumes from an exchange token.
 *
 * Scope discipline (CS ❌#6 — no speculative fields): every member here is a
 * claim the verification pipeline actually reads or a consumer of FR-W6 demonstrably
 * needs. We deliberately do NOT surface email / name / roles / jti / iat until a
 * concrete consumer requires them — adding them now would be speculative surface.
 *
 *  - `sub`         — the identity subject; the engine maps this to its user.
 *  - `workspaceId` — the workspace the token is scoped to (FR-W6 tenant scope);
 *                    a private (non-registered) claim minted by identity.
 *  - `iss`         — verified issuer; retained as auditable provenance.
 *  - `aud`         — verified audience (RFC 7519 allows string | string[]).
 *  - `exp`         — expiry (epoch seconds); a consumer may bound the engine
 *                    session lifetime so it never outlives the exchange token.
 */
export interface ExchangeTokenClaims {
  readonly sub: string;
  readonly workspaceId: string;
  readonly iss: string;
  readonly aud: string | string[];
  readonly exp: number;
}

/**
 * Stable, machine-readable rejection codes. Closed union — a caller can switch
 * exhaustively and log/act on the reason without ever parsing a human message
 * (messages are deliberately generic; see below).
 */
export type ExchangeTokenErrorCode =
  | 'EXPIRED' // exp in the past (jose JWTExpired)
  | 'BAD_SIGNATURE' // signature did not verify against the JWKS key
  | 'MALFORMED' // not a well-formed compact JWS, or a claim set that failed a non-iss/aud check (e.g. nbf-in-future, missing/!string sub|workspaceId)
  | 'WRONG_ISSUER' // iss did not match the configured issuer
  | 'WRONG_AUDIENCE' // aud did not contain the configured audience
  | 'ALG_REJECTED'; // header alg outside the RS256 allowlist (rejects none / HS256 key-confusion)

/**
 * DESIGN-IT-TWICE (CS §4). Two shapes were considered for reporting failure:
 *
 *   (A) a `VerifyResult = { ok: true; claims } | { ok: false; code }` discriminated
 *       union returned from verify(); or
 *   (B) THIS — a thrown typed error class carrying a stable `code`.
 *
 * CHOSEN: (B). The mandated verify() signature returns `Promise<ExchangeTokenClaims>`
 * directly (M7 build step 3), so success is the value itself with no wrapper. A
 * Result union would contradict that signature and force every caller — including
 * the hot happy path — through a tag check before touching the claims. A throwable
 * also slots straight into Nest's exception pipeline (a future exception filter maps
 * `code` → HTTP status) at the delivery seam. REJECTED: (A) — cleaner for exhaustive
 * handling in isolation, but it fights the return contract and taxes the common path.
 *
 * The error NEVER embeds token bytes, key material, or the underlying jose message
 * into `message`; only the stable `code` and a fixed generic string are exposed. The
 * original jose error is preserved on `cause` for server-side debugging only.
 */
export class ExchangeTokenVerificationError extends Error {
  public readonly code: ExchangeTokenErrorCode;

  constructor(code: ExchangeTokenErrorCode, cause?: unknown) {
    super(`exchange token rejected: ${code}`);
    this.name = 'ExchangeTokenVerificationError';
    this.code = code;
    // Preserve the root cause for server-side diagnostics without leaking it
    // into `message` (which may reach a client boundary).
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}
