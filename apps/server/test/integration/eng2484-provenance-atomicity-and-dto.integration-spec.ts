// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2484 — named DoD gate: `TestAiProvenanceStampedAtomicRestAndCollab`.
 *
 * VERIFY + HARDEN for AC1/AC2/AC3 (the collab-path atomic AI-provenance
 * stamp shipped by ENG-1447/ENG-1603), genuine BUILD proof for AC4 (the
 * validated `markAiAuthored` DTO leg, which did not exist before this
 * ticket — pre-fix, `grep -rn markAiAuthored apps/server/src/core/page/dto/`
 * returned zero hits).
 *
 * Real classes only (CS §5, ❌#4): `CollaborationHandler`,
 * `PersistenceExtension`, `OrvexPageProvenanceService`, `OrvexAuditService`,
 * `PageRepo`, `PageService` are the production classes, driven against a
 * REAL testcontainers Postgres (`db-test-harness.ts`) and a REAL
 * `@hocuspocus/server` `Hocuspocus` instance (`openDirectConnection` /
 * `transact` — the exact machinery production uses). Inert stand-ins exist
 * ONLY for side-channels never on the code path under test (BullMQ queues,
 * redis-backed collab history, transclusion sync, watchers), per the
 * established `eng1447-provenance-atomicity.integration-spec.ts` /
 * `eng1369-page-history-restore-http.integration-spec.ts` convention. The
 * ONE substituted transport is the redis collab fan-out
 * (`CollaborationGateway.handleYjsEvent` → redisSync): the bridge here
 * dispatches the event DIRECTLY to the real
 * `CollaborationHandler.getHandlers()` handler — the same handler code runs,
 * no behaviour is faked.
 *
 * Assertions are on persisted row state (`pages.content`,
 * `orvex_page_meta.provenance_status` / `provenance_changed_at` /
 * `provenance_changed_by_id`) — never on internal symbol names, so an
 * internal rename of `markPendingAiAuthored`/`consumePendingAiAuthored`
 * cannot break this spec (CS §4.2). No `Date.now()`-keyed assertion decides
 * atomicity; the bounded poll below only WAITS for the debounced store, the
 * assertions themselves are pure row-state comparisons.
 */
import { Hocuspocus } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { execSync } from 'node:child_process';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { executeTx } from '@docmost/db/utils';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PageService } from 'src/core/page/services/page.service';
import { OrvexPageProvenanceService } from 'src/core/page-provenance/orvex-page-provenance.service';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { CollaborationHandler } from 'src/collaboration/collaboration.handler';
import { PersistenceExtension } from 'src/collaboration/extensions/persistence.extension';
import {
  stampBlockIds,
  tiptapExtensions,
} from 'src/collaboration/collaboration.util';
import { CreatePageDto } from 'src/core/page/dto/create-page.dto';
import { UpdatePageDto } from 'src/core/page/dto/update-page.dto';
import { UpsertPageDto } from 'src/core/page/dto/upsert-page.dto';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

jest.setTimeout(240_000);

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function doc(...blocks: any[]) {
  return { type: 'doc', content: blocks };
}

