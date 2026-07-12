// image-freshness subsystem — pure domain logic (no I/O). ENG-1973.
//
// Design: given (a) the deployed image's build metadata (a commit SHA and/or
// a Harbor push_time) and (b) the repo's dev-branch commit log, compute how
// many commits the deployed image is behind origin/dev HEAD, and classify
// the result as FRESH / STALE_BUILD_FAILING / STALE_BUILD_PENDING.
//
// Exported functions are the tested surface (CS §4.2: test through the
// exported interface). kubectl / Harbor / git access lives only in
// scripts/check-image-freshness.mjs (the CLI shell) — never here.

/**
 * A `commits` array is ordered NEWEST-FIRST (as `git log` emits), each entry
 * `{ sha, committerEpochSeconds }`.
 */

/**
 * resolveBuiltFromCommit — given a Harbor artifact push_time (unix seconds,
 * UTC) and the dev commit log, return the sha of the latest commit at or
 * before push_time (i.e. the commit the running image was most likely built
 * from — Tekton triggers a build on push, so the build's source commit is the
 * newest commit that had already landed when the image was pushed).
 *
 * Returns null if no commit in the log is at/before push_time.
 */
export function resolveBuiltFromCommit(commits, pushTimeEpochSeconds) {
  for (const commit of commits) {
    if (commit.committerEpochSeconds <= pushTimeEpochSeconds) {
      return commit.sha;
    }
  }
  return null;
}

/**
 * computeCommitsBehind — count of commits strictly newer than `builtFromSha`
 * in `commits` (newest-first log covering up to origin/dev HEAD).
 *
 * Returns null if `builtFromSha` is not found in `commits` (can't compute a
 * distance — caller should treat this as UNKNOWN, not FRESH).
 */
export function computeCommitsBehind(commits, builtFromSha) {
  const idx = commits.findIndex((c) => c.sha === builtFromSha);
  if (idx === -1) return null;
  return idx;
}

/**
 * classify — decide the freshness verdict for one service.
 *
 * Inputs:
 *   commitsBehind: number|null (null = unknown, e.g. builtFromSha not in log)
 *   buildStatus: 'succeeded' | 'failed' | 'pending' | 'none' — status of the
 *     MOST RECENT build/PipelineRun for a commit newer than builtFromSha (i.e.
 *     the build that *should* have refreshed the image). 'none' means no such
 *     build has run at all yet (merely pending — under one build cycle old).
 *
 * Returns one of:
 *   'FRESH'                — commitsBehind is 0 (or null and never diverged)
 *   'STALE_BUILD_FAILING'  — commits behind AND the newer-commit build FAILED
 *   'STALE_BUILD_PENDING'  — commits behind but no failure observed yet
 *   'UNKNOWN'              — commitsBehind could not be computed
 */
export function classify(commitsBehind, buildStatus) {
  if (commitsBehind === null) return 'UNKNOWN';
  if (commitsBehind === 0) return 'FRESH';
  if (buildStatus === 'failed') return 'STALE_BUILD_FAILING';
  return 'STALE_BUILD_PENDING';
}

/**
 * evaluateService — end-to-end pure evaluation for one service, composing
 * resolveBuiltFromCommit + computeCommitsBehind + classify.
 *
 * `commits` newest-first, covering at least up to origin/dev HEAD (commits[0]
 * must be HEAD).
 */
export function evaluateService(name, { commits, pushTimeEpochSeconds, buildStatus }) {
  if (!commits || commits.length === 0) {
    return { name, verdict: 'UNKNOWN', commitsBehind: null, builtFromSha: null };
  }
  const builtFromSha = resolveBuiltFromCommit(commits, pushTimeEpochSeconds);
  const commitsBehind =
    builtFromSha === null ? null : computeCommitsBehind(commits, builtFromSha);
  const verdict = classify(commitsBehind, buildStatus);
  return { name, verdict, commitsBehind, builtFromSha };
}

/**
 * formatReport — human-readable multi-service summary. Returns
 * { text, hasFailing } where hasFailing drives the process exit code (the
 * gate: non-green only for STALE_BUILD_FAILING, per DoD "does not itself
 * trigger builds", i.e. this is a read-only alarm, not a build system).
 */
export function formatReport(results) {
  const lines = results.map((r) => {
    const behind = r.commitsBehind === null ? '?' : r.commitsBehind;
    return `${r.verdict.padEnd(20)} ${r.name} (behind: ${behind}, built-from: ${r.builtFromSha ?? 'unknown'})`;
  });
  const hasFailing = results.some((r) => r.verdict === 'STALE_BUILD_FAILING');
  const staleCount = results.filter((r) => r.verdict.startsWith('STALE')).length;
  lines.push('');
  lines.push(
    `${results.length} service(s) checked, ${staleCount} stale (${results.filter((r) => r.verdict === 'STALE_BUILD_FAILING').length} build-failing).`
  );
  return { text: lines.join('\n'), hasFailing };
}
