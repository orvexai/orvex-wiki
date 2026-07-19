## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-wiki` — the **one AGPL artifact** (the thin Core Wiki Engine) — so that build stories dispatch only against a frozen, reviewed contract that keeps the fork surface minimal and the AGPL boundary clean. This is a **Wave-3 delta pack**: the engine repo is already real and deployed (Phase-0 wins), so the PRD-delta reconciles the brief's new features against a *live* artifact, not stale space canon. [P1 yXUWpQpRjx §3; Map current-state-map §2]

**Definition of Done — the binary gate** (pack analog of the named DoD test):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue* [P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t]
- [ ] Engine contract landed in `orvex-studio-contracts` and **git-TAGGED**; golden fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for the wiki-engine tag; CI green on the tag commit* [P1 yXUWpQpRjx §3]
- [ ] All five artifacts exist as wiki drafts in space `orvexwiki` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft* [Brief authoring §pack]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body has the self-audit block, every line "yes"*
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-3 slice — *machine check: SDD line-count ≥ concept-to-service map rows for orvex-wiki* [P1 yXUWpQpRjx §3.4]

Red on any = NOT done, no override. The pack's job is to leave the BUILD agent **zero architecture decisions** — every seam, tier, and contract shape is pinned here.

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the brief `rgBOQh31p3` and the concept-to-service map, When the PRD-delta is authored, Then every FR/NFR the brief folds into the engine is cited and reconciled against existing canon **PRD `EPsdD7uK8e` + Architecture `twQ3BBzpTE`**; contested seams are flagged, never silently chosen. *Assert: zero uncited added FR/NFR lines; each contested seam appears in §4 must-resolve.* [Source: Brief rgBOQh31p3; PRD EPsdD7uK8e; Arch twQ3BBzpTE]
- [ ] **AC2 (thin-engine doctrine)** — Given the split doctrine, When the PRD-delta scopes new work, Then it keeps the fork surface to the **frozen 13-row inline-edit allow-list + additive `apps/server/src/orvex/*` modules** and routes any composition/verb-grammar/cited-ask feature to `orvex-wiki-api`, not deep engine edits. *Assert: PRD-delta adds no upstream-file edit beyond the 13-row allow-list; every new composition FR names orvex-wiki-api as owner.* [Source: project-context §A-THIN; Map current-state-map §2]
- [ ] **AC3 (frozen contract)** — Given the M8 OpenAPI skeleton (8 operations incl. `orvexApplyOps`, `orvexGetQuota`, `orvexSessionExchange` noop-501, `orvexSourceOffer`, 4× `orvexTenantMove*`), When the contract is frozen, Then it is mirrored into `orvex-studio-contracts` with CloudEvent types on the ADR-0007 envelope / ADR-0010 `studio.*` taxonomy + golden fixtures, and **git-TAGGED**. *Assert: tag exists; fixture round-trip CI green; `orvex-marker-check.sh` reconciles operation count vs contract.* [Source: Evidence orvexwiki §4; P1 yXUWpQpRjx §3.2]
- [ ] **AC4 (TS clients per ADR-0035)** — Given the TS satellites (api/mcp/ui) consume this engine, When the tag emits, Then TS clients generate alongside Go stubs. *Assert: generated TS client package present in the tag artifact for the engine surface.* [Source: ADR-0035 QbEBPuKcGR]
- [ ] **AC5 (AGPL boundary encoded)** — Given the `@orvex/dfm` AGPL package is imported ONLY by the engine, When the contract pins the DfM seam, Then it encodes that satellites reach DfM via the **Go twin (`orvex-studio-lib/pkg/dfm`) or a network call to `orvex-wiki-api`** — never by importing the AGPL package. *Assert: contract + build prompt carry the import-guard rule; no satellite client imports `@orvex/dfm`.* [Source: project-context §A-SEAMS; ADR-0035 QbEBPuKcGR]
- [ ] **AC6 (event path)** — Given the engine emits domain events, When the contract + SDD pin the event path, Then event data is the **transactional `orvex_outbox` Postgres table drained direct to Kafka studio-spine** (D-S12/D-S13), CloudEvents against the contracts catalog — **no Mongo, no Redis→Kafka bridge**. *Assert: SDD event section names orvex_outbox→studio-spine only; zero "Mongo" tokens in the pack.* [Source: project-context §Event/§outbox; Evidence orvexwiki §4]
- [ ] **AC7 (test plan)** — Given CS §5, When the test plan is authored, Then it splits unit / store (testcontainers) / contract (fixture round-trip in CI) / crew-slot / family-E2E; the AGPL thin-UI AI-affordance surfaces (D-S4) carry the "looks good AND works" bar. *Assert: every tier has a named owner + gate; UI rows list vitest+Playwright+axe+dual-theme.* [Source: CS §5; P1 yXUWpQpRjx §3.3]
- [ ] **AC8 (SDD completeness)** — Given the SDD is the everything-eventually-needed done list, When authored, Then it covers full API surface (incl. later-wave features), events produced/consumed, entitlement/quota (frozen `402 QUOTA_EXCEEDED` + A-QUOTA fail-open), cell-lint + tenancy compliance, observability+SLOs, runbook, family-E2E. *Assert: SDD carries all listed dimensions; wave scoping is explicitly against it.* [Source: P1 yXUWpQpRjx §3.4; Cell JGAUQRsw2g]
- [ ] **AC9 (Phase-0 live baseline)** — Given the environment wins (D1 engine stable, D16 thin-AGPL+modules deployed, quota armed), When the SDD states its baseline, Then those wins are the *live* starting state the SDD is evidenced against, not the "94% Done" tracking optimism. *Assert: SDD baseline section cites the D1/D16/quota wins as observed live state.* [Source: program-status §1; P1 yXUWpQpRjx §7]
- [ ] **AC10 (source-availability reconciliation)** — Given FR-W19 `orvexSourceOffer` today has two conflicting §13 endpoints (mismatched sha fallbacks + `orvexai/docmost` vs `orvex-ai/orvex` URLs), When the pack freezes, Then the delta names the single reconciled source-availability shape as a must-do launch gate. *Assert: PRD-delta + SDD carry one canonical §13 endpoint; the conflict is flagged resolved.* [Source: Evidence orvexwiki §6]
- [ ] **AC11 (build prompt = zero decisions)** — Given the per-agent build prompt, When authored, Then its stories meet the full 9-section H1–H17 `9VUHxAcoXw` standard (named binary DoD test, machine-checkable ACs, seam+deep-module+tiers+versions named, all 12 ❌ assessed, SE-Arch lenses + ADR triggers, vertical RED→GREEN tasks, tickable boxes). *Assert: FINAL SELF-AUDIT block present, all "yes".* [Source: Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] **AC12 (negative — untagged blocks dispatch)** — Given a contract that is not git-TAGGED or whose fixtures do not round-trip, When Phase-2 attempts dispatch, Then it is blocked; a claimed-but-unverified tag is treated as no tag. *Assert: no Phase-2 story for orvex-wiki is frontier-eligible while `git tag -l` is empty for its surface.* [Source: P1 yXUWpQpRjx §4; program-status §7]
- [ ] **AC13 (negative — REVISE never overridden)** — Given a pack review returning `PACK-REVIEW: REVISE`, When findings are posted, Then the pack bounces to a fix pass; the author cannot self-advance or self-certify. *Assert: no DONE transition without a `PACK-REVIEW: PASS` comment authored by reviewer ≠ author.* [Source: P1 yXUWpQpRjx §7; SE-Arch 8sYi523i4t]
- [ ] **AC14 (forward-compat)** — Given later waves extend the engine surface, When a future change lands, Then it is additive under ADR-0008 (breaking/envelope-reshaping requires an ADR + human ratify) and MUST NOT reshape the frozen 13-row allow-list, the `402 QUOTA_EXCEEDED` contract, or the outbox→studio-spine event path without an ADR. *Assert: SDD forward-compat clause names these as ADR-gated invariants.* [Source: ADR-0008; project-context §A-ADR]

