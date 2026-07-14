// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/external-embed.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * write handler is the orvex-wiki-api leg).
 */

registerBlockSchema('embed', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'EmbedBlock',
  type: 'object',
  required: ['url', 'op'],
  properties: {
    url: {
      type: 'string',
      format: 'uri',
      description: 'Embed URL — provider is auto-detected from the URL',
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark'],
      description: 'Embed theme (Figma only)',
    },
    align: {
      type: 'string',
      enum: ['center', 'left', 'right'],
      default: 'center',
      description: 'Horizontal alignment of the embed block',
    },
    width: {
      type: 'number',
      description: 'Embed width in pixels',
    },
    height: {
      type: 'number',
      description: 'Embed height in pixels',
    },
    provider: {
      type: 'string',
      description: 'Override provider auto-detection (e.g. "iframe")',
    },
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
      description: 'Block placement operation',
    },
    refBlockId: {
      type: 'string',
      description: 'Block ID reference for replace-at / insert-at ops',
    },
    ifVersion: {
      type: 'string',
      description: 'CAS guard — reject if page version does not match',
    },
  },
  additionalProperties: false,
});
