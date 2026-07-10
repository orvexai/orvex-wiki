// Unit + self-test-integration tests for the patches-drift subsystem (ENG-1649).
// TDD tracer-bullet order: exact match -> fuzzy-within-5 match -> tie-break ->
// separate before/after anchoring (mod/del hunks stay clean) -> drift ->
// undeclared-edit detection -> end-to-end --self-test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  matchContext,
  matchEntry,
  checkDrift,
  formatReport,
  selectUndeclared,
} from '../lib/patches-drift.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SELF_TEST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-patches.mjs');

// ---------------------------------------------------------------------------
// matchContext — pure, no I/O
// ---------------------------------------------------------------------------

test('matchContext: exact match at the recorded offset is EXACT', () => {
  const upstream = ['a', 'b', 'c', 'd', 'e'];
  const result = matchContext(upstream, ['b', 'c'], 1);
  assert.equal(result.status, 'exact');
  assert.equal(result.offset, 1);
});

test('matchContext: shifted context within +/-5 lines is FUZZY', () => {
  // context now actually lives at offset 4, not the recorded offset 1
  const upstream = ['a', 'z', 'z', 'z', 'b', 'c'];
  const result = matchContext(upstream, ['b', 'c'], 1);
  assert.equal(result.status, 'fuzzy');
  assert.equal(result.offset, 4);
});

test('matchContext: whitespace-only differences still count as a match', () => {
  const upstream = ['a', '  b  ', 'c\t'];
  const result = matchContext(upstream, ['b', 'c'], 1);
  assert.equal(result.status, 'fuzzy');
});

