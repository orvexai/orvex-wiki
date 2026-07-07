import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { PersistenceExtension } from '../extensions/persistence.extension';
import { tiptapExtensions } from '../collaboration.util';
import type { onStoreDocumentPayload } from '@hocuspocus/server';

/**
 * ENG-1469 — `PhantomKeyViewDoesNotBumpUpdatedAt`, the named binary DoD gate,
 * plus the companion AC2 regression proving a genuine edit is still
 * persisted.
 *
 * Real Yjs pipeline (CS §5 4f / ❌#4): `TiptapTransformer.toYdoc` /
 * `fromYdoc` and `yjs` itself are used unmocked — reproducing the genuine
 * phantom-key round-trip is the entire point of this test; a mocked
 * transformer would defeat it. `PageRepo` / the BullMQ queues / the
 * transaction db / `CollabHistoryService` / `TransclusionService` are the
 * owned collaboration-module boundary — spied via plain doubles (never the
 * subject under test) to observe the persistence *effect* (call / no-call),
 * never an internal call-count of `stripUndefinedDeep` itself.
 */
describe('PersistenceExtension.onStoreDocument', () => {
  const documentName = 'workspace-1.page-1';
  const pageId = 'page-1';

  function buildExtension(pageRow: any) {
    const updatePage = jest.fn();
    const findById = jest.fn().mockResolvedValue(pageRow);

    const pageRepo: any = { findById, updatePage };

    const db: any = {
      transaction: () => ({
        execute: (cb: (trx: any) => Promise<any>) => cb({} as any),
      }),
    };

    const aiQueue: any = { add: jest.fn() };
    const historyQueue: any = { add: jest.fn() };
    const notificationQueue: any = { add: jest.fn() };
    const collabHistory: any = { addContributors: jest.fn() };
    const transclusionService: any = {
      syncPageTransclusions: jest.fn().mockResolvedValue(undefined),
      syncPageReferences: jest.fn().mockResolvedValue(undefined),
    };

    const extension = new PersistenceExtension(
      pageRepo,
      db,
      aiQueue,
      historyQueue,
      notificationQueue,
      collabHistory,
      transclusionService,
    );

    return { extension, pageRepo, updatePage, findById };
  }

  /**
   * The authored source for an excalidraw embed node, BEFORE it has ever
   * been through the Yjs round-trip. `title` / `alt` / `attachmentId` are
   * declared `default: undefined` in `packages/editor-ext/src/lib/excalidraw.ts`.
   */
  function authoredExcalidrawJson() {
    return {
      type: 'doc',
      content: [
        {
          type: 'excalidraw',
          attrs: {
            src: 'attachments/scene.excalidraw',
            width: 400,
            height: 300,
            align: 'center',
          },
        },
      ],
    };
  }

  /**
   * What `page.content` genuinely looks like once read back from Postgres
   * JSONB: the authored doc has already been through one real
   * `toYdoc -> fromYdoc` save (exactly what `onStoreDocument` does), and the
   * JSON round-trip below stands in for Postgres JSONB silently dropping
   * `undefined`-valued keys on write (JSON.stringify does the same thing) —
   * this is the literal object the DB read returns, phantom keys and all
   * discrepancies already resolved by that first real save.
   */
  function persistedExcalidrawPageJson() {
    const authored = authoredExcalidrawJson();
    const ydoc = TiptapTransformer.toYdoc(authored, 'default', tiptapExtensions);
    const saved = TiptapTransformer.fromYdoc(ydoc, 'default');
    return JSON.parse(JSON.stringify(saved));
  }

  it('genuinely reproduces the phantom undefined-key on the real Yjs round-trip (test self-check)', () => {
    const pageContent = persistedExcalidrawPageJson();

    // Loading that persisted content back into a fresh Yjs doc (exactly
    // what onLoadDocument does) and reading it back out again reproduces
    // the phantom `{title: undefined}` own-key — genuinely present on the
    // Yjs side...
    const viewYdoc = TiptapTransformer.toYdoc(pageContent, 'default', tiptapExtensions);
    const roundTripped = TiptapTransformer.fromYdoc(viewYdoc, 'default') as any;

    const attrs = roundTripped.content[0].attrs;
    expect(Object.prototype.hasOwnProperty.call(attrs, 'title')).toBe(true);
    expect(attrs.title).toBeUndefined();
    // ...but absent from the JSONB side, which is why a bare isDeepStrictEqual lies.
    expect(
      Object.prototype.hasOwnProperty.call(pageContent.content[0].attrs, 'title'),
    ).toBe(false);
  });

  it('PhantomKeyViewDoesNotBumpUpdatedAt — a pure view of an embed-bearing page is a no-op', async () => {
    const pageContent = persistedExcalidrawPageJson();

    // Build the Yjs doc the same way the real onLoadDocument path does
    // (JSON -> Ydoc), then round-trip it back out exactly as onStoreDocument
    // does on every save — including a pure view/load with no human edit.
    const ydoc: any = TiptapTransformer.toYdoc(pageContent, 'default', tiptapExtensions);
    ydoc.broadcastStateless = jest.fn();

    const pageRow = {
      id: pageId,
      slugId: 'slug-1',
      workspaceId: 'workspace-1',
      spaceId: 'space-1',
      creatorId: 'user-1',
      contributorIds: [],
      content: pageContent,
      createdAt: new Date().toISOString(),
      updatedAt: '2020-01-01T00:00:00.000Z',
      version: 1,
      lastUpdatedById: null,
    };

    const { extension, updatePage } = buildExtension(pageRow);

    const payload = {
      documentName,
      document: ydoc,
      context: { user: { id: 'user-1' } },
    } as unknown as onStoreDocumentPayload;

    await extension.onStoreDocument(payload);

    expect(updatePage).toHaveBeenCalledTimes(0);
    expect(ydoc.broadcastStateless).not.toHaveBeenCalled();
    expect(pageRow.updatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(pageRow.version).toBe(1);
    expect(pageRow.lastUpdatedById).toBeNull();
  });

  it('AC2 — a genuine content edit is still persisted', async () => {
    const pageContent = persistedExcalidrawPageJson();
    const ydoc = TiptapTransformer.toYdoc(pageContent, 'default', tiptapExtensions);

    // Apply a real edit on the Yjs side: change the excalidraw src (a
    // defined-value change), simulating an actual user edit.
    const editedJson = TiptapTransformer.fromYdoc(ydoc, 'default') as any;
    editedJson.content[0].attrs.src = 'attachments/scene-edited.excalidraw';
    const editedYdoc: any = TiptapTransformer.toYdoc(editedJson, 'default', tiptapExtensions);
    editedYdoc.broadcastStateless = jest.fn();

    const pageRow = {
      id: pageId,
      slugId: 'slug-1',
      workspaceId: 'workspace-1',
      spaceId: 'space-1',
      creatorId: 'user-1',
      contributorIds: [],
      content: pageContent,
      createdAt: new Date().toISOString(),
    };

    const { extension, updatePage } = buildExtension(pageRow);

    const payload = {
      documentName,
      document: editedYdoc,
      context: { user: { id: 'user-1' } },
    } as unknown as onStoreDocumentPayload;

    await extension.onStoreDocument(payload);

    expect(updatePage).toHaveBeenCalledTimes(1);
    const [content] = updatePage.mock.calls[0];
    expect(content.content.content[0].attrs.src).toBe(
      'attachments/scene-edited.excalidraw',
    );
  });
});
