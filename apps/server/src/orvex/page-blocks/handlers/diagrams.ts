import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/diagrams.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * write handlers are the orvex-wiki-api leg).
 */

registerBlockSchema('mermaid', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'MermaidBlock',
  type: 'object',
  required: ['op', 'diagram'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    diagram: {
      type: 'string',
      minLength: 1,
      description: 'Raw Mermaid DSL source',
    },
    dialect: {
      type: 'string',
      enum: ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'mindmap'],
      description: 'Optional dialect hint (informational)',
    },
  },
});

registerBlockSchema('excalidraw', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ExcalidrawBlock',
  type: 'object',
  required: ['op', 'diagram'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    diagram: {
      type: 'string',
      minLength: 1,
      description: 'Mermaid flowchart DSL source (server transforms to Excalidraw scene)',
    },
  },
});

registerBlockSchema('excalidraw-scene', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ExcalidrawSceneBlock',
  type: 'object',
  required: ['op', 'scene'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    scene: {
      type: 'string',
      minLength: 1,
      maxLength: 200_000,
      description: 'JSON-stringified ExcalidrawElement[] (or {elements,...} envelope). Hard cap 200 KB.',
    },
    title: {
      type: 'string',
      description: 'Optional title for the embedded Excalidraw block.',
    },
  },
});

registerBlockSchema('drawio', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'DrawioBlock',
  type: 'object',
  required: ['op', 'diagram'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    diagram: {
      type: 'string',
      minLength: 1,
      description: 'Mermaid flowchart DSL source (server transforms to mxGraph XML)',
    },
  },
});
