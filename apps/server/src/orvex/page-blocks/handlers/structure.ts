import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/structure.ts (ENG-1412).
 *
 * This leg (engine, po-ruling 10) ports the schema-registration side effects
 * ONLY — the block-PATCH write handlers (registerBlockHandler + DTO
 * validation + PageBlocksService.applyBlock calls) are the separate
 * `orvex-wiki-api` leg, blocked-by `blockid-chokepoint-engine`. See AC1/AC7.
 */

// ─── columns: shared layout constants (mirrors dto/columns.dto.ts) ──────────
type ColumnsLayout =
  | 'two_equal'
  | 'two_left_sidebar'
  | 'two_right_sidebar'
  | 'three_equal'
  | 'three_left_wide'
  | 'three_right_wide'
  | 'three_with_sidebars'
  | 'four_equal'
  | 'five_equal';

const VALID_LAYOUTS: ColumnsLayout[] = [
  'two_equal',
  'two_left_sidebar',
  'two_right_sidebar',
  'three_equal',
  'three_left_wide',
  'three_right_wide',
  'three_with_sidebars',
  'four_equal',
  'five_equal',
];

// ─── section-edit: shared op constants (mirrors dto/section-edit.dto.ts) ────
type SectionOp = 'replace' | 'append' | 'prepend';
const ALL_SECTION_OPS: SectionOp[] = ['replace', 'append', 'prepend'];

// ─── subpages ────────────────────────────────────────────────────────────────

registerBlockSchema('subpages', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SubpagesBlock',
  description: 'Place a subpages auto-listing block on a page.',
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
      description: 'Block placement operation.',
    },
    refBlockId: {
      type: 'string',
      description: 'Required for replace-at and insert-at ops.',
    },
    ifVersion: {
      type: 'string',
      description: 'CAS version guard.',
    },
    parentId: {
      type: 'string',
      format: 'uuid',
      description: 'UUID of page whose children to list. Defaults to host page.',
    },
    display: {
      type: 'string',
      enum: ['list', 'card'],
      default: 'list',
      description:
        'Render mode. "card" is a status-filtered card grid (canonical+draft) ' +
        'with a status-rollup badge and a tldr-derived blurb per child.',
    },
  },
  required: ['op'],
  additionalProperties: false,
});

// ─── tldr (role-anchored lead callout) ─────────────────────────────────────────

registerBlockSchema('tldr', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TldrBlock',
  description:
    'Place / replace the role-anchored lead callout (data-orvex-role="tldr").',
  type: 'object',
  required: ['op', 'content'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'prepend',
      description:
        'Block placement operation. Lead callouts are usually prepended or ' +
        'replaced-at (resolve refBlockId via the by-role helper first).',
    },
    refBlockId: {
      type: 'string',
      description: 'Required for replace-at and insert-at ops.',
    },
    ifVersion: {
      type: 'string',
      description: 'CAS version guard.',
    },
    content: {
      type: 'string',
      description: 'Body text for the lead callout.',
    },
  },
  additionalProperties: false,
});

// ─── transclusion ────────────────────────────────────────────────────────────

registerBlockSchema('transclusion', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TransclusionBlock',
  description: 'Embed live content from another page via transclusion.',
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
      description: 'Block placement operation.',
    },
    refBlockId: {
      type: 'string',
      description: 'Required for replace-at and insert-at ops.',
    },
    ifVersion: {
      type: 'string',
      description: 'CAS version guard.',
    },
    node: {
      type: 'object',
      description: 'Pre-built ProseMirror transclusionReference node.',
      properties: {
        type: { type: 'string', const: 'transclusionReference' },
        attrs: {
          type: 'object',
          properties: {
            sourcePageId: { type: 'string', format: 'uuid' },
            transclusionId: { type: ['string', 'null'] },
          },
          required: ['sourcePageId'],
        },
      },
      required: ['type', 'attrs'],
    },
    range: {
      type: 'string',
      description: 'Anchor hint (informational). Example: "h1".',
    },
  },
  required: ['op', 'node'],
  additionalProperties: false,
});

// ─── columns ─────────────────────────────────────────────────────────────────

registerBlockSchema('columns', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ColumnsBlock',
  description:
    'Place a multi-column layout block on a page. Supply either `columns` (markdown strings) or `node` (pre-built PM node).',
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
      description: 'Block placement operation.',
    },
    refBlockId: {
      type: 'string',
      description: 'Required for replace-at and insert-at ops.',
    },
    ifVersion: {
      type: 'string',
      description: 'CAS version guard.',
    },
    layout: {
      type: 'string',
      enum: VALID_LAYOUTS,
      default: 'two_equal',
      description: 'Column layout variant.',
    },
    columns: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 5,
      description:
        'Markdown content for each column. Count must match layout. Required when `node` is absent.',
    },
    node: {
      type: 'object',
      description: 'Pre-built ProseMirror columns node. When present, `columns` is ignored.',
    },
  },
  required: ['op'],
  additionalProperties: false,
});

// ─── section-edit ─────────────────────────────────────────────────────────────

registerBlockSchema('section-edit', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SectionEdit',
  description:
    'Edit the content of a document section defined by its heading block ID.',
  type: 'object',
  required: ['op', 'headingId'],
  properties: {
    op: {
      type: 'string',
      enum: ALL_SECTION_OPS,
      description:
        "Section operation: 'replace' — replace all content between heading and next same/higher heading; " +
        "'append' — insert after the last block in the section; " +
        "'prepend' — insert immediately after the heading.",
    },
    headingId: {
      type: 'string',
      description:
        'The attrs.id of the heading node that opens the target section. ' +
        'Obtain from GET /pages/:pageId/blocks/outline.',
    },
    blocks: {
      type: 'array',
      description: 'ProseMirror JSON nodes to insert/replace.',
      items: { type: 'object' },
    },
    ifVersion: {
      type: 'string',
      description: 'CAS version guard (integer or ISO-8601 timestamp).',
    },
    idempotencyKey: {
      type: 'string',
      maxLength: 256,
      description: 'Optional idempotency key for safe retry.',
    },
  },
  additionalProperties: false,
});
