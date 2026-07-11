export const meta = {
  name: 'studio-act3-delivery-engine',
  description: 'Act-3 autonomous delivery engine: rolling-saturation over the ready frontier — claim, TDD build (sonnet), adversarial review (opus), deterministic Done gate with DoD ticking, per-repo serialized PR merges — until the backlog is done or caps trip',
  phases: [
    { title: 'Startup reclaim', detail: 'un-strand stale In-Progress/In-Review claims' },
    { title: 'Frontier', detail: 'bulk cache sync + local readiness (cheap, repeatable)' },
    { title: 'Deliver', detail: 'rolling dispatch: refill each slot the moment it frees — no tick barrier' },
  ],
}

// v11: Done-gate boxes-clean refusal (prompt instructions + a code-side guard that never
// honors a finalize agent's done=true self-report unless dodClean=true, §ENG-1479 fake-done)
// + gate-dispatch pre-check routes a closing gate whose named DoD harness does not yet
// exist to an AUTHORING build instead of an endless verify-only bounce (§ENG-1579/ENG-1581).
// v11.1 (2026-07-12): anti-auto-close guard (P1_GUARD / marker "P1-guard"). Linear's GitHub
// integration auto-flips a linked ticket to Done seconds after its branch/PR merges (branch-
// name identifier linking, UI-only toggle; confirmed victims ENG-1405/ENG-1395, precedent
// ENG-1375, pattern P1). Prompt-contract text now runs immediately after any merge/branch-PR
// step in the build + gate stages: re-read live status, and if it flipped to Done without the
// engine's own Done-gate making that transition, revert to In Progress ("reverting Linear
// GitHub auto-close (pattern P1); Done is gate-owned") and continue the normal cycle.

// ---- Constants -------------------------------------------------------------
const SESSION_SCRATCH = '/tmp/claude-1000/-home-daniel-repos-orvex-wiki/77ba52f2-3d57-4198-8c37-ac219579b139/scratchpad'
const RDIR = SESSION_SCRATCH + '/act3'
const HUB = '/home/daniel/repos/orvex-wiki'
const DECISIONS = HUB + '/tools/act3/po-decisions-2026-07-07.md'
const WORKTREES = '/tmp/worktrees'
const MAX_SYNCS = (args && args.maxTicks) || 120         // cap on frontier re-syncs (was maxTicks; a sync is ~5 API calls + one sonnet agent — far cheaper than an old tick)
const TARGET_INFLIGHT = 16   // per-workflow agent cap is min(16, cores-2); refill to this the moment a slot frees (rolling — no tick barrier)
const REFRESH_EVERY = 3      // recompute the frontier after this many completions even if the queue is non-empty (newly-Done issues unblock successors; the recompute is LOCAL — zero API — so cadence is cheap)
const BOUNCE_CAP = 3
const CAPACITY_FLOOR = 15  // §3.31: never let the box idle — if ready work is narrower than this, fill the spare slots with useful non-claiming pre-work.
// PARTITION (scale-out to the PO-ratified 32-agent ceiling, §3.28): two engines run
// concurrently with DISJOINT project sets — each issue lives in exactly one project and
// each repo in exactly one partition, so claims can never collide and per-repo merge
// serialization holds across engines (this static partition is the claim arbiter the
// Q7/PD-6 ruling requires; the main session stays the single orchestrator).
// args.partitionProjects: array of project names this engine OWNS. Absent ⇒ whole initiative.
const PARTITION = (args && args.partitionProjects) || null
const PART_TAG = (args && args.partitionName) || 'solo'
const GATE_MS = ['M0','M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12','M13','M14']

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

// The initiative is a SUBSET of team ENG (which has 24 projects / ~448 issues —
// Houston, Claude-Code-MCP, linear-sync, OPS-POC (On Hold), archived spaces, etc.).
// linear-sync.sh is now config-driven (_bmad/lnr/config.yaml: linear_initiative =
// "Orvex Studio"): `sync-initiative` resolves its own member-project scope from that
// config with ZERO args needed — PROJECT_REPO above is exactly that initiative's
// member set. Scope is fully config-driven; there is no project-allowlist flag.

