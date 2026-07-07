export const meta = {
  name: 'studio-act3-delivery-engine',
  description: 'Act-3 autonomous delivery engine: loop-until-dry over the ready frontier — claim, TDD build (sonnet), adversarial review (opus), deterministic Done gate with DoD ticking, per-repo serialized PR merges — until the backlog is done or caps trip',
  phases: [{ title: 'Engine', detail: 'ticks: frontier -> parallel build/review -> serialized merge/gate -> advance' }],
}

// ---- Constants -------------------------------------------------------------
const SESSION_SCRATCH = '/tmp/claude-1000/-home-daniel-repos-orvex-wiki/423adaa2-fe9d-4bc9-bbb4-1e34a7e6ef98/scratchpad'
const RDIR = SESSION_SCRATCH + '/act3'
const DECISIONS = SESSION_SCRATCH + '/act2a/po-decisions-2026-07-07.md'
const HUB = '/home/daniel/repos/orvex-wiki'
const WORKTREES = '/tmp/worktrees'
const MAX_TICKS = (args && args.maxTicks) || 40
const FIRST_BATCH = 6
const STEADY_BATCH = 12
const BOUNCE_CAP = 3

const PROJECT_REPO = {
  'Orvex Wiki': '/home/daniel/repos/orvex-wiki',
  'Orvex Wiki API': '/home/daniel/repos/orvex-wiki-api',
  'Orvex Studio Contracts': '/home/daniel/repos/orvex-studio-contracts',
  'Orvex Studio Lib': '/home/daniel/repos/orvex-studio-lib',
  'Orvex Studio Identity': '/home/daniel/repos/orvex-studio-identity',
  'Orvex Studio Workflows': '/home/daniel/repos/orvex-workflows',
  'Orvex Studio Billing': '/home/daniel/repos/orvex-studio-billing',
  'Orvex Studio Knowledge': '/home/daniel/repos/orvex-studio-knowledge',
  'Orvex Studio AI': '/home/daniel/repos/orvex-studio-ai',
  'Orvex Studio MCP': '/home/daniel/repos/orvex-studio-mcp',
  'Orvex Studio API': '/home/daniel/repos/orvex-studio-api',
  'Orvex Studio UI': '/home/daniel/repos/orvex-studio-ui',
  'Orvex CLI': '/home/daniel/repos/orvex-cli',
  'Orvex Studio Console': '/home/daniel/repos/orvex-studio-control',
  'Orvex Studio — Delivery Gates': 'CROSS_REPO',
}

// ---- Shared doctrine blocks ------------------------------------------------
const LNR = [
  'Linear via linearis, LIVE reads and writes (list --limit <=50, paginate; blocked-by relations only exist live). Verify every write by live re-read.',
  'issues update --description is a FULL-BODY REPLACE: read full body -> edit -> write whole body back via temp file -> re-read intact. Never blind-write, never blanket-tick.',
  'Never auto-close, never advance status except as your task explicitly says.',
].join('\n')

const DOCTRINE = [
  'BUILD DOCTRINE (binding, from the ratified delivery prompt section 6A.5 + PO decisions ' + DECISIONS + '):',
  '- TDD: RED (failing test first) -> GREEN (minimal real impl) -> refactor. Test through exported interfaces. Mock ONLY true externals (Clerk, Keycloak, Stripe, LiteLLM upstreams, Turbopuffer, GitHub/Linear APIs).',
  '- Zero-mock delivery paths, honest empty states, no fabricated data. No stubs beyond typed NotImplemented-501 where the ticket explicitly says so.',
  '- Go: gofmt -l MUST be clean (run it separately) AND make lint-backend / golangci-lint at the repo CI pin; go test ./... green. TS: tsc -b (never --noEmit); vitest/jest targeted suites green.',
  '- Preserve auth: never relax signature verification (RS256/JWKS, OIDC) or add unsigned-claims shortcuts.',
  '- Slim-AGPL rule (PO Q22): work in the AGPL engine repo (orvex-wiki) stays minimal; anything the ticket allows to live in a satellite lives in the satellite.',
  '- Real tests only: if a test needs unavailable infra/credentials, STOP and report it as an escalation with the exact command + error. Never fake-pass, never silently skip.',
  '- Commit only green, tested increments. Commit trailer (exact): Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
  '- GitOps: NEVER kubectl apply / argocd sync. Infra changes go into the repo deploy/ tree, validated build-only (kubectl kustomize --load-restrictor LoadRestrictionsNone; kubeconform -ignore-missing-schemas).',
].join('\n')

