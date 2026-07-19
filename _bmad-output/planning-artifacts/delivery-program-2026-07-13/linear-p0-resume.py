#!/usr/bin/env python3
"""Resumable Phase-0 Linear structuring driver. Walks all pending ops with a
progress ledger; sleeps through rate-limit walls; emits sparse progress lines."""
import subprocess, json, time, os, sys

PROG = '/home/daniel/repos/orvex-wiki/_bmad-output/planning-artifacts/delivery-program-2026-07-13'
LEDGER = f'{PROG}/linear-p0-progress.json'

def run(args):
    r = subprocess.run(['linearis'] + args + ['--compact'], capture_output=True, text=True)
    out = r.stdout + r.stderr
    if 'Rate limit exceeded' in out or 'requests are allowed per' in out:
        return 'RATELIMIT'
    try:
        json.loads(r.stdout.strip().splitlines()[-1])
        return 'OK'
    except Exception:
        return 'ERR:' + out[-120:].replace('\n', ' ')

P0 = 'P0 — Stabilize the Ground'
OPS = []
for iss, proj in [
    ('ENG-2033', 'Orvex Studio — Delivery Gates'), ('ENG-2034', 'Orvex Studio — Delivery Gates'),
    ('ENG-2035', 'Orvex Studio — Delivery Gates'), ('ENG-2036', 'Orvex Studio — Delivery Gates'),
    ('ENG-2040', 'Orvex Studio — Delivery Gates'),
    ('ENG-2039', 'Orvex Wiki'), ('ENG-2041', 'Orvex Wiki'), ('ENG-2042', 'Orvex Wiki'),
    ('ENG-2043', 'Orvex Wiki'), ('ENG-2044', 'Orvex Wiki'), ('ENG-2053', 'Orvex Wiki'),
    ('ENG-2054', 'Orvex Wiki API')]:
    OPS.append((f'ms:{iss}', ['issues', 'update', iss, '--project', proj, '--project-milestone', P0]))
edges = [('ENG-2033', b) for b in [
    'ENG-2039', 'ENG-2040', 'ENG-2041', 'ENG-2042', 'ENG-2043', 'ENG-2044',
    'ENG-2046', 'ENG-2047', 'ENG-2048', 'ENG-2049', 'ENG-2050', 'ENG-2053', 'ENG-2054']]
edges += [('ENG-2034', 'ENG-2033'), ('ENG-2036', 'ENG-2037'),
          ('ENG-2048', 'ENG-2039'), ('ENG-2053', 'ENG-2040'), ('ENG-2050', 'ENG-2046')]
for iss, blocker in edges:
    OPS.append((f'edge:{iss}<-{blocker}', ['issues', 'update', iss, '--blocked-by', blocker]))

done = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}
# seed: ops confirmed landed in earlier runs
for k in ['ms:ENG-2033', 'ms:ENG-2034', 'ms:ENG-2035']:
    done.setdefault(k, 'OK')

landed_this_run, errors = 0, []
for key, args in OPS:
    if done.get(key) == 'OK':
        continue
    while True:
        res = run(args)
        if res == 'RATELIMIT':
            time.sleep(600)
            continue
        done[key] = res
        json.dump(done, open(LEDGER, 'w'), indent=0)
        if res == 'OK':
            landed_this_run += 1
            if landed_this_run % 5 == 0:
                ok_total = sum(1 for v in done.values() if v == 'OK')
                print(f'progress: {ok_total}/{len(OPS)} ops landed', flush=True)
        else:
            errors.append((key, res))
            print(f'ERROR {key}: {res}', flush=True)
        time.sleep(2)
        break

ok_total = sum(1 for v in done.values() if v == 'OK')
print(f'BATCH COMPLETE: {ok_total}/{len(OPS)} landed, {len(errors)} errors', flush=True)
sys.exit(1 if errors else 0)
