# Fake-done forensics ledger

Durable, append-only note of confirmed FALSE-DONE incidents (a ticket labeled Done whose DoD is
not genuinely met) and the root-cause patterns behind them. Consulted by orchestrator frontier
reads so a fake Done cannot silently gate downstream work. Fake-done is an H17 / §5e / 9VUHxAcoXw
H14–H15 violation: a body not 100% `[x]` is NOT done, and only the orchestrator (`gkkUDzn277`) may
set Done after {DoD test green, all boxes ticked, adversarial CS+SE-Arch PASS, all PRs merged}.

## Root-cause pattern P1 — "PR-merge → auto-Done" (2-second post-merge status write)

**Signature.** A ticket's terminal state transition is `In Progress → Done` occurring **1–3 seconds
after** its work-branch PR merges to the integration branch, actor = the shared `daniel` API token
with `botActor: null`, and **no orchestrator DoD-adjudication comment** precedes it. This is an
automated post-merge status write (a merge-hook or a lane's own "I merged, mark it Done" step), NOT
the §5e stage-9 gate. It fires regardless of whether boxes are ticked or the DoD test is green — so
it manufactures a fake Done any time a *partial-slice* PR merges.

**How to detect on any suspect Done.** `linearis issues activity <ID>` → find the terminal
`In Progress → Done` history event; compare its `createdAt` to the merge time of the referenced PR
(`gh pr view <n> --json mergedAt,mergeCommit`). A <5 s gap + no orchestrator DoD comment + any
unticked box in the description = fake-done. The last comment before the flip is usually a review
that says the opposite ("keep In Progress, N/M boxes").

**Fix direction (systemic, for a human/orchestrator):** any auto-status-on-merge automation must be
removed or gated behind the §5e four-part check — a PR merge is at most criterion (4), never Done by
itself. Until then, every engine-owned Done must be verified against activity+description before a
downstream ticket is allowed to gate on it.

## Confirmed incidents

| Ticket | Fake-Done set | Evidence of unmet DoD | Corrected to | Pass |
|--------|---------------|------------------------|--------------|------|
| ENG-1405 (MCP R1 identity bearer cutover) | 2026-07-10T23:53:10Z, 2 s after PR #18 (`217ce40`, partial slice) merged | 0/52 boxes ticked; last review (23:45, 8 min prior) = "AC1/3/5/6 NOT met, DoD e2e test all legs skipped, 0/9 boxes, keep In Progress"; no post-flip activity | Todo (pass-20) | 20 |
| ENG-1954 (orvex-studio-api-dev ExternalSecret) | (infra gate) | 0/3 runtime ACs: ExternalSecret `Ready=False`, App `OutOfSync/Degraded`, workload `Missing` | In Progress (pass, 2026-07-12) | — |
| ENG-1479 (referenced in tools/act3/README.md §29) | — | self-report untrusted; act3 verifies against real state instead of the Done label | — | — |
| ENG-1361 (SSRF-guarded url-fetch tool, orvex-studio-mcp) | 2026-07-07T12:47:52Z, 46 s after implementer's own PROGRESS comment and **7 min before** the referenced PR (orvex-studio-mcp #15) actually merged to `dev` | Mandatory review-gate boxes (`Adversarial CS+SE-Arch review PASS`, T9, orchestrator-only-advance) permanently unticked; no orchestrator adjudication comment ever posted; 4 prior capacity-fill audits (07-08..07-10) flagged the discrepancy but none legitimized it (comment-only, non-claiming). DoD-reality re-check this pass: code now merged, `vitest run test/tools/url-fetch-helpers.test.ts` 30/30 green — implementation real, but the process gate was genuinely skipped | In Progress (pass-21) | 21 |
| ENG-1395 (editor-ai-palette inline port) | 2026-07-10T19:22:47Z, ~5 s after `eng-1395-work` fast-forward merge to `dev`, `botActor: null` | 44/48 boxes unticked; build agent's own PROGRESS comment discloses AiPalette UI + AC6/AC7-error/AC9/AC10 **NOT built** ("partial increment, not a completion claim; Done stays orchestrator-gated"); the only PASS was a round-4 review **scoped strictly to F1 single-undo**, not a full-DoD gate | In Progress (pass-21) | 21 |
| ENG-1395 (editor-ai-palette inline port) — SECOND flip | 2026-07-12T00:23:53Z, 70 s after `eng-1395-work`/PR #91 merge (`e42488d`), `botActor: null`, no orchestrator comment before the flip | Same-day gate agent (journal `wf_27bd270a-615`, `af3befec41b9c7dde`) self-reported `dodTicked:14, uncheckedBoxes:[]`, but a live re-read of the issue description found only 14/44 `[x]` boxes: AC1-AC10 + DoD-test + 2 NFR ticked, but the 6-box "DoD checklist" summary, the 10-box T1-T10 task list, and the 14-box 5b/5c test-name+CI-gate list all still `[ ]`. Body not 100% `[x]` → not Done per H1/§5e. Underlying work (PR #91 merged, AC-level adversarial review PASS) not disputed — this is a checkbox-completeness gate failure by the gate agent, not a rebuild request | In Progress (pass-25, this verification) | 25 |
| ENG-1559 (M5 Knowledge Backbone E2E gate) | 2026-07-12T11:51:38.505Z, 2.5 s after PR #23 (`861485f`, branch `eng-1559-m5-gate-arm`) merged to `dev`, `botActor: null`, no orchestrator DoD comment | binary DoD gate `TestM5KnowledgeE2E` PROVABLY RED on the merged code (run 29191386466, headSha 1a34784, `reason=transport` registry_assign — the CI runner cannot resolve in-cluster Service DNS); body 0% `[x]` | In Progress (pass-57, self-caused-merge revert) | 57 |

## Precedent rulings that flow from this ledger
- Downstream tickets already claimed In Progress on a fake-Done frontier are given **halt-context
  comments** with the corrected blocker state; their claims are **NOT reset** (no-state-reset-on-
  running-engines, ENG-1360). Example: pass-20 posted halt-context to ENG-1406 (baselined on
  `217ce40`) and ENG-1500 (re-claimed; its own comments already flagged the ENG-1405 blocker).
- Reverting a fake-Done to Todo does not break its `blockedBy` edges — relations are status-
  independent (verified live for ENG-1498 → ENG-1405 in pass-20).

**2026-07-12 (pass 21):** P1's trigger on ENG-1405 confirmed as branch-name/PR-title identifier linking (`eng-1405-work`, no closing keyword anywhere in PR #18 body/13 commits — that discipline held) driving Linear's merge-triggered auto-close workflow automation, which the 2026-07-07 PO directive (ENG-1375, `tools/act3/po-decisions-2026-07-07.md:110`) to disable is still not verifiably off — the toggle has no linearis/Linear-MCP read or write surface, so it remains an open human-ledger item (`po-decisions/2026-07-12.md`); see `scratchpad/pass21/autoclose-rootcause.md` for the full path-elimination trace.

**2026-07-12 (pass 21) — Gateless-Done sweep.** Audited all **75** issues Done in the last-48h window (`.cache/linear/initiative.json`, updatedAt ≥ 2026-07-10T12:00Z) for an engine Done-gate record. Result: **52 GATED** (clean `act3/ENG-<id>-gate.md` dodClean pass and/or a journal `done=true,dodClean=true` result record), **~17 ORCH-CLOSED** (orchestrator-lane finish/finalize/split reports that advanced to Done with ticked-box evidence — pass6 1466/1539, pass10 1931, pass13 1415/1945, pass17 1419, pass19 1556, pass16-17 1949, etc.), **4 pre-window** old Done flips (1357/1361/1512/1540 — flipped Done 07-07…07-09, in-window updatedAt is from later comments not a status change), **2 already-corrected/stale-in-cache** (1954 reverted In Progress in pass18/20; 1578 Todo, 1467 In Progress — initiative.json snapshot stale), and **1 NAKED fake-done → reverted**: **ENG-1395**. Method note for future sweeps: `updatedAt` in-window ≠ status-flipped in-window — many bulk timestamps (e.g. the 20:44:2x and 23:56:30 clusters) are relation/cache edits; always read `issues activity` for the actual terminal-transition time + `botActor`, and count `[ ]` vs `[x]` in the per-ticket `.cache/linear/issues/*.yaml` (template prose lines contain `[ ]` too — exclude them). Full classification table: `scratchpad/pass21/gateless-sweep.md`.

**2026-07-12 (pass 21) — Pre-window verify.** Checked the gateless-sweep's 4 pre-window Done flips (1357/1361/1512/1540) against prior audit coverage. **ENG-1357**: legitimized — orchestrator 'Advanced -> Done' comment with full re-verification (163/163 tests, T8 CS+SE-Arch PASS) after an earlier capacity-fill fake-done flag; final flip at 01:37:33Z was the orchestrator's own adjudication, not an auto-flip. **ENG-1512**: legitimized — 6 independent capacity-fill audits (07-08..07-11) each verified the merged PR + named test (`TestOfflineDfmConvert`) independently and repeatedly concluded NOT fake-done; remaining gaps are rollup-checkbox hygiene (individual AC boxes ARE ticked) and a wiring-reachability note, neither risen to a legitimizing-verdict override. **ENG-1540**: legitimized — capacity-fill audit (07-10) traced a misattributed/copy-pasted backfill comment on the thread, confirmed the ticket's own PROGRESS/HANDOFF evidence (`TestAgplImportGuardContract` 8/8, PR #10) is consistent and correct, explicit verdict 'Not reopening'. **ENG-1361**: NOT legitimized — 4 audit flags exist but all are non-claiming/comment-only with no orchestrator confirmation ever posted, and the flip signature matches P1 exactly (auto-flip on implementer's own status write, occurring even before the referenced PR merged). Reverted to In Progress; row above. corrected = 1. Log: `scratchpad/pass21/prewindow-verify.md`.

