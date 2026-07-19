## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-staging` so that build stories dispatch only against a frozen, reviewed contract for the Agent Staging Area + Librarian — and never against the service's dense-but-unfrozen 2026-07-12 planning canon. This is a **Wave-2** pack: `orvex-studio-staging` has **ZERO tickets today** (pre-definition, not abandoned), so this pack births the service's epics AND stories from scratch. [P1 `yXUWpQpRjx` §4 W2; Plan `5eFdxN3edd` Phase-1 W2]

**Definition of Done — the binary gate** (pack analog of the named DoD test; red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch `8sYi523i4t`; Plan `5eFdxN3edd` Phase-1 certification]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI run green on the tag commit* [ADR-0008; P1 `yXUWpQpRjx` §3]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudiostaging` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [P1 `yXUWpQpRjx` §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body is 100% resolved placeholders + tickable boxes* [Issue Authoring `9VUHxAcoXw` H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the wave slice — *machine check: SDD covers full `staging_*` surface, `studio.staging.*` events, entitlement/quota, cell-lint, SLOs, all test tiers, runbook, family-E2E* [Plan `5eFdxN3edd` Phase-1 SDD ruling]

This pack leaves the BUILD agent **zero architecture decisions** — pinning the contract shape, the seam ownership, and the Done gate is exactly what the pack is FOR. [Issue Authoring `9VUHxAcoXw` H4]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 — PRD-delta (reconciled).** Given the brief's Librarian-loop feature set, When the PRD-delta is authored, Then it reconciles against the **existing canonical spine** (staging pages `mOzNDhn322` / `P5R7eCXJA0` / `GOacy9kdJz`, landed 2026-07-12) rather than regenerating it, and cites every added FR/NFR to the brief or map. *Assertion: PRD-delta draft links all three canonical page slugs and marks each delta line ADD/RECONCILE.* [Source: Brief `rgBOQh31p3`; Evidence `orvexstudiostaging` §2; Map current-state-map §2]
- [ ] **AC2 — Librarian product epic.** Given the brief productizes today's ad-hoc `doc-librarian` chain, When the epic is authored, Then it defines the **Agent Staging Area + Librarian** and records that it **supersedes OPS Librarian/Card Contract v1 and the `orvex-studio-api` Curator**, with the Card-v1→Proposal verbatim-superset mapping named as a migration deliverable. *Assertion: epic body contains an explicit "supersedes: OPS Librarian/Card Contract v1, BFF Curator" line.* [Source: Map current-state-map §2 Librarian loop, §5 P1-7; Evidence `orvexstudiostaging` §1/§3]
- [ ] **AC3 — FROZEN, TAGGED contract.** Given the `staging_*` surface + `studio.staging.<resource>.<past-tense>` events, When the contract lands in `orvex-studio-contracts`, Then OpenAPI + CloudEvents (ADR-0007 envelope / ADR-0010 `studio.*` taxonomy) + golden fixtures + generated clients are git-TAGGED, with TS clients emitted per ADR-0035 for the TS satellites (mcp/api). *Assertion: a tag in `orvex-studio-contracts` covers this service's surface (scheme per the W1 contracts pack) and its fixtures round-trip green in CI.* [Source: ADR-0035 `QbEBPuKcGR`; Evidence `orvexstudiostaging` §4]
- [ ] **AC4 — frozen error + receipt shapes.** Given quota governance, When the contract is frozen, Then the `402 QUOTA_EXCEEDED` code + contracts `Error`/`ErrorCode` vocabulary and the distinct `SubmitReceipt`/`ApplyReceipt` shapes are pinned (never 429/destructive). *Assertion: contract enumerates `QUOTA_EXCEEDED` and both receipt schemas.* [Source: Evidence `orvexstudiostaging` §4; ADR-0034 `12aDkq4iOd`]
- [ ] **AC5 — Test plan.** Given CS §5 tiers, When the test plan is authored, Then it splits unit / store (testcontainers, Postgres-only) / contract (fixture round-trip) / crew-slot / family-E2E, and pins the read-after-write staleness (≤45s debounced ydoc persist) + poll-with-tolerance apply-receipt path as an explicit integration-test case. *Assertion: test plan names all five tiers + a staleness-tolerance apply case.* [Source: CS §5 `6aMAzsYeQb`; Evidence `orvexstudiostaging` §6]
- [ ] **AC6 — Service Done Definition.** Given the everything-eventually-needed rule, When the SDD is authored, Then it enumerates the **full** `staging_*`/`orvex-cli staging` surface (incl. FR-STG28 scheduled publishing, FR-STG29 prompt-pack marketplace, the 3-stop Autonomy Dial), events, entitlement/quota, cell-lint (`JGAUQRsw2g`), SLOs, all tiers, runbook, family-E2E — not just the wave slice. *Assertion: SDD lists every locked-in-v1 feature from Evidence §3.* [Source: Evidence `orvexstudiostaging` §3; Plan `5eFdxN3edd` Phase-1 SDD ruling]
- [ ] **AC7 — hard-cut sequencing (the circular gate).** Given FR-STG25 hard-cut of ALL agent wiki-write surfaces is the LAST release step, When the build prompt sequences work, Then it orders the cut **against the named non-501 prerequisites** (`orvex-wiki-api` write facade, `orvex-studio-ai` classify, `orvex-studio-knowledge` search/dedup, engine `wiki.*` outbox) and states the no-fallback tension explicitly rather than resolving it silently. *Assertion: build prompt lists the 4 gating 501/absent-outbox deps and marks the cut LAST.* [Source: P1 `yXUWpQpRjx` §4 W2; Evidence `orvexstudiostaging` §5/§6; Map current-state-map §3 risk 6]
- [ ] **AC8 — Curator↔Librarian seam (must-resolve, not silent).** Given the live double-ownership (Curator in the BFF vs Librarian in staging), When the pack freezes ownership, Then the seam is raised as a **review must-resolve item** with the resolution recorded, never silently chosen by whichever side authors first. *Assertion: pack root draft carries an unresolved-until-review "Curator↔Librarian ownership" block; review verdict records its resolution.* [Source: Map current-state-map §3 risk 9, §5 P1-7; Evidence `orvexstudiostaging` §1]
- [ ] **AC9 — build prompt stories (H1–H17).** Given `9VUHxAcoXw`, When the per-agent build prompt is authored, Then its stories carry a named binary DoD test, machine-checkable ACs, seam + deep-module + tier + version naming, all 12 ❌ assessed, SE-Arch lenses + ADR triggers, and tickable boxes. *Assertion: every story passes the FINAL SELF-AUDIT with H1–H17 = yes.* [Source: Issue Authoring `9VUHxAcoXw` H1–H17]
- [ ] **AC10 — negative: REVISE never overridden.** Given an adversarial review returning `PACK-REVIEW: REVISE`, When findings are posted, Then the pack bounces to a fix pass and is NOT advanced. *Assertion: no Done transition exists while the latest review comment is REVISE.* [Source: P1 `yXUWpQpRjx` §7; SE-Arch `8sYi523i4t`]
- [ ] **AC11 — negative: untagged contract blocks dispatch.** Given a claimed-but-absent tag, When Phase-2 dispatch is attempted, Then it is blocked. *Assertion: `git tag -l` empty ⇒ this pack's DoD gate stays red.* [Source: P1 `yXUWpQpRjx` §4 stage gate]
- [ ] **AC12 — forward-compat.** Given the `studio.staging.*` subdomain, When a future wave extends it, Then it MUST be additive on the ADR-0007 envelope (breaking/reshaping ⇒ ADR + human ratify), never mutating a frozen event/receipt shape. *Assertion: contract change-authority note cites ADR-0008 additive-only lane.* [Source: ADR-0008; Evidence `orvexstudiostaging` §4]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map` §2/§3/§5, evidence `orvexstudiostaging`, and the 3 canonical staging pages (`mOzNDhn322`/`P5R7eCXJA0`/`GOacy9kdJz`) via `docmost-cli page get --no-daemon`. (AC: 1,2)
- [ ] Draft **PRD-delta** in space `orvexstudiostaging` (new draft page), reconciling ADD vs RECONCILE against the canonical spine; cite each line. (AC: 1,2)
- [ ] Raise the **Curator↔Librarian ownership seam** as a review must-resolve block on the pack root draft; do NOT pre-decide. (AC: 8)
- [ ] Author **contract + golden fixtures** in repo `orvex-studio-contracts` (OpenAPI + `studio.staging.*` CloudEvents + `SubmitReceipt`/`ApplyReceipt` + `QUOTA_EXCEEDED`); generate Go stubs + TS clients per ADR-0035. (AC: 3,4,12)
- [ ] Land + **git-TAG** in `orvex-studio-contracts`; confirm fixtures round-trip in contracts CI. (AC: 3,11)
- [ ] Author **test plan** draft (CS §5 tiers + staleness-tolerance apply case). (AC: 5)
- [ ] Author **SDD** draft — full eventual surface, wave-scoping target. (AC: 6)
- [ ] Author **per-agent build prompt** draft with H1–H17 stories, sequencing the FR-STG25 hard-cut against the 4 gating deps. (AC: 7,9)
- [ ] Request **adversarial review** (reviewer ≠ author); on REVISE run a fix pass; tick boxes only when verified; hand to orchestrator. (AC: 8,9,10)

