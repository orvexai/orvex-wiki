// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { createLocalJWKSet } from 'jose';
import type { JSONWebKeySet } from 'jose';

import {
  EdgeAssertionKey,
  EdgeAssertionKeySource,
} from './edge-assertion-key-source';

/**
 * The one-argument shape {@link createLocalJWKSet}'s result is actually called
 * with — same narrowing as {@link StaticEdgeAssertionKeySource}: jose's public
 * `CompactVerifyGetKey` requires a second (`token`) argument, but
 * `LocalJWKSet#getKey` only reads `header`, so omitting it is runtime-safe.
 */
type LocalGetKey = (header: {
  alg: string;
  kid?: string;
}) => Promise<EdgeAssertionKey>;

/**
 * Minimal fetch surface (Node 18+ global `fetch`), narrowed for injection —
 * mirrors {@link HttpIdentityIntrospector}'s `FetchLike`. ACCEPT-DON'T-CREATE
 * (CS §5): the JWKS endpoint is a true-external network boundary, so tests
 * inject a fake and never touch the network.
 */
export type JwksFetchLike = (
  input: string,
  init: { signal?: AbortSignal },
) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

export interface RemoteEdgeAssertionKeySourceDeps {
  /** identity's internal JWKS URL (`ORVEX_EDGE_JWKS_URL`, ENG-3060). */
  readonly jwksUrl: string;
  /** Request timeout (ms). Bounds a hung identity into an honest failure. */
  readonly timeoutMs: number;
  /** Injected fetch (ACCEPT-DON'T-CREATE); defaults to global `fetch`. */
  readonly fetch?: JwksFetchLike;
}

/**
 * A remote {@link EdgeAssertionKeySource} over identity's internal JWKS
 * endpoint — the PRODUCTION counterpart to the test-only
 * {@link StaticEdgeAssertionKeySource}.
 *
 * It deliberately preserves the `resolve` (pure cache lookup, never fetches) /
 * `refresh` (the one explicit re-fetch) split the port defines, so that
 * {@link EdgeAssertionVerifier} keeps owning and proving the ADR-0049 invariant
 * "an unknown kid triggers EXACTLY ONE refresh, then reject — never a loop,
 * never a silent fall-through to accept" (rather than delegating that policy to
 * jose's opaque `createRemoteJWKSet` internal retry/cooldown). The verifier's
 * flow against this source is: `resolve(kid)` → miss (cold cache) →
 * `refresh()` (ONE fetch) → `resolve(kid)` → hit-or-reject. The fetch is LAZY
 * (first verify), never at boot, so an identity JWKS blip never crash-loops the
 * engine on startup.
 *
 * FAIL-CLOSED: a transport/timeout/non-2xx/malformed-JWKS `refresh()` THROWS;
 * the verifier surfaces that as a rejection (deny-by-default), never a silent
 * accept and never a fabricated key.
 */
export class RemoteEdgeAssertionKeySource implements EdgeAssertionKeySource {
  private readonly jwksUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: JwksFetchLike;
  /** The current cached key set. `undefined` until the first successful refresh. */
  private getKey: LocalGetKey | undefined;

  constructor(deps: RemoteEdgeAssertionKeySourceDeps) {
    if (
      typeof deps.jwksUrl !== 'string' ||
      deps.jwksUrl.trim().length === 0 ||
      typeof deps.timeoutMs !== 'number' ||
      !Number.isFinite(deps.timeoutMs) ||
      deps.timeoutMs <= 0
    ) {
      throw new Error(
        'RemoteEdgeAssertionKeySource requires a non-empty jwksUrl and a positive timeoutMs',
      );
    }
    this.jwksUrl = deps.jwksUrl;
    this.timeoutMs = deps.timeoutMs;
    // Node 18+ global fetch; the port is injectable so tests never touch it.
    this.fetch =
      deps.fetch ?? ((input, init) => fetch(input, init) as ReturnType<JwksFetchLike>);
  }

  async resolve(kid: string): Promise<EdgeAssertionKey | undefined> {
    if (this.getKey === undefined) {
      // Cold cache — a genuine miss. Return undefined so the verifier performs
      // its one explicit refresh(); never fetch from inside resolve().
      return undefined;
    }
    try {
      return await this.getKey({ alg: 'ES256', kid });
    } catch {
      // createLocalJWKSet throws JWKSNoMatchingKey / JWKSMultipleMatchingKeys
      // on a miss/ambiguous match — both are "no key", never a thrown surprise.
      return undefined;
    }
  }

  async refresh(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number;
    let payload: unknown;
    try {
      const res = await this.fetch(this.jwksUrl, { signal: controller.signal });
      status = res.status;
      // A non-2xx is identity being unreachable/erroring, not a key verdict —
      // fail closed (throw), never cache an empty/partial set as if valid.
      if (status < 200 || status >= 300) {
        throw new Error(`edge JWKS fetch returned HTTP ${status}`);
      }
      payload = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const jwks = narrowJwks(payload);
    // Rebuild the cached local set atomically; only replace the live cache once
    // the new set has been constructed (a parse failure above leaves the old
    // cache untouched rather than blanking it).
    this.getKey = createLocalJWKSet(jwks) as unknown as LocalGetKey;
  }
}

/**
 * Narrow an identity JWKS response to jose's `JSONWebKeySet`. A response that is
 * not `{ keys: [...] }` is a malformed/unusable key set — throw (fail closed),
 * never coerce it into an empty accept.
 */
function narrowJwks(payload: unknown): JSONWebKeySet {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('edge JWKS response is not an object');
  }
  const keys = (payload as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('edge JWKS response has no keys');
  }
  return payload as JSONWebKeySet;
}
