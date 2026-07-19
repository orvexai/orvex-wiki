#!/usr/bin/env python3
"""File the ext-canon-sweep tickets (25 after cross-unit dedup). Ledger-driven
(ledger-ext-sweep.json), paced. Creates 4 NEW milestones, files issues under their
milestones, wires blocked_by edges, verifies by re-read."""
import json, os, re, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
ES = os.path.join(DIR, 'ext-sweep')
LEDGER = os.path.join(DIR, 'ledger-ext-sweep.json')
PAUSE = 1.5
ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}

LEXT = json.load(open(os.path.join(DIR, 'ledger-extension.json')))
LCORP = json.load(open(os.path.join(DIR, '..', 'ledger-corpus.json')))

# cross-unit dedup: (unit, index-within-surviving) keys to DROP
DROP = {('memory-loop', 'api-1a'), ('memory-loop', 'api-3'), ('verdict', 'selector'), ('prd', 'bc8')}

NEW_MS = {
    ('Orvex Studio Extension', 'B7'): ('B7 — Memory-enrichment retrieval & Orvex backend wiring',
        'Wire the delivery path to real Orvex enrichment (knowledge/ai via the api seam) — the leg that makes delivered prompts Memory-enriched. Born from the ratified extension canon sweep (FR-TS2). Dispatch gate: ENG-2690.'),
    ('Orvex Studio API', 'B10'): ('B10 — Cross-AI delivery seam (extension server counterparty)',
        'The server half of the extension delivery seam per Architecture ViWUZj1MrW §8: Shape 1a compose-validation + outcome-report (reserve-then-spend delivery token) and Shape 3 canary-telemetry ingest. Born from the ratified extension canon sweep. Dispatch gates: ENG-2098 + the extension contract landing.'),
    ('Orvex Studio Contracts', 'B8'): ('B8 — Extension delivery seam contract landing',
        'Land the authored Delivery-Seam contract (mcRYD29C6o): openapi/extension-delivery.yaml (NEW), identity.yaml mintDeliveryToken op, extension/*.schema.json, 8 additive errorCodes, golden fixtures. Authoring is done in the wiki; this milestone lands it in the repo. Tag stays Wave-1-gated (ENG-2091/2037).'),
    ('Orvex Studio AI', 'B10'): ('B10 — Connected-assistant posture registry',
        'Server-truth registry of third-party assistant training/retention posture — the backend the ui AI-privacy setup (ENG-2697) consumes. Born from the cross-AI memory-loop audit. Dispatch gate: ENG-2097.'),
}


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


def drop_key(unit, g):
    t = (g.get('proposed_issue') or {}).get('title', '') + g.get('requirement', '')
    if unit == 'memory-loop' and 'Shape 1a' in t: return ('memory-loop', 'api-1a')
    if unit == 'memory-loop' and ('Shape 3' in t or 'canary' in t.lower()): return ('memory-loop', 'api-3')
    if unit == 'verdict' and ('selector' in t.lower() and 'Remote' in t): return ('verdict', 'selector')
    if unit == 'prd' and 'BC8' in g.get('requirement', ''): return ('prd', 'bc8')
    return None


def resolve_ms(project, ms_text):
    m = re.search(r'B(\d+)', ms_text or '')
    if not m:
        for (proj, _b), (name, _d) in NEW_MS.items():
            if proj == project:
                return name, True
        raise RuntimeError(f'no B-index in milestone {ms_text!r}')
    bidx = f'B{m.group(1)}'
    if (project, bidx) in NEW_MS:
        return NEW_MS[(project, bidx)][0], True
    if project == 'Orvex Studio Extension':
        name = LEXT.get(f'ms:E{m.group(1)}')
    elif project == 'Orvex Studio Identity':
        name = LCORP.get(f'ms:identity:E{m.group(1)}')
    else:
        name = None
    if not name:
        raise RuntimeError(f'unmapped milestone {project} {ms_text!r}')
    return name, False


STALE = '— status DRAFT, pending human doc-ratify per CS §12;'
FIXED = '— status canonical (ratified 2026-07-15; the page’s in-body masthead still reads DRAFT — stale text, flagged);'

units = ['addendum', 'architecture', 'contract-spec', 'memory-loop', 'prd', 'prior-art', 'verdict']
todo = []
for u in units:
    d = json.load(open(os.path.join(ES, u + '.json')))
    for g in d.get('gaps', []):
        if (g.get('verdict') or '').upper().startswith('REFUT'):
            continue
        if drop_key(u, g):
            continue
        pi = g.get('proposed_issue') or {}
        if not pi.get('title') or not pi.get('body_md'):
            print('SKIP (no proposal):', u, g.get('requirement', '')[:60])
            continue
        todo.append((u, g, pi))
print(len(todo), 'tickets to file', flush=True)

# milestones
created_ms = set()
for u, g, pi in todo:
    proj = pi['project']
    name, is_new = resolve_ms(proj, pi.get('milestone', ''))
    pi['_ms'] = name
    if is_new and (proj, name) not in created_ms and not ledger.get(f'ms:{proj}:{name}'):
        existing = [m.get('name') for m in lin(['milestones', 'list', '--project', proj]).get('nodes', [])]
        if name not in existing:
            desc = [v[1] for k, v in NEW_MS.items() if v[0] == name][0]
            lin(['milestones', 'create', name, '--project', proj, '-d', desc])
            time.sleep(PAUSE)
        ledger[f'ms:{proj}:{name}'] = 'ok'
        save()
        print('MS', proj, '/', name, flush=True)
    created_ms.add((proj, name))

# issues
for u, g, pi in todo:
    key = f'issue:{u}:{pi["title"][:70]}'
    if ledger.get(key):
        continue
    body = pi['body_md'].replace(STALE, FIXED)
    d = lin(['issues', 'create', pi['title'][:255], '--team', 'ENG', '--project', pi['project'],
             '--project-milestone', pi['_ms'], '--status', 'Todo', '--description', body])
    ident = d.get('identifier')
    if not ident:
        raise RuntimeError('no identifier: ' + key)
    ledger[key] = ident
    pi['_id'] = ident
    print('I', ident, pi['title'][:80], flush=True)
    save()
    time.sleep(PAUSE)

# edges + verify
for u, g, pi in todo:
    ident = pi.get('_id') or ledger.get(f'issue:{u}:{pi["title"][:70]}')
    for blk in pi.get('blocked_by', []):
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
        ok = (d.get('project', {}).get('name') == pi['project']
              and (d.get('projectMilestone') or {}).get('name') == pi['_ms']
              and d.get('state', {}).get('name') == 'Todo')
        ledger[k] = 'ok' if ok else 'MISMATCH:' + json.dumps(d)[:120]
        print('V', ident, ledger[k], flush=True)
        save()
        time.sleep(PAUSE)

ids = sorted((v for k, v in ledger.items() if k.startswith('issue:')), key=lambda x: int(x.split('-')[1]))
print('EXT-SWEEP FILED:', len(ids), 'issues', ids[0], '..', ids[-1], flush=True)
bad = {k: v for k, v in ledger.items() if k.startswith('verify:') and v != 'ok'}
if bad:
    print('MISMATCHES:', bad)
    sys.exit(1)