## Root-cause pattern P2 — "box-census under-count" (gate censuses a summary subset, reports clean)

**Signature.** The engine Done-gate agent reports `dodClean:true` / `uncheckedBoxes:[]` with a small
`dodTicked` (5–14) while the live issue body carries many more actual checkbox lines still `[ ]` —
because the gate only ticked/counted a *summary subset* (usually the AC list, or the AC + DoD-test
lines) and never censused the rest of the body: the `## Tasks` T1–Tn list, the named-test list, the
DoD-checklist summary duplicates, and the CI/static-gate boxes. Per H1/§5e a body that is not 100%
`[x]` (excluding dated deferrals) is NOT Done, so the gate's `dodClean` verdict is structurally
unreliable — distinct from P1 (which is an *auto*-flip with no gate at all).

**Distinguish from a real fake-done.** P2 is usually a *reporting/ticking* defect over genuinely
complete work: the §5e four-part gate (named DoD test green + adversarial review PASS reviewer≠
implementer + PRs merged) IS satisfied in the journal, only the physical box-ticking was partial.
**Honest repair = tick the covered boxes citing the merged-PR + review-PASS evidence** (not a
rebuild, not fabrication) — reserve the 1395/1361 revert treatment for bodies where the evidence
does NOT cover the unticked boxes. Always leave dated `deferred`/`blocked-by`/`moved` boxes unticked
(they are census-compliant).

