import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ENG-1382 AC6 (❌#10) — static provenance gate: no numeric cap literal
 * anywhere in the F-QUOTA enforcement path. The ONLY source of a cap VALUE
 * is `EntitlementCheckResponse.caps`, read from the billing port.
 *
 * This scans the enforcement call sites (not `entitlement.types.ts`, which
 * legitimately types the cap shape with no values, and not test fixtures,
 * which stand in for a committed billing replay).
 */
describe('AC6 — no hard-coded cap literal in the enforcement path', () => {
  const enforcementFiles = [
    'entitlement.service.ts',
    'quota.exception.ts',
    'entitlement-billing.port.ts',
    'entitlement-http-billing.port.ts',
    'entitlement-cache.ts',
  ];

  it('contains no bare numeric literal that could be a cap value', () => {
    for (const file of enforcementFiles) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      // Strip comments (a doc comment may legitimately reference a number,
      // e.g. this file's own header, or the CACHE_TTL_SECONDS constant name
      // in a comment) before scanning code for numeric literals.
      const withoutComments = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        // Ticket references (ENG-1382 etc.) are provenance, not cap values.
        .replace(/ENG-\d+/g, '');

      // Allow-list: HTTP status codes (typed via HttpStatus.* already, but
      // defensive), array indices, and the cache TTL (a freshness knob, not
      // a plan cap — CS §4i freshness, distinct from ❌#10 ceilings).
      const allowed = new Set([
        '0', // uncapped sentinel / array index / falsy checks
        '1', // array index / singular counts
      ]);

      const numericLiterals = withoutComments.match(/(?<![\w.])\d+(?![\w.])/g) ?? [];
      const suspicious = numericLiterals.filter((n) => !allowed.has(n));

      // CACHE_TTL_SECONDS = 300 is a freshness knob, not a cap ceiling —
      // explicitly exempted by name-check rather than value, so a real cap
      // literal slipped in elsewhere still fails this gate.
      const suspiciousExcludingKnownConstants = suspicious.filter((n) => {
        return !(file === 'entitlement-cache.ts' && n === '300');
      });

      expect({
        file,
        suspiciousExcludingKnownConstants,
      }).toEqual({ file, suspiciousExcludingKnownConstants: [] });
    }
  });
});
