#!/usr/bin/env node
//
// check-patches.mjs — patches-drift CI gate + frozen inline-edit allow-list
// (ENG-1649, split from ENG-1604 AC6/AC7). Design: docs/design/patches-drift-ci-design.md
//
// AC6 (patch-drift gate): every orvex patch/inline-edit context still matches
//   current upstream (+/-5-line fuzzy) or the job fails with a remediation report.
// AC7 (frozen inline-edit allow-list): only the frozen set of upstream files
//   may be inline-edited; CI fails on an undeclared upstream-file edit.
//
// Usage:
//   node scripts/check-patches.mjs              # the CI gate (drift + allow-list)
//   node scripts/check-patches.mjs --self-test   # verify the script itself against
//                                                 # committed fixtures (no network)
//   node scripts/check-patches.mjs --allowlist   # allow-list-only check
//
// Exit codes: 0 clean, 1 drifted/violation found, 2 infra error (e.g. the
// upstream fetch failed) — an infra error is never reported as drift.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkDrift, formatReport, selectUndeclared } from './lib/patches-drift.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'patches', 'inline-edit-allowlist.json');
const PATCHES_DIR = path.join(REPO_ROOT, 'patches');
const UPSTREAM_REF = 'refs/upstream-pin/docmost';

/** loadAllowlist — reads patches/inline-edit-allowlist.json (declared inline
 * edits) plus any patches/apps__*.patch files (upstream-source patches; the
 * dependency patch-package files like scimmy@1.3.5.patch are a different
 * naming convention and are out of scope, design §2). Returns a normalized
 * entry list regardless of which of the two sources an entry came from
 * (CS §3.6 — callers never see the source-format split). */
export function loadAllowlist(repoRoot) {
  const allowlistPath = path.join(repoRoot, 'patches', 'inline-edit-allowlist.json');
  let pinnedUpstreamSha = null;
  let jsonEntries = [];
  if (existsSync(allowlistPath)) {
    const parsed = JSON.parse(readFileSync(allowlistPath, 'utf8'));
    pinnedUpstreamSha = parsed.pinnedUpstreamSha ?? null;
    jsonEntries = (parsed.entries || []).map((e) => ({
      path: e.path,
      contextBefore: e.anchorBefore || [],
      contextAfter: e.anchorAfter || [],
      offset: e.offset ?? 0,
      changeSpan: e.changeSpan ?? 0,
      source: 'patches/inline-edit-allowlist.json',
      reason: e.reason,
    }));
  }

  const patchesDir = path.join(repoRoot, 'patches');
  const patchEntries = [];
  if (existsSync(patchesDir)) {
    for (const file of readdirSync(patchesDir)) {
      if (!file.startsWith('apps__') || !file.endsWith('.patch')) continue;
      patchEntries.push(...parseUnifiedDiffPatch(path.join(patchesDir, file), file));
    }
  }

  return { pinnedUpstreamSha, entries: [...jsonEntries, ...patchEntries] };
}

/** parseUnifiedDiffPatch — minimal unified-diff (`git diff -U5`) hunk parser.
 * Extracts, per hunk, the upstream file path and the context lines
 * (unchanged `" "`-prefixed lines) surrounding the change, split into the
 * lines before vs. after the first non-context line — this is the context
 * block matchContext checks against upstream (design §2/§3). */
function parseUnifiedDiffPatch(patchFile, sourceName) {
  const text = readFileSync(patchFile, 'utf8');
  const lines = text.split('\n');
  const entries = [];
  let filePath = null;
  let hunkOldStart = null;
  let contextBefore = [];
  let contextAfter = [];
  let removedCount = 0;
  let seenChange = false;

  const flushHunk = () => {
    if (filePath && (contextBefore.length || contextAfter.length)) {
      entries.push({
        path: filePath,
        contextBefore,
        contextAfter,
        // 0-based line index into the upstream file where contextBefore starts
        offset: hunkOldStart !== null ? hunkOldStart - 1 : 0,
        // upstream lines removed by the hunk — i.e. the gap between the before-
        // and after-context in upstream, so the after-anchor is positioned
        // correctly (a modification/deletion hunk is not contiguous; ENG-1649 F1)
        changeSpan: removedCount,
        source: sourceName,
        reason: `declared via ${sourceName}`,
      });
    }
    contextBefore = [];
    contextAfter = [];
    removedCount = 0;
    seenChange = false;
    hunkOldStart = null;
  };

  for (const line of lines) {
    const fileMatch = /^--- a\/(.+)$/.exec(line);
    if (fileMatch) {
      flushHunk();
      filePath = fileMatch[1];
      continue;
    }
    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      flushHunk();
      hunkOldStart = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith(' ')) {
      (seenChange ? contextAfter : contextBefore).push(line.slice(1));
    } else if (line.startsWith('-')) {
      seenChange = true;
      removedCount += 1; // upstream line the hunk deletes — counts toward the gap
    } else if (line.startsWith('+')) {
      seenChange = true;
    }
  }
  flushHunk();
  return entries;
}