describe('TestAiProvenanceStampedAtomicRestAndCollab (ENG-2484)', () => {
  let testDb: TestDb;
  let db: any;
  let pageRepo: PageRepo;
  let provenanceService: OrvexPageProvenanceService;
  let persistenceExtension: PersistenceExtension;
  let hocuspocus: Hocuspocus;
  let pageService: PageService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let spaceId: string;
  let user: { id: string };

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db as any;

    const eventEmitter = new EventEmitter2();
    const outboxWriter = new OutboxWriter(db);
    pageRepo = new PageRepo(
      db,
      {} as any,
      eventEmitter,
      outboxWriter,
      { emitInvalidate: () => {} } as any,
    );

    provenanceService = new OrvexPageProvenanceService(
      db,
      pageRepo,
      new OrvexAuditService(db, new OutboxWriter(db)),
      outboxWriter,
    );

    const inertQueue = { add: async () => {} } as any;
    persistenceExtension = new PersistenceExtension(
      pageRepo,
      db,
      inertQueue, // aiQueue
      inertQueue, // historyQueue
      inertQueue, // notificationQueue
      { addContributors: async () => {} } as any, // collabHistory (redis) — no contributors tracked on direct connections
      {
        syncPageTransclusions: async () => ({ inserted: 0, updated: 0, deleted: 0 }),
        syncPageReferences: async () => ({ inserted: 0, deleted: 0 }),
      } as any, // transclusion sync — post-commit side channel, isolated by its own try/catch
      provenanceService,
    );

    hocuspocus = new Hocuspocus({
      extensions: [persistenceExtension as any],
    });

    const collabHandler = new CollaborationHandler(persistenceExtension);
    const handlers = collabHandler.getHandlers(hocuspocus);

    // The redis fan-out substitute: dispatches the yjs event DIRECTLY to the
    // real handler (identical payload contract) — the same production
    // handler + persistence extension code runs end-to-end.
    const collaborationGatewayBridge = {
      handleYjsEvent: (eventName: string, documentName: string, payload: any) =>
        (handlers as any)[eventName](documentName, payload),
    } as any;

    pageService = new PageService(
      pageRepo,
      {} as any, // pagePermissionRepo
      {} as any, // attachmentRepo
      db,
      {} as any, // storageService
      {} as any, // attachmentQueue
      {} as any, // aiQueue
      { add: async () => {} } as any, // generalQueue
      eventEmitter,
      collaborationGatewayBridge,
      { addPageWatchers: async () => {} } as any, // watcherService
      {} as any, // transclusionService
      {} as any, // idempotencyStore — no casOpts on this path
      {
        assertWithinQuota: async () => undefined,
        hasFeature: async () => true,
      } as any, // entitlementService — provenance, not F-QUOTA, is under test
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const otherWorkspace = await seedWorkspace(testDb.db);
    otherWorkspaceId = otherWorkspace.id;
    const seededUser = await seedUser(testDb.db, workspaceId);
    user = { id: seededUser.id };
    const space = await seedSpace(testDb.db, workspaceId, user.id);
    spaceId = space.id;
  }, 240_000);

  afterAll(async () => {
    hocuspocus?.closeConnections();
    await testDb?.teardown();
  });

  async function readProvenanceRow(pageId: string) {
    return db
      .selectFrom('orvexPageMeta')
      .select([
        'provenanceStatus',
        'provenanceChangedAt',
        'provenanceChangedById',
      ])
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  async function readContent(pageId: string) {
    const row = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', pageId)
      .executeTakeFirst();
    return row?.content ?? null;
  }

  /** Bounded wait for the debounced collab store — never an assertion. */
  async function waitFor(cond: () => Promise<boolean>, ms = 30_000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (await cond()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('condition not reached within bound');
  }

  function textOf(content: any): string[] {
    return (content?.content ?? []).map(
      (b: any) => b?.content?.[0]?.text ?? '',
    );
  }

  function marksOfBlock(content: any, i: number): string[] {
    const block = content?.content?.[i];
    return (block?.content ?? [])
      .flatMap((n: any) => n.marks ?? [])
      .map((m: any) => m.type);
  }

  it('AC1/AC3/AC4 — a REST write with the validated markAiAuthored DTO flag lands content + aiAuthored mark + orvex_page_meta provenance in the same debounced-store transaction', async () => {
    const initial = stampBlockIds(
      doc(paragraph('Untouched paragraph.'), paragraph('Original text.')),
    ).content;
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: null,
      title: 'ENG-2484 AC1 collab stamp',
      content: initial as any,
    });

    // Pre-state: no provenance row.
    expect(await readProvenanceRow(page.id)).toBeUndefined();

    const edited = stampBlockIds(
      doc(paragraph('Untouched paragraph.'), paragraph('AI EDITED text.')),
    ).content;

    // The REST seam under test: PageService.updatePageContent's new optional
    // 6th param (AC4 threading), through the real collab handler.
    await pageService.updatePageContent(
      page.id,
      edited as any,
      'replace',
      'json',
      user as any,
      true, // markAiAuthored
    );

    // Wait (bounded) for the debounced store to flush to Postgres.
    await waitFor(async () => {
      const content = await readContent(page.id);
      return textOf(content).includes('AI EDITED text.');
    });

    // A single fresh read shows content AND provenance TOGETHER — the
    // atomicity claim: they were written by one executeTx, so the moment
    // the content is visible the provenance stamp must be too.
    const content = await readContent(page.id);
    const provenance = await readProvenanceRow(page.id);

    expect(textOf(content)).toEqual([
      'Untouched paragraph.',
      'AI EDITED text.',
    ]);
    // The aiAuthored mark lands exactly on the AI-changed block (live-ydoc
    // marking, CollaborationHandler + markAiChangedBlocks).
    expect(marksOfBlock(content, 0)).not.toContain('aiAuthored');
    expect(marksOfBlock(content, 1)).toContain('aiAuthored');

    // The DB provenance stamp landed in the same store transaction.
    expect(provenance).toBeDefined();
    expect(provenance.provenanceStatus).toBe('ai_edited');
    expect(provenance.provenanceChangedAt).not.toBeNull();
    // System-attributed AI write: `provenanceChangedById` is the stamped
    // column and is NULL for AI edits (never a client-supplied id) — the
    // server derives attribution, a body flag cannot spoof a user id.
    expect(provenance.provenanceChangedById).toBeNull();
  });

  it('AC3 (negative) — a collab store with NO pending AI mark persists content but never stamps provenance', async () => {
    const initial = stampBlockIds(doc(paragraph('Human original.'))).content;
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: null,
      title: 'ENG-2484 AC3 unmarked',
      content: initial as any,
    });

    const edited = stampBlockIds(doc(paragraph('Human edited.'))).content;
    await pageService.updatePageContent(
      page.id,
      edited as any,
      'replace',
      'json',
      user as any,
      // markAiAuthored intentionally omitted (undefined).
    );

    await waitFor(async () => {
      const content = await readContent(page.id);
      return textOf(content).includes('Human edited.');
    });

    const content = await readContent(page.id);
    expect(marksOfBlock(content, 0)).not.toContain('aiAuthored');
    // No pending mark was set — the store must NOT stamp provenance.
    expect(await readProvenanceRow(page.id)).toBeUndefined();
  });

  it('AC2 — a mid-write failure inside the store transaction stamps neither content nor provenance (handler-level, genuine FK violation)', async () => {
    const initial = stampBlockIds(doc(paragraph('AC2 before.'))).content;
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: null,
      title: 'ENG-2484 AC2 rollback (handler)',
      content: initial as any,
    });

    const documentName = `page.${page.id}`;
    const edited = stampBlockIds(doc(paragraph('AC2 torn write.'))).content;

    // Flag the document as an AI edit, then force a genuine constraint
    // violation INSIDE the store transaction: `pages.last_updated_by_id`
    // carries a real FK to `users.id`, and the context user does not exist.
    persistenceExtension.markPendingAiAuthored(documentName);

    const ydoc: any = TiptapTransformer.toYdoc(
      edited,
      'default',
      tiptapExtensions,
    );
    ydoc.broadcastStateless = () => {};

    await persistenceExtension.onStoreDocument({
      documentName,
      document: ydoc,
      context: { user: { id: '00000000-0000-7000-8000-000000000000' } },
    } as any);

    // The transaction rolled back as one unit: neither the content nor the
    // provenance stamp is visible — no torn write, no after-the-fact stamp.
    const content = await readContent(page.id);
    expect(textOf(content)).toEqual(['AC2 before.']);
    expect(await readProvenanceRow(page.id)).toBeUndefined();
  });

  it('AC2 — a failing provenance stamp rolls the content write back too (same-primitive composition, eng1447 convention)', async () => {
    const initial = stampBlockIds(doc(paragraph('AC2b before.'))).content;
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: null,
      title: 'ENG-2484 AC2 rollback (primitive)',
      content: initial as any,
    });

    const edited = stampBlockIds(doc(paragraph('AC2b torn.'))).content;

    // The exact primitives `PersistenceExtension.onStoreDocument` composes,
    // in the same order, in one executeTx: content write, then provenance
    // stamp — with the stamp failing on a genuine cross-workspace mismatch.
    await expect(
      executeTx(db, async (trx: any) => {
        await pageRepo.updatePage({ content: edited as any }, page.id, trx);
        await provenanceService.applyAiEdit(
          page.id,
          initial,
          edited,
          {
            userId: null,
            workspaceId: otherWorkspaceId, // wrong workspace → loadPage throws
            spaceId,
            isHuman: false,
          },
          trx,
        );
      }),
    ).rejects.toThrow();

    const content = await readContent(page.id);
    expect(textOf(content)).toEqual(['AC2b before.']);
    expect(await readProvenanceRow(page.id)).toBeUndefined();
  });

  describe('AC4 — markAiAuthored is validated in-request on the page DTOs (the ENG-2484 build delta)', () => {
    // The exact pipe configuration `main.ts` installs globally.
    const pipe = new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    });

    async function runPipe(metatype: any, body: any) {
      return pipe.transform(body, { type: 'body', metatype });
    }

    it('accepts a boolean markAiAuthored on create/update/upsert DTOs and preserves it', async () => {
      const create = await runPipe(CreatePageDto, {
        spaceId: '2b1b57b2-31ec-4dcb-ae1f-0f2a6e37ac9b',
        markAiAuthored: true,
      });
      expect(create.markAiAuthored).toBe(true);

      const update = await runPipe(UpdatePageDto, {
        pageId: 'some-page',
        markAiAuthored: false,
      });
      expect(update.markAiAuthored).toBe(false);

      const upsert = await runPipe(UpsertPageDto, {
        slugId: 'slug-1',
        markAiAuthored: true,
      });
      expect(upsert.markAiAuthored).toBe(true);
    });

    it('rejects a malformed (non-boolean) markAiAuthored BEFORE any write reaches PageService', async () => {
      await expect(
        runPipe(UpdatePageDto, { pageId: 'p', markAiAuthored: 'yes' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        runPipe(CreatePageDto, {
          spaceId: '2b1b57b2-31ec-4dcb-ae1f-0f2a6e37ac9b',
          markAiAuthored: 1,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        runPipe(UpsertPageDto, { slugId: 's', markAiAuthored: 'true' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('whitelists: an undeclared sibling field is stripped, proving the declared field is genuinely carried by the DTO (not passing via whitelist-off)', async () => {
      const update = await runPipe(UpdatePageDto, {
        pageId: 'p',
        markAiAuthored: true,
        markAiAuthoredX: true, // not a DTO field — must be stripped
      });
      expect(update.markAiAuthored).toBe(true);
      expect((update as any).markAiAuthoredX).toBeUndefined();
    });

    it('forwards the DTO flag through PageService.update into the collab payload (thread-through proof on the real service)', async () => {
      const initial = stampBlockIds(doc(paragraph('DTO fwd before.'))).content;
      const page = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: user.id,
        position: null,
        title: 'ENG-2484 AC4 forward',
        content: initial as any,
      });

      const edited = stampBlockIds(doc(paragraph('DTO fwd AI text.'))).content;
      const dto = await runPipe(UpdatePageDto, {
        pageId: page.id,
        content: edited,
        operation: 'replace',
        format: 'json',
        markAiAuthored: true,
      });

      await pageService.update(page as any, dto, user as any, undefined);

      await waitFor(async () => {
        const content = await readContent(page.id);
        return textOf(content).includes('DTO fwd AI text.');
      });

      // The validated DTO flag reached the collab funnel: block marked AND
      // provenance stamped — the full REST leg of the DoD gate.
      const content = await readContent(page.id);
      expect(marksOfBlock(content, 0)).toContain('aiAuthored');
      const provenance = await readProvenanceRow(page.id);
      expect(provenance?.provenanceStatus).toBe('ai_edited');
    });
  });

  it('AC5 (negative) — no provenance-inference/attribution composition lives in the engine', () => {
    const out = execSync(
      `grep -rn "modelName\\|inferAuthor\\|attributionSummary" apps/server/src/core/page-provenance/ apps/server/src/collaboration/ || true`,
      { cwd: `${__dirname}/../../../..`, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});
