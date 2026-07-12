// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * IdentityIntrospector (FR-W6 / A-AUTH) — resolve an orvex-studio-identity
 * exchange token to its verified principal.
 *
 * WHY INTROSPECTION, NOT LOCAL RS256/JWKS: identity's `POST /v1/exchange` mints
 * a SHORT-LIVED OPAQUE token (a 128-bit random token id backed by identity's
 * grant store — see orvex-studio-identity `internal/token/token.go`), NOT a
 * self-describing RS256 JWT. The only way to turn that opaque bearer into a
 * verified `{subject, tenant}` principal is identity's introspection endpoint
 * (`POST /v1/introspect`), the SAME seam every sister satellite consumes it
 * through (orvex-studio-knowledge `internal/clients.Identity.verifyOpaque`).
 * So the engine session-mint resolves the exchange token here rather than via
 * the local `ExchangeTokenVerifier` (that RS256/JWKS primitive verifies the
 * DIFFERENT session-JWT shape and is not on this endpoint's live path).
 *
 * ACCEPT-DON'T-CREATE (CS §3.4 / §5): the introspection endpoint is a NETWORK
 * SEAM, so this is a PORT — the concrete HTTP adapter is injected once at module
 * composition; the mint service never builds a client itself. Tests inject a
 * fake principal source without any network.
 *
 * DENY-BY-DEFAULT: `introspect` returns `null` for any token the endpoint does
 * not report ACTIVE with a well-formed principal (inactive, revoked, expired,
 * unknown, or a malformed response) — the caller maps that to a 401 rejection
 * and never mints a session. A configuration gap or a transport/dependency
 * failure is a DISTINCT, honest failure (a thrown error → 5xx), never a silent
 * accept and never a fabricated principal.
 */

/** The verified principal the engine consumes from an introspected token. */
export interface IntrospectedPrincipal {
  /** The identity subject (opaque IdP `sub`); mapped to an engine user. */
  readonly subject: string;
  /**
   * The workspace the token is scoped to. This is identity's `tenant` claim,
   * which the ENG-1559 alignment convention pins to BE the engine workspace
   * UUID itself (no second lookup) — so it is the engine `workspaceId` directly.
   */
  readonly workspaceId: string;
}

/** Injection token for the introspection port. */
export const IDENTITY_INTROSPECTOR = Symbol('IDENTITY_INTROSPECTOR');

/** The introspection port the session-mint service depends on. */
export interface IdentityIntrospector {
  /**
   * Resolve an exchange token to its principal, or `null` when the token is not
   * ACTIVE / not well-formed (deny-by-default → 401). Throws only on a genuine
   * inability to verify (unconfigured seam, transport/dependency failure) — a
   * distinct, honest 5xx, never a silent accept.
   */
  introspect(exchangeToken: string): Promise<IntrospectedPrincipal | null>;
}

/**
 * Typed configuration failure: the introspection seam is not configured
 * (`ORVEX_IDENTITY_URL` unset). Distinct from a token rejection — it FAILS
 * CLOSED on use (deny-by-default) rather than silently bypassing verification.
 */
export class OrvexIntrospectionNotConfiguredError extends Error {
  public readonly code = 'NOT_CONFIGURED';

  constructor() {
    super(
      'orvex session-mint introspection is not configured (ORVEX_IDENTITY_URL unset)',
    );
    this.name = 'OrvexIntrospectionNotConfiguredError';
  }
}

/**
 * The fail-closed introspector composed when `ORVEX_IDENTITY_URL` is unset. Any
 * attempt to mint a session throws the typed NOT_CONFIGURED error — the engine
 * never fabricates a principal it cannot verify (parity with the analogous
 * fail-closed branch in `composeSessionMint`).
 */
export class NotConfiguredIntrospector implements IdentityIntrospector {
  // Signature mirrors the port exactly (the token is ignored — the seam is
  // unconfigured, so there is nothing to verify it against).
  introspect(_exchangeToken: string): Promise<IntrospectedPrincipal | null> {
    return Promise.reject(new OrvexIntrospectionNotConfiguredError());
  }
}

/** Minimal fetch surface (Node 18+ global `fetch`), narrowed for injection. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

export interface HttpIdentityIntrospectorDeps {
  /** Identity base URL (`ORVEX_IDENTITY_URL`). The `/v1/introspect` host. */
  readonly baseUrl: string;
  /**
   * Optional bearer sent on the introspect call (`ORVEX_IDENTITY_INTROSPECTION_TOKEN`).
   * Identity's introspect endpoint authenticates by the token IN THE BODY, so
   * this header is optional — sent only when configured (parity with knowledge's
   * `IntrospectionAuth`). NEVER logged.
   */
  readonly introspectionAuth: string | null;
  /** Request timeout (ms). Bounds a hung dependency into an honest failure. */
  readonly timeoutMs: number;
  /** Injected fetch (ACCEPT-DON'T-CREATE); defaults to global `fetch`. */
  readonly fetch: FetchLike;
}