// ---- Shared doctrine blocks ------------------------------------------------
const LNR = [
  'CACHE-FIRST Linear model (PO directive 2026-07-09: sync all tickets once; read ONLY from cache; after any write, re-sync JUST that ticket — we are the sole writer, so refresh-on-write keeps the cache authoritative): ALL state/graph reads come from ' + HUB + '/.cache/linear/initiative.json and ticket bodies+comments from ' + HUB + '/.cache/linear/issues/<ENG-N>.yaml.',
  'Live linearis calls are permitted ONLY for: (a) WRITES; (b) the single-ticket refresh AFTER your writes — run: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue <ENG-N> — which is ALSO your write-verification (confirm the refreshed cache file shows your change; it updates initiative.json state under a lock so both engines see it); (c) ONE full-body read immediately before a full-body replace (see below). NEVER bulk-list, never live-read for state, never re-read what the cache already holds.',
  'issues update --description is a FULL-BODY REPLACE: live-read the full body IMMEDIATELY before (clobber safety) -> edit -> write the whole body back via temp file -> refresh the ticket cache (linear-sync.sh issue <ENG-N>) and confirm intact. Never blind-write, never blanket-tick.',
  'On rate_limited (should now be rare — usage is writes-only): your WRITE payload goes to a file under ' + RDIR + ' with the exact command, report it as escalate (transient-quota), never spin retrying.',
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

// §DoD-refusal (grounded in ENG-1479 fake-done: status flipped to Done while the DoD gate
// line + 4 ACs + 10 tasks sat unticked). A checkbox is REQUIRED unless it carries a DATED
// moved/deferred/sanctioned-TBD annotation (e.g. "moved to ENG-N (YYYY-MM-DD)", "deferred —
// sanctioned TBD (YYYY-MM-DD)") — that exception, and only that exception, does not block.
const BOXES_CLEAN = 'BOXES-CLEAN CHECK (binding, refuse-Done gate): re-inspect the body you just wrote. If the DoD gate line OR any AC checkbox is still "- [ ]" without a dated moved/deferred/sanctioned-TBD annotation, you MUST NOT advance to Done — set done=false, dodClean=false, list the unticked boxes in uncheckedBoxes[], comment on the issue naming them, and STOP before the status-flip step. Only flip to Done (and report dodClean=true) once every required box is ticked.'

// P1-guard (anti-auto-close, pattern P1 in the fake-done-forensics ledger). Linear's GitHub
// integration auto-flips a linked ticket to Done seconds after its branch/PR merges — via
// branch-name identifier linking (e.g. eng-1405-work) on a UI-only toggle we cannot disable
// here. Confirmed victims ENG-1405/ENG-1395; precedent ENG-1375. Done in this engine is
// GATE-OWNED: only the deterministic Done gate's boxes-clean-gated status-flip may set Done.
// Any Done we did not make ourselves is the integration's auto-close and must be reverted.
const P1_GUARD = 'P1-guard (anti-auto-close, pattern P1 — Linear\'s GitHub integration auto-flips a linked ticket to Done seconds after its branch/PR merges via branch-name identifier linking, e.g. eng-<n>-work; UI-only toggle; confirmed victims ENG-1405/ENG-1395, precedent ENG-1375): immediately after ANY merge (and after opening/pushing the identifier-named branch/PR) re-read this ticket\'s LIVE status — linearis issues read ' + '<ENG-N>' + ' then refresh cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue <ENG-N>. If the status is now Done and THIS engine\'s Done-gate did NOT perform that transition (in the build/review/fix stages the gate has NOT run yet, so ANY Done here is the auto-close; in the gate stage a Done appearing BEFORE your own boxes-clean-gated (c) status-flip is the auto-close), revert it to In Progress via linearis with the one-line comment "reverting Linear GitHub auto-close (pattern P1); Done is gate-owned", refresh the ticket cache again, and CONTINUE the normal cycle — the legitimate Done happens only later at the gate\'s boxes-clean-gated flip. Never leave an engine-unauthored Done standing.'

// ---- Schemas ---------------------------------------------------------------
const FRONTIER_SCHEMA = {
  type: 'object', required: ['ready', 'blockedResidue', 'doneTotal', 'readComplete'],
  properties: {
    readComplete: { type: 'boolean' },
    ready: { type: 'array', maxItems: 32, items: { type: 'object', required: ['eng', 'project', 'milestone'], properties: {
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
  type: 'object', required: ['eng', 'done', 'dodClean'],
  properties: {
    eng: { type: 'string', maxLength: 12 }, done: { type: 'boolean' }, dodClean: { type: 'boolean' },
    merged: { type: 'boolean' }, dodTicked: { type: 'integer' },
    uncheckedBoxes: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 80 } },
    headline: { type: 'string', maxLength: 250 }, escalate: { type: 'string', maxLength: 400 },
  },
}
const NOTE_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, detail: { type: 'string', maxLength: 200 } } }
const HARNESS_SCHEMA = {
  type: 'object', required: ['eng', 'exists'],
  properties: {
    eng: { type: 'string', maxLength: 12 }, exists: { type: 'boolean' },
    testName: { type: 'string', maxLength: 120 }, repo: { type: 'string', maxLength: 80 },
  },
}

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
let complete = false
let residueReport = null

// ---- Capacity-fill (§3.31) -------------------------------------------------
// When the ready frontier is narrower than CAPACITY_FLOOR, fill the spare slots
// with useful NON-CLAIMING pre-work so the box never idles. These never build,
// claim, or merge — comment-only analysis — so they can't race the delivery lane.
function makeTopup(m, i) {
  return agent([
    'CAPACITY-FILL pre-work for milestone ' + m + ' (the delivery frontier is narrow right now, so use this spare slot usefully). NON-CLAIMING, comment-only: NEVER claim/build/merge/change status — the delivery lane owns that.',
    'QUOTA-LIGHT: use the cached ' + HUB + '/.cache/linear/initiative.json to pick the ' + m + ' closing gate + sample issues; read AT MOST 2 issue bodies live (linearis) — the gate + one Done sample.',
    'Do a readiness + spec-drift pre-analysis: if any AC has drifted from current repo reality (route/package/test-name changes) or a Cancelled issue is still wired as a gate blocker (§3.24), post ONE corrective dev-context comment. Then re-verify ONE already-Done issue in ' + m + ' is not fake-done (§3.27: the named DoD test exists + impl present + any UI wired into the running app + real not-synthetic fixtures) and comment if suspect. If nothing needs fixing, no-op.',
    RETDISC,
  ].join('\n'), { model: 'sonnet', effort: 'low', label: 'fill' + i + ':' + m, phase: 'Deliver', schema: NOTE_SCHEMA }).then(() => ({ out: 'topup' }))
}

// ---- Startup reclaim (§3.20c / §3.31) --------------------------------------
// A prior engine death can leave issues stranded In Progress (claimed, no live
// agent) — invisible to the Todo/Backlog frontier and silently clogging capacity
// (this is what narrowed the fleet to ~2). On launch, un-strand them so the box
// never sits behind stale claims.
phase('Startup reclaim')
await agent([
  'STARTUP RECLAIM (single claimer; the engine just launched, so any In-Progress issue is a STALE claim from a dead prior run — nothing this run claimed yet). Work from ' + HUB + '. Launch nonce: ' + ((args && args.nonce) || 'none') + ' (ignore; it only prevents stale cache replay).',
  '1. If ' + HUB + '/.cache/linear/.last-initiative-sync is < 10 minutes old AND initiative.json has .complete==true, SKIP the bulk sync (the launcher already synced — cache-first). Otherwise run: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh sync-initiative (ONE bulk fetch; config-driven scope from _bmad/lnr/config.yaml linear_initiative — no allowlist arg needed; no per-issue reads).',
  '2. Read ' + HUB + '/.cache/linear/initiative.json and list every issue with state "In Progress" OR "In Review"' + (PARTITION ? ' whose project is one of ' + JSON.stringify(PARTITION) + ' (a sibling engine reclaims the rest)' : '') + ' (jq over .issues). For each, check gh for an open PR in its repo (repo map: ' + JSON.stringify(PROJECT_REPO) + ').',
  '3. Reset EVERY such stranded issue to Todo via linearis so the frontier re-picks it (In Progress AND In Review issues are invisible to the Todo/Backlog frontier — leaving them strands the work; a prior run leaked done-but-unmerged work exactly this way). After EACH reset (and after any comment you post), refresh that ticket: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue <ENG-N> — the frontier reads only the cache, so an unrefreshed reset stays invisible.',
  '4. For issues that HAVE an open PR with substantive work: BEFORE resetting, post a comment "Prior work exists: PR <url> (<branch>)' + '" plus, if a review verdict/report is already on the issue, "review PASS on record — just merge + gate" — the instruction is FINISH it (rebase onto the integration branch, complete remaining ACs on top); do NOT rebuild from scratch. Archive dangling branch refs for no-PR issues; remove stale worktrees.',
  'Return ok + a one-line reset count (with-PR vs no-PR). ' + RETDISC,
].join('\n'), { model: 'sonnet', effort: 'medium', label: 'startup-reclaim', phase: 'Startup reclaim', schema: NOTE_SCHEMA })

// ---- One-time quota gate -----------------------------------------------------
phase('Frontier')
// §quota-gate: never launch into a drained Linear window — wait it out in ONE cheap
// agent instead of burning build slots. Runs ONCE at startup; mid-run rate-limiting
// surfaces through the frontier's honesty gate instead.
const qg = await agent([
  'LINEAR QUOTA GATE (startup, engine ' + PART_TAG + '). Work from ' + HUB + '. Probe the shared 2500/hr Linear quota with ONE cheap call USING THE LINEARIS CLI ONLY: linearis issues read ENG-1594. NEVER use the Linear MCP tools for this — they authenticate via a separate OAuth token that is currently expired, and an MCP auth error is NOT a quota signal (a prior run false-checkpointed on exactly that).',
  'If the linearis read succeeds: return ok=true immediately.',
  'If linearis returns rate_limited: WAIT IT OUT here — sleep in 120-300s chunks (bash sleep works in your shell), re-probing with linearis after each chunk, up to 65 minutes total. Return ok=true once a probe succeeds; ok=false only if STILL rate-limited after 65 minutes, or if linearis itself has an auth failure (say which in detail).',
  RETDISC,
].join('\n'), { model: 'sonnet', effort: 'low', label: 'quota-gate:' + PART_TAG, phase: 'Frontier', schema: NOTE_SCHEMA })
if (!qg || !qg.ok) {
  log('Linear quota still exhausted after 65 min — checkpointing, NOT complete')
  return { complete: false, delivered: [], deliveredCount: 0, escalated: [], residue: null, reportDir: RDIR, stopReason: 'quota-exhausted', partition: PART_TAG }
}

// ---- Frontier sync (cheap + repeatable: ~5 API calls, local readiness) -------
async function syncFrontier(n) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const frontier = await agent([
      'FRONTIER COMPUTATION — LOCAL-ONLY by default (cache-first model: every engine write refreshes its own ticket in the cache, so the cache IS current; the frontier normally makes ZERO API calls). Work from ' + HUB + '. Attempt ' + attempt + ' of 3.',
      '1. Check the cache: ' + HUB + '/.cache/linear/initiative.json must exist with .complete==true, and ' + HUB + '/.cache/linear/.last-initiative-sync must be < 45 minutes old (external-drift bound: humans/integrations occasionally touch Linear outside the engines).',
      '2. ONLY IF that check fails: run: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh sync-initiative (ONE bulk fetch, ~5 API calls, config-driven scope — the ONLY sanctioned bulk path). Otherwise make NO API call whatsoever.',
      '3. Read ' + HUB + '/.cache/linear/initiative.json (local file — jq, no API). Its shape: {complete:bool, counts:{total,byState:{<state>:n}}, issues:{"ENG-N":{state,project,milestone,labels:[],updatedAt,blockedBy:[ids],blocks:[ids]}}}. NOTE: per-issue .state values are refresh-on-write current; the top-level counts are as-of the last BULK sync, so compute doneTotal/todoTotal by COUNTING .issues states yourself, never from .counts.',
      '4. HONESTY GATE (load-bearing — a prior run declared the backlog delivered off a rate-limited read of zeros): if you had to bulk-sync and it exited non-zero, OR .complete is false, OR your counted Done total == 0 → set readComplete=false and RETURN immediately (do NOT fabricate, do NOT compute a frontier off a partial cache). Otherwise readComplete=true.',
      '5. Candidates (jq over .issues): state == "Todo" or "Backlog", EXCLUDING any issue whose labels intersect {stripe-hold, keycloak-parked, deferred-future}, the id ENG-1594, and these escalated ids: ' + JSON.stringify(escalated.map(e => e.eng)) + '.' + (PARTITION ? ' PARTITION: this engine owns ONLY these projects (a sibling engine owns the rest — returning an issue outside them would DOUBLE-CLAIM): project MUST be one of ' + JSON.stringify(PARTITION) + '.' : ''),
      '6. READY (from the cached graph — the blockedBy edges ARE the real Linear "blocks" relations; ignore prose "blocked-by" in bodies): a candidate is ready iff EVERY id in its blockedBy has, in .issues, a state of Done/Canceled/Duplicate (a blocker id absent from the scoped cache counts as NOT satisfied → not ready). Blockers are judged across the WHOLE initiative cache regardless of partition. Gate issues (label contains "gate", or project "Orvex Studio — Delivery Gates") use the same rule.',
      '7. Order ready by: wave ascending (label Wave A/B/C, else the M-number label), then by |blocks| descending (how many others it blocks). Return at most 32. project + milestone come straight from the cache.',
      '8. Counts (ALL counted from .issues states, never from the stale .counts block): doneTotal = issues with state Done across the whole initiative (sanity signal); todoTotal = count of ALL Todo+Backlog within THIS ENGINE\'S scope (the partition if set, else the whole initiative), incl. held; blockedResidue = count of those that are NOT ready (held/escalated/open blocker) = todoTotal minus the ready-eligible count.',
      '9. No live per-issue reads are needed or allowed here. The ONLY permitted API path is the conditional sync-initiative in step 2. If it reports rate-limiting, treat as readComplete=false per step 4.',
      RETDISC,
      'Write the full candidate table (eng, project, milestone, wave, |blocks|, blockedBy states) to ' + RDIR + '/frontier-' + PART_TAG + '-' + n + '.md.',
    ].join('\n'), { model: 'sonnet', effort: 'medium', label: 'f' + n + ':' + PART_TAG + ':a' + attempt, phase: 'Frontier', schema: FRONTIER_SCHEMA })
    if (frontier && frontier.readComplete && (frontier.doneTotal || 0) > 0) return frontier
    log('Frontier sync ' + n + ' [' + PART_TAG + ']: incomplete/degenerate (attempt ' + attempt + ') — retrying')
  }
  return null
}

