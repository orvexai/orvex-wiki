## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-contracts` so that build stories dispatch only against a frozen, reviewed, git-TAGGED contract — the one pinned seam every satellite conforms to. This is **Wave 1, the seam that gates everything**: no downstream pack can freeze until the contract TAG naming scheme, the change-authority ruling, and the ratified entitlement/cap shapes live here. [Plan 5eFdxN3edd §Phase-1 W1] [P1 yXUWpQpRjx §4 W1]

**Definition of Done — the binary gate** (the pack analog of the named DoD test; red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch 8sYi523i4t §Done-gates]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED** (first tag cut under the new scheme); fixtures round-trip green in contracts CI — *machine check: `git tag -l` is non-empty for this service's tag and the contracts CI run is green on the tag commit* [P1 yXUWpQpRjx §3 artifact 2]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudiocontracts` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft for PRD-delta, contract-summary, test-plan, SDD, build-prompt* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body carries a completed H1–H17 self-audit block with no "no"*
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-1 slice — *machine check: SDD enumerates full seam surface incl. all six OpenAPI files, CloudEvents catalog, SSE wire contract, error/exit-code vocab, cell-lint compliance* [Map current-state-map §2]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the brief `rgBOQh31p3` and the concept-to-service map, When the PRD-delta is authored, Then every added FR/NFR for the contracts seam is cited and reconciled against the *deployed* repo (not stale canon), and contested ownership seams are flagged as review must-resolve items, never silently chosen — *machine check: PRD-delta draft exists and each FR/NFR line carries a `[Brief …]` or `[Map …]` cite; ≥1 must-resolve item present* [Brief rgBOQh31p3] [Map current-state-map §2]
- [ ] **AC2 (Pinned Apache-2.0 seam)** — Given the authored-never-generated rule, When the pack defines the seam, Then self-validation CI (`validate.yaml`, "the only executable surface") and the AGPL-import guard (`gates/agpl-import/`) are specified as v0.1 blocking keystones with the authored-not-generated provenance guard — *machine check: contract-summary + build-prompt name `validate.yaml` and `gates/agpl-import/` with pass conditions* [P1 yXUWpQpRjx §4 W1] [Map orvexstudiocontracts §5]
- [ ] **AC3 (Change-authority = ADR-0008)** — Given the HIGH unresolved change-authority contradiction (canon "no human ratify" vs CS §9), When the pack freezes governance, Then the contract cites **ADR-0008** (additive → automated lane; breaking/envelope-reshaping → ADR + human ratify), superseding the never-filed ADR-0001 — *machine check: contract-summary + SDD cite ADR-0008 as change-authority; no live reference to ADR-0001 as the arbiter* [ADR-0008] [Map orvexstudiocontracts §6]
- [ ] **AC4 (Absorb ENG-2036 entitlement/cap shapes)** — Given ENG-2036 pricing supersessions landed in the billing (`Blcvui4UIn`) and ai (`pbKI3BpQmY`) PRDs, When the contract is frozen, Then the deferred entitlement/cap contract shapes are absorbed here matching the ratified pricing (Free/£7 Personal quotas locked; Teams/Enterprise deferred as OQ-C9) **before any consumer freezes** — *machine check: contract carries entitlement/cap component schemas citing the ratified billing+ai PRDs; Teams/Enterprise values marked "TBD — defined by billing (OQ-C9)"* [program-status §3/§4] [Map orvexstudiocontracts §3 D-S7]
- [ ] **AC5 (TAG scheme + first tag + TS-client codegen)** — Given no VERSION/CHANGELOG/git tag exists today, When the contract lands, Then the pack **defines the contract TAG naming scheme, cuts the first tag**, and wires TS-client generation per ADR-0035 into the tag pipeline (TS clients for api/mcp/ui, Go stubs for Go satellites) — *machine check: `git tag -l` non-empty; tag pipeline emits both TS clients and Go stubs; scheme documented in contract-summary* [ADR-0035 QbEBPuKcGR] [P1 yXUWpQpRjx §3 artifact 2]
- [ ] **AC6 (Reconciliation — live repo wins)** — Given canon reads "~90% unbuilt" but the live repo is real + mature (OpenAPI per service, golden fixtures, working `cell-lint.yml`), When the PRD-delta reconciles, Then it is written against the *deployed artifact* at the current clone, and stale-canon deltas (missing `version` field, K5/ask dual-home, flat-vs-per-cell `servers:` block) are named as reconciliation items — *machine check: PRD-delta reconciliation section lists the deployed-vs-canon deltas from the evidence digest* [P1 yXUWpQpRjx §2 reconciliation note] [Map orvexstudiocontracts §4/§6]
- [ ] **AC7 (Test plan)** — Given CS §5 tiers, When the test plan is authored, Then it defines unit / store / contract (fixture round-trip in CI) / crew-slot / family-E2E split; UI tier = NOT APPLICABLE (pure-artifact repo, no UI surface) stated explicitly — *machine check: test-plan draft names all five tiers with the contract tier = golden-fixture round-trip; UI tier explicitly marked NOT APPLICABLE* [CS §5]
- [ ] **AC8 (SDD completeness)** — Given the SDD is the everything-eventually-needed list, When authored, Then it covers the full seam: six OpenAPI 3.1 files, CloudEvents 1.0 catalog (ADR-0007 envelope / ADR-0010 `studio.*`), SSE wire contract, ~58-code errorCode + CLI 0–9 exit-code vocab, source-adapter registry, shared principal/token schemas, golden+DfM fixtures (21-embed catalog), `SEAMS.md` seam inventory, cell-lint compliance — *machine check: SDD line-count covers each named surface with an evidence pointer* [P1 yXUWpQpRjx §3 artifact 4] [Map orvexstudiocontracts §4]
- [ ] **AC9 (Build prompt — zero architecture decisions)** — Given the isolated build agent, When the build prompt is authored, Then its stories meet the full 9-section H1–H17 standard of `9VUHxAcoXw` and leave the build agent **zero architecture decisions** (contract shapes, tag scheme, seam boundaries all pinned) — *machine check: build-prompt stories pass the FINAL SELF-AUDIT; no story defers a contract-shape or seam choice to the builder* [Issue-Authoring 9VUHxAcoXw H4]
- [ ] **AC10 (Negative — untagged blocks dispatch)** — Given a contract with no git tag, When Phase-2 attempts dispatch, Then dispatch is refused — *machine check: SDD + build-prompt state "no story dispatches against an untagged contract"; the tag is the sole build authorization* [P1 yXUWpQpRjx §4]
- [ ] **AC11 (Negative — REVISE never overridden)** — Given a `PACK-REVIEW: REVISE` verdict, When the author responds, Then it bounces to a fix pass and re-review; it is never overridden and the author never self-advances — *machine check: no Done advance without a `PACK-REVIEW: PASS` comment; author is not the actor on the Done transition* [SE-Arch 8sYi523i4t] [Issue-Authoring 9VUHxAcoXw H14/H15]
- [ ] **AC12 (Forward-compat — additive-only downstream)** — Given a future wave adds to this seam, When it changes the contract, Then additive changes take the automated lane and any breaking/envelope-reshaping change requires an ADR + human ratify; the `version` field on every event schema is load-bearing and must NOT regress — *machine check: change-authority + `version`-required rule are asserted in the SDD as forward-compat invariants* [ADR-0008] [Map orvexstudiocontracts §6]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: plan `5eFdxN3edd`, P1 `yXUWpQpRjx`, brief `rgBOQh31p3`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, ADR-0008, ADR-0035 `QbEBPuKcGR`, cell contract `JGAUQRsw2g`, evidence digest `orvexstudiocontracts.md` (AC: 1,6)
- [ ] Clone `orvex-studio-contracts` at HEAD; inventory deployed artifacts (OpenAPI files, `cell-lint.yml`, `events/catalog.yaml`, component schemas) — repo wins over canon (AC: 6)
- [ ] Draft **PRD-delta** in space `orvexstudiocontracts` (page `prd-delta`), reconciled; flag contested seams (OQ-C1 ownership, K5/ask home, flat-vs-per-cell) as must-resolve (AC: 1,6)
- [ ] Author **contract**: define TAG naming scheme; absorb ENG-2036 entitlement/cap shapes; add `validate.yaml` + AGPL-import guard specs; land golden fixtures; commit to `orvex-studio-contracts` (AC: 2,4,5)
- [ ] Wire TS-client + Go-stub generation into the tag pipeline per ADR-0035; **cut the first tag**; confirm fixtures round-trip in contracts CI (AC: 5)
- [ ] Draft **contract-summary** (page `contract-summary`) in space `orvexstudiocontracts` — document the TAG naming scheme, `validate.yaml` + AGPL-import guard pass conditions, ADR-0008 change-authority, and the ENG-2036 entitlement/cap component schemas (AC: 2,3,4,5)
- [ ] Draft **test plan** (page `test-plan`) — five CS §5 tiers, contract tier = fixture round-trip; UI tier NOT APPLICABLE (AC: 7)
- [ ] Draft **SDD** (page `sdd`) — full seam surface, cell-lint compliance, change-authority = ADR-0008 (AC: 3,8,12)
- [ ] Author **build prompt** (page `build-prompt`) with stories to the 9-section H1–H17 standard; run FINAL SELF-AUDIT (AC: 9)
- [ ] Request **adversarial review** (reviewer ≠ author); if `REVISE`, run fix pass and re-review (AC: 11)
- [ ] Tick boxes only on genuine verification; hand to the delivery orchestrator for the Done advance (author cannot self-advance)

