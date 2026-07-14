import { PageService } from './page.service';

/**
 * Cold-page edit self-deadlock fix (engine-side connection resolution,
 * 2026-07-13).
 *
 * Root cause: `PageService.update()` used to write the plain-field columns
 * (title/icon/etc, via `pageRepo.updatePage(..., trx)` inside the caller's
 * still-open request transaction) BEFORE triggering the collaboration/
 * Hocuspocus content persist path (`updatePageContent` ->
 * `CollaborationGateway.handleYjsEvent` -> ... ->
 * `PersistenceExtension.onStoreDocument`). That persist step always opens
 * its OWN independent DB transaction and takes a `SELECT ... FOR UPDATE` on
 * the exact same page row — which blocks forever on the row lock the
 * caller's still-open outer transaction is holding, because that outer
 * transaction is itself awaiting this very call to finish. Reproduced
 * 100% of the time on every REST edit that included content, regardless of
 * whether the page was "cold" or "warm" in the collab layer.
 *
 * The fix reorders the two writes: the content update now runs BEFORE the
 * plain-field `pageRepo.updatePage` call, so the collab layer's independent
 * transaction acquires and releases its own lock on the row before the
 * outer transaction ever touches it — no contention, no hang.
 *
 * This spec proves the ordering directly (a full DB-lock repro belongs in
 * an integration/e2e test — see `LIVE-VERIFY` in the fix write-up), which
 * is the exact mechanism the fix relies on: if this regresses, the same
 * self-deadlock returns.
 */
describe('PageService.update — content-write-before-metadata-write ordering', () => {
  function buildService(callOrder: string[]) {
    const page = {
      id: 'page-1',
      workspaceId: 'ws-1',
      spaceId: 'space-1',
      contributorIds: [],
      creatorId: 'user-1',
      updatedAt: new Date(),
    } as any;

    const pageRepo = {
      updatePage: jest.fn(async () => {
        callOrder.push('pageRepo.updatePage');
      }),
      findById: jest.fn(async () => page),
      getPageMeta: jest.fn(async () => undefined),
      bumpMeta: jest.fn(async () => undefined),
      casIncrementMeta: jest.fn(async () => true),
    };

    const collaborationGateway = {
      handleYjsEvent: jest.fn(async () => {
        callOrder.push('collaborationGateway.handleYjsEvent');
      }),
    };

    const generalQueue = {
      add: jest.fn(async () => undefined),
    };

    const idempotencyStore = {
      record: jest.fn(async () => undefined),
    };

    const service = new (PageService as any)(
      pageRepo, // pageRepo
      undefined, // pagePermissionRepo
      undefined, // attachmentRepo
      undefined, // db
      undefined, // storageService
      undefined, // attachmentQueue
      undefined, // aiQueue
      generalQueue, // generalQueue
      undefined, // eventEmitter
      collaborationGateway, // collaborationGateway
      undefined, // watcherService
      undefined, // transclusionService
      idempotencyStore, // idempotencyStore
      undefined, // entitlementService
    ) as PageService;

    return { service, page, pageRepo, collaborationGateway };
  }

  it('persists content via the collab layer BEFORE writing plain-field metadata on the same row', async () => {
    const callOrder: string[] = [];
    const { service, page } = buildService(callOrder);

    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    };

    await service.update(
      page,
      {
        pageId: page.id,
        title: 'New title',
        content: doc,
        operation: 'replace',
        format: 'json',
      } as any,
      { id: 'user-1' } as any,
    );

    expect(callOrder).toEqual([
      'collaborationGateway.handleYjsEvent',
      'pageRepo.updatePage',
    ]);
  });

  it('never touches the collab layer when no content is present (metadata-only edit)', async () => {
    const callOrder: string[] = [];
    const { service, page, collaborationGateway, pageRepo } = buildService(
      callOrder,
    );

    await service.update(
      page,
      { pageId: page.id, title: 'Just a rename' } as any,
      { id: 'user-1' } as any,
    );

    expect(collaborationGateway.handleYjsEvent).not.toHaveBeenCalled();
    expect(pageRepo.updatePage).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['pageRepo.updatePage']);
  });
});
