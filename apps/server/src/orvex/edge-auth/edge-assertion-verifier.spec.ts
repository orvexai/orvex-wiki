// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from 'jose';
import type { JSONWebKeySet } from 'jose';

import {
  EdgeAssertionKeySource,
  StaticEdgeAssertionKeySource,
} from './edge-assertion-key-source';
import { EdgeAssertionVerifier } from './edge-assertion-verifier';
import { EdgeAssertionErrorCode, EdgeAssertionVerificationError } from './edge-assertion.types';

/**
 * ENG-3063 (ADR-0049, AD-8 exception) — the AGPL engine's generic ES256
 * edge-assertion verify, proved against the SAME shared conformance corpus
 * the Go `pkg/auth` (ENG-2408) and TS `@orvex/auth-node` (ENG-3062)
 * verifiers replay: `orvex-studio-contracts`
 * `identity/vectors/edge-assertion/signed/*`, pinned tag **v0.1.4**
 * (provenance: `__fixtures__/edge-assertion-corpus.shape.md`).
 *
 * Tested ONLY through the exported service surface (CS §4): construct the
 * verifier, call verify(), assert. The JWKS network seam (CS §5) is
 * injected as {@link StaticEdgeAssertionKeySource} over the COMMITTED
 * corpus JWKS — unlike the sibling `ExchangeTokenVerifier` fixture, this
 * corpus's tokens are signed by the SAME key published in the fixture, so
 * both halves are used exactly as vendored (no per-run keypair overlay).
 */
interface CorpusTokenVector {
  readonly name: string;
  readonly expect: 'accept' | 'semantic-reject';
  readonly reason: string;
  readonly verifier_service: string;
  readonly token: string;
  readonly check?: string;
  readonly expected_verdict?: number;
  readonly signature_valid?: boolean;
  readonly must_not_read?: readonly string[];
}

interface CorpusTokenFile {
  readonly _provenance: {
    readonly issuer: string;
    readonly kid: string;
    readonly max_clock_skew_seconds: number;
  };
  readonly now_unix: number;
  readonly tokens: readonly CorpusTokenVector[];
}

const FIXTURES_DIR = join(__dirname, '__fixtures__');

const jwks = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'edge-assertion-jwks.json'), 'utf8'),
) as JSONWebKeySet;

const corpus = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'edge-assertion-tokens.json'), 'utf8'),
) as CorpusTokenFile;

// The corpus is shared across every verifier (Go/TS/this engine) and is
// calibrated to one stand-in `verifier_service`, not to orvex-wiki's own
// AD-31 audience value — every vector in this pinned corpus names the same
// one, asserted here so a future corpus edit that stops doing so is loud.
const CORPUS_AUDIENCE = 'orvex-studio-api';

