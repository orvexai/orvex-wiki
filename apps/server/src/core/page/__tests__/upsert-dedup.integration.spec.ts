import * as path from 'path';
import { promises as fs } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Redis } from 'ioredis';

import { PageService } from '../services/page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageTransclusionsRepo } from '@docmost/db/repos/page-transclusions/page-transclusions.repo';
import { PageTransclusionReferencesRepo } from '@docmost/db/repos/page-transclusions/page-transclusion-references.repo';
import { TransclusionService } from '../transclusion/transclusion.service';
import { IdempotencyStore } from '../../../integrations/redis/idempotency-store.service';
import type { DbInterface } from '@docmost/db/types/db.interface';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import type { Page, User } from '@docmost/db/types/entity.types';

/**
 * ENG-1413 — the named DoD gate:
 * `IdempotencyStore + if-version CAS › cross-replica dedup + integer CAS
 * 409 on drift`
 *
 * Real Postgres (testcontainers) — the atomic `UPDATE … WHERE version = ?`
 * CAS lives in `PageRepo.casIncrementMeta`, never mocked (CS ❌#4). Real
 * Redis (a plain `GenericContainer`, since `@testcontainers/redis` is not a
 * pinned dependency) exercised through the real `ioredis` client wired into
 * `IdempotencyStore` via `RedisService.getOrNil()` — a genuine
 * cross-replica substitute, not a hand-authored verdict double.
 *
 * "Cross-replica" is simulated the way a real second replica would behave:
 * two independent `PageService` instances, each with its OWN `IdempotencyStore`
 * (both backed by the SAME Redis container) and each reading through the
 * SAME Postgres — i.e. two processes racing the same primitives, not one
 * in-process object reused twice.
 */
