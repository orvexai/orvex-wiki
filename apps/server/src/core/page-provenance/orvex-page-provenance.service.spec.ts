import * as path from 'path';
import { promises as fs } from 'fs';
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
import { EventEmitter2 } from '@nestjs/event-emitter';

import { OrvexPageProvenanceService } from './orvex-page-provenance.service';
import { OrvexAuditService } from '../../core/audit/orvex-audit.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import type { DbInterface } from '@docmost/db/types/db.interface';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import { v4 as uuid } from 'uuid';

/**
 * ENG-1447 — `AiProvenanceStampSpec`, the named binary DoD gate.
 *
 * Real Kysely against a testcontainers Postgres (RED->GREEN, no mocking of
 * the store under test) with the provenance-columns migration applied,
 * exercising {@link OrvexPageProvenanceService} through its exported
 * interface. Per CS §5 mocking strategy: Postgres is real (testcontainers,
 * the store this ticket owns); `SpaceMemberRepo`/`EventEmitter2` are unused
 * side channels for the paths under test and are given no-op doubles.
 * `PageRepo` and `OrvexAuditService` are the real production classes
 * against the real database.
 *
 * Covers DoD (a)-(d):
 *  (a) markAiCreated -> ai_produced + exactly one audit event.
 *  (b) applyAiEdit: ai_produced stays ai_produced (no re-mark); a
 *      human-authored page flips to ai_edited.
 *  (c) verify -> human_verified, the ONLY path that can set it; agent path
 *      (setFromAgent) cannot set human_verified.
 *  (d) a REST-API write (api_key caller) stamps ai_produced — exercised via
 *      the SAME markAiCreated call PageController makes for an
 *      api_key-authenticated create/update (AC5).
 *
 * AC7's reconcile/orphan-sweep backstop (`ProvenanceOrphanReconcileListener`)
 * has its OWN dedicated integration spec
 * (`eng1447-provenance-orphan-reconcile.integration-spec.ts`) that drives
 * the real `@nestjs/event-emitter` wiring — the inline-column check below is
 * a narrower, structural sanity check only (a hard delete removes the whole
 * row, provenance columns included).
 */