## 3. 🔨 Tasks/Subtasks

Dependency-ordered authoring tracer bullets. Wiki space = `orvexwiki`; contract repo = `orvex-studio-contracts`; engine repo = `orvex-wiki`.

- [ ] **T1 (AC1,2)** — Read canon: brief `rgBOQh31p3`, map `current-state-map §2`, PRD `EPsdD7uK8e`, Architecture `twQ3BBzpTE`, `orvexwiki` evidence digest, live `project-context.md` (repo). Note live-repo-wins.
- [ ] **T2 (AC1,2,10)** — Draft **PRD-delta** page in space `orvexwiki`; fold in brief features per the map; reconcile against PRD/Arch canon; flag contested seams (see §4) as must-resolve; record the §13 source-availability reconciliation.
- [ ] **T3 (AC3,4,5,6)** — Author the **frozen contract**: mirror the M8 OpenAPI 8-operation surface + CloudEvent types + golden fixtures into `orvex-studio-contracts`; encode the DfM Go-twin/wiki-api boundary; land + `git tag`; generate Go stubs + TS clients (ADR-0035).
- [ ] **T4 (AC3)** — Run contract self-validation CI (fixture round-trip; AGPL-import guard; `orvex-marker-check.sh`); confirm tag commit green.
- [ ] **T5 (AC7)** — Author the **test plan** page (unit/store/contract/crew-slot/family-E2E per CS §5; "looks good AND works" for D-S4 thin-UI AI affordances).
- [ ] **T6 (AC8,9,10,14)** — Author the **SDD** page: full future surface, events, entitlement/quota, cell-lint/tenancy, obs+SLOs, runbook, family-E2E; baseline = Phase-0 live wins; forward-compat ADR-gated invariants.
- [ ] **T7 (AC11)** — Author the **per-agent build prompt** page; its stories written to the full 9-section H1–H17 standard; run FINAL SELF-AUDIT.
- [ ] **T8 (AC12,13)** — Request adversarial pack review (reviewer ≠ author, opus); reviewer live-reads drafts + verifies tag.
- [ ] **T9** — Fix pass if `PACK-REVIEW: REVISE`; re-request review. Never override.
- [ ] **T10** — On `PACK-REVIEW: PASS` + tag verified: tick genuinely-verified boxes; hand to the delivery orchestrator for the Done advance (author cannot self-advance).