describe('IdempotencyStore + if-version CAS — integration', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let redisClientA: Redis;
  let redisClientB: Redis;
  let db: KyselyDB;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;
  let authUser: User;

  function buildService(redisClient: Redis): PageService {
    const eventEmitter = new EventEmitter2();
    const spaceMemberRepoStub = {} as any;
    const groupRepoStub = {} as any;
    const cacheManagerStub = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    } as any;
    const storageServiceStub = { copy: async () => {} } as any;
    const attachmentQueueStub = { add: async () => ({}) } as any;
    const aiQueueStub = { add: async () => ({}) } as any;
    const generalQueueStub = { add: async () => ({}) } as any;
    const collaborationGatewayStub = { handleYjsEvent: async () => {} } as any;
    const watcherServiceStub = {
      addPageWatchers: async () => {},
      movePageWatchersToSpace: async () => {},
    } as any;

    const pageRepo = new PageRepo(db, spaceMemberRepoStub, eventEmitter);
    const pagePermissionRepo = new PagePermissionRepo(
      db,
      groupRepoStub,
      cacheManagerStub,
    );
    const attachmentRepo = new AttachmentRepo(db);
    const pageTransclusionsRepo = new PageTransclusionsRepo(db);
    const pageTransclusionReferencesRepo = new PageTransclusionReferencesRepo(
      db,
    );
    const transclusionService = new TransclusionService(
      db,
      pageTransclusionsRepo,
      pageTransclusionReferencesRepo,
      pageRepo,
      pagePermissionRepo,
      undefined,
      attachmentRepo,
      storageServiceStub,
      undefined,
    );

    // Real IdempotencyStore, real ioredis client — RedisService is a thin
    // real-shape stub exposing exactly the surface IdempotencyStore calls.
    const redisServiceStub = { getOrNil: () => redisClient } as any;
    const idempotencyStore = new IdempotencyStore(redisServiceStub);

    // ENG-1382 — this spec exercises upsert dedup, not F-QUOTA; a stub that
    // never blocks keeps prior scenarios unaffected.
    const entitlementServiceStub = {
      assertWithinQuota: async () => undefined,
      hasFeature: async () => true,
    } as any;

    return new PageService(
      pageRepo,
      pagePermissionRepo,
      attachmentRepo,
      db,
      storageServiceStub,
      attachmentQueueStub,
      aiQueueStub,
      generalQueueStub,
      eventEmitter,
      collaborationGatewayStub,
      watcherServiceStub,
      transclusionService,
      idempotencyStore,
      entitlementServiceStub,
    );
  }

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../../database/migrations');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    const redisHost = redisContainer.getHost();
    const redisPort = redisContainer.getMappedPort(6379);
    // Two independent clients standing in for two replicas' connections to
    // the SAME Redis — never one client shared/reused as "two replicas".
    redisClientA = new Redis({ host: redisHost, port: redisPort, lazyConnect: false });
    redisClientB = new Redis({ host: redisHost, port: redisPort, lazyConnect: false });

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1413 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1413@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;
    authUser = { id: userId, workspaceId } as User;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1413 Space', slug: 'eng-1413-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterAll(async () => {
    await redisClientA?.quit();
    await redisClientB?.quit();
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  async function createPage(title: string): Promise<Page> {
    const serviceA = buildService(redisClientA);
    return serviceA.create(userId, workspaceId, {
      spaceId,
      title,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      format: 'json',
    } as any);
  }

  it('AC1/AC6: a stale integer ifVersion 409s VERSION_MISMATCH via the atomic UPDATE … WHERE version = ?', async () => {
    const page = await createPage('CAS Drift Page');
    const serviceA = buildService(redisClientA);

    // First write succeeds and advances version 1 -> 2.
    await serviceA.update(
      page,
      { pageId: page.id, title: 'CAS Drift Page (v2)' } as any,
      authUser,
      { ifVersion: 1 },
    );

    const metaAfterFirst = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(metaAfterFirst.version).toBe(2);

    // A second write with the now-STALE ifVersion=1 must 409, atomically —
    // no read-then-write TOCTOU (the DoD assertion).
    await expect(
      serviceA.update(
        page,
        { pageId: page.id, title: 'CAS Drift Page (stale)' } as any,
        authUser,
        { ifVersion: 1 },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'VERSION_MISMATCH', serverVersion: 2 },
    });

    // The rejected write must not have advanced the version further.
    const metaAfterConflict = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(metaAfterConflict.version).toBe(2);
  });

  it('AC3: same (pageId,userId,key) across two replica instances applies content ONCE — no double-apply', async () => {
    const page = await createPage('Idempotent Dedup Page');

    // Two independent PageService instances (simulating two replicas),
    // each with its own IdempotencyStore, sharing the SAME Redis + same
    // Postgres — a genuine cross-replica race, not a single reused object.
    const serviceA = buildService(redisClientA);
    const serviceB = buildService(redisClientB);

    const idemKey = 'client-retry-key-1';

    const [resultA, resultB] = await Promise.all([
      serviceA.update(
        page,
        { pageId: page.id, title: 'Applied Once' } as any,
        authUser,
        { idempotencyKey: idemKey },
      ),
      serviceB.update(
        page,
        { pageId: page.id, title: 'Applied Once' } as any,
        authUser,
        { idempotencyKey: idemKey },
      ),
    ]);

    expect(resultA.id).toBe(page.id);
    expect(resultB.id).toBe(page.id);

    // Content applied ONCE: version advanced by exactly 1 (1 -> 2), not 2.
    const meta = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(meta.version).toBe(2);
  });

  it('AC5: a 409-rejected CAS write leaves the idempotency slot unclaimed — a subsequent valid write with the SAME key still applies', async () => {
    const page = await createPage('CAS-Before-Claim Page');
    const serviceA = buildService(redisClientA);
    const idemKey = 'cas-before-claim-key';

    // Bump the page to version 2 out from under a stale caller.
    await serviceA.update(
      page,
      { pageId: page.id, title: 'Bump to v2' } as any,
      authUser,
      { ifVersion: 1 },
    );

    // A stale ifVersion=1 write (with an idempotency key) must 409 WITHOUT
    // consuming the idempotency slot.
    await expect(
      serviceA.update(
        page,
        { pageId: page.id, title: 'Should 409' } as any,
        authUser,
        { ifVersion: 1, idempotencyKey: idemKey },
      ),
    ).rejects.toMatchObject({ status: 409 });

    // A subsequent VALID write reusing the SAME idempotency key must still
    // apply (the slot was never claimed by the rejected write).
    const result = await serviceA.update(
      page,
      { pageId: page.id, title: 'Applies Fine' } as any,
      authUser,
      { ifVersion: 2, idempotencyKey: idemKey },
    );
    expect(result.title).toBe('Applies Fine');

    const meta = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(meta.version).toBe(3);
  });

  it('AC4: Redis-down degrades to no-dedup — the write proceeds, never a 500', async () => {
    const page = await createPage('Redis-Down Page');
    // A "client" that always errors — simulates Redis being unavailable.
    const throwingClient = {
      set: async () => {
        throw new Error('ECONNREFUSED');
      },
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
    } as unknown as Redis;

    const serviceDegraded = buildService(throwingClient);

    const result = await serviceDegraded.update(
      page,
      { pageId: page.id, title: 'Still Applies' } as any,
      authUser,
      { idempotencyKey: 'irrelevant-key' },
    );

    expect(result.title).toBe('Still Applies');
  });
});
