#!/usr/bin/env python3
"""File the 15 verified gap-fix stories. Ledger-driven (ledger-fixes.json), paced.
Creates the one NEW milestone (knowledge B11), the 15 issues under their milestones,
the blocked-by pack edges, verifies by re-read, and appends the stories to the
breakdown plan.jsons (audit: absent, or present for verify-harden)."""
import json, os, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(DIR)
SPECS = json.load(open(os.path.join(DIR, 'fix-specs.json')))['fixes']
LEDGER = os.path.join(DIR, 'ledger-fixes.json')
PAUSE = 1.5
ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}


def save():
    json.dump(ledger, open(LEDGER, 'w'), indent=1)


def lin(args, retries=20):
    for _ in range(retries):
        r = subprocess.run(['linearis'] + args + ['--compact'], capture_output=True, text=True)
        out = (r.stdout or '') + (r.stderr or '')
        if 'Rate limit' in out or 'rate_limited' in out:
            print('  rate wall; sleep 120', flush=True)
            time.sleep(120)
            continue
        lines = [l for l in (r.stdout or '').strip().splitlines() if l.strip().startswith(('{', '['))]
        if not lines:
            raise RuntimeError('linearis failed: ' + out[-250:])
        return json.loads(lines[-1])
    raise RuntimeError('rate retries exhausted')


# new milestone(s)
for f in SPECS:
    if not f.get('new_milestone') or ledger.get('ms:' + f['key']):
        continue
    existing = [m.get('name') for m in lin(['milestones', 'list', '--project', f['project']]).get('nodes', [])]
    if f['milestone'] not in existing:
        lin(['milestones', 'create', f['milestone'], '--project', f['project'],
             '-d', ('User-facing outbound Memory sync (the brief\'s un-lock-in promise): master→replica '
                    'push to vendor native memories, per-vendor adapters, conflict policy (OQ3), '
                    'private-memory exclusion. Born from the 2026-07-14 gap-hunt (adversarially verified). '
                    'Dispatch gate: blocked-by the Definition Pack (' + f['pack'] + ').')])
        time.sleep(PAUSE)
    ledger['ms:' + f['key']] = f['milestone']
    save()
    print('MS', f['milestone'], flush=True)

# issues
for f in SPECS:
    k = 'issue:' + f['key']
    if ledger.get(k):
        continue
    body = open(os.path.join(DIR, 'fix-bodies', f['key'] + '.md')).read()
    d = lin(['issues', 'create', f['title'], '--team', 'ENG', '--project', f['project'],
             '--project-milestone', f['milestone'], '--status', 'Todo', '--description', body])
    ident = d.get('identifier')
    if not ident:
        raise RuntimeError('no identifier for ' + f['key'])
    ledger[k] = ident
    print('I', f['key'], '->', ident, flush=True)
    save()
    time.sleep(PAUSE)

# edges + verify
for f in SPECS:
    ident = ledger['issue:' + f['key']]
    k = 'edge:' + f['key']
    if not ledger.get(k):
        lin(['issues', 'update', ident, '--blocked-by', f['pack']])
        ledger[k] = 'ok'
        save()
        time.sleep(PAUSE)
    k = 'verify:' + f['key']
    if not ledger.get(k):
        d = lin(['issues', 'read', ident, '--fields', 'identifier,state.name,project.name,projectMilestone.name'])
        ok = (d.get('project', {}).get('name') == f['project']
              and d.get('projectMilestone', {}).get('name') == f['milestone']
              and d.get('state', {}).get('name') == 'Todo')
        ledger[k] = 'ok' if ok else 'MISMATCH:' + json.dumps(d)[:120]
        print('V', ident, ledger[k], flush=True)
        save()
        time.sleep(PAUSE)

# plan.json appends (keep the breakdown authoritative)
for f in SPECS:
    k = 'plan:' + f['key']
    if ledger.get(k):
        continue
    pp = os.path.join(PS, 'breakdown', f['svc'], 'plan.json')
    plan = json.load(open(pp))
    ms_prefix = f['milestone'].split(' — ')[0]  # e.g. B7
    target = None
    for i, e in enumerate(plan['epics'], 1):
        if f'B{i}' == ms_prefix:
            target = e
            break
    if target is None:  # new area (knowledge B11)
        target = {'id': f'E{len(plan["epics"]) + 1}', 'title': f'[EPIC] {f["svc"]}: ' + f['milestone'].split(' — ', 1)[-1],
                  'body_file': None, 'stories': []}
        plan['epics'].append(target)
    sid = f'{target["id"]}-GAP{sum(1 for s in target["stories"] if "GAP" in s["id"]) + 1}'
    target['stories'].append({'id': sid, 'title': f['title'], 'body_file': f'../gap-hunt/fix-bodies/{f["key"]}.md',
                              'covers': [], 'audit': 'present' if f['kind'] == 'verify-harden' else 'absent',
                              'gap_fix': True, 'linear': ledger['issue:' + f['key']]})
    json.dump(plan, open(pp, 'w'), indent=1)
    ledger[k] = sid
    save()
    print('P', f['key'], '->', sid, flush=True)

print('FIXES COMPLETE:', {f['key']: ledger['issue:' + f['key']] for f in SPECS}, flush=True)
bad = {k: v for k, v in ledger.items() if k.startswith('verify:') and v != 'ok'}
if bad:
    print('MISMATCHES:', bad)
    sys.exit(1)
