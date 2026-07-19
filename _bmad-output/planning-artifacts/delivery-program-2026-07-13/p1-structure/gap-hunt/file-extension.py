#!/usr/bin/env python3
"""File the browser-extension story corpus: per-area build milestones on the
'Orvex Studio Extension' project + stories (Todo) + blocked-by ENG-2690 edges,
verified by re-read. Ledger: ledger-extension.json. Paced."""
import json, os, re, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
PS = os.path.dirname(DIR)
BR = os.path.join(PS, 'breakdown', 'extension')
LEDGER = os.path.join(DIR, 'ledger-extension.json')
PROJECT = 'Orvex Studio Extension'
PACK = 'ENG-2690'
PAUSE = 1.5

plan = json.load(open(os.path.join(BR, 'plan.json')))
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


def ms_name(idx, title):
    t = re.sub(r'^\[EPIC\]\s*[\w-]+\s*:\s*', '', title).strip()
    name = f'B{idx} — {t}'
    if len(name) <= 78:
        return name
    stripped = re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()
    return stripped if len(stripped) <= 78 else stripped[:75].rstrip() + '…'


listed = None
for i, e in enumerate(plan['epics'], 1):
    k = f'ms:{e["id"]}'
    if ledger.get(k):
        continue
    name = ms_name(i, e['title'])
    if listed is None:
        listed = [m.get('name') for m in lin(['milestones', 'list', '--project', PROJECT]).get('nodes', [])]
    if name not in listed:
        body = open(os.path.join(BR, e['body_file'])).read()
        narrative = body.split('## 8')[0].strip()[:900]
        covers = sorted({c for s in e['stories'] for c in s.get('covers', [])})
        desc = (narrative + f"\n\nCovers: {', '.join(covers[:30])}"
                + f"\n\nDispatch gate: stories blocked-by the Definition Pack ({PACK}); mechanism per the ENG-2689 spike verdict.")
        lin(['milestones', 'create', name, '--project', PROJECT, '-d', desc])
        time.sleep(PAUSE)
    ledger[k] = name
    save()
    print('MS', name, flush=True)

for e in plan['epics']:
    ms = ledger[f'ms:{e["id"]}']
    for s in e['stories']:
        k = f'story:{s["id"]}'
        if ledger.get(k):
            continue
        body = open(os.path.join(BR, s['body_file'])).read()
        d = lin(['issues', 'create', s['title'], '--team', 'ENG', '--project', PROJECT,
                 '--project-milestone', ms, '--status', 'Todo', '--description', body])
        ident = d.get('identifier')
        if not ident:
            raise RuntimeError('no identifier for ' + s['id'])
        ledger[k] = ident
        print('I', s['id'], '->', ident, flush=True)
        save()
        time.sleep(PAUSE)

for e in plan['epics']:
    for s in e['stories']:
        ident = ledger[f'story:{s["id"]}']
        k = f'edge:{s["id"]}'
        if not ledger.get(k):
            lin(['issues', 'update', ident, '--blocked-by', PACK])
            ledger[k] = 'ok'
            save()
            time.sleep(PAUSE)
        k = f'verify:{s["id"]}'
        if not ledger.get(k):
            d = lin(['issues', 'read', ident, '--fields', 'identifier,state.name,project.name,projectMilestone.name'])
            ok = (d.get('project', {}).get('name') == PROJECT and d.get('state', {}).get('name') == 'Todo'
                  and (d.get('projectMilestone') or {}).get('name') == ledger[f'ms:{e["id"]}'])
            ledger[k] = 'ok' if ok else 'MISMATCH:' + json.dumps(d)[:120]
            print('V', ident, ledger[k], flush=True)
            save()
            time.sleep(PAUSE)

ids = sorted((v for k, v in ledger.items() if k.startswith('story:')), key=lambda x: int(x.split('-')[1]))
print('EXTENSION COMPLETE:', len(ids), 'stories', ids[0], '..', ids[-1], flush=True)
bad = {k: v for k, v in ledger.items() if k.startswith('verify:') and v != 'ok'}
if bad:
    print('MISMATCHES:', bad)
    sys.exit(1)
