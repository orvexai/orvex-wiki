// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/orvex-dashboard.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * write handler is the orvex-wiki-api leg).
 */

registerBlockSchema('orvex_dashboard', {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'OrvexDashboardBlock',
  type: 'object',
  required: ['op', 'node'],
  properties: {
    op: {
      type: 'string',
      enum: ['append', 'prepend', 'replace-at', 'insert-at'],
      default: 'append',
      description: 'Block placement operation',
    },
    refBlockId: { type: 'string' },
    ifVersion: { type: 'string' },
    linearOrgId: {
      type: 'string',
      description: 'Linear org ID (resolved from user integration if absent)',
    },
    node: {
      type: 'object',
      required: ['type', 'attrs'],
      properties: {
        type: { type: 'string', const: 'orvexDashboard' },
        attrs: {
          type: 'object',
          required: ['project'],
          properties: {
            project: {
              type: 'string',
              pattern: '^[a-z0-9-]{1,128}$',
              description: 'Project key matching orvex_dashboard_subscriptions.project',
            },
            dashboardId: {
              type: 'string',
              format: 'uuid',
              description: 'Server-assigned dashboard UUID; null on first insert',
            },
            title: {
              type: 'string',
              description: 'Optional display title for the dashboard block',
            },
          },
        },
      },
    },
  },
});