// ---- Delivery chain: one issue end-to-end (build -> review -> gate) ----------
async function deliverItem(item, seq) {
    const repo = PROJECT_REPO[item.project] || 'CROSS_REPO'
    const T = 'Deliver'

    // --- pre-dispatch gate-harness existence check (§gate-authoring): a closing gate whose
    // named DoD test does not exist yet must be AUTHORED, not verified — dispatching a
    // verifier at it just greps, finds nothing, correctly refuses to self-advance, and
    // bounces forever (ENG-1579/ENG-1581 both looped on exactly this). Zero Linear calls.
    let gateAuthoring = false
    if (item.isGate) {
      const harness = await agent([
        'PRE-DISPATCH GATE-HARNESS CHECK for ' + item.eng + ' (' + (item.title || '') + '). Zero Linear calls — read ONLY the cache: ' + HUB + '/.cache/linear/issues/' + item.eng + '.yaml. Extract the named binary DoD test(s) its gate checklist requires and the target repo (dev-context §4 is authoritative over the project map ' + JSON.stringify(PROJECT_REPO) + ').',
        'grep for EACH named test across the target repo (git grep -n "<TestName>" over the repo working tree/default branch; fetch + a throwaway checkout of the integration branch if none is local). exists=true ONLY if ALL named tests are found somewhere in the repo; exists=false if even one is genuinely absent.',
        RETDISC,
      ].join('\n'), { model: 'sonnet', effort: 'low', label: '#' + seq + ':harness:' + item.eng, phase: T, schema: HARNESS_SCHEMA })
      gateAuthoring = !!(harness && harness.exists === false)
    }

    // --- build (verify for gate issues with an existing harness; author for gates without
    // one; plain build otherwise) ---
    const wt = WORKTREES + '/' + PART_TAG + '-d' + seq + '-' + item.eng.toLowerCase()
    const build = await agent([
      item.isGate && !gateAuthoring
        ? 'GATE ISSUE ' + item.eng + ' (' + (item.title || '') + '): this is a VERIFICATION issue, not a coding task. Read its full body from the CACHE file ' + HUB + '/.cache/linear/issues/' + item.eng + '.yaml (cache-first — no live read). Confirm every blockedBy constituent is Done/Canceled/Duplicate from ' + HUB + '/.cache/linear/initiative.json (refresh-on-write current). Execute its gate checklist honestly: run the milestone integration/E2E suites its body names, in the repos they belong to (repo map: ' + JSON.stringify(PROJECT_REPO) + '). Record every command + result. green=true ONLY if every named check actually ran and passed; blocked=true ONLY if something unavailable (missing infra/credential) genuinely prevents verification — set escalate to the exact command + error then.'
        : item.isGate
        ? 'GATE ISSUE ' + item.eng + ' (' + (item.title || '') + '): AUTHORING build — the pre-dispatch check found its named DoD harness ABSENT from the repo, so this closes as a coding task, not a verification pass (an unauthored gate must never bounce a verifier). Write the missing gate harness EXACTLY as the ticket names it (test file + test names) plus the minimal real implementation to make it pass; apply any spec-drift correction comments already posted instead of re-deriving from a body section they supersede.'
        : 'BUILD ISSUE ' + item.eng + ' (' + (item.title || '') + ') in repo ' + repo + '.',
      (item.isGate && !gateAuthoring) ? '' : [
        '1. CLAIM: advance ' + item.eng + ' to In Progress via linearis (explicit; you are the single claimer), then refresh its cache: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue ' + item.eng + ' — confirm the refreshed YAML shows In Progress (this is the write-verify) and note it now also carries the full comment thread.',
        '1b. REPO OVERRIDE: if the issue dev-context §4 names a DIFFERENT target repo than the project map gave ("' + repo + '"), USE THE DEV-CONTEXT REPO (it is authoritative — e.g. platform tickets live in orvex-omk). If the map gave CROSS_REPO, resolve the real repo from the dev-context and proceed; only escalate if the dev-context truly names no repo.',
      '2. Read the issue body + comments IN FULL from the CACHE file ' + HUB + '/.cache/linear/issues/' + item.eng + '.yaml (fresh as of your claim refresh — includes any "Prior work exists: PR..." finish-not-rebuild note; honor it). The cached body is your spec; cite it as you work. Do NOT live-read the issue.',
        '3. Isolate in a PRIVATE worktree (never shared): cd ' + repo + '; git fetch origin; determine the integration branch (the repo default; orvex-wiki uses dev); mkdir -p ' + WORKTREES + '; git worktree add ' + wt + ' -b ' + item.eng.toLowerCase() + '-work origin/<integration-branch>. Work ONLY inside ' + wt + '. If that path somehow exists, add a numeric suffix — never reuse another agent\'s tree.',
        '4. TDD-build the issue to its ACs' + (item.isGate ? ' (here: the named gate harness + its minimal impl)' : '') + '. Run the repo CI gates (make ci-local if present, else the targeted equivalents incl. gofmt -l separately for Go).',
        '5. BASELINE-DIFF every gate failure (CRITICAL — do not attribute pre-existing breakage to your change): before treating any gate as red, re-run that SAME gate on a clean checkout of origin/<integration-branch> (git stash or a scratch clone). If it fails IDENTICALLY without your changes, it is PRE-EXISTING repo noise (e.g. make context-check CS-pin drift, lint:boundary parse errors) — record it in notes[], do NOT let it set green=false or blocked=true, and proceed. Only failures your diff actually introduced count against you.',
        '6. Commit green work only (trailer per doctrine). Push the branch (SSH url if HTTPS push is rejected: git push git@github.com:orvexai/<repo-name>.git <branch>). Open a PR to the integration branch via gh (title "' + item.eng + ': <short>", body references Part of ' + item.eng + ' — NEVER a closing keyword — and ends with the generated-with-Claude-Code footer).',
        '7. SEMANTICS (load-bearing — an earlier run wrongly parked green PRs by conflating these): green=true means your work is committed + pushed + PR opened + your own gates pass (pre-existing noise ignored per step 5)' + (item.isGate ? ' AND the named gate test(s) now exist and pass' : '') + '. blocked=true means you genuinely could NOT finish (missing infra/credential the run cannot self-provide, or the ticket premise assumes code that does not exist in this repo) — set escalate to the exact ask then. A non-blocking observation is NEVER a blocker: put it in notes[], leave blocked=false. If green=true and blocked=false the engine sends you to review — do not put "None"/"non-blocking" text in escalate, leave escalate empty.',
        '8. ' + P1_GUARD.replace(/<ENG-N>/g, item.eng),
      ].join('\n'),
      DOCTRINE, LNR, RETDISC,
      'Full build log -> ' + RDIR + '/' + item.eng + '-build.md.',
    ].join('\n'), { model: (item.isGate && !gateAuthoring) ? 'opus' : 'sonnet', effort: (item.isGate && !gateAuthoring) ? 'high' : 'medium', label: '#' + seq + ':build:' + item.eng, phase: T, schema: BUILD_SCHEMA })

    if (!build) { escalated.push({ eng: item.eng, why: 'build agent died' }); return { eng: item.eng, out: 'agent-died' } }
    if (!build.green || build.blocked) {
      escalated.push({ eng: item.eng, why: (build.escalate || 'build not green').slice(0, 200) })
      await agent([
        'ESCALATION BOOKKEEPING for ' + item.eng + ': add a Linear comment (linearis) stating exactly what blocks it: ' + JSON.stringify(build.escalate || 'build not green') + ' — include the command/error from ' + RDIR + '/' + item.eng + '-build.md if present, then refresh the ticket cache (cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue ' + item.eng + '). If a work branch exists, archive it (git update-ref refs/archive/inflight/' + item.eng.toLowerCase() + ' <sha>) then remove the worktree ' + wt + ' (git worktree remove --force) and delete the local branch only after archiving. Leave status as-is.',
        LNR, RETDISC,
      ].join('\n'), { model: 'sonnet', effort: 'low', label: '#' + seq + ':esc:' + item.eng, phase: T, schema: NOTE_SCHEMA })
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
      ].join('\n'), { model: 'opus', effort: 'high', label: '#' + seq + ':review:' + item.eng, phase: T, schema: REVIEW_SCHEMA })

      if (!review) { escalated.push({ eng: item.eng, why: 'review agent died' }); return { eng: item.eng, out: 'agent-died' } }
      if (review.verdict === 'PASS') break
      if (review.verdict === 'ESCALATE' || bounces[item.eng] >= BOUNCE_CAP - 1) {
        escalated.push({ eng: item.eng, why: (review.escalate || ('review findings unresolved after ' + BOUNCE_CAP + ' rounds')).slice(0, 200) })
        await agent([
          'ESCALATION BOOKKEEPING for ' + item.eng + ' (post-review): comment on the issue via linearis with the blocking findings ' + JSON.stringify((review.findings || []).slice(0, 5)) + ' or the escalation ask ' + JSON.stringify(review.escalate || '') + ', then refresh the ticket cache (cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue ' + item.eng + '). Archive the branch ref (refs/archive/inflight/) and remove the worktree as in the standard escalation step. Leave status In Progress.',
          LNR, RETDISC,
        ].join('\n'), { model: 'sonnet', effort: 'low', label: '#' + seq + ':esc:' + item.eng, phase: T, schema: NOTE_SCHEMA })
        return { eng: item.eng, out: 'escalated' }
      }
      bounces[item.eng]++
      await agent([
        'FIX PASS ' + bounces[item.eng] + '/' + BOUNCE_CAP + ' for ' + item.eng + ' in worktree ' + wt + '. Address EXACTLY these review findings (full detail in ' + RDIR + '/' + item.eng + '-review' + bounces[item.eng] + '.md):',
        JSON.stringify(review.findings || []),
        'TDD discipline; re-run the gates yourself; amend/append commits (green only) and update the PR.', DOCTRINE, RETDISC,
        'Fix log -> ' + RDIR + '/' + item.eng + '-fix' + bounces[item.eng] + '.md.',
      ].join('\n'), { model: 'sonnet', effort: 'medium', label: '#' + seq + ':fix:' + item.eng, phase: T, schema: NOTE_SCHEMA })
    }

    // --- deterministic Done gate + merge (serialized per repo) ---
    const gate = await withRepoLock(repo, () => agent([
      'DETERMINISTIC DONE GATE for ' + item.eng + ' (repo ' + repo + '; review PASS on record: ' + (review.reportPath || '') + '; verified ACs: ' + JSON.stringify(review.verifiedAcs || []) + ').',
      (item.isGate && !gateAuthoring)
        ? 'Gate ISSUE: no PR to merge. Steps: (a) confirm from ' + HUB + '/.cache/linear/initiative.json that every blockedBy constituent is Done/Canceled/Duplicate (cache-first; refresh-on-write keeps it current); (b) tick the DoD boxes for the checks the review VERIFIED (LIVE full-body read immediately before the replace — clobber safety — -> flip only those "- [ ]" -> temp-file write); (b2) ' + BOXES_CLEAN + ' (c) advance ' + item.eng + ' to Done via linearis (explicit) ONLY if the boxes-clean check passed; (d) refresh the ticket cache ONCE: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue ' + item.eng + ' — confirm the refreshed YAML shows Done + the ticked boxes (this is the write-verify AND what unblocks successors in both engines\' frontiers).'
        : [
          'Steps IN ORDER — abort (done=false + escalate) if any hard step fails:',
          '(a) Merge the PR via gh (respect branch protection; if checks are pending, wait up to 10 minutes polling gh pr checks; if a conflict: rebase the branch once, re-push, retry merge once).',
          '(a2) ' + P1_GUARD.replace(/<ENG-N>/g, item.eng),
          '(b) Tick the DoD checkboxes on ' + item.eng + ' ONLY for the ACs the review verified (' + JSON.stringify(review.verifiedAcs || []) + '): LIVE full-body read immediately before the replace (clobber safety — the ONLY sanctioned pre-write live read) -> flip exactly those boxes -> temp-file write. NEVER blanket-tick.',
          '(b2) ' + BOXES_CLEAN,
          '(c) Advance ' + item.eng + ' to Done via linearis (explicit — the gate is: build green AND review PASS AND PR merged AND boxes ticked AND boxes-clean check passed).',
          '(d) Refresh the ticket cache ONCE: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue ' + item.eng + ' — confirm the refreshed YAML shows Done + intact body + ticked boxes (write-verify; also what unblocks successors in both engines\' frontiers with zero API).',
          '(e) Cleanup (eager, mandatory): git worktree remove ' + wt + '; git branch -d (merge-checked, NEVER -D) the local branch; delete the remote branch via gh/git push --delete.',
        ].join('\n'),
      LNR, RETDISC,
      'Gate log -> ' + RDIR + '/' + item.eng + '-gate.md.',
    ].join('\n'), { model: 'sonnet', effort: 'medium', label: '#' + seq + ':gate:' + item.eng, phase: T, schema: GATE_SCHEMA }))

    if (gate && gate.done && gate.dodClean !== true) {
      // Code-side Done-gate guard (§ENG-1479 fake-done): never honor a finalize agent's
      // done=true self-report when its OWN full-body read (dodClean) does not confirm every
      // required DoD/AC box is ticked — refuse the transition regardless of the claim.
      escalated.push({ eng: item.eng, why: ('Done-gate guard: dodClean!=true despite done=true — refusing (' + JSON.stringify((gate.uncheckedBoxes || []).slice(0, 5)) + ' ' + (gate.escalate || '')).slice(0, 190) + ')' })
      await agent([
        'DONE-GATE GUARD CORRECTION for ' + item.eng + ' (repo ' + repo + '): the finalize step reported done=true but did not confirm its boxes-clean check (dodClean). Do NOT trust that Done write. LIVE full-body read the issue now; if its status currently shows Done, move it BACK to In Review via linearis and comment listing every unticked required box (DoD line + AC boxes lacking a dated moved/deferred/sanctioned-TBD annotation): ' + JSON.stringify(gate.uncheckedBoxes || []) + '. Then refresh the ticket cache: cd ' + HUB + ' && _bmad/lnr/tools/linear-sync.sh issue ' + item.eng + '.',
        LNR, RETDISC,
      ].join('\n'), { model: 'sonnet', effort: 'low', label: '#' + seq + ':gateguard:' + item.eng, phase: T, schema: NOTE_SCHEMA })
      return { eng: item.eng, out: 'gate-blocked-unticked' }
    }
    if (gate && gate.done) {
      doneThisRun.push(item.eng)
      if (item.isGate) {
        log('MILESTONE COMPLETE: ' + item.milestone + ' (gate ' + item.eng + ' Done)')
        await agent([
          'Milestone notification: use ToolSearch (query select:PushNotification) to load the PushNotification tool if this environment exposes it, then send: "Orvex Studio: milestone ' + item.milestone + ' COMPLETE (gate ' + item.eng + ' Done; ' + (doneThisRun.length) + ' issues delivered this run)". If the tool is unavailable, return ok=true with detail noting it was skipped.',
          RETDISC,
        ].join('\n'), { model: 'sonnet', effort: 'low', label: '#' + seq + ':notify:' + item.milestone, phase: T, schema: NOTE_SCHEMA })
      }
      return { eng: item.eng, out: 'done' }
    }
    escalated.push({ eng: item.eng, why: ((gate && gate.escalate) || 'done-gate failed').slice(0, 200) })
    return { eng: item.eng, out: 'gate-failed' }
}

