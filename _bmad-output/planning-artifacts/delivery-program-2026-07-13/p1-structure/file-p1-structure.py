#!/usr/bin/env python3
"""Phase-1 Definition Factory Linear structuring — resumable, paced, ledger-driven.

Stages (idempotent via ledger):
  A. list+create the per-service 'P1 — Definition Factory' milestone on each of the
     16 service projects (skip when it already exists);
  B. create the 20 issues (bodies from issue-bodies/<key>.md) in their projects under
     the milestone, status Todo; capture identifiers into the ledger;
  C. re-read each created issue to verify project+milestone+state stuck (hygiene rule);
  D. wire the 36 blocked-by edges (symbolic keys resolved via the ledger);
  E. post the decomposition comment on ENG-2037.

Rate discipline: 1.5s between writes; on rate-limit, sleep 120s and retry the same op
(max 20 walls); ledger survives restarts. Run: python3 file-p1-structure.py
"""
import json, os, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(DIR, 'ledger.json')
SPECS = json.load(open(os.path.join(DIR, 'specs.json')))
UNITS = {u['key']: u for u in SPECS['units']}
MS = 'P1 — Definition Factory'
TARGET = '2026-07-27'
PAUSE = 1.5

ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}
STAGES = os.environ.get('P1_STAGES', 'ABCDE')


def save():
    json.dump(ledger, open(LEDGER, 'w'), indent=1)


def lin(args, retries=20):
    """Run linearis, return parsed JSON or raise. Sleeps through rate-limit walls."""
    for _ in range(retries):
        r = subprocess.run(['linearis'] + args + ['--compact'], capture_output=True, text=True)
        out = (r.stdout or '') + (r.stderr or '')
        if 'Rate limit exceeded' in out or 'rate_limited' in out or 'requests are allowed per' in out:
            print('  rate-limit wall; sleeping 120s', flush=True)
            time.sleep(120)
            continue
        lines = [l for l in (r.stdout or '').strip().splitlines() if l.strip().startswith(('{', '['))]
        if not lines:
            raise RuntimeError('linearis failed: ' + out[-300:])
        return json.loads(lines[-1])
    raise RuntimeError('rate-limit retries exhausted')


MS_DESC = ('Phase 1 of the Delivery Program (canon 5eFdxN3edd; prompt yXUWpQpRjx): this '
           "service's Definition Pack — PRD-delta + frozen TAGGED contract + test plan + "
           'Service Done Definition + per-agent build prompt, adversarially pack-reviewed '
           '(reviewer ≠ author). The contract TAG is the Phase-2 dispatch gate.')

# ---- Stage A: per-service milestones -------------------------------------------------
service_projects = sorted({u['project'] for u in SPECS['units']
                           if u['project'] != SPECS['shared']['hub_project']})
for proj in (service_projects if 'A' in STAGES else []):
    k = 'msA:' + proj
    if ledger.get(k):
        continue
    existing = lin(['milestones', 'list', '--project', proj])
    names = [m.get('name') for m in existing.get('nodes', [])]
    if MS in names:
        ledger[k] = 'pre-existing'
        print(f'A {proj}: milestone pre-existing', flush=True)
    else:
        lin(['milestones', 'create', MS, '--project', proj,
             '--target-date', TARGET, '-d', MS_DESC])
        ledger[k] = 'created'
        print(f'A {proj}: milestone created', flush=True)
        time.sleep(PAUSE)
    save()

# ---- Stage B: issues ------------------------------------------------------------------
ORDER = ['pack-contracts', 'pack-lib', 'bridge-proof', 'pack-staging', 'pack-workgraph',
         'wave2-gate', 'pack-ai', 'pack-api', 'pack-knowledge', 'pack-billing',
         'pack-identity', 'pack-mcp', 'pack-wiki', 'pack-wiki-api', 'pack-cli',
         'pack-console', 'pack-workflows', 'wave3-gate', 'pack-ui', 'wave4-gate']
for key in (ORDER if 'B' in STAGES else []):
    k = 'issue:' + key
    if ledger.get(k):
        continue
    u = UNITS[key]
    body = open(os.path.join(DIR, 'issue-bodies', key + '.md')).read()
    d = lin(['issues', 'create', u['title'], '--team', 'ENG',
             '--project', u['project'], '--project-milestone', MS,
             '--status', 'Todo', '--description', body])
    ident = d.get('identifier') or d.get('issue', {}).get('identifier')
    if not ident:
        raise RuntimeError(f'no identifier in create receipt for {key}: {str(d)[:200]}')
    ledger[k] = ident
    print(f'B {key} -> {ident}', flush=True)
    save()
    time.sleep(PAUSE)

