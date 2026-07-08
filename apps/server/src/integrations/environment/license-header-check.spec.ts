import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * license-header-check — ENG-1491 AC3: every engine `.ts` file under
 * apps/server/src/orvex/ (non-spec) carries the AGPL license header
 * (SPDX-License-Identifier: AGPL-3.0-only marker). Implemented as a shell
 * script (scripts/ci/license-header-check.sh) that this Jest spec both runs
 * against the real repo AND drives against constructed fixture trees, so a
 * headerless fixture failing the check is a real, repeatable assertion.
 */

const GUARD_SCRIPT = join(__dirname, '../../../../../scripts/ci/license-header-check.sh');
const HEADER = '// SPDX-License-Identifier: AGPL-3.0-only\n';

function runGuard(repoDir: string): { code: number; output: string } {
  try {
    const output = execFileSync('bash', [GUARD_SCRIPT, repoDir], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (err: any) {
    return {
      code: err.status ?? 1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

describe('license-header-check', () => {
  const fixtures: string[] = [];

  afterAll(() => {
    for (const dir of fixtures) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(real repo) PASSES against orvex-wiki HEAD — every non-spec orvex file is headered', () => {
    const repoRoot = join(__dirname, '../../../../..');
    const { code, output } = runGuard(repoRoot);
    expect(output).toContain('PASS');
    expect(code).toBe(0);
  });

  it('(clean fixture) PASSES — non-spec file carries the SPDX marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'license-header-check-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/http'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/thing.ts'),
      `${HEADER}export class Thing {}\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(0);
    expect(output).toContain('PASS');
  });

  it('FAILS when a non-spec orvex file is missing the AGPL header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'license-header-check-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/http'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/headerless.ts'),
      `export class Headerless {}\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL');
    expect(output).toContain('headerless.ts');
  });

  it('IGNORES *.spec.ts and *.e2e.spec.ts files (test files are exempt)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'license-header-check-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/http'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/thing.ts'),
      `${HEADER}export class Thing {}\n`,
    );
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/thing.spec.ts'),
      `describe('thing', () => { it('works', () => {}); });\n`,
    );
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/orvex-http.e2e.spec.ts'),
      `describe('e2e', () => { it('works', () => {}); });\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(0);
    expect(output).toContain('PASS');
  });
});