// ---- Rolling engine loop (continuous saturation — no tick barrier) -----------
// The old loop awaited a whole batch before the next frontier: one slow issue (a
// 3-bounce review runs hours) held up to 17 FINISHED slots idle until the batch
// drained. Now every slot refills the moment it frees, and the cheap frontier
// re-syncs as completions unlock successors.
phase('Deliver')
const inFlight = new Set()
const claimedIds = new Set()   // dispatched this run — never re-dispatch off a stale cache
let queued = []
let syncs = 0
let seq = 0
let doneSinceSync = 0
let emptySyncs = 0
let topupSeq = 0
let stopReason = 'max-syncs'

function launch(item) {
  claimedIds.add(item.eng)
  seq++
  const mySeq = seq
  let p
  p = deliverItem(item, mySeq).then(
    r => { inFlight.delete(p); doneSinceSync++; log('#' + mySeq + ' ' + item.eng + ' -> ' + ((r && r.out) || 'null') + '  [inflight ' + inFlight.size + ' | queued ' + queued.length + ' | done ' + doneThisRun.length + ' | escalated ' + escalated.length + ']'); return r },
    () => { inFlight.delete(p); doneSinceSync++; escalated.push({ eng: item.eng, why: 'delivery chain threw' }); return { eng: item.eng, out: 'error' } }
  )
  inFlight.add(p)
}