## 4. 🧠 Dev Context

**Inputs table**

| Canon page / slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | new engine-touching features (thin-UI AI affordances, tenancy, quota) |
| Map `current-state-map §2` | concept-to-service allocation; thin-engine-vs-wiki-api split |
| PRD `EPsdD7uK8e` | existing service PRD to reconcile the delta against |
| Architecture `twQ3BBzpTE` | existing architecture canon to reconcile against |
| Evidence `orvexwiki.md` | M8 contract surface (8 ops), delivery state, §13 conflict, TBD register |
| `project-context.md` (repo) | live thin-engine doctrine, `orvex/*` modules, outbox→spine, DfM boundary |
| ADR-0035 `QbEBPuKcGR` | TS-client generation for TS satellites |
| Cell `JGAUQRsw2g` | 14-rule cell-lint compliance the SDD declares |

**Space + reconciliation.** Wiki space slug = `orvexwiki`; evidence file = `.../evidence/orvexwiki.md`. **Live-repo-wins:** the engine repo + migration assessment outrank stale space canon (the space reads "~90% unbuilt"; the engine is real and deployed). Reconcile the delta against the deployed artifact. [Map reconciliation note; program-status §1]

**Contested seams this pack MUST resolve or flag:**

- [ ] **§13 source-availability** — two conflicting `orvexSourceOffer` endpoints (sha fallbacks + org/repo URL mismatch) → reconcile to one. [Evidence orvexwiki §6]
- [ ] **DfM ownership boundary** — pin that `@orvex/dfm` is engine-only; satellites use the Go twin or wiki-api; the contract encodes this. [project-context §A-SEAMS]
- [ ] **Composition-vs-engine** — any verb-grammar/cited-ask feature the brief adds routes to `orvex-wiki-api`, not deep engine edits; flag if the map is ambiguous. [Map §2]
- [ ] **Session-exchange fold-in** — `orvexSessionExchange` is noop-501 today (verifier core real; wiring is a fold-in edit); SDD names the fold-in owner. [Evidence orvexwiki §4]

**❌ Classic-mistakes (CS §0) assessment:**

| # | Row | Assessment |
|---|---|---|
| 1 | Domain logic in handler | APPLICABLE — quota `402` verdict stays in `orvex/quota`; controllers marshal only |
| 2 | Raw store calls outside store pkg | APPLICABLE — outbox/`orvex_page_meta` access confined to repository seam |
| 3 | Premature seam | APPLICABLE — binds the DfM twin/wiki-api port choice; design-it-twice on any NEW seam |
| 4 | Distributed monolith | APPLICABLE — engine must run standalone; contract seams only |
| 5 | Ignoring errors | APPLICABLE — `orvexSourceOffer` loud-500, no silent fallback |
| 6 | Big-upfront schema | APPLICABLE — binds contract shapes; freeze only the M8-proven 8 ops + additive |
| 7 | God object | NOT APPLICABLE — definition-only; deep-module split named in build prompt |
| 8 | Copy-paste | APPLICABLE — reuse `@orvex/dfm` serializer, do not re-implement in satellites |
| 9 | Premature optimization | NOT APPLICABLE — no perf tuning in a definition pack |
| 10 | Ceilings/caps | APPLICABLE — binds entitlement/quota shapes (frozen `402`, A-QUOTA fail-open, billing-read caps) |
| 11 | Hidden temporal coupling | APPLICABLE — outbox relay ordering pinned in SDD event section |
| 12 | No observability | APPLICABLE — SDD names obs+SLOs; M5 gap ("no app `/metrics` yet") carried honestly |

