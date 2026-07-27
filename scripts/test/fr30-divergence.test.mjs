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
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  loadFr30Ledger,
  validateRow,
  validateBaseline,
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

test('the three named hot files carry weight > 1 through computeBudget on the committed ledger', () => {
  const ledger = loadFr30Ledger(REPO_ROOT);
  const HOT = [
    'apps/server/src/core/page/services/page.service.ts',
    'apps/server/src/app.module.ts',
    'apps/server/src/core/auth/strategies/jwt.strategy.ts',
  ];

  // Assert through computeBudget — the path the CI gate actually scores
  // with — NOT through `ledger.rows.find()`. A path present in both the
  // allow-list (weight 3) and ENG-2478's hardening ledger (weight 1) has
  // two rows; `find()` returns the first and would report 3 while the
  // budget silently used 1. One synthetic hunk per hot file makes each
  // file's score equal to its effective weight.
  const budget = computeBudget(
    HOT.map((p) => ({ path: p, hunks: 1 })),
    ledger,
  );

  for (const hot of HOT) {
    const entry = budget.perFile.find((f) => f.path === hot);
    assert.ok(entry, `hot file missing from budget: ${hot}`);
    assert.ok(
      entry.weight > 1,
      `hot file ${hot} must weigh > 1 in the scored budget, got ${entry.weight} (class ${entry.class}) — a weight-1 hardening row for the same path must not downgrade it`,
    );
    assert.equal(entry.score, entry.weight, `score must be weight x hunks for ${hot}`);
  }
});

// ---------------------------------------------------------------------------
// REAL-MODE ENFORCEMENT — the gate must not be an inert no-op in CI.
// These assertions drive `node scripts/check-fr30-divergence.mjs` with no
// --fixture flag: the same invocation the ci.yml step runs.
// ---------------------------------------------------------------------------

function runRealGate(extraArgs = [], cwd = REPO_ROOT) {
  const res = spawnSync('node', [GATE, ...extraArgs], { cwd, encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout}\n${res.stderr}` };
}

test('the committed ledger pins a REAL upstream sha — the gate is activated, not inert', () => {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, 'fr30', 'allowlist.json'), 'utf8'));
  assert.ok(
    typeof raw.pinnedUpstreamSha === 'string' && /^[0-9a-f]{40}$/.test(raw.pinnedUpstreamSha),
    'pinnedUpstreamSha must be a real 40-char commit sha — null makes the CI gate a permanent no-op',
  );
  // and it must actually resolve to a commit in this repo, so CI can diff
  // against it without a network fetch (fetch-depth: 0).
  assert.doesNotThrow(() =>
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${raw.pinnedUpstreamSha}^{commit}`], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    }),
  );
});

test('real mode (the exact ci.yml invocation) exits 0 on the committed tree and prints the budget', () => {
  const { code, out } = runRealGate();
  assert.equal(code, 0, `real-mode gate must be green on the committed tree:\n${out}`);
  assert.match(out, /OK: FR-30 divergence gate/);
  assert.match(out, /Weighted hot-file budget/);
  // Activation proof: the gate really diffed against the pin, so the hot
  // allow-listed files it scored appear in the breakdown.
  assert.match(out, /page\.service\.ts\s+hunks=\d+ weight=3 score=\d+/);
});

test('real mode WRITES the T6 budget artifact (the G1 counter-metric substrate)', () => {
  const outFile = path.join(
    mkdtempSync(path.join(tmpdir(), 'fr30-artifact-')),
    'fr30-budget-report.json',
  );
  const { code } = runRealGate(['--json-out', outFile]);
  assert.equal(code, 0);
  assert.ok(existsSync(outFile), 'real mode must write the budget artifact, not skip it');
  const artifact = JSON.parse(readFileSync(outFile, 'utf8'));
  assert.ok(Array.isArray(artifact.perFile) && artifact.perFile.length > 0);
  assert.equal(typeof artifact.totalScore, 'number');
  assert.ok(artifact.totalScore > 0, 'a real diff against the pin must score above zero');
  assert.equal(typeof artifact.baselineFileCount, 'number');
  assert.equal(typeof artifact.baselineHunkCount, 'number');
  rmSync(path.dirname(outFile), { recursive: true, force: true });
});