/** ensureUpstreamRef — fetches the pinned upstream commit into a local ref
 * via the repo's existing `upstream` git remote (design §2). Returns true on
 * success, false on a genuine fetch failure (infra error, never drift). */
function ensureUpstreamRef(repoRoot, sha) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true; // already have it locally
  } catch {
    // not present locally yet — fetch it
  }
  try {
    execFileSync('git', ['fetch', 'upstream', sha], { cwd: repoRoot, stdio: 'pipe' });
    execFileSync('git', ['update-ref', UPSTREAM_REF, sha], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function gitShowResolver(repoRoot, sha) {
  return (filePath) => {
    try {
      return execFileSync('git', ['show', `${sha}:${filePath}`], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
    } catch {
      return null;
    }
  };
}

/** findUndeclaredEdits — AC7: any upstream-tracked path that differs from its
 * pinned-upstream content and is NOT in the frozen allow-list set is an
 * undeclared inline edit. Diffed against refs/upstream-pin/docmost (design §4)
 * — never a bare merge-base guess against orvex-wiki's own history. */
function findUndeclaredEdits(repoRoot, sha, allowlistPaths) {
  let changedPaths;
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', `${sha}`, '--', '.'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    changedPaths = out.split('\n').filter(Boolean);
  } catch {
    return null; // infra error
  }
  return selectUndeclared(changedPaths, allowlistPaths);
}

function runCheck({ allowlistOnly } = {}) {
  const { pinnedUpstreamSha, entries } = loadAllowlist(REPO_ROOT);

  if (!pinnedUpstreamSha) {
    console.log('OK: patches-drift check — no allow-list configured yet, nothing to check.');
    return 0;
  }

  const upstreamOk = ensureUpstreamRef(REPO_ROOT, pinnedUpstreamSha);
  if (!upstreamOk) {
    console.error(
      `INFRA-ERROR: could not fetch pinned upstream ref (${pinnedUpstreamSha}) via the 'upstream' remote.`,
    );
    return 2;
  }

  let report;
  if (allowlistOnly) {
    report = { drifted: [], undeclared: [], problemCount: 0, infraError: false };
  } else {
    const resolver = gitShowResolver(REPO_ROOT, pinnedUpstreamSha);
    report = checkDrift(entries, resolver);
  }

  const allowlistPaths = new Set(entries.map((e) => e.path));
  const undeclared = findUndeclaredEdits(REPO_ROOT, pinnedUpstreamSha, allowlistPaths);
  if (undeclared === null) {
    console.error('INFRA-ERROR: could not compute the allow-list diff against the pinned ref.');
    return 2;
  }
  report.undeclared = undeclared.map((p) => ({ path: p }));
  report.problemCount = report.drifted.length; // undeclared counted separately in formatReport

  const text = formatReport(report);
  if (report.drifted.length === 0 && report.undeclared.length === 0 && !report.infraError) {
    console.log(text);
    return 0;
  }
  console.error(text);
  return report.infraError ? 2 : 1;
}

function runSelfTest() {
  const fixturesDir = path.join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'patches-drift');
  let ok = true;

  for (const [name, expectedProblems] of [['clean', 0], ['modified', 0], ['drifted', 1]]) {
    const dir = path.join(fixturesDir, name);
    const upstreamText = readFileSync(path.join(dir, 'upstream.txt'), 'utf8');
    const allowlist = JSON.parse(readFileSync(path.join(dir, 'allowlist.json'), 'utf8'));
    const entries = allowlist.entries.map((e) => ({
      path: e.path,
      contextBefore: e.anchorBefore || [],
      contextAfter: e.anchorAfter || [],
      offset: e.offset ?? 0,
      changeSpan: e.changeSpan ?? 0,
      source: `fixture:${name}`,
      reason: e.reason,
    }));
    const resolver = () => upstreamText;
    const report = checkDrift(entries, resolver);
    if (report.problemCount !== expectedProblems) {
      console.error(
        `self-test FAIL: fixture '${name}' expected ${expectedProblems} problem(s), got ${report.problemCount}`,
      );
      ok = false;
    }
  }

  if (ok) {
    console.log('self-test PASS — clean 0, modified 0 (mod-hunk stays clean), drifted 1 problem.');
    return 0;
  }
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  let exitCode;
  if (args.includes('--self-test')) {
    exitCode = runSelfTest();
  } else if (args.includes('--allowlist')) {
    exitCode = runCheck({ allowlistOnly: true });
  } else {
    exitCode = runCheck({});
  }
  process.exit(exitCode);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