/**
 * Real HTTP adapter over identity's `POST /v1/introspect`. Mirrors the proven
 * cross-satellite wire contract (orvex-studio-knowledge `introspectRequest`/
 * `introspectResponse`, itself identity's `gen.IntrospectRequest`/
 * `IntrospectResponse`): request `{token}`, response `{active, principal:{subject,
 * tenant, ...}}`. `active:false` (or a missing/blank subject|tenant) → `null`
 * (deny). A non-2xx / transport / parse failure → a thrown error (honest 5xx).
 */
export class HttpIdentityIntrospector implements IdentityIntrospector {
  private readonly baseUrl: string;
  private readonly introspectionAuth: string | null;
  private readonly timeoutMs: number;
  private readonly fetch: FetchLike;

  constructor(deps: HttpIdentityIntrospectorDeps) {
    // Trim a trailing slash so `${base}/v1/introspect` never doubles up.
    this.baseUrl = deps.baseUrl.replace(/\/+$/, '');
    this.introspectionAuth = deps.introspectionAuth;
    this.timeoutMs = deps.timeoutMs;
    this.fetch = deps.fetch;
  }

  async introspect(
    exchangeToken: string,
  ): Promise<IntrospectedPrincipal | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.introspectionAuth) {
      headers.Authorization = `Bearer ${this.introspectionAuth}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number;
    let payload: unknown;
    try {
      const res = await this.fetch(`${this.baseUrl}/v1/introspect`, {
        method: 'POST',
        headers,
        // The exchange token is the resolved credential — NEVER logged.
        body: JSON.stringify({ token: exchangeToken }),
        signal: controller.signal,
      });
      status = res.status;
      // A non-2xx is our own request defect or an identity outage, not a token
      // verdict — surface it as a thrown (honest 5xx), never a silent deny/accept.
      if (status < 200 || status >= 300) {
        throw new Error(`identity introspect returned HTTP ${status}`);
      }
      payload = await res.json();
    } finally {
      clearTimeout(timer);
    }

    return narrowPrincipal(payload);
  }
}

/**
 * Narrow the introspection response to our principal, deny-by-default. The
 * endpoint reports `active:false` uniformly for expired/revoked/unknown tokens
 * (no existence oracle); we ALSO deny an `active:true` with a missing/blank
 * subject or tenant (a malformed response is never coerced into an accept).
 */
function narrowPrincipal(payload: unknown): IntrospectedPrincipal | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const body = payload as { active?: unknown; principal?: unknown };
  if (body.active !== true) {
    return null;
  }
  if (typeof body.principal !== 'object' || body.principal === null) {
    return null;
  }
  const p = body.principal as { subject?: unknown; tenant?: unknown };
  const subject = typeof p.subject === 'string' ? p.subject.trim() : '';
  const tenant = typeof p.tenant === 'string' ? p.tenant.trim() : '';
  if (subject === '' || tenant === '') {
    return null;
  }
  return { subject, workspaceId: tenant };
}