## 4. 🧠 Dev Context

**Inputs**

| Canon page / slug | What it feeds |
| --- | --- |
| Brief `rgBOQh31p3` | Feature deltas the PRD-delta folds in |
| Plan `5eFdxN3edd` | Wave-1 gate role; SDD ruling |
| P1 `yXUWpQpRjx` | Five-artifact shape; stage gate; TAG-as-dispatch |
| ADR-0008 | Contracts change-authority (arbiter) |
| ADR-0035 `QbEBPuKcGR` | Go↔TS client codegen wired into tag pipeline |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance declaration |
| billing PRD `Blcvui4UIn` / ai PRD `pbKI3BpQmY` | Ratified ENG-2036 entitlement/cap values |
| Evidence `orvexstudiocontracts.md` | Deployed-vs-canon reconciliation facts |

- **Space slug:** `orvexstudiocontracts` · **Evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudiocontracts.md` · **Repo:** `orvex-studio-contracts`.
- **Live-repo-wins:** the repo + migration assessment outrank the space's "~90% unbuilt" canon; reconcile the PRD-delta against the deployed artifact. [P1 yXUWpQpRjx §2]

**Contested seams this pack MUST resolve or flag**

- [ ] Change-authority contradiction (canon "no human ratify" vs CS §9) → **resolve** by citing ADR-0008. [Map orvexstudiocontracts §6]
- [ ] Repo ownership/maintainer model (OQ-C1) — the named chokepoint (6+ repos block on this repo's PR SLA) → **flag** for review; owner = "TBD — defined by PO". [Map orvexstudiocontracts §6]
- [ ] K5/`ask` dual-home (wiki-api shipped proxy vs designed `ai.yaml` owner) → **flag**; repo needs deprecation markers. [Map orvexstudiocontracts §6]

**❌ classic-mistakes (CS §0) — all 12 assessed**

| # | Mistake | Assessment |
| --- | --- | --- |
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only, no runtime code authored; this row binds the build-prompt stories this pack authors (their handlers must stay logic-free). |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — definition-only, no store access here; binds the build-prompt stories (Repository seam), not the contract-only repo. |
| ❌#3 | Premature interface / seam | APPLICABLE — this pack pins the family's network seam (six OpenAPI files); a port IS justified at that network seam, but guard the pinned seam choices against inventing any in-process interface before ≥2 real implementations. |
| ❌#4 | Mocking own packages | NOT APPLICABLE — definition-only, no tests authored; binds the test-plan tiers + build-prompt stories (test through the exported interface with real/in-memory substitutes). |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; the vertical RED→GREEN tracer-bullet rule binds the build-prompt stories this pack authors. |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — directly binds the contract/schema shapes this pack freezes; freeze only the fields the current seam needs per the SDD justification — no speculative event/entitlement fields. |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — definition-only, no package authored; the deletion test (CS §3.1) binds the build-prompt stories. |
| ❌#8 | Inline credentialed/IO client | NOT APPLICABLE — definition-only, no runtime client; binds the build-prompt stories (clients injected at the seam; credentials via env only). |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — binds the CloudEvents envelope this pack freezes: timestamps must be payload-sourced fields so downstream projections stay deterministic, never projection-time-derived. |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/cap shapes; the Free/£7 Personal quotas are human-ratified (ENG-2036) ceilings — the frozen caps must match the ratified pricing and Teams/Enterprise stay TBD (OQ-C9), never invented to pass a check. |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; binds the build-prompt stories this pack authors (handlers hold routing + marshalling only). |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the contract shapes: exported surfaces (incl. generated TS clients / Go stubs) carry concrete typed structs; `unknown` is the only sanctioned TS placeholder — no `any` laundering across the frozen seam. |

**SE-Arch lenses (all 5)**

- **Reliability** — fixture round-trip + the `version`-required event-schema guard prevent silent drift.
- **Security** — the AGPL-import guard + authored-not-generated provenance attestation keep engine-derived artifacts out.
- **Cost governance** — the entitlement/cap shapes encode the ratified ENG-2036 caps at the seam.
- **Operational excellence** — `validate.yaml` is the only executable surface; `SEAMS.md` is the declared health metric (NFR-C4).
- **Performance-freshness** — NOT APPLICABLE at definition time; flagged for the build prompt.

**ADR triggers this pack is expected to fire:** change-authority ruling (ADR-0008 cite, supersedes ADR-0001); the new contract TAG naming scheme; any topic-schema / envelope reshape → ADR + human ratify per ADR-0008.

## 5. 🧪 Verification

- [ ] Review PASS comment (`PACK-REVIEW: PASS`) exists, reviewer ≠ author.
- [ ] `git tag -l` non-empty for this service's tag; fixtures round-trip green in contracts CI.
- [ ] All five artifact drafts return status=draft via `docmost-cli page get --no-daemon`.
- [ ] Build-prompt stories pass the H1–H17 FINAL SELF-AUDIT.
- [ ] SDD completeness check against the concept-to-service map (every eventual-need line present).

**What NOT to fake:**

- No self-review (reviewer ≠ author, non-overridable).
- No claimed-but-unverified tag (a claimed tag is not a tag — verify it exists and its fixtures round-trip).
- No SDD trimmed to the Wave-1 slice.
- No invented NFR/quota numbers (Teams/Enterprise = "TBD — defined by billing").
- No Mongo wording for event data (Postgres append/outbox only, D-S12).

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 mistakes), §3 (deep-module + design-it-twice on any new seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan tiers), §6 (tier placement binds the build prompt), §7 (seam map — this contract pins the family's six OpenAPI seams), §8, §10, §11, §12 (wiki-first; pinned contracts are contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — declare compliance; note the known `peer-url-literals` OpenAPI-`servers:` blind spot). **NO-MONGO override (D-S12):** event data = Postgres append/outbox tables; strike any Mongo wording. Change-authority = ADR-0008, not the never-filed ADR-0001.

## 7. 🔗 References

- Plan `5eFdxN3edd` §Phase-1 W1 · P1 orchestrator `yXUWpQpRjx` §2–§4 · Brief `rgBOQh31p3`
- CS `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12 · SE-Arch `8sYi523i4t` (5 lenses + Done gates) · Issue-Authoring `9VUHxAcoXw` H1–H17
- ADR-0008 (change-authority) · ADR-0035 `QbEBPuKcGR` (Go↔TS bridge) · Cell contract `JGAUQRsw2g`
- billing PRD `Blcvui4UIn` · ai PRD `pbKI3BpQmY` · Evidence `orvexstudiocontracts.md` · program-status §3/§4

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Contracts · **Milestone:** P1 — Definition Factory.
- **Blocked by:** none (Wave 1, ready now once the entry-criteria ADRs ratify).
- **Blocks:** `bridge-proof` (Go↔TS proof-on-one-seam needs this TAG + codegen pipeline) · `ENG-2037` (Definition Factory Wave 1 gate).
- **Deferred work born FROM this pack:** per-service contract-freeze stories (later waves consume this seam); Teams/Enterprise quota values (OQ-C9, owner = billing); repo maintainer/ownership decision (OQ-C1, owner = PO). Story-level issues are born from this pack, not before it.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; resolve concurrent claims via the ADR-0033 claim arbiter. 2. **PLAN comment** — the artifact order + reconciliation approach. 3. **PROGRESS comments** — one per artifact drafted/landed + any blocker. 4. **COMMITS** — every commit/PR body carries "Part of ENG-NNN" (links, never closes; Done is gate-owned). 5. **STAGE HANDOFF** author→review. 6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass. 7. **TICK** boxes only on genuine verification (full-body read-modify-write; preserve every other byte). 8. **DONE** — ONLY the delivery orchestrator advances; the author CANNOT self-advance (fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
