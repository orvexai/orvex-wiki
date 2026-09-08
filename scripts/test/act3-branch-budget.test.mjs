import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_BUILD_INFLIGHT, MAX_PENDING_MERGE, admit, formatBudgetSurface, planReaper, workBranchName } from '../lib/act3-branch-budget.mjs';

const ENGINE = readFileSync(new URL('../../tools/act3/delivery-engine.js', import.meta.url), 'utf8');
test('TestBranchBudgetEnforced admits ten and holds the rest', () => { let builds = 0; let reservations = 0; let held = 0; for (let remaining = 15; remaining; remaining--) { const decision = admit({ queued: remaining, inFlightCount: builds, pendingMergeCount: 0, pendingMergeReservations: reservations }); if (decision.admit) { builds++; reservations++; } else held++; } assert.equal(builds, MAX_BUILD_INFLIGHT); assert.equal(held, 5); });
test('pending merge cap and branch reuse are explicit', () => { assert.deepEqual(admit({ queued: 1, inFlightCount: 0, pendingMergeCount: MAX_PENDING_MERGE }), { admit: false, hold: true, reason: 'pending-merge-cap' }); assert.deepEqual([0, 1, 2].map(() => workBranchName('ENG-2055')), ['eng-2055-work', 'eng-2055-work', 'eng-2055-work']); assert.match(ENGINE, /workBranchName/); });
test('reaper requires a prior dry-run and dashboard names both live caps', () => { const first = planReaper({ candidates: ['eng-1-work'] }); assert.deepEqual(first.authorizedDeletes, []); assert.deepEqual(planReaper({ mode: 'live', candidates: ['eng-1-work', 'eng-2-work'], priorCandidates: first.candidates }).authorizedDeletes, ['eng-1-work']); assert.match(formatBudgetSurface({ buildCount: 7, pendingMergeCount: 4, reaperCandidates: ['eng-1-work'] }), /build 7\/10.*pending-merge 4\/10.*reaper candidates 1/); });
test('unavailable merge inventory holds claims instead of bypassing the guard', () => { assert.deepEqual(admit({ queued: 1, inFlightCount: 0, pendingMergeCount: null }), { admit: false, hold: true, reason: 'pending-merge-count-unavailable' }); });
