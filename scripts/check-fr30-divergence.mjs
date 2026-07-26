#!/usr/bin/env node
//
// check-fr30-divergence.mjs — the FR-30 divergence gate (ENG-2477).
//
// Question this gate answers (DISTINCT from the sibling patches-drift gate,
// scripts/check-patches.mjs / ENG-1649, which asks "has any DECLARED edit's
// context drifted, and is every inline edit declared?"): is the SET of
// upstream files touched at all bounded to the FROZEN 13-row allow-list
// (fr30/allowlist.json), budgeted by WEIGHTED conflict-hunks — with the
// A-HARDENING class (ENG-2478, docs/runbooks/hardening-allowlist.json)
// recognised via its per-item upstream anchors rather than flagged as
// un-permitted divergence?
//
// Scope rule (A-THIN): only files that exist in the pinned upstream tree are
// governed; anything under apps/server/src/orvex/** or packages/@orvex/** is
// additive fork surface and NEVER counts against the divergence budget.
//
// Usage:
//   node scripts/check-fr30-divergence.mjs                # the CI gate
//   node scripts/check-fr30-divergence.mjs --self-test    # committed fixtures
//   node scripts/check-fr30-divergence.mjs --fixture <dir> # one fixture, real CLI
//   node scripts/check-fr30-divergence.mjs --json-out <f> # budget artifact (T6)
//
// Exit codes (mirrors the sibling's convention): 0 clean, 1 divergence
// finding (off-allow-list file, or a hardening item whose anchor no longer
// resolves), 2 INFRA-ERROR (pinned ref unreachable — never conflated with a
// real finding, never a silent "clean").

