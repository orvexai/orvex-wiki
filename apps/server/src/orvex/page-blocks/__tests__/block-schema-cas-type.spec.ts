/**
 * block-schema-cas-type.spec.ts — ENG-3289 named DoD test
 *
 * "No registered block schema declares a non-integer `ifVersion`."
 *
 * ADR-0053 (ENG-3240, ratified 2026-07-30) fixes `ifVersion` as
 * `type: integer` family-wide — it carries the one persisted monotonic
 * write-commit counter `orvex_page_meta.version` (D-CON-5 / FR-C8), and MR-6
 * is retired. `SchemasController` serves the block-schema catalog
 * UNAUTHENTICATED at `GET /api/schemas/blocks[/:type]` precisely so that
 * "the CLI/MCP/agent clients … discover the block grammar and validate embed
 * inputs client-side before sending them to the server" — so a `string` here
 * is a public instruction to build a request this engine has never accepted.
 *
 * WHY THIS IS A TEST AND NOT A HAND AUDIT. The defect was 24 independently
 * copied literals across 7 schema-only fork ports (orvexai/docmost @
 * 050187676624f2395c55b36ec60e365f87fd4a9f, ENG-1412 / po-ruling 10). A
 * hand-audit of 24 sites is not a gate: the next port would re-introduce one
 * and nothing would notice. This walks the SAME registry the controller
 * serves — via the controller's own public methods, never the source
 * registration literals — so it sees exactly what a client sees.
 */

// Side-effect import — the module's own registration path. Importing the
// MODULE (not individual handlers) means this gate covers exactly the set the
// running app serves, including any handler added later, and equally excludes
// handlers/linear.ts, which the module deliberately does not import
// (AC-Linear-scrub / po-ruling 10).
import '../page-blocks.module';

import { SchemasController } from '../schemas.controller';

/** Every `ifVersion` declaration found anywhere in a schema, with its path. */
type Found = { path: string; declaration: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * collectIfVersion walks a JSON Schema to ANY depth and returns every
 * `ifVersion` property declaration it finds. Depth matters: a nested
 * `node.attrs` or a future `$defs` could carry its own copy, and a top-level
 * -only check would silently miss it.
 */
function collectIfVersion(node: unknown, path: string, out: Found[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectIfVersion(child, `${path}[${i}]`, out));
    return;
  }
  if (!isPlainObject(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;
    if (key === 'ifVersion' && isPlainObject(value) && 'type' in value) {
      out.push({ path: childPath, declaration: value });
    }
    collectIfVersion(value, childPath, out);
  }
}

function registeredTypes(): string[] {
  const listed = new SchemasController().listSchemas() as { schemas: string[] };
  return listed.schemas;
}

describe('block-schema catalog — CAS token wire type (ENG-3289 / ADR-0053)', () => {
  it('TestNoRegisteredBlockSchemaDeclaresANonIntegerIfVersion', () => {
    const ctrl = new SchemasController();
    const types = registeredTypes();

    // Vacuous-pass guards. An empty catalog, or a catalog with no CAS token
    // at all, would make the assertion below range over nothing and report a
    // green that proves nothing.
    expect(types.length).toBeGreaterThan(0);

    const found: Found[] = [];
    for (const type of types) {
      collectIfVersion(ctrl.getSchema(type), type, found);
    }
    expect(found.length).toBeGreaterThan(0);

    const offenders = found
      .filter((f) => (f.declaration as { type?: unknown }).type !== 'integer')
      .map((f) => `${f.path}: ${JSON.stringify(f.declaration)}`);

    expect(offenders).toEqual([]);
  });

  it('TestEveryRegisteredIfVersionIsTheOneSharedDeclaration', () => {
    // The type check above is satisfiable 24 different ways. This asserts the
    // stronger property that actually stops the drift: every site serves the
    // IDENTICAL declaration, so there is exactly one CAS wire type in the
    // catalog rather than 24 that merely happen to agree today.
    const ctrl = new SchemasController();
    const found: Found[] = [];
    for (const type of registeredTypes()) {
      collectIfVersion(ctrl.getSchema(type), type, found);
    }
    expect(found.length).toBeGreaterThan(0);

    const distinct = new Set(found.map((f) => JSON.stringify(f.declaration)));
    expect([...distinct]).toEqual([
      JSON.stringify({
        type: 'integer',
        minimum: 0,
        description:
          "CAS guard — the page's persisted write-commit counter " +
          '(orvex_page_meta.version). The write is rejected with 409 ' +
          'VERSION_MISMATCH if it does not match the current version. An ' +
          'integer, never a timestamp string (ADR-0053).',
      }),
    ]);
  });

  it('TestTheCatalogAgreesWithTheEngineWriteDto', () => {
    // The catalog's whole purpose is to let a client pre-validate a body the
    // server will accept. ApplyOpsRequestDto/ApplyDocumentRequestDto declare
    // `@IsInt() @Min(0) ifVersion?: number`; asserting the served constraint
    // matches that keeps the catalog and the write path from drifting apart
    // again in the other direction.
    const ctrl = new SchemasController();
    const found: Found[] = [];
    for (const type of registeredTypes()) {
      collectIfVersion(ctrl.getSchema(type), type, found);
    }
    for (const f of found) {
      const decl = f.declaration as { type?: unknown; minimum?: unknown };
      expect([f.path, decl.type, decl.minimum]).toEqual([
        f.path,
        'integer',
        0,
      ]);
    }
  });
});
