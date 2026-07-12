#!/usr/bin/env node
//
// check-image-freshness.mjs — CI-side image-freshness / drift alarm for the
// orvex-wiki ("engine") service (ENG-1973, per-repo scope). Detects when the
// deployed `:dev` image's built-from commit diverges from origin/dev HEAD,
// so a broken image build surfaces immediately instead of silently freezing
// the deployed image (per the 2026-07-12 cell-wide sweep evidence).
//
// This is the PER-REPO half of the ENG-1973 DoD, scoped to this repo's own
// service (Slim-AGPL rule, PO Q22: the AGPL engine repo stays minimal). The
// cell-wide, cross-repo sweep (ai/billing/knowledge/console/ui/wiki-api) is
// out of this repo's scope — it needs git/Harbor read access to OTHER repos
// this checkout cannot provide, and is deliberately left as a follow-up in a
// satellite/orchestrator repo (recorded in the ticket). This script's pure
// logic (scripts/lib/image-freshness.mjs) is reused there directly.
//
// Usage:
//   node scripts/check-image-freshness.mjs --self-test   # fixtures, no network/cluster
//   node scripts/check-image-freshness.mjs --live        # real kubectl + Harbor + git
//
// Read-only: never triggers a build, never mutates the cluster (DoD).
//
// Exit codes: 0 fresh, 1 STALE_BUILD_FAILING found (alarm), 2 infra error.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { evaluateService, formatReport } from './lib/image-freshness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVICE_NAME = 'engine (orvex-wiki)';
const NAMESPACE = process.env.ORVEX_WIKI_NAMESPACE || 'orvex-wiki-dev';
const APP_LABEL = process.env.ORVEX_WIKI_APP_LABEL || 'app.kubernetes.io/name=orvex-wiki,app.kubernetes.io/component=server';
const HARBOR_URL = process.env.HARBOR_URL || 'https://repos.eu-central-1.myidp.cloud';
const HARBOR_PROJECT = process.env.HARBOR_PROJECT || 'orvex-wiki';
const HARBOR_REPO = process.env.HARBOR_REPO || 'orvex-wiki';

/** parseGitLog — `git log --format=%H,%ct` output (newest-first) into the
 * `commits` array shape `evaluateService` expects. */
export function parseGitLog(text) {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, epoch] = line.split(',');
      return { sha, committerEpochSeconds: Number(epoch) };
    });
}

