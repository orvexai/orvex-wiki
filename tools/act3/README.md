# Act-3 Delivery Engine (Orvex Studio)

`delivery-engine.js` is the autonomous delivery loop (a Claude Code `Workflow` script) that builds the
Orvex Studio backlog to Done — per the Delivery Orchestrator prompt (wiki: space `orvexstudioarch`,
slug `gkkUDzn277`, §3.18/§6A) and the PO decision log of 2026-07-07.

## What one tick does
1. **Frontier** (sonnet, bulk cache — NOT a live sweep): runs `linear-sync.sh sync-initiative`
   ONCE (~5 paginated calls: whole-team fetch, all states incl.
   Done, + the blocked-by graph inline from the list) → `.cache/linear/initiative.json`, then computes
   readiness LOCALLY: Todo/Backlog issues (scoped to the 14 satellites + Delivery Gates, NOT the whole
   448-issue ENG team) whose every cached `blockedBy` edge is Done/Canceled/Duplicate — excluding
   `stripe-hold` / `keycloak-parked` / `deferred-future` labels and already-escalated issues. Wave order,
   most-blocking first. Honesty gate: `readComplete=false` if the sync exited non-zero / `.complete` is
   false / Done==0 (never acts on a partial, rate-limited cache). This replaced a per-tick live
   14-project sweep + per-candidate relation read that drained the shared 2500/hr quota (commit 28076e19).
2. **Build** (sonnet, per issue, parallel): claim (→ In Progress), own git worktree under `/tmp/worktrees`,
   TDD to the ticket's ACs, repo CI gates (gofmt -l separate for Go), green commits only, PR via `gh`.
   Gate issues (label `gate`) run their verification checklist instead (opus).
3. **Adversarial review** (opus, reviewer ≠ implementer): re-runs everything, verifies each AC; ≤3 fix
   bounces, then escalate (comment on the issue + archive branch ref + keep the fleet moving).
4. **Done gate** (serialized per repo): merge PR → tick ONLY review-verified DoD boxes (full-body
   read-modify-write) → explicit → Done → eager cleanup (merge-checked `-d`, never `-D`).
5. Milestone gate reaching Done ⇒ `log()` + push notification (if the harness exposes it).

Caps: bounce ≤3/issue, 2 consecutive empty frontiers ⇒ checkpoint, `maxTicks` (= max frontier re-syncs, default 120) ⇒ checkpoint. v9: rolling saturation (no tick barrier — every freed slot refills immediately, TARGET_INFLIGHT=16/engine) and two-engine partition via `args.partitionProjects`/`partitionName` (disjoint project sets = the Q7 claim arbiter; 2×16 = the ratified 32-agent ceiling). The run returns
`{complete, delivered, escalated, residue}`; the orchestrator relaunches with
`Workflow({scriptPath: 'tools/act3/delivery-engine.js'})` to continue (state is re-derived live — nothing
is stored in the engine).

## Recovery after a crash/seat loss (§3.20c)
1. `_bmad/lnr/tools/linear-sync.sh sync-initiative` FIRST — never assess from a stale cache.
2. Salvage any unmerged branches (`refs/archive/inflight/*`, `git fsck`), prune worktrees merge-checked.
3. Relaunch the engine (same command). Escalations live as Linear comments; Done state lives in Linear.

Session report files: the engine writes per-issue build/review/gate logs under the session scratchpad
(`.../scratchpad/act3/`). Args: `{maxTicks}`.
