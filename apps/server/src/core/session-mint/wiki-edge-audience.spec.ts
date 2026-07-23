// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JSONWebKeySet } from 'jose';

/** jose 6 dropped the `KeyLike` alias; infer the private-key type instead. */
type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

import { EdgeAssertionVerifier } from '../../orvex/edge-auth/edge-assertion-verifier';
import { StaticEdgeAssertionKeySource } from '../../orvex/edge-auth/edge-assertion-key-source';
import { EdgeAssertionVerificationError } from '../../orvex/edge-auth/edge-assertion.types';
import { WIKI_EDGE_AUDIENCE } from './wiki-edge-audience';

/**
 * The engine's WIKI_EDGE_AUDIENCE binding, proven end-to-end through the REAL
 * EdgeAssertionVerifier. The shared conformance corpus
 * (edge-assertion-verifier.spec.ts) is calibrated to `orvex-studio-api`, so it
 * proves the FIVE checks but NOT that THIS engine binds to `orvex-wiki`. This
 * spec closes that gap: an assertion minted `aud=orvex-wiki` is ACCEPTED, and
 * one minted for any OTHER fleet service is REJECTED (confused-deputy) — the
 * whole point of ADR-0049's aud VALUE bind. It signs with a real jose keypair
 * (no hand-authored key) and reads the audience from the shipped constant.
 */

const ISSUER = 'https://identity.edge.orvex.internal/edge-authn';
const KID = 'test-kid-eu1a';
const NOW = 1_800_000_000;

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...jwk, kid: KID, alg: 'ES256', use: 'sig' }],
  };
  const verifier = new EdgeAssertionVerifier({
    keys: new StaticEdgeAssertionKeySource(jwks),
    issuer: ISSUER,
    audience: WIKI_EDGE_AUDIENCE,
    skewToleranceSeconds: 30,
  });
  return { verifier, privateKey };
}

async function sign(
  privateKey: PrivateKey,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const claims = {
    sub: 'user-sub-1',
    tenant: 'ws-uuid-A',
    cell: 'eu1a',
    cell_epoch: 0,
    scope: '',
    aud: [WIKI_EDGE_AUDIENCE],
    iss: ISSUER,
    iat: NOW,
    exp: NOW + 120,
    ...overrides,
  };
  return new SignJWT(claims as Record<string, unknown>)
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .sign(privateKey);
}

describe('WIKI_EDGE_AUDIENCE binding (engine aud=orvex-wiki)', () => {
  it('is exactly the contracts ServiceWiki token', () => {
    expect(WIKI_EDGE_AUDIENCE).toBe('orvex-wiki');
  });

  it('ACCEPTS a validly-signed aud=orvex-wiki assertion and returns its claims', async () => {
    const { verifier, privateKey } = await setup();
    const token = await sign(privateKey);
    const claims = await verifier.verify(token, { now: NOW });
    expect(claims.sub).toBe('user-sub-1');
    expect(claims.tenant).toBe('ws-uuid-A');
    expect(claims.aud[0]).toBe('orvex-wiki');
  });

  it('REJECTS an assertion minted for another fleet service (confused-deputy)', async () => {
    const { verifier, privateKey } = await setup();
    const token = await sign(privateKey, { aud: ['orvex-studio-knowledge'] });
    const err = await verifier
      .verify(token, { now: NOW })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EdgeAssertionVerificationError);
    expect((err as EdgeAssertionVerificationError).code).toBe(
      'AUDIENCE_REJECTED',
    );
  });

  it('REJECTS an expired aud=orvex-wiki assertion (exp zero-leeway)', async () => {
    const { verifier, privateKey } = await setup();
    const token = await sign(privateKey, { iat: NOW - 300, exp: NOW - 1 });
    const err = await verifier
      .verify(token, { now: NOW })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EdgeAssertionVerificationError);
    expect((err as EdgeAssertionVerificationError).code).toBe('EXPIRED');
  });

  it('REJECTS a wrong-issuer assertion even with the right audience', async () => {
    const { verifier, privateKey } = await setup();
    const token = await sign(privateKey, { iss: 'https://evil.example/mint' });
    const err = await verifier
      .verify(token, { now: NOW })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EdgeAssertionVerificationError);
    expect((err as EdgeAssertionVerificationError).code).toBe('WRONG_ISSUER');
  });
});
