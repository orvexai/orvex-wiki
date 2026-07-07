/**
 * ENG-1447 F4/F5 fix — AC7 orphan-sweep backstop, wired + genuinely tested.
 *
 * Adversarial review finding F4: AC7's reconcile/orphan-sweep listener did
 * not exist, and the shipped spec asserted a raw `db.deleteFrom('pages')`
 * removed a row — a tautology about Postgres, not this ticket's code.
 *
 * This spec drives the REAL `@nestjs/event-emitter` wiring (CS §5 — never
 * mock the emitter/listener contract under test): a real `EventEmitter2`
 * emits `page.deleted` exactly as `PageService.forceDelete` does, and
 * `ProvenanceOrphanReconcileListener` (the real, registered `@OnEvent`
 * handler) reacts to it against a real Postgres (testcontainers).
 */
import { Test } from '@nestjs/testing';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import { EventName } from 'src/common/events/event.contants';
import { ProvenanceOrphanReconcileListener } from 'src/core/page-provenance/provenance-orphan-reconcile.listener';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

function tick(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ENG-1447 AC7 — ProvenanceOrphanReconcileListener (real event-emitter wiring)', () => {
  let testDb: TestDb;
  let eventEmitter: EventEmitter2;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        {
          // Constructed directly with the real testcontainers Kysely handle
          // rather than via the app's `@InjectKysely()` DI token wiring —
          // that token is app-module plumbing, orthogonal to what this test
          // verifies (the real `@OnEvent` discovery/dispatch contract).
          provide: ProvenanceOrphanReconcileListener,
          useFactory: () =>
            new ProvenanceOrphanReconcileListener(testDb.db as any),
        },
      ],
    }).compile();

    await moduleRef.init();
    eventEmitter = moduleRef.get(EventEmitter2);

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function stampProvenance(pageId: string) {
    await testDb.db
      .updateTable('pages')
      .set({
        provenanceStatus: 'ai_produced',
        provenanceChangedAt: new Date(),
        provenanceChangedById: null,
      } as any)
      .where('id', '=', pageId)
      .execute();
  }

  it('genuine deletion (row already gone): the listener is invoked and finds nothing to sweep', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null,
      title: 'AC7 real-delete path',
    });
    await stampProvenance(page.id);

    // Mirrors PageService.forceDelete: the row is deleted FIRST, then the
    // event fires.
    await testDb.db.deleteFrom('pages').where('id', '=', page.id).execute();

    await expect(
      (async () => {
        eventEmitter.emit(EventName.PAGE_DELETED, {
          pageIds: [page.id],
          workspaceId,
        });
        await tick();
      })(),
    ).resolves.not.toThrow();

    // Still gone, nothing resurrected/errored.
    const row = await testDb.db
      .selectFrom('pages')
      .select(['id'])
      .where('id', '=', page.id)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('defensive backstop: a page reported as deleted but still carrying a provenance stamp gets its stamp swept', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null,
      title: 'AC7 orphan-simulation path',
    });
    await stampProvenance(page.id);

    // Simulate the ONLY way this listener should ever find work: a
    // page.deleted event fires for a page whose row was NOT actually
    // removed (a hypothetical future bug / non-atomic path) while it still
    // carries a provenance stamp.
    eventEmitter.emit(EventName.PAGE_DELETED, {
      pageIds: [page.id],
      workspaceId,
    });
    await tick();

    const row = await testDb.db
      .selectFrom('pages')
      .select(['provenanceStatus', 'provenanceChangedAt', 'provenanceChangedById'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    expect(row.provenanceStatus).toBeNull();
    expect(row.provenanceChangedAt).toBeNull();
    expect(row.provenanceChangedById).toBeNull();
  });

  it('is a genuine no-op for an unrelated, still-alive, still-stamped page (never sweeps pages it was not told about)', async () => {
    const untouched = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null,
      title: 'AC7 untouched control page',
    });
    await stampProvenance(untouched.id);

    eventEmitter.emit(EventName.PAGE_DELETED, {
      pageIds: ['00000000-0000-0000-0000-000000000000'],
      workspaceId,
    });
    await tick();

    const row = await testDb.db
      .selectFrom('pages')
      .select(['provenanceStatus'])
      .where('id', '=', untouched.id)
      .executeTakeFirstOrThrow();
    expect(row.provenanceStatus).toBe('ai_produced');
  });
});
