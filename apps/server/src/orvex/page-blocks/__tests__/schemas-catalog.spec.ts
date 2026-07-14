/**
 * schemas-catalog.spec.ts — ENG-1412 named DoD test (§5a)
 *
 * "block schema catalog coverage — non-empty, no duplicate types, every
 * entry has $schema, double-registration rejected"
 *
 * Ensures every ported handler-schema type is present in the catalog
 * exposed by GET /api/schemas/blocks, that the catalog has no duplicates,
 * that every catalog entry is a valid schema object (has $schema), that the
 * handler-registry guard (registerBlockHandler) rejects duplicate
 * registration, and that the platform Linear exclusion holds (no linear_*
 * type is registered — AC-Linear-scrub / verifierChecklist#6).
 *
 * Ported from orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f
 * apps/server/src/orvex/page-blocks/__tests__/schemas-catalog.spec.ts,
 * narrowed to the ported (non-linear) handler set and updated to the
 * corrected AC1 type list (adds section-edit, orvex_dashboard).
 */

// ---------------------------------------------------------------------------
// Side-effect imports — trigger all registerBlockSchema() calls at module
// load time. handlers/linear.ts is DELIBERATELY EXCLUDED (AC-Linear-scrub).
// ---------------------------------------------------------------------------
import '../handlers/structure';
import '../handlers/tabular';
import '../handlers/diagrams';
import '../handlers/math-content';
import '../handlers/external-embed';
import '../handlers/media';
import '../handlers/orvex-dashboard';

import { SchemasController } from '../schemas.controller';
import { registerBlockHandler } from '../page-blocks.controller';

// ---------------------------------------------------------------------------
// Canonical list of ALL block types that must be present in the catalog
// (AC1, ticket-fixer-corrected 2026-07-06). Keep in sync with any new
// registerBlockSchema() call site.
// ---------------------------------------------------------------------------
const EXPECTED_SCHEMA_TYPES: string[] = [
  // structure.ts
  'subpages',
  'tldr',
  'transclusion',
  'columns',
  'section-edit',
  // tabular.ts
  'table',
  'task_list',
  'chart',
  // external-embed.ts
  'embed',
  // diagrams.ts
  'mermaid',
  'excalidraw',
  'excalidraw-scene',
  'drawio',
  // media.ts
  'video',
  'audio',
  'pdf',
  'attachment',
  'image_from_prompt',
  // math-content.ts
  'math_block',
  'math_inline',
  'callout',
  'status',
  'details',
  // orvex-dashboard.ts
  'orvex_dashboard',
];

function getRegisteredSchemaTypes(): string[] {
  const ctrl = new SchemasController();
  const result = ctrl.listSchemas() as { schemas: string[] };
  return result.schemas;
}

describe('block schema catalog coverage (H2)', () => {
  let catalogTypes: string[];

  beforeAll(() => {
    catalogTypes = getRegisteredSchemaTypes();
  });

  it('catalog is non-empty', () => {
    expect(catalogTypes.length).toBeGreaterThan(0);
  });

  it('catalog is returned sorted', () => {
    expect(catalogTypes).toEqual([...catalogTypes].sort());
  });

  it.each(EXPECTED_SCHEMA_TYPES)(
    'schema registered for type "%s"',
    (type) => {
      expect(catalogTypes).toContain(type);
    },
  );

  it('no duplicate types in the catalog', () => {
    const uniqueTypes = Array.from(new Set(catalogTypes));
    expect(uniqueTypes).toHaveLength(catalogTypes.length);
  });

  it('EXPECTED_SCHEMA_TYPES list has no duplicates', () => {
    const unique = Array.from(new Set(EXPECTED_SCHEMA_TYPES));
    expect(unique).toHaveLength(EXPECTED_SCHEMA_TYPES.length);
  });

  it('every catalog entry has a $schema field (is a valid schema object)', () => {
    const ctrl = new SchemasController();
    for (const type of catalogTypes) {
      const schema = ctrl.getSchema(type) as Record<string, unknown>;
      expect(schema).toHaveProperty('$schema');
    }
  });

  // AC-Linear-scrub: platform Linear exclusion (po-ruling 10;
  // verifierChecklist#6; D-S11) — handlers/linear.ts is not ported and no
  // linear_* schema may appear in the catalog.
  it('AC-Linear-scrub: no linear_* type is registered in the catalog', () => {
    const linearTypes = catalogTypes.filter((t) => /^linear_/.test(t));
    expect(linearTypes).toEqual([]);
  });

  it('handler registry rejects duplicate registration (double-registration guard)', () => {
    const type = `__eng_1412_dup_check__${Date.now()}`;
    const noop = async (): Promise<object> => ({});
    registerBlockHandler(type, noop);
    expect(() => registerBlockHandler(type, noop)).toThrow(/already registered/);
  });

  // AC3 / typed 404
  it('unknown type → typed 404 SCHEMA_NOT_FOUND', () => {
    const ctrl = new SchemasController();
    try {
      ctrl.getSchema('__does_not_exist__');
      fail('expected getSchema to throw');
    } catch (err) {
      const response = (err as { getResponse?: () => unknown }).getResponse?.();
      expect(response).toMatchObject({ code: 'SCHEMA_NOT_FOUND' });
    }
  });
});
