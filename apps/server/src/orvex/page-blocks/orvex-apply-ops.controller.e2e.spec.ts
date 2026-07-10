// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';

import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { WsService } from '../../ws/ws.service';
import { OutboxWriter } from '../events/outbox/outbox-writer.service';
import { IdempotencyStore } from '../../integrations/redis/idempotency-store.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SpaceRole } from '../../common/helpers/types/permission';
import type { DbInterface } from '../../database/types/db.interface';
import type { KyselyDB } from '../../database/types/kysely.types';

import { OrvexApplyOpsController } from './orvex-apply-ops.controller';
import { ApplyOpsService } from './apply-ops.service';

/**
 * A minimal in-memory double for the ONE `ioredis` surface
 * `IdempotencyStore` actually calls (`set(key, val, 'EX', ttl, 'NX')` +
 * `get(key)`), implementing REAL `SET ... NX` semantics (refuse to
 * overwrite an existing key) rather than the degraded
 * `getOrNil() -> null` stub used by the main suite below. Faking the true
 * external (Redis) at its client boundary is legitimate (CS zero-mock);
 * the point here is that this fake actually behaves like Redis, so
 * `IdempotencyStore.claim()`/`.record()` run their REAL winner/loser logic
 * instead of always degrading — the only way to exercise AC3's dedup path
 * (F1).
 */
class FakeRedisClient {
  private readonly store = new Map<string, string>();