**How to detect.** Live-read the body (`linearis issues read <ID>`), count `^\s*[-*] \[[ xX]\]`
lines (exclude template prose), and compare the true `[ ]` count to the journal gate record's
`dodTicked`/`uncheckedBoxes`. A large gap = P2.

**2026-07-12 (pass 26) — v11.1-gated Done audit.** Censused the 14 tickets Done'd by the two v11.1
engine runs (A `wf_681a6d55-bc7`, earlier `wf_27bd270a-615`), the pre-v11.1 same-season engine-B run
(`wf_6a3eb5ba-c87`), and the 3 already-visible Dones of the STILL-RUNNING engine-B `wf_5dbcf33c-83e`
(audit-only, no writes). **7 clean PASS** (1562/1521/1959/1960/1964/1967, + 1969 all-deferred),
**2 deferred-annotated PASS** (1969 AC6/AC7/edge→ENG-1573; 1957 AC7 cross-repo dated 07-11),
**1 skip** (1395 already In Progress from pass-25), **4 P2 box-census REPAIRS**, **1 flagged-no-write**
(1970, running engine). Every engine-B `wf_6a3eb5ba-c87` Done exhibited P2. **corrected (reverted)
= 0** — all four were box-census repairs, the §5e gate was genuinely met in each. Full table +
per-ticket evidence: `scratchpad/pass26/v11-1-audit.md`.

