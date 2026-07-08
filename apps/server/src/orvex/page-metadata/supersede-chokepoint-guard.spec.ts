// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * ENG-1434 AC12/§5c — supersede-chokepoint-guard — `supersedeAtomic` must
 * be the ONLY place in this repo that writes
 * `orvex_page_meta.status = 'superseded'`. Implemented as a shell script
 * (scripts/ci/supersede-chokepoint-guard.sh) that this Jest spec both runs
 * against the real repo AND drives against constructed fixture trees, so a
 * deliberately-planted divergent write failing the check is a real,
 * repeatable assertion (mirrors engine-only-import-guard.spec.ts).
 *
 * review1 F3 — the script's own docstring claims it also catches a
 * hand-rolled raw `'superseded'` string literal, not just the
 * `PageStatus.SUPERSEDED` enum reference; this spec pins BOTH forms.
 */

const GUARD_SCRIPT = join(
  __dirname,
  '../../../../../scripts/ci/supersede-chokepoint-guard.sh',
);

function runGuard(repoDir: string): { code: number; output: string } {
  try {
    const output = execFileSync('bash', [GUARD_SCRIPT, repoDir], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  }
}

describe('supersede-chokepoint-guard', () => {
  const fixtures: string[] = [];

  afterAll(() => {
    for (const dir of fixtures) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeFixtureDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'supersede-chokepoint-guard-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/page-metadata'), {
      recursive: true,
    });
    // The chokepoint file itself must exist for the script to run at all.
    writeFileSync(
      join(dir, 'apps/server/src/orvex/page-metadata/orvex-page-metadata.service.ts'),
      `export class OrvexPageMetadataService {\n  async supersedeAtomic() {\n    // status: PageStatus.SUPERSEDED — the real chokepoint write, exempted by path.\n  }\n}\n`,
    );
    return dir;
  }

  it('(real repo) PASSES against orvex-wiki HEAD — supersedeAtomic is the sole chokepoint', () => {
    const repoRoot = join(__dirname, '../../../../..');
    const { code, output } = runGuard(repoRoot);
    expect(output).toContain('PASS');
    expect(code).toBe(0);
  });

  it('(clean fixture) PASSES — no divergent write outside the chokepoint', () => {
    const dir = makeFixtureDir();
    mkdirSync(join(dir, 'apps/server/src/orvex/other'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/other/reader.ts'),
      `// reads status, never writes it\nexport function classify(status: string) { return status === 'superseded'; }\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(0);
    expect(output).toContain('PASS');
  });

  it('FAILS on a divergent write using the PageStatus.SUPERSEDED enum outside the chokepoint', () => {
    const dir = makeFixtureDir();
    mkdirSync(join(dir, 'apps/server/src/orvex/other'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/other/divergent-enum.ts'),
      `db.updateTable('orvexPageMeta').set({ status: PageStatus.SUPERSEDED }).execute();\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL');
    expect(output).toContain('divergent-enum.ts');
  });

  it('review1 F3: FAILS on a divergent write using the raw \'superseded\' string literal (bypassing the PageStatus enum entirely)', () => {
    const dir = makeFixtureDir();
    mkdirSync(join(dir, 'apps/server/src/orvex/other'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/other/divergent-raw.ts'),
      `db.updateTable('orvexPageMeta').set({ status: 'superseded' }).execute();\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL');
    expect(output).toContain('divergent-raw.ts');
  });
});