function launchTopup() {
  topupSeq++
  const m = GATE_MS[(topupSeq * 3) % GATE_MS.length]
  let p
  p = makeTopup(m, topupSeq).then(r => { inFlight.delete(p); return r }, () => { inFlight.delete(p); return { out: 'topup' } })
  inFlight.add(p)
}

while (true) {
  // (Re)sync when: first pass; queue is empty and something changed (a completion) or
  // nothing is running; or enough completions have unlocked successors.
  const needSync = syncs === 0
    || (queued.length === 0 && (doneSinceSync > 0 || inFlight.size === 0))
    || doneSinceSync >= REFRESH_EVERY
  if (needSync && syncs < MAX_SYNCS) {
    syncs++; doneSinceSync = 0
    const frontier = await syncFrontier(syncs)
    if (!frontier) {
      if (inFlight.size === 0) { stopReason = 'frontier-unreadable'; log('Frontier unreadable (rate limit?) and nothing in flight — checkpointing, NOT complete'); break }
      log('Frontier unreadable — keeping ' + inFlight.size + ' in-flight deliveries; will retry after the next completion')
    } else {
      residueReport = frontier
      const fresh = (frontier.ready || []).filter(it => it && it.eng && !claimedIds.has(it.eng))
      queued = fresh
      if (fresh.length === 0 && inFlight.size === 0) {
        if ((frontier.todoTotal || 0) === 0 && (frontier.blockedResidue || 0) === 0 && (frontier.doneTotal || 0) > 0) {
          complete = true; stopReason = 'backlog-complete'
          log('PARTITION BACKLOG COMPLETE [' + PART_TAG + '] — todo 0, residue 0, done ' + frontier.doneTotal)
          break
        }
        emptySyncs++
        if (emptySyncs >= 2) { stopReason = 'dry'; log('Two consecutive empty frontiers, nothing in flight (residue: ' + (frontier.blockedResidue || 0) + ', todo: ' + (frontier.todoTotal || 0) + ') — checkpointing') ; break }
      } else { emptySyncs = 0 }
      log('Sync ' + syncs + ' [' + PART_TAG + ']: +' + fresh.length + ' ready (' + fresh.slice(0, 12).map(b => b.eng).join(', ') + (fresh.length > 12 ? ', …' : '') + ') | inflight ' + inFlight.size + ' | done ' + doneThisRun.length)
    }
  }
  // Refill every free slot immediately (the runtime queues above its own cap anyway).
  while (queued.length > 0 && inFlight.size < TARGET_INFLIGHT) launch(queued.shift())
  // §3.31 capacity floor: real deliveries first; top up the remainder with non-claiming
  // pre-work (bounded so top-ups never starve the loop or spam Linear).
  while (queued.length === 0 && inFlight.size > 0 && inFlight.size < CAPACITY_FLOOR && topupSeq < syncs * 2) launchTopup()
  if (inFlight.size === 0 && queued.length === 0) {
    if (syncs >= MAX_SYNCS) { log('Max frontier syncs (' + MAX_SYNCS + ') reached — checkpointing'); break }
    continue
  }
  await Promise.race(inFlight)
}

return {
  complete: complete,
  partition: PART_TAG,
  stopReason: stopReason,
  delivered: doneThisRun,
  deliveredCount: doneThisRun.length,
  escalated: escalated,
  residue: residueReport,
  syncs: syncs,
  reportDir: RDIR,
}