| Ticket | Gate mis-report (journal `wf_6a3eb5ba-c87`) | Live census | Covering evidence | Action |
|--------|---------------------------------------------|-------------|-------------------|--------|
| ENG-1958 (metering usage_events journal) | `dodClean:true, dodTicked:5` | 5/12 `[x]`, 7 unticked (D1,D2,T1–T5) | PR #18 merged `d9f56cc`; review2 PASS AC1–AC5, 3 named DoD tests green vs real PG, non-tautology mutation-proven; D1=(a)/D2 ratified in ADR-0001 | ticked 7 → 12/12 (pass-26) |
| ENG-1498 (identity token revocation + enforce-SSO) | `dodClean:true, dodTicked:10, uncheckedBoxes:[]` | 10/37 `[x]`, 27 unticked (ACs,T1–T8,tests,gates) | PR #17 merged; review3 PASS after 3 rounds AC1–AC8, DoD gate `TestTokenRevocationPropagates` green unit+live-HTTP vs real PG+Redis; F1/F2 fixed `fa1ae8d`/`561b46f` | ticked 27 → 37/37 (pass-26) |
| ENG-1547 (console admin gate mount + audit-or-fail) | `dodClean:true, dodTicked:13` | 13/41 `[x]`, 28 unticked | PR #14 merged `68df107`; review1 PASS AC1,2,3a,4–9,DoD-test,T1,T5; gate MOUNTED real routes, suite green | ticked 25 → 38/41; 3 AC3b-deferred (`blocked-by ENG-1498`) left (pass-26) |
| ENG-1597 (console settings/security composer) | `dodClean:true, dodTicked:7, uncheckedBoxes:[]` | 7/34 `[x]`, 27 unticked | PR #44 merged `5cbd719`; review1 PASS AC1–AC7, DoD test `TestConsoleSettingsDomainGatedAudited` green non-tautology 2-mutation-proven, all CI gates green | ticked 27 → 34/34 (pass-26) |

**Running-engine flag (not corrected).** `wf_5dbcf33c-83e` (still running) has a fresh Done on
**ENG-1970** at 11/18 `[x]` — 7 genuine unticked work boxes (tag-cut, review-PASS, T2/T3, 5d/5e
gate lines). NOT written per the "do not touch in-flight" discipline; flagged for the engine's own
box-tick step / next pass. ENG-1361 (47/48, sole unticked = orchestrator-advance policy note) was
genuinely rebuilt+reviewed+merged this run, **superseding its pass-21 P1 revert** — now a legitimate
Done.