function getDevCommits() {
  const text = execFileSync(
    'git',
    ['log', '--format=%H,%ct', 'origin/dev'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  return parseGitLog(text);
}

/** getDeployedImageDigest — the READY (traffic-serving) pod's image digest
 * via kubectl. During a rollout there can be multiple pods for the
 * deployment (old serving + new crash-looping); this deliberately picks a
 * Ready one — that is the image actually serving users, which is exactly
 * the "silently frozen" image ENG-1973 alarms on. */
export function extractDigest(imageID) {
  const match = imageID.match(/sha256:[0-9a-f]{64}/);
  if (!match) throw new Error(`could not parse image digest from kubectl imageID: '${imageID}'`);
  return match[0];
}

function getDeployedImageDigest() {
  const out = execFileSync(
    'kubectl',
    [
      '-n', NAMESPACE,
      'get', 'pods',
      '-l', APP_LABEL,
      '-o', 'json',
    ],
    { encoding: 'utf8' },
  );
  const pods = JSON.parse(out).items;
  const ready =
    pods.find((p) => p.status.containerStatuses?.[0]?.ready) ?? pods[0];
  if (!ready) throw new Error(`no pods found for label '${APP_LABEL}' in namespace '${NAMESPACE}'`);
  return extractDigest(ready.status.containerStatuses[0].imageID);
}

/** getHarborAuth — Basic-auth token for the Harbor v2.0 API. Prefers a
 * dedicated CI robot account (HARBOR_ROBOT_TOKEN: base64 `user:secret`);
 * falls back to this namespace's harbor-registry-credentials pull secret
 * (the same credential kubelet/Tekton already use to pull) — a true
 * external credential, never hardcoded. */
function getHarborAuth() {
  if (process.env.HARBOR_ROBOT_TOKEN) return process.env.HARBOR_ROBOT_TOKEN;
  const out = execFileSync(
    'kubectl',
    ['-n', NAMESPACE, 'get', 'secret', 'harbor-registry-credentials', '-o', 'jsonpath={.data.\\.dockerconfigjson}'],
    { encoding: 'utf8' },
  ).trim();
  const dockerconfig = JSON.parse(Buffer.from(out, 'base64').toString('utf8'));
  const hostKey = Object.keys(dockerconfig.auths).find((h) => HARBOR_URL.includes(h));
  if (!hostKey) throw new Error(`no harbor-registry-credentials entry for host in ${HARBOR_URL}`);
  return dockerconfig.auths[hostKey].auth;
}

/** getHarborPushTime — resolve the Harbor artifact push_time (unix seconds)
 * for a given digest, via the Harbor v2.0 API. */
function getHarborPushTime(digest) {
  const token = getHarborAuth();
  const url = `${HARBOR_URL}/api/v2.0/projects/${HARBOR_PROJECT}/repositories/${HARBOR_REPO}/artifacts/${digest}`;
  const out = execFileSync('curl', [
    '-sf',
    '-H', `Authorization: Basic ${token}`,
    url,
  ], { encoding: 'utf8' });
  const artifact = JSON.parse(out);
  return Math.floor(new Date(artifact.push_time).getTime() / 1000);
}

/** getLatestBuildStatus — most recent Tekton PipelineRun status for a build
 * newer than builtFromSha (used to distinguish STALE_BUILD_FAILING from
 * STALE_BUILD_PENDING). Best-effort: returns 'pending' if none found. */
function getLatestBuildStatus(builtFromSha, headSha) {
  if (builtFromSha === headSha) return 'succeeded';
  try {
    const out = execFileSync(
      'kubectl',
      [
        '-n', 'tekton-pipelines',
        'get', 'pipelinerun',
        '-l', 'app.kubernetes.io/name=orvex-wiki',
        '--sort-by=.metadata.creationTimestamp',
        '-o', 'jsonpath={.items[-1:].status.conditions[-1:].status}',
      ],
      { encoding: 'utf8' },
    ).trim();
    if (out === 'False') return 'failed';
    if (out === 'True') return 'succeeded';
    return 'pending';
  } catch {
    return 'pending';
  }
}

function runLive() {
  const commits = getDevCommits();
  const digest = getDeployedImageDigest();
  const pushTimeEpochSeconds = getHarborPushTime(digest);
  const result = evaluateService(SERVICE_NAME, {
    commits,
    pushTimeEpochSeconds,
    buildStatus: 'pending', // resolved below once builtFromSha is known
  });
  const buildStatus =
    result.builtFromSha === null
      ? 'pending'
      : getLatestBuildStatus(result.builtFromSha, commits[0]?.sha);
  const final = evaluateService(SERVICE_NAME, { commits, pushTimeEpochSeconds, buildStatus });
  const { text, hasFailing } = formatReport([final]);
  console.log(text);
  return hasFailing ? 1 : 0;
}

function runSelfTest() {
  const fixturesDir = path.join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'image-freshness');
  let ok = true;

  for (const [name, expectedVerdict] of [
    ['fresh', 'FRESH'],
    ['stale-failing', 'STALE_BUILD_FAILING'],
    ['stale-pending', 'STALE_BUILD_PENDING'],
  ]) {
    const dir = path.join(fixturesDir, name);
    const fixture = JSON.parse(readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
    const result = evaluateService(fixture.name, {
      commits: fixture.commits,
      pushTimeEpochSeconds: fixture.pushTimeEpochSeconds,
      buildStatus: fixture.buildStatus,
    });
    if (result.verdict !== expectedVerdict) {
      console.error(
        `self-test FAIL: fixture '${name}' expected verdict ${expectedVerdict}, got ${result.verdict}`,
      );
      ok = false;
    }
  }

  if (ok) {
    console.log('self-test PASS — fresh/stale-failing/stale-pending all classify correctly.');
    return 0;
  }
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  let exitCode;
  if (args.includes('--self-test')) {
    exitCode = runSelfTest();
  } else if (args.includes('--live')) {
    try {
      exitCode = runLive();
    } catch (err) {
      console.error(`INFRA-ERROR: ${err.message}`);
      exitCode = 2;
    }
  } else {
    console.error('usage: check-image-freshness.mjs --self-test|--live');
    exitCode = 2;
  }
  process.exit(exitCode);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
