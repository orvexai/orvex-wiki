// TestPreClaimRealityProbe — ENG-2817.
// Behaviour is exercised through the real CLI against committed fixture trees;
// pure premise/verdict rules are also tested with injected evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classifyPremise, parsePremises, verdict } from '../lib/reality-probe.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');
const CLI = path.join(REPO_ROOT, 'scripts', 'reality-probe.mjs');
const FIXTURES = path.join(TEST_DIR, 'fixtures', 'reality-probe');

function runFixture(name, extraArgs = [], env = {}) {
  return spawnSync(process.execPath, [CLI, '--fixture', path.join(FIXTURES, name), ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('TestPreClaimRealityProbe parses prose, table rows, and rejects unknown Existing-code shapes', () => {
  const premises = parsePremises([
    'Existing code (HEAD): present — `src/one.ts` (`One`) (verified live)',
    '| Existing code (repo) | `src/two.ts` (`Two`) | carried |',
    'Existing code (HEAD): tools/three.ts owns dispatch.',
  ].join('\n'));

  assert.deepEqual(premises.slice(0, 2).map(({ kind, path: file, symbol }) => ({ kind, path: file, symbol })), [
    { kind: 'present', path: 'src/one.ts', symbol: 'One' },
    { kind: 'present', path: 'src/two.ts', symbol: 'Two' },
  ]);
  assert.equal(premises[2].kind, 'unparseable');
});

test('TestPreClaimRealityProbe classifies absent claims as matching when a definition is not wired', () => {
  const premise = { kind: 'absent', path: 'src/reality-service.js', symbol: 'realityService' };
  assert.equal(classifyPremise(premise, { exists: true, defined: true, referencedBy: [] }), 'match');
  assert.equal(
    classifyPremise(premise, { exists: true, defined: true, referencedBy: ['src/app.js:4'] }),
    'mismatch',
  );
});

test('TestPreClaimRealityProbe fails closed when a result is indeterminate', () => {
  const result = verdict([{ premise: { kind: 'unparseable', raw: 'Existing code (future): ???' }, classification: 'indeterminate' }]);
  assert.equal(result.disposition, 'escalate');
  assert.match(result.comment, /ESCALATE/);
});

test('AC1 / DoD: a stale absent premise bounces with definition and reference file:line', () => {
  const result = runFixture('stale-absent-claim');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /REBASELINE/);
  assert.match(result.stdout, /src\/reality-service\.js:1/);
  assert.match(result.stdout, /src\/reality-service\.js:6/);
  assert.doesNotMatch(result.stdout, /DISPATCH/);
});

test('wired requirement: a defined but unreferenced symbol does not bounce an absent claim', () => {
  const result = runFixture('present-but-unwired');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /DISPATCH/);
});

test('AC2: an accurate probe dispatches and emits zero Linear-write commands', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'reality-probe-test-'));
  const writes = path.join(temp, 'linearis-calls.log');
  const bin = path.join(temp, 'bin');
  const linearis = path.join(bin, 'linearis');
  try {
    // The shim makes any accidental Linear invocation observable without
    // granting the probe credentials or contacting a service.
    mkdirSync(bin, { recursive: true });
    writeFileSync(linearis, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(writes)}\n`);
    chmodSync(linearis, 0o755);
    const result = runFixture('accurate', ['--json'], { PATH: `${bin}:${process.env.PATH}` });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.disposition, 'dispatch');
    assert.equal(existsSync(writes) ? readFileSync(writes, 'utf8') : '', '');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('AC3: an unreachable repository escalates with exit 2 and never dispatches', () => {
  const result = runFixture('unreachable-repo');
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /ESCALATE/);
  assert.doesNotMatch(result.stdout, /DISPATCH/);
});

test('self-test covers all committed reality-probe fixtures', () => {
  const result = spawnSync(process.execPath, [CLI, '--self-test'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /self-test PASS/);
});
