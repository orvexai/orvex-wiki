#!/usr/bin/env node
//
// reality-probe.mjs — deterministic pre-claim Existing-code verification
// (ENG-2817 / M2).
//
// Usage:
//   node scripts/reality-probe.mjs --issue ENG-N --repo <dir> [--json]
//   node scripts/reality-probe.mjs --fixture <dir>
//   node scripts/reality-probe.mjs --self-test
//
// Exit codes: 0 dispatch, 1 rebaseline mismatch, 2 escalation/infra error.
// This CLI performs no Linear reads or writes.

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { classifyPremise, parsePremises, verdict } from './lib/reality-probe.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

function git(repo, args, { allowNoMatch = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowNoMatch && error.status === 1) return '';
    throw new Error(`git ${args.join(' ')} failed: ${(error.stderr || error.message || '').trim()}`);
  }
}

function parseGitHits(text) {
  return String(text)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      return match ? { location: `${match[1]}:${match[2]}`, text: match[3] } : null;
    })
    .filter(Boolean);
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDefinition(text, symbol) {
  const name = escapedRegExp(symbol);
  const patterns = [
    new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`),
    new RegExp(`\\b(?:export\\s+)?(?:const|let|var|class|type|interface|enum)\\s+${name}\\b`),
    new RegExp(`\\b(?:func|def|struct)\\s+(?:\\([^)]*\\)\\s*)?${name}\\b`),
    new RegExp(`\\b(?:public|private|protected|static|async|override|virtual|final|inline|export)\\s+[^;=(){}]+\\b${name}\\s*\\(`),
    new RegExp(`^\\s*${name}\\s*=`),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function isTestPath(file) {
  return /(?:^|[/_.-])(?:test|tests|spec|specs|__tests__)(?:[/_.-]|$)/i.test(file);
}

function evidenceForPremise(repo, premise) {
  const tracked = git(repo, ['ls-files', '--error-unmatch', '--', premise.path], { allowNoMatch: true }).trim();
  const exists = Boolean(tracked);
  if (!exists) return { exists: false, defined: false, referencedBy: [] };

  const hits = parseGitHits(git(repo, ['grep', '-n', '-F', '--', premise.symbol, '--', premise.path], { allowNoMatch: true }));
  const definitions = hits.filter((hit) => isDefinition(hit.text, premise.symbol));
  const definitionLocations = new Set(definitions.map((hit) => hit.location));
  const allHits = parseGitHits(git(repo, ['grep', '-n', '-F', '--', premise.symbol], { allowNoMatch: true }));
  const referencedBy = allHits
    .filter((hit) => !definitionLocations.has(hit.location) && !isTestPath(hit.location))
    .map((hit) => hit.location);

  return {
    exists,
    defined: definitions.length > 0,
    definedAt: definitions.map((hit) => hit.location),
    definition: definitions[0]?.location,
    referencedBy,
  };
}

function assertRepository(repo) {
  if (!existsSync(repo)) throw new Error(`repository path does not exist: ${repo}`);
  const root = path.resolve(git(repo, ['rev-parse', '--show-toplevel']).trim());
  if (root !== path.resolve(repo)) {
    throw new Error(`repository path is not an independent Git checkout: ${repo}`);
  }
  git(repo, ['rev-parse', '--verify', 'HEAD']);
}

function parseIssueYaml(file) {
  const source = readFileSync(file, 'utf8');
  const descriptionLine = source.match(/^description:\s*(.*)$/m);
  if (!descriptionLine) return source;
  const value = descriptionLine[1].trim();
  if (value.startsWith('|') || value.startsWith('>')) {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith('description:'));
    const body = [];
    for (const line of lines.slice(start + 1)) {
      if (/^[A-Za-z_][\w-]*:\s*/.test(line)) break;
      body.push(line.replace(/^\s{2}/, ''));
    }
    return body.join(value.startsWith('>') ? ' ' : '\n').trim();
  }
  try {
    return JSON.parse(value);
  } catch {
    return value.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function loadIssueBody(issue, cwd = process.cwd()) {
  const candidates = [
    path.join(cwd, '.cache', 'linear', 'issues', `${issue}.yaml`),
    path.join(cwd, 'issues', `${issue}.yaml`),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`could not find cached issue body for ${issue}`);
  return parseIssueYaml(file);
}

function runProbe({ body, repo, issue = 'fixture' }) {
  assertRepository(repo);
  const premises = parsePremises(body);
  const results = premises.map((premise) => {
    if (premise.kind === 'unparseable') {
      return { premise, classification: 'indeterminate' };
    }
    const evidence = evidenceForPremise(repo, premise);
    return { premise, evidence, classification: classifyPremise(premise, evidence) };
  });
  const result = verdict(results);
  return { issue, ...result, premises: results };
}

function exitCodeFor(disposition) {
  return disposition === 'dispatch' ? 0 : disposition === 'rebaseline' ? 1 : 2;
}

function printResult(result, json) {
  if (json) console.log(JSON.stringify(result));
  else console.log(`${result.comment}\nissue=${result.issue} disposition=${result.disposition}`);
}

function runFixture(fixtureDir, { json = false } = {}) {
  const bodyFile = ['body.md', 'body.txt', 'issue.yaml'].map((name) => path.join(fixtureDir, name)).find(existsSync);
  if (!bodyFile) throw new Error(`fixture has no body.md, body.txt, or issue.yaml: ${fixtureDir}`);
  const body = bodyFile.endsWith('.yaml') ? parseIssueYaml(bodyFile) : readFileSync(bodyFile, 'utf8');
  const sourceRepo = path.join(fixtureDir, 'repo');
  const temporaryRepo = existsSync(sourceRepo);
  const repo = temporaryRepo ? materializeFixtureRepo(sourceRepo) : path.join(fixtureDir, 'repo-not-git');
  try {
    let result;
    try {
      result = runProbe({ body, repo, issue: `fixture:${path.basename(fixtureDir)}` });
    } catch (error) {
      result = {
        issue: `fixture:${path.basename(fixtureDir)}`,
        disposition: 'escalate',
        comment: `ESCALATE: pre-claim reality probe failed closed: ${error.message}`,
      };
    }
    printResult(result, json);
    return exitCodeFor(result.disposition);
  } finally {
    if (temporaryRepo) rmSync(path.dirname(repo), { recursive: true, force: true });
  }
}

function materializeFixtureRepo(sourceRepo) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'reality-probe-'));
  const repo = path.join(tempRoot, 'repo');
  cpSync(sourceRepo, repo, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'reality-probe@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Reality Probe'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  return repo;
}

function selfTest() {
  const fixtures = path.join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'reality-probe');
  const expected = [
    ['stale-absent-claim', 1],
    ['present-but-unwired', 0],
    ['accurate', 0],
    ['unreachable-repo', 2],
  ];
  for (const [name, code] of expected) {
    const actual = runFixture(path.join(fixtures, name));
    if (actual !== code) {
      console.error(`self-test FAIL: fixture '${name}' expected exit ${code}, got ${actual}`);
      return 1;
    }
  }
  console.log('self-test PASS — stale absent 1, present but unwired 0, accurate 0, unreachable 2.');
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  if (args.includes('--self-test')) return selfTest();

  try {
    let result;
    if (args.includes('--fixture')) {
      return runFixture(path.resolve(args[args.indexOf('--fixture') + 1]), { json });
    }
    const issueIndex = args.indexOf('--issue');
    const repoIndex = args.indexOf('--repo');
    if (issueIndex < 0 || repoIndex < 0) throw new Error('usage: --issue <ENG-N> --repo <dir> [--json]');
    const issue = args[issueIndex + 1];
    const repo = path.resolve(args[repoIndex + 1]);
    result = runProbe({ body: loadIssueBody(issue), repo, issue });
    printResult(result, json);
    return exitCodeFor(result.disposition);
  } catch (error) {
    const result = {
      issue: args.includes('--issue') ? args[args.indexOf('--issue') + 1] : 'unknown',
      disposition: 'escalate',
      comment: `ESCALATE: pre-claim reality probe failed closed: ${error.message}`,
    };
    printResult(result, json);
    return 2;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main());

export { evidenceForPremise, runProbe };
