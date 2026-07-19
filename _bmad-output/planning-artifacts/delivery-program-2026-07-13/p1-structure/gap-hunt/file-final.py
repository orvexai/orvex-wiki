#!/usr/bin/env python3
"""File the final POC + matrix gap tickets (22). Ledger-driven (ledger-final.json), paced.
Resolves milestones (creates NEW ones if named), files under milestone, wires blocked_by,
verifies by re-read."""
import json, os, re, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
FIN = os.path.join(DIR, 'final')
LEDGER = os.path.join(DIR, 'ledger-final.json')
PAUSE = 1.5
ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}

items = []
for mf in ['poc-manifest.json', 'mx-manifest.json']:
    for m in json.load(open(os.path.join(FIN, mf))):
        items.append(m)


def save():
    json.dump(ledger, open(LEDGER, 'w'), indent=1)


def lin(args, retries=20):
    for _ in range(retries):
        r = subprocess.run(['linearis'] + args + ['--compact'], capture_output=True, text=True)
        out = (r.stdout or '') + (r.stderr or '')
        if 'Rate limit' in out or 'rate_limited' in out:
            print('  rate wall; sleep 120', flush=True); time.sleep(120); continue
        lines = [l for l in (r.stdout or '').strip().splitlines() if l.strip().startswith(('{', '['))]
        if not lines:
            raise RuntimeError('linearis failed: ' + out[-250:])
        return json.loads(lines[-1])
    raise RuntimeError('rate retries exhausted')


def resolve_ms(project, ms):
    # strip a leading "NEW — "/"NEW: " marker; the name after it is the milestone name
    name = re.sub(r'^\s*NEW\s*[—:-]\s*', '', ms or '').strip()
    if not name:
        raise RuntimeError(f'empty milestone for {project}')
    return name


# milestones (create if missing)
listed = {}
for m in items:
    proj = m['project']
    name = resolve_ms(proj, m['milestone'])
    m['_ms'] = name
    k = f'ms:{proj}:{name}'
    if ledger.get(k):
        continue
    if proj not in listed:
        listed[proj] = [x.get('name') for x in lin(['milestones', 'list', '--project', proj]).get('nodes', [])]
    if name not in listed[proj]:
        lin(['milestones', 'create', name, '--project', proj,
             '-d', 'Milestone opened by the POC + traceability-matrix completeness sweep (2026-07-15). Stories dispatch-gated on the service Definition Pack.'])
        listed[proj].append(name)
        time.sleep(PAUSE)
    ledger[k] = 'ok'
    save()
    print('MS', proj, '/', name, flush=True)

# issues
for m in items:
    key = f'issue:{m["file"]}'
    if ledger.get(key):
        continue
    body = open(os.path.join(FIN, m['file'])).read()
    d = lin(['issues', 'create', m['title'][:255], '--team', 'ENG', '--project', m['project'],
             '--project-milestone', m['_ms'], '--status', 'Todo', '--description', body])
    ident = d.get('identifier')
    if not ident:
        raise RuntimeError('no identifier: ' + key)
    ledger[key] = ident
    m['_id'] = ident
    print('I', ident, m['title'][:75], flush=True)
    save()
    time.sleep(PAUSE)

# edges + verify
for m in items:
    ident = m.get('_id') or ledger[f'issue:{m["file"]}']
    for blk in (m.get('blocked_by') or []):
        k = f'edge:{ident}<-{blk}'
        if ledger.get(k):
            continue
        lin(['issues', 'update', ident, '--blocked-by', blk])
        ledger[k] = 'ok'
        save()
        time.sleep(PAUSE)
    k = f'verify:{ident}'
    if not ledger.get(k):
        d = lin(['issues', 'read', ident, '--fields', 'identifier,state.name,project.name,projectMilestone.name'])
        ok = (d.get('project', {}).get('name') == m['project']
              and (d.get('projectMilestone') or {}).get('name') == m['_ms']
              and d.get('state', {}).get('name') == 'Todo')
        ledger[k] = 'ok' if ok else 'MISMATCH:' + json.dumps(d)[:120]
        print('V', ident, ledger[k], flush=True)
        save()
        time.sleep(PAUSE)

ids = sorted((v for k, v in ledger.items() if k.startswith('issue:')), key=lambda x: int(x.split('-')[1]))
print('FINAL FILED:', len(ids), 'issues', ids[0], '..', ids[-1], flush=True)
bad = {k: v for k, v in ledger.items() if k.startswith('verify:') and v != 'ok'}
if bad:
    print('MISMATCHES:', bad)
    sys.exit(1)
