# PO Decision Log — Orvex Studio Delivery, 2026-07-07 (binding for the autonomous run)

> Reconstructed 2026-07-07 evening after a host reboot wiped the /tmp scratchpad copy; now version-controlled
> in-repo per §3.20a. Sources of truth that survive independently: Linear (structure/tickets/comments),
> the wiki (canon + §3.31), git history. This file is the run's consolidated decision record.

## The 16 kickoff decisions (answered individually by the PO)
- **Q1/PD-1 Structure: Option A** — keep the 125 tickets in their 14 per-repo projects; per-project milestones; coordination project "Orvex Studio — Delivery Gates" holds the 15 cross-repo E2E gates; wave/M-labels for rollup. OPS POC (32461b05) untouched.
- **Q1b Renames:** all 14 satellites → friendly names ("Orvex Wiki", "Orvex Studio AI", …). Executed.
- **Q2/PD-2 Milestones:** M0–M14 in 4 waves, adoption-populated, E2E gate closes each. PO addendum: **knowledge store = Turbopuffer** (key in OpenBao, AI/knowledge app) → ADR-0014; ENG-1358 re-platformed.
- **Q3/PD-3 Cycles:** ONE cycle for one week from 2026-07-07 (active cycle); no re-shuffling.
- **Q4/PD-4 Autonomy: FULL, strengthened** — run overnight, ask upfront, solve problems self, don't stop until all issues done; milestone-boundary reporting; self-provision via deploy/ GitOps (build-only validation, never kubectl apply/argocd sync); no spend ceiling; stop-rules bounce ≤3 / 2 dry ticks.
- **Q5/PD-4e Credentials:** Clerk dev = reuse orvex-prompt-studio-poc instance in OpenBao (Bao root + kube admin available). **Keycloak: parked** (build code path; park live E2E, label keycloak-parked). Stripe: done (see below). **Console (M13) = PO's view-and-manage-everything surface.**
- **Q6/PD-5:** ADR-0007 event envelope ratified → canonical.
- **Q7/PD-6:** claim arbiter = Linear-status-as-claim, single orchestrator; a 2nd concurrent orchestrator forces a real arbiter first.
- **Q8/PD-7 REVERTED by PO:** agents MAY receive API keys when a task needs them ("don't want you to get blocked"); default harness-auth; hard refuse-gate withdrawn. ADR-0006 amended.
- **Q9/PD-8:** seat confirmed (operator laptop, ≤32 agents, worktree isolation, per-repo merge serialization); ADR-0006/0004 stale "Proposed" banners fixed.
- **Q10/PD-9:** ADR registry + new ADRs 0008–0014 filed AND ratified. Literal ratify string: **"all ratified please ratify them now"** (scope: the decision records only — NOT a blanket for Q11–16; ADR-0013 MCP event-consumption left DRAFT, genuinely unsettled).
- **Q11/PD-10:** PRDs stay DRAFT — build from canonical architectures; promote per-milestone with a quick PO yes; NFR-ACs cite real ids or TBD.
- **Q12/PD-11:** space mandate scoped — orvexwiki space = wiki-engine manual home; family canon stays per-service under orvexstudioarch.
- **Q13/PD-12:** legacy cleanup = RENAME with " (Archived)" suffix only (IAE, docmost, docmostcli, LS, orvexstudiolinear spaces + "Orvex Studio MCP" Linear dup). **"Orvex Prompt Studio" untouched** until folded into the microservice architecture. No deletes, no banners.
- **Q14/PD-13:** spec-gate = warn for the delivery run.
- **Q15/PD-14:** canon hygiene — all four fixes (prompt §4.4 skills + §1.2 Mongo residue; CS §13 runner bullets; Issue-Authoring §6 + Mongo seams; canon-root roster/datastore rows). Literal: "Fix all four (Recommended)".
- **Q16/PD-16:** Turbopuffer SIGNED; Clerk residency CONFIRMED; Stripe handled (below). Remaining external gate: legal PII sign-off for routing core at M14/2nd-cell.

## Q17–Q22 (added during the run)
- **Q17 fork accounting = part of Done:** "your job isn't done until all the source code of our docmost fork and docmost-cli is accounted for and functional and tested in the new repo." Disposition ledger: 247 items, zero unaccounted (was at scratchpad forkacct/disposition-ledger.md — wiped by reboot; the enacting tickets + needs-ticket set are all in Linear; regenerate the ledger for the final done-gate audit).
- **Q18:** everything deployed is dev — all free to churn.
- **Q19:** PUSH NOTIFICATION per milestone completion + genuine blockers; morning summaries.
- **Q20:** OPS POC project renamed "OPS POC (On Hold)".
- **Q21 must-not-lose:** CLI agent-ergonomics (token-minimizers, cache-provenance, daemon reads, frozen exit 0-9 + 178-error-code contracts), ALL 31 page-block embed types, EMBED_DEGRADATION protections, Excalidraw/diagram round-trip + PNG/SVG render. orvex-cli byte-parity corpus must include Excalidraw + all embeds.
- **Q22 slim-AGPL:** everything possible OUTSIDE the AGPL engine; engine placement requires per-row justification.