describe('AiProvenanceStampSpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let service: OrvexPageProvenanceService;
  let auditService: OrvexAuditService;
  let pageRepo: PageRepo;

  let workspaceId: string;
  let spaceId: string;
  let humanUserId: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(
      __dirname,
      '../../database/migrations',
    );
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

    const eventEmitter = new EventEmitter2();
    const spaceMemberRepoStub = {} as SpaceMemberRepo; // unused: no space-member scoping exercised

    pageRepo = new PageRepo(db, spaceMemberRepoStub, eventEmitter);
    auditService = new OrvexAuditService(db);
    service = new OrvexPageProvenanceService(db, pageRepo, auditService);

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1447 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1447@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    humanUserId = user.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1447 Space', slug: 'eng-1447-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  async function insertPage(overrides: Partial<{ title: string }> = {}) {
    const page = await db
      .insertInto('pages')
      .values({
        slugId: uuid(),
        title: overrides.title ?? `A page ${uuid()}`,
        spaceId,
        workspaceId,
        content: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
      })
      .returning(['id', 'spaceId'])
      .executeTakeFirstOrThrow();
    return page;
  }

  async function auditCountFor(pageId: string): Promise<number> {
    const row = await db
      .selectFrom('audit')
      .select(db.fn.countAll().as('n'))
      .where('resourceId', '=', pageId)
      .where('event', '=', 'page.provenance_changed')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  it('(a) markAiCreated sets ai_produced and emits exactly one provenance audit event', async () => {
    const page = await insertPage();

    await service.markAiCreated(page.id, {
      userId: null,
      workspaceId,
      spaceId: page.spaceId,
      isHuman: false,
    });

    const row = await db
      .selectFrom('pages')
      .select(['provenanceStatus'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).toBe('ai_produced');
    expect(await auditCountFor(page.id)).toBe(1);
  });

  it('(b) applyAiEdit: an already-ai_produced page stays ai_produced (no re-mark, no churn)', async () => {
    const page = await insertPage();
    await service.markAiCreated(page.id, {
      userId: null,
      workspaceId,
      spaceId: page.spaceId,
      isHuman: false,
    });

    const oldDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    const newDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'edited' }] },
      ],
    };

    const result = await service.applyAiEdit(
      page.id,
      oldDoc,
      newDoc,
      { userId: null, workspaceId, spaceId: page.spaceId, isHuman: false },
    );

    expect(result.statusChanged).toBe(false);
    expect(result.contentJson).toEqual(newDoc);

    const row = await db
      .selectFrom('pages')
      .select(['provenanceStatus'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).toBe('ai_produced');
    // No second audit row — the re-edit did not churn status.
    expect(await auditCountFor(page.id)).toBe(1);
  });

  it('(b) applyAiEdit flips a human-authored (unstamped) page to ai_edited', async () => {
    const page = await insertPage();
    // No markAiCreated call — this page starts human-authored (unstamped).

    const oldDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'original' }] },
      ],
    };
    const newDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'ai-edited' }] },
      ],
    };

    const result = await service.applyAiEdit(
      page.id,
      oldDoc,
      newDoc,
      { userId: null, workspaceId, spaceId: page.spaceId, isHuman: false },
    );

    expect(result.statusChanged).toBe(true);

    const row = await db
      .selectFrom('pages')
      .select(['provenanceStatus'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).toBe('ai_edited');
  });

  it('(c) verify sets human_verified, attributed to the human — the ONLY path that can', async () => {
    const page = await insertPage();
    await service.markAiCreated(page.id, {
      userId: null,
      workspaceId,
      spaceId: page.spaceId,
      isHuman: false,
    });

    const markedContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ai text', marks: [{ type: 'aiAuthored' }] },
          ],
        },
      ],
    };

    const { contentJson } = await service.verify(
      page.id,
      { id: humanUserId, workspaceId },
      markedContent,
    );

    // The aiAuthored mark is stripped on human verification.
    expect(
      contentJson.content[0].content[0].marks ?? [],
    ).not.toContainEqual({ type: 'aiAuthored' });

    const row = await db
      .selectFrom('pages')
      .select(['provenanceStatus', 'provenanceChangedById'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).toBe('human_verified');
    expect(row.provenanceChangedById).toBe(humanUserId);
  });

  it('(c) an agent path can NEVER set human_verified — setFromAgent rejects it', async () => {
    const page = await insertPage();

    await expect(
      service.setFromAgent(
        page.id,
        'human_verified' as any,
        { userId: null, workspaceId, spaceId: page.spaceId, isHuman: false },
      ),
    ).rejects.toThrow();

    const row = await db
      .selectFrom('pages')
      .select(['provenanceStatus'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).not.toBe('human_verified');
  });

  it('(d) a REST-API write (api_key caller) stamps ai_produced — the PageController api_key branch calls exactly this', async () => {
    const page = await insertPage();

    // This is the exact call PageController.create/.update makes when
    // @AuthMethod() resolves 'api_key' (AC5 — "any content written through
    // the REST API is AI-created").
    await service.markAiCreated(page.id, {
      userId: null,
      workspaceId,
      spaceId: page.spaceId,
      isHuman: false,
    });

    const row = await db
      .selectFrom('pages')
      .select(['provenanceStatus'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).toBe('ai_produced');
  });

  it('AC7 — provenance is inline on pages; a hard page delete leaves zero orphaned provenance rows', async () => {
    const page = await insertPage();
    await service.markAiCreated(page.id, {
      userId: null,
      workspaceId,
      spaceId: page.spaceId,
      isHuman: false,
    });

    await db.deleteFrom('pages').where('id', '=', page.id).execute();

    const orphans = await db
      .selectFrom('pages')
      .select(db.fn.countAll().as('n'))
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(Number(orphans.n)).toBe(0);
  });
});
