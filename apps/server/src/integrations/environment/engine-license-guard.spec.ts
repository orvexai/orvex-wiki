import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * EngineHasNoClosedSubmoduleSpec — the P10 CI guard (ENG-1381).
 *
 * DoD named test: asserts (a) no `.gitmodules` EE entry, (b) no `160000`
 * gitlink anywhere in the tracked tree, (c) `ee.module.ts` (if present)
 * imports only in-tree AGPL modules, (d) no engine file imports a
 * closed/EE package path. Implemented as a shell script
 * (scripts/engine-license-guard.sh) that this Jest spec both runs against
 * the real repo AND drives against constructed git-repo fixtures, so the
 * AC4 "a fixture PR with a gitlink/closed import fails the guard; a clean
 * PR passes" requirement is a real, repeatable assertion rather than a
 * one-off manual PR.
 */

const GUARD_SCRIPT = join(__dirname, '../../../../../scripts/engine-license-guard.sh');

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

function initFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'engine-license-guard-fixture-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'ci@orvex.ai'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ci'], { cwd: dir });
  return dir;
}

function commitAll(dir: string) {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: dir });
}

describe('EngineHasNoClosedSubmoduleSpec', () => {
  const fixtures: string[] = [];

  afterAll(() => {
    for (const dir of fixtures) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(real repo) PASSES against orvex-wiki HEAD — P10 currently holds', () => {
    const repoRoot = join(__dirname, '../../../../..');
    const { code, output } = runGuard(repoRoot);
    expect(output).toContain('PASS');
    expect(code).toBe(0);
  });

  it('(clean fixture) PASSES — no gitlink, no .gitmodules, no banned import', () => {
    const dir = initFixtureRepo();
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/ee'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/ee/ee.module.ts'),
      `import { ApiKeyModule } from './api-key/api-key.module';\nexport class EeModule {}\n`,
    );
    commitAll(dir);

    const { code, output } = runGuard(dir);
    expect(code).toBe(0);
    expect(output).toContain('PASS');
  });

  it('(a) FAILS when .gitmodules declares an EE submodule entry', () => {
    const dir = initFixtureRepo();
    fixtures.push(dir);
    writeFileSync(
      join(dir, '.gitmodules'),
      '[submodule "ee"]\n\tpath = apps/server/src/ee\n\turl = git@github.com:docmost/ee.git\n',
    );
    commitAll(dir);

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL (a)');
  });

  it('(b) FAILS when a tracked gitlink (mode 160000) re-enters the tree', () => {
    const dir = initFixtureRepo();
    fixtures.push(dir);
    writeFileSync(join(dir, 'README.md'), '# fixture\n');
    commitAll(dir);
    // Simulate a re-introduced submodule gitlink without needing a real
    // reachable submodule remote: stage a 160000 entry directly.
    const fakeSha = '1'.repeat(40);
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `160000,${fakeSha},apps/server/src/ee`],
      { cwd: dir },
    );
    execFileSync('git', ['commit', '-q', '-m', 'reintroduce gitlink'], { cwd: dir });

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL (b)');
  });

  it('(c) FAILS when ee.module.ts imports escape the engine tree', () => {
    const dir = initFixtureRepo();
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/ee'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/ee/ee.module.ts'),
      `import { Secret } from '../../../../closed-vendor/secret';\nexport class EeModule {}\n`,
    );
    commitAll(dir);

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL (c)');
  });

  it('(d) FAILS when engine source imports a banned closed-package specifier', () => {
    const dir = initFixtureRepo();
    fixtures.push(dir);
    mkdirSync(join(dir, 'apps/server/src/core'), { recursive: true });
    writeFileSync(
      join(dir, 'apps/server/src/core/thing.ts'),
      `import { LicenseGate } from 'docmost-ee';\nexport class Thing {}\n`,
    );
    commitAll(dir);

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL (d)');
  });

  it('(d) FAILS when a package.json re-declares a closed git-protocol dependency', () => {
    const dir = initFixtureRepo();
    fixtures.push(dir);
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture',
          dependencies: { ee: 'git+ssh://git@github.com/docmost/ee.git' },
        },
        null,
        2,
      ),
    );
    commitAll(dir);

    const { code, output } = runGuard(dir);
    expect(code).toBe(1);
    expect(output).toContain('FAIL (d)');
  });
});