test('matchContext: no match anywhere within the window is DRIFTED', () => {
  const upstream = ['a', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x'];
  const result = matchContext(upstream, ['b', 'c'], 1);
  assert.equal(result.status, 'drifted');
});

test('matchContext: tie-break picks the smallest absolute distance from the recorded offset', () => {
  // context block also matches at offset 0 (distance 2) and offset 4 (distance 2) -- tie on
  // distance; earlier (smaller) offset must win deterministically.
  const upstream = ['b', 'c', 'x', 'x', 'b', 'c'];
  const result = matchContext(upstream, ['b', 'c'], 2);
  assert.equal(result.status, 'fuzzy');
  assert.equal(result.offset, 0);
});

// ---------------------------------------------------------------------------
// matchEntry — before/after anchored SEPARATELY (ENG-1649 F1 regression)
// ---------------------------------------------------------------------------

test('matchEntry: a modification hunk (before/after separated by removed upstream lines) is NOT drifted', () => {
  // upstream still has the hunk's removed lines (const orig...) BETWEEN the
  // before- and after-context, so the fused block is non-contiguous. The patch
  // still applies cleanly => must be clean, not drift.
  const upstream = ['import a;', 'import b;', 'const orig = 1;', 'return x;', '}'];
  const entry = {
    contextBefore: ['import a;', 'import b;'],
    contextAfter: ['return x;', '}'],
    offset: 0,
    changeSpan: 1, // one removed line between the anchors
  };
  const result = matchEntry(upstream, entry);
  assert.notEqual(result.status, 'drifted');
});

test('matchEntry: modification hunk stays clean even without an explicit changeSpan (fuzzy window absorbs a small gap)', () => {
  const upstream = ['import a;', 'import b;', 'const orig = 1;', 'return x;', '}'];
  const entry = {
    contextBefore: ['import a;', 'import b;'],
    contextAfter: ['return x;', '}'],
    offset: 0,
    // changeSpan omitted -> defaults 0; the after-anchor's +/-5 window covers it
  };
  assert.notEqual(matchEntry(upstream, entry).status, 'drifted');
});

test('matchEntry: a genuinely drifted before-anchor is DRIFTED', () => {
  const upstream = ['gone', 'gone', 'const orig = 1;', 'return x;', '}'];
  const entry = {
    contextBefore: ['import a;', 'import b;'],
    contextAfter: ['return x;', '}'],
    offset: 0,
    changeSpan: 1,
  };
  assert.equal(matchEntry(upstream, entry).status, 'drifted');
});

test('matchEntry: after-anchor drifted (only before survives) is DRIFTED', () => {
  const upstream = ['import a;', 'import b;', 'x', 'y', 'z', 'w', 'gone', 'gone'];
  const entry = {
    contextBefore: ['import a;', 'import b;'],
    contextAfter: ['return x;', '}'],
    offset: 0,
    changeSpan: 1,
  };
  assert.equal(matchEntry(upstream, entry).status, 'drifted');
});

// ---------------------------------------------------------------------------
// checkDrift — orchestration with an injected upstreamResolver (no real git)
// ---------------------------------------------------------------------------

test('checkDrift: a clean modification hunk is not reported (ENG-1649 F1 regression)', () => {
  const entries = [
    {
      path: 'fixture/mod.ts',
      contextBefore: ['import a;', 'import b;'],
      contextAfter: ['return x;', '}'],
      offset: 0,
      changeSpan: 1,
      source: 'test',
    },
  ];
  const resolver = () => 'import a;\nimport b;\nconst orig = 1;\nreturn x;\n}\n';
  const report = checkDrift(entries, resolver);
  assert.equal(report.problemCount, 0);
  assert.equal(report.drifted.length, 0);
});

test('checkDrift: an entry whose context matches upstream is not reported as a problem', () => {
  const entries = [
    {
      path: 'fixture/a.ts',
      contextBefore: ['x1', 'x2'],
      contextAfter: ['x3', 'x4'],
      offset: 0,
      source: 'test',
    },
  ];
  const resolver = (p) => (p === 'fixture/a.ts' ? 'x1\nx2\nx3\nx4\n' : null);
  const report = checkDrift(entries, resolver);
  assert.equal(report.drifted.length, 0);
  assert.equal(report.problemCount, 0);
});

test('checkDrift: an entry whose context has drifted is reported', () => {
  const entries = [
    {
      path: 'fixture/b.ts',
      contextBefore: ['x1', 'x2'],
      contextAfter: ['x3', 'x4'],
      offset: 0,
      source: 'test',
    },
  ];
  const resolver = () => 'nope\nnope\nnope\nnope\nnope\nnope\nnope\nnope\nnope\nnope\nnope\n';
  const report = checkDrift(entries, resolver);
  assert.equal(report.drifted.length, 1);
  assert.equal(report.problemCount, 1);
  assert.equal(report.drifted[0].path, 'fixture/b.ts');
});

test('checkDrift: an upstreamResolver fetch failure (null) is an infra error, not a drift finding', () => {
  const entries = [
    {
      path: 'fixture/missing.ts',
      contextBefore: ['x1'],
      contextAfter: ['x2'],
      offset: 0,
      source: 'test',
    },
  ];
  const resolver = () => null;
  const report = checkDrift(entries, resolver);
  assert.equal(report.infraError, true);
  assert.equal(report.drifted.length, 0);
});

test('formatReport: a clean report prints OK and no problems', () => {
  const report = { drifted: [], undeclared: [], problemCount: 0, infraError: false };
  const text = formatReport(report);
  assert.match(text, /^OK: patches-drift check/);
});

test('formatReport: a report with problems prints FAIL and the count', () => {
  const report = {
    drifted: [{ path: 'x.ts', reason: 'drifted', source: 'test' }],
    undeclared: [],
    problemCount: 1,
    infraError: false,
  };
  const text = formatReport(report);
  assert.match(text, /^FAIL: patches-drift check/);
  assert.match(text, /1 problem\(s\) found/);
});

// ---------------------------------------------------------------------------
// selectUndeclared — AC7 governance predicate (ENG-1649 F2)
// ---------------------------------------------------------------------------

test('selectUndeclared: a changed upstream file NOT in the frozen allow-list is undeclared', () => {
  const changed = ['apps/server/src/a.ts', 'apps/server/src/b.ts'];
  const allow = new Set(['apps/server/src/a.ts']);
  assert.deepEqual(selectUndeclared(changed, allow), ['apps/server/src/b.ts']);
});

test('selectUndeclared: every changed file being allow-listed yields no violation', () => {
  const changed = ['a.ts', 'b.ts'];
  const allow = new Set(['a.ts', 'b.ts']);
  assert.deepEqual(selectUndeclared(changed, allow), []);
});

test('selectUndeclared: accepts a plain array allow-list too', () => {
  assert.deepEqual(selectUndeclared(['x', 'y'], ['x']), ['y']);
});

test('formatReport: an undeclared inline edit prints FAIL, the path, and counts toward problems', () => {
  const report = {
    drifted: [],
    undeclared: [{ path: 'apps/server/src/core/somefile.ts' }],
    problemCount: 0,
    infraError: false,
  };
  const text = formatReport(report);
  assert.match(text, /^FAIL: patches-drift check/);
  assert.match(text, /Undeclared inline edits/);
  assert.match(text, /apps\/server\/src\/core\/somefile\.ts/);
  assert.match(text, /1 problem\(s\) found/);
});

// ---------------------------------------------------------------------------
// End-to-end: --self-test against the committed fixtures
// ---------------------------------------------------------------------------

test('check-patches.mjs --self-test passes against the committed fixtures', () => {
  const out = execFileSync('node', [SELF_TEST_SCRIPT, '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /self-test PASS/);
});
