// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3236 — real HTTP edge-assertion session exchange.
 *
 * This suite drives the real controller, composed session-mint module,
 * RemoteEdgeAssertionKeySource, EdgeAssertionVerifier, UserRepo and
 * SessionService over HTTP. Postgres is a real testcontainer; the identity
 * JWKS endpoint is a local HTTP fixture at the true external network seam.
 *
 * The suite closes the assertion-path integration gap left by ENG-2499's
 * introspection-only integration test: a valid `aud=orvex-wiki` assertion
 * mints a real engine cookie, a foreign audience and an unprovisioned subject
 * are denied, and an assertion wins over a simultaneously supplied opaque
 * exchange token at the wire boundary.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { createHmac, timingSafeEqual, webcrypto } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { KyselyModule } from 'nestjs-kysely';
import { CamelCasePlugin } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { ClsModule } from 'nestjs-cls';
import fastifyCookie from '@fastify/cookie';

import { OrvexSessionMintModule } from '../../src/core/session-mint/orvex-session-mint.module';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionService } from '../../src/core/session/session.service';
import { TokenService } from '../../src/core/auth/services/token.service';
import { EnvironmentService } from '../../src/integrations/environment/environment.service';
import { OrvexAuditModule } from '../../src/core/audit/orvex-audit.module';
import {
  exportEs256PublicJwk,
  generateEs256KeyPair,
  SignJws,
  TestJwks,
} from '../../src/orvex/edge-auth/__fixtures__/jws-test-mint';
import { WIKI_EDGE_AUDIENCE } from '../../src/core/session-mint/wiki-edge-audience';
import {
  seedAuthAccount,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

const TEST_APP_SECRET = 'eng-3236-test-secret-at-least-32-characters-long';
const FIXED_COOKIE_EXPIRY = new Date('2030-01-01T00:00:00.000Z');
const ISSUER = 'https://identity.edge.orvex.internal/edge-authn';
const KID = 'eng-3236-test-kid-eu1a';
const PROVISIONED_SUBJECT = 'idp-subject-eng-3236';
const UNPROVISIONED_SUBJECT = 'idp-subject-eng-3236-unprovisioned';

type PrivateKey = webcrypto.CryptoKey;

interface RecordedJwksCall {
  method: string;
  url: string;
}

/** Local true-external double for identity's internal JWKS endpoint. */
class FakeJwksServer {
  public readonly calls: RecordedJwksCall[] = [];
  public jwks: TestJwks = { keys: [] };
  private server: http.Server | undefined;
  public baseUrl = '';

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.calls.push({ method: req.method ?? '', url: req.url ?? '' });
      if (req.method !== 'GET' || req.url !== '/jwks') {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(this.jwks));
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

/** Verify the real HS256 engine access token emitted in the authToken cookie. */
function verifyHs256Jwt(
  token: string,
  secret: string,
): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('verifyHs256Jwt: not a 3-part compact JWT');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const expectedSignature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actualSignature = Buffer.from(signatureB64, 'base64url');
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new Error('verifyHs256Jwt: signature mismatch');
  }
  return JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

async function signAssertion(
  privateKey: PrivateKey,
  subject: string,
  workspaceId: string,
  audience: string = WIKI_EDGE_AUDIENCE,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJws({
    sub: subject,
    tenant: workspaceId,
    cell: 'eu1a',
    cell_epoch: 0,
    scope: '',
    aud: [audience],
    iss: ISSUER,
    iat: now,
    exp: now + 120,
  })
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .sign(privateKey);
}

const SAVED_ENV = {
  ORVEX_IDENTITY_URL: process.env.ORVEX_IDENTITY_URL,
  ORVEX_IDENTITY_INTROSPECTION_TOKEN:
    process.env.ORVEX_IDENTITY_INTROSPECTION_TOKEN,
  ORVEX_EDGE_ISSUER: process.env.ORVEX_EDGE_ISSUER,
  ORVEX_EDGE_JWKS_URL: process.env.ORVEX_EDGE_JWKS_URL,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function buildExchangeApp(
  sqlClient: ReturnType<typeof postgres>,
): Promise<NestFastifyApplication> {
  @Global()
  @Module({
    imports: [
      JwtModule.register({
        secret: TEST_APP_SECRET,
        signOptions: { expiresIn: '30d', issuer: 'Docmost' },
      }),
    ],
    providers: [
      UserRepo,
      UserSessionRepo,
      TokenService,
      SessionService,
      {
        provide: EnvironmentService,
        useValue: {
          getAppSecret: () => TEST_APP_SECRET,
          getJwtTokenExpiresIn: () => '30d',
          getCookieExpiresIn: () => FIXED_COOKIE_EXPIRY,
          isHttps: () => false,
          isCloud: () => true,
        },
      },
    ],
    exports: [
      UserRepo,
      UserSessionRepo,
      TokenService,
      SessionService,
      EnvironmentService,
    ],
  })
  class TestGlobalsModule {}

  const built = await Test.createTestingModule({
    imports: [
      KyselyModule.forRoot({
        dialect: new PostgresJSDialect({ postgres: sqlClient }),
        plugins: [new CamelCasePlugin()],
      }),
      ClsModule.forRoot({ global: true, middleware: { mount: true } }),
      OrvexAuditModule,
      TestGlobalsModule,
      OrvexSessionMintModule,
    ],
  }).compile();

  const app = built.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');
  await app.register(fastifyCookie as never);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('ENG-3236 edge-assertion session exchange integration', () => {
  jest.setTimeout(180_000);

  let testDb: TestDb;
  let sqlClient: ReturnType<typeof postgres>;
  let fakeJwks: FakeJwksServer;
  let app: NestFastifyApplication;
  let privateKey: PrivateKey;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const host = testDb.container.getHost();
    const port = testDb.container.getMappedPort(5432);
    sqlClient = postgres(`postgres://orvex:orvex@${host}:${port}/orvex_test`, {
      onnotice: () => undefined,
    });

    const keyPair = await generateEs256KeyPair();
    privateKey = keyPair.privateKey;
    const publicJwk = await exportEs256PublicJwk(keyPair.publicKey);
    fakeJwks = new FakeJwksServer();
    fakeJwks.jwks = {
      keys: [{ ...publicJwk, kid: KID, alg: 'ES256', use: 'sig' }],
    };
    await fakeJwks.start();

    // The assertion verifier is composed from the real module and must fetch
    // this local JWKS over HTTP on first verification. Identity introspection
    // is intentionally absent: both-credential coverage would fail loudly if
    // the controller accidentally selected the transient path.
    delete process.env.ORVEX_IDENTITY_URL;
    delete process.env.ORVEX_IDENTITY_INTROSPECTION_TOKEN;
    process.env.ORVEX_EDGE_ISSUER = ISSUER;
    process.env.ORVEX_EDGE_JWKS_URL = `${fakeJwks.baseUrl}/jwks`;

    app = await buildExchangeApp(sqlClient);

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    await seedAuthAccount(testDb.db, {
      userId,
      workspaceId,
      providerUserId: PROVISIONED_SUBJECT,
    });
  });

  afterAll(async () => {
    await app?.close();
    await fakeJwks?.stop();
    await sqlClient?.end({ timeout: 5 });
    await testDb?.teardown();
    restoreEnv();
  });

  it('AC6 — valid aud=orvex-wiki assertion mints a real engine session over HTTP', async () => {
    const assertion = await signAssertion(
      privateKey,
      PROVISIONED_SUBJECT,
      workspaceId,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      headers: { 'x-orvex-assertion': assertion },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sub: PROVISIONED_SUBJECT,
      workspaceId,
      expiresAt: FIXED_COOKIE_EXPIRY.toISOString(),
    });

    const authCookie = res.cookies.find(
      (cookie) => cookie.name === 'authToken',
    );
    expect(authCookie).toBeDefined();
    const claims = verifyHs256Jwt(authCookie!.value, TEST_APP_SECRET) as {
      sub: string;
      workspaceId: string;
      type: string;
      sessionId?: string;
    };
    expect(claims.type).toBe('access');
    expect(claims.sub).toBe(userId);
    expect(claims.workspaceId).toBe(workspaceId);
    expect(claims.sessionId).toBeDefined();

    // RemoteEdgeAssertionKeySource is lazy and the real HTTP JWKS fixture was
    // the observed key-material path; the verifier then uses the cached key.
    expect(fakeJwks.calls).toEqual([{ method: 'GET', url: '/jwks' }]);

    const sessionRows = await testDb.db
      .selectFrom('userSessions')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    expect(sessionRows.length).toBeGreaterThan(0);
  });

  it('AC6 — a foreign audience is rejected 401 and never sets an auth cookie', async () => {
    const assertion = await signAssertion(
      privateKey,
      PROVISIONED_SUBJECT,
      workspaceId,
      'orvex-studio-knowledge',
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      headers: { 'x-orvex-assertion': assertion },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(
      res.cookies.find((cookie) => cookie.name === 'authToken'),
    ).toBeUndefined();
  });

  it('AC6 — a valid assertion for an unprovisioned subject is rejected 401 and never creates a session', async () => {
    const before = await testDb.db
      .selectFrom('userSessions')
      .selectAll()
      .execute();
    const assertion = await signAssertion(
      privateKey,
      UNPROVISIONED_SUBJECT,
      workspaceId,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      headers: { 'x-orvex-assertion': assertion },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(
      res.cookies.find((cookie) => cookie.name === 'authToken'),
    ).toBeUndefined();
    const after = await testDb.db
      .selectFrom('userSessions')
      .selectAll()
      .execute();
    expect(after).toHaveLength(before.length);
  });

  it('AC6 — assertion wins over a simultaneously supplied exchangeToken at the wire boundary', async () => {
    const assertion = await signAssertion(
      privateKey,
      PROVISIONED_SUBJECT,
      workspaceId,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      headers: { 'x-orvex-assertion': assertion },
      payload: { exchangeToken: 'opaque-token-that-must-not-be-introspected' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sub: PROVISIONED_SUBJECT,
      workspaceId,
      expiresAt: FIXED_COOKIE_EXPIRY.toISOString(),
    });
    expect(
      res.cookies.find((cookie) => cookie.name === 'authToken'),
    ).toBeDefined();
    // No identity introspection URL is configured in this suite. A mistaken
    // transient-path selection would therefore produce a 500, not this 200.
  });
});
