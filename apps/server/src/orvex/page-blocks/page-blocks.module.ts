// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { SchemasController } from './schemas.controller';

// Side-effect imports: top-level registerBlockSchema() calls fire on import,
// populating the catalog the SchemasController serves.
//
// handlers/linear.ts is DELIBERATELY EXCLUDED (AC-Linear-scrub / po-ruling
// 10 / verifierChecklist#6 — platform Linear exclusion): no linear_* type may
// appear in GET /api/schemas/blocks.
import './handlers/structure';
import './handlers/tabular';
import './handlers/media';
import './handlers/math-content';
import './handlers/diagrams';
import './handlers/external-embed';
import './handlers/orvex-dashboard';

/**
 * OrvexPageBlocksModule (engine leg, ENG-1412) wires the PUBLIC block-schema
 * catalog surface:
 *
 *   GET /api/schemas/blocks         — list registered schema types
 *   GET /api/schemas/blocks/:type   — JSON Schema for one embed type
 *
 * Ported from orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/page-blocks.module.ts, narrowed to the
 * schema-catalog surface only (po-ruling 10): the block-PATCH write grammar
 * (PageBlocksController/PageBlocksService/PageDiffController) is the
 * separate `orvex-wiki-api` leg, blocked-by `blockid-chokepoint-engine`.
 */
@Module({
  controllers: [SchemasController],
})
export class OrvexPageBlocksModule {}