  async set(
    key: string,
    value: string,
    ..._flags: unknown[]
  ): Promise<'OK' | null> {
    if (_flags.includes('NX') && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

/**
 * ENG-1652 — the named DoD gate:
 *
 *   `orvex-apply-ops.controller.e2e.spec.ts › "a 3-op ordered batch whose
 *   2nd op targets a non-existent refBlockId returns a typed 4xx AND a
 *   follow-up page read is byte-identical to pre-batch (op[0] NOT
 *   written)"`
 *
 * Real Postgres (testcontainers), migrated to HEAD, driving the REAL HTTP
 * route through Nest + fastify (behaviour-through-interface, CS §5 — no
 * hand-authored engine fake). `JwtAuthGuard` is overridden (auth WIRING,
 * not the thing under test) to stamp a real DB-backed user/workspace onto
 * the request the same shape Passport would.
 */
describe('OrvexApplyOpsController — e2e (ENG-1652 DoD)', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let app: NestFastifyApplication;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  const savedEnv: Record<string, string | undefined> = {};
  function setEnv(key: string, value: string) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  beforeAll(async () => {
    setEnv('ORVEX_MODULES_ENABLED', 'true');

    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DbInterface>({
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

    @Global()
    @Module({
      providers: [
        PageRepo,
        SpaceMemberRepo,
        GroupRepo,
        SpaceRepo,
        PagePermissionRepo,
        WsService,
        OutboxWriter,
        SpaceAbilityFactory,
        IdempotencyStore,
        // A true external (Redis) faked at its own boundary — IdempotencyStore
        // is DESIGNED to degrade to {claimed:true, degraded:true} when Redis
        // is unavailable (its own docstring), so `getOrNil() -> null` here is
        // the real production degraded path, not a business-logic fake.
        { provide: RedisService, useValue: { getOrNil: () => null } },
      ],
      exports: [
        PageRepo,
        SpaceMemberRepo,
        GroupRepo,
        SpaceRepo,
        PagePermissionRepo,
        WsService,
        OutboxWriter,
        SpaceAbilityFactory,
        IdempotencyStore,
      ],
    })
    class TestSupportModule {}

    @Module({
      controllers: [OrvexApplyOpsController],
      providers: [ApplyOpsService],
    })
    class TestApplyOpsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        EventEmitterModule.forRoot(),
        CacheModule.register({ isGlobal: true }),
        TestSupportModule,
        TestApplyOpsModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            user: { id: userId, workspaceId },
            workspace: { id: workspaceId },
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = moduleRef.get(PageRepo)['db'];

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1652 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1652 Space', slug: 'eng-1652-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1652-user@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;

    await db
      .insertInto('spaceMembers')
      .values({ userId, spaceId, role: SpaceRole.ADMIN })
      .execute();
  });

  afterAll(async () => {
    await app?.close();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  let pageCounter = 0;
  async function createPage(content: any) {
    pageCounter += 1;
    const page = await db
      .insertInto('pages')
      .values({
        title: `ENG-1652 page ${pageCounter}`,
        spaceId,
        workspaceId,
        slugId: `eng-1652-${pageCounter}-${Date.now()}`,
        creatorId: userId,
        lastUpdatedById: userId,
        content,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    await db
      .insertInto('orvexPageMeta')
      .values({ pageId: page.id, externalId: null, contentHash: null, version: 1, workspaceId })
      .execute();

    return page.id;
  }

  it('AC1 — a valid single-op batch mutates the page (no longer a 501)', async () => {
    const original = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'hello' }] }],
    };
    const pageId = await createPage(original);

    const res = await app.inject({
      method: 'POST',
      url: `/api/orvex/pages/${pageId}/apply-ops`,
      payload: {
        ifVersion: 1,
        ops: [
          {
            type: 'append',
            node: { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: 'world' }] },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const envelope = body.data ?? body;
    expect(envelope).toMatchObject({ version: 2 });

    const persisted = await db
      .selectFrom('pages')
      .select('content')
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
    expect((persisted.content as any).content).toHaveLength(2);

    // AC5 — the success envelope equals a FRESH independent read, not just
    // a stale in-memory computed value. Two separate queries (page row +
    // orvex_page_meta), not a re-use of anything the request handler saw.
    const freshPage = await db
      .selectFrom('pages')
      .select('updatedAt')
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
    const freshMeta = await db
      .selectFrom('orvexPageMeta')
      .select(['version', 'contentHash'])
      .where('pageId', '=', pageId)
      .executeTakeFirstOrThrow();

    expect(envelope.version).toBe(freshMeta.version);
    expect(envelope.contentHash).toBe(freshMeta.contentHash);
    expect(new Date(envelope.settledUpdatedAt).getTime()).toBe(
      new Date(freshPage.updatedAt as unknown as string).getTime(),
    );
  });

  it('AC6 — flag-off (ORVEX_MODULES_ENABLED not exactly "true") 404s before the handler body runs', async () => {
    const pageId = await createPage({ type: 'doc', content: [] });
    const prevFlag = process.env.ORVEX_MODULES_ENABLED;
    delete process.env.ORVEX_MODULES_ENABLED;

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/pages/${pageId}/apply-ops`,
        payload: {
          ifVersion: 1,
          ops: [{ type: 'append', node: { type: 'paragraph', attrs: { id: 'x' } } }],
        },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      if (prevFlag === undefined) delete process.env.ORVEX_MODULES_ENABLED;
      else process.env.ORVEX_MODULES_ENABLED = prevFlag;
    }

    // Byte-parity: nothing was written while the tree was flag-off.
    const persisted = await db
      .selectFrom('pages')
      .select('content')
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
    expect((persisted.content as any).content).toEqual([]);
  });

  it(
    'a 3-op ordered batch whose 2nd op targets a non-existent refBlockId returns a typed 4xx AND ' +
      'a follow-up page read is byte-identical to pre-batch (op[0] NOT written)',
    async () => {
      const original = {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { id: 'a' }, content: [{ type: 'text', text: 'first' }] },
          { type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'second' }] },
        ],
      };
      const pageId = await createPage(original);

      const preBatch = await db
        .selectFrom('pages')
        .select(['content', 'textContent'])
        .where('id', '=', pageId)
        .executeTakeFirstOrThrow();

      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/pages/${pageId}/apply-ops`,
        payload: {
          ifVersion: 1,
          ops: [
            {
              type: 'append',
              node: { type: 'paragraph', attrs: { id: 'op0-block' }, content: [{ type: 'text', text: 'op0' }] },
            },
            { type: 'insert_before', refBlockId: 'does-not-exist', node: { type: 'paragraph', attrs: { id: 'op1' } } },
            {
              type: 'append',
              node: { type: 'paragraph', attrs: { id: 'never-reached' }, content: [{ type: 'text', text: 'op2' }] },
            },
          ],
        },
      });

      // Typed 4xx (AC4 — MISSING_REF_BLOCK_ID)
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
      const body = res.json();
      expect(JSON.stringify(body)).not.toContain('"ok":true');
      expect(body.message?.code ?? body.code).toBe('MISSING_REF_BLOCK_ID');

      // Byte-identical to pre-batch — op[0]'s append never landed.
      const postBatch = await db
        .selectFrom('pages')
        .select(['content', 'textContent'])
        .where('id', '=', pageId)
        .executeTakeFirstOrThrow();
      expect(postBatch.content).toEqual(preBatch.content);
      expect(postBatch.textContent).toEqual(preBatch.textContent);

      const metaAfter = await db
        .selectFrom('orvexPageMeta')
        .select('version')
        .where('pageId', '=', pageId)
        .executeTakeFirstOrThrow();
      expect(metaAfter.version).toBe(1);
    },
  );

  it('AC3 — a stale ifVersion returns 409 VERSION_MISMATCH', async () => {
    const pageId = await createPage({ type: 'doc', content: [] });

    const res = await app.inject({
      method: 'POST',
      url: `/api/orvex/pages/${pageId}/apply-ops`,
      payload: {
        ifVersion: 99,
        ops: [{ type: 'append', node: { type: 'paragraph', attrs: { id: 'x' } } }],
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.message?.code ?? body.code).toBe('VERSION_MISMATCH');
  });

  it('AC4 — each typed error path never returns a 200-with-no-change', async () => {
    const pageId = await createPage({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'only' }, content: [{ type: 'text', text: 'text' }] }],
    });

    const cases: Array<{ ops: unknown[]; code: string }> = [
      { ops: [{ type: 'delete-by-id', blockId: 'ghost' }], code: 'MISSING_REF_BLOCK_ID' },
      { ops: [{ type: 'move', blockId: 'ghost' }], code: 'MOVE_SOURCE_MISSING' },
      { ops: [{ type: 'append', node: { type: 'not-a-real-node-type' } }], code: 'UNKNOWN_BLOCK_TYPE' },
      { ops: [{ type: 'not-a-real-op' }], code: 'UNSUPPORTED_OP' },
      {
        ops: [{ type: 'patch-string', blockId: 'only', find: 'not-present', replace: 'x' }],
        code: 'STRING_NOT_FOUND',
      },
    ];

    for (const { ops, code } of cases) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/pages/${pageId}/apply-ops`,
        payload: { ifVersion: 1, ops },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(res.json())).not.toContain('"ok":true');
      expect(res.json().message?.code ?? res.json().code).toBe(code);
    }
  });

  /**
   * F1 — AC3's dedup/replay half, exercised through a REAL (if in-memory)
   * Redis double that actually implements `SET NX` semantics, so
   * `IdempotencyStore.claim()`/`.record()` run their real winner/loser
   * branches instead of always degrading. A second Nest app (same
   * Postgres container/db), differing only in the `RedisService` provider.
   */
  describe('AC3 — idempotency dedup/replay (working fake Redis)', () => {
    let dedupApp: NestFastifyApplication;
    let dedupIdempotencyStore: IdempotencyStore;
    const fakeRedis = new FakeRedisClient();

    beforeAll(async () => {
      @Global()
      @Module({
        providers: [
          PageRepo,
          SpaceMemberRepo,
          GroupRepo,
          SpaceRepo,
          PagePermissionRepo,
          WsService,
          OutboxWriter,
          SpaceAbilityFactory,
          IdempotencyStore,
          {
            provide: RedisService,
            useValue: { getOrNil: () => fakeRedis as unknown as Redis },
          },
        ],
        exports: [
          PageRepo,
          SpaceMemberRepo,
          GroupRepo,
          SpaceRepo,
          PagePermissionRepo,
          WsService,
          OutboxWriter,
          SpaceAbilityFactory,
          IdempotencyStore,
        ],
      })
      class DedupTestSupportModule {}

      @Module({
        controllers: [OrvexApplyOpsController],
        providers: [ApplyOpsService],
      })
      class DedupTestApplyOpsModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [
          KyselyModule.forRoot({
            dialect: new PostgresJSDialect({ postgres: sqlClient }),
            plugins: [new CamelCasePlugin()],
          }),
          EventEmitterModule.forRoot(),
          CacheModule.register({ isGlobal: true }),
          DedupTestSupportModule,
          DedupTestApplyOpsModule,
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (context: any) => {
            const req = context.switchToHttp().getRequest();
            req.user = {
              user: { id: userId, workspaceId },
              workspace: { id: workspaceId },
            };
            return true;
          },
        })
        .compile();

      dedupApp = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );
      dedupApp.setGlobalPrefix('api');
      dedupApp.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await dedupApp.init();
      await dedupApp.getHttpAdapter().getInstance().ready();
      dedupIdempotencyStore = moduleRef.get(IdempotencyStore);
    });

    afterAll(async () => {
      await dedupApp?.close();
    });

    it('concurrent keyed duplicates -> one inserted node, identical envelope both times (loser never re-applies)', async () => {
      // Two requests race for the SAME idempotency key at the SAME
      // ifVersion (the real-world shape of a keyed retry: the client
      // doesn't yet know the first attempt is landing). Firing them
      // concurrently — not sequentially after the first commits — is what
      // makes both see `ifVersion: 1` as still current, so the loser's
      // 409 does NOT come from AC3's separate stale-CAS path; only ONE of
      // them may actually claim the slot and write.
      const original = {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { id: 'seed' }, content: [{ type: 'text', text: 'seed' }] }],
      };
      const pageId = await createPage(original);
      const idempotencyKey = `eng-1652-idem-${Date.now()}`;
      const payload = {
        ifVersion: 1,
        ops: [
          {
            type: 'append',
            node: { type: 'paragraph', attrs: { id: 'dedup-node' }, content: [{ type: 'text', text: 'once' }] },
          },
        ],
      };

      const [first, second] = await Promise.all([
        dedupApp.inject({
          method: 'POST',
          url: `/api/orvex/pages/${pageId}/apply-ops`,
          headers: { 'idempotency-key': idempotencyKey },
          payload,
        }),
        dedupApp.inject({
          method: 'POST',
          url: `/api/orvex/pages/${pageId}/apply-ops`,
          headers: { 'idempotency-key': idempotencyKey },
          payload,
        }),
      ]);

      // Exactly one node landed — the batch was never applied twice.
      const persisted = await db
        .selectFrom('pages')
        .select('content')
        .where('id', '=', pageId)
        .executeTakeFirstOrThrow();
      const nodes = (persisted.content as any).content as unknown[];
      expect(nodes).toHaveLength(2);

      const metaAfter = await db
        .selectFrom('orvexPageMeta')
        .select('version')
        .where('pageId', '=', pageId)
        .executeTakeFirstOrThrow();
      expect(metaAfter.version).toBe(2);

      // Both requests observed 200 with identical envelopes — the loser
      // replayed the winner's recorded result rather than 409ing or
      // fabricating its own.
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json().data ?? second.json()).toEqual(
        first.json().data ?? first.json(),
      );
    });

    it('a sequential keyed retry after the winner has landed replays the SAME recorded envelope without writing again (real claim()/record())', async () => {
      // Deterministic complement to the concurrent case above: seed the
      // store via the REAL `IdempotencyStore.claim()`+`record()` calls
      // (not a business-logic mock) to pin down the winner's result, then
      // fire the actual HTTP retry and prove the loser branch
      // (`claim() -> {claimed:false, result}`) returns that exact
      // recorded envelope and performs zero additional writes.
      const original = {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { id: 'seed2' }, content: [{ type: 'text', text: 'seed2' }] }],
      };
      const pageId = await createPage(original);
      const idempotencyKey = `eng-1652-idem-seq-${Date.now()}`;

      const winnerClaim = await dedupIdempotencyStore.claim(
        'apply-ops',
        pageId,
        userId,
        idempotencyKey,
      );
      expect(winnerClaim.claimed).toBe(true);
      expect(winnerClaim.degraded).toBe(false);

      const recordedEnvelope = {
        version: 2,
        settledUpdatedAt: new Date().toISOString(),
        contentHash: 'recorded-by-real-winner',
      };
      await dedupIdempotencyStore.record(
        'apply-ops',
        pageId,
        userId,
        idempotencyKey,
        recordedEnvelope,
      );

      const retry = await dedupApp.inject({
        method: 'POST',
        url: `/api/orvex/pages/${pageId}/apply-ops`,
        headers: { 'idempotency-key': idempotencyKey },
        payload: {
          ifVersion: 1,
          ops: [
            {
              type: 'append',
              node: { type: 'paragraph', attrs: { id: 'must-not-land' } },
            },
          ],
        },
      });

      expect(retry.statusCode).toBe(200);
      expect(retry.json().data ?? retry.json()).toEqual(recordedEnvelope);

      // Zero-write proof: the page is byte-identical to pre-retry.
      const persisted = await db
        .selectFrom('pages')
        .select('content')
        .where('id', '=', pageId)
        .executeTakeFirstOrThrow();
      expect((persisted.content as any).content).toEqual(original.content);

      const metaAfter = await db
        .selectFrom('orvexPageMeta')
        .select('version')
        .where('pageId', '=', pageId)
        .executeTakeFirstOrThrow();
      expect(metaAfter.version).toBe(1);
    });
  });
});
