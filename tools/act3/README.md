# Act-3 Delivery Engine (Orvex Studio)

`delivery-engine.js` is the autonomous delivery loop (a Claude Code `Workflow` script) that builds the
Orvex Studio backlog to Done — per the Delivery Orchestrator prompt (wiki: space `orvexstudioarch`,
slug `gkkUDzn277`, §3.18/§6A) and the PO decision log of 2026-07-07.

## What one tick does
1. **Frontier** (sonnet, live linearis): Todo/Backlog issues across the initiative + Delivery Gates project
   whose every `blocked-by` is Done/Canceled — excluding `stripe-hold` / `keycloak-parked` labels and
   already-escalated issues. Wave order, most-blocking first.
2. **Build** (sonnet, per issue, parallel): claim (→ In Progress), own git worktree under `/tmp/worktrees`,
   TDD to the ticket's ACs, repo CI gates (gofmt -l separate for Go), green commits only, PR via `gh`.
   Gate issues (label `gate`) run their verification checklist instead (opus).
3. **Adversarial review** (opus, reviewer ≠ implementer): re-runs everything, verifies each AC; ≤3 fix
   bounces, then escalate (comment on the issue + archive branch ref + keep the fleet moving).
4. **Done gate** (serialized per repo): merge PR → tick ONLY review-verified DoD boxes (full-body
   read-modify-write) → explicit → Done → eager cleanup (merge-checked `-d`, never `-D`).
5. Milestone gate reaching Done ⇒ `log()` + push notification (if the harness exposes it).

Caps: bounce ≤3/issue, 2 dry ticks ⇒ checkpoint, `maxTicks` (default 40) ⇒ checkpoint. The run returns
`{complete, delivered, escalated, residue}`; the orchestrator relaunches with
`Workflow({scriptPath: 'tools/act3/delivery-engine.js'})` to continue (state is re-derived live — nothing
is stored in the engine).

## Recovery after a crash/seat loss (§3.20c)
1. `_bmad/lnr/tools/linear-sync.sh sync` FIRST — never assess from a stale cache.
2. Salvage any unmerged branches (`refs/archive/inflight/*`, `git fsck`), prune worktrees merge-checked.
3. Relaunch the engine (same command). Escalations live as Linear comments; Done state lives in Linear.

Session report files: the engine writes per-issue build/review/gate logs under the session scratchpad
(`.../scratchpad/act3/`). Args: `{maxTicks}`.
