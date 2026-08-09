#!/usr/bin/env node
// Explicit GitHub Dependency Submission API push for this repo's Go modules.
//
// WHY THIS EXISTS — sibling to submit-dependency-graph.mjs (npm/pnpm
// workspace coverage). This repo also carries TWO Go modules —
// deploy/kustomize/go.mod and tests/smoke/go.mod — that were, until this
// script, covered ONLY by GitHub's *passive* lockfile-parse-on-push
// dependency graph: the exact mechanism that silently froze for the npm
// side for a month (see reports/security/wiki-ghost-alerts.md and
// reports/security/wiki-depgraph-freeze-fix.md). The 2026-08-09 re-ingest's
// 13 golang.org/x/crypto alerts (several critical, previously invisible)
// are the live proof that the passive updater matters here too. This script
// gives the Go side the same belt-and-braces explicit submission the npm
// side got, rather than leaving it to ride the mechanism that just failed.
//
// COVERAGE: discovers EVERY go.mod under the repo root (not a hand-picked
// list) so a future Go module added to the tree is covered automatically
// instead of silently riding the passive updater again — the same
// whole-workspace philosophy as submit-dependency-graph.mjs, applied via a
// filesystem walk instead of pnpm's own workspace resolution (Go modules
// have no single workspace-membership file equivalent here). Refuses to
// submit (exits non-zero) if fewer modules or fewer resolved dependencies
// than the known floor are found — a partial/broken discovery is worse than
// leaving the passive graph in place.
//
// Driven by `go list -m -json all` per module — Go's OWN dependency
// resolution, not a hand-rolled go.sum parser, mirroring the npm script's
// "trust the tool" design. `go list -m -json all` prints one JSON object per
// module concatenated with no separators (not a JSON array), so this script
// parses that stream itself rather than depending on `jq` (not used
// anywhere else in this repo's CI, and not guaranteed present on the
// `public-runners` pool).
//
// FAILS LOUDLY, deliberately, at every stage — same discipline as
// submit-dependency-graph.mjs: missing provenance env vars, a `go list`
// failure, unparseable output, a module-count or dependency-count floor, a
// non-2xx API response, or an accepted-but-non-SUCCESS API result all exit
// non-zero with a specific stderr message.
//
// Submitted as an INDEPENDENT snapshot (own correlator, own job) from the
// npm one — see dependency-graph.yml's header comment for why a sibling job
// rather than folding this into the npm script.

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// The commit actually on disk right now — NOT process.env.GITHUB_SHA, which
// reflects the triggering event's ref and is WRONG under workflow_dispatch
// when a different `ref` input was used to check out a different branch
// than the one that dispatched the run. Same reasoning as the npm script.
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

// ---------------------------------------------------------------------------
// Discover every go.mod under the repo root.
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Directories that cannot contain a Go module worth submitting (or that
// would make the walk needlessly slow/noisy). node_modules/.pnpm-store never
// hold a go.mod in this repo; skipping them is a speed guard, not a coverage
// gap.
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.pnpm-store', '.turbo', '.next', 'dist', 'coverage']);

function findGoModDirs(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`FATAL: could not read directory "${dir}" while discovering go.mod files: ${err.message}`);
    process.exit(1);
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      findGoModDirs(path.join(dir, entry.name), found);
    } else if (entry.isFile() && entry.name === 'go.mod') {
      found.push(dir);
    }
  }
  return found;
}

const goModDirs = findGoModDirs(repoRoot).sort();

// Hard floor on Go module count: deploy/kustomize + tests/smoke = 2, per the
// tree as of 2026-08-09 (see the ghost-alerts / re-ingest reports' Go-module
// cross-check). If this drops, either a module was removed (update this
// constant to match, deliberately) or discovery silently broke — either way,
// LOUD, not silent. A count going UP is fine and needs no gate: the walk
// picks new modules up automatically.
const EXPECTED_MIN_GO_MODULES = 2;
if (goModDirs.length < EXPECTED_MIN_GO_MODULES) {
  console.error(
    `FATAL: found ${goModDirs.length} go.mod file(s) under the repo root, expected >= ${EXPECTED_MIN_GO_MODULES}. ` +
      'Refusing to submit a partial Go-module snapshot — that would be worse than the passive graph it supplements.',
  );
  process.exit(1);
}
console.error(`Discovered ${goModDirs.length} Go module(s): ${goModDirs.map((d) => path.relative(repoRoot, d)).join(', ')}`);

// ---------------------------------------------------------------------------
// Parse `go list -m -json all` output: a stream of concatenated JSON objects
// (NOT a JSON array, NOT newline-delimited) — split on balanced top-level
// braces, respecting JSON string quoting so a brace inside a string value
// (e.g. a module path or timestamp, none currently do, but don't assume)
// can never desync the split.
// ---------------------------------------------------------------------------

function parseConcatenatedJSONObjects(text) {
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        throw new Error(`unbalanced '}' at offset ${i}`);
      }
      if (depth === 0) {
        const chunk = text.slice(start, i + 1);
        results.push(JSON.parse(chunk));
        start = -1;
      }
    }
  }
  if (depth !== 0 || inString) {
    throw new Error('unterminated JSON object/string at end of input');
  }
  return results;
}

