import { StarterKit } from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { Superscript } from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import { Typography } from '@tiptap/extension-typography';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Youtube } from '@tiptap/extension-youtube';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import {
  Heading,
  Callout,
  Comment,
  CustomCodeBlock,
  Details,
  DetailsContent,
  DetailsSummary,
  LinkExtension,
  MathBlock,
  MathInline,
  TableHeader,
  TableCell,
  TableRow,
  CustomTable,
  TiptapImage,
  TiptapVideo,
  TiptapAudio,
  TiptapPdf,
  PageBreak,
  TrailingNode,
  Attachment,
  Drawio,
  Excalidraw,
  Embed,
  Mention,
  Subpages,
  Highlight,
  Indent,
  UniqueID,
  Columns,
  Column,
  Status,
  addUniqueIdsToDoc,
  htmlToMarkdown,
  TransclusionSource,
  TransclusionReference,
  BaseEmbed,
  AiAuthored,
} from '@docmost/editor-ext';
import { generateText, getSchema, JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '../common/helpers/prosemirror/html';
// @tiptap/html library works best for generating prosemirror json state but not HTML
// see: https://github.com/ueberdosis/tiptap/issues/5352
// see:https://github.com/ueberdosis/tiptap/issues/4089
//import { generateJSON } from '@tiptap/html';
import { Node, Schema } from '@tiptap/pm/model';
import * as Y from 'yjs';
import { Logger } from '@nestjs/common';
import {
  BLOCK_ID_TYPES,
  backfillPageContent,
} from './backfill-block-ids.util';
// ENG-2487 — the Yjs↔PM↔DfM conversion leg: the collab layer's PM-JSON
// snapshots project to DfM through the standalone `@orvex/dfm` workspace
// package (FR-W18 / A-DFM), never through an HTML/turndown intermediate.
import { pmToDfm } from '@orvex/dfm';
import type { PmNode } from '@orvex/dfm';

export const tiptapExtensions = [
  StarterKit.configure({
    codeBlock: false,
    link: false,
    trailingNode: false,
    heading: false,
  }),
  Heading,
  UniqueID.configure({
    // ENG-1397 AC1 — widened block-ID coverage (was just heading/paragraph/
    // transclusionSource); single source of truth in `BLOCK_ID_TYPES`.
    types: BLOCK_ID_TYPES,
  }),
  Comment,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Indent,
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  LinkExtension,
  Superscript,
  SubScript,
  Highlight,
  Typography,
  TrailingNode,
  TextStyle,
  Color,
  MathInline,
  MathBlock,
  Details,
  DetailsContent,
  DetailsSummary,
  CustomTable,
  TableCell,
  TableRow,
  TableHeader,
  Youtube,
  TiptapImage,
  TiptapVideo,
  TiptapAudio,
  TiptapPdf,
  PageBreak,
  Callout,
  Attachment,
  CustomCodeBlock,
  Drawio,
  Excalidraw,
  Embed,
  Mention,
  Subpages,
  Columns,
  Column,
  Status,
  TransclusionSource,
  TransclusionReference,
  BaseEmbed,
  AiAuthored,
] as any;

export function jsonToHtml(tiptapJson: any) {
  return generateHTML(tiptapJson, tiptapExtensions);
}

export function htmlToJson(html: string) {
  const pmJson = generateJSON(html, tiptapExtensions);

  try {
    return addUniqueIdsToDoc(pmJson, tiptapExtensions);
  } catch (error) {
    console.warn('failed to add unique ids to doc', error);
    return pmJson;
  }
}

export function jsonToText(tiptapJson: JSONContent) {
  return generateText(tiptapJson, tiptapExtensions);
}

export function jsonToNode(tiptapJson: JSONContent) {
  const schema = getSchema(tiptapExtensions);
  try {
    return Node.fromJSON(schema, tiptapJson);
  } catch (error) {
    if (
      error instanceof RangeError &&
      error.message.includes('Unknown node type')
    ) {
      Logger.warn(
        'Fencing unknown node types in document (DfM opaque fence):',
        error.message,
      );
      const { json: fencedJson } = fenceUnknownNodes(tiptapJson, schema);
      return Node.fromJSON(schema, fencedJson);
    }
    throw error;
  }
}

/**
 * ENG-2506 T6 (AC5) — the unknown-node leg of the collab/REST parse path,
 * rewired off the old `stripUnknownNodes` unwrap-and-drop onto the now-real
 * `@orvex/dfm` opaque fence (ENG-2487 shipped `opaqueToken`/`pmToDfm`;
 * `serializeOpaque`'s throwing stub is retired).
 *
 * `Node.fromJSON` cannot hold a node type the schema does not register, so
 * the fence is the carrier: the unregistered subtree is replaced by its
 * `:::dfm-opaque type=<t> id=<id>` REFERENCE — schema-legal text — and the
 * ORIGINAL subtree is returned alongside in `opaqueBodies`, keyed by that
 * same id. That is exactly the base-doc/opaque-body map
 * `@orvex/dfm#reattachOpaqueRefs` resolves against, so the node is
 * recoverable byte-for-byte instead of vanishing.
 *
 * Contrast with the retired behaviour: `stripUnknownNodes` unwrapped the
 * node, discarding its `type` AND its `attrs` with no record anywhere, and
 * spilled its children into the parent — silent, unrecoverable data loss on
 * exactly the path AC5 names.
 */
export function fenceUnknownNodes(
  json: JSONContent,
  schema: Schema,
): { json: JSONContent; opaqueBodies: Map<string, PmNode> } {
  const opaqueBodies = new Map<string, PmNode>();
  let counter = 0;
  // Deterministic per call (CS ❌#9 — never wall-clock/random): a node
  // without its own block id gets a positional fallback id, so the same
  // document always fences to the same reference text.
  const nextOpaqueId = () => `opaque-${(counter += 1).toString(36)}`;

  const visit = (node: JSONContent): JSONContent => {
    if (!node || typeof node !== 'object') return node;

    const walked: JSONContent = Array.isArray(node.content)
      ? { ...node, content: node.content.map(visit) }
      : node;

    if (typeof walked.type === 'string' && !schema.nodes[walked.type]) {
      const id =
        typeof node.attrs?.id === 'string' && node.attrs.id.length > 0
          ? node.attrs.id
          : nextOpaqueId();
      // The ORIGINAL (pre-walk) subtree is what reattachment must restore —
      // never the partially-fenced copy.
      opaqueBodies.set(id, JSON.parse(JSON.stringify(node)) as PmNode);
      return {
        type: 'paragraph',
        content: [
          { type: 'text', text: `:::dfm-opaque type=${walked.type} id=${id}` },
        ],
      };
    }

    return walked;
  };

  return { json: visit(json), opaqueBodies };
}

/**
 * ENG-1397 AC2 — the block-ID stamping step used at the `PageService` write
 * chokepoint (`parseProsemirrorContent`) and by the legacy backfill
 * migration (AC4). Wraps `backfillPageContent` with this module's own
 * widened `tiptapExtensions` (single schema instance for the whole write
 * path).
 */
export function stampBlockIds(pmJson: JSONContent) {
  return backfillPageContent(pmJson, tiptapExtensions);
}

export function getPageId(documentName: string) {
  return documentName.split('.')[1];
}

export function isEmptyParagraphDoc(tiptapJson: JSONContent): boolean {
  if (!tiptapJson || tiptapJson.type !== 'doc') return false;
  const content = tiptapJson.content;
  if (!Array.isArray(content) || content.length !== 1) return false;
  const child = content[0];
  if (!child || child.type !== 'paragraph') return false;
  return (
    !child.content ||
    (Array.isArray(child.content) && child.content.length === 0)
  );
}


export function prosemirrorNodeToYElement(node: any): Y.XmlElement | Y.XmlText {
  if (node.type === 'text') {
    const ytext = new Y.XmlText();
    ytext.insert(0, node.text || '');
    if (node.marks?.length > 0) {
      const attrs: Record<string, any> = {};
      for (const mark of node.marks) {
        attrs[mark.type] = mark.attrs || true;
      }
      ytext.format(0, node.text?.length || 0, attrs);
    }
    return ytext;
  }

  const element = new Y.XmlElement(node.type);
  if (node.attrs) {
    for (const [key, value] of Object.entries(node.attrs)) {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, value as any);
      }
    }
  }
  if (node.content?.length > 0) {
    const children = node.content.map(prosemirrorNodeToYElement);
    element.insert(0, children);
  }
  return element;
}

export function jsonToMarkdown(tiptapJson: any): string {
  const html = jsonToHtml(tiptapJson);
  return htmlToMarkdown(html);
}

/**
 * ENG-2487 — the collab layer's DfM projection: serialize a (Yjs-derived)
 * ProseMirror JSON document to DfM via `@orvex/dfm`. Total over PM JSON: a
 * node type outside the serializer's registry becomes a lossless
 * `:::dfm-opaque` reference fence (resolved back through the write path's
 * `reattachOpaqueRefs` base-doc round trip), never a silent drop. A document
 * with no `type` is a caller bug, rejected up front rather than fabricated
 * into an empty doc.
 */
export function jsonToDfm(tiptapJson: JSONContent): string {
  if (!tiptapJson || typeof tiptapJson.type !== 'string') {
    throw new Error(
      'jsonToDfm: expected a ProseMirror JSON node with a "type" field',
    );
  }
  return pmToDfm(tiptapJson as PmNode);
}
