/**
 * ENG-1447 F1 fix — REST provenance stamp atomicity.
 *
 * Adversarial review finding F1: `PageController.create`/`.update` used to
 * call `pageService.create/update(...)` (its own committed tx) and THEN
 * `provenanceService.markAiCreated(...)` with no `trx`, opening a real
 * committed window where the page row existed with `provenance_status =
 * null` — contradicting the ticket's NFR-freshness / Dev-Context §4e
 * "atomic with content, no lag window" invariant.
 *
 * The fix threads a single `db.transaction()` through both the
 * PageService.create/update DB write AND the provenance stamp. This spec
 * proves the ATOMICITY property directly against a real Postgres
 * (testcontainers, CS §5 — Postgres is not mocked): if the provenance write
 * fails, the content write in the SAME transaction rolls back too, and on
 * success both land together with no observable intermediate state.
 *
 * PageService/PageRepo/OrvexPageProvenanceService/OrvexAuditService are the
 * real production classes (CS §5f ❌#4 — never mock the unit under test).
 * Unused PageService side-channels (queues, storage, transclusion, watcher)
 * are inert stand-ins, following the established `page-move.integration-
 * spec.ts` convention — none of them are invoked on the code path under
 * test.
 *
 * ENG-1596 fix-pass note: this file, unmodified by ENG-1596, had drifted
 * from `PageService`'s constructor/`update()` signatures grown by later
 * tickets (ENG-1413's `casOpts` param, plus another ctor arg) — a pre-
 * existing base breakage unrelated to ENG-1596's diff, but blocking the PR's
 * `tsc -b` gate and (once compiling) silently defeating the "update:
 * failure path" rollback assertion (the stray `trx` landed in the
 * `casOpts` slot, so `update()` never received a transaction and committed
 * for real). Both call sites now pass `casOpts=undefined, trx` in the
 * correct positions.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PageService } from 'src/core/page/services/page.service';
import { OrvexPageProvenanceService } from 'src/core/page-provenance/orvex-page-provenance.service';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

describe('ENG-1447 F1 — REST provenance stamp is atomic with the content write', () => {
  let testDb: TestDb;
  let pageRepo: PageRepo;
  let pageService: PageService;
  let provenanceService: OrvexPageProvenanceService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let spaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const eventEmitter = new EventEmitter2();
    pageRepo = new PageRepo(
      testDb.db as any,
      {} as any,
      eventEmitter,
      new OutboxWriter(testDb.db as any),
      { emitInvalidate: () => {} } as any,
    );

    // create()/update() on this path never touch attachments, storage,
    // transclusion, or the async queues — inert stand-ins, per the
    // page-move.integration-spec.ts convention (CS §5: not mocking the
    // PageService unit under test).
    pageService = new PageService(
      pageRepo,
      {} as any, // pagePermissionRepo
      {} as any, // attachmentRepo
      testDb.db as any,
      {} as any, // storageService
      {} as any, // attachmentQueue
      {} as any, // aiQueue
      { add: async () => {} } as any, // generalQueue
      eventEmitter,
      {} as any, // collaborationGateway
      { addPageWatchers: async () => {} } as any, // watcherService
      {} as any, // transclusionService
      {} as any, // idempotencyStore — casOpts never passed on this path, so claim/record are never invoked
    );

    provenanceService = new OrvexPageProvenanceService(
      testDb.db as any,
      pageRepo,
      new OrvexAuditService(testDb.db as any),
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const otherWorkspace = await seedWorkspace(testDb.db);
    otherWorkspaceId = otherWorkspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function readProvenance(pageId: string) {
    return testDb.db
      .selectFrom('orvexPageMeta' as any)
      .select(['provenanceStatus' as any])
      .where('pageId' as any, '=', pageId)
      .executeTakeFirst();
  }

  it('create: happy path — content row and ai_produced stamp commit together in one transaction', async () => {
    const page = await testDb.db.transaction().execute(async (trx) => {
      const created = await pageService.create(
        userId,
        workspaceId,
        { spaceId, title: 'F1 create happy path' } as any,
        trx as any,
      );
      await provenanceService.markAiCreated(
        created.id,
        { userId: null, workspaceId, spaceId, isHuman: false },
        trx as any,
      );
      return created;
    });

    const persisted = await pageRepo.findById(page.id);
    expect(persisted).toBeDefined();
    const meta = await readProvenance(page.id);
    expect((meta as any)?.provenanceStatus).toBe('ai_produced');
  });

  it('create: failure path — a failing provenance stamp rolls back the just-inserted page row (no committed null-provenance window)', async () => {
    let insertedId: string | undefined;

    await expect(
      testDb.db.transaction().execute(async (trx) => {
        const created = await pageService.create(
          userId,
          workspaceId,
          { spaceId, title: 'F1 create rollback path' } as any,
          trx as any,
        );
        insertedId = created.id;

        // Force markAiCreated to fail INSIDE the same transaction by
        // asserting a workspace mismatch (loadPage throws NotFoundException)
        // — simulates any failure of the provenance write.
        await provenanceService.markAiCreated(
          created.id,
          { userId: null, workspaceId: otherWorkspaceId, spaceId, isHuman: false },
          trx as any,
        );
      }),
    ).rejects.toThrow();

    // Because both writes shared one transaction, the page insert rolled
    // back too — there is no row (let alone one with provenance_status =
    // null) left behind by the failed stamp.
    const persisted = await pageRepo.findById(insertedId!);
    expect(persisted).toBeUndefined();
  });

  it('update: happy path — the metadata write and ai_produced stamp commit together in one transaction', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null,
      title: 'F1 update happy path (before)',
    });

    const updated = await testDb.db.transaction().execute(async (trx) => {
      const result = await pageService.update(
        page as any,
        { pageId: page.id, title: 'F1 update happy path (after)' } as any,
        { id: userId } as any,
        undefined, // casOpts — this path opts out of CAS/idempotency
        trx as any,
      );
      await provenanceService.markAiCreated(
        result.id,
        { userId: null, workspaceId, spaceId, isHuman: false },
        trx as any,
      );
      return result;
    });

    expect(updated.title).toBe('F1 update happy path (after)');
    const persisted = await pageRepo.findById(page.id);
    expect((persisted as any).title).toBe('F1 update happy path (after)');
    const meta = await readProvenance(page.id);
    expect((meta as any)?.provenanceStatus).toBe('ai_produced');
  });

  it('update: failure path — a failing provenance stamp rolls back the title write (no committed null-provenance window)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null,
      title: 'F1 update rollback path (before)',
    });

    await expect(
      testDb.db.transaction().execute(async (trx) => {
        await pageService.update(
          page as any,
          { pageId: page.id, title: 'F1 update rollback path (after)' } as any,
          { id: userId } as any,
          undefined, // casOpts — this path opts out of CAS/idempotency
          trx as any,
        );

        await provenanceService.markAiCreated(
          page.id,
          { userId: null, workspaceId: otherWorkspaceId, spaceId, isHuman: false },
          trx as any,
        );
      }),
    ).rejects.toThrow();

    const persisted = await pageRepo.findById(page.id);
    expect((persisted as any).title).toBe('F1 update rollback path (before)');
    const meta = await readProvenance(page.id);
    expect((meta as any)?.provenanceStatus ?? null).toBeNull();
  });
});
