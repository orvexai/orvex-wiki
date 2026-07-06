import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SignJWT,
  UnsecuredJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';
import type {
  CryptoKey,
  JSONWebKeySet,
  JWTPayload,
  JWTVerifyGetKey,
} from 'jose';

import { ExchangeTokenVerifier } from './exchange-token-verifier';
import {
  ExchangeTokenErrorCode,
  ExchangeTokenVerificationError,
} from './exchange-token.types';

/**
 * M7 validation gates for {@link ExchangeTokenVerifier} (A-AUTH / PRD FR-W6).
 *
 * Tested ONLY through the exported service surface (CS §4): construct the
 * verifier, call verify(), assert. No own modules are mocked. The JWKS network
 * seam (CS §5) is injected as a local key set built from the COMMITTED
 * real-shaped Keycloak certs fixture (`__fixtures__/keycloak-jwks-response.json`,
 * provenance in the sibling `.shape.md`), with the per-run test keypair's crypto
 * values overlaid onto that real shape — jose's `createLocalJWKSet`, never a
 * hand-authored key.
 */
describe('ExchangeTokenVerifier', () => {
  const ISSUER = 'https://identity.eu-central-1.myidp.cloud/realms/orvex';
  const AUDIENCE = 'orvex-wiki-engine';
  const SUBJECT = 'user_2abcDEFghiJKLmnoPQR';
  const WORKSPACE_ID = 'ws_01HZY3K7Q9V2N4MEXAMPLE';

  // Populated in beforeAll.
  let signingKeyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let otherKeyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JWTVerifyGetKey;
  let verifier: ExchangeTokenVerifier;
  let SIG_KID: string;

  beforeAll(async () => {
    // 1. Load the committed real-shaped Keycloak certs response and pick the
    //    RS256 signing entry out of its (sig + enc) multi-key set — exercising
    //    the real endpoint shape.
    const raw = readFileSync(
      join(__dirname, '__fixtures__', 'keycloak-jwks-response.json'),
      'utf8',
    );
    const fixture = JSON.parse(raw) as JSONWebKeySet;
    const sigJwk = fixture.keys.find(
      (k) => k.use === 'sig' && k.alg === 'RS256',
    );
    if (!sigJwk || typeof sigJwk.kid !== 'string') {
      throw new Error('fixture missing an RS256 signing JWK with a kid');
    }
    SIG_KID = sigJwk.kid;

    // 2. Generate the per-run signing keypair (+ a second, unrelated keypair for
    //    the bad-signature gate).
    signingKeyPair = await generateKeyPair('RS256', { extractable: true });
    otherKeyPair = await generateKeyPair('RS256', { extractable: true });

    // 3. Build the local JWKS from the fixture's real shape with the test
    //    keypair's public values overlaid (kid/kty/alg/use from Keycloak, n/e
    //    from this run's key).
    const pub = await exportJWK(signingKeyPair.publicKey);
    const localJwks: JSONWebKeySet = {
      keys: [
        {
          kid: sigJwk.kid,
          kty: sigJwk.kty,
          alg: sigJwk.alg,
          use: sigJwk.use,
          n: pub.n,
          e: pub.e,
        },
      ],
    };
    jwks = createLocalJWKSet(localJwks);

    // 4. Construct the verifier with the injected port (accept-don't-create).
    verifier = new ExchangeTokenVerifier({ jwks, issuer: ISSUER, audience: AUDIENCE });
  });

  interface MintOptions {
    sub?: string;
    workspaceId?: string | null; // null → omit the claim entirely
    issuer?: string;
    audience?: string;
    kid?: string;
    expSecondsFromNow?: number | null; // null → omit exp entirely
    nbfSecondsFromNow?: number;
  }

  /** Mint a valid RS256 exchange token, then apply the given deviations. */
  async function mint(key: CryptoKey, opts: MintOptions = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {};
    if (opts.workspaceId !== null) {
      payload.workspaceId = opts.workspaceId ?? WORKSPACE_ID;
    }
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? SIG_KID })
      .setSubject(opts.sub ?? SUBJECT)
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUDIENCE);
    if (opts.expSecondsFromNow !== null) {
      jwt.setExpirationTime(now + (opts.expSecondsFromNow ?? 300));
    }
    if (opts.nbfSecondsFromNow !== undefined) {
      jwt.setNotBefore(now + opts.nbfSecondsFromNow);
    }
    return jwt.sign(key);
  }

  /** Assert verify(token) rejects, and return the typed error for inspection. */
  async function rejectionOf(token: string): Promise<ExchangeTokenVerificationError> {
    try {
      await verifier.verify(token);
    } catch (err: unknown) {
      if (err instanceof ExchangeTokenVerificationError) {
        return err;
      }
      throw err;
    }
    throw new Error('expected verify() to reject, but it resolved');
  }

  describe('accepts a valid token', () => {
    it('returns the typed claims for a correctly-signed, unexpired token', async () => {
      const token = await mint(signingKeyPair.privateKey);

      const claims = await verifier.verify(token);

      expect(claims).toEqual({
        sub: SUBJECT,
        workspaceId: WORKSPACE_ID,
        iss: ISSUER,
        aud: AUDIENCE,
        exp: expect.any(Number),
      });
    });
  });

  describe('rejects signed tokens that fail a check', () => {
    interface RejectionCase {
      name: string;
      make: () => Promise<string>;
      code: ExchangeTokenErrorCode;
    }

    const cases: RejectionCase[] = [
      {
        name: 'signed by a different RSA key',
        make: () => mint(otherKeyPair.privateKey, { kid: SIG_KID }),
        code: 'BAD_SIGNATURE',
      },
      {
        name: 'expired (exp in the past)',
        make: () => mint(signingKeyPair.privateKey, { expSecondsFromNow: -10 }),
        code: 'EXPIRED',
      },
      {
        name: 'wrong issuer',
        make: () =>
          mint(signingKeyPair.privateKey, {
            issuer: 'https://attacker.example/realms/evil',
          }),
        code: 'WRONG_ISSUER',
      },
      {
        name: 'wrong audience',
        make: () =>
          mint(signingKeyPair.privateKey, { audience: 'some-other-client' }),
        code: 'WRONG_AUDIENCE',
      },
      {
        name: 'not yet valid (nbf in the future) — nbf is enforced',
        make: () =>
          mint(signingKeyPair.privateKey, {
            nbfSecondsFromNow: 3600,
            expSecondsFromNow: 7200,
          }),
        code: 'MALFORMED',
      },
      {
        name: 'no exp claim — exp presence is enforced',
        make: () => mint(signingKeyPair.privateKey, { expSecondsFromNow: null }),
        code: 'MALFORMED',
      },
      {
        name: 'no workspaceId claim',
        make: () => mint(signingKeyPair.privateKey, { workspaceId: null }),
        code: 'MALFORMED',
      },
    ];

    it.each(cases)('rejects: $name → $code', async ({ make, code }) => {
      const token = await make();

      const err = await rejectionOf(token);

      expect(err.code).toBe(code);
      // Message must not leak the token bytes or key material.
      expect(err.message).toBe(`exchange token rejected: ${code}`);
      expect(err.message).not.toContain(token);
    });
  });

  describe('rejects non-JWT / structurally-broken input as MALFORMED', () => {
    it.each([
      ['garbage string', 'this-is-not-a-jwt'],
      ['truncated compact JWS', 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9'],
      ['empty string', ''],
    ])('rejects %s', async (_name, token) => {
      const err = await rejectionOf(token);
      expect(err.code).toBe('MALFORMED');
    });
  });

  describe('rejects the alg allowlist bypasses (RS256 only)', () => {
    it('rejects an alg:none (unsigned) token → ALG_REJECTED', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = new UnsecuredJWT({ workspaceId: WORKSPACE_ID })
        .setSubject(SUBJECT)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime(now + 300)
        .encode();

      const err = await rejectionOf(token);

      expect(err.code).toBe('ALG_REJECTED');
    });

    it('rejects an HS256 token (RSA-key-confusion) → ALG_REJECTED', async () => {
      // The classic key-confusion attack signs with HS256 hoping the verifier
      // treats the RSA public key as an HMAC secret. Any symmetric secret proves
      // the point: RS256-only allowlisting rejects HS256 before key resolution.
      const secret = new Uint8Array(32).fill(1);
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ workspaceId: WORKSPACE_ID })
        .setProtectedHeader({ alg: 'HS256', kid: SIG_KID })
        .setSubject(SUBJECT)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime(now + 300)
        .sign(secret);

      const err = await rejectionOf(token);

      expect(err.code).toBe('ALG_REJECTED');
    });
  });

  describe('has no decode-without-verify surface (M7 gate)', () => {
    it('exposes exactly one behaviour on the prototype: verify()', () => {
      const methods = Object.getOwnPropertyNames(
        ExchangeTokenVerifier.prototype,
      ).filter((name) => name !== 'constructor');

      expect(methods).toEqual(['verify']);
    });

    it('exposes no static claim-reading helpers on the class', () => {
      const statics = Object.getOwnPropertyNames(ExchangeTokenVerifier).filter(
        (name) => !['length', 'name', 'prototype'].includes(name),
      );

      expect(statics).toEqual([]);
    });

    it('has no unsafe decode / peek method on the instance', () => {
      const bag = verifier as unknown as Record<string, unknown>;
      for (const name of [
        'decode',
        'unsafeDecode',
        'decodeUnsafe',
        'peek',
        'parse',
        'readClaims',
        'unverified',
      ]) {
        expect(typeof bag[name]).toBe('undefined');
      }
    });
  });
});