describe('EdgeAssertionVerifier — ADR-0049 golden corpus replay (contracts v0.1.4)', () => {
  it('sanity: the vendored corpus is internally consistent', () => {
    expect(corpus.tokens.length).toBeGreaterThan(0);
    for (const vector of corpus.tokens) {
      expect(vector.verifier_service).toBe(CORPUS_AUDIENCE);
    }
  });

  function buildVerifier(): EdgeAssertionVerifier {
    return new EdgeAssertionVerifier({
      keys: new StaticEdgeAssertionKeySource(jwks),
      issuer: corpus._provenance.issuer,
      audience: CORPUS_AUDIENCE,
      skewToleranceSeconds: corpus._provenance.max_clock_skew_seconds,
    });
  }

  async function rejectionOf(
    verifier: EdgeAssertionVerifier,
    token: string,
  ): Promise<EdgeAssertionVerificationError> {
    try {
      await verifier.verify(token, { now: corpus.now_unix });
    } catch (err: unknown) {
      if (err instanceof EdgeAssertionVerificationError) {
        return err;
      }
      throw err;
    }
    throw new Error('expected verify() to reject, but it resolved');
  }

  describe('accepts', () => {
    const accepted = corpus.tokens.filter((v) => v.expect === 'accept');

    it('the corpus has at least the two accept vectors this suite expects', () => {
      expect(accepted.map((v) => v.name).sort()).toEqual(
        ['es256-exp-just-future', 'es256-happy'].sort(),
      );
    });

    it.each(accepted.map((v) => [v.name, v] as const))(
      '%s: returns claims matching the token\'s own (unverified oracle) payload',
      async (_name, vector) => {
        const verifier = buildVerifier();
        // decodeJwt is a TEST-ONLY oracle to derive the expectation from the
        // fixture itself (never hand-typed magic numbers) — never used by
        // EdgeAssertionVerifier itself, which has no decode-without-verify path.
        const oracle = decodeJwt(vector.token) as Record<string, unknown>;

        const claims = await verifier.verify(vector.token, { now: corpus.now_unix });

        expect(claims).toEqual({
          sub: oracle.sub,
          tenant: oracle.tenant,
          cell: oracle.cell,
          cellEpoch: oracle.cell_epoch,
          scope: oracle.scope,
          aud: oracle.aud,
          iss: oracle.iss,
          iat: oracle.iat,
          exp: oracle.exp,
        });
      },
    );
  });

  describe('rejects semantic-reject vectors with the correct check attribution', () => {
    // Named explicitly (not derived from `check` generically): the corpus's
    // `check` id groups several of this verifier's codes (e.g. `issuer-kid`
    // covers both UNKNOWN_KID and WRONG_ISSUER; `expiry` covers both EXPIRED
    // and NOT_YET_VALID) — see edge-assertion.types.ts. Naming each vector
    // pins exactly which code THIS corpus's specific defect must produce.
    const EXPECTED_CODE: Record<string, EdgeAssertionErrorCode> = {
      'es256-aud-mismatch': 'AUDIENCE_REJECTED',
      'es256-expired': 'EXPIRED',
      'alg-none': 'ALG_REJECTED',
      'alg-confusion-hs256': 'ALG_REJECTED',
      'alg-rs256': 'ALG_REJECTED',
      'unknown-kid': 'UNKNOWN_KID',
      'bad-signature': 'BAD_SIGNATURE',
    };

    const rejected = corpus.tokens.filter((v) => v.expect === 'semantic-reject');

    it('every semantic-reject vector in the corpus has a pinned expectation here (exhaustive, both directions)', () => {
      expect(rejected.map((v) => v.name).sort()).toEqual(Object.keys(EXPECTED_CODE).sort());
    });

    it.each(rejected.map((v) => [v.name, v] as const))(
      '%s (%s): rejects with the expected code',
      async (name, vector) => {
        const verifier = buildVerifier();

        const err = await rejectionOf(verifier, vector.token);

        expect(err.code).toBe(EXPECTED_CODE[name]);
        // expected_verdict is always 401 in this corpus — never 421 (the
        // cell-guard's distinct downstream authorization gate). This class
        // has no 421 concept at all; asserting the code is one of the
        // closed EdgeAssertionErrorCode union values IS the proof.
        expect(vector.expected_verdict).toBe(401);
      },
    );

    it("bad-signature: claims are never surfaced (signature-before-claims, AD-13)", async () => {
      const vector = rejected.find((v) => v.name === 'bad-signature');
      if (!vector) {
        throw new Error('fixture no longer carries a bad-signature vector');
      }
      // This vector's (unverified) payload carries a foreign cell + stale
      // cell_epoch that WOULD trip pkg/cell's 421 guard if ever read before
      // the signature check. Confirm the fixture still encodes that trap.
      const oracle = decodeJwt(vector.token) as Record<string, unknown>;
      expect(vector.must_not_read).toEqual(
        expect.arrayContaining(['cell', 'cell_epoch']),
      );
      expect(oracle.cell).not.toBe('eu1');

      const verifier = buildVerifier();
      const err = await rejectionOf(verifier, vector.token);

      expect(err.code).toBe('BAD_SIGNATURE');
      // The error exposes no `cell`/`cell_epoch`/`claims` — no route to
      // recover the (unverified) payload's attributes from the rejection.
      const bag = err as unknown as Record<string, unknown>;
      expect(bag.cell).toBeUndefined();
      expect(bag.cell_epoch).toBeUndefined();
      expect(bag.claims).toBeUndefined();
      expect(err.message).not.toContain('foreign-cell');
    });
  });

  describe('kid-refresh fires exactly once on an unknown kid, and not otherwise', () => {
    it('unknown-kid: refresh() is called exactly once before rejecting', async () => {
      const keys = new StaticEdgeAssertionKeySource(jwks);
      const refreshSpy = jest.spyOn(keys, 'refresh');
      const verifier = new EdgeAssertionVerifier({
        keys,
        issuer: corpus._provenance.issuer,
        audience: CORPUS_AUDIENCE,
        skewToleranceSeconds: corpus._provenance.max_clock_skew_seconds,
      });
      const vector = corpus.tokens.find((v) => v.name === 'unknown-kid');
      if (!vector) {
        throw new Error('fixture no longer carries an unknown-kid vector');
      }

      const err = await rejectionOf(verifier, vector.token);

      expect(err.code).toBe('UNKNOWN_KID');
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('es256-happy: refresh() is never called when the kid is already known', async () => {
      const keys = new StaticEdgeAssertionKeySource(jwks);
      const refreshSpy = jest.spyOn(keys, 'refresh');
      const verifier = new EdgeAssertionVerifier({
        keys,
        issuer: corpus._provenance.issuer,
        audience: CORPUS_AUDIENCE,
        skewToleranceSeconds: corpus._provenance.max_clock_skew_seconds,
      });
      const vector = corpus.tokens.find((v) => v.name === 'es256-happy');
      if (!vector) {
        throw new Error('fixture no longer carries an es256-happy vector');
      }

      await verifier.verify(vector.token, { now: corpus.now_unix });

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('never falls through to accept after the one refresh still misses', async () => {
      // A key source whose refresh() can never produce the kid (mirrors a
      // real identity JWKS that genuinely does not have it) — this is the
      // "never falls through to accept" half of ADR-0049 check 4, verified
      // independently of the corpus fixture.
      class NeverResolves implements EdgeAssertionKeySource {
        refreshCalls = 0;
        async resolve(): Promise<undefined> {
          return undefined;
        }
        async refresh(): Promise<void> {
          this.refreshCalls += 1;
        }
      }
      const keys = new NeverResolves();
      const verifier = new EdgeAssertionVerifier({
        keys,
        issuer: corpus._provenance.issuer,
        audience: CORPUS_AUDIENCE,
        skewToleranceSeconds: corpus._provenance.max_clock_skew_seconds,
      });
      const happy = corpus.tokens.find((v) => v.name === 'es256-happy');
      if (!happy) {
        throw new Error('fixture no longer carries an es256-happy vector');
      }

      const err = await rejectionOf(verifier, happy.token);

      expect(err.code).toBe('UNKNOWN_KID');
      expect(keys.refreshCalls).toBe(1);
    });
  });
});

/**
 * Supplementary boundary tests for the `iat`/`nbf` clock-skew half of the
 * expiry check (ADR-0049 check 3). The pinned v0.1.4 corpus does not carry
 * `nbf` vectors and only exercises the `exp` boundary, so these are minted
 * locally against a fresh ES256 keypair rather than skipped as "not in the
 * corpus".
 */
describe('EdgeAssertionVerifier — iat/nbf skew boundaries (ADR-0049 check 3)', () => {
  const ISSUER = 'https://identity.edge.orvex.internal/edge-authn';
  const AUDIENCE = 'orvex-studio-api';
  const SKEW = 30;
  const KID = 'boundary-test-kid-1';
  const NOW = 1_800_000_000;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let keys: StaticEdgeAssertionKeySource;
  let verifier: EdgeAssertionVerifier;

  beforeAll(async () => {
    keyPair = await generateKeyPair('ES256', { extractable: true });
    const pub = await exportJWK(keyPair.publicKey);
    keys = new StaticEdgeAssertionKeySource({
      keys: [{ ...pub, kid: KID, alg: 'ES256', use: 'sig' }],
    });
    verifier = new EdgeAssertionVerifier({
      keys,
      issuer: ISSUER,
      audience: AUDIENCE,
      skewToleranceSeconds: SKEW,
    });
  });

  interface MintOptions {
    iatOffset?: number;
    nbfOffset?: number;
    expOffset?: number;
  }

  async function mint(opts: MintOptions = {}): Promise<string> {
    const iat = NOW + (opts.iatOffset ?? 0);
    const jwt = new SignJWT({
      tenant: 'tnt_edge_a',
      cell: 'eu1',
      cell_epoch: 3,
      scope: 'wiki:read',
    })
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject('edge-subject-1')
      .setAudience([AUDIENCE])
      .setIssuer(ISSUER)
      .setIssuedAt(iat)
      .setExpirationTime(NOW + (opts.expOffset ?? 120));
    if (opts.nbfOffset !== undefined) {
      jwt.setNotBefore(NOW + opts.nbfOffset);
    }
    return jwt.sign(keyPair.privateKey);
  }

  it('nbf just beyond skew tolerance -> NOT_YET_VALID', async () => {
    const token = await mint({ nbfOffset: SKEW + 1 });
    await expect(verifier.verify(token, { now: NOW })).rejects.toMatchObject({
      code: 'NOT_YET_VALID',
    });
  });

  it('nbf just within skew tolerance -> accepted', async () => {
    const token = await mint({ nbfOffset: SKEW - 1 });
    await expect(verifier.verify(token, { now: NOW })).resolves.toMatchObject({
      sub: 'edge-subject-1',
    });
  });

  it('iat just beyond skew tolerance in the future -> NOT_YET_VALID', async () => {
    const token = await mint({ iatOffset: SKEW + 1 });
    await expect(verifier.verify(token, { now: NOW })).rejects.toMatchObject({
      code: 'NOT_YET_VALID',
    });
  });

  it('iat just within skew tolerance in the future -> accepted', async () => {
    const token = await mint({ iatOffset: SKEW - 1 });
    await expect(verifier.verify(token, { now: NOW })).resolves.toMatchObject({
      sub: 'edge-subject-1',
    });
  });

  it('exp gets ZERO leeway even though skew tolerance is 30s (never widened)', async () => {
    // exp = now - 1: one second expired. If exp incorrectly reused the
    // iat/nbf skew tolerance, this would wrongly accept.
    const token = await mint({ expOffset: -1 });
    await expect(verifier.verify(token, { now: NOW })).rejects.toMatchObject({
      code: 'EXPIRED',
    });
  });
});

describe('EdgeAssertionVerifier — construction and surface guards', () => {
  const validDeps = {
    keys: new StaticEdgeAssertionKeySource({ keys: [] }),
    issuer: 'https://identity.edge.orvex.internal/edge-authn',
    audience: 'orvex-studio-api',
    skewToleranceSeconds: 30,
  };

  it.each([
    ['missing keys', { ...validDeps, keys: undefined as unknown as EdgeAssertionKeySource }],
    ['empty issuer', { ...validDeps, issuer: '' }],
    ['empty audience', { ...validDeps, audience: '' }],
    ['negative skew', { ...validDeps, skewToleranceSeconds: -1 }],
    ['non-numeric skew', { ...validDeps, skewToleranceSeconds: NaN }],
  ])('fails fast at construction: %s', (_name, deps) => {
    expect(() => new EdgeAssertionVerifier(deps)).toThrow();
  });

  it('has no disable option: no config-fallback field for audience/algorithms exists on the instance', () => {
    const verifier = new EdgeAssertionVerifier(validDeps);
    const bag = verifier as unknown as Record<string, unknown>;
    for (const name of ['algorithms', 'skipVerify', 'insecure', 'allowExpired', 'verifyOff']) {
      expect(bag[name]).toBeUndefined();
    }
  });

  it('exposes exactly one behaviour on the prototype: verify()', () => {
    const methods = Object.getOwnPropertyNames(EdgeAssertionVerifier.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods).toEqual(['verify']);
  });

  it('has no unsafe decode / peek method on the instance', () => {
    const verifier = new EdgeAssertionVerifier(validDeps);
    const bag = verifier as unknown as Record<string, unknown>;
    for (const name of ['decode', 'unsafeDecode', 'decodeUnsafe', 'peek', 'parse', 'readClaims']) {
      expect(typeof bag[name]).toBe('undefined');
    }
  });

  it('rejects non-JWT / structurally-broken input as MALFORMED, never crashes', async () => {
    const verifier = new EdgeAssertionVerifier(validDeps);
    for (const bad of ['not-a-jwt', '', 'a.b.c.d']) {
      await expect(verifier.verify(bad)).rejects.toMatchObject({ code: 'MALFORMED' });
    }
  });
});
