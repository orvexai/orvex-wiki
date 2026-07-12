// Unit + self-test-integration tests for the image-freshness subsystem
// (ENG-1973). TDD tracer-bullet order: resolveBuiltFromCommit ->
// computeCommitsBehind -> classify -> evaluateService (composition) ->
// formatReport -> parseGitLog (CLI shell parsing) -> end-to-end --self-test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  resolveBuiltFromCommit,
  computeCommitsBehind,
  classify,
  evaluateService,
  formatReport,
} from '../lib/image-freshness.mjs';
import { parseGitLog, extractDigest } from '../check-image-freshness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SELF_TEST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-image-freshness.mjs');

const COMMITS = [
  { sha: 'c3', committerEpochSeconds: 300 },
  { sha: 'c2', committerEpochSeconds: 200 },
  { sha: 'c1', committerEpochSeconds: 100 },
];

// ---------------------------------------------------------------------------
// resolveBuiltFromCommit — pure, no I/O
// ---------------------------------------------------------------------------

test('resolveBuiltFromCommit: exact push_time match returns that commit', () => {
  assert.equal(resolveBuiltFromCommit(COMMITS, 200), 'c2');
});

test('resolveBuiltFromCommit: push_time between two commits returns the older one', () => {
  assert.equal(resolveBuiltFromCommit(COMMITS, 250), 'c2');
});

test('resolveBuiltFromCommit: push_time after HEAD returns HEAD', () => {
  assert.equal(resolveBuiltFromCommit(COMMITS, 999), 'c3');
});

test('resolveBuiltFromCommit: push_time before the oldest commit returns null', () => {
  assert.equal(resolveBuiltFromCommit(COMMITS, 50), null);
});

// ---------------------------------------------------------------------------
// computeCommitsBehind — pure, no I/O
// ---------------------------------------------------------------------------

test('computeCommitsBehind: builtFromSha at HEAD is 0 behind', () => {
  assert.equal(computeCommitsBehind(COMMITS, 'c3'), 0);
});

test('computeCommitsBehind: builtFromSha two commits back is 2 behind', () => {
  assert.equal(computeCommitsBehind(COMMITS, 'c1'), 2);
});

test('computeCommitsBehind: unknown sha returns null', () => {
  assert.equal(computeCommitsBehind(COMMITS, 'nope'), null);
});

// ---------------------------------------------------------------------------
// classify — pure, no I/O
// ---------------------------------------------------------------------------

test('classify: 0 commits behind is FRESH regardless of buildStatus', () => {
  assert.equal(classify(0, 'failed'), 'FRESH');
  assert.equal(classify(0, 'pending'), 'FRESH');
});

test('classify: commits behind + failed build is STALE_BUILD_FAILING', () => {
  assert.equal(classify(5, 'failed'), 'STALE_BUILD_FAILING');
});

test('classify: commits behind + no failure observed is STALE_BUILD_PENDING', () => {
  assert.equal(classify(5, 'pending'), 'STALE_BUILD_PENDING');
  assert.equal(classify(5, 'none'), 'STALE_BUILD_PENDING');
  assert.equal(classify(5, 'succeeded'), 'STALE_BUILD_PENDING');
});

test('classify: null commitsBehind is UNKNOWN', () => {
  assert.equal(classify(null, 'failed'), 'UNKNOWN');
});

// ---------------------------------------------------------------------------
// evaluateService — composition
// ---------------------------------------------------------------------------

test('evaluateService: image built from HEAD push_time is FRESH, 0 behind', () => {
  const result = evaluateService('svc', {
    commits: COMMITS,
    pushTimeEpochSeconds: 999,
    buildStatus: 'succeeded',
  });
  assert.deepEqual(result, { name: 'svc', verdict: 'FRESH', commitsBehind: 0, builtFromSha: 'c3' });
});

test('evaluateService: stale image with a failing follow-up build is STALE_BUILD_FAILING', () => {
  const result = evaluateService('svc', {
    commits: COMMITS,
    pushTimeEpochSeconds: 100,
    buildStatus: 'failed',
  });
  assert.equal(result.verdict, 'STALE_BUILD_FAILING');
  assert.equal(result.commitsBehind, 2);
  assert.equal(result.builtFromSha, 'c1');
});

test('evaluateService: stale image with no failure yet is STALE_BUILD_PENDING', () => {
  const result = evaluateService('svc', {
    commits: COMMITS,
    pushTimeEpochSeconds: 100,
    buildStatus: 'pending',
  });
  assert.equal(result.verdict, 'STALE_BUILD_PENDING');
});

test('evaluateService: empty commit log is UNKNOWN', () => {
  const result = evaluateService('svc', { commits: [], pushTimeEpochSeconds: 100, buildStatus: 'pending' });
  assert.equal(result.verdict, 'UNKNOWN');
  assert.equal(result.commitsBehind, null);
});

// ---------------------------------------------------------------------------
// formatReport — pure, no I/O
// ---------------------------------------------------------------------------

test('formatReport: hasFailing is true iff any result is STALE_BUILD_FAILING', () => {
  const clean = formatReport([{ name: 'a', verdict: 'FRESH', commitsBehind: 0, builtFromSha: 'c3' }]);
  assert.equal(clean.hasFailing, false);

  const dirty = formatReport([
    { name: 'a', verdict: 'FRESH', commitsBehind: 0, builtFromSha: 'c3' },
    { name: 'b', verdict: 'STALE_BUILD_FAILING', commitsBehind: 5, builtFromSha: 'c1' },
  ]);
  assert.equal(dirty.hasFailing, true);
  assert.match(dirty.text, /STALE_BUILD_FAILING\s+b/);
});

// ---------------------------------------------------------------------------
// parseGitLog — CLI shell parsing helper, pure
// ---------------------------------------------------------------------------

test('parseGitLog: parses `git log --format=%H,%ct` newest-first output', () => {
  const text = 'c3,300\nc2,200\nc1,100\n';
  assert.deepEqual(parseGitLog(text), COMMITS);
});

test('parseGitLog: ignores trailing blank lines', () => {
  const text = 'c1,100\n\n';
  assert.deepEqual(parseGitLog(text), [{ sha: 'c1', committerEpochSeconds: 100 }]);
});

// ---------------------------------------------------------------------------
// extractDigest — CLI shell parsing helper, pure
// ---------------------------------------------------------------------------

test('extractDigest: pulls the sha256 digest out of a kubectl imageID', () => {
  const imageID =
    'repos.eu-central-1.myidp.cloud/orvex-wiki/orvex-wiki@sha256:' + 'a'.repeat(64);
  assert.equal(extractDigest(imageID), 'sha256:' + 'a'.repeat(64));
});

test('extractDigest: throws on an imageID with no digest', () => {
  assert.throws(() => extractDigest('not-an-image-id'), /could not parse image digest/);
});

// ---------------------------------------------------------------------------
// end-to-end --self-test (fixtures, no network/cluster)
// ---------------------------------------------------------------------------

test('check-image-freshness.mjs --self-test PASSes against committed fixtures', () => {
  const out = execFileSync('node', [SELF_TEST_SCRIPT, '--self-test'], { encoding: 'utf8' });
  assert.match(out, /self-test PASS/);
});
