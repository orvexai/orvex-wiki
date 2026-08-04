#!/usr/bin/env node
//
// dry-run-overlay-import.mjs — the ENG-2478 overlay-rebase import runbook's
// dry-run harness + hardening-ledger validator.
//
// The runbook (docs/runbooks/overlay-rebase-import.md) is a GATED sequence:
// this harness walks its six stages IN ORDER against committed fixture
// inputs (hermetic — a committed fixture tree stands in for "a new tag";
// never a live upstream fetch, never a real deploy) and STOPS LOUDLY at the
// first failed stage, naming it — it never proceeds past a failure and
// never reaches a real deploy (deploy is human-gated, outside the six
// stages by construction).
//
// Usage:
//   node scripts/dry-run-overlay-import.mjs --validate-ledger
//       validate docs/runbooks/hardening-allowlist.json against the tree:
//       exactly 18 items, every anchor resolves (path exists + marker
//       present). Exit 1 names each unresolved item.
//   node scripts/dry-run-overlay-import.mjs --fixture <dir>
//       walk the six stages against a fixture input dir. Exit 1 names the
//       failed stage.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFixture as runFr30Fixture } from './check-fr30-divergence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const HARDENING_LEDGER_PATH = 'docs/runbooks/hardening-allowlist.json';
// Raised 15 -> 18 under ENG-3287 (the three null-userAtom client guards from
// PR #148 admitted to the A-HARDENING class). This constant is the
// no-silent-addition tripwire: growing the ledger MUST be a deliberate,
// reviewed edit here as well.
const EXPECTED_ITEM_COUNT = 18;

/** The six runbook stages, fixed order (FR-W23). Deploy is deliberately NOT
 * a stage: it is the human-gated action after the sequence completes. */
export const STAGES = [
  'pull-tag',
  'replay-patch-set',
  'regenerate-db-types',
  'append-orvex-migrations',
  'seam-contract-tests',
  'fr30-divergence-gate',
];

/** The NAMED, NOT-applied cosmetics class (FR-W24): never re-applied on
 * import, distinct from both the 13-row allow-list and the hardening class. */
export const COSMETICS_EXCLUDED = ['swagger-tags', 'log-level-tuning', 'micro-fixes'];

/**
 * validateHardeningLedger(repoRoot, ledgerPath?) -> {ok, itemCount, errors}
 *
 * Shape-validates every entry immediately after JSON.parse (CS ❌#12: name,
 * anchor.path, anchor.contains, description all present and string-typed)
 * and resolves each anchor against the REAL tree: the anchored file must
 * exist and contain the recorded marker. Every failure NAMES its item.
 */
export function validateHardeningLedger(repoRoot, ledgerPath = HARDENING_LEDGER_PATH) {
  const abs = path.isAbsolute(ledgerPath) ? ledgerPath : path.join(repoRoot, ledgerPath);
  const errors = [];
  let items = [];
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf8'));
    items = parsed.items || [];
  } catch (err) {
    return { ok: false, itemCount: 0, errors: [{ item: '(ledger)', problem: `unreadable: ${err.message}` }] };
  }

  for (const item of items) {
    const name = typeof item.name === 'string' && item.name.length > 0 ? item.name : '(unnamed item)';
    if (name === '(unnamed item)') {
      errors.push({ item: name, problem: 'missing string name' });
      continue;
    }
    if (typeof item.description !== 'string' || item.description.length === 0) {
      errors.push({ item: name, problem: 'missing string description' });
    }
    const anchorPath = item.anchor?.path;
    const marker = item.anchor?.contains;
    if (typeof anchorPath !== 'string' || anchorPath.length === 0) {
      errors.push({ item: name, problem: 'missing anchor.path' });
      continue;
    }
    if (typeof marker !== 'string' || marker.length === 0) {
      errors.push({ item: name, problem: 'missing anchor.contains marker' });
      continue;
    }
    const anchorAbs = path.join(repoRoot, anchorPath);
    if (!existsSync(anchorAbs)) {
      errors.push({ item: name, problem: `anchor path does not exist: ${anchorPath}` });
      continue;
    }
    const content = readFileSync(anchorAbs, 'utf8');
    if (!content.includes(marker)) {
      errors.push({ item: name, problem: `anchor marker not found in ${anchorPath}: '${marker}'` });
    }
  }

  if (items.length !== EXPECTED_ITEM_COUNT) {
    errors.push({
      item: '(ledger)',
      problem: `expected exactly ${EXPECTED_ITEM_COUNT} items, found ${items.length}`,
    });
  }

  return { ok: errors.length === 0, itemCount: items.length, errors };
}

// ---------------------------------------------------------------------------
// The six stage implementations, each a small REAL check over fixture inputs.
// ---------------------------------------------------------------------------

function stagePullTag(fixtureDir) {
  const tagDir = path.join(fixtureDir, 'new-tag');
  if (!existsSync(tagDir) || readdirSync(tagDir).length === 0) {
    return { ok: false, detail: 'fixture new-tag tree missing or empty (upstream tag not pulled)' };
  }
  return { ok: true, detail: `new-tag tree present (${readdirSync(tagDir).length} entries)` };
}

