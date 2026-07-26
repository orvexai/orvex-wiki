// TestHardeningAllowlistClassCoverage — the ENG-2478 DoD gate + fixture-
// driven sub-tests.
//
// Behaviour-through-interface (CS §4.2): asserts on the REAL committed
// ledger's own shape (15 entries, each with a resolvable anchor) and on the
// validator's/harness's pass-fail OUTCOMES + the FR-30 gate's recognition
// outcome — never on internal parsing-helper names. No mock of the ledger
// reader (CS §5 ❌#4): the real committed docs/runbooks/hardening-allowlist.json
// is loaded and validated against the real tree; the negative case uses a
// committed, deliberately-broken fixture ledger. Deterministic: static
// committed content, no network call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  STAGES,
  COSMETICS_EXCLUDED,
  validateHardeningLedger,
  runDryRun,
} from '../dry-run-overlay-import.mjs';
import { loadFr30Ledger, checkFr30Divergence } from '../check-fr30-divergence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HARNESS = path.join(REPO_ROOT, 'scripts', 'dry-run-overlay-import.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'overlay-import');
const RUNBOOK = path.join(REPO_ROOT, 'docs', 'runbooks', 'overlay-rebase-import.md');
const LEDGER = path.join(REPO_ROOT, 'docs', 'runbooks', 'hardening-allowlist.json');

// ---------------------------------------------------------------------------
// TestHardeningAllowlistClassCoverage — the DoD gate (AC1 + AC5)
// ---------------------------------------------------------------------------

test('TestHardeningAllowlistClassCoverage: the real committed ledger has exactly 15 items, every anchor resolvable', () => {
  const result = validateHardeningLedger(REPO_ROOT);
  assert.deepEqual(result.errors, []);
  assert.equal(result.itemCount, 15);
  assert.equal(result.ok, true);
});

test('TestHardeningAllowlistClassCoverage: all 15 architecture-named items are present by name', () => {
  const items = JSON.parse(readFileSync(LEDGER, 'utf8')).items.map((i) => i.name);
  for (const name of [
    'ifVersion CAS',
    'unique-slug retry',
    'copy-title dedup',
    'move-cycle guard',
    'attachment-copy resilience',
    'unique-title-per-parent index',
    'real-IP handling',
    'user-throttler key fix',
    'authMethod classification',
    'attachment delete-authz',
    'filename sanitising',
    'postgres-URL normaliser',
    'streaming-response bypass',
    'FK/query-path index migrations',
    'slug-rewrite-on-title-change',
  ]) {
    assert.ok(items.includes(name), `missing hardening item: ${name}`);
  }
});

test('TestBrokenAnchorFailsLedgerValidationNamingItem (AC5): a broken fixture ledger fails LOUDLY, naming the item', () => {
  const result = validateHardeningLedger(REPO_ROOT, path.join(FIXTURES, 'broken-ledger.json'));
  assert.equal(result.ok, false);
  const named = result.errors.find((e) => e.item === 'move-cycle guard');
  assert.ok(named, 'the unresolved item must be NAMED in the failure');
  assert.match(named.problem, /does not exist/);
  // and the broken fixture also fails the exactly-15 count check
  assert.ok(result.errors.some((e) => e.problem.includes('expected exactly 15')));
});

