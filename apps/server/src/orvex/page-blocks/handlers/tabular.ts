// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/tabular.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * write handlers are the orvex-wiki-api leg).
 */

registerBlockSchema('table', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TableBlock',
  description: 'Table block — either a pre-built ProseMirror node or structured headers+rows.',
  type: 'object',
  required: ['op'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    node: {
      type: 'object',
      description: 'Pre-built ProseMirror table node. When present, headers and rows are ignored.',
      required: ['type', 'content'],
      properties: {
        type: { type: 'string', const: 'table' },
        content: { type: 'array', description: 'Array of tableRow nodes' },
      },
    },
    headers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Column header names. Ignored when node is present.',
    },
    rows: {
      type: 'array',
      items: { type: 'array', items: { type: 'string' } },
      description: 'Row data as a 2-D string array. Ignored when node is present.',
    },
  },
});

registerBlockSchema('task_list', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'TaskListBlock',
  description: 'Task list block — either a pre-built ProseMirror node or structured items.',
  type: 'object',
  required: ['op'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    node: {
      type: 'object',
      description: 'Pre-built ProseMirror taskList node. When present, items is ignored.',
      required: ['type', 'content'],
      properties: {
        type: { type: 'string', const: 'taskList' },
        content: { type: 'array', description: 'Array of taskItem nodes' },
      },
    },
    items: {
      type: 'array',
      description: 'Task items. Ignored when node is present.',
      items: {
        type: 'object',
        required: ['text', 'checked'],
        properties: {
          text: { type: 'string' },
          checked: { type: 'boolean' },
          children: { type: 'array', description: 'Nested task items' },
        },
      },
    },
  },
});

registerBlockSchema('chart', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ChartBlock',
  description: 'Chart block — either a pre-built ProseMirror node or structured chartType+data.',
  type: 'object',
  required: ['op'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    node: {
      type: 'object',
      description: 'Pre-built ProseMirror chart node. When present, chartType/data/title are ignored.',
      required: ['type', 'attrs'],
      properties: {
        type: { type: 'string', const: 'chart' },
        attrs: {
          type: 'object',
          required: ['chartType'],
          properties: {
            chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter'] },
            data: { type: 'string' },
            title: { type: 'string' },
          },
        },
      },
    },
    chartType: {
      type: 'string',
      enum: ['bar', 'line', 'pie', 'scatter'],
      description: 'Chart type. Ignored when node is present.',
    },
    data: {
      type: 'string',
      description:
        'JSON-encoded chart data. bar/line/pie: {"labels":["a"],"values":[1]}; scatter: {"points":[{"x":1,"y":2}]}. Ignored when node is present.',
    },
    title: {
      type: 'string',
      description: 'Optional chart title. Ignored when node is present.',
    },
  },
});
