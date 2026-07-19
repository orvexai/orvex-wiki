## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-wiki-api` so that build stories dispatch only against a frozen, reviewed contract — and never against the stale, self-contradicting space canon this service carries today (host-form disagreement, a non-existent "Redis→Kafka bridge", zero contracts entries). `orvex-wiki-api` is the wiki's stateless **Go composition/heavy tier** over the AGPL engine: new behaviour composes HERE via strangler-extraction, not via deep engine edits. [Source: [Map orvexwikiapi §1], [P1 yXUWpQpRjx §3]]

**Definition of Done — the binary gate** (all five green, red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [Source: [P1 yXUWpQpRjx §4], [SE-Arch 8sYi523i4t]]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for wiki-api's tag; contracts CI green on the tag commit* [Source: [P1 yXUWpQpRjx §3], [ADR-0008]]
- [ ] All five artifacts exist as wiki drafts in space `orvexwikiapi` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [Source: [P1 yXUWpQpRjx §3]]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body is 100% tickable + carries a named binary DoD test* [Source: [Issue-Auth 9VUHxAcoXw H1–H17]]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-3 delta slice — *machine check: every concept-to-service-map line for wiki-api maps to an SDD row* [Source: [P1 yXUWpQpRjx §3], [Map current-state-map §2]]

This pack leaves the Phase-2 build agent **zero architecture decisions** — the contract shape, tier map, seam ownership and test tiers are all pinned here. That is what the pack is FOR.

## 2. ✅ Acceptance Criteria

- [ ] **AC1 — PRD-delta (reconciled).** Given the brief's new features for the wiki tier, When the PRD-delta is authored, Then every added FR/NFR is cited to the brief or map and reconciled against the **live repo, not the stale space canon** (the space's Architecture page is `canonical` but carries an unratified "Review tightening" addendum + a non-existent "Redis→Kafka bridge"). *Assertion: zero uncited FR/NFR lines; every reconciliation note names the deployed artifact it defers to.* [Source: [Brief rgBOQh31p3], [Map orvexwikiapi §2–§3], [Map current-state-map reconciliation note]]
- [ ] **AC2 — Go twin/composition layer scoped.** Given new wiki behaviour is owned by this Go twin, When the PRD-delta scopes it, Then it composes over the engine's live `/api/orvex/*` (322 paths) via strangler-extraction with NO deep AGPL engine edit. *Assertion: the PRD-delta contains an explicit "compose-here, do-not-edit-engine" invariant traceable to the strangler ruling.* [Source: [Map orvexwikiapi §1], [project-context]]
- [ ] **AC3 — FROZEN, TAGGED contract.** Given contracts today has **zero wiki-api entries** (no FR, no SEAMS.md entry — blocking on contracts NFR-C4), When the pack lands, Then the `search/get/save/edit/list` grammar over `{resource_type, locator}` + the frozen error vocab (`VERSION_MISMATCH`, `needs_human_*`, `QUOTA_EXCEEDED` 402, `RATIFY_*`/`GATE_UNSATISFIED`) + CAS `ifVersion → 409` + the read-after-write receipt `{url,id,version,persisted:true}` are authored into `orvex-studio-contracts` and git-TAGGED under a tag covering wiki-api's surface, scheme per the W1 contracts pack. *Assertion: `git tag -l` non-empty for wiki-api's tag; golden fixtures round-trip green in contracts CI.* [Source: [Map orvexwikiapi §4], [ADR-0035 QbEBPuKcGR], [ADR-0008]]
- [ ] **AC4 — TS clients per ADR-0035.** Given the TS satellites (mcp, cli tooling) consume this surface, When the tag emits, Then TS clients generate alongside Go stubs. *Assertion: the tag artifact set contains a TS client for wiki-api's surface.* [Source: [ADR-0035 QbEBPuKcGR]]
- [ ] **AC5 — Citations-surface seam RESOLVED-or-FLAGGED.** Given the map names "cited-ask/citations" as the canonical example seam but this service's D-A4/D-A12 rule wiki-api has **no `ask` verb** (cited-ask lives in `orvex-studio-ai`; wiki-api is a write-only downstream), When the PRD-delta defines the search/query proxy shapes, Then the citations-surface ownership (wiki-api search/query proxy vs ai's ask loop) is either resolved with a cited rationale or flagged as a pack-review must-resolve — never silently chosen. *Assertion: an explicit must-resolve item names this seam and its owning-service decision or FLAG.* [Source: [Map current-state-map §2], [Map orvexwikiapi §1,§3 D-A4→D-A12]]
- [ ] **AC6 — Config/endpoint contract hardened for open defects.** Given D15/ENG-2054 + fresh ENG-2082 (KNOWLEDGE_URL/AI_URL NXDOMAIN → `502 UPSTREAM_UNAVAILABLE` in prod), When the PRD-delta defines the config/endpoint contract, Then upstream URLs and their failure surface (`502 UPSTREAM_UNAVAILABLE` vocab + readiness that round-trips dependencies, not a `/healthz` that "reads green on a degraded engine") are specified. *Assertion: the SDD readiness row requires a dependency round-trip; the config contract enumerates KNOWLEDGE_URL/AI_URL + their NXDOMAIN error mapping.* [Source: [live cache 2026-07-14 ENG-2054/ENG-2082], [Map orvexwikiapi §5]]
- [ ] **AC7 — Forward-compat: protect the api PASS.** Given the acceptance ground truth at filing (po-decisions Phase-4 walk, 2026-07-14 evening, prod spine): 6/8 PASS — api, knowledge-sync, mcp, cross-cutting (live 402), web, identity; residuals rag (blocked: prod query image behind dev), ai (token threading), cli (dfm format rejection); the 2026-07-14 morning dev-cell re-baseline (ENG-2039..2054) remains the filed defect ledger — and the **api surface is a PASS**, When the delta is authored, Then it carries forward-compat ACs guaranteeing the byte-compatible `/api/orvex/*` proxy behaviour is not regressed by the new `/v1` grammar. *Assertion: the golden-corpus parity fixture for `/api/orvex/*` stays green after the `/v1` grammar lands.* [Source: [program-status §2], [Map orvexwikiapi §4]]
- [ ] **AC8 — Test plan (CS §5 tiers).** Given CS §5, When the test plan is authored, Then it splits unit / store (n/a — stateless, no DB; stated NOT APPLICABLE with why) / contract (fixture round-trip in CI) / crew-slot / family-E2E, and adds the batch-atomicity + R8c redaction-parity black-box tests the evidence flags as fragile. *Assertion: every tier is either populated or marked NOT APPLICABLE with a reason; the batch-atomicity and redaction-parity tests are named.* [Source: [CS §5], [Map orvexwikiapi §6]]
- [ ] **AC9 — SDD completeness (whole service).** Given the SDD is the total everything-eventually-needed list, When authored, Then it covers full API surface (Phases 1–3: verb grammar, block-patch CAS, clean-room Go serializer, drift/spec-gate, response shaping — all "designed but unbuilt"), events produced/consumed, entitlement/quota (`QUOTA_EXCEEDED` 402), cell-lint + tenancy compliance, observability + SLOs, runbook, and family-E2E participation. *Assertion: each of the 13 open questions OQ-A2..OQ-A13 is either resolved-with-cite or carried as an SDD "TBD — defined by Daniel" line.* [Source: [P1 yXUWpQpRjx §3], [Map orvexwikiapi §3,§5], [Cell contract JGAUQRsw2g]]
- [ ] **AC10 — Cell-lint compliance declared.** Given the day-1 cell contract's 14 rules, When the pack lands, Then it declares compliance and fixes the evidence gaps (`/healthz` missing `CLUSTER_NAME`; evict Trigger missing `orvexcell` cell-fail-closed guard). *Assertion: a cell-lint compliance table with all 14 rows PASS or a named remediation story.* [Source: [Cell contract JGAUQRsw2g], [Map orvexwikiapi §5]]
- [ ] **AC11 — Build prompt to H1–H17.** Given the per-agent build prompt, When its stories are authored, Then each passes the `9VUHxAcoXw` FINAL SELF-AUDIT (named binary DoD test, machine-checkable ACs, seam + deep-module + tiers + versions named, all 12 ❌ assessed, SE-Arch lenses + ADR triggers, vertical RED→GREEN tasks, tickable boxes). *Assertion: each story body is 100% `- [ ]` for completable items and carries one named DoD test.* [Source: [Issue-Auth 9VUHxAcoXw H1–H17]]
- [ ] **AC12 — Negative: REVISE never overridden.** Given an adversarial review returns `PACK-REVIEW: REVISE`, When findings post, Then the pack bounces to a fix pass and is NOT advanced. *Assertion: no Done transition exists on this issue while the latest review comment reads REVISE.* [Source: [P1 yXUWpQpRjx §4,§7], [SE-Arch 8sYi523i4t]]
- [ ] **AC13 — Negative: untagged contract blocks dispatch.** Given a claimed-but-unverified tag, When Phase-2 dispatch is attempted, Then it is blocked. *Assertion: `git tag -l` empty ⇒ no build story is frontier-eligible.* [Source: [P1 yXUWpQpRjx §3,§4]]
- [ ] **AC14 — Doc-governance fold-in.** Given doc-governance (drift + spec-gate) folds in from the fork as a Linear-free grammar (D-S8/D-S11), When the SDD is authored, Then the drift/spec-gate surface is scoped as an eventual-need line, not silently dropped. *Assertion: the SDD carries a drift + spec-gate row citing D-S8/D-S11.* [Source: [Map orvexwikiapi §3]]
- [ ] **AC15 — Observability + SLOs.** Given the SDD owes observability, When authored, Then it names SLOs (or "TBD — defined by Daniel" where canon has no number) and the transactional-outbox → relay → studio-spine tracing path — never the phantom "Redis→Kafka bridge". *Assertion: the SDD observability row cites the outbox→relay mechanism and no Mongo/Redis-bridge wording remains.* [Source: [Map orvexwikiapi §6], [D-S12 NO-MONGO]]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map §2`, evidence `orvexwikiapi.md`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, ADR-0035, cell contract `JGAUQRsw2g` (AC: 1,2,5)
- [ ] Draft **PRD-delta** into space `orvexwikiapi` (page `orvex-wiki-api — PRD-delta (Wave 3)`), reconciling against the live repo; strike the stale "Redis→Kafka bridge" + host-form disagreement + `orvex-studio-control`/`docmost-cli` naming drift (AC: 1,2)
- [ ] Resolve-or-flag the **citations-surface seam** (wiki-api search/query proxy vs ai ask loop) as a must-resolve item (AC: 5)
- [ ] Author **contract + golden fixtures** in `orvex-studio-contracts` (`openapi/wiki-api.yaml` + CloudEvent types on the ADR-0007 envelope / ADR-0010 `studio.*` taxonomy + error vocab + CAS receipt); resolve contracts NFR-C4 (AC: 3)
- [ ] Land + **git-TAG** in `orvex-studio-contracts`; generate Go stubs + TS clients (ADR-0035); confirm CI round-trip (AC: 3,4,13)
- [ ] Author **test plan** page — tiers per CS §5 + batch-atomicity + R8c redaction-parity + `/api/orvex/*` parity fixture (AC: 7,8)
- [ ] Author **SDD** page — whole-service done list incl. Phases 1–3 surface, cell-lint table, config/endpoint contract for ENG-2054/ENG-2082, OQ-A2..OQ-A13 as resolved-or-TBD (AC: 6,9,10)
- [ ] Draft the in-space **ADRs** the seams demand (host-form pin; citations-seam; contract change-authority = ADR-0008) — finding B5, none exist today (AC: 5,9)
- [ ] Author **per-agent build prompt** — stories to the full 9-section H1–H17 standard (AC: 11)
- [ ] Request **adversarial review** (reviewer ≠ author); fix pass if REVISE (AC: 12)
- [ ] Tick verified boxes; hand to orchestrator (author cannot self-advance)

## 4. 🧠 Dev Context

**Inputs**

| Canon page/slug | What it feeds |
|---|---|
| Brief `rgBOQh31p3` | New wiki-tier features folded into the PRD-delta |
| Map `current-state-map §2` | Concept-to-service allocation; citations-surface seam |
| Evidence `orvexwikiapi.md` | Decided/draft split, contract surface, delivery-state gaps |
| ADR-0035 `QbEBPuKcGR` | TS-client generation for TS consumers |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance |
| CS `6aMAzsYeQb` §5/§6/§7 | Test tiers, six-tier `internal/` map, seam map |

- **Space slug:** `orvexwikiapi`. **Evidence file:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexwikiapi.md`.
- **Live-repo-wins:** the deployed `orvex-wiki-api` repo + `migration-assessment` OUTRANK the stale space canon (canonical Architecture page carries an unratified addendum + a non-existent "Redis→Kafka bridge"; host-form disagrees across doc/canon/manifest). Reconcile against the deployed artifact. [Source: [Map current-state-map reconciliation note], [Map orvexwikiapi §6]]

**Contested seams this pack MUST resolve or flag**

- [ ] **Citations-surface / cited-ask ownership** — wiki-api search/query proxy vs `orvex-studio-ai` ask loop (D-A4→D-A12 say no `ask` verb here). Resolve with cite or flag for review. [Source: [Map current-state-map §2], [Map orvexwikiapi §3]]
- [ ] **Host-form pin** — `api.wiki.{cell}.orvex.dev` (doc) vs shipped `wiki-api.orvex.ai` (manifest) vs canon "UNPINNED". Pin it or flag. [Source: [Map orvexwikiapi §6]]
- [ ] **R8c redaction relocation** — redaction in the Phase-3-deleted composition layer risks resurrecting unredacted reads; gated by the not-yet-run black-box parity test. [Source: [Map orvexwikiapi §6]]

**❌ classic-mistakes (CS §0)**

| # | Canonical name | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only pack; the row binds the build-prompt stories this pack authors (composition rules must live in the wiki-api domain package, never a handler) — carried into those stories, not decided here |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — wiki-api is stateless with no store package (store tier declared n/a in AC8); there is no store-driver seam to bind |
| ❌#3 | Premature interface / seam | APPLICABLE — the pack pins the citations, redaction (R8c) + engine-boundary seams by evidence; a port IS justified at the engine network seam, but no in-process interface is minted without ≥2 real impls (AC5) |
| ❌#4 | Mocking own packages | NOT APPLICABLE — definition-only; the row binds the test-plan stories (test through the exported interface with a real/in-memory substitute, never a self-mock) authored by this pack (AC8) |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; the row binds the build-prompt story tasks this pack authors, which must be vertical RED→GREEN tracer bullets (AC11) |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the frozen `search/get/save/edit/list` grammar over `{resource_type, locator}` + error vocab + CAS receipt to only the fields the surface needs, not a speculative schema (AC3) |
| ❌#7 | Shallow pass-through package | APPLICABLE — the compose-here strangler invariant must justify the Go twin against the deletion test (CS §3.1); a byte-compatible `/api/orvex/*` proxy must add real composition value, not a thin pass-through (AC2,7) |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — the config/endpoint contract this pack freezes requires KNOWLEDGE_URL/AI_URL clients injected at the seam with credentials via env only, never inlined (AC6) |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — this stateless composition tier holds no projection/read-model layer (projections live in the engine); where events are produced, timestamps derive from event payloads (AC9,14) |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — the `QUOTA_EXCEEDED` 402 entitlement/cap shapes are cited from ratified canon, not invented to make a gate pass; any ceiling change needs ADR + human sign-off (AC9) |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; the row binds the build-prompt stories this pack authors (handlers hold routing + marshalling only) — carried into those stories, not decided here |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — the frozen contract fixes concrete typed structs across the exported `/v1` surface; `unknown` is the only sanctioned placeholder in the generated TS clients (AC3,4) |

**SE-Arch lenses** — *Reliability:* readiness must round-trip deps (no green-on-degraded-engine `/healthz`). *Security:* AGPL clean-room boundary + RATIFY/CONFIRM tokens stay engine-minted (transport-only). *Cost governance:* `QUOTA_EXCEEDED` 402 + no shaped-read caching (D-A10). *Operational excellence:* cell-lint `CLUSTER_NAME` + evict cell-guard; CI must run tests before push. *Performance-freshness:* CAS `ifVersion` + read-after-write receipt. **ADR triggers expected:** contract-freeze under ADR-0008; the host-form pin and citations-seam call are ADR-worthy (finding B5 — no ADR pages exist in-space yet). [Source: [SE-Arch 8sYi523i4t], [Map orvexwikiapi §4–§6]]

## 5. 🧪 Verification

- [ ] Adversarial review returns `PACK-REVIEW: PASS` (reviewer ≠ author) — *comment exists on this issue*
- [ ] Contract tag EXISTS in `orvex-studio-contracts` — *`git tag -l` non-empty for wiki-api's tag*
- [ ] Golden fixtures round-trip green in contracts CI — *CI run green on the tag commit*
- [ ] `/api/orvex/*` byte-parity fixture green after `/v1` lands — *parity job green (protects the api PASS)*
- [ ] Build-prompt stories pass the H1–H17 FINAL SELF-AUDIT — *each story 100% tickable*
- [ ] SDD completeness vs concept-to-service map — *every map line for wiki-api has an SDD row*

**What NOT to fake** — no self-review; no claimed-but-unverified tag; no SDD trimmed to the Wave-3 slice; no invented NFR/host-form/tag numbers (write "TBD — defined by Daniel"); no green `/healthz` standing in for real readiness.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module; design-it-twice on the citations + host-form seams), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan — stateless ⇒ store tier NOT APPLICABLE), §6 (`internal/` six-tier map is currently unmapped — the SDD owes it), §7 (seam map — pin the citations, redaction, engine-boundary seams), §8, §10, §11, §12 (wiki-first; the pinned contract is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules). **NO-MONGO override (D-S12):** event data = Postgres append/outbox; the real mechanism is engine transactional-outbox → relay → studio-spine, NOT the canon's phantom "Redis→Kafka bridge" — strike any Mongo/Redis-bridge wording. [Source: [CS §0–§13], [SE-Arch 8sYi523i4t], [Map orvexwikiapi §6]]

## 7. 🔗 References

- Program plan `5eFdxN3edd` · Phase-1 prompt `yXUWpQpRjx` §3–§4 · Umbrella brief `rgBOQh31p3`
- Coding Standards `6aMAzsYeQb` §0,§3,§4,§5,§6,§7,§12 · SE-Arch `8sYi523i4t` (5 lenses)
- Issue Authoring `9VUHxAcoXw` H1–H17 · ADR-0008 (change-authority) · ADR-0035 `QbEBPuKcGR` (Go↔TS bridge) · ADR-0007/0010 (envelope/taxonomy)
- Cell + tenancy contract `JGAUQRsw2g` (14-rule cell-lint)
- Evidence: `evidence/orvexwikiapi.md`; `evidence/current-state-map.md §2`; `evidence/migration-assessment.md`; `program-status-2026-07-14.md §2`
- Live cache 2026-07-14: ENG-2054 (D15) · ENG-2082 (KNOWLEDGE_URL/AI_URL NXDOMAIN → 502)

## 8. 🔗 Dependencies

- **Project:** Orvex Wiki API · **Milestone:** P1 — Definition Factory
- **Blocked by:** `wave2-gate` (Wave-2 packs certified) — ENG id wired at filing
- **Blocks:** `wave3-gate` (Wave-3 delta-pack roll-up) — ENG id wired at filing
- **Deferred, named owner:** the story-level build/test issues are born FROM this pack (Phase 2), not before it; per-service P1 milestone creation is the batched human-only Linear-MCP dependency (escalate, do not block); OQ-A2..OQ-A13 resolutions owned by Daniel.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; claim arbiter per ADR-0033.
2. **PLAN** comment — the artifact order + the seams to resolve.
3. **PROGRESS** comments as each artifact drafts/lands + any blockers.
4. **COMMITS** — every commit/PR body carries "Part of ENG-NNN" (links, never closes; Done is gate-owned).
5. **STAGE HANDOFF** author→review once all five artifacts are drafted + the contract is tagged.
6. **REVIEW** — reviewer live-reads the wiki drafts (`docmost-cli page get --no-daemon`, never cache), verifies the tag EXISTS + fixtures round-trip, then posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** boxes only when genuinely verified (full-body read-modify-write, preserve every other byte; never blanket-tick).
8. **DONE** — ONLY the delivery orchestrator advances; the author CANNOT self-advance (fake-done gate).
9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority".

Writes via `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP; dual-write canon changes to the wiki via `doc-amend` as drafts (promotion is human-only `doc-ratify`).
