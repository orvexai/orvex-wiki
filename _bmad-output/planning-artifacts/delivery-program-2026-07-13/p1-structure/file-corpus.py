#!/usr/bin/env python3
"""File the story corpus — Linear model: PROJECTS + MILESTONES (no epic issues; PO ruling
2026-07-14). Each service project gets per-feature-area build milestones (from the
decomposition's areas, ordered B1..Bn); stories are plain issues under those milestones;
the E2E tail is hub milestones. Resumable, paced, ledger-driven (ledger-corpus.json).

Stages (env P1_STAGES subset of FGHIJK, default all):
  F  hub E2E-tail milestones ('P2 — Isolated Builds' gate + 'P2.5 — Product Acceptance E2E')
  G  per-service feature-area build milestones (desc = epic narrative)
  H  stories as issues under their feature milestone, status Todo
  I  blocked-by edges: story <- the service's Definition Pack issue (contract-tag dispatch gate)
  J  P2.5 hub umbrella issue + edge <- ENG-2110
  K  count verification
"""
import json, os, re, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
BR = os.path.join(DIR, 'breakdown')
LEDGER = os.path.join(DIR, 'ledger-corpus.json')
PAUSE = 1.2
STAGES = os.environ.get('P1_STAGES', 'FGHIJK')

SVC = {  # key -> (project, pack ENG id)
    'contracts': ('Orvex Studio Contracts', 'ENG-2091'),
    'lib': ('Orvex Studio Lib', 'ENG-2092'),
    'staging': ('Orvex Studio Staging', 'ENG-2094'),
    'workgraph': ('Orvex Studio Workgraph', 'ENG-2095'),
    'ai': ('Orvex Studio AI', 'ENG-2097'),
    'api': ('Orvex Studio API', 'ENG-2098'),
    'knowledge': ('Orvex Studio Knowledge', 'ENG-2099'),
    'billing': ('Orvex Studio Billing', 'ENG-2100'),
    'identity': ('Orvex Studio Identity', 'ENG-2101'),
    'mcp': ('Orvex Studio MCP', 'ENG-2102'),
    'wiki': ('Orvex Wiki', 'ENG-2103'),
    'wiki-api': ('Orvex Wiki API', 'ENG-2104'),
    'cli': ('Orvex CLI', 'ENG-2105'),
    'console': ('Orvex Studio Console', 'ENG-2106'),
    'workflows': ('Orvex Studio Workflows', 'ENG-2107'),
    'ui': ('Orvex Studio UI', 'ENG-2109'),
}
HUB = 'Orvex Studio — Delivery Gates'
MS_P2_HUB = 'P2 — Isolated Builds'
MS_P25 = 'P2.5 — Product Acceptance E2E'

ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}


def save():
    json.dump(ledger, open(LEDGER, 'w'), indent=1)


def lin(args, retries=30):
    for _ in range(retries):
        r = subprocess.run(['linearis'] + args + ['--compact'], capture_output=True, text=True)
        out = (r.stdout or '') + (r.stderr or '')
        if 'Rate limit exceeded' in out or 'rate_limited' in out or 'requests are allowed per' in out:
            print('  rate-limit wall; sleeping 180s', flush=True)
            time.sleep(180)
            continue
        lines = [l for l in (r.stdout or '').strip().splitlines() if l.strip().startswith(('{', '['))]
        if not lines:
            raise RuntimeError('linearis failed: ' + out[-300:])
        return json.loads(lines[-1])
    raise RuntimeError('rate-limit retries exhausted')


def area_ms_name(key, idx, epic_title):
    # "[EPIC] ai: Model routing & cost doctrine" -> "B1 — Model routing & cost doctrine"
    # Linear caps milestone names (~80 chars) — clip smartly, keeping B<idx> unique.
    t = re.sub(r'^\[EPIC\]\s*[\w-]+\s*:\s*', '', epic_title).strip()
    name = f'B{idx} — {t}'
    if len(name) <= 78:
        return name
    stripped = re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()
    if len(stripped) <= 78:
        return stripped
    for sep in [' — ', ' & ', ', ', ' ']:
        cut = stripped[:75].rsplit(sep, 1)[0].strip(' ,&—-')
        if 20 < len(cut) <= 75:
            return cut + '…'
    return stripped[:75].rstrip() + '…'


