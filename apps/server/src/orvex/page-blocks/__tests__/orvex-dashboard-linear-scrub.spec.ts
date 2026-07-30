/**
 * orvex-dashboard-linear-scrub.spec.ts — ENG-2951 named DoD test (§5a)
 *
 * "orvex_dashboard schema exposes no linear*-keyed property" — the served
 * catalog entry (through SchemasController.getSchema, the public catalog
 * interface, never the source registration literal) must be Linear-free
 * while the generic placement/node properties survive unchanged (AC1/AC3),
 * and no engine code anywhere reads the removed field (AC2).
 *
 * Ported evidence: `handlers/orvex-dashboard.ts:28` was the sole
 * `linearOrgId` occurrence in the engine at HEAD (PO-Q13/D-S11/D-S24
 * severance; see the header DROP note in that file).
 */

import * as fs from 'fs';
import * as path from 'path';

// Side-effect import — triggers registerBlockSchema('orvex_dashboard', ...)
// at module load time. Do not rely on another spec file having run this.
import '../handlers/orvex-dashboard';

import { SchemasController } from '../schemas.controller';

type SchemaShape = { properties?: Record<string, unknown> };

function getDashboardProperties(): Record<string, unknown> {
  const ctrl = new SchemasController();
  const schema = ctrl.getSchema('orvex_dashboard') as SchemaShape;
  return schema.properties ?? {};
}

describe('orvex_dashboard schema — Linear vocabulary scrub (ENG-2951)', () => {
  // AC1 / DoD (§5a)
  it('TestOrvexDashboardSchemaHasNoLinearField', () => {
    const properties = getDashboardProperties();
    const linearKeys = Object.keys(properties).filter((k) =>
      /^linear/i.test(k),
    );
    expect(linearKeys).toEqual([]);
  });

  // AC3 — golden: generic placement/node props byte-for-byte preserved,
  // linearOrgId omitted.
  it('TestOrvexDashboardSchemaKeepsGenericProps', () => {
    const properties = getDashboardProperties();

    const golden = {
      op: {
        type: 'string',
        enum: ['append', 'prepend', 'replace-at', 'insert-at'],
        default: 'append',
        description: 'Block placement operation',
      },
      refBlockId: { type: 'string' },
      // ENG-3289: the CAS baseline is an INTEGER (ADR-0053) — the golden is
      // spelled out literally rather than referencing IF_VERSION_SCHEMA, so
      // that a change to the shared primitive has to be re-affirmed here
      // instead of silently satisfying its own assertion.
      ifVersion: {
        type: 'integer',
        minimum: 0,
        description:
          "CAS guard — the page's persisted write-commit counter " +
          '(orvex_page_meta.version). The write is rejected with 409 ' +
          'VERSION_MISMATCH if it does not match the current version. An ' +
          'integer, never a timestamp string (ADR-0053).',
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
                description:
                  'Project key matching orvex_dashboard_subscriptions.project',
              },
              dashboardId: {
                type: 'string',
                format: 'uuid',
                description:
                  'Server-assigned dashboard UUID; null on first insert',
              },
              title: {
                type: 'string',
                description: 'Optional display title for the dashboard block',
              },
            },
          },
        },
      },
    };

    expect(properties).toEqual(golden);
  });

  // AC2 — no engine code reads (or otherwise contains, outside comments) the
  // removed field. Deterministic filesystem scan of apps/server/src,
  // excluding this spec file and comment/doc lines (the AC5 provenance DROP
  // note in orvex-dashboard.ts legitimately names the field in a comment).
  it('TestNoLinearOrgIdReaderInEngine', () => {
    const srcRoot = path.resolve(__dirname, '..', '..', '..');
    const thisFile = path.resolve(__filename);

    const violations: string[] = [];

    function isCommentLine(line: string): boolean {
      const trimmed = line.trimStart();
      return (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      );
    }

    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) {
          continue;
        }
        if (path.resolve(full) === thisFile) {
          continue;
        }
        const lines = fs.readFileSync(full, 'utf8').split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('linearOrgId') && !isCommentLine(line)) {
            violations.push(`${full}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }

    walk(srcRoot);

    expect(violations).toEqual([]);
  });
});
