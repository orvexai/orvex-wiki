import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * engine-only-import-guard — ENG-1491 AC4: no file under
 * apps/server/src/orvex/ may import a closed-satellite family package or a
 * non-AGPL-compatible module (Q22 slim-AGPL rule). Implemented as a shell
 * script (scripts/ci/engine-only-import-guard.sh) that this Jest spec both
 * runs against the real repo AND drives against constructed fixture trees,
 * so a deliberately-planted forbidden import failing the check is a real,
 * repeatable assertion (not a one-off manual PR).
 */

const GUARD_SCRIPT = join(__dirname, '../../../../../scripts/ci/engine-only-import-guard.sh');

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

describe('engine-only-import-guard', () => {
  const fixtures: string[] = [];

  afterAll(() => {
    for (const dir of fixtures) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(real repo) PASSES against orvex-wiki HEAD — no closed-satellite import found', () => {
    const repoRoot = join(__dirname, '../../../../..');
    const { code, output } = runGuard(repoRoot);
    expect(output).toContain('PASS');
    expect(code).toBe(0);
  });

  it('(clean fixture) PASSES — only in-tree/allowed imports', () => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-only-import-guard-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/http'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/thing.ts'),
      `import { Injectable } from '@nestjs/common';\nimport { OrvexConfigService } from '../config/orvex-config.service';\n@Injectable()\nexport class Thing {}\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(0);
    expect(output).toContain('PASS');
  });

  it('FAILS when an orvex file imports a closed-satellite package (@orvexai/*)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-only-import-guard-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/http'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/leaky.ts'),
      `import { BillingClient } from '@orvexai/orvex-studio-billing';\nexport class Leaky {}\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL');
    expect(output).toContain('leaky.ts');
  });

  it('FAILS when an orvex file imports a closed EE/non-AGPL module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-only-import-guard-fixture-'));
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/orvex/http'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/orvex/http/leaky2.ts'),
      `import { LicenseGate } from 'docmost-ee';\nexport class Leaky2 {}\n`,
    );

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL');
    expect(output).toContain('leaky2.ts');
  });
});
