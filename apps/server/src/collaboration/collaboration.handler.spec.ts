import { Hocuspocus } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { CollaborationHandler } from './collaboration.handler';

/**
 * A direct-connection `transact()` + `disconnect()` cycle destroys the
 * in-memory Y.Doc once its connection count hits zero (real Hocuspocus
 * behavior — see `unloadDocument`/`DirectConnection.disconnect` in
 * `@hocuspocus/server`), exactly like production, where the REAL
 * `PersistenceExtension` reloads it from Postgres on the next connection.
 * This is a minimal in-memory stand-in for that persistence boundary (never
 * a mock of the handler/Yjs logic under test) so this spec can drive
 * multiple sequential `updatePageContent` calls, like a real editing
 * session, without standing up Postgres for a test that is about the
 * marking diff, not about persistence.
 */
class InMemoryPersistence {
  private readonly store = new Map<string, Uint8Array>();

  async onLoadDocument({ documentName, document }: any) {
    const state = this.store.get(documentName);
    if (state) Y.applyUpdate(document, state);
  }

  async onStoreDocument({ documentName, document }: any) {
    this.store.set(documentName, Y.encodeStateAsUpdate(document));
  }
}

/**
 * ENG-1447 F3 — AC4 collab-handler `markAiAuthored` coverage.
 *
 * Adversarial review finding F3: no test exercised
 * `CollaborationHandler.getHandlers(...).updatePageContent` with
 * `markAiAuthored: true` — the fromYdoc/toYdoc round-trip + in-transaction
 * block marking was verified only indirectly through the pure
 * `provenance-content.util` unit tests, never through the handler itself.
 *
 * This spec drives the REAL handler against a REAL (in-memory) Hocuspocus
 * server + Yjs document (CS §5 — Yjs/Hocuspocus are not true externals;
 * `openDirectConnection`/`transact` is the exact machinery production code
 * uses, no network, no persistence extension needed). Nothing here is
 * mocked except the constant document name.
 */
describe('CollaborationHandler.updatePageContent — AC4 markAiAuthored', () => {
  let hocuspocus: Hocuspocus;
  let handler: CollaborationHandler;
  let handlers: ReturnType<CollaborationHandler['getHandlers']>;
  const documentName = 'eng1447-handler-spec-doc';
  const user = { id: 'user-1' } as any;

  beforeAll(() => {
    hocuspocus = new Hocuspocus({
      unloadImmediately: false,
      extensions: [new InMemoryPersistence() as any],
    });
    handler = new CollaborationHandler();
    handlers = handler.getHandlers(hocuspocus);
  });

  afterAll(() => {
    hocuspocus.closeConnections();
  });

  function paragraph(text: string) {
    return { type: 'paragraph', content: [{ type: 'text', text }] };
  }

  async function readCurrentDoc(): Promise<any> {
    const connection = await hocuspocus.openDirectConnection(documentName);
    let json: any;
    try {
      await connection.transact((doc) => {
        json = TiptapTransformer.fromYdoc(doc, 'default');
      });
    } finally {
      await connection.disconnect();
    }
    return json;
  }

  function marksOf(docJson: any, blockIndex: number): string[] {
    const block = docJson.content[blockIndex];
    return (block.content ?? [])
      .flatMap((n: any) => n.marks ?? [])
      .map((m: any) => m.type);
  }

  it('marks exactly the AI-changed top-level block and leaves the untouched block unmarked', async () => {
    // Seed initial (human-authored) content — no marking.
    const initialDoc = {
      type: 'doc',
      content: [
        paragraph('First paragraph stays the same.'),
        paragraph('Second paragraph original text.'),
      ],
    };
    await handlers.updatePageContent(documentName, {
      prosemirrorJson: initialDoc,
      operation: 'replace',
      user,
    });

    // Real production behavior would round-trip through prosemirrorJson
    // built server-side (identical shape) before diffing; confirm the seed
    // landed as expected before exercising the AI-marking branch.
    const seeded = await readCurrentDoc();
    expect(seeded.content).toHaveLength(2);
    expect(marksOf(seeded, 0)).not.toContain('aiAuthored');
    expect(marksOf(seeded, 1)).not.toContain('aiAuthored');

    // Apply an AI edit to only the second paragraph, with markAiAuthored.
    const editedDoc = {
      type: 'doc',
      content: [
        paragraph('First paragraph stays the same.'),
        paragraph('Second paragraph AI EDITED text.'),
      ],
    };
    await handlers.updatePageContent(documentName, {
      prosemirrorJson: editedDoc,
      operation: 'replace',
      user,
      markAiAuthored: true,
    });

    const result = await readCurrentDoc();

    // The content edit itself landed (never lost, even with marking active).
    expect(result.content[1].content[0].text).toBe(
      'Second paragraph AI EDITED text.',
    );

    // Exactly the changed block carries the mark; the untouched block does
    // not — this is the handler-level (not just util-level) proof of AC4.
    expect(marksOf(result, 0)).not.toContain('aiAuthored');
    expect(marksOf(result, 1)).toContain('aiAuthored');
  });

  it('markAiAuthored:false/undefined never adds the mark (default collab edits stay unmarked)', async () => {
    const otherDocumentName = 'eng1447-handler-spec-doc-unmarked';
    const otherHandlers = new CollaborationHandler().getHandlers(hocuspocus);

    const initialDoc = {
      type: 'doc',
      content: [paragraph('Original.')],
    };
    await otherHandlers.updatePageContent(otherDocumentName, {
      prosemirrorJson: initialDoc,
      operation: 'replace',
      user,
    });

    const editedDoc = {
      type: 'doc',
      content: [paragraph('Edited by a human, not AI.')],
    };
    await otherHandlers.updatePageContent(otherDocumentName, {
      prosemirrorJson: editedDoc,
      operation: 'replace',
      user,
      // markAiAuthored intentionally omitted.
    });

    const connection = await hocuspocus.openDirectConnection(
      otherDocumentName,
    );
    let json: any;
    try {
      await connection.transact((doc) => {
        json = TiptapTransformer.fromYdoc(doc, 'default');
      });
    } finally {
      await connection.disconnect();
    }

    expect(json.content[0].content[0].text).toBe(
      'Edited by a human, not AI.',
    );
    expect(marksOf(json, 0)).not.toContain('aiAuthored');
  });
});
