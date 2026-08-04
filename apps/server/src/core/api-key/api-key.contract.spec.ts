import * as path from 'path';
import { promises as fs } from 'fs';
import { Global, Module } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { KyselyModule } from 'nestjs-kysely';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { ApiKeyModule } from './api-key.module';
import { signHs256Jwt, verifyHs256Jwt } from './__fixtures__/hs256-jwt-test';
import { OrvexAuditService } from '../audit/orvex-audit.service';
import { AuditEvent } from '../../common/events/audit-events.gen';
import { JwtStrategy } from '../../core/auth/strategies/jwt.strategy';
import { TOKEN_SCOPE_SYMBOL } from '../../core/casl/scope-intersection';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionActivityService } from '../../core/session/session-activity.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { EventName } from '../../common/events/event.contants';
import { UserRole } from '../../common/helpers/types/permission';
import type { DB } from '@docmost/db/types/db';

/**
 * ENG-1380 — `OrvexApiKeyAuthContractSpec`, the named binary DoD gate.
 *
 * Full black-box create→auth→revoke→escalation→keyHash-absent→audit
 * contract, driven entirely through the exported HTTP surface + the real
 * `'jwt'` passport strategy, against a real Kysely on a testcontainers
 * Postgres (no mocking of the repo, the audit sink, or the guard — CS §5,
 * ❌#4). Only `SessionActivityService`/`UserSessionRepo` are no-op doubles
 * (unreached: no test JWT below carries a `sessionId`).
 */