**SE-Arch lenses (5):** *Reliability* — outbox atomic-or-409 + fixture round-trip gate. *Security* — engine verifies only identity-minted exchange tokens (RS256/JWKS, no bypass); AGPL import-guard. *Cost governance* — A-QUOTA fail-open for cheap resources; caps read from billing. *Operational excellence* — runbook + cell-lint (`JGAUQRsw2g`) in SDD. *Performance-freshness* — push-evict + pull-on-miss entitlement cache (ADR id TBD — defined by SE-Arch review). **ADR triggers this pack may fire:** the still-"Proposed" engine architecture decisions (outbox→Kafka relay, native-login removal, quota fail-open, entitlement read, minimal-standalone) need ratify — each recorded as a per-service ADR under the Studio registry (ids TBD — defined by SE-Arch review); any new external dependency, new topic schema on studio-spine, or ceiling change fires such an ADR under ADR-0008 change-authority.

## 5. 🧪 Verification

- [ ] Adversarial review returns `PACK-REVIEW: PASS` (reviewer ≠ author) — comment on this issue + mirrored on the pack root draft.
- [ ] Contract tag EXISTS in `orvex-studio-contracts` (`git tag -l` non-empty for the engine surface) and its fixtures round-trip green in contracts CI.
- [ ] All five artifacts readable as `status=draft` via `docmost-cli page get --no-daemon` in space `orvexwiki`.
- [ ] Build-prompt stories pass the H1–H17 FINAL SELF-AUDIT (all "yes").
- [ ] SDD completeness checked against the concept-to-service map rows for orvex-wiki.

**What NOT to fake:** no self-review (reviewer ≠ author, non-overridable); no claimed-but-unverified tag (a claimed tag is not a tag — CI must be green on the tag commit); no SDD trimmed to the Wave-3 slice; no invented NFR numbers (use "TBD — defined by SE-Arch review" where canon has none); no "Mongo" wording (D-S12 override).

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module, design-it-twice on any NEW seam), §4 (TDD contract binds build-prompt stories), §5 (mocking categories bind the test plan), §6 (tier placement binds the build prompt), §7 (seam map — DfM twin/wiki-api, outbox→spine, exchange-token verify, quota/Redis seams), §8, §10, §11, §12 (wiki-first; pinned contracts are contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules) — pack declares compliance. **NO-MONGO override (D-S12):** engine event data = the `orvex_outbox` Postgres append/outbox table → Kafka studio-spine direct; strike any Mongo wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` — Phase 1 Definition Factory; Wave-3 delta packs.
- P1 orchestrator `yXUWpQpRjx` §3 (five artifacts), §4 (stage gate), §7 (fake-done).
- Brief `rgBOQh31p3` — new engine-touching features.
- PRD `EPsdD7uK8e` + Architecture `twQ3BBzpTE` — existing service canon to reconcile.
- Coding Standards `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12/§13; SE-Arch `8sYi523i4t` (5 lenses + Done gates).
- Issue Authoring `9VUHxAcoXw` (H1–H17). ADR-0035 `QbEBPuKcGR` (Go↔TS bridge). ADR-0008 (contracts change-authority). Cell `JGAUQRsw2g`.
- Evidence: `.../evidence/orvexwiki.md`; live `project-context.md`; `program-status-2026-07-14.md §1`.

## 8. 🔗 Dependencies

- **Project:** Orvex Wiki · **Milestone:** P1 — Definition Factory (Delivery Gates hub).
- **Blocked by:** `wave2-gate` (Wave-2 staging + workgraph packs certified — the Librarian/beads seams the engine's write surface interacts with settle upstream).
- **Blocks:** `wave3-gate` (the Wave-3 delta-pack wave cannot close until this engine pack certifies).
- ENG ids wired at filing (symbolic names above). **Deferred work born FROM this pack:** the engine's per-story build issues (born in Phase 2, not before); the ratify of the five "Proposed" engine ADRs (human `doc-ratify`, escalated); the OpenAPI-into-contracts registration (paste-ready ask #5, executed in T3).

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; claim arbiter per ADR-0033. 2. **PLAN** comment. 3. Continuous **PROGRESS** comments (each artifact drafted/landed; blockers). 4. **COMMITS** — every commit/PR body carries "Part of ENG-NNN" (links, never closes). 5. **STAGE HANDOFF** author→review. 6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings (reviewer ≠ author). 7. **TICK** boxes only when genuinely verified (full-body read-modify-write; preserve every other byte). 8. **DONE** — ONLY the delivery orchestrator advances (author CANNOT self-advance — fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority" in `po-decisions/`. Writes via linearis CLI; reads from `.cache/linear/`; never the Linear MCP.
