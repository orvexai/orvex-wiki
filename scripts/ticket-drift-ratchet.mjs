#!/usr/bin/env node
// ENG-2818: map merge/wiki drift to open stories and emit idempotent REBASELINE comments.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { affectedByPaths, affectedBySlugs, buildIndex, extractPathCites, extractSlugCites } from './lib/cite-index.mjs';
import { planBatches, readQuota } from './lib/linear-write-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CORPUS = path.join(ROOT, '.cache', 'linear', 'issues');
const DEFAULT_LEDGER = path.join(ROOT, '.ticket-drift-ratchet-ledger.json');
const MARKER_VERSION = 'ticket-drift-ratchet:v1';

function scalar(value) { const text = value.trim(); if (text.startsWith('"')) { try { return JSON.parse(text); } catch { return text.slice(1, -1); } } return text === 'null' ? null : text; }
function loadYaml(file) {
  const lines = readFileSync(file, 'utf8').split('\n'); const issue = {};
  for (const line of lines) { const match = line.match(/^(identifier|state_type|status|description):\s*(.*)$/); if (match) issue[match[1]] = scalar(match[2]); }
  return issue;
}
function loadCorpus(source = DEFAULT_CORPUS) {
  if (source.endsWith('.json')) return JSON.parse(readFileSync(source, 'utf8')).issues ?? JSON.parse(readFileSync(source, 'utf8'));
  if (!existsSync(source)) return [];
  return readdirSync(source).filter((name) => name.endsWith('.yaml')).map((name) => loadYaml(path.join(source, name)));
}
function readLines(file) { return readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
function loadLedger(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }
function saveLedger(file, value) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function commentFor(story, cites, eventId) { return `[${MARKER_VERSION}] REBASELINE required for ${story} after ${eventId}; affected citation(s): ${cites.join(', ')}. Re-check the cited premise against current HEAD before claiming.`; }

export function computeRatchet({ corpus = [], paths = [], slugs = [], dryRun = true, budgetLimit = 2500, ledgerFile = DEFAULT_LEDGER, eventId = 'unspecified-event', runner = (command, args) => execFileSync(command, args, { encoding: 'utf8' }), quotaReader = () => ({ requestsRemaining: budgetLimit, requestsLimit: budgetLimit, requestsReset: null }) } = {}) {
  const index = buildIndex(corpus); const pathHits = affectedByPaths(index, paths); const slugHits = affectedBySlugs(index, slugs); const affected = new Map();
  for (const hit of [...pathHits.matched, ...slugHits.matched]) { if (!affected.has(hit.id)) affected.set(hit.id, []); affected.get(hit.id).push(`${hit.cite} (${hit.reason})`); }
  const ledger = loadLedger(ledgerFile); const stories = [...affected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, cites]) => ({ id, cites: [...new Set(cites)], marker: `${MARKER_VERSION}:${createHash('sha256').update(`${eventId}:${id}`).digest('hex').slice(0, 16)}` }));
  const pending = stories.filter((story) => !ledger[story.marker]);
  const quota = dryRun ? { requestsRemaining: budgetLimit } : quotaReader();
  const limit = Number(quota.requestsRemaining ?? budgetLimit);
  const writes = planBatches(pending, { limit });
  if (!dryRun && writes.deferred.length) throw new Error(`ticket-drift-ratchet: write budget deferred ${writes.deferred.length} stories`);
  if (!dryRun) {
    for (const story of writes.batches.flat()) {
      const body = commentFor(story.id, story.cites, eventId);
      const existing = runner('linearis', ['issues', 'discussions', story.id]);
      if (!String(existing ?? '').includes(story.marker)) runner('linearis', ['issues', 'discuss', story.id, '--body', body]);
      ledger[story.marker] = { id: story.id, eventId, status: 'applied' };
    }
    saveLedger(ledgerFile, ledger);
  }
  return { eventId, stories: writes.batches.flat().map((story) => ({ ...story, comment: commentFor(story.id, story.cites, eventId) })), advisory: [...pathHits.advisory, ...slugHits.advisory], writes };
}

function selfTest() {
  const corpus = [{ identifier: 'ENG-F1', state_type: 'started', description: '[Source: `apps/server/src/target.ts`; canon kldiZu93EC]' }, { identifier: 'ENG-F2', state_type: 'completed', description: '`apps/server/src/target.ts`' }];
  const report = computeRatchet({ corpus, paths: ['apps/server/src/target.ts'], dryRun: true, budgetLimit: 100 });
  assert.equal(report.stories.length, 1); assert.deepEqual(extractPathCites('Existing code (HEAD): apps/server/src/other.ts'), ['apps/server/src/other.ts']); assert.deepEqual(extractSlugCites('ordinary prose'), []);
  process.stdout.write('ticket-drift-ratchet self-test PASS\n');
}
function arg(args, name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) selfTest();
  else {
    const corpus = loadCorpus(arg(args, '--corpus') || DEFAULT_CORPUS); const paths = arg(args, '--paths') ? readLines(arg(args, '--paths')) : []; const slugs = arg(args, '--slugs') ? readLines(arg(args, '--slugs')) : [];
    const report = computeRatchet({ corpus, paths, slugs, dryRun: args.includes('--dry-run'), eventId: arg(args, '--event-id') || 'cli-event', ledgerFile: arg(args, '--ledger') || DEFAULT_LEDGER, budgetLimit: Number(process.env.LINEAR_WRITE_QUOTA || 2500) });
    const output = arg(args, '--json-out'); if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); process.stdout.write(`${JSON.stringify(report)}\n`);
  }
}
