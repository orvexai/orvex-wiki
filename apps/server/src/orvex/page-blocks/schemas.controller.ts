// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

/**
 * schemaRegistry maps embed type names to their JSON Schema objects.
 * Handlers call registerBlockSchema() from their module-init path alongside
 * registerBlockHandler() (see page-blocks.controller.ts).
 *
 * Ported from orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/schemas.controller.ts (ENG-1412, po-ruling
 * 10 — the engine owns the schema CATALOG; the block-PATCH write grammar is
 * the separate orvex-wiki-api leg).
 */
const schemaRegistry = new Map<string, object>();

/**
 * registerBlockSchema registers the JSON Schema for an embed type's request
 * body. Call once per type, typically alongside registerBlockHandler().
 */
export function registerBlockSchema(type: string, schema: object): void {
  schemaRegistry.set(type, schema);
}

/**
 * SchemasController serves a public schema catalog used by the CLI/MCP/agent
 * clients to discover the block grammar and validate embed inputs client-side
 * before sending them to the server.
 *
 * GET /api/schemas/blocks         → list of registered type names
 * GET /api/schemas/blocks/:type   → JSON Schema for one type
 *
 * These endpoints are unauthenticated (@Public) because they contain no
 * sensitive information and must be accessible before login for CLI tooling.
 */
@Controller('schemas/blocks')
export class SchemasController {
  @Public()
  @Get()
  listSchemas(): object {
    return { schemas: Array.from(schemaRegistry.keys()).sort() };
  }

  @Public()
  @Get(':type')
  getSchema(@Param('type') type: string): object {
    const schema = schemaRegistry.get(type);
    if (!schema) {
      throw new NotFoundException({
        code: 'SCHEMA_NOT_FOUND',
        message: `😕 No schema registered for block type: "${type}". Run 'orvex-doc instructions embeds' for the full catalog.`,
      });
    }
    return schema;
  }
}