function stageReplayPatchSet(fixtureDir) {
  const file = path.join(fixtureDir, 'patch-set.json');
  if (!existsSync(file)) return { ok: false, detail: 'patch-set.json missing' };
  const entries = JSON.parse(readFileSync(file, 'utf8')).entries || [];
  const applied = [];
  const skippedCosmetics = [];
  for (const e of entries) {
    if (e.class === 'cosmetics') {
      skippedCosmetics.push(e.name); // the NAMED, NOT-applied class — never replayed
    } else if (e.class === 'allowlist' || e.class === 'hardening') {
      applied.push(e.name);
    } else {
      return { ok: false, detail: `patch-set entry '${e.name}' has unknown class '${e.class}'` };
    }
  }
  return {
    ok: true,
    detail: `applied ${applied.length} (allowlist+hardening); skipped cosmetics: [${skippedCosmetics.join(', ')}]`,
    applied,
    skippedCosmetics,
  };
}

function stageRegenerateDbTypes(fixtureDir) {
  const source = path.join(fixtureDir, 'new-tag', 'db.d.ts');
  const regenerated = path.join(fixtureDir, 'regenerated', 'db.d.ts');
  if (!existsSync(source) || !existsSync(regenerated)) {
    return { ok: false, detail: 'db.d.ts missing from new-tag/ or regenerated/' };
  }
  if (readFileSync(source, 'utf8') !== readFileSync(regenerated, 'utf8')) {
    return { ok: false, detail: 'regenerated db.d.ts is not verbatim-identical to the new tag schema types' };
  }
  return { ok: true, detail: 'db.d.ts regenerated verbatim' };
}

function stageAppendOrvexMigrations(fixtureDir) {
  const file = path.join(fixtureDir, 'migrations.json');
  if (!existsSync(file)) return { ok: false, detail: 'migrations.json missing' };
  const { upstreamTip, orvex } = JSON.parse(readFileSync(file, 'utf8'));
  const outOfOrder = (orvex || []).filter((m) => !(m > upstreamTip));
  if (outOfOrder.length > 0) {
    return {
      ok: false,
      detail: `orvex migration(s) not appended AFTER the new tip (${upstreamTip}): ${outOfOrder.join(', ')}`,
    };
  }
  return { ok: true, detail: `${(orvex || []).length} orvex migration(s) append after tip ${upstreamTip}` };
}

function stageSeamContractTests(fixtureDir) {
  const file = path.join(fixtureDir, 'seam-results.json');
  if (!existsSync(file)) return { ok: false, detail: 'seam-results.json missing' };
  const results = JSON.parse(readFileSync(file, 'utf8'));
  for (const suite of ['seamContractTests', 'dfmGoldenFixtures']) {
    if (results[suite] !== 'pass') {
      return { ok: false, detail: `${suite}: ${results[suite] ?? 'missing'} (red stops the import)` };
    }
  }
  return { ok: true, detail: 'seam contract tests + DfM golden fixtures pass' };
}

function stageFr30Gate(fixtureDir) {
  const gateFixture = path.join(fixtureDir, 'fr30');
  if (!existsSync(gateFixture)) return { ok: false, detail: 'fr30/ gate fixture missing' };
  // the REAL ENG-2477 gate, not a re-implementation
  const code = runFr30Fixture(gateFixture);
  if (code !== 0) return { ok: false, detail: `FR-30 divergence gate exited ${code}` };
  return { ok: true, detail: 'FR-30 divergence gate clean' };
}

const STAGE_IMPLS = {
  'pull-tag': stagePullTag,
  'replay-patch-set': stageReplayPatchSet,
  'regenerate-db-types': stageRegenerateDbTypes,
  'append-orvex-migrations': stageAppendOrvexMigrations,
  'seam-contract-tests': stageSeamContractTests,
  'fr30-divergence-gate': stageFr30Gate,
};

/**
 * runDryRun(fixtureDir) -> {stages, completed, failedStage, reachedDeployGate}
 *
 * Walks the six stages in their fixed order; STOPS at the first failure
 * (later stages are never invoked — the never-white-screen NFR). Only a run
 * that completes all six reaches the (human-gated, not executed) deploy gate.
 */
export function runDryRun(fixtureDir) {
  const stages = [];
  for (const name of STAGES) {
    const result = STAGE_IMPLS[name](fixtureDir);
    stages.push({ name, ok: result.ok, detail: result.detail, ...result });
    if (!result.ok) {
      return { stages, completed: false, failedStage: name, reachedDeployGate: false };
    }
  }
  return { stages, completed: true, failedStage: null, reachedDeployGate: true };
}

// ---------------------------------------------------------------------------
// CLI shell
// ---------------------------------------------------------------------------

function cliValidateLedger() {
  const result = validateHardeningLedger(REPO_ROOT);
  if (result.ok) {
    console.log(
      `OK: hardening allow-list — ${result.itemCount}/${EXPECTED_ITEM_COUNT} items, every anchor resolves.`,
    );
    return 0;
  }
  console.error('FAIL: hardening allow-list validation');
  for (const e of result.errors) {
    console.error(`  - item '${e.item}': ${e.problem}`);
  }
  return 1;
}

function cliDryRun(dir) {
  const run = runDryRun(path.resolve(dir));
  for (const s of run.stages) {
    console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name} — ${s.detail}`);
  }
  if (!run.completed) {
    console.error(`STOPPED at stage '${run.failedStage}' — the import never proceeds past a failed stage.`);
    return 1;
  }
  console.log('All 6 stages complete. deploy: human-gated — dry-run stops short by construction.');
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  let exitCode;
  if (args.includes('--validate-ledger')) {
    exitCode = cliValidateLedger();
  } else if (args.includes('--fixture')) {
    exitCode = cliDryRun(args[args.indexOf('--fixture') + 1]);
  } else {
    console.error('usage: dry-run-overlay-import.mjs --validate-ledger | --fixture <dir>');
    exitCode = 2;
  }
  process.exit(exitCode);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
