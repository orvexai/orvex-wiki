import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
test('wrapper records an applied write and suppresses duplicate application', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'linear-write-gate-')); const cache = path.join(dir, 'cache'); const payload = path.join(dir, 'payload'); const command = path.join(dir, 'linearis'); const calls = path.join(dir, 'calls');
  writeFileSync(payload, 'issues discuss ENG-2810 --body test\n'); writeFileSync(command, `#!/usr/bin/env bash\nprintf x >> ${JSON.stringify(calls)}\n`); chmodSync(command, 0o755);
  const env = { ...process.env, LINEAR_CACHE_DIR: cache, LINEAR_WRITE_SKIP_REFRESH: '1', PATH: `${dir}:${process.env.PATH}` };
  const args = ['--issue', 'ENG-2810', '--stage', 'test', '--payload-file', payload, '--', 'linearis'];
  assert.equal(spawnSync(path.join(root, 'tools/act3/linear-write.sh'), args, { env, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(path.join(root, 'tools/act3/linear-write.sh'), args, { env, encoding: 'utf8' }).status, 0);
  assert.equal(readFileSync(calls, 'utf8'), 'x');
  assert.match(readFileSync(path.join(cache, 'write-ledger.jsonl'), 'utf8'), /"status":"applied"/);
  rmSync(dir, { recursive: true, force: true });
});