test('a NEW off-allow-list upstream edit reds the real gate (AC2, live — not fixture-only)', () => {
  // Pick a real upstream-tracked file that is on neither the allow-list nor
  // the frozen baseline, edit it in a throwaway clone of the working tree,
  // and prove the gate reds. This is the enforcement the null pin defeated.
  const ledger = loadFr30Ledger(REPO_ROOT);
  const pin = ledger.pinnedUpstreamSha;
  const upstreamFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', pin], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  })
    .split('\n')
    .filter(Boolean);
  const excluded = new Set([
    ...ledger.rows.map((r) => r.path),
    ...ledger.preexistingDivergence,
  ]);
  const victim = upstreamFiles.find(
    (p) =>
      p.endsWith('.ts') &&
      !excluded.has(p) &&
      !p.startsWith('apps/server/src/orvex/') &&
      !p.startsWith('packages/@orvex/') &&
      existsSync(path.join(REPO_ROOT, p)),
  );
  assert.ok(victim, 'expected at least one un-diverged upstream .ts file to plant an edit in');

  const original = readFileSync(path.join(REPO_ROOT, victim), 'utf8');
  try {
    writeFileSync(
      path.join(REPO_ROOT, victim),
      `${original}\n// FR-30 gate enforcement probe (test-local, reverted in finally)\n`,
    );
    const { code, out } = runRealGate();
    assert.equal(code, 1, `a new off-allow-list edit to ${victim} must red the gate:\n${out}`);
    assert.match(out, /FAIL: FR-30 divergence gate/);
    assert.match(out, new RegExp(victim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(out, /OFF-ALLOWLIST/);
  } finally {
    writeFileSync(path.join(REPO_ROOT, victim), original);
  }
  // and the tree is clean again -> gate green
  assert.equal(runRealGate().code, 0);
});

test('an inert ledger (pinnedUpstreamSha null) FAILS LOUDLY — never a silent green', () => {
  // The gate reads fr30/allowlist.json relative to its own location, so drive
  // it from a scratch repo root carrying a null-pinned ledger.
  const scratch = mkdtempSync(path.join(tmpdir(), 'fr30-inert-'));
  mkdirSync(path.join(scratch, 'scripts', 'lib'), { recursive: true });
  mkdirSync(path.join(scratch, 'fr30'), { recursive: true });
  for (const f of ['check-fr30-divergence.mjs', 'check-patches.mjs', 'lib/patches-drift.mjs']) {
    copyFileSync(path.join(REPO_ROOT, 'scripts', f), path.join(scratch, 'scripts', f));
  }
  writeFileSync(
    path.join(scratch, 'fr30', 'allowlist.json'),
    JSON.stringify({ pinnedUpstreamSha: null, rows: [] }),
  );
  execFileSync('git', ['init', '-q'], { cwd: scratch });

  const res = spawnSync('node', [path.join(scratch, 'scripts', 'check-fr30-divergence.mjs')], {
    cwd: scratch,
    encoding: 'utf8',
  });
  const out = `${res.stdout}\n${res.stderr}`;
  assert.notEqual(res.status, 0, `an unactivated gate must not exit 0:\n${out}`);
  assert.match(out, /INERT/);
  assert.doesNotMatch(out, /^OK: FR-30/m);
  rmSync(scratch, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The ratchet baseline — pre-existing divergence is counted, never a finding,
// and may only shrink.
// ---------------------------------------------------------------------------

test('computeBudget: a baseline path is reported as baseline, not an offender; a new path offends', () => {
  const ledger = {
    rows: [{ path: 'allowed.ts', weight: 2, class: 'allowlist' }],
    preexistingDivergence: ['legacy.ts'],
  };
  const budget = computeBudget(
    [
      { path: 'allowed.ts', hunks: 1 },
      { path: 'legacy.ts', hunks: 4 },
      { path: 'brand-new.ts', hunks: 1 },
    ],
    ledger,
  );
  assert.deepEqual(budget.offenders, ['brand-new.ts']);
  assert.deepEqual(budget.baseline, [{ path: 'legacy.ts', hunks: 4 }]);
  // the baseline must not silently inflate the weighted allow-list budget
  assert.equal(budget.totalScore, 2);
});

test('every frozen baseline path is a real upstream-tracked file (no invented ratchet entry)', () => {
  const ledger = loadFr30Ledger(REPO_ROOT);
  const upstreamFiles = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', ledger.pinnedUpstreamSha], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
    })
      .split('\n')
      .filter(Boolean),
  );
  assert.ok(ledger.preexistingDivergence.length > 0);
  for (const p of ledger.preexistingDivergence) {
    assert.ok(upstreamFiles.has(p), `baseline path is not in the pinned upstream tree: ${p}`);
  }
  // One disposition per path: a baseline entry is legacy debt and must carry
  // no ledger row at all (allow-list OR hardening). A path governed by a row
  // is already dispositioned; leaving it on the baseline too would be dead
  // ratchet weight that can never shrink.
  const rowPaths = new Set(ledger.rows.map((r) => r.path));
  for (const p of ledger.preexistingDivergence) {
    assert.ok(
      !rowPaths.has(p),
      `path carries a ledger row AND sits on the ratchet baseline (one disposition each): ${p}`,
    );
  }
  // No duplicates — a repeated entry would double-count the counter-metric.
  assert.equal(
    new Set(ledger.preexistingDivergence).size,
    ledger.preexistingDivergence.length,
    'the ratchet baseline carries duplicate paths',
  );
});

test('the ratchet baseline is exhaustive: real mode finds no un-ratified off-allow-list file', () => {
  // If the baseline under-counted, the real gate would already be red; if it
  // over-counted, it would carry entries that no longer diverge. Both are
  // ceiling-integrity failures (❌#10). Assert on SET IDENTITY, not on the
  // count: a count check alone is satisfied by a swap (drop one still-diverging
  // path, add one stale path), which is exactly the silent ceiling-raise ❌#10
  // forbids. So compare the ledger's frozen list against the paths that really
  // diverge against the pin today, both directions.
  const outFile = path.join(mkdtempSync(path.join(tmpdir(), 'fr30-ratchet-')), 'report.json');
  const { code } = runRealGate(['--json-out', outFile]);
  assert.equal(code, 0);
  const artifact = JSON.parse(readFileSync(outFile, 'utf8'));
  const ledger = loadFr30Ledger(REPO_ROOT);
  assert.equal(
    artifact.baselineFileCount,
    ledger.preexistingDivergence.length,
    'every frozen baseline path must still diverge — a stale entry is a ceiling that can never shrink',
  );

  // The real divergence set against the pin, scoped exactly as the gate scopes
  // it: upstream-tracked files only, minus the orvex additive surface.
  const upstreamPaths = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', ledger.pinnedUpstreamSha], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
    })
      .split('\n')
      .filter(Boolean),
  );
  const rowPaths = new Set(ledger.rows.map((r) => r.path));
  const reallyDiverging = execFileSync(
    'git',
    ['diff', '--name-only', ledger.pinnedUpstreamSha, '--', '.'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 },
  )
    .split('\n')
    .filter(Boolean)
    .filter((p) => upstreamPaths.has(p) && isDivergenceScoped(p) && !rowPaths.has(p));

  const frozen = new Set(ledger.preexistingDivergence);
  const stale = [...frozen].filter((p) => !reallyDiverging.includes(p));
  const unratified = reallyDiverging.filter((p) => !frozen.has(p));
  assert.deepEqual(stale, [], `ratchet baseline carries path(s) that no longer diverge: ${stale}`);
  assert.deepEqual(
    unratified,
    [],
    `upstream file(s) diverge outside both the allow-list and the frozen baseline: ${unratified}`,
  );
  rmSync(path.dirname(outFile), { recursive: true, force: true });
});

