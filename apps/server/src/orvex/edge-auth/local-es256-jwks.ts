// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { webcrypto } from 'node:crypto';

/**
 * ES256/P-256 JWKS key resolution over Node's built-in Web Crypto — the
 * from-scratch replacement for `jose`'s `createLocalJWKSet` (ENG-3495).
 *
 * WHY THIS EXISTS AND NOT A LIBRARY. AD-9's `jose_jwt` substrate-allow list
 * names exactly two sanctioned JWT/JOSE-library importers fleet-wide:
 * `pkg/auth` (Go) and the closed `@orvexai/auth-node` (TS). `orvex-wiki` is
 * the AGPL-public engine, so it cannot depend on the closed TS peer — and the
 * ban carries no per-service exemption route and (unlike the `process-env` ban
 * beside it) no `test_exempt_ref` test carve-out. That leaves exactly one
 * in-policy option for this repo: implement the primitive by hand over
 * `node:crypto`'s `webcrypto`. `edge-assertion-verifier.ts` already did this
 * for the JWS verify half in `825ba3ed`; this module is the same move for the
 * key-resolution half, so the two edge-auth key sources stop being the last
 * `jose` importers in `apps/server/src`.
 *
 * The AD-9 ratchet is changed-files-only, so these files were invisible to it
 * while nobody's diff touched them — a blind spot, not a grant. This closes it
 * before the ratchet widens (ENG-3359) rather than after it reds.
 *
 * SCOPE — deliberately narrow. This resolves ES256 verification keys by `kid`
 * and nothing else: no JWT parsing, no claim handling, no signature verify
 * (that stays in `edge-assertion-verifier.ts`), no remote fetching (that stays
 * in `remote-edge-assertion-key-source.ts`). It is a JWKS→`CryptoKey` lookup
 * table, not a JOSE implementation.
 */

/**
 * One JWK as it appears in identity's `/v1/edge-authn` JWKS. Structurally
 * typed rather than validated here: every field this module actually depends
 * on is checked at selection/import time, and anything else is passed through
 * to `SubtleCrypto.importKey`, which is the real authority on whether the key
 * material is usable.
 */
export interface EdgeJwk {
  readonly kty?: string;
  readonly crv?: string;
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
  readonly x?: string;
  readonly y?: string;
}

/**
 * A JWKS document: `{ keys: [...] }`. `keys` is `unknown[]` on purpose — a
 * JWKS arrives as parsed JSON from identity, so nothing about an entry is
 * known until {@link selectKeys} has checked it. Typing the entries as
 * already-valid JWKs here would be a claim this module is not in a position
 * to make.
 */
export interface EdgeJwks {
  readonly keys: readonly unknown[];
}

/**
 * Resolve a `kid` in a fixed key set. Returns `undefined` for every "no usable
 * key" outcome — absent kid, ambiguous kid, wrong key type, unimportable key
 * material — and NEVER throws, so the caller's deny path is the single way a
 * lookup can fail. Mirrors the contract the previous `jose`-backed
 * implementation presented (its `JWKSNoMatchingKey` /
 * `JWKSMultipleMatchingKeys` throws were caught and folded into `undefined` at
 * both call sites).
 */
export type LocalEs256KeyResolver = (
  kid: string,
) => Promise<webcrypto.CryptoKey | undefined>;

/** Sentinel for a `kid` that appears more than once — see `selectKeys`. */
const AMBIGUOUS = Symbol('ambiguous-kid');

/**
 * Index a JWKS by `kid`, keeping only keys this verifier could actually use.
 *
 * A key is a candidate when it is an EC P-256 key (`kty: 'EC'`, `crv: 'P-256'`
 * — the only curve ES256 admits), it is not declared for encryption
 * (`use: 'enc'`), and it does not declare a conflicting `alg`. A `kid` present
 * on two or more candidates is recorded as {@link AMBIGUOUS} rather than
 * resolved to an arbitrary one: which key signed the assertion is genuinely
 * unknown at that point, and a guard that cannot determine its answer must
 * deny.
 */
function selectKeys(jwks: EdgeJwks): Map<string, EdgeJwk | typeof AMBIGUOUS> {
  const byKid = new Map<string, EdgeJwk | typeof AMBIGUOUS>();
  for (const entry of jwks.keys) {
    if (typeof entry !== 'object' || entry === null) continue;
    const jwk = entry as EdgeJwk;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') continue;
    if (jwk.use !== undefined && jwk.use !== 'sig') continue;
    if (jwk.alg !== undefined && jwk.alg !== 'ES256') continue;
    const kid = jwk.kid;
    if (typeof kid !== 'string' || kid.length === 0) continue;
    byKid.set(kid, byKid.has(kid) ? AMBIGUOUS : jwk);
  }
  return byKid;
}

/**
 * Build a {@link LocalEs256KeyResolver} over an in-memory JWKS.
 *
 * Selection is eager (cheap, synchronous, and surfaces an ambiguous `kid` the
 * moment the set is installed); `SubtleCrypto.importKey` is lazy and memoized
 * per `kid`, so a key set carrying entries this engine never sees costs
 * nothing, and a `kid` verified repeatedly is imported once. The memo caches
 * the promise, not the resolved key, so concurrent first-resolves of the same
 * `kid` share one import rather than racing.
 */
export function createLocalEs256Jwks(jwks: EdgeJwks): LocalEs256KeyResolver {
  const selected = selectKeys(jwks);
  const imported = new Map<string, Promise<webcrypto.CryptoKey | undefined>>();

  return async (kid: string): Promise<webcrypto.CryptoKey | undefined> => {
    const jwk = selected.get(kid);
    if (jwk === undefined || jwk === AMBIGUOUS) {
      return undefined;
    }
    let pending = imported.get(kid);
    if (pending === undefined) {
      pending = webcrypto.subtle
        .importKey(
          'jwk',
          // `importKey` is the authority on the key material itself: a JWK
          // missing `x`/`y`, carrying a bad point, or otherwise unusable
          // rejects here rather than producing a key that would later fail
          // mysteriously inside `verify`.
          jwk as webcrypto.JsonWebKey,
          { name: 'ECDSA', namedCurve: 'P-256' },
          // Not extractable, and usable ONLY for verification — this module
          // never has anything to do with signing.
          false,
          ['verify'],
        )
        .catch(() => undefined);
      imported.set(kid, pending);
    }
    return pending;
  };
}

/**
 * Narrow an arbitrary parsed JSON body to a {@link EdgeJwks}. Throws on
 * anything that is not `{ keys: [non-empty array] }` — a malformed key set is
 * an unusable one, never an empty accept.
 */
export function narrowEdgeJwks(payload: unknown): EdgeJwks {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('edge JWKS response is not an object');
  }
  const keys = (payload as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('edge JWKS response has no keys');
  }
  return { keys };
}
