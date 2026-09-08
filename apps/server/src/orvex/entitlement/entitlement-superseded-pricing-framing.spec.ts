import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const REPO_ROOT = join(__dirname, '../../../../..');
const OPENAPI_FILE = join(REPO_ROOT, 'contracts', 'openapi.yaml');
const BREAKDOWN_DIR = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'delivery-program-2026-07-13',
  'p1-structure',
  'breakdown',
);

describe('ENG-2036 — superseded pricing framing guard', () => {
  it('does not retain superseded trial language in the authored OpenAPI contract', () => {
    const file = 'contracts/openapi.yaml';
    const source = readFileSync(OPENAPI_FILE, 'utf8');
    const forbidden = [
      { name: 'card-required trial', pattern: /card-required trial/gi },
      { name: 'card required trial', pattern: /card required trial/gi },
      { name: '7-day trial', pattern: /7-day trial/gi },
      { name: 'lifetime-action', pattern: /lifetime-action/gi },
    ];
    const hits = forbidden.flatMap(({ name, pattern }) =>
      [...source.matchAll(pattern)].map((match) => `${name}: ${match[0]}`),
    );

    expect({ file, hits }).toEqual({ file, hits: [] });
  });

  it('describes QuotaStatus.trial as the card-free standard free month', () => {
    const source = readFileSync(OPENAPI_FILE, 'utf8');
    const quotaStatus = source.match(
      /\n\x20{4}QuotaStatus:\n([\s\S]*?)\n\x20{4}QuotaUsage:/,
    )?.[1];
    const trialDescription = quotaStatus?.match(
      /\n\x20{8}trial:\n([\s\S]*?)\n\x20{8}effectiveAt:/,
    )?.[1];

    expect(quotaStatus).toContain('billing/plan.schema.json');
    expect(trialDescription).toContain('card-free standard free-month');
    expect(trialDescription).toContain('no card is required');
    expect(trialDescription).toMatch(/downgrade to Free at\s+expiry/);
    expect(trialDescription).toMatch(
      /Consumers must not infer\s+a card\s+requirement/,
    );
  });

  it('does not put a pending-freeze marker next to Free or £7 pricing', () => {
    const hits: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!full.endsWith('.md')) continue;

        const lines = readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
          if (!/pending_freeze/i.test(line)) return;
          const context = lines
            .slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
            .join('\n');
          if (/(?:\bFree\b|£7)/i.test(context)) {
            hits.push(`${relative(REPO_ROOT, full)}:${index + 1}`);
          }
        });
      }
    }

    walk(BREAKDOWN_DIR);
    expect({ file: relative(REPO_ROOT, BREAKDOWN_DIR), hits }).toEqual({
      file: relative(REPO_ROOT, BREAKDOWN_DIR),
      hits: [],
    });
  });
});