function purlFor(modulePath, version) {
  // Go module paths (github.com/foo/bar, gopkg.in/yaml.v3, ...) are already
  // URL-path-safe — encode only the version, which can carry characters
  // (e.g. '+' in build metadata) that are not always URL-safe verbatim.
  return `pkg:golang/${modulePath}@${encodeURIComponent(version)}`;
}

/** @type {Record<string, {package_url: string, relationship: 'direct'|'indirect', scope: 'runtime'}>} */
const manifests = {};
let totalDepCount = 0;

for (const modDir of goModDirs) {
  const relDir = path.relative(repoRoot, modDir);
  const manifestKey = `${relDir}/go.mod`;

  console.error(`Resolving Go module build list for ${manifestKey} (go list -m -json all)...`);
  let raw;
  try {
    raw = execFileSync('go', ['list', '-m', '-json', 'all'], {
      cwd: modDir,
      maxBuffer: 1024 * 1024 * 256,
      encoding: 'utf8',
    });
  } catch (err) {
    console.error(`FATAL: \`go list -m -json all\` failed in ${manifestKey}:`, err.message);
    if (err.stderr) console.error(String(err.stderr));
    process.exit(1);
  }

  let modules;
  try {
    modules = parseConcatenatedJSONObjects(raw);
  } catch (err) {
    console.error(`FATAL: \`go list -m -json all\` output for ${manifestKey} did not parse as concatenated JSON objects:`, err.message);
    process.exit(1);
  }

  if (!Array.isArray(modules) || modules.length === 0) {
    console.error(`FATAL: \`go list -m -json all\` reported zero modules for ${manifestKey} — refusing to submit an empty manifest.`);
    process.exit(1);
  }

  /** @type {Record<string, {package_url: string, relationship: 'direct'|'indirect', scope: 'runtime'}>} */
  const resolved = {};
  for (const mod of modules) {
    if (mod.Main) continue; // the module itself, not a dependency
    if (!mod.Path || !mod.Version) continue; // e.g. a `replace`-only stub with no resolvable version
    const key = `${mod.Path}@${mod.Version}`;
    resolved[key] = {
      package_url: purlFor(mod.Path, mod.Version),
      relationship: mod.Indirect ? 'indirect' : 'direct',
      // Go's module graph has no devDependency-equivalent split at the
      // go.mod level (unlike package.json's dependencies/devDependencies) —
      // every resolved module here is part of the module's own build list.
      scope: 'runtime',
    };
  }

  const depCount = Object.keys(resolved).length;
  console.error(`  -> ${depCount} resolved dependency module(s) (excluding the main module itself).`);

  manifests[manifestKey] = {
    name: manifestKey,
    file: { source_location: manifestKey },
    resolved,
  };
  totalDepCount += depCount;
}

// A frozen/broken graph is exactly the failure mode this job exists to
// guard against on the npm side too — same discipline here. Floor set well
// below the ~250 combined resolved modules observed for this repo's two Go
// modules on 2026-08-09, with headroom for legitimate future shrinkage,
// while still catching a broken/partial resolution (e.g. `go list` running
// against an empty module cache and silently reporting almost nothing).
const MIN_EXPECTED_GO_DEPS = 200;
if (totalDepCount < MIN_EXPECTED_GO_DEPS) {
  console.error(
    `FATAL: only ${totalDepCount} resolved Go dependency modules found across ${goModDirs.length} module(s), expected >= ${MIN_EXPECTED_GO_DEPS}. ` +
      'This looks like a partial/broken resolution, not a real dependency graph — refusing to submit.',
  );
  process.exit(1);
}

const snapshot = {
  version: 0,
  sha,
  ref,
  job: {
    id: process.env.GITHUB_RUN_ID,
    // Hardcoded literal, deliberately DIFFERENT from the npm job's
    // correlator — these are two independent, coexisting snapshot streams
    // (different manifests, different toolchain), not one that should
    // supersede the other. Never derived from GITHUB_WORKFLOW: see
    // submit-dependency-graph.mjs's correlator comment for why a
    // display-name-derived correlator orphans snapshots permanently (no
    // delete API exists).
    correlator: 'dependency-graph-go-submit-snapshot',
    ...(process.env.GITHUB_SERVER_URL
      ? { html_url: `${process.env.GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` }
      : {}),
  },
  detector: {
    name: 'orvex-wiki-go-modules-submitter',
    version: '1.0.0',
    url: `https://github.com/${owner}/${repo}/blob/dev/scripts/ci/submit-go-dependency-graph.mjs`,
  },
  scanned: new Date().toISOString(),
  manifests,
};

const apiUrl = `https://api.github.com/repos/${owner}/${repo}/dependency-graph/snapshots`;
console.error(
  `Submitting Go snapshot: ${totalDepCount} deps across ${Object.keys(manifests).length} manifest(s), sha=${sha}, ref=${ref} -> ${apiUrl}`,
);

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
  console.error('FATAL: network error POSTing the Go snapshot:', err.message);
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

// Positive assertion, same as the npm script: a 2xx body that omits
// `result` entirely must NOT pass silently.
if (body.result !== 'SUCCESS') {
  console.error(
    `FATAL: submission accepted (HTTP ${res.status}) but result="${body.result ?? '(missing)'}" (expected "SUCCESS"): ${body.message || '(no message)'}`,
  );
  process.exit(1);
}

console.error(`Go snapshot submitted OK: id=${body.id} result=${body.result} message=${body.message || ''}`);