plans = {}
for key in SVC:
    p = os.path.join(BR, key, 'plan.json')
    if os.path.exists(p):
        plans[key] = json.load(open(p))
    else:
        print(f'WARN: no plan for {key}; skipping', flush=True)

# ---- F: hub E2E-tail milestones ---------------------------------------------------------
if 'F' in STAGES:
    for name, tgt, desc in [
        (MS_P2_HUB, '2026-08-24', 'Phase 2 hub gate: all 16 services report their per-area build milestones complete; continuous family-E2E (ENG-2034) live and green; a red run demonstrably freezes merges.'),
        (MS_P25, '2026-09-08', 'Phase 2.5 (prompt ErYdXzIj6g): whole-platform product acceptance — every surface (api/mcp/cli/ai/rag/knowledge-sync + UI) passes a real product-acceptance run on a fresh tenant with real data, reproduced not reported, prod modules ON. The E2E tail before the M11/M13/M14 closing gates.'),
    ]:
        k = f'msF:{HUB}:{name}'
        if ledger.get(k):
            continue
        existing = lin(['milestones', 'list', '--project', HUB])
        if name in [m.get('name') for m in existing.get('nodes', [])]:
            ledger[k] = 'pre-existing'
        else:
            lin(['milestones', 'create', name, '--project', HUB, '--target-date', tgt, '-d', desc])
            ledger[k] = 'created'
            time.sleep(PAUSE)
        print(f'F {HUB} / {name}: {ledger[k]}', flush=True)
        save()

# ---- G: per-service feature-area build milestones ---------------------------------------
if 'G' in STAGES:
    for key, plan in plans.items():
        proj, pack = SVC[key]
        listed = None
        for i, e in enumerate(plan['epics'], 1):
            name = area_ms_name(key, i, e['title'])
            k = f'ms:{key}:{e["id"]}'
            if ledger.get(k):
                continue
            if listed is None:
                listed = [m.get('name') for m in lin(['milestones', 'list', '--project', proj]).get('nodes', [])]
            if name in listed:
                ledger[k] = name
                print(f'G {k}: pre-existing', flush=True)
                save()
                continue
            body = open(os.path.join(BR, key, e['body_file'])).read()
            narrative = body.split('## 8')[0].strip()
            covers = sorted({c for s in e['stories'] for c in s.get('covers', [])})
            desc = (narrative[:900] + ('…' if len(narrative) > 900 else '')
                    + f"\n\nCovers: {', '.join(covers[:40])}"
                    + f"\n\nDispatch gate: stories are blocked-by the Definition Pack ({pack}); the contract TAG authorizes the build. Done = every story gate-Done, built + tested in isolation (crew-slot proven).")
            lin(['milestones', 'create', name, '--project', proj, '-d', desc])
            ledger[k] = name
            print(f'G {k} -> {name}', flush=True)
            save()
            time.sleep(PAUSE)

# ---- H: stories under their feature milestone -------------------------------------------
if 'H' in STAGES:
    for key, plan in plans.items():
        proj, _pack = SVC[key]
        for e in plan['epics']:
            ms = ledger.get(f'ms:{key}:{e["id"]}')
            for s in e['stories']:
                k = f'story:{key}:{s["id"]}'
                if ledger.get(k):
                    continue
                body = open(os.path.join(BR, key, s['body_file'])).read()
                args = ['issues', 'create', s['title'], '--team', 'ENG', '--project', proj,
                        '--status', 'Todo', '--description', body]
                if ms:
                    args += ['--project-milestone', ms]
                d = lin(args)
                ident = d.get('identifier') or d.get('issue', {}).get('identifier')
                if not ident:
                    raise RuntimeError(f'no identifier for {k}: {str(d)[:200]}')
                ledger[k] = ident
                print(f'H {k} -> {ident}', flush=True)
                save()
                time.sleep(PAUSE)

# ---- I: blocked-by edges (story <- pack) -------------------------------------------------
if 'I' in STAGES:
    for key, plan in plans.items():
        _proj, pack = SVC[key]
        for e in plan['epics']:
            for s in e['stories']:
                ident = ledger.get(f'story:{key}:{s["id"]}')
                k = f'edge:story:{key}:{s["id"]}<-{pack}'
                if not ident or ledger.get(k):
                    continue
                lin(['issues', 'update', ident, '--blocked-by', pack])
                ledger[k] = 'ok'
                print(f'I {k}', flush=True)
                save()
                time.sleep(PAUSE)

