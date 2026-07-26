// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { registerBlockSchema } from '../schemas.controller';

/**
 * Schema-only port of orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/handlers/orvex-dashboard.ts (ENG-1412).
 * See handlers/structure.ts for the scope note (schema catalog only; the
 * write handler is the orvex-wiki-api leg).
 *
 * ENG-2951 — Linear-scrubbed on this pass: the fork's `linearOrgId` schema
 * property (a Linear org ID, resolved from a user integration if absent) is
 * DROPPED. PO-Q13 (Linear vocabulary severed from all customer-facing
 * surfaces) / D-S24 (Orvex Dashboard cockpit dropped) rule this a dead,
 * advertised-but-unread field: no engine code ever read `linearOrgId`, so
 * removing it changes no runtime behaviour. This provenance comment
 * legitimately references "Linear" by name to document what was removed and
 * why — see `orvex-throttler-names.ts` for the same reconciliation: a
 * code-only grep (identifiers/schema literals, comments excluded) is the
 * correct gate here, not a raw text grep.
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
