import { Injectable, Logger } from '@nestjs/common';
import { Hocuspocus, Document } from '@hocuspocus/server';
import { TiptapTransformer } from '@hocuspocus/transformer';
import {
  prosemirrorNodeToYElement,
  tiptapExtensions,
} from './collaboration.util';
import { setYjsMark, updateYjsMarkAttribute, YjsSelection } from './yjs.util';
import * as Y from 'yjs';
import { User } from '@docmost/db/types/entity.types';
import { markAiChangedBlocks } from '../core/page-provenance/provenance-content.util';
import { PersistenceExtension } from './extensions/persistence.extension';

export type CollabEventHandlers = ReturnType<
  CollaborationHandler['getHandlers']
>;

@Injectable()
export class CollaborationHandler {
  private readonly logger = new Logger(CollaborationHandler.name);

  constructor(private readonly persistenceExtension: PersistenceExtension) {}

  getHandlers(hocuspocus: Hocuspocus) {
    return {
      alterState: async (documentName: string, payload: { pageId: string }) => {
        // dummy
        // this.logger.log('Processing', documentName, payload);
        // await this.withYdocConnection(hocuspocus, documentName, {}, (doc) => {
        //   const fragment = doc.getXmlFragment('default');
        //});
      },
      setCommentMark: async (
        documentName: string,
        payload: {
          yjsSelection: YjsSelection;
          commentId: string;
          resolved: boolean;
          user: User;
        },
      ) => {
        const { yjsSelection, commentId, resolved, user } = payload;
        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user },
          (doc) => {
            const fragment = doc.getXmlFragment('default');
            setYjsMark(doc, fragment, yjsSelection, 'comment', {
              commentId,
              resolved,
            });
          },
        );
      },
      resolveCommentMark: async (
        documentName: string,
        payload: {
          commentId: string;
          resolved: boolean;
          user: User;
        },
      ) => {
        const { commentId, resolved, user } = payload;
        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user },
          (doc) => {
            const fragment = doc.getXmlFragment('default');
            updateYjsMarkAttribute(
              fragment,
              'comment',
              { name: 'commentId', value: commentId },
              { resolved },
            );
          },
        );
      },
      updatePageContent: async (
        documentName: string,
        payload: {
          prosemirrorJson: any;
          operation: string;
          user: User;
          // ENG-1447 (AC4) — when true, the AI-changed top-level blocks are
          // tagged with the `aiAuthored` mark within this SAME live-ydoc
          // transaction. ENG-1603 (AC4) additionally flags the document so
          // its next debounced persistence store also stamps the DB
          // provenance row (orvex_page_meta) in the same content-write
          // transaction — see PersistenceExtension.onStoreDocument.
          markAiAuthored?: boolean;
        },
      ) => {
        const { prosemirrorJson, operation, user, markAiAuthored } = payload;
        this.logger.debug('Updating page content via yjs', documentName);

        if (markAiAuthored) {
          // Set BEFORE the ydoc transact below so it is guaranteed to be
          // present by the time the debounced onStoreDocument persist
          // fires for this edit (which happens strictly after this
          // transaction commits and the connection is released).
          this.persistenceExtension.markPendingAiAuthored(documentName);
        }

        await this.withYdocConnection(
          hocuspocus,
          documentName,
          { user },
          (doc) => {
            const fragment = doc.getXmlFragment('default');

            // Snapshot the pre-edit document so we can diff it against the
            // post-edit document and mark only the blocks the AI changed.
            const oldJson = markAiAuthored
              ? TiptapTransformer.fromYdoc(doc, 'default')
              : null;

            if (operation === 'replace') {
              if (fragment.length > 0) {
                fragment.delete(0, fragment.length);
              }

              const newDoc = TiptapTransformer.toYdoc(
                prosemirrorJson,
                'default',
                tiptapExtensions,
              );
              Y.applyUpdate(doc, Y.encodeStateAsUpdate(newDoc));
            } else {
              const newContent = prosemirrorJson.content || [];
              const yElements = newContent.map(prosemirrorNodeToYElement);
              const position = operation === 'prepend' ? 0 : fragment.length;
              fragment.insert(position, yElements);
            }

            if (markAiAuthored) {
              // Read back the applied document, mark the AI-changed blocks,
              // and re-write the marked doc — all still inside this
              // transaction, so the marks land atomically with the edit.
              try {
                const newJson = TiptapTransformer.fromYdoc(doc, 'default');
                const marked = markAiChangedBlocks(oldJson, newJson);
                if (fragment.length > 0) {
                  fragment.delete(0, fragment.length);
                }
                const markedDoc = TiptapTransformer.toYdoc(
                  marked,
                  'default',
                  tiptapExtensions,
                );
                Y.applyUpdate(doc, Y.encodeStateAsUpdate(markedDoc));
              } catch (err) {
                // Marking is best-effort: a diff failure must never lose the
                // user-visible content edit (already applied above).
                this.logger.warn(
                  `AI-provenance block marking failed for ${documentName}: ${
                    (err as Error)?.message ?? err
                  }`,
                );
              }
            }
          },
        );
      },
    };
  }

  async withYdocConnection(
    hocuspocus: Hocuspocus,
    documentName: string,
    context: any = {},
    fn: (doc: Document) => void,
  ): Promise<void> {
    const connection = await hocuspocus.openDirectConnection(
      documentName,
      context,
    );
    try {
      await connection.transact(fn);
    } finally {
      await connection.disconnect();
    }
  }
}