test('validateBaseline rejects a malformed ratchet baseline (❌#12 shape gate)', () => {
  assert.throws(() => validateBaseline('not-an-array', 't'));
  assert.throws(() => validateBaseline([''], 't'));
  assert.throws(() => validateBaseline([42], 't'));
  assert.deepEqual(validateBaseline(undefined, 't'), []);
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
  assert.deepEqual(Object.keys(artifact).sort(), [
    'baselineFileCount',
    'baselineHunkCount',
    'findings',
    'perFile',
    'totalScore',
  ]);
  assert.equal(artifact.totalScore, 6);
});

test('the reused pinned-ref resolver is imported from the sibling AND actually called', () => {
  const gateSource = readFileSync(GATE, 'utf8');
  // Imported from the sibling — one implementation of the true-external
  // boundary, never a second fetch path (§5c "no duplication of the sibling").
  assert.match(gateSource, /import \{[^}]*\bensureUpstreamRef\b[^}]*\} from '\.\/check-patches\.mjs'/);
  assert.doesNotMatch(gateSource, /git['"]?,\s*\[\s*['"]fetch/);

  // ...and genuinely USED, not a cosmetic import. Grepping the import line
  // alone let a dead `gitShowResolver` import satisfy this contract while
  // nothing called it, so assert on a real call site.
  const importLineCount = (gateSource.match(/\bensureUpstreamRef\b/g) || []).length;
  assert.ok(
    importLineCount >= 2,
    'ensureUpstreamRef is imported but never called — a dead import cannot satisfy the reuse contract',
  );
  assert.match(gateSource, /ensureUpstreamRef\(\s*REPO_ROOT/);

  // No import in this gate may be dead: every named binding taken from the
  // sibling must appear at a call site, not just in the import statement.
  const named = gateSource.match(/import \{([^}]*)\} from '\.\/check-patches\.mjs'/);
  assert.ok(named, 'expected a named import from the sibling');
  for (const sym of named[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    const uses = (gateSource.match(new RegExp(`\\b${sym}\\b`, 'g')) || []).length;
    assert.ok(uses >= 2, `dead import: '${sym}' is imported from the sibling but never used`);
  }
});

test('the sibling patches-drift subsystem still passes its own self-test (untouched behaviour)', () => {
  assert.ok(existsSync(path.join(REPO_ROOT, 'scripts', 'check-patches.mjs')));
  const out = execFileSync('node', [path.join(REPO_ROOT, 'scripts', 'check-patches.mjs'), '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /self-test PASS/);
});