## 4. 🧠 Dev Context

**Inputs table**

| Canon page/slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | Librarian-loop feature set folded into the PRD-delta |
| Map `current-state-map` §2/§3/§5 | Concept-to-service ownership + the Curator↔Librarian + circular-gate seams |
| Evidence `orvexstudiostaging` | `staging_*` surface, receipts, error codes, locked v1 features, blocking 501s |
| Staging canon `mOzNDhn322`/`P5R7eCXJA0`/`GOacy9kdJz` | Existing PRD/arch/addendum spine — RECONCILE, never regenerate |
| ADR-0035 `QbEBPuKcGR` | TS clients for mcp/api satellites off the tag |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance line in the SDD |

- **Space slug:** `orvexstudiostaging`. **Evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudiostaging.md`.
- **Live-repo-wins reconciliation:** where space canon and the deployed `orvex-studio-staging` repo + migration assessment disagree, the repo + assessment win — but note staging is **100% pre-build planning canon** (Evidence §5), so here the canonical spine IS the source; reconcile the brief-delta into it. [Map reconciliation note]
- **Contested seams this pack MUST resolve or flag:**
  - [ ] **Curator↔Librarian** ownership (BFF vs staging) — flag as review must-resolve. [Map §3 risk 9, §5 P1-7]
  - [ ] **Curator classify-path absorption** (AD-12 loud-migration-error at cutover) — record cut sequence, don't silently drop. [Evidence §3]
  - [ ] **`divert-to-workgraph` promotion edge** targets `orvex-studio-workgraph` (renamed from `divert-to-memory`) — pin against the W2 workgraph pack, not the wiki path. [Evidence §3]

**❌ classic-mistakes (CS §0) — all 12 assessed**

| ❌# | Classic mistake (CS §0) | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; the rule binds the build-prompt stories this pack authors (Librarian domain rules land in the owning staging domain package, never the mcp/api handlers), carried by the AC9 seam naming, not a frozen definition artifact. |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — definition-only; the Repository-seam rule binds the build-prompt stories + the Postgres-only store tier the test plan pins (AC5), assessed at build time. |
| ❌#3 | Premature interface / seam | APPLICABLE — binds the port/seam choices this pack pins: the wiki-api write chokepoint is a justified network-seam port, while the in-process Curator↔Librarian ownership seam is raised as a review must-resolve item, not prematurely interfaced (AC3/AC8). |
| ❌#4 | Mocking own packages | NOT APPLICABLE — definition-only; the no-mock-own-packages / real-substitute rule binds the build-prompt stories' test tiers (AC5 store tier via testcontainers, AC9), not the definition artifacts. |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; vertical RED→GREEN slicing binds how the build agent executes the authored stories, not the pack's definition work. |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the contract/schema shapes this pack freezes: only the pinned `staging_*` surface + `SubmitReceipt`/`ApplyReceipt`/`QUOTA_EXCEEDED` shapes the wave needs, never a speculative full schema (AC3/AC4). |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — definition-only; the deletion-test (CS §3.1) rule binds the build-prompt stories' package structure (AD-1: Librarian = domain packages, not a shallow wrapper over the superseded BFF Curator), assessed at build time. |
| ❌#8 | Inline credentialed/IO client | NOT APPLICABLE — definition-only; the inject-at-the-seam / creds-via-env rule binds the build-prompt stories this pack authors (the Librarian LLM + wiki-api clients), not a frozen definition artifact. |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — the contract this pack freezes pins the ADR-0007 CloudEvents envelope so `studio.staging.*` timestamps derive from event payloads, keeping downstream projections deterministic (AC3/AC12). |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/quota + SLO ceilings the SDD freezes: caps stay TBD against ratified ENG-2036 pricing and SLOs stay provisional pending the 100-Proposal benchmark, never self-raised to make CI pass — change needs ADR + human sign-off (AC6). |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; the handlers-hold-routing/marshalling-only rule binds the build-prompt stories this pack authors (mcp/api satellites), not the frozen contract. |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the frozen contract surface: the generated Go + TS clients (ADR-0035) expose concrete typed structs across the exported boundary, with `unknown` as the sanctioned TS scaffold placeholder, no `any` laundering (AC3). |

**SE-Arch lenses (`8sYi523i4t`)** — Reliability: apply-receipt poll-with-tolerance vs ≤45s staleness. Security: deny-by-default agent write surfaces routed only through the wiki-api chokepoint. Cost governance: Librarian LLM spend + quota caps (unresolved → TBD, cite pricing). Operational excellence: FR-STG25 hard-cut sequenced LAST behind non-501 deps. Performance-freshness: provisional SLOs (500ms submit p95 / 5min triage / 15min apply) pending the 100-Proposal benchmark. **ADR triggers expected:** new `studio.staging.*` event subdomain (blocked on the Decision-Records registry), the OPS/Curator supersession ADR, and the service-name ADR.

## 5. 🧪 Verification

- [ ] Review PASS posted (`PACK-REVIEW: PASS`), reviewer ≠ author.
- [ ] Contract tag EXISTS in `orvex-studio-contracts` and fixtures round-trip green in contracts CI (claimed tag ≠ tag).
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT.
- [ ] SDD completeness checked against the concept-to-service map + Evidence §3 locked features.
- [ ] All five artifacts read back as `status=draft` in space `orvexstudiostaging`.

**What NOT to fake:** no self-review; no claimed-but-unverified tag; no SDD trimmed to the wave slice; no invented NFR/SLO numbers (they stay provisional/TBD until the benchmark); no silent Curator↔Librarian ownership choice.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module + design-it-twice on the Curator↔Librarian seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan; Postgres-only store tier), §6 (tier placement binds the build prompt), §7 (seam map — the wiki-api write chokepoint + `divert-to-workgraph` edge), §8, §10, §11, §12 (wiki-first; the pinned contract is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — SDD declares compliance). **NO-MONGO override (D-S12):** event data = Postgres append/outbox tables; strike any Mongo wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` — Phase-1 W2, SDD ruling, certification ruling.
- P1 orchestrator `yXUWpQpRjx` — §3 (five artifacts), §4 (stage gate + Wave 2).
- Brief `rgBOQh31p3` — Librarian loop, autonomy dial, locked pricing.
- Map `current-state-map` — §2 (Librarian loop), §3 (risk 6 circular, risk 9 seams), §5 (P1-7 cutover).
- CS `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12; SE-Arch `8sYi523i4t` (5 lenses).
- ADR-0008 (change-authority) · ADR-0033 `yNFx3YyNap` · ADR-0034 `12aDkq4iOd` · ADR-0035 `QbEBPuKcGR` · Cell contract `JGAUQRsw2g`.
- Evidence: `evidence/orvexstudiostaging.md`; canonical spine `mOzNDhn322`/`P5R7eCXJA0`/`GOacy9kdJz`.

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Staging · **Milestone:** P1 — Definition Factory.
- **Blocked by:** ENG-2037 (Definition Factory Wave 1 — contracts + lib + bridge proof; the tag scheme + pinned seam this pack cites) — ENG id wired at filing.
- **Blocks:** wave2-gate (the Wave-2 umbrella; certification of this pack + the workgraph pack closes it) — symbolic name; ENG id wired at filing.
- **Deferred work born FROM this pack (not before it):** the Librarian/Card-migration epic + `staging_*` build stories are authored here (zero exist today) and executed in Phase 2; per-service P1 milestone creation is a batched human/Linear-MCP dependency escalated by the orchestrator; caps/pricing shapes are TBD — defined by the ratified ENG-2036 billing values.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** Todo→In Progress; post agent + model; claim arbiter per ADR-0033 `yNFx3YyNap`. 2. **PLAN** comment (artifact order + the seams to resolve). 3. **PROGRESS** comments as each artifact is drafted/landed + any blocker (the circular-gate deps). 4. **COMMITS:** every commit/PR body carries **"Part of ENG-NNN"** (links, never closes) — one PR per touched repo (`orvex-studio-contracts`; wiki drafts via `doc-amend`). 5. **STAGE HANDOFF** author→review. 6. **REVIEW:** reviewer posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden. 7. **TICK** boxes only when genuinely verified (full-body read-modify-write). 8. **DONE:** ONLY the delivery orchestrator advances — the author CANNOT self-advance (fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
