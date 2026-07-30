// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2499 — `TestExchangeTokenMintsSessionViaIntrospection`, the named
 * binary DoD gate (searchable alias: `TestExchangeTokenMintsSessionRs256` —
 * the shipped mechanism is opaque-token INTROSPECTION, not RS256/JWKS
 * verification, per the identity-introspector's own docstring).
 *
 * Integration layer: the REAL `OrvexSessionExchangeController` +
 * `OrvexSessionMintService` + `HttpIdentityIntrospector` chain (composed by
 * the real `OrvexSessionMintModule` from env), driven over HTTP
 * (`app.inject` on `POST /api/orvex/session/exchange`), against:
 *   - a REAL testcontainers Postgres for `UserRepo`/`SessionService`
 *     (CS §5 local-substitutable — never a mock of own code, ❌#4), and
 *   - a LOCAL fixture HTTP server standing in for identity's
 *     `POST /v1/introspect` (CS §5 true-external port double — fixed fixture
 *     principals/tokens, zero live network calls to a real identity
 *     deployment).
 *
 * Asserts (per the Issue's §5a):
 *  (1) a valid identity-minted opaque exchange token is introspected and
 *      mints a session via `SessionService.createSessionAndToken` — the
 *      `authToken` cookie is set and the bare `{sub, workspaceId, expiresAt}`
 *      body returned; the introspection fixture IS the observed call path;
 *  (2) an inactive/revoked/malformed token is rejected 401, no cookie;
 *  (3) native login is unreachable in ANY flag-on mode, including when SSO
 *      is NOT enforced (the ENG-2499 T6 guard tightening), while flag-off
 *      vanilla mode passes through unchanged;
 *  (4) SSO-enforcement + session-revocation stay engine-side (the minted
 *      session lives in THIS engine's `userSessions` store and is revocable
 *      through it);
 *  plus the AC2 grep-gate (no symmetric `APP_SECRET`/`jwt.verify` on the
 *  exchange path) and the NFR operability case (an UNCONFIGURED
 *  introspection seam fails loud with a typed 5xx, never a silent accept).
 */
import * as http from 'http';
import * as path from 'path';
import { promises as fs } from 'fs';
import { AddressInfo } from 'net';
import * as jwt from 'jsonwebtoken';
import { ExecutionContext, Global, Module } from '@nestjs/common';
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
import { OrvexNativeLoginGuard } from '../../src/orvex/http/orvex-native-login.guard';
import {
  seedAuthAccount,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

const TEST_APP_SECRET = 'eng-2499-test-secret-at-least-32-characters-long';
const FIXED_COOKIE_EXPIRY = new Date('2030-01-01T00:00:00.000Z');
const IDP_SUBJECT = 'idp-subject-eng-2499';
const VALID_OPAQUE_TOKEN = 'opaque-exchange-token-fixture-1';

/** One recorded introspect call at the fixture identity server. */
interface RecordedIntrospectCall {
  url: string;
  authorization: string | undefined;
  body: { token?: string };
}

/**
 * The CS §5 true-external double: a local HTTP fixture standing in for
 * identity's `POST /v1/introspect`. The response body is settable per case
 * (fixed fixtures, no randomness); every call is recorded so the DoD test
 * can assert introspection IS the verification path.
 */
class FakeIdentityServer {
  public readonly calls: RecordedIntrospectCall[] = [];
  public nextResponse: unknown = { active: false };
  private server: http.Server | undefined;
  public baseUrl = '';

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        let body: { token?: string } = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          body = {};
        }
        this.calls.push({
          url: req.url ?? '',
          authorization: req.headers.authorization,
          body,
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(this.nextResponse));
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const address = this.server!.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

const SAVED_ENV = {
  ORVEX_IDENTITY_URL: process.env.ORVEX_IDENTITY_URL,
  ORVEX_IDENTITY_INTROSPECTION_TOKEN:
    process.env.ORVEX_IDENTITY_INTROSPECTION_TOKEN,
  ORVEX_EDGE_ISSUER: process.env.ORVEX_EDGE_ISSUER,
  ORVEX_EDGE_JWKS_URL: process.env.ORVEX_EDGE_JWKS_URL,
  ORVEX_MODULES_ENABLED: process.env.ORVEX_MODULES_ENABLED,
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

describe('TestExchangeTokenMintsSessionViaIntrospection (ENG-2499 DoD gate)', () => {
  jest.setTimeout(180_000);

  let testDb: TestDb;
  let sqlClient: ReturnType<typeof postgres>;
  let fakeIdentity: FakeIdentityServer;
  let app: NestFastifyApplication;

  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const host = testDb.container.getHost();
    const port = testDb.container.getMappedPort(5432);
    sqlClient = postgres(
      `postgres://orvex:orvex@${host}:${port}/orvex_test`,
      { onnotice: () => undefined },
    );

    fakeIdentity = new FakeIdentityServer();
    await fakeIdentity.start();

    // Explicit env per the Issue's determinism gate: the introspection seam
    // points at the LOCAL fixture; the edge-assertion seam stays
    // deliberately unconfigured (its fail-closed composition is out of this
    // DoD's introspect path).
    process.env.ORVEX_IDENTITY_URL = fakeIdentity.baseUrl;
    delete process.env.ORVEX_IDENTITY_INTROSPECTION_TOKEN;
    delete process.env.ORVEX_EDGE_ISSUER;
    delete process.env.ORVEX_EDGE_JWKS_URL;

    app = await buildExchangeApp(sqlClient);

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    await seedAuthAccount(testDb.db, {
      userId,
      workspaceId,
      providerUserId: IDP_SUBJECT,
    });
  });

  afterAll(async () => {
    await app?.close();
    await fakeIdentity?.stop();
    await sqlClient?.end({ timeout: 5 });
    await testDb?.teardown();
    restoreEnv();
  });

  it('AC1 — a valid opaque exchange token is introspected against identity and mints an engine session (cookie + bare contract body)', async () => {
    fakeIdentity.calls.length = 0;
    fakeIdentity.nextResponse = {
      active: true,
      principal: { subject: IDP_SUBJECT, tenant: workspaceId },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      payload: { exchangeToken: VALID_OPAQUE_TOKEN },
    });

    expect(res.statusCode).toBe(200);

    // The bare `@SkipTransform` contract shape.
    const body = res.json() as {
      sub: string;
      workspaceId: string;
      expiresAt: string;
    };
    expect(body.sub).toBe(IDP_SUBJECT);
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.expiresAt).toBe(FIXED_COOKIE_EXPIRY.toISOString());

    // The session cookie is a REAL engine ACCESS token minted through
    // `createSessionAndToken` (same chokepoint as password/OIDC paths).
    const authCookie = res.cookies.find((c) => c.name === 'authToken');
    expect(authCookie).toBeDefined();
    const claims = jwt.verify(authCookie!.value, TEST_APP_SECRET) as {
      sub: string;
      workspaceId: string;
      type: string;
      sessionId?: string;
    };
    expect(claims.type).toBe('access');
    expect(claims.sub).toBe(userId);
    expect(claims.workspaceId).toBe(workspaceId);
    expect(claims.sessionId).toBeDefined();

    // The introspection fixture IS the observed verification path: exactly
    // one `POST /v1/introspect`, carrying the exchange token in the body.
    expect(fakeIdentity.calls).toHaveLength(1);
    expect(fakeIdentity.calls[0].url).toBe('/v1/introspect');
    expect(fakeIdentity.calls[0].body.token).toBe(VALID_OPAQUE_TOKEN);

    // AC5 — the minted session lives ENGINE-SIDE (this repo's own
    // `userSessions` store), and is revocable through the engine's own
    // `SessionService` — no identity round trip involved in revocation.
    const sessionRows = await testDb.db
      .selectFrom('userSessions')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    expect(sessionRows.length).toBeGreaterThan(0);

    const sessionService = app.get(SessionService);
    await sessionService.revokeSession(claims.sessionId!, userId, workspaceId);
    const revoked = await testDb.db
      .selectFrom('userSessions')
      .select(['revokedAt'])
      .where('id', '=', claims.sessionId!)
      .executeTakeFirstOrThrow();
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('AC4 — an INACTIVE (revoked/expired/unknown) token is rejected 401; no cookie, no session row', async () => {
    fakeIdentity.calls.length = 0;
    fakeIdentity.nextResponse = { active: false };

    const before = await testDb.db
      .selectFrom('userSessions')
      .selectAll()
      .execute();

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      payload: { exchangeToken: 'opaque-exchange-token-revoked' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === 'authToken')).toBeUndefined();

    const after = await testDb.db
      .selectFrom('userSessions')
      .selectAll()
      .execute();
    expect(after.length).toBe(before.length);
  });

  it('AC4 — a MALFORMED introspection verdict (active but no well-formed principal) is coerced to deny, never to accept', async () => {
    fakeIdentity.nextResponse = { active: true, principal: { subject: '' } };

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      payload: { exchangeToken: 'opaque-exchange-token-malformed' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === 'authToken')).toBeUndefined();
  });

  it('AC4 — an ACTIVE token for an UNPROVISIONED subject is denied (no create-on-resolve)', async () => {
    fakeIdentity.nextResponse = {
      active: true,
      principal: { subject: 'idp-subject-never-provisioned', tenant: workspaceId },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      payload: { exchangeToken: 'opaque-exchange-token-unprovisioned' },
    });

    expect(res.statusCode).toBe(401);

    const users = await testDb.db
      .selectFrom('users')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .execute();
    expect(users).toHaveLength(1); // still only the seeded user
  });

  it('AC4 — presenting NO credential at all is a 401 (deny-by-default), not a schema 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/session/exchange',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('AC2 (grep-gate) — the exchange path carries no symmetric APP_SECRET jwt.verify: introspection is the only verification call', async () => {
    const sessionMintDir = path.join(
      __dirname,
      '../../src/core/session-mint',
    );
    for (const file of [
      'orvex-session-exchange.controller.ts',
      'orvex-session-mint.service.ts',
    ]) {
      const content = await fs.readFile(
        path.join(sessionMintDir, file),
        'utf-8',
      );
      expect(content).not.toMatch(/APP_SECRET/);
      expect(content).not.toMatch(/jwt\.verify|jsonwebtoken/);
    }
  });

  it('AC3 — native login is unreachable in ANY flag-on mode, including when SSO is NOT enforced; flag-off vanilla passes through', async () => {
    const guard = new OrvexNativeLoginGuard();
    const contextFor = (workspace: unknown): ExecutionContext =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ raw: { workspace } }) }),
      }) as unknown as ExecutionContext;

    process.env.ORVEX_MODULES_ENABLED = 'true';
    try {
      // enforceSso FALSE (the pre-ENG-2499 default-open door) — now closed.
      expect(() =>
        guard.canActivate(contextFor({ id: workspaceId, enforceSso: false })),
      ).toThrow(/native login disabled/i);
      // enforceSso TRUE — closed as before.
      expect(() =>
        guard.canActivate(contextFor({ id: workspaceId, enforceSso: true })),
      ).toThrow(/native login disabled/i);

      delete process.env.ORVEX_MODULES_ENABLED;
      // Vanilla/flag-off byte-parity: passes through untouched.
      expect(
        guard.canActivate(contextFor({ id: workspaceId, enforceSso: false })),
      ).toBe(true);
    } finally {
      restoreEnv();
    }

    // And the guard is BOUND to the native login/register/reset routes (the
    // route-reachability closure is the guard, per the Issue's §4a note that
    // the routes themselves are not deleted).
    const authControllerSource = await fs.readFile(
      path.join(__dirname, '../../src/core/auth/auth.controller.ts'),
      'utf-8',
    );
    const bindings = authControllerSource.match(
      /@UseGuards\(OrvexNativeLoginGuard\)/g,
    );
    expect(bindings).toHaveLength(3); // login, forgot-password, password-reset
  });

  it('NFR operability — an UNCONFIGURED introspection seam fails LOUD with a typed 5xx (never a silent accept, never a token-verdict 401)', async () => {
    delete process.env.ORVEX_IDENTITY_URL;
    let unconfiguredApp: NestFastifyApplication | undefined;
    try {
      unconfiguredApp = await buildExchangeApp(sqlClient);
      const res = await unconfiguredApp.inject({
        method: 'POST',
        url: '/api/orvex/session/exchange',
        payload: { exchangeToken: VALID_OPAQUE_TOKEN },
      });
      expect(res.statusCode).toBe(500);
      expect(
        res.cookies.find((c) => c.name === 'authToken'),
      ).toBeUndefined();
    } finally {
      await unconfiguredApp?.close();
      process.env.ORVEX_IDENTITY_URL = fakeIdentity.baseUrl;
    }
  });
});
