import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetVerdict, projectFleetWrites, STAGE_WRITES } from '../lib/linear-write-budget.mjs';
test('15 agents at 20 stories remain within 60 percent of 2500', () => { const projection = projectFleetWrites({ agents: 15, storiesPerAgentPerHour: 20 }); assert.equal(projection.writesPerStory, 5); assert.equal(projection.projectedWritesPerHour, 1500); assert.equal(budgetVerdict(projection).verdict, 'PASS'); });
test('over-budget fleet fails and overhead is counted', () => { assert.equal(budgetVerdict(projectFleetWrites({ agents: 15, storiesPerAgentPerHour: 21 })).verdict, 'FAIL'); assert.equal(STAGE_WRITES.find((entry) => entry.stage === 'done-gate').calls, 3); assert.equal(projectFleetWrites({ agents: 1, storiesPerAgentPerHour: 1, escalationsPerAgentPerHour: 1, p1CorrectionsPerAgentPerHour: 1 }).projectedWritesPerHour, 10); });
