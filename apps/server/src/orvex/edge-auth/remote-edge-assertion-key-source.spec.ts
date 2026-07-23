// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { exportJWK, generateKeyPair } from 'jose';
import type { JSONWebKeySet } from 'jose';

import {
  JwksFetchLike,
  RemoteEdgeAssertionKeySource,
} from './remote-edge-assertion-key-source';

/**
 * RemoteEdgeAssertionKeySource — the PRODUCTION JWKS port for the ADR-0049
 * edge-assertion verify. Proven at the real network boundary with an INJECTED
 * fetch (CS §5: no real socket) returning a real-shaped JWKS built from a real
 * jose keypair (no hand-authored key). The behaviours under test are the ones
 * the verifier's one-refresh invariant depends on: resolve NEVER fetches;
 * refresh is the single explicit re-fetch; every failure fails CLOSED.
 */

const JWKS_URL = 'http://identity.internal/internal/jwks';
const KID = '20260723T150320Z-508b0507';

async function buildJwks(): Promise<{ jwks: JSONWebKeySet }> {
  const { publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...jwk, kid: KID, alg: 'ES256', use: 'sig' }],
  };
  return { jwks };
}

/** A fetch double that records calls and returns a scripted response. */
function fakeFetch(response: { status: number; body: unknown }): {
  fetch: JwksFetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  const fetch: JwksFetchLike = (input) => {
    calls.push(input);
    return Promise.resolve({
      status: response.status,
      json: () => Promise.resolve(response.body),
    });
  };
  return { fetch, calls };
}

describe('RemoteEdgeAssertionKeySource', () => {
  it('constructor FAILS FAST on an empty jwksUrl or a non-positive timeout', () => {
    expect(
      () =>
        new RemoteEdgeAssertionKeySource({ jwksUrl: '', timeoutMs: 5000 }),
    ).toThrow(/jwksUrl/);
    expect(
      () =>
        new RemoteEdgeAssertionKeySource({
          jwksUrl: JWKS_URL,
          timeoutMs: 0,
        }),
    ).toThrow(/timeoutMs/);
  });

  it('resolve() on a COLD cache returns undefined and NEVER fetches (the verifier then does the one refresh)', async () => {
    const { fetch, calls } = fakeFetch({ status: 200, body: { keys: [] } });
    const source = new RemoteEdgeAssertionKeySource({
      jwksUrl: JWKS_URL,
      timeoutMs: 5000,
      fetch,
    });

    await expect(source.resolve(KID)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0); // resolve is a pure lookup — no fetch
  });

  it('refresh() fetches the configured URL and resolve() then returns the kid key', async () => {
    const { jwks } = await buildJwks();
    const { fetch, calls } = fakeFetch({ status: 200, body: jwks });
    const source = new RemoteEdgeAssertionKeySource({
      jwksUrl: JWKS_URL,
      timeoutMs: 5000,
      fetch,
    });

    await source.refresh();
    expect(calls).toEqual([JWKS_URL]);

    const key = await source.resolve(KID);
    expect(key).toBeDefined();
    // A SECOND resolve is served from cache — still exactly one fetch total.
    await source.resolve(KID);
    expect(calls).toHaveLength(1);
  });

  it('resolve() for an UNKNOWN kid (after a refresh) returns undefined, not a throw', async () => {
    const { jwks } = await buildJwks();
    const { fetch } = fakeFetch({ status: 200, body: jwks });
    const source = new RemoteEdgeAssertionKeySource({
      jwksUrl: JWKS_URL,
      timeoutMs: 5000,
      fetch,
    });
    await source.refresh();
    await expect(source.resolve('some-other-kid')).resolves.toBeUndefined();
  });

  it('refresh() FAILS CLOSED (throws) on a non-2xx JWKS response', async () => {
    const { fetch } = fakeFetch({ status: 503, body: {} });
    const source = new RemoteEdgeAssertionKeySource({
      jwksUrl: JWKS_URL,
      timeoutMs: 5000,
      fetch,
    });
    await expect(source.refresh()).rejects.toThrow(/HTTP 503/);
  });

  it('refresh() FAILS CLOSED (throws) on a malformed JWKS (no keys array)', async () => {
    const { fetch } = fakeFetch({ status: 200, body: { not: 'a jwks' } });
    const source = new RemoteEdgeAssertionKeySource({
      jwksUrl: JWKS_URL,
      timeoutMs: 5000,
      fetch,
    });
    await expect(source.refresh()).rejects.toThrow(/no keys/);
  });

  it('a failed refresh() leaves any PRIOR good cache intact (atomic swap)', async () => {
    const { jwks } = await buildJwks();
    let response: { status: number; body: unknown } = { status: 200, body: jwks };
    const fetch: JwksFetchLike = () =>
      Promise.resolve({
        status: response.status,
        json: () => Promise.resolve(response.body),
      });
    const source = new RemoteEdgeAssertionKeySource({
      jwksUrl: JWKS_URL,
      timeoutMs: 5000,
      fetch,
    });

    await source.refresh(); // good cache established
    expect(await source.resolve(KID)).toBeDefined();

    response = { status: 500, body: {} };
    await expect(source.refresh()).rejects.toThrow(); // fails
    // The prior good key is still resolvable — a failed refresh never blanks it.
    expect(await source.resolve(KID)).toBeDefined();
  });
});
