#!/usr/bin/env python3
"""Phase-0 Linear structuring batch (milestone assignments + blocked-by edges).
Idempotent-ish: re-running re-applies the same values. Run when the Linear
hourly rate window has headroom."""
import subprocess, json, time, sys

def run(args):
    r = subprocess.run(['linearis'] + args + ['--compact'], capture_output=True, text=True)
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        return {'_err': (r.stdout + r.stderr)[-150:]}

P0 = 'P0 — Stabilize the Ground'
ASSIGNS = [
    ('ENG-2033', 'Orvex Studio — Delivery Gates'), ('ENG-2034', 'Orvex Studio — Delivery Gates'),
    ('ENG-2035', 'Orvex Studio — Delivery Gates'), ('ENG-2036', 'Orvex Studio — Delivery Gates'),
    ('ENG-2040', 'Orvex Studio — Delivery Gates'),
    ('ENG-2039', 'Orvex Wiki'), ('ENG-2041', 'Orvex Wiki'), ('ENG-2042', 'Orvex Wiki'),
    ('ENG-2043', 'Orvex Wiki'), ('ENG-2044', 'Orvex Wiki'), ('ENG-2053', 'Orvex Wiki'),
    ('ENG-2054', 'Orvex Wiki API'),
]
EDGES = [('ENG-2033', b) for b in [
    'ENG-2039', 'ENG-2040', 'ENG-2041', 'ENG-2042', 'ENG-2043', 'ENG-2044',
    'ENG-2046', 'ENG-2047', 'ENG-2048', 'ENG-2049', 'ENG-2050', 'ENG-2053', 'ENG-2054']]
EDGES += [('ENG-2034', 'ENG-2033'), ('ENG-2036', 'ENG-2037'),
          ('ENG-2048', 'ENG-2039'), ('ENG-2053', 'ENG-2040'), ('ENG-2050', 'ENG-2046')]
# Pending Linear-MCP re-auth (cannot be done via linearis — no milestone create):
#   milestone 'P0 — Stabilize the Ground' on Orvex Studio Knowledge  -> then assign ENG-2046..2050
#   milestone 'P0 — Stabilize the Ground' on Orvex Studio AI         -> then assign ENG-2051, ENG-2052
#   milestone 'P1 — Definition Factory' on Orvex Studio — Delivery Gates -> then assign ENG-2037

fails = 0
for iss, proj in ASSIGNS:
    d = run(['issues', 'update', iss, '--project', proj, '--project-milestone', P0])
    ok = not d.get('_err')
    print(iss, '->', P0 if ok else d['_err'])
    fails += 0 if ok else 1
    time.sleep(1.5)
for iss, blocker in EDGES:
    d = run(['issues', 'update', iss, '--blocked-by', blocker])
    ok = not d.get('_err')
    print(f'{iss} blocked-by {blocker}:', 'ok' if ok else d['_err'])
    fails += 0 if ok else 1
    time.sleep(1.5)
print('BATCH COMPLETE, failures:', fails)
sys.exit(1 if fails else 0)
