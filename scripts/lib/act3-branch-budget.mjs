// ENG-2055: pure ACT-3 branch/WIP admission and reaper policy.
export const MAX_BUILD_INFLIGHT = 10;
export const MAX_PENDING_MERGE = 10;

const count = (value) => Array.isArray(value) ? value.length : Number(value);

export function admit({ queued, inFlightCount, pendingMergeCount, pendingMergeReservations = 0 }) {
  if (!Number.isFinite(count(queued)) || count(queued) <= 0) return { admit: false, hold: false, reason: 'queue-empty' };
  if (!Number.isFinite(Number(inFlightCount)) || Number(inFlightCount) >= MAX_BUILD_INFLIGHT) return { admit: false, hold: true, reason: 'build-cap' };
  if (pendingMergeCount === null || pendingMergeCount === undefined || !Number.isFinite(Number(pendingMergeCount))) return { admit: false, hold: true, reason: 'pending-merge-count-unavailable' };
  if (!Number.isFinite(Number(pendingMergeReservations)) || Number(pendingMergeReservations) < 0) return { admit: false, hold: true, reason: 'pending-merge-reservations-invalid' };
  if (Number(pendingMergeCount) + Number(pendingMergeReservations) >= MAX_PENDING_MERGE) return { admit: false, hold: true, reason: 'pending-merge-cap' };
  return { admit: true, hold: false, reason: 'capacity-available' };
}

export function workBranchName(issue) {
  return `${String(issue).toLowerCase()}-work`;
}

export function planReaper({ mode = 'dry-run', candidates = [], priorCandidates = [] }) {
  const current = [...new Set(candidates.map(String))].sort();
  const prior = new Set(priorCandidates.map(String));
  const authorizedDeletes = mode === 'live' ? current.filter((branch) => prior.has(branch)) : [];
  return { mode, candidates: current, authorizedDeletes, disposition: authorizedDeletes.length ? 'delete-prior-candidates' : 'dry-run' };
}

export function formatBudgetSurface({ buildCount, pendingMergeCount, reaperCandidates = [] }) {
  const pending = pendingMergeCount === null || pendingMergeCount === undefined ? '?' : pendingMergeCount;
  return `build ${buildCount}/${MAX_BUILD_INFLIGHT} | pending-merge ${pending}/${MAX_PENDING_MERGE} | reaper candidates ${reaperCandidates.length}`;
}
