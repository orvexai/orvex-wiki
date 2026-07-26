// TestFr30DivergenceGate — the ENG-2477 DoD gate + fixture-driven sub-tests.
//
// Behaviour-through-interface (CS §4.2): the DoD assertions drive the REAL
// gate CLI (a real process invocation over committed synthetic fixture
// trees) and assert on exit code + the printed remediation-report shape —
// never on internal symbol names, so an internal helper rename cannot break
// them. Unit tests additionally drive the exported pure functions
// (computeBudget/checkFr30Divergence) directly over in-memory fixtures —
// the gate's own logic is NEVER mocked (CS §5 ❌#4). Deterministic: fixed
// committed fixture trees, injected resolvers, no live network fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  loadFr30Ledger,
  validateRow,
  isDivergenceScoped,
  computeBudget,
  checkFr30Divergence,
  budgetArtifact,
} from '../check-fr30-divergence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(REPO_ROOT, 'scripts', 'check-fr30-divergence.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'fr30-divergence');

function runGateFixture(name) {
  const res = spawnSync('node', [GATE, '--fixture', path.join(FIXTURES, name)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { code: res.status, out: `${res.stdout}\n${res.stderr}` };
}

// ---------------------------------------------------------------------------
// TestFr30DivergenceGate — the five-part DoD gate, through the real CLI
// ---------------------------------------------------------------------------

test('TestFr30DivergenceGate AC1: clean fold-in (only allow-listed files differ) exits 0', () => {
  const { code, out } = runGateFixture('clean');
  assert.equal(code, 0);
  assert.match(out, /OK: FR-30 divergence gate/);
});

test('TestFr30DivergenceGate AC2: an edit to an off-allow-list upstream file reds the gate, offending path reported', () => {
  const { code, out } = runGateFixture('off-allowlist');
  assert.notEqual(code, 0);
  assert.match(out, /FAIL: FR-30 divergence gate/);
  assert.match(out, /apps\/server\/src\/core\/space\/services\/space\.service\.ts/);
  assert.match(out, /OFF-ALLOWLIST/);
});

test('TestFr30DivergenceGate AC3: the budget report shows weight > 1 for the hot files', () => {
  const { code, out } = runGateFixture('clean');
  assert.equal(code, 0);
  // app.module.ts and page.service.ts differ in the clean fixture; both carry
  // weight 3 in its ledger — the printed per-file breakdown must show it.
  assert.match(out, /app\.module\.ts\s+hunks=\d+ weight=3 score=[1-9]/);
  assert.match(out, /page\.service\.ts\s+hunks=\d+ weight=3 score=[1-9]/);
});

test('TestFr30DivergenceGate AC4: a change confined to orvex scopes produces budget delta 0 and exits 0', () => {
  const { code, out } = runGateFixture('orvex-scoped');
  assert.equal(code, 0);
  assert.match(out, /total score: 0/);
});

test('TestFr30DivergenceGate AC5: a hardening item edited within its tagged anchor is NOT flagged', () => {
  const { code, out } = runGateFixture('hardening');
  assert.equal(code, 0);
  assert.match(out, /class=hardening/);
});

test('TestFr30DivergenceGate: a hardening item whose anchor no longer resolves fails LOUDLY naming it', () => {
  const { code, out } = runGateFixture('hardening-broken');
  assert.notEqual(code, 0);
  assert.match(out, /HARDENING-ANCHOR-UNRESOLVED/);
  assert.match(out, /upstream-hardened\.ts/);
});

test('TestInfraErrorDistinctFromDivergenceFinding: unreachable pinned ref exits 2 (not 0, not 1) with INFRA-ERROR', () => {
  const { code, out } = runGateFixture('infra-error');
  assert.equal(code, 2);
  assert.match(out, /INFRA-ERROR:/);
});

test('check-fr30-divergence.mjs --self-test passes against the committed fixtures', () => {
  const out = execFileSync('node', [GATE, '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /self-test PASS/);
});

// ---------------------------------------------------------------------------
// The real committed 13-row ledger (AC1's governance artifact)
// ---------------------------------------------------------------------------

test('the committed fr30/allowlist.json carries exactly 13 allow-list rows', () => {
  const ledger = loadFr30Ledger(REPO_ROOT);
  const allowRows = ledger.rows.filter((r) => r.class === 'allowlist');
  assert.equal(allowRows.length, 13);
});

test('every committed allow-list row path resolves via git cat-file -e HEAD:<path> (no invented row)', () => {
  const ledger = loadFr30Ledger(REPO_ROOT);
  for (const row of ledger.rows.filter((r) => r.class === 'allowlist')) {
    assert.doesNotThrow(
      () =>
        execFileSync('git', ['cat-file', '-e', `HEAD:${row.path}`], {
          cwd: REPO_ROOT,
          stdio: 'ignore',
        }),
      `ledger row does not resolve at HEAD: ${row.path}`,
    );
  }
});

test('the three named hot files carry weight > 1 in the committed ledger', () => {
  const ledger = loadFr30Ledger(REPO_ROOT);
  for (const hot of [
    'apps/server/src/core/page/services/page.service.ts',
    'apps/server/src/app.module.ts',
    'apps/server/src/core/auth/strategies/jwt.strategy.ts',
  ]) {
    const row = ledger.rows.find((r) => r.path === hot);
    assert.ok(row, `hot file missing from ledger: ${hot}`);
    assert.ok(row.weight > 1, `hot file ${hot} must weigh > 1, got ${row.weight}`);
  }
});

test('TestLedgerNoPlaceholderOrTodoEntries: honesty grep over the gate + ledger', () => {
  for (const file of ['scripts/check-fr30-divergence.mjs', 'fr30/allowlist.json']) {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.doesNotMatch(text, /TODO|FIXME|placeholder/i, `${file} carries a placeholder marker`);
  }
});

// ---------------------------------------------------------------------------
// Unit layer — exported pure functions over in-memory fixtures
// ---------------------------------------------------------------------------

test('validateRow: rejects a non-numeric weight and an unknown class (❌#12 shape gate)', () => {
  assert.throws(() => validateRow({ path: 'a.ts', weight: 'heavy' }, 't'));
  assert.throws(() => validateRow({ path: 'a.ts', class: 'cosmetics' }, 't'));
  assert.throws(() => validateRow({ path: 'a.ts', class: 'hardening' }, 't')); // no anchor
  assert.throws(() => validateRow({ weight: 1 }, 't')); // no path
});

test('isDivergenceScoped: orvex scopes are out of budget scope, upstream paths are in', () => {
  assert.equal(isDivergenceScoped('apps/server/src/orvex/events/outbox/x.ts'), false);
  assert.equal(isDivergenceScoped('packages/@orvex/sdk/index.ts'), false);
  assert.equal(isDivergenceScoped('apps/server/src/core/page/services/page.service.ts'), true);
});

test('computeBudget: score = weight x hunks per file, summed; off-ledger paths are offenders', () => {
  const ledger = {
    rows: [
      { path: 'hot.ts', weight: 3, class: 'allowlist' },
      { path: 'cold.ts', weight: 1, class: 'allowlist' },
    ],
  };
  const budget = computeBudget(
    [
      { path: 'hot.ts', hunks: 4 },
      { path: 'cold.ts', hunks: 2 },
      { path: 'rogue.ts', hunks: 1 },
    ],
    ledger,
  );
  assert.equal(budget.totalScore, 3 * 4 + 1 * 2);
  assert.deepEqual(budget.offenders, ['rogue.ts']);
  const hot = budget.perFile.find((f) => f.path === 'hot.ts');
  assert.equal(hot.score, 12);
});

test('checkFr30Divergence: hardening diff permitted only while its anchor resolves in the working tree', () => {
  const ledger = {
    rows: [
      {
        path: 'h.ts',
        weight: 1,
        class: 'hardening',
        anchor: { contains: 'CAS guard' },
      },
    ],
  };
  const okResult = checkFr30Divergence(ledger, [{ path: 'h.ts', hunks: 1 }], () => '// CAS guard\nx');
  assert.equal(okResult.ok, true);
  const badResult = checkFr30Divergence(ledger, [{ path: 'h.ts', hunks: 1 }], () => '// refactored away');
  assert.equal(badResult.ok, false);
  assert.match(badResult.findings[0].reason, /HARDENING-ANCHOR-UNRESOLVED/);
});

test('budgetArtifact (T6): machine-readable report carries structural fields only (no wall-clock stamp)', () => {
  const result = checkFr30Divergence(
    { rows: [{ path: 'a.ts', weight: 2, class: 'allowlist' }] },
    [{ path: 'a.ts', hunks: 3 }],
    () => '',
  );
  const artifact = budgetArtifact(result);
  assert.deepEqual(Object.keys(artifact).sort(), ['findings', 'perFile', 'totalScore']);
  assert.equal(artifact.totalScore, 6);
});

test('the reused pinned-ref resolver is imported from the sibling, not re-implemented', () => {
  const gateSource = readFileSync(GATE, 'utf8');
  assert.match(gateSource, /import \{ ensureUpstreamRef, gitShowResolver \} from '\.\/check-patches\.mjs'/);
  // no second fetch path: the gate itself never calls `git fetch`
  assert.doesNotMatch(gateSource, /git['"]?,\s*\[\s*['"]fetch/);
});

test('the sibling patches-drift subsystem still passes its own self-test (untouched behaviour)', () => {
  assert.ok(existsSync(path.join(REPO_ROOT, 'scripts', 'check-patches.mjs')));
  const out = execFileSync('node', [path.join(REPO_ROOT, 'scripts', 'check-patches.mjs'), '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /self-test PASS/);
});