const RETDISC = 'RETURN DISCIPLINE (an oversized return kills the run): return ONLY the schema fields, every string within its cap; long detail goes into your report file under ' + RDIR + '.'

// ---- Schemas ---------------------------------------------------------------
const FRONTIER_SCHEMA = {
  type: 'object', required: ['ready', 'blockedResidue', 'doneTotal'],
  properties: {
    ready: { type: 'array', maxItems: 24, items: { type: 'object', required: ['eng', 'project', 'milestone'], properties: {
      eng: { type: 'string', maxLength: 12 }, title: { type: 'string', maxLength: 90 },
      project: { type: 'string', maxLength: 50 }, milestone: { type: 'string', maxLength: 40 },
      isGate: { type: 'boolean' } } } },
    blockedResidue: { type: 'integer' }, doneTotal: { type: 'integer' }, todoTotal: { type: 'integer' },
    notes: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 200 } },
  },
}
const BUILD_SCHEMA = {
  type: 'object', required: ['eng', 'green', 'blocked'],
  properties: {
    eng: { type: 'string', maxLength: 12 }, green: { type: 'boolean' },
    blocked: { type: 'boolean' },
    branch: { type: 'string', maxLength: 80 }, pr: { type: 'string', maxLength: 120 },
    headline: { type: 'string', maxLength: 250 },
    escalate: { type: 'string', maxLength: 400 },
    notes: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 200 } },
    reportPath: { type: 'string', maxLength: 220 },
  },
}
const REVIEW_SCHEMA = {
  type: 'object', required: ['eng', 'verdict'],
  properties: {
    eng: { type: 'string', maxLength: 12 },
    verdict: { type: 'string', enum: ['PASS', 'FINDINGS', 'ESCALATE'] },
    findings: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 250 } },
    verifiedAcs: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } },
    escalate: { type: 'string', maxLength: 400 }, reportPath: { type: 'string', maxLength: 220 },
  },
}
const GATE_SCHEMA = {
  type: 'object', required: ['eng', 'done'],
  properties: {
    eng: { type: 'string', maxLength: 12 }, done: { type: 'boolean' },
    merged: { type: 'boolean' }, dodTicked: { type: 'integer' },
    headline: { type: 'string', maxLength: 250 }, escalate: { type: 'string', maxLength: 400 },
  },
}
const NOTE_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, detail: { type: 'string', maxLength: 200 } } }

// ---- Per-repo merge lock ---------------------------------------------------
const repoLocks = {}
function withRepoLock(repo, fn) {
  const prev = repoLocks[repo] || Promise.resolve()
  const next = prev.then(fn, fn)
  repoLocks[repo] = next.then(() => undefined, () => undefined)
  return next
}

// ---- State -----------------------------------------------------------------
const escalated = []
const doneThisRun = []
const bounces = {}
let dryTicks = 0
let complete = false
let residueReport = null