# ---- Stage C: verify by re-read --------------------------------------------------------
for key in (ORDER if 'C' in STAGES else []):
    k = 'verify:' + key
    if ledger.get(k):
        continue
    ident = ledger['issue:' + key]
    d = lin(['issues', 'read', ident, '--fields',
             'identifier,state.name,project.name,projectMilestone.name'])
    ok = (d.get('project', {}).get('name') == UNITS[key]['project']
          and d.get('projectMilestone', {}).get('name') == MS
          and d.get('state', {}).get('name') == 'Todo')
    ledger[k] = 'ok' if ok else 'MISMATCH:' + json.dumps(d)[:150]
    print(f'C {ident} {ledger[k]}', flush=True)
    save()
    time.sleep(PAUSE)

# ---- Stage D: blocked-by edges ---------------------------------------------------------
def ident_of(ref):
    return ref if ref.startswith('ENG-') else ledger['issue:' + ref]

EDGES = [
    ('bridge-proof', 'pack-contracts'), ('bridge-proof', 'pack-lib'),
    ('ENG-2037', 'pack-contracts'), ('ENG-2037', 'pack-lib'), ('ENG-2037', 'bridge-proof'),
    ('pack-staging', 'ENG-2037'), ('pack-workgraph', 'ENG-2037'),
    ('wave2-gate', 'ENG-2037'), ('wave2-gate', 'pack-staging'), ('wave2-gate', 'pack-workgraph'),
] + [(p, 'wave2-gate') for p in ['pack-ai', 'pack-api', 'pack-knowledge', 'pack-billing',
                                 'pack-identity', 'pack-mcp', 'pack-wiki', 'pack-wiki-api',
                                 'pack-cli', 'pack-console', 'pack-workflows']] \
  + [('wave3-gate', 'wave2-gate')] \
  + [('wave3-gate', p) for p in ['pack-ai', 'pack-api', 'pack-knowledge', 'pack-billing',
                                 'pack-identity', 'pack-mcp', 'pack-wiki', 'pack-wiki-api',
                                 'pack-cli', 'pack-console', 'pack-workflows']] \
  + [('pack-ui', 'wave3-gate'), ('wave4-gate', 'wave3-gate'), ('wave4-gate', 'pack-ui')]

for blocked, blocker in (EDGES if 'D' in STAGES else []):
    k = f'edge:{blocked}<-{blocker}'
    if ledger.get(k):
        continue
    lin(['issues', 'update', ident_of(blocked), '--blocked-by', ident_of(blocker)])
    ledger[k] = 'ok'
    print(f'D {k}', flush=True)
    save()
    time.sleep(PAUSE)

# ---- Stage E: decomposition comment on ENG-2037 ----------------------------------------
if 'E' in STAGES and not ledger.get('comment:ENG-2037'):
    ids = {key: ledger['issue:' + key] for key in ORDER}
    body = (
        'Phase-1 structure filed (orchestrator judgment under PO standing authority, '
        '2026-07-14): the Definition Factory now has a per-service tracking issue per the '
        'program plan (5eFdxN3edd "Tracking structure") + per-service P1 milestones. '
        'This issue is recast as the **Wave-1 gate**: it is now blocked-by the decomposed '
        f"Wave-1 packs {ids['pack-contracts']} (contracts), {ids['pack-lib']} (lib) and the "
        f"bridge proof {ids['bridge-proof']} — its DoD boxes tick from their gates. "
        f"Wave gates downstream: {ids['wave2-gate']} (W2: staging+workgraph) → "
        f"{ids['wave3-gate']} (W3: 11 delta-packs) → {ids['wave4-gate']} (W4: UI + Phase-1 exit). "
        'Full map: _bmad-output/planning-artifacts/delivery-program-2026-07-13/p1-structure/ '
        '(orvex-wiki repo). Milestone creation was done via linearis (it now supports '
        'milestones create — the "needs Linear MCP" note in yXUWpQpRjx §5 is stale).'
    )
    lin(['issues', 'discuss', 'ENG-2037', '--body', body])
    ledger['comment:ENG-2037'] = 'ok'
    save()
    print('E comment posted on ENG-2037', flush=True)

bad = {k: v for k, v in ledger.items() if k.startswith('verify:') and v != 'ok'}
print('COMPLETE. issues:', {k[6:]: v for k, v in ledger.items() if k.startswith('issue:')}, flush=True)
if bad:
    print('VERIFY MISMATCHES:', bad, flush=True)
    sys.exit(1)
