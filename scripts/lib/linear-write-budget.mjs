#!/usr/bin/env node
// ENG-2810/ENG-2818: shared Linear write accounting and process-local pause gate.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const STAGE_WRITES = Object.freeze([
  Object.freeze({ stage: 'startup-reclaim', calls: 2, perStory: false }),
  Object.freeze({ stage: 'claim', calls: 2, perStory: true }),
  Object.freeze({ stage: 'build-progress', calls: 0, perStory: true }),
  Object.freeze({ stage: 'review-progress', calls: 0, perStory: true }),
  Object.freeze({ stage: 'escalation', calls: 2, perStory: false }),
  Object.freeze({ stage: 'done-gate', calls: 3, perStory: true }),
  Object.freeze({ stage: 'p1-correction', calls: 3, perStory: false }),
  Object.freeze({ stage: 'done-gate-correction', calls: 3, perStory: false }),
]);

const nonNegative = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

export function projectFleetWrites({ agents = 0, storiesPerAgentPerHour = 0, startupReclaimsPerAgentPerHour = 0, escalationsPerAgentPerHour = 0, p1CorrectionsPerAgentPerHour = 0, doneGateCorrectionsPerAgentPerHour = 0 } = {}) {
  const agentCount = nonNegative(agents);
  const stories = nonNegative(storiesPerAgentPerHour);
  const perStory = STAGE_WRITES.filter((entry) => entry.perStory).reduce((sum, entry) => sum + entry.calls, 0);
  const calls = (stage) => STAGE_WRITES.find((entry) => entry.stage === stage)?.calls ?? 0;
  const overhead = nonNegative(startupReclaimsPerAgentPerHour) * calls('startup-reclaim')
    + nonNegative(escalationsPerAgentPerHour) * calls('escalation')
    + nonNegative(p1CorrectionsPerAgentPerHour) * calls('p1-correction')
    + nonNegative(doneGateCorrectionsPerAgentPerHour) * calls('done-gate-correction');
  return {
    agents: agentCount, storiesPerAgentPerHour: stories, writesPerStory: perStory,
    projectedWritesPerHour: agentCount * (stories * perStory + overhead),
    breakdown: { storyWritesPerHour: agentCount * stories * perStory, overheadWritesPerHour: agentCount * overhead },
  };
}

export function budgetVerdict(projection, { quota = 2500, ceiling = 0.6 } = {}) {
  const quotaValue = nonNegative(quota, 2500);
  const ceilingValue = nonNegative(ceiling, 0.6);
  const allowedWritesPerHour = quotaValue * ceilingValue;
  const projected = nonNegative(projection?.projectedWritesPerHour, Number.POSITIVE_INFINITY);
  return { verdict: projected <= allowedWritesPerHour ? 'PASS' : 'FAIL', quota: quotaValue, ceiling: ceilingValue, allowedWritesPerHour, projectedWritesPerHour: projected, quotaUtilisation: quotaValue === 0 ? null : projected / quotaValue };
}

export function makeBudgetReport(options = {}) {
  const projection = projectFleetWrites(options);
  return { ...projection, ...budgetVerdict(projection, options) };
}

export function planBatches(writes = [], options = {}) {
  if (!Array.isArray(writes)) throw new TypeError('writes must be an array');
  const limit = Number(options.limit);
  const utilisationCap = Number(options.utilisationCap ?? 0.6);
  const batchSize = Math.max(1, Math.floor(Number(options.batchSize ?? 50)));
  if (!Number.isFinite(limit) || limit < 0) throw new TypeError('limit must be a non-negative number');
  if (!Number.isFinite(utilisationCap) || utilisationCap <= 0 || utilisationCap > 1) throw new TypeError('utilisationCap must be greater than 0 and at most 1');
  const permitted = Math.min(writes.length, Math.floor(limit * utilisationCap));
  const planned = writes.slice(0, permitted); const batches = [];
  for (let i = 0; i < planned.length; i += batchSize) batches.push(planned.slice(i, i + batchSize));
  return { batches, totalWrites: writes.length, plannedWrites: planned.length, deferred: writes.slice(permitted), deferredCount: writes.length - planned.length, utilisationCap, available: permitted };
}

export function readQuota(options = {}) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const script = options.script ?? path.join(root, '_bmad', 'lnr', 'tools', 'linear-sync.sh');
  const runner = options.runner ?? ((file, args, execOptions) => execFileSync(file, args, execOptions));
  let output;
  try { output = runner(script, ['quota'], { cwd: options.cwd ?? root, encoding: 'utf8' }); }
  catch (error) { output = `${error.stdout ?? ''}`.trim(); if (!output) throw new Error(`Linear quota probe failed: ${error.message}`); }
  try { output = typeof output === 'string' ? JSON.parse(output.trim()) : output; }
  catch (error) { throw new Error(`Linear quota probe returned invalid JSON: ${error.message}`); }
  if (!output || typeof output !== 'object') throw new Error('Linear quota probe returned a non-object JSON value');
  return { ...output, requestsRemaining: Number.isFinite(Number(output.requestsRemaining)) ? Number(output.requestsRemaining) : null, requestsLimit: Number.isFinite(Number(output.requestsLimit)) ? Number(output.requestsLimit) : null, requestsReset: output.requestsReset ?? null };
}

function resetEpoch(value, now) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : now + 60_000;
}

export function createSharedWriteGate(options = {}) {
  let pausedUntil = null;
  const now = options.now ?? (() => Date.now());
  return {
    consult(at = now()) { if (pausedUntil !== null && at >= pausedUntil) pausedUntil = null; return { allowed: pausedUntil === null, paused: pausedUntil !== null, resetAt: pausedUntil, waitMs: pausedUntil === null ? 0 : Math.max(0, pausedUntil - at) }; },
    pause(resetAt) { pausedUntil = Math.max(pausedUntil ?? 0, resetEpoch(resetAt, now())); return this.consult(); },
    observe(response = {}) { const status = Number(response.status ?? response.statusCode); const text = `${response.error ?? response.message ?? ''}`.toLowerCase(); return status === 429 || text.includes('rate limit') || text.includes('rate_limited') ? this.pause(response.requestsReset ?? response.resetAt ?? response.retryAfter) : this.consult(); },
  };
}

export const sharedWriteGate = createSharedWriteGate();

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = makeBudgetReport({ agents: process.env.LINEAR_WRITE_AGENTS ?? 15, storiesPerAgentPerHour: process.env.LINEAR_STORIES_PER_AGENT_HOUR ?? 20, startupReclaimsPerAgentPerHour: process.env.LINEAR_STARTUP_RECLAIMS_PER_AGENT_PER_HOUR ?? 0, escalationsPerAgentPerHour: process.env.LINEAR_ESCALATIONS_PER_AGENT_PER_HOUR ?? 0, p1CorrectionsPerAgentPerHour: process.env.LINEAR_P1_CORRECTIONS_PER_AGENT_PER_HOUR ?? 0, doneGateCorrectionsPerAgentPerHour: process.env.LINEAR_DONE_GATE_CORRECTIONS_PER_AGENT_HOUR ?? 0, quota: process.env.LINEAR_WRITE_QUOTA ?? 2500, ceiling: process.env.LINEAR_WRITE_CEILING ?? 0.6 });
  const index = process.argv.indexOf('--json-out');
  if (index !== -1) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.argv[index + 1], `${JSON.stringify(report, null, 2)}\n`); }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}