test('the ledger validator CLI (--validate-ledger) exits 0 against the real tree', () => {
  const res = spawnSync('node', [HARNESS, '--validate-ledger'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /OK: hardening allow-list — 15\/15 items/);
});

// ---------------------------------------------------------------------------
// AC2 — the runbook's six stages, present and ordered; dry-run completes
// ---------------------------------------------------------------------------

test('TestRunbookSixStagesPresentAndOrdered: the runbook document names the 6 stages in the fixed order', () => {
  const doc = readFileSync(RUNBOOK, 'utf8');
  let lastIndex = -1;
  for (const stage of STAGES) {
    const idx = doc.indexOf(`**${stage}**`);
    assert.ok(idx >= 0, `runbook does not name stage '${stage}'`);
    assert.ok(idx > lastIndex, `stage '${stage}' appears out of order in the runbook`);
    lastIndex = idx;
  }
  assert.equal(STAGES.length, 6);
});

test('TestDryRunHarnessCompletesAllStagesOnCleanFixture (AC2): all 6 stages complete, in order, reaching the deploy gate', () => {
  const run = runDryRun(path.join(FIXTURES, 'clean'));
  assert.equal(run.completed, true);
  assert.equal(run.failedStage, null);
  assert.equal(run.reachedDeployGate, true);
  assert.deepEqual(
    run.stages.map((s) => s.name),
    STAGES,
  );
  assert.ok(run.stages.every((s) => s.ok));
});

test('dry-run CLI over the clean fixture exits 0 and stops short of any real deploy', () => {
  const res = spawnSync('node', [HARNESS, '--fixture', path.join(FIXTURES, 'clean')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /All 6 stages complete/);
  assert.match(res.stdout, /deploy: human-gated — dry-run stops short by construction/);
});

// ---------------------------------------------------------------------------
// AC3 — cosmetics: a NAMED, NOT-applied class
// ---------------------------------------------------------------------------

test('TestCosmeticsExplicitlyExcludedFromPatchSet (AC3): the replay stage skips cosmetics-tagged changes', () => {
  const run = runDryRun(path.join(FIXTURES, 'clean'));
  const replay = run.stages.find((s) => s.name === 'replay-patch-set');
  assert.deepEqual(replay.skippedCosmetics, ['swagger-tags']);
  assert.ok(!replay.applied.includes('swagger-tags'));
  // the named exclusion class is itself explicit, not silently absent
  assert.deepEqual(COSMETICS_EXCLUDED, ['swagger-tags', 'log-level-tuning', 'micro-fixes']);
  const doc = readFileSync(RUNBOOK, 'utf8');
  assert.match(doc, /Never re-applied/);
});

// ---------------------------------------------------------------------------
// AC4 — cross-wire: the REAL FR-30 gate recognises the REAL hardening class
// ---------------------------------------------------------------------------

test('TestHardeningAnchorEditNotFlaggedByFr30Gate (AC4): a REAL hardening item edited within its anchor is clean', () => {
  // the real gate loader now folds the committed 15-item class in as
  // class:"hardening" rows — not a fixture stand-in.
  const ledger = loadFr30Ledger(REPO_ROOT);
  const hardeningRows = ledger.rows.filter((r) => r.class === 'hardening');
  assert.equal(hardeningRows.length, 15);

  const itemPath = 'apps/server/src/core/page/if-version.util.ts';
  assert.ok(hardeningRows.some((r) => r.path === itemPath));

  // simulate the item's file diffing from upstream; the working tree is the
  // REAL current file (which carries its anchor marker) -> not flagged.
  const realRead = (p) => readFileSync(path.join(REPO_ROOT, p), 'utf8');
  const clean = checkFr30Divergence(ledger, [{ path: itemPath, hunks: 2 }], realRead);
  assert.equal(clean.ok, true, JSON.stringify(clean.findings));

  // negative control: strip the anchor from the working content -> flagged,
  // proving the clean result above is anchor-recognition, not a vacuous pass.
  const stripped = checkFr30Divergence(ledger, [{ path: itemPath, hunks: 2 }], () => '// anchor gone');
  assert.equal(stripped.ok, false);
  assert.match(stripped.findings[0].reason, /HARDENING-ANCHOR-UNRESOLVED/);
});

// ---------------------------------------------------------------------------
// NFR — never-white-screen: loud stop on a failed stage
// ---------------------------------------------------------------------------

test('TestDryRunStopsLoudlyOnFailedStage (NFR): a red seam stage stops the run, names itself, and later stages never run', () => {
  const run = runDryRun(path.join(FIXTURES, 'failing-seam'));
  assert.equal(run.completed, false);
  assert.equal(run.failedStage, 'seam-contract-tests');
  assert.equal(run.reachedDeployGate, false);
  // the FR-30 gate stage (stage 6) must never have been invoked
  assert.ok(!run.stages.some((s) => s.name === 'fr30-divergence-gate'));

  const res = spawnSync('node', [HARNESS, '--fixture', path.join(FIXTURES, 'failing-seam')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /STOPPED at stage 'seam-contract-tests'/);
});

// ---------------------------------------------------------------------------
// NFR — honesty grep over the runbook + ledger
// ---------------------------------------------------------------------------

test('TestNoPlaceholderOrTodoInRunbookOrLedger: honesty grep', () => {
  for (const file of [RUNBOOK, LEDGER]) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /TODO|FIXME|placeholder/i, `${file} carries a placeholder marker`);
  }
});
