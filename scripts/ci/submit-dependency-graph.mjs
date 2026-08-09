#!/usr/bin/env node
// Explicit GitHub Dependency Submission API push for the WHOLE pnpm workspace.
//
// WHY THIS EXISTS — see reports/security/wiki-ghost-alerts.md and
// reports/security/wiki-depgraph-freeze-fix.md. GitHub's *passive*
// lockfile-parse-on-push dependency graph for this repo has been frozen
// since ~2026-07-06: Dependabot alerts kept citing packages removed from the
// tree on 2026-07-12 (commit 9ca06aff, ENG-1481) for weeks afterward,
// including alerts minted brand-new days ago, across 5+ subsequent pushes
// that themselves modified pnpm-lock.yaml. "Push again and hope" has already
// failed repeatedly. This script replaces the passive parse with an
// EXPLICIT snapshot submission (POST /repos/{owner}/{repo}/dependency-graph/
// snapshots) driven by pnpm's OWN dependency resolution (`pnpm list -r
// --depth Infinity --json`), not a hand-rolled lockfile parser — we trust
// pnpm to resolve its own lockfile correctly rather than re-implementing
// pnpm-lock.yaml v9's format ourselves.
//
// COVERAGE: walks EVERY workspace project (root + apps/* + packages/* +
// packages/@orvex/*), not just the root manifest. A partial snapshot would
// replace a stale-but-broad graph with a fresh-but-narrow one, which is
// worse than doing nothing — so this script refuses to submit (exits
// non-zero) if pnpm reports fewer than the known workspace member count, or
// if the resulting flattened dependency set looks suspiciously small.
//
// FAILS LOUDLY, deliberately, at every stage: missing provenance env vars,
// a failed `pnpm list`, unparseable JSON, an implausibly small result, a
// non-2xx API response, or an accepted-but-non-SUCCESS API result all exit
// non-zero with a specific stderr message. A silent failure here would
// recreate — invisibly — exactly the staleness this job exists to cure.
//
// Deliberately OMITTED: the Submission API's per-entry `dependencies` array
// (parent/child edges). It is optional and is not required for vulnerability
// matching (package_url + relationship + scope are what Dependabot alerts
// key on); modelling it wrong (the key format is not perfectly documented)
// risks a subtly malformed graph, which is a worse failure mode than a
// flatter-but-correct one. See reports/security/wiki-depgraph-freeze-fix.md
// §"Design choices" for the full reasoning.

import { execFileSync } from 'node:child_process';

const REQUIRED_ENV = ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'SNAPSHOT_REF'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(
      `FATAL: required env var ${key} is not set — refusing to submit a snapshot with incomplete provenance.`,
    );
    process.exit(1);
  }
}

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
if (!owner || !repo) {
  console.error(`FATAL: GITHUB_REPOSITORY "${process.env.GITHUB_REPOSITORY}" did not parse as "owner/repo".`);
  process.exit(1);
}

// The commit actually on disk right now (whatever the checkout step put
// there) — NOT process.env.GITHUB_SHA, which reflects the triggering event's
// ref and is WRONG under workflow_dispatch when a different `ref` input was
// used to check out a different branch than the one that dispatched the run.
let sha;
try {
  sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch (err) {
  console.error('FATAL: `git rev-parse HEAD` failed:', err.message);
  process.exit(1);
}
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error(`FATAL: HEAD did not resolve to a 40-char sha ("${sha}").`);
  process.exit(1);
}

const ref = process.env.SNAPSHOT_REF; // e.g. refs/heads/dev — set explicitly by the workflow, never inferred.

console.error('Resolving the full pnpm workspace dependency tree (pnpm list -r --depth Infinity --json)...');
let raw;
try {
  raw = execFileSync('pnpm', ['list', '-r', '--depth', 'Infinity', '--json'], {
    maxBuffer: 1024 * 1024 * 512, // this lockfile resolves 10,000+ package/snapshot lines
    encoding: 'utf8',
  });
} catch (err) {
  console.error('FATAL: `pnpm list -r --depth Infinity --json` failed:', err.message);
  if (err.stderr) console.error(String(err.stderr));
  process.exit(1);
}

let projects;
try {
  projects = JSON.parse(raw);
} catch (err) {
  console.error('FATAL: `pnpm list -r --json` output was not valid JSON:', err.message);
  process.exit(1);
}

if (!Array.isArray(projects) || projects.length === 0) {
  console.error('FATAL: `pnpm list -r` reported zero workspace projects — refusing to submit an empty snapshot.');
  process.exit(1);
}