**2026-07-12 (pass 28) — ENG-1970 census, engine-B checkpointed.** Re-censused ENG-1970 (flagged
no-write in pass 26 as the still-running engine's fresh Done). Engine B (`wf_5dbcf33c-83e`) has since
checkpointed/completed. Live body: 11/18 `[x]`, 7 unticked. Journal evidence located at
`#8:review:ENG-1970` (verdict PASS, verifiedAcs incl. `DoD-binary-gate`,AC1-3,NFR-compat,NFR-honesty)
and `#8:gate:ENG-1970` (`dodTicked:10, merged:true`, PR #31 squash-merged to dev; gate's own comment
explicitly flags the semver tag as NOT cut, "out of this gate's instructed scope"). Evidence covers
exactly 2 of the 7 unticked boxes — the review-PASS line and the T3 mandatory-gate line (both restate
the same reviewed fact); the other 5 (semver tag cut, T2 verify+tag, §9 stage-updates/PR-body
convention, 5d, 5e-fake-done-gate-requires-tag) are NOT covered — evidence shows the tag genuinely
was not cut, so those remain correctly unticked (no revert needed, nothing was mis-ticked to begin
with; this is pure repair-by-ticking, not a 1395-style revert). **Action: ticked 2 → 13/18 (pass-28).**
Comment posted on ENG-1970 citing the journal evidence. Full detail: `scratchpad/pass28/1970-census.md`.

**2026-07-12 (pass 57) — ENG-1559 self-caused merge auto-close, reverted.** While arming the M5
closing gate (self-provisioned Clerk fixtures + JWT template-name split), the orchestrator merged
PR #23 (branch `eng-1559-m5-gate-arm`) to `dev` at 11:51:36Z; Linear's still-live merge-triggered
auto-close fired the terminal `In Progress -> Done` **2.5 s later** (11:51:38.505Z, shared token,
`botActor:null`, zero orchestrator DoD comment) — textbook P1. The binary DoD gate is PROVABLY RED on
the exact merged code: run 29191386466 (headSha 1a34784) failed at `registry_assign` with
`reason=transport` (runner pod resolver = public 1.1.1.1, not cluster CoreDNS — in-cluster identity/
engine/knowledge Service DNS unreachable FROM the runner). Body 0% `[x]`. Reverted to **In Progress**
(pass-57) + two comments on ENG-1559 (residue b9c8104c, revert-note 7f23bc3c). This is the SAME
open human-ledger item as pass-21: the ENG-1375 auto-close toggle has no linearis/Linear-MCP surface
to disable, so any `eng-<id>-*` branch merge keeps manufacturing a fake-Done — every M-gate arming
merge must be followed by an activity+DoD re-check + revert. Log: `scratchpad/pass57/m5-fixtures.md`.

**2026-07-12 (pass 71) — ENG-1578 M14 closing gate, "close-as-CI-armed" premature Done, reverted.** The
launch gate sat LIVE **Done** (terminal `In Progress → Done` at 2026-07-10T22:35:04.931Z, shared token,
`botActor:null`) with a body 0/35 `[x]` and its named binary DoD **provably RED**. Classified **P2
mis-report** — NOT gate-performed (no green run ever) and NOT a P1 2-second auto-close (the nearest merge
~22:35:05Z, headSha `00f05e3`, PR#30 is ENG-1949's `TestM14Degrade` branch — auto-close targets ENG-1949,
not this gate; and the whole 07-10 evening was the orchestrator manually flipping this gate Todo↔IP while
arming CI). The Done was the manual tail of that arming, under the documented-but-unratified "close as
CI-armed, defer deployed-mode green as ENG-1578 residue" posture. **RED proof:** `m14-gate-ci` run
**29174576757** (dev, 2026-07-12T00:59Z) — workflow "success" only because the job is `continue-on-error`
+ excluded from `ci-success.needs`; JOB conclusion = **failure**, step `TestGateM14E2E` = **failure**
(ENG-1949's sibling `TestM14Degrade` job also failed). A prior revert (07-12T15:02:01 Done→IP) was undone
99s later (15:03:40 IP→Done); pass71 makes the revert stick. **Frontier truth — the 6 gate values read
constituent-Done but are NOT deployed/reachable:** bearer = pass67 PR#23 client_credentials grant landed
but INERT (no client/role/secret); target-cell = `us1` registry alias only, no 2nd deployed cell;
isolation-probe = fold LIBRARY, no HTTP route; routing-core-log = consumer-only, producer unbuilt;
cap-status = registered in billing `server.go:171` but `/internal/`+no HTTPRoute+gate env blank;
degrade-status = in api `rehearsal.ts:46`, `/internal/`+static-equality-gated+gate env blank. **Human
residue = 2** (both re-verified open): (1) independent human security review of `POST /v1/clients/token`
before activation; (2) PO resolution of the short-lived-per-run bearer vs. static-equality degrade fork
(`rehearsal.ts:50` still `token !== deps.m14BearerToken`). **Action: reverted Done → In Progress
(pass-71, live 15:52:34Z)** + reconciliation comment id `22820157` on ENG-1578 (marked "orchestrator
judgment under PO standing authority (2026-07-12)", Sonnet-5 trailer, no secrets). corrected = 1.
Log: `scratchpad/pass71/m14-forensics.md`.

**2026-07-12 (pass 73):** Fresh recurrence — merging the 3 ENG-2006 KAFKA_BROKERS-repoint PRs (branches `eng-2006-kafka-brokers-repoint`, PR titles `… (ENG-2006)`) auto-closed ENG-2006 Backlog→Done via Linear's merge-triggered branch/title identifier-linking (same mechanism as the ENG-1405 pass-21 trace). Reverted Done→Backlog (linearis update, re-read confirmed Backlog); revert note commented (`aae32cac`). The ENG-1375 auto-close toggle remains an open human-ledger item — still no linearis/Linear-MCP read/write surface to disable it, so identifier-bearing branch names keep tripping it on every merge.
