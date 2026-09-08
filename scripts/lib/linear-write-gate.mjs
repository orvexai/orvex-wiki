#!/usr/bin/env node
// ENG-2810: serialize Linear writes, share 429 backoff, and replay safely.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BACKOFF_SECONDS = 60;
const READY = '__LINEAR_WRITE_LOCK_READY__';
function paths() {
  const dir = path.resolve(process.env.LINEAR_CACHE_DIR || path.join(process.cwd(), '.cache', 'linear'));
  mkdirSync(dir, { recursive: true });
  return { dir, lock: path.join(dir, '.write-gate.lock'), state: path.join(dir, 'write-gate.json'), ledger: path.join(dir, 'write-ledger.jsonl') };
}
function readState() { try { return JSON.parse(readFileSync(paths().state, 'utf8')); } catch { return { openUntilMs: 0 }; } }
function writeState(retryAfter) {
  const seconds = Math.max(0, Number(retryAfter) || DEFAULT_BACKOFF_SECONDS);
  const state = { openUntilMs: Date.now() + Math.ceil(seconds * 1000), last429At: new Date().toISOString(), retryAfterSec: seconds };
  const file = paths().state; const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state)}\n`); renameSync(temporary, file); return state;
}
function acquireLock() {
  const child = spawn('flock', ['-x', paths().lock, '-c', `printf '${READY}\\n'; cat`], { stdio: ['pipe', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let output = ''; let error = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timed out acquiring Linear write gate')); }, 30_000);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); if (output.includes(READY)) { clearTimeout(timer); resolve({ release: () => child.stdin.end() }); } });
    child.stderr.on('data', (chunk) => { error += chunk.toString(); });
    child.once('error', (err) => { clearTimeout(timer); reject(err); });
    child.once('exit', (code) => { if (!output.includes(READY)) { clearTimeout(timer); reject(new Error(`flock exited before acquiring gate (${code}): ${error}`)); } });
  });
}
function appendUnlocked(entry) { const record = { ...entry, recordedAt: entry.recordedAt || new Date().toISOString(), pid: entry.pid || process.pid }; appendFileSync(paths().ledger, `${JSON.stringify(record)}\n`); return record; }
function latest() {
  const { ledger } = paths(); const values = new Map();
  if (!existsSync(ledger)) return values;
  for (const line of readFileSync(ledger, 'utf8').split('\n')) { if (!line.trim()) continue; try { const entry = JSON.parse(line); if (entry.key) values.set(entry.key, entry); } catch { /* ignore truncated final line */ } }
  return values;
}
export function idempotencyKey(issue, stage, payload) { return `${issue}:${stage}:${createHash('sha256').update(payload).digest('hex')}`; }
export async function ledgerAppend(entry) { const lock = await acquireLock(); try { return appendUnlocked(entry); } finally { lock.release(); } }
export function ledgerReplay() { return [...latest().values()].filter((entry) => entry.status !== 'applied').sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt))); }
export async function signal429(retryAfterSeconds = DEFAULT_BACKOFF_SECONDS) { const lock = await acquireLock(); try { return writeState(retryAfterSeconds); } finally { lock.release(); } }
async function withWriteGate(fn) {
  for (;;) {
    const lock = await acquireLock(); const wait = Number(readState().openUntilMs || 0) - Date.now();
    if (wait > 0) { lock.release(); await delay(wait); continue; }
    try { return await fn({ signal429: writeState, append: appendUnlocked }); } finally { lock.release(); }
  }
}
function retryAfter(output) { const match = String(output).match(/(?:retry-after|retry_after|retry after)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i); return match ? Number(match[1]) : DEFAULT_BACKOFF_SECONDS; }
function limited(output, code) { return code === 429 || /(?:rate[_ -]?limited|rate limit|too many requests|\b429\b)/i.test(String(output)); }
async function runCommand({ issue, stage, payload, argv, cwd = process.cwd() }) {
  const key = idempotencyKey(issue, stage, payload);
  if (latest().get(key)?.status === 'applied') { process.stdout.write(`${JSON.stringify({ key, status: 'skipped', reason: 'already-applied' })}\n`); return 0; }
  const result = await withWriteGate(async ({ signal429, append }) => {
    append({ key, issue, stage, payload: payload.toString(), argv, cwd, status: 'pending' });
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['inherit', 'pipe', 'pipe'] }); let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); process.stdout.write(chunk); }); child.stderr.on('data', (chunk) => { output += chunk.toString(); process.stderr.write(chunk); });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0))); });
    if (code === 0) { append({ key, issue, stage, payload: payload.toString(), argv, cwd, status: 'applied' }); return { code: 0, status: 'applied', key }; }
    if (limited(output, code)) { const seconds = Number(process.env.LINEAR_RETRY_AFTER_SEC) || retryAfter(output); signal429(seconds); append({ key, issue, stage, payload: payload.toString(), argv, cwd, status: 'deferred', reason: 'rate_limited', retryAfterSec: seconds }); return { code: 75, status: 'deferred', key }; }
    append({ key, issue, stage, payload: payload.toString(), argv, cwd, status: 'deferred', reason: `exit_${code}` }); return { code: code || 1, status: 'deferred', key };
  });
  process.stdout.write(`${JSON.stringify(result)}\n`); return result.code;
}
export async function replayLedger() { const results = []; for (const entry of ledgerReplay()) results.push(await runCommand({ issue: entry.issue, stage: entry.stage, payload: Buffer.from(entry.payload || ''), argv: entry.argv, cwd: entry.cwd || process.cwd() })); return results; }
function value(args, name) { const index = args.indexOf(name); return index === -1 ? null : args[index + 1]; }
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'replay') { process.stdout.write(`${JSON.stringify(ledgerReplay())}\n`); return; }
  if (args[0] === 'replay-run') { process.exitCode = (await replayLedger()).some((code) => code !== 0) ? 1 : 0; return; }
  if (args[0] !== 'run') throw new Error('usage: linear-write-gate.mjs run --issue ENG-N --stage STAGE --payload-file FILE -- COMMAND [ARGS...]');
  const separator = args.indexOf('--'); const issue = value(args, '--issue'); const stage = value(args, '--stage'); const file = value(args, '--payload-file');
  if (separator < 0 || separator === args.length - 1 || !issue || !stage || !file) throw new Error('issue, stage, payload-file, and command are required');
  process.exitCode = await runCommand({ issue, stage, payload: readFileSync(file), argv: args.slice(separator + 1) });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