import { readFileSync, existsSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { ensureUpstreamRef, gitShowResolver } from './check-patches.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = 'fr30/allowlist.json';
const HARDENING_LEDGER_PATH = 'docs/runbooks/hardening-allowlist.json';

// A-THIN: additive fork scopes, excluded from the divergence budget entirely.
const EXCLUDED_SCOPES = ['apps/server/src/orvex/', 'packages/@orvex/'];

const VALID_CLASSES = new Set(['allowlist', 'hardening']);

/**
 * loadFr30Ledger(repoRoot) -> { pinnedUpstreamSha, rows }
 *
 * Reads the frozen 13-row allow-list (fr30/allowlist.json) and, when the
 * ENG-2478 hardening ledger exists, folds its 15 items in as
 * `class: "hardening"` rows (path + anchor from each item's own upstream
 * anchor). Every row is shape-validated immediately after JSON.parse
 * (CS ❌#12 — never passed downstream as raw untyped JSON).
 */
export function loadFr30Ledger(repoRoot) {
  const ledgerFile = path.join(repoRoot, LEDGER_PATH);
  const parsed = JSON.parse(readFileSync(ledgerFile, 'utf8'));
  const pinnedUpstreamSha = parsed.pinnedUpstreamSha ?? null;
  const rows = (parsed.rows || []).map((r) => validateRow(r, LEDGER_PATH));

  const hardeningFile = path.join(repoRoot, HARDENING_LEDGER_PATH);
  if (existsSync(hardeningFile)) {
    const hardening = JSON.parse(readFileSync(hardeningFile, 'utf8'));
    for (const item of hardening.items || []) {
      rows.push(
        validateRow(
          {
            path: item.anchor?.path,
            weight: 1,
            class: 'hardening',
            anchor: { contains: item.anchor?.contains },
          },
          HARDENING_LEDGER_PATH,
        ),
      );
    }
  }

  return { pinnedUpstreamSha, rows };
}

/** validateRow — runtime shape check (❌#12): path string, weight number,
 * class one of the two enum values, hardening rows carry an anchor. */
export function validateRow(row, sourceName) {
  if (typeof row.path !== 'string' || row.path.length === 0) {
    throw new Error(`${sourceName}: row with missing/empty path`);
  }
  const weight = row.weight ?? 1;
  if (typeof weight !== 'number' || !Number.isFinite(weight)) {
    throw new Error(`${sourceName}: row '${row.path}' has a non-numeric weight`);
  }
  const cls = row.class ?? 'allowlist';
  if (!VALID_CLASSES.has(cls)) {
    throw new Error(`${sourceName}: row '${row.path}' has unknown class '${cls}'`);
  }
  if (cls === 'hardening') {
    if (typeof row.anchor?.contains !== 'string' || row.anchor.contains.length === 0) {
      throw new Error(
        `${sourceName}: hardening row '${row.path}' is missing its anchor.contains marker`,
      );
    }
  }
  return { path: row.path, weight, class: cls, anchor: row.anchor, note: row.note };
}

/** isDivergenceScoped — false for the additive fork scopes (A-THIN). */
export function isDivergenceScoped(filePath) {
  return !EXCLUDED_SCOPES.some((scope) => filePath.startsWith(scope));
}

/**
 * computeBudget(diffResult, ledger) -> budget
 *
 * diffResult: Array<{path, hunks}> — the upstream-scoped files that differ
 * from the pinned upstream tree, with their conflict-hunk counts (git's own
 * diff is the hunk authority; this function only does the weighted
 * arithmetic + ledger disposition).
 *
 * Returns { perFile: [{path, hunks, weight, score, class}], totalScore,
 * offenders: [paths not covered by any ledger row] }.
 */
export function computeBudget(diffResult, ledger) {
  // AC3 — a path may appear in BOTH ledgers (the 13-row allow-list at its
  // hot-file weight, and ENG-2478's hardening ledger at weight 1). The
  // hardening rows are appended last, so a naive last-write-wins Map would
  // silently DOWNGRADE a hot file (page.service.ts, main.ts) to weight 1 and
  // defeat the weighted budget this gate exists to enforce. Highest weight
  // wins; the surviving row keeps its own class for reporting.
  const rowByPath = new Map();
  for (const r of ledger.rows) {
    const prior = rowByPath.get(r.path);
    if (!prior || r.weight > prior.weight) {
      rowByPath.set(r.path, r);
    }
  }
  const perFile = [];
  const offenders = [];
  let totalScore = 0;

  for (const { path: filePath, hunks } of diffResult) {
    if (!isDivergenceScoped(filePath)) continue; // budget delta 0 for orvex scopes
    const row = rowByPath.get(filePath);
    if (!row) {
      offenders.push(filePath);
      continue;
    }
    const score = row.weight * hunks;
    totalScore += score;
    perFile.push({ path: filePath, hunks, weight: row.weight, score, class: row.class });
  }

  return { perFile, totalScore, offenders };
}

/**
 * checkFr30Divergence(ledger, diffResult, workingResolver) -> Report
 *
 * The full disposition: computeBudget's offenders red the gate; a
 * `class: "hardening"` row's diff is permitted ONLY while its recorded
 * anchor still resolves in the working tree (workingResolver(path) returns
 * the file's current content) — an anchor that no longer resolves is a loud
 * finding naming the item, never a silent pass.
 */
export function checkFr30Divergence(ledger, diffResult, workingResolver) {
  const budget = computeBudget(diffResult, ledger);
  const findings = budget.offenders.map((p) => ({
    path: p,
    reason: 'OFF-ALLOWLIST: upstream file differs but is not on the frozen 13-row allow-list',
  }));

  for (const entry of budget.perFile) {
    if (entry.class !== 'hardening') continue;
    const row = ledger.rows.find((r) => r.path === entry.path && r.class === 'hardening');
    const content = workingResolver(entry.path);
    if (content === null || content === undefined || !content.includes(row.anchor.contains)) {
      findings.push({
        path: entry.path,
        reason: `HARDENING-ANCHOR-UNRESOLVED: hardening item's anchor marker not found in the working tree ('${row.anchor.contains}')`,
      });
    }
  }

  return { budget, findings, ok: findings.length === 0 };
}

/** formatFr30Report — the printed remediation report (stable shape: the DoD
 * test asserts on these structural lines, never internal symbols). */
export function formatFr30Report(result) {
  const lines = [];
  if (result.ok) {
    lines.push('OK: FR-30 divergence gate — divergence bounded to the frozen allow-list.');
  } else {
    lines.push('FAIL: FR-30 divergence gate');
  }
  lines.push('');
  lines.push('Weighted hot-file budget (weight x hunks):');
  for (const f of result.budget.perFile) {
    lines.push(
      `  - ${f.path}  hunks=${f.hunks} weight=${f.weight} score=${f.score} class=${f.class}`,
    );
  }
  lines.push(`  total score: ${result.budget.totalScore}`);
  lines.push('');
  if (result.findings.length > 0) {
    lines.push('Findings:');
    for (const f of result.findings) {
      lines.push(`  - ${f.path}`);
      lines.push(`      ${f.reason}`);
      lines.push(
        '      remediation: revert the edit, move it into orvex/** additive surface,',
      );
      lines.push(
        '        or (with a stated architectural reason, never silently) amend fr30/allowlist.json.',
      );
    }
    lines.push('');
    lines.push(`${result.findings.length} finding(s).`);
  }
  return lines.join('\n');
}

/** budgetArtifact — the machine-readable trend substrate (T6): per-file
 * weight/hunks/score + cumulative score. Structural fields only — no
 * wall-clock stamp, so runs are byte-comparable. */
export function budgetArtifact(result) {
  return {
    perFile: result.budget.perFile,
    totalScore: result.budget.totalScore,
    findings: result.findings,
  };
}

// ---------------------------------------------------------------------------
// CLI shell — git access lives ONLY here (mirrors the sibling's split).
// ---------------------------------------------------------------------------

function countHunks(diffText) {
  return diffText.split('\n').filter((l) => l.startsWith('@@')).length;
}

/** validateLedgerRowsExist — 5c ledger-existence gate: every allow-list row's
 * path resolves via `git cat-file -e HEAD:<path>`; a stale/renamed row fails
 * the gate itself, never silently passing. */
function validateLedgerRowsExist(repoRoot, ledger) {
  const missing = [];
  for (const row of ledger.rows) {
    try {
      execFileSync('git', ['cat-file', '-e', `HEAD:${row.path}`], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
    } catch {
      missing.push(row.path);
    }
  }
  return missing;
}

function realDiffResult(repoRoot, sha) {
  const upstreamPaths = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', sha], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean),
  );
  const changed = execFileSync('git', ['diff', '--name-only', sha, '--', '.'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    // only files that exist upstream can be governed in this sense
    .filter((p) => upstreamPaths.has(p))
    .filter(isDivergenceScoped);

  return changed.map((p) => {
    const diff = execFileSync('git', ['diff', '-U0', sha, '--', p], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return { path: p, hunks: countHunks(diff) };
  });
}

function runGate({ jsonOut } = {}) {
  const ledger = loadFr30Ledger(REPO_ROOT);

  const missing = validateLedgerRowsExist(REPO_ROOT, ledger);
  if (missing.length > 0) {
    console.error('FAIL: FR-30 divergence gate — ledger row(s) do not resolve at HEAD:');
    for (const m of missing) console.error(`  - ${m}`);
    return 1;
  }

  if (!ledger.pinnedUpstreamSha) {
    console.log(
      'OK: FR-30 divergence gate — not yet activated (pinnedUpstreamSha null); ledger rows validated against HEAD.',
    );
    return 0;
  }

  const upstreamOk = ensureUpstreamRef(REPO_ROOT, ledger.pinnedUpstreamSha);
  if (!upstreamOk) {
    console.error(
      `INFRA-ERROR: could not fetch the pinned upstream ref (${ledger.pinnedUpstreamSha}) via the 'upstream' remote.`,
    );
    return 2;
  }

  const diffResult = realDiffResult(REPO_ROOT, ledger.pinnedUpstreamSha);
  const workingResolver = (p) => {
    const abs = path.join(REPO_ROOT, p);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };
  const result = checkFr30Divergence(ledger, diffResult, workingResolver);

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(budgetArtifact(result), null, 2));
  }

  const text = formatFr30Report(result);
  if (result.ok) {
    console.log(text);
    return 0;
  }
  console.error(text);
  return 1;
}

// ---------------------------------------------------------------------------
// Fixture mode — the DoD test drives the REAL CLI over committed synthetic
// fixture trees (scripts/test/fixtures/fr30-divergence/<name>/): a
// `ledger.json` plus an `upstream/` and a `working/` tree. Never a real
// Docmost checkout; never a network fetch. A fixture whose `upstream/` dir is
// absent simulates an unreachable pinned ref -> INFRA-ERROR exit 2.
// ---------------------------------------------------------------------------

function listFilesRecursive(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) {
      out.push(...listFilesRecursive(abs, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function fixtureHunks(upstreamFile, workingFile) {
  // git's own diff algorithm is the hunk authority (never re-implemented);
  // --no-index exits 1 on differences, which is not an error here.
  const res = spawnSync(
    'git',
    ['diff', '--no-index', '-U0', '--', upstreamFile, workingFile],
    { encoding: 'utf8' },
  );
  if (res.error) throw res.error;
  return countHunks(res.stdout || '');
}

export function runFixture(fixtureDir, { jsonOut } = {}) {
  const ledgerFile = path.join(fixtureDir, 'ledger.json');
  const parsed = JSON.parse(readFileSync(ledgerFile, 'utf8'));
  const ledger = {
    pinnedUpstreamSha: parsed.pinnedUpstreamSha ?? 'fixture-pin',
    rows: (parsed.rows || []).map((r) => validateRow(r, `fixture:${path.basename(fixtureDir)}`)),
  };

  const upstreamDir = path.join(fixtureDir, 'upstream');
  if (!existsSync(upstreamDir)) {
    console.error(
      'INFRA-ERROR: could not resolve the pinned upstream tree for this fixture (simulated unreachable ref).',
    );
    return 2;
  }
  const workingDir = path.join(fixtureDir, 'working');

  const upstreamPaths = listFilesRecursive(upstreamDir);
  const diffResult = [];
  for (const rel of upstreamPaths) {
    if (!isDivergenceScoped(rel)) continue;
    const upstreamFile = path.join(upstreamDir, rel);
    const workingFile = path.join(workingDir, rel);
    if (!existsSync(workingFile)) {
      diffResult.push({ path: rel, hunks: 1 }); // deleted upstream file = divergence
      continue;
    }
    const upstreamText = readFileSync(upstreamFile, 'utf8');
    const workingText = readFileSync(workingFile, 'utf8');
    if (upstreamText !== workingText) {
      diffResult.push({ path: rel, hunks: fixtureHunks(upstreamFile, workingFile) });
    }
  }

  const workingResolver = (p) => {
    const abs = path.join(workingDir, p);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };

  const result = checkFr30Divergence(ledger, diffResult, workingResolver);
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(budgetArtifact(result), null, 2));
  }
  const text = formatFr30Report(result);
  if (result.ok) {
    console.log(text);
    return 0;
  }
  console.error(text);
  return 1;
}

function runSelfTest() {
  const fixturesDir = path.join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'fr30-divergence');
  const expectations = [
    ['clean', 0],
    ['off-allowlist', 1],
    ['orvex-scoped', 0],
    ['hardening', 0],
    ['hardening-broken', 1],
    ['infra-error', 2],
  ];
  let ok = true;
  for (const [name, expected] of expectations) {
    const code = runFixture(path.join(fixturesDir, name));
    if (code !== expected) {
      console.error(`self-test FAIL: fixture '${name}' expected exit ${expected}, got ${code}`);
      ok = false;
    }
  }
  if (ok) {
    console.log(
      'self-test PASS — clean 0, off-allowlist 1, orvex-scoped 0, hardening 0, hardening-broken 1, infra-error 2.',
    );
    return 0;
  }
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutIdx = args.indexOf('--json-out');
  const jsonOut = jsonOutIdx >= 0 ? args[jsonOutIdx + 1] : undefined;
  let exitCode;
  if (args.includes('--self-test')) {
    exitCode = runSelfTest();
  } else if (args.includes('--fixture')) {
    const dir = args[args.indexOf('--fixture') + 1];
    exitCode = runFixture(path.resolve(dir), { jsonOut });
  } else {
    exitCode = runGate({ jsonOut });
  }
  process.exit(exitCode);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