// ---- Engine loop -----------------------------------------------------------
for (let tick = 1; tick <= MAX_TICKS; tick++) {
  phase('Tick ' + tick)
  log('Tick ' + tick + ': computing frontier (escalated so far: ' + escalated.length + ', done this run: ' + doneThisRun.length + ')')

  const frontier = await agent([
    'FRONTIER COMPUTATION (read-only + one cache sync). Work from ' + HUB + '.',
    '1. Run _bmad/lnr/tools/linear-sync.sh sync (best effort; live reads are authoritative).',
    '2. LIVE via linearis: list every issue of the Orvex Studio initiative satellites AND the "Orvex Studio — Delivery Gates" project that is in state Todo or Backlog. EXCLUDE: labels stripe-hold and keycloak-parked (PO holds), and these escalated ids: ' + JSON.stringify(escalated.map(e => e.eng)) + '.',
    '3. For each candidate read its blocked-by relations LIVE: ready = every blocker is Done/Canceled/Duplicate (no open blockers). A gate issue (label gate) is ready ONLY when every blocker is Done/Canceled.',
    '4. Order ready by: wave ascending (Wave 0 first), then how many other issues each one blocks (descending). Return at most 24.',
    '5. Also return: doneTotal (initiative-wide Done count), todoTotal (remaining Todo/Backlog incl. held), blockedResidue (candidates excluded ONLY by holds/escalations).',
    RETDISC, LNR,
    'Write the full candidate table to ' + RDIR + '/tick' + tick + '-frontier.md.',
  ].join('\n'), { model: 'sonnet', effort: 'medium', label: 't' + tick + ':frontier', phase: 'Tick ' + tick, schema: FRONTIER_SCHEMA })

  if (!frontier) { log('Frontier agent died — checkpointing'); break }
  if (!frontier.ready || frontier.ready.length === 0) {
    if ((frontier.todoTotal || 0) - (frontier.blockedResidue || 0) <= 0 && (frontier.blockedResidue || 0) === 0) { complete = true }
    residueReport = frontier
    log('Frontier empty (residue: ' + (frontier.blockedResidue || 0) + ') — ending run')
    break
  }

  const batchSize = tick === 1 ? FIRST_BATCH : STEADY_BATCH
  const batch = frontier.ready.slice(0, batchSize)
  log('Tick ' + tick + ': dispatching ' + batch.length + ' issues (' + batch.map(b => b.eng).join(', ') + ')')

  const tickResults = await parallel(batch.map(item => async () => {
    const repo = PROJECT_REPO[item.project] || 'CROSS_REPO'
    const T = 'Tick ' + tick

    // --- build (or gate-verify for gate issues) ---
    const wt = WORKTREES + '/t' + tick + '-' + item.eng.toLowerCase()
    const build = await agent([
      item.isGate
        ? 'GATE ISSUE ' + item.eng + ' (' + (item.title || '') + '): this is a VERIFICATION issue, not a coding task. Read its full body LIVE (linearis). Confirm every blocked-by constituent is Done (live relations). Execute its gate checklist honestly: run the milestone integration/E2E suites its body names, in the repos they belong to (repo map: ' + JSON.stringify(PROJECT_REPO) + '). Record every command + result. green=true ONLY if every named check actually ran and passed; blocked=true ONLY if something unavailable (missing infra/credential) genuinely prevents verification — set escalate to the exact command + error then.'
        : 'BUILD ISSUE ' + item.eng + ' (' + (item.title || '') + ') in repo ' + repo + '.',
      item.isGate ? '' : [
        '1. CLAIM: advance ' + item.eng + ' to In Progress via linearis (explicit; you are the single claimer).',
        '2. Read the issue body LIVE and IN FULL (ACs, dev-context, DoD, named binary DoD test). The body is your spec; cite it as you work.',
        '3. Isolate in a PRIVATE worktree (never shared): cd ' + repo + '; git fetch origin; determine the integration branch (the repo default; orvex-wiki uses dev); mkdir -p ' + WORKTREES + '; git worktree add ' + wt + ' -b ' + item.eng.toLowerCase() + '-work origin/<integration-branch>. Work ONLY inside ' + wt + '. If that path somehow exists, add a numeric suffix — never reuse another agent\'s tree.',
        '4. TDD-build the issue to its ACs. Run the repo CI gates (make ci-local if present, else the targeted equivalents incl. gofmt -l separately for Go).',
        '5. BASELINE-DIFF every gate failure (CRITICAL — do not attribute pre-existing breakage to your change): before treating any gate as red, re-run that SAME gate on a clean checkout of origin/<integration-branch> (git stash or a scratch clone). If it fails IDENTICALLY without your changes, it is PRE-EXISTING repo noise (e.g. make context-check CS-pin drift, lint:boundary parse errors) — record it in notes[], do NOT let it set green=false or blocked=true, and proceed. Only failures your diff actually introduced count against you.',
        '6. Commit green work only (trailer per doctrine). Push the branch (SSH url if HTTPS push is rejected: git push git@github.com:orvexai/<repo-name>.git <branch>). Open a PR to the integration branch via gh (title "' + item.eng + ': <short>", body references Part of ' + item.eng + ' — NEVER a closing keyword — and ends with the generated-with-Claude-Code footer).',
        '7. SEMANTICS (load-bearing — an earlier run wrongly parked green PRs by conflating these): green=true means your work is committed + pushed + PR opened + your own gates pass (pre-existing noise ignored per step 5). blocked=true means you genuinely could NOT finish (missing infra/credential the run cannot self-provide, or the ticket premise assumes code that does not exist in this repo) — set escalate to the exact ask then. A non-blocking observation is NEVER a blocker: put it in notes[], leave blocked=false. If green=true and blocked=false the engine sends you to review — do not put "None"/"non-blocking" text in escalate, leave escalate empty.',
      ].join('\n'),
      DOCTRINE, LNR, RETDISC,
      'Full build log -> ' + RDIR + '/' + item.eng + '-build.md.',
    ].join('\n'), { model: item.isGate ? 'opus' : 'sonnet', effort: item.isGate ? 'high' : 'medium', label: 't' + tick + ':build:' + item.eng, phase: T, schema: BUILD_SCHEMA })

    if (!build) { escalated.push({ eng: item.eng, why: 'build agent died' }); return { eng: item.eng, out: 'agent-died' } }
    if (!build.green || build.blocked) {
      escalated.push({ eng: item.eng, why: (build.escalate || 'build not green').slice(0, 200) })
      await agent([
        'ESCALATION BOOKKEEPING for ' + item.eng + ': add a Linear comment (linearis) stating exactly what blocks it: ' + JSON.stringify(build.escalate || 'build not green') + ' — include the command/error from ' + RDIR + '/' + item.eng + '-build.md if present. If a work branch exists, archive it (git update-ref refs/archive/inflight/' + item.eng.toLowerCase() + ' <sha>) then remove the worktree ' + wt + ' (git worktree remove --force) and delete the local branch only after archiving. Leave status as-is.',
        LNR, RETDISC,
      ].join('\n'), { model: 'sonnet', effort: 'low', label: 't' + tick + ':esc:' + item.eng, phase: T, schema: NOTE_SCHEMA })
      return { eng: item.eng, out: 'escalated' }
    }

    // --- adversarial review + bounded fix loop ---
    let review = null
    bounces[item.eng] = bounces[item.eng] || 0
    for (;;) {
      review = await agent([
        'ADVERSARIAL REVIEW of ' + item.eng + ' (reviewer != implementer — you did NOT write this; try to refute it). Worktree: ' + wt + ' (repo ' + repo + '); PR: ' + (build.pr || 'see build report') + '; build report: ' + RDIR + '/' + item.eng + '-build.md.',
        'RE-RUN everything yourself — never trust the self-report: the named binary DoD test, the repo CI gates at the pinned versions (gofmt -l SEPARATELY for Go; tsc -b for TS), the targeted suites. Check: tests are real and non-tautological (would fail if the impl broke); zero-mock delivery paths + honest states; auth not weakened; no orphan UI (components imported/routed); fixtures real; every AC actually met (list the AC ids you VERIFIED — these drive the DoD ticking, so only list what you truly confirmed); diff scope matches the ticket; slim-AGPL placement respected (Q22).',
        'verdict: PASS (all green, ACs met) | FINDINGS (fixable defects — list them) | ESCALATE (needs a human: missing infra/credential/product call).',
        DOCTRINE, LNR, RETDISC,
        'Full review -> ' + RDIR + '/' + item.eng + '-review' + (bounces[item.eng] + 1) + '.md.',
      ].join('\n'), { model: 'opus', effort: 'high', label: 't' + tick + ':review:' + item.eng, phase: T, schema: REVIEW_SCHEMA })

      if (!review) { escalated.push({ eng: item.eng, why: 'review agent died' }); return { eng: item.eng, out: 'agent-died' } }
      if (review.verdict === 'PASS') break
      if (review.verdict === 'ESCALATE' || bounces[item.eng] >= BOUNCE_CAP - 1) {
        escalated.push({ eng: item.eng, why: (review.escalate || ('review findings unresolved after ' + BOUNCE_CAP + ' rounds')).slice(0, 200) })
        await agent([
          'ESCALATION BOOKKEEPING for ' + item.eng + ' (post-review): comment on the issue via linearis with the blocking findings ' + JSON.stringify((review.findings || []).slice(0, 5)) + ' or the escalation ask ' + JSON.stringify(review.escalate || '') + '. Archive the branch ref (refs/archive/inflight/) and remove the worktree as in the standard escalation step. Leave status In Progress.',
          LNR, RETDISC,
        ].join('\n'), { model: 'sonnet', effort: 'low', label: 't' + tick + ':esc:' + item.eng, phase: T, schema: NOTE_SCHEMA })
        return { eng: item.eng, out: 'escalated' }
      }
      bounces[item.eng]++
      await agent([
        'FIX PASS ' + bounces[item.eng] + '/' + BOUNCE_CAP + ' for ' + item.eng + ' in worktree ' + wt + '. Address EXACTLY these review findings (full detail in ' + RDIR + '/' + item.eng + '-review' + bounces[item.eng] + '.md):',
        JSON.stringify(review.findings || []),
        'TDD discipline; re-run the gates yourself; amend/append commits (green only) and update the PR.', DOCTRINE, RETDISC,
        'Fix log -> ' + RDIR + '/' + item.eng + '-fix' + bounces[item.eng] + '.md.',
      ].join('\n'), { model: 'sonnet', effort: 'medium', label: 't' + tick + ':fix:' + item.eng, phase: T, schema: NOTE_SCHEMA })
    }

    // --- deterministic Done gate + merge (serialized per repo) ---
    const gate = await withRepoLock(repo, () => agent([
      'DETERMINISTIC DONE GATE for ' + item.eng + ' (repo ' + repo + '; review PASS on record: ' + (review.reportPath || '') + '; verified ACs: ' + JSON.stringify(review.verifiedAcs || []) + ').',
      item.isGate
        ? 'Gate ISSUE: no PR to merge. Steps: (a) confirm live that every blocked-by constituent is Done; (b) tick the DoD boxes for the checks the review VERIFIED (full-body read -> flip only those "- [ ]" -> temp-file write -> re-read intact); (c) advance ' + item.eng + ' to Done via linearis (explicit).'
        : [
          'Steps IN ORDER — abort (done=false + escalate) if any hard step fails:',
          '(a) Merge the PR via gh (respect branch protection; if checks are pending, wait up to 10 minutes polling gh pr checks; if a conflict: rebase the branch once, re-push, retry merge once).',
          '(b) Tick the DoD checkboxes on ' + item.eng + ' ONLY for the ACs the review verified (' + JSON.stringify(review.verifiedAcs || []) + '): full-body read -> flip exactly those boxes -> temp-file write -> re-read to confirm body intact + boxes ticked. NEVER blanket-tick.',
          '(c) Advance ' + item.eng + ' to Done via linearis (explicit — the gate is: build green AND review PASS AND PR merged AND boxes ticked).',
          '(d) Cleanup (eager, mandatory): git worktree remove ' + wt + '; git branch -d (merge-checked, NEVER -D) the local branch; delete the remote branch via gh/git push --delete.',
        ].join('\n'),
      LNR, RETDISC,
      'Gate log -> ' + RDIR + '/' + item.eng + '-gate.md.',
    ].join('\n'), { model: 'sonnet', effort: 'medium', label: 't' + tick + ':gate:' + item.eng, phase: T, schema: GATE_SCHEMA }))

    if (gate && gate.done) {
      doneThisRun.push(item.eng)
      if (item.isGate) {
        log('MILESTONE COMPLETE: ' + item.milestone + ' (gate ' + item.eng + ' Done)')
        await agent([
          'Milestone notification: use ToolSearch (query select:PushNotification) to load the PushNotification tool if this environment exposes it, then send: "Orvex Studio: milestone ' + item.milestone + ' COMPLETE (gate ' + item.eng + ' Done; ' + (doneThisRun.length) + ' issues delivered this run)". If the tool is unavailable, return ok=true with detail noting it was skipped.',
          RETDISC,
        ].join('\n'), { model: 'sonnet', effort: 'low', label: 't' + tick + ':notify:' + item.milestone, phase: T, schema: NOTE_SCHEMA })
      }
      return { eng: item.eng, out: 'done' }
    }
    escalated.push({ eng: item.eng, why: ((gate && gate.escalate) || 'done-gate failed').slice(0, 200) })
    return { eng: item.eng, out: 'gate-failed' }
  }))

  const advanced = (tickResults || []).filter(Boolean).filter(r => r.out === 'done').length
  log('Tick ' + tick + ' result: ' + advanced + ' Done, ' + ((tickResults || []).filter(Boolean).filter(r => r.out !== 'done').length) + ' not advanced')
  if (advanced === 0) { dryTicks++ } else { dryTicks = 0 }
  if (dryTicks >= 2) { log('No-progress cap tripped (2 dry ticks) — checkpointing for orchestrator review'); break }
}

return {
  complete: complete,
  delivered: doneThisRun,
  deliveredCount: doneThisRun.length,
  escalated: escalated,
  residue: residueReport,
  reportDir: RDIR,
}
