// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/math-content.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * write handlers are the orvex-wiki-api leg).
 */

registerBlockSchema('math_block', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'MathBlockDto',
  description: 'LaTeX display-mode math block.',
  type: 'object',
  required: ['op', 'text'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    text: {
      type: 'string',
      description: 'LaTeX source for the display-mode math block.',
    },
  },
});

registerBlockSchema('math_inline', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'MathInlineDto',
  description: 'LaTeX inline math span.',
  type: 'object',
  required: ['op', 'text'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    text: {
      type: 'string',
      description: 'LaTeX source for the inline math span.',
    },
  },
});

registerBlockSchema('callout', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'CalloutDto',
  description: 'Callout block (info|success|warning|danger).',
  type: 'object',
  required: ['op', 'type', 'content'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    type: {
      type: 'string',
      enum: ['info', 'success', 'warning', 'danger'],
      description: 'Callout variant — controls colour and icon.',
    },
    content: {
      type: 'string',
      description: 'Body text for the callout.',
    },
  },
});

registerBlockSchema('status', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'StatusDto',
  description: 'Inline status badge with color.',
  type: 'object',
  required: ['op', 'text', 'color'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    text: {
      type: 'string',
      description: 'Badge label text displayed inside the status chip.',
    },
    color: {
      type: 'string',
      enum: ['gray', 'blue', 'green', 'yellow', 'red', 'purple'],
      description: 'Badge background color.',
    },
  },
});

registerBlockSchema('details', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'DetailsDto',
  description: 'Collapsible details/disclosure block.',
  type: 'object',
  required: ['op', 'summary', 'content'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    summary: {
      type: 'string',
      description: 'Disclosure heading — shown as the clickable toggle label.',
    },
    content: {
      type: 'string',
      description: 'Body text shown when the disclosure is expanded.',
    },
  },
});