# ---- J: P2.5 hub umbrella ----------------------------------------------------------------
if 'J' in STAGES and not ledger.get('issue:p25-umbrella'):
    body = (
        '## 1. 🎯 Gate\n\nAs the PO I want a whole-platform product-acceptance run so that "delivered" '
        'means the entire Studio platform works as envisioned — every surface, real data, fresh tenant, '
        'reproduced not reported. This is the E2E tail after every service\'s isolated build milestones '
        'complete. [Plan 5eFdxN3edd §Verification; prompt ErYdXzIj6g]\n\n**Definition of Done — binary gate:**\n\n'
        '- [ ] Every surface — api / mcp / cli / ai / rag / knowledge-sync + the UI — passes a real '
        'product-acceptance run on a fresh tenant with real data, human-observed — '
        '*machine check: the acceptance transcript per surface is attached as comments; zero surfaces reported-not-reproduced*\n'
        '- [ ] Continuous family-E2E (ENG-2034) green nightly on the dev cell; a red run demonstrably '
        'freezes merges (ratchet tested once deliberately) — *machine check: the deliberate-red freeze event is logged*\n'
        '- [ ] Prod runs with orvex modules ON (CLOUD multi-tenant) — *machine check: prod env shows '
        'ORVEX_MODULES_ENABLED=true + CLOUD=true and the six-surface prod walk passes*\n'
        '- [ ] UI surfaces pass the "looks good AND works" bar incl. human delight-check — '
        '*machine check: Playwright + axe + visual sweep + dual-theme green per surface; delight-check recorded*\n\n'
        '## 8. 🔗 Dependencies\n\n- **Milestone:** P2.5 — Product Acceptance E2E (hub). '
        '**Blocked by:** ENG-2110 (Phase-1 exit gate). Dispatches only when every service\'s '
        'build milestones report complete. Relates to: ENG-2034 (family-E2E cadence), '
        'ENG-1571 (M11), ENG-1549 (M13), ENG-1578 (M14 closing).\n\n'
        '## 9. 📡 Protocol\n\nCLAIM→PLAN→PROGRESS→COMMITS ("Part of ENG-NNN", never closes)→HANDOFF→'
        'REVIEW (reviewer ≠ implementer)→TICK (only genuinely verified)→DONE (orchestrator-only)→ESCALATE.'
    )
    d = lin(['issues', 'create',
             '[E2E] P2.5 Product Acceptance — whole-platform run on a fresh tenant (every surface, real data)',
             '--team', 'ENG', '--project', HUB, '--project-milestone', MS_P25,
             '--status', 'Todo', '--description', body])
    ident = d.get('identifier') or d.get('issue', {}).get('identifier')
    ledger['issue:p25-umbrella'] = ident
    save()
    print(f'J p25-umbrella -> {ident}', flush=True)
    time.sleep(PAUSE)
    lin(['issues', 'update', ident, '--blocked-by', 'ENG-2110'])
    ledger['edge:p25<-ENG-2110'] = 'ok'
    save()

# ---- K: verify counts --------------------------------------------------------------------
if 'K' in STAGES:
    exp_ms = sum(len(p['epics']) for p in plans.values())
    exp_s = sum(len(e['stories']) for p in plans.values() for e in p['epics'])
    got_ms = len([k for k in ledger if k.startswith('ms:')])
    got_s = len([k for k in ledger if k.startswith('story:')])
    print(f'K expected areas={exp_ms} stories={exp_s} · filed milestones={got_ms} stories={got_s}', flush=True)
    ids = sorted((v for k, v in ledger.items() if k.startswith('story:')),
                 key=lambda x: int(x.split('-')[1]))
    print(f'K id range: {ids[0]}..{ids[-1]}' if ids else 'K none', flush=True)
    if got_ms != exp_ms or got_s != exp_s:
        print('K MISMATCH', flush=True)
        sys.exit(1)

print('CORPUS COMPLETE', flush=True)
