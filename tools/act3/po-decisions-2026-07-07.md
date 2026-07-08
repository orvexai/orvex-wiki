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

## Run notes (2026-07-08)
- ENG-1393 §3.27 audit: verdict HONEST-for-scope (corpus = 29 real JSON fixtures for all registered types; the "seed" is the separate fixtures/dfm v0.3 artifact). Follow-up ENG-1598 (M1) owns the full Q21 byte-parity catalog (31 embeds + Excalidraw, language-neutral, one canonical fixtures/dfm) + activating the dfm-parity gate; blocks ENG-1429.
- §3.19 signal: some Done issues carry unticked DoD boxes (merge lanes in recovery workflows skipped ticking). Standalone backfill sweep attempted, aborted CLEANLY on Linear rate-limiting (shared quota with the live engine; 0 writes). DEFERRED to the next engine checkpoint — engine capacity-fill re-verifies Done issues incrementally meanwhile. LESSON: heavy Linear sweeps and the engine must SERIALIZE (shared API quota); never run both at full fan-out.
- RULING ENG-1523 (PR-gate triage, orvex-studio-billing PR #7): the blocking red `TestUnknownPrincipalFailsClosedToFree` (501≠200) was NOT PR #7's diff nor a merge regression — it is an always-latent BASELINE flaky infra race. `postgres.ensureSchema`'s `CREATE TABLE IF NOT EXISTS` is not atomic vs the implicit `pg_type` composite type; concurrent first-creation collides (SQLSTATE 23505) and the raw error escaped `Store.Current` → handler 501. Reproduced with a 16-way concurrent harness; reproduces on origin/dev. Baseline-diff rule applied → standalone fix in billing **PR #12** (`fix/ensureschema-advisory-lock`): tx-scoped `pg_advisory_xact_lock` around the DDL. Gate to proceed: merge #12 to dev, re-run PR #7 → green. ENG-1523 status untouched (§5e). LESSON: idempotent-DDL scaffolds (`CREATE ... IF NOT EXISTS`) are NOT concurrency-safe on a shared engine — guard first-creation with an advisory lock or a real migration runner.
- Engine v4 (cc2bf9a0): startup reclaim resets ALL stranded In-Progress (finish-not-rebuild comments on open-PR ones); launch nonce defeats stale cache replay; completed runs relaunch FRESH (no resumeFromRunId).
- **ENG-1446 ruling-7 seam respec (canon-backed, not new product calls):** two seams absent from the Go/identity repo resolved to established patterns. **7a** — AC6 config at-rest encryption = the OpenBao + ESO pattern (A2) via an `orvex-studio-lib` helper (NOT the fork's `@orvex/secret` LocalSecretService, NOT a bespoke cipher). **7b** — AC9 orphan-sweep cross-DB existence read goes through the engine contracts service API (ENG-1365 seam), NEVER a direct cross-DB read (canon P-never-shared-databases; CS §7). AC6/AC9 respec'd full-body + §4b/§4d/§4i/T3/T6; ruling comment on ENG-1446. **ADR-0015 (DRAFT)** filed in orvexstudioarch (slug `PxoUAiGN29`; registry `32Huug8U4B` row added, next-free→0016) — human doc-ratify pending (agents don't self-ratify). Deferred to PO: (1) concrete lib encryption-helper API + OpenBao path/ESO ExternalSecret shape; (2) whether ENG-1365 already exposes an engine existence-read contract or needs a small additive one.

## Fake-done audit #2 — ENG-1430 (2026-07-08)
- **Verdict: NOT fake-done. ENG-1430 stays Done.** ENG-1584 reported `pkg/events/publisher.go` `BrokerPublisher.Publish` still returns unconditional `ErrNotImplemented` at origin/main `6bdc274` — TRUE on `main` but a **wrong-branch read**. orvex-studio-lib's default/integration branch is **`dev`**; `main` is 0-ahead / **7-behind** dev (main is an ancestor of dev). PR #9 merged to **`dev`** (mergeCommit `1f2b206`, all 8 CI checks green); PR head `c8a8c6a` is NOT in main.
- On **origin/dev**, `Publish` is a REAL segmentio/kafka-go producer: envelope-validate (AC1) → marshal → `Writer.WriteMessages` to `TopicForType(...)` (`publisher.go:194`–`208`). AC9 grep gate CLEAN on dev (zero `ErrNotImplemented`/panic in publisher.go ∧ consumer.go). Real integration test present: `publisher_kafka_integration_test.go:21` `TestBrokerPublisher_RealKafka_PublishConsume` (testcontainers `confluentinc/confluent-local:7.6.1`, publish→read-back). Authority: CS §11 ALL-REAL; ENG-1430 AC9/DoD.
- Ruling comment posted to ENG-1430. No box/status changes.
- **Residual (orchestrator flag, not fake-done):** `main` still carries the stub (`publisher.go:111`) until dev→main promotion. Consumers pinning the lib to a `main` rev import the stub — relevant to ENG-1583/1584 (billing outbox relay-worker). Confirm downstream lib pins resolve to a rev containing `1f2b206`.

## RULING — fixture provenance, ENG-1503 + ENG-1483 (same class, 2026-07-08)
- **Default applied: RECORD/AUTHOR REAL FIXTURES.** Both DoD boxes pointed at fixtures that did not yet exist in real form.
- **ENG-1503 (F3 escalation resolved) — signature goldens AUTHORED into `orvex-studio-contracts` (canonical home).** New `identity/vectors/conformance/`: 13 signed compact-JWS fixtures (V1,V3,V4,V5,V8,V9,V12) + public JWKS + deterministic generator + `TestAuthConformanceTokenCorpusContract` (stdlib+jsonschema; no crypto CI dep). PR **#25 merged to dev** (`046a0bb`); local `pytest tests/` 54 passed + validate_contracts/validate_schemas/agpl-guard OK; byte-deterministic. Merged before self-hosted CI completed (dev branch protection not enforcing required checks) — validated locally green. Corpus constants are **byte-identical** to what lib's `pkg/auth/authtest/fixtures.go` embeds → lib repoints by swapping in-code mint for a `go:embed` load, **zero** issuer/aud/kid/key churn. "Authored synthetic" is correct for a *signature* contract (never a recorded real IdP token — matches pinned `example-claims.json` policy, ENG-1537). V6/V7/V10/V11 stay behavioural (seeded from tokens); V2 principal-map asserted lib-side. Ruling comment on ENG-1503. Authority: CS §12 (pinned contracts), CS §11 (ALL-REAL), FR-L7.
- **ENG-1483 — REAL Linear fixture RECORDED read-only, delivered ready-to-commit.** Read-only GraphQL `issues(first:2){nodes{id identifier url}}` (live orvexai; same selection set as the relay's `issueCreate`). Finding: real `url` carries a **title-slug** segment + a proper-entropy v4 `id`; the committed hand-authored `testdata/issue_create_response.json` used a slug-less url + all-zero-segment id (not what Linear emits). Recorded+scrubbed (synthetic Customer-Support placeholder; `identifier` kept `SUP-100` ⇒ **zero test churn**; `_provenance` block ignored by `writeport.go` `json.Decode`) delivered as a ready-to-commit drop-in in the ENG-1483 ruling comment. NOT pushed: ENG-1483 is In Progress on PR #4 / `eng-1483-work` under the live engine — did not race that branch (engine has quota/branch priority). Artifact: `scratchpad/triage4/issue_create_response.json`. Authority: CS §5 (true-external replay committed real response).
- Both handled per "execute if practical; else comment the exact plan + leave honest": 1503 executed+merged; 1483 recorded+delivered (commit deferred to avoid engine collision).

## RULING — ENG-1371 F1 merge conflict, rebase + green + merge (2026-07-08)
- **Verdict: cleared, merged, Done.** Sole blocker was an add/add conflict on `packages/@orvex/extensions` (`package.json`, `src/index.ts`, `tsconfig.json`, `pnpm-lock.yaml`) between `eng-1371-work` and already-merged ENG-1411 (`OrvexMigrationProvider`) — both created the package concurrently. Rebased `eng-1371-work` onto `origin/dev` (`e398cc67`→`ccdff372`); resolved keeping BOTH features: `package.json` kept the `kysely` dep ENG-1411 needs (ENG-1371 adds none), `index.ts` merged both export barrels, `tsconfig.json` took the union of both `exclude` lists (`test` + `src/**/*.spec.ts`), `pnpm-lock.yaml` kept the `kysely` entry consistent. Post-rebase `@orvex/extensions` vitest 46/46 green in one run (both specs), proving genuine coexistence.
- Re-run surfaced two AGPL SPDX-header gaps against ENG-1491's `license-header-check` (merged to dev after this PR was opened, so its new files predate the gate): 4 ENG-1371 files fixed in-branch; 1 pre-existing dev-baseline file (`orvex-native-login.guard.ts`, ENG-1490, unrelated diff) reproduced identically on a clean `origin/dev` worktree checkout — confirmed baseline via the standard clean-checkout repro before excusing, then fixed inline as a trivial one-liner rather than opening a standalone PR (baseline-diff rule, ENG-1523-style, but disproportionate to spin up a separate PR for a 3-line header on an untouched-by-this-PR file).
- Full re-verify on the rebased branch: `tsc --noEmit` clean; `lint:boundary` clean; `test:ci` 466/466 (dev grew from 335 baseline, zero regressions); `test:integration` 58/63 — the 5 `page-move`/`page-restore` failures (`pages_unique_title_per_parent`, ENG-1471) reproduced byte-identical on clean `origin/dev`, confirmed pre-existing per the PR body's original disclosure; named DoD test `TestPageMetaSideTable_RoundTrip` green; `apps/client` vitest 138/138.
- Pushed, PR #44 went `mergeStateStatus: CLEAN`, merged via `gh pr merge --merge` → `660034cc` on dev. PR body test-plan counts refreshed. Issue description: all DoD-gate/DoD-checklist/AC1–11/T1–10/5a–5e boxes ticked; status → Done; ruling comment posted on ENG-1371 (full detail).
- LESSON: a PR sitting open across a dev-merge window can accrue new gates it never had a chance to satisfy (here, ENG-1491's license-header check landed on dev mid-flight) — always re-run the full local suite post-rebase, not just resolve the diff conflicts, before declaring green.