describe('OrvexApiKeyAuthContractSpec', () => {
  jest.setTimeout(120_000);

  const TEST_APP_SECRET = 'eng-1380-test-secret-at-least-32-characters-long';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let app: NestFastifyApplication;
  let eventEmitter: EventEmitter2;
  let orvexAudit: OrvexAuditService;

  let workspaceId: string;
  let adminId: string;
  let memberId: string;

  const signAccess = (
    sub: string,
    ws: string,
    scope?: 'restricted',
  ): string =>
    signHs256Jwt(
      {
        sub,
        email: 'user@example.com',
        workspaceId: ws,
        type: 'access',
        ...(scope ? { scope } : {}),
      },
      TEST_APP_SECRET,
    );

  const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../database/migrations');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    seedDb = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    @Global()
    @Module({
      providers: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => TEST_APP_SECRET,
            getJwtTokenExpiresIn: () => '30d',
            isCloud: () => false,
            isHttps: () => false,
            getSubdomainHost: () => 'example.com',
          },
        },
        { provide: UserSessionRepo, useValue: {} },
        {
          provide: SessionActivityService,
          useValue: { trackActivity: () => {} },
        },
      ],
      exports: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        EnvironmentService,
        UserSessionRepo,
        SessionActivityService,
      ],
      imports: [ApiKeyModule],
    })
    class TestSupportModule {}

    const built = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        EventEmitterModule.forRoot(),
        TestSupportModule,
        ApiKeyModule,
      ],
    }).compile();

    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    eventEmitter = built.get(EventEmitter2);
    orvexAudit = built.get(OrvexAuditService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const ws = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1380 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const admin = await seedDb
      .insertInto('users')
      .values({
        email: 'admin@example.com',
        workspaceId,
        role: UserRole.ADMIN,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    adminId = admin.id;

    const member = await seedDb
      .insertInto('users')
      .values({
        email: 'member@example.com',
        workspaceId,
        role: UserRole.MEMBER,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    memberId = member.id;
  });

  afterAll(async () => {
    await app?.close();
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  async function createKey(actorId: string, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/create',
      headers: authHeader(signAccess(actorId, workspaceId)),
      payload: { name },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as {
      apiKey: { id: string; name: string };
      token: string;
    };
  }

  it('AC1 — create returns a one-time token; it authenticates (200)', async () => {
    const created = await createKey(adminId, 'AC1 key');
    expect(created.token).toEqual(expect.any(String));

    const row = await seedDb
      .selectFrom('apiKeys')
      .select(['keyHash'])
      .where('id', '=', created.apiKey.id)
      .executeTakeFirstOrThrow();
    expect(row.keyHash).not.toBeNull();

    const authed = await app.inject({
      method: 'POST',
      url: '/api/api-keys/list',
      headers: authHeader(created.token),
    });
    expect(authed.statusCode).toBe(200);
  });

  it('AC2 — forged-JWT hash mismatch (valid sig) -> 401; legacy null-hash row -> 401', async () => {
    const created = await createKey(adminId, 'AC2 key');

    // Same secret, same claims shape, but a freshly re-signed JWT string is
    // NOT byte-identical to the one that was hashed at creation (different
    // `iat`) — a valid signature, wrong hash.
    const forged = signHs256Jwt(
      { sub: adminId, workspaceId, apiKeyId: created.apiKey.id, type: 'api_key' },
      TEST_APP_SECRET,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/list',
      headers: authHeader(forged),
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('API key hash mismatch');

    // Legacy row: key_hash was never set.
    const legacy = await seedDb
      .insertInto('apiKeys')
      .values({ creatorId: adminId, workspaceId, name: 'legacy' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const legacyToken = signHs256Jwt(
      { sub: adminId, workspaceId, apiKeyId: legacy.id, type: 'api_key' },
      TEST_APP_SECRET,
    );
    const legacyRes = await app.inject({
      method: 'POST',
      url: '/api/api-keys/list',
      headers: authHeader(legacyToken),
    });
    expect(legacyRes.statusCode).toBe(401);
    expect(legacyRes.body).toContain('must be re-issued');
  });

  it('AC3/AC7 — revoke -> next request 401; exactly one API_KEY_REVOKED row', async () => {
    const created = await createKey(adminId, 'AC3 key');

    const revokeRes = await app.inject({
      method: 'POST',
      url: '/api/api-keys/revoke',
      headers: authHeader(signAccess(adminId, workspaceId)),
      payload: { apiKeyId: created.apiKey.id },
    });
    expect(revokeRes.statusCode).toBe(200);

    const postRevoke = await app.inject({
      method: 'POST',
      url: '/api/api-keys/list',
      headers: authHeader(created.token),
    });
    expect(postRevoke.statusCode).toBe(401);
    expect(postRevoke.body).toContain('API key revoked');

    const row = await seedDb
      .selectFrom('apiKeys')
      .select(['deletedAt'])
      .where('id', '=', created.apiKey.id)
      .executeTakeFirstOrThrow();
    expect(row.deletedAt).not.toBeNull();

    const revokedRows = await seedDb
      .selectFrom('audit')
      .selectAll()
      .where('resourceId', '=', created.apiKey.id)
      .where('event', '=', AuditEvent.API_KEY_REVOKED)
      .execute();
    expect(revokedRows).toHaveLength(1);
  });

  it('AC4 — a RESTRICTED token gets 403 on all 4 management surfaces', async () => {
    const restricted = signAccess(adminId, workspaceId, 'restricted');
    const created = await createKey(adminId, 'AC4 key');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/api-keys/create',
      headers: authHeader(restricted),
      payload: { name: 'nope' },
    });
    expect(createRes.statusCode).toBe(403);

    const updateRes = await app.inject({
      method: 'POST',
      url: '/api/api-keys/update',
      headers: authHeader(restricted),
      payload: { apiKeyId: created.apiKey.id, name: 'nope' },
    });
    expect(updateRes.statusCode).toBe(403);

    const revokeRes = await app.inject({
      method: 'POST',
      url: '/api/api-keys/revoke',
      headers: authHeader(restricted),
      payload: { apiKeyId: created.apiKey.id },
    });
    expect(revokeRes.statusCode).toBe(403);

    const adminListRes = await app.inject({
      method: 'POST',
      url: '/api/api-keys/admin-list',
      headers: authHeader(restricted),
    });
    expect(adminListRes.statusCode).toBe(403);
  });

  it('AC5 — keyHash is absent from every item on BOTH list paths', async () => {
    await createKey(adminId, 'AC5 key');

    const selfList = await app.inject({
      method: 'POST',
      url: '/api/api-keys/list',
      headers: authHeader(signAccess(adminId, workspaceId)),
    });
    const adminList = await app.inject({
      method: 'POST',
      url: '/api/api-keys/admin-list',
      headers: authHeader(signAccess(adminId, workspaceId)),
    });

    expect(selfList.statusCode).toBe(200);
    expect(adminList.statusCode).toBe(200);

    const selfItems = JSON.parse(selfList.body);
    const adminItems = JSON.parse(adminList.body);
    expect(selfItems.length).toBeGreaterThan(0);
    expect(adminItems.length).toBeGreaterThan(0);
    expect(selfItems.every((i: any) => !('keyHash' in i))).toBe(true);
    expect(adminItems.every((i: any) => !('keyHash' in i))).toBe(true);
  });

  it('AC6 — admin revoking ANOTHER user\'s key records attribution metadata', async () => {
    const memberKey = await createKey(memberId, 'member key');

    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/revoke',
      headers: authHeader(signAccess(adminId, workspaceId)),
      payload: { apiKeyId: memberKey.apiKey.id },
    });
    expect(res.statusCode).toBe(200);

    const auditRow = await seedDb
      .selectFrom('audit')
      .selectAll()
      .where('resourceId', '=', memberKey.apiKey.id)
      .where('event', '=', AuditEvent.API_KEY_REVOKED)
      .executeTakeFirstOrThrow();
    const metadata = JSON.parse(auditRow.metadata as unknown as string);
    expect(metadata.revokedByAdmin).toBe(true);
    expect(metadata.originalOwnerId).toBe(memberId);
  });

  it('AC7 — a no-op name update emits ZERO API_KEY_UPDATED rows', async () => {
    const created = await createKey(adminId, 'same-name');

    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/update',
      headers: authHeader(signAccess(adminId, workspaceId)),
      payload: { apiKeyId: created.apiKey.id, name: 'same-name' },
    });
    expect(res.statusCode).toBe(200);

    const updatedRows = await seedDb
      .selectFrom('audit')
      .selectAll()
      .where('resourceId', '=', created.apiKey.id)
      .where('event', '=', AuditEvent.API_KEY_UPDATED)
      .execute();
    expect(updatedRows).toHaveLength(0);
  });

  it('AC8 — non-admin admin-list denial is 403 AND emits AUTH_FAILED (non-blocking)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys/admin-list',
      headers: authHeader(signAccess(memberId, workspaceId)),
    });
    expect(res.statusCode).toBe(403);

    // Fire-and-forget: give the in-flight insert a tick to land.
    await new Promise((r) => setTimeout(r, 50));

    const failedRows = await seedDb
      .selectFrom('audit')
      .selectAll()
      .where('actorId', '=', memberId)
      .where('event', '=', AuditEvent.AUTH_FAILED)
      .execute();
    expect(failedRows.length).toBeGreaterThan(0);
    const failedMetadata = JSON.parse(
      failedRows[0].metadata as unknown as string,
    );
    expect(failedMetadata.reason).toBe('admin_role_required');
  });

  it('ENG-1396 fix-1 (review finding 1) — create/update/revoke all mark their audit write critical:true (fail-hard, joins the caller tx per the ENG-1380 contract)', async () => {
    const logAndCommitSpy = jest.spyOn(orvexAudit, 'logAndCommit');

    const created = await createKey(adminId, 'ENG-1396 fix-1 key');
    await app.inject({
      method: 'POST',
      url: '/api/api-keys/update',
      headers: authHeader(signAccess(adminId, workspaceId)),
      payload: { apiKeyId: created.apiKey.id, name: 'ENG-1396 fix-1 key renamed' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/api-keys/revoke',
      headers: authHeader(signAccess(adminId, workspaceId)),
      payload: { apiKeyId: created.apiKey.id },
    });

    const calls = logAndCommitSpy.mock.calls.filter(
      ([, data]) => data.resourceId === created.apiKey.id,
    );
    expect(calls).toHaveLength(3);
    for (const [, data] of calls) {
      expect(data.critical).toBe(true);
    }
    logAndCommitSpy.mockRestore();
  });

  it('AC10 — workspace.deleted reconciles orphaned api-key rows', async () => {
    const orphanWs = await seedDb
      .insertInto('workspaces')
      .values({ name: 'to be deleted' })
      .returning('id')
      .executeTakeFirstOrThrow();

    await seedDb
      .insertInto('apiKeys')
      .values({ creatorId: adminId, workspaceId: orphanWs.id, name: 'orphan' })
      .execute();

    eventEmitter.emit(EventName.WORKSPACE_DELETED, {
      workspaceId: orphanWs.id,
    });

    await new Promise((r) => setTimeout(r, 50));

    const remaining = await seedDb
      .selectFrom('apiKeys')
      .selectAll()
      .where('workspaceId', '=', orphanWs.id)
      .execute();
    expect(remaining).toHaveLength(0);
  });

  /**
   * ENG-2498 — `TestOrvexApiKeyBehaviouralParity`, the named binary DoD gate.
   *
   * VERIFY + harden: proves the clean-room `core/api-key` module behaves
   * identically to the documented prior EE contract across
   * create/verify/scope/tenant-binding, driven ONLY through the exported
   * surfaces (`JwtStrategy.validate` — which dispatches to its api-key
   * branch — and the HTTP create/verify routes), against the real
   * testcontainers Postgres-backed `ApiKeyRepo` (CS §5, ❌#4 — no own-code
   * mock). Determinism: the expiry negative case pins a FIXED, already-past
   * timestamp on the key row (never a live now-minus-delta computation).
   */
  describe('TestOrvexApiKeyBehaviouralParity (ENG-2498 DoD gate)', () => {
    const FIXED_PAST_EXPIRY = new Date('2000-01-01T00:00:00.000Z');

    it('AC1/AC2 — a created key authenticates through the real `jwt` strategy and resolves the creator principal bound to its own workspace (create/verify parity)', async () => {
      const created = await createKey(adminId, 'ENG-2498 parity key');

      // Behavioural proof through the HTTP surface: the passport 'jwt'
      // strategy (whose api-key branch delegates to core/api-key's
      // ApiKeyService — no EE path exists in this tree to delegate to).
      const authed = await app.inject({
        method: 'POST',
        url: '/api/api-keys/list',
        headers: authHeader(created.token),
      });
      expect(authed.statusCode).toBe(200);

      // Through the exported JwtStrategy.validate interface: the resolved
      // principal is the key's creator, bound to the key's own workspace,
      // marked as api_key auth. Asserts observable outcomes only — survives
      // any internal rename of the service's private hashing/lookup helpers.
      const strategy = app.get(JwtStrategy);
      const payload = verifyHs256Jwt(created.token, TEST_APP_SECRET) as {
        sub: string;
        workspaceId: string;
        apiKeyId: string;
        type: string;
        scope?: 'restricted';
      };
      expect(payload.type).toBe('api_key');

      const principal = (await strategy.validate(
        { raw: {}, headers: authHeader(created.token) },
        payload as never,
      )) as {
        user: { id: string };
        workspace: { id: string };
        authMethod?: string;
        apiKeyId?: string;
        tokenScope?: string;
      };
      expect(principal.user.id).toBe(adminId);
      expect(principal.workspace.id).toBe(workspaceId);
      expect(principal.authMethod).toBe('api_key');
      expect(principal.apiKeyId).toBe(created.apiKey.id);
      expect(principal.tokenScope).toBe('full');
    });

    it('AC2 scope parity — the key row\'s scopes/readOnly grant is stamped onto the resolved principal at the auth seam', async () => {
      const created = await createKey(adminId, 'ENG-2498 scope key');

      // Native JS array straight through to the jsonb column — mirrors the
      // repo's own driver-edge cast (ENG-1454 AC6: never double-encoded).
      await seedDb
        .updateTable('apiKeys')
        .set({
          scopes: ['11111111-2222-3333-4444-555555555555'] as never,
          readOnly: true,
        })
        .where('id', '=', created.apiKey.id)
        .execute();

      const strategy = app.get(JwtStrategy);
      const payload = verifyHs256Jwt(created.token, TEST_APP_SECRET) as object;
      const principal = (await strategy.validate(
        { raw: {}, headers: authHeader(created.token) },
        payload as never,
      )) as { user: Record<PropertyKey, unknown> };

      const grant = principal.user[TOKEN_SCOPE_SYMBOL] as {
        readOnly: boolean;
        spaceIds: string[] | null;
      };
      expect(grant).toBeDefined();
      expect(grant.readOnly).toBe(true);
      expect(grant.spaceIds).toEqual(['11111111-2222-3333-4444-555555555555']);
    });

    it('AC2 tenant-binding — the same key id presented under ANOTHER workspace resolves nothing (401, cross-tenant fail-closed)', async () => {
      const created = await createKey(adminId, 'ENG-2498 tenant key');
      const otherWs = await seedDb
        .insertInto('workspaces')
        .values({ name: 'ENG-2498 other tenant' })
        .returning('id')
        .executeTakeFirstOrThrow();

      // Valid signature, real apiKeyId — but claiming the OTHER tenant. The
      // workspace-scoped auth-record lookup must resolve nothing (deny).
      const crossTenant = signHs256Jwt(
        {
          sub: adminId,
          workspaceId: otherWs.id,
          apiKeyId: created.apiKey.id,
          type: 'api_key',
        },
        TEST_APP_SECRET,
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/api-keys/list',
        headers: authHeader(crossTenant),
      });
      expect(res.statusCode).toBe(401);
      // No session is minted on the rejection path.
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('AC5 — an EXPIRED key fails closed: typed 401, no principal, no session minted (fixed past timestamp, no wall-clock delta)', async () => {
      const created = await createKey(adminId, 'ENG-2498 expiry key');

      // Deterministic: pin a FIXED, already-past expiry directly on the row
      // (❌#9 guard — never `Date.now()` minus a delta at assertion time).
      await seedDb
        .updateTable('apiKeys')
        .set({ expiresAt: FIXED_PAST_EXPIRY })
        .where('id', '=', created.apiKey.id)
        .execute();

      const res = await app.inject({
        method: 'POST',
        url: '/api/api-keys/list',
        headers: authHeader(created.token),
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body) as { statusCode: number; message: string };
      expect(body.statusCode).toBe(401);
      expect(body.message).toContain('API key revoked');
      expect(res.headers['set-cookie']).toBeUndefined();

      // The verify path itself resolves no principal for the expired key.
      const strategy = app.get(JwtStrategy);
      const payload = verifyHs256Jwt(created.token, TEST_APP_SECRET) as object;
      await expect(
        strategy.validate(
          { raw: {}, headers: authHeader(created.token) },
          payload as never,
        ),
      ).rejects.toThrow('API key revoked');
    });

    it('AC5 — a MALFORMED bearer and a wrong-secret signature both fail closed with a clean 401 (never a 500)', async () => {
      const malformed = await app.inject({
        method: 'POST',
        url: '/api/api-keys/list',
        headers: authHeader('not-a-jwt-at-all'),
      });
      expect(malformed.statusCode).toBe(401);

      const wrongSecret = signHs256Jwt(
        {
          sub: adminId,
          workspaceId,
          apiKeyId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          type: 'api_key',
        },
        'a-completely-different-secret-of-32-chars!!',
      );
      const forged = await app.inject({
        method: 'POST',
        url: '/api/api-keys/list',
        headers: authHeader(wrongSecret),
      });
      expect(forged.statusCode).toBe(401);
      expect(forged.headers['set-cookie']).toBeUndefined();
    });

    it('AC1/AC3 — the strategy resolves api-key auth via core/api-key: no ee/api-key import exists anywhere under apps/server/src', async () => {
      // Import-level provenance gate (AC1/AC3): asserts on IMPORTS, not raw
      // string occurrences — provenance comments legitimately mention the
      // old EE path. Complements api-key-clean-room.static.spec.ts.
      const serverSrc = path.join(__dirname, '..', '..');
      const offenders: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith('.ts')) {
            const content = await fs.readFile(full, 'utf-8');
            if (
              /(^\s*import[^\n]*['"][^'"]*ee\/api-key|require\(\s*['"][^'"]*ee\/api-key)/m.test(
                content,
              )
            ) {
              offenders.push(full);
            }
          }
        }
      };
      await walk(serverSrc);
      expect(offenders).toEqual([]);
    });
  });
});