## Drop dispositions (PO per-item sign-off, satisfies Q17 G4)
- **DROP (22):** Linear-integration product F13 (OAuth/sync/webhooks/bulk) + 17 cascading CLI verbs/embeds (8 linear_* blocks, 5 issue verbs, 4 linear verbs) per D-S11; spec-gate F6 + 3 spec verbs per D2/ENG-1463 (drift-verify KEPT). Bug-relay (ENG-1483/1484) KEPT.
- **KEEP (1):** orvex_dashboard embed — re-homed GENERIC (non-Linear); ENG-1465 keeps it server-side (decoupled from OrvexLinearHostModule); the CLI authoring verb is KEPT.
- **ACK (2):** DW8 regenerable .cache; DW9 docmost-original scaffolding. Nothing meaningful deleted.
- Sign-off comments live on ENG-1465/1368/1419/1463.

## CI / infra decisions
- **A1 runners:** ALL repos self-hosted. Private repos: `runs-on: runners`. Public orvex-wiki: dedicated **public-runners** ARC platform service in the **my-idp repo** (ephemeral, non-privileged, no OpenBao/cluster reach, capped). ADR-0005 + CS §13 updated (GitHub-hosted no longer used). GitHub org billing failure is off the critical path. PENDING PO: fork-PR require-approval toggle (App lacks administration:write); interim risk bounded.
- **A2 secrets:** OpenBao + External Secrets Operator, never hardcode. Stripe path: apps/orvex-studio-billing-dev/stripe.
- **A3 plan taxonomy:** free / personal / teams / enterprise (canon H5NzkdsOzK). ENG-1431/1524 ACs reconciled.
- **A4 console UI:** shadcn (Mantine NFR-CT4 waived) — ENG-1420 comment posted.

## Stripe (fully closed)
- Endpoints (test mode, live+verified): dev `https://billing.orvex.dev/webhooks/stripe` (we_1TqY2J…), crew/daniel `https://billing.crew-daniel.orvex.dev/webhooks/stripe` (we_1TqY2P…), 8 snapshot events each. Signing secrets in Bao: webhook_secret, webhook_secret_crew_daniel (verified matching v2 capture). Edge stays a plain always-on Deployment (NOT Knative — Stripe 72h retry). M4 hardened: ENG-1431 +AC12 idempotency ledger (TestStripeWebhook_DuplicateEventId_AppliedOnce); ENG-1584 outbox relay-worker; ENG-1585 Temporal billing sagas; ENG-1586 usage-based/thin-payload = FUTURE, blocked-by M4+M8 gates. NO thin/v2 destination now (meter events deselected).

## Doctrine added during the run
- **§3.31 capacity-utilization heartbeat** (canonical prompt gkkUDzn277): keep ~15 slots warm; fill slack with non-claiming pre-work; heartbeat is the engine's own tick loop (not an external timer); startup-reclaim un-strands stale In-Progress claims; diagnose narrow ≠ idle (stranded claims or DAG dam). Reference impl: tools/act3/delivery-engine.js (CAPACITY_FLOOR=15, makeTopups, Startup reclaim).
- Engine v2 fixes: blocked:boolean separate from notes; baseline-diff pre-existing gate noise; per-tick unique worktrees.
- AC reconciliations (canon-forced): ENG-1357 = CLEAN-ROOM TS @orvex/dfm (agpl-guard/D-CON-8; +AC11 agpl-guard, +AC12 byte-parity; fork thread code excerpts redacted to behavioral line-map).

## Human-only items outstanding (none block the frontier)
1. ENG-1400 — canon-root body edit is ratify-gated; needs PO literal go-ahead.
2. ENG-1506 — admin:org token for org-wide cell-lint ruleset (M14) + fork-PR require-approval toggle on orvex-wiki.
3. Canon doc-ratify promotions: ADR-0013 (MCP event consumption), mcp-PRD (ENG-1402/1403), doc-governance (ENG-1463).
4. Legal PII sign-off for routing core (gates M14/2nd cell).

## Run state (at reconstruction)
- Done total: 56+. Ready frontier: ~21 and widening as M0 closes. M0 gate ENG-1580: 8/14 constituents done; critical path ENG-1357 unblocked (clean-room) and building.
- Live digest for the PO: **ENG-1594** (Delivery Gates project). Engine: tools/act3/delivery-engine.js, relaunched with resume after the host reboot.
- Standing holds: keycloak-parked; deferred-future (ENG-1586). stripe-hold lifted.
