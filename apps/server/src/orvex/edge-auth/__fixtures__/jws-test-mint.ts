// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { webcrypto } from 'node:crypto';

/**
 * TEST-ONLY compact-JWS minting helpers, built on Node's built-in Web
 * Crypto `SubtleCrypto` (`node:crypto` `webcrypto`) instead of a JWT/JOSE
 * package. AD-9's `jose_jwt` substrate-allow list names ONLY `pkg/auth`
 * (Go) and its TS peer `@orvexai/auth-node` as sanctioned JWT/JOSE-library
 * importers, with NO test-file exemption (unlike the neighbouring
 * `process-env` ban, this restriction carries no `test_exempt_ref` —
 * `orvex-studio-contracts` `gates/eslint/restrictions.yaml`) — a spec that
 * imports `jose`/`jsonwebtoken` to mint its own fixtures is banned exactly
 * as the production code is. This module exists so
 * `edge-assertion-verifier.spec.ts` and `wiki-edge-audience.spec.ts` can
 * mint local ES256 (and, for one negative-path fixture, HS512) test tokens
 * without either.
 *
 * Deliberately narrow: it mints only what those two suites use (an ES256
 * keypair + JWK export, an HS512 raw-secret path, and the handful of
 * `SignJWT`-style claim setters those suites called) — never a general JOSE
 * reimplementation. The production verify path lives in
 * `edge-assertion-verifier.ts`; this file NEVER verifies, only signs and
 * (for the unverified-oracle helper) decodes.
 */

/**
 * A same-shape stand-in for jose's exported EC public JWK — including the
 * three JWKS-membership fields (`kid`/`alg`/`use`) jose's own `JWK` type
 * carries but TS's ambient `JsonWebKey` (the WebCrypto DOM type) does not,
 * since every caller here adds them before building a
 * {@link StaticEdgeAssertionKeySource} JWKS.
 */
export interface Es256PublicJwk {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
}

/** Same shape jose's `JSONWebKeySet` needs — see this module's doc comment. */
export interface TestJwks {
  keys: Es256PublicJwk[];
}

/** Generates a fresh, extractable ES256 (P-256) signing keypair. */
export async function generateEs256KeyPair(): Promise<webcrypto.CryptoKeyPair> {
  return webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]) as Promise<webcrypto.CryptoKeyPair>;
}

/** Exports an ES256 public key's JWK — the same `{kty,crv,x,y}` shape jose's `exportJWK` produces. */
export async function exportEs256PublicJwk(publicKey: webcrypto.CryptoKey): Promise<Es256PublicJwk> {
  const jwk = (await webcrypto.subtle.exportKey('jwk', publicKey)) as JsonWebKey;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('exportEs256PublicJwk: unexpected JWK shape from SubtleCrypto');
  }
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes as ArrayBuffer).toString('base64url');
}

/**
 * A narrow, hand-rolled stand-in for jose's `SignJWT` fluent builder —
 * exactly the chain shape (`new SignJws(claims).setProtectedHeader(...)
 * .setSubject(...)....sign(key)`) the two test suites already called, so
 * porting them off `jose` is a like-for-like swap rather than a rewrite of
 * every test body. Supports only `alg: 'ES256'` (an ECDSA `CryptoKey`
 * private key) and `alg: 'HS512'` (a raw `Uint8Array` secret) — the only
 * two algorithms either suite signs with.
 */
export class SignJws {
  private readonly claims: Record<string, unknown>;
  private header: { alg: string; kid?: string } | undefined;

  constructor(claims: Record<string, unknown>) {
    this.claims = { ...claims };
  }

  setProtectedHeader(header: { alg: string; kid?: string }): this {
    this.header = header;
    return this;
  }

  setSubject(sub: string): this {
    this.claims.sub = sub;
    return this;
  }

  setAudience(aud: string[]): this {
    this.claims.aud = aud;
    return this;
  }

  setIssuer(iss: string): this {
    this.claims.iss = iss;
    return this;
  }

  setIssuedAt(iat: number): this {
    this.claims.iat = iat;
    return this;
  }

  setExpirationTime(exp: number): this {
    this.claims.exp = exp;
    return this;
  }

  setNotBefore(nbf: number): this {
    this.claims.nbf = nbf;
    return this;
  }

  /**
   * Signs and returns the compact JWS. `key` is an ES256 `CryptoKey`
   * private key for `alg: 'ES256'`, or a raw `Uint8Array` secret for
   * `alg: 'HS512'` — the caller's protected header decides which signing
   * path runs; there is no algorithm auto-detection from the key shape.
   */
  async sign(key: webcrypto.CryptoKey | Uint8Array): Promise<string> {
    if (!this.header) {
      throw new Error('SignJws.sign(): setProtectedHeader() was never called');
    }
    const headerB64 = base64Url(Buffer.from(JSON.stringify(this.header), 'utf8'));
    const payloadB64 = base64Url(Buffer.from(JSON.stringify(this.claims), 'utf8'));
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    let signature: ArrayBuffer;
    if (this.header.alg === 'ES256') {
      if (key instanceof Uint8Array) {
        throw new Error('SignJws.sign(): ES256 requires a CryptoKey, not a raw secret');
      }
      signature = await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        signingInput,
      );
    } else if (this.header.alg === 'HS512') {
      if (!(key instanceof Uint8Array)) {
        throw new Error('SignJws.sign(): HS512 requires a raw Uint8Array secret');
      }
      // Copied into a freshly-allocated ArrayBuffer-backed view: importKey's
      // BufferSource typing rejects an arbitrary ArrayBufferLike-backed one.
      const secretBytes = new Uint8Array(key.length);
      secretBytes.set(key);
      const hmacKey = await webcrypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign'],
      );
      signature = await webcrypto.subtle.sign('HMAC', hmacKey, signingInput);
    } else {
      throw new Error(`SignJws.sign(): unsupported test alg '${this.header.alg}'`);
    }

    return `${headerB64}.${payloadB64}.${base64Url(signature)}`;
  }
}

/**
 * TEST-ONLY unverified decode — reads a compact JWS's claims WITHOUT
 * checking the signature. Mirrors jose's `decodeJwt`, used exclusively as
 * an expectation ORACLE in the corpus-replay suite (never by
 * {@link ../edge-assertion-verifier.EdgeAssertionVerifier}, which has no
 * decode-without-verify path).
 */
export function decodeJwtUnsafe(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('decodeJwtUnsafe: not a 3-part compact JWS');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
