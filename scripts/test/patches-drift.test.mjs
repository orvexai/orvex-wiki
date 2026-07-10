// Unit + self-test-integration tests for the patches-drift subsystem (ENG-1649).
// TDD tracer-bullet order: exact match -> fuzzy-within-5 match -> tie-break ->
// drift -> undeclared-edit detection -> end-to-end --self-test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  matchContext,
  checkDrift,
  formatReport,
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
// checkDrift — orchestration with an injected upstreamResolver (no real git)
// ---------------------------------------------------------------------------

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
// End-to-end: --self-test against the committed fixtures
// ---------------------------------------------------------------------------

test('check-patches.mjs --self-test passes against the committed fixtures', () => {
  const out = execFileSync('node', [SELF_TEST_SCRIPT, '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /self-test PASS/);
});