// Hard floor on workspace member count: root + apps/client + apps/server +
// packages/editor-ext + packages/base-formula + packages/@orvex/dfm +
// packages/@orvex/extensions = 7, per pnpm-workspace.yaml's
// apps/*,packages/*,packages/@orvex/* globs (confirmed 2026-08-09; see the
// ghost-alerts report's "7 package.json manifests" cross-check). If this
// drops, either the workspace glob changed (update this constant to match)
// or the install silently narrowed — either way, LOUD, not silent.
const EXPECTED_MIN_PROJECTS = 7;
if (projects.length < EXPECTED_MIN_PROJECTS) {
  console.error(
    `FATAL: expected >= ${EXPECTED_MIN_PROJECTS} workspace projects, pnpm reported ${projects.length}. ` +
      'Refusing to submit a partial-workspace snapshot — that would be worse than the frozen graph it replaces.',
  );
  process.exit(1);
}

/** @type {Record<string, {package_url: string, relationship: 'direct'|'indirect', scope: 'runtime'|'development'}>} */
const resolved = {};

function purlFor(name, version) {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.slice(1).split('/');
    return `pkg:npm/%40${encodeURIComponent(scope)}/${encodeURIComponent(pkg)}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function mergeEntry(name, version, isDirect, isDev) {
  const key = `${name}@${version}`;
  const existing = resolved[key];
  if (!existing) {
    resolved[key] = {
      package_url: purlFor(name, version),
      relationship: isDirect ? 'direct' : 'indirect',
      scope: isDev ? 'development' : 'runtime',
    };
    return;
  }
  // Merge across every workspace project + every depth this same
  // name@version was seen at: direct wins over indirect, runtime wins over
  // development-only — both are the more-inclusive, more-accurate choice
  // when the same resolved package plays multiple roles across the monorepo.
  if (isDirect) existing.relationship = 'direct';
  if (!isDev) existing.scope = 'runtime';
}

function walk(depMap, isDirect, isDev) {
  if (!depMap) return;
  for (const info of Object.values(depMap)) {
    if (!info || !info.version) continue;
    // pnpm sometimes reports a workspace-local sibling (`link:../foo`) as a
    // dependency entry with no real registry version to submit — skip those,
    // they are not npm-registry packages Dependabot could ever flag anyway.
    if (typeof info.version !== 'string' || info.version.startsWith('link:')) continue;
    mergeEntry(info.from || info.name, info.version, isDirect, isDev);
    walk(info.dependencies, false, isDev);
  }
}

let projectCount = 0;
for (const project of projects) {
  projectCount += 1;
  walk(project.dependencies, true, false);
  walk(project.devDependencies, true, true);
  walk(project.optionalDependencies, true, false);
}

const depCount = Object.keys(resolved).length;
console.error(`Walked ${projectCount} workspace projects -> ${depCount} unique resolved (name@version) packages.`);

// A frozen/broken graph is exactly the failure mode this job exists to cure.
// Refuse to submit a suspiciously tiny snapshot rather than silently
// replacing a stale-but-broad graph with a narrower "fresh" one.
const MIN_EXPECTED_DEPS = 500;
if (depCount < MIN_EXPECTED_DEPS) {
  console.error(
    `FATAL: only ${depCount} resolved packages found, expected >= ${MIN_EXPECTED_DEPS}. ` +
      'This looks like a partial/broken resolution, not a real whole-workspace graph — refusing to submit.',
  );
  process.exit(1);
}

const snapshot = {
  version: 0,
  sha,
  ref,
  job: {
    id: process.env.GITHUB_RUN_ID,
    correlator: `${process.env.GITHUB_WORKFLOW || 'dependency-graph'}-submit-snapshot`,
    ...(process.env.GITHUB_SERVER_URL
      ? { html_url: `${process.env.GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` }
      : {}),
  },
  detector: {
    name: 'orvex-wiki-pnpm-workspace-submitter',
    version: '1.0.0',
    url: `https://github.com/${owner}/${repo}/blob/dev/scripts/ci/submit-dependency-graph.mjs`,
  },
  scanned: new Date().toISOString(),
  manifests: {
    'pnpm-lock.yaml': {
      name: 'pnpm-lock.yaml',
      file: { source_location: 'pnpm-lock.yaml' },
      resolved,
    },
  },
};

const apiUrl = `https://api.github.com/repos/${owner}/${repo}/dependency-graph/snapshots`;
console.error(`Submitting snapshot: ${depCount} deps, sha=${sha}, ref=${ref} -> ${apiUrl}`);

let res;
try {
  res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(snapshot),
  });
} catch (err) {
  console.error('FATAL: network error POSTing the snapshot:', err.message);
  process.exit(1);
}

const bodyText = await res.text();
if (!res.ok) {
  console.error(`FATAL: dependency-graph/snapshots submission failed: HTTP ${res.status}`);
  console.error(bodyText);
  process.exit(1);
}

let body;
try {
  body = JSON.parse(bodyText);
} catch {
  console.error(`FATAL: submission returned HTTP ${res.status} but an unparseable body:`, bodyText);
  process.exit(1);
}

if (body.result && body.result !== 'SUCCESS') {
  console.error(`FATAL: submission accepted (HTTP ${res.status}) but result="${body.result}": ${body.message || '(no message)'}`);
  process.exit(1);
}

console.error(`Snapshot submitted OK: id=${body.id} result=${body.result || '(none)'} message=${body.message || ''}`);
