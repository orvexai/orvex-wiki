## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-lib` so that build stories dispatch only against a frozen, reviewed contract — with **zero architecture decisions left to the build agent** (that is what this pack is FOR). `orvex-studio-lib` is the shared Go library every closed satellite imports so no satellite reimplements the security ceiling (dual-IdP verifier + deny-by-default scope enforcement), the CloudEvents envelope helpers, the fail-closed typed clients, or the clean-room Go DfM serializer; it ships as versioned git tags, has no HTTP API of its own, and today is a 52-byte scaffold that blocks every Go satellite [Evidence orvexstudiolib §1/§5]. Contract adaptation for a pure library is stated explicitly in §2/§5, not faked as HTTP surface.

**Definition of Done — the binary gate** (all-or-nothing; red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [Source: P1 yXUWpQpRjx §4 stage gate]
- [ ] The `orvex-studio-contracts` tag this pack pins is landed + git-TAGGED and lib's `gen/` trees round-trip its fixtures in CI; **and lib's own `v0.x` release tag is cut** — *machine check: `git tag -l` non-empty in `orvex-studio-contracts` for the pinned tag AND in `orvex-studio-lib`; contracts CI green on the tag commit* [Source: ADR-0035 QbEBPuKcGR; Evidence orvexstudiolib §4]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudiolib` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [Source: P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each build story body has every completable line as `- [ ]` and a named binary DoD test* [Source: Issue Authoring 9VUHxAcoXw H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable across all ten packages), not just the Wave-1 slice — *machine check: SDD enumerates all 10 `pkg/*` topology entries against the concept-to-service map* [Source: Plan 5eFdxN3edd Phase-1 SDD ruling]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief and concept-to-service map, When the reconciled PRD-delta is drafted, Then every added FR/NFR is cited to brief or map and the draft PRD's three stale surfaces (principal shape, envelope helper, Redis→Kafka framing) are corrected to the audit-tightened language. *Assertion: the PRD-delta draft contains no `Redis→Kafka` bridge wording and cites the SE-Arch audit fix.* [Source: Brief rgBOQh31p3; Evidence orvexstudiolib §6]
- [ ] **AC2 (contract — adapted)** — Given lib has no HTTP surface, When the "frozen contract" artifact is authored, Then it pins (a) the `orvex-studio-contracts` release tag lib's `gen/` trees are generated from, (b) lib's own internal step-API server contract shape, (c) the `pkg/dfm` four-function surface, and (d) lib's `v0.x` release tag. *Assertion: the contract artifact names a contracts tag AND a lib tag; hand-editing `gen/` fails the CI regen-diff.* [Source: ADR-0035 QbEBPuKcGR; Evidence orvexstudiolib §4]
- [ ] **AC3 (test plan)** — Given CS §5 tiers, When the test plan is authored, Then it splits unit / store / contract (fixture round-trip) / crew-slot / family-E2E with the `pkg/dfm` FR-L28 parity gate and the FR-L27 provenance audit as named blockers. *Assertion: the plan lists the DfM parity corpus target = all 21 engine embeds (not the inadequate 6).* [Source: CS §5; Evidence orvexstudiolib §6]
- [ ] **AC4 (SDD)** — Given the ten-package topology, When the SDD is authored, Then every eventual need (full package surface, events consumed, entitlement fail-closed reads, cell-lint + tenancy compliance, obs+SLOs, all tiers, runbook, family-E2E) is present. *Assertion: SDD covers all 10 `pkg/*` entries and declares compliance with the 14-rule cell-lint.* [Source: Plan 5eFdxN3edd Phase-1 SDD ruling; Cell JGAUQRsw2g]
- [ ] **AC5 (build prompt)** — Given `9VUHxAcoXw`, When the per-agent build prompt is authored, Then its stories carry a named binary DoD test, machine-checkable ACs, seam/deep-module/tiers/versions, all 12 ❌ assessed, SE-Arch lenses + ADR triggers, and RED→GREEN tasks. *Assertion: build-prompt story bodies pass the FINAL SELF-AUDIT with H1–H17 all "yes".* [Source: Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] **AC6 (must-carry: MultiIssuerVerifier)** — Given the deny-by-default verifier is a 52-byte scaffold blocking every Go satellite, When the pack is authored, Then the MultiIssuerVerifier build plan names the JWKS/issuer-registry source (OQ-L1 assumed identity mirror) and the token-audience model (OQ-L7), or writes each **TBD — defined by the identity pack** where canon has no value. *Assertion: `pkg/auth` build plan names a concrete JWKS source or an explicit TBD-owner.* [Source: Map current-state-map §5 P0-4; Evidence orvexstudiolib §3]
- [ ] **AC7 (must-carry: module layout + toolchain)** — Given OQ-L2/OQ-L3 are open, When the pack freezes the module layout, Then single-vs-per-package Go module (OQ-L2) and the codegen generator toolchain (OQ-L3) are decided (mini-ADR only if pack review demands one). *Assertion: the pack states exactly one module strategy and one generator toolchain, each cited or TBD-owned.* [Source: P1 yXUWpQpRjx Wave-1; Evidence orvexstudiolib §3]
- [ ] **AC8 (must-carry: `gen/` layout)** — Given ENG-2037 DoD, When the codegen layout is defined, Then the `gen/`-suffixed tree for contracts-generated Go stubs is specified, pinned to a contracts release tag, and CI regen-diff gated. *Assertion: the pack names the `gen/` path and asserts hand-edited `gen/` code cannot land.* [Source: ENG-2037 DoD; Evidence orvexstudiolib §4]
- [ ] **AC9 (must-carry: `pkg/dfm` AGPL boundary)** — Given the AGPL clean-room mandate, When `pkg/dfm` is defined, Then it is the SANCTIONED satellite path to DfM (four functions `PMToDfM`/`DfMToPM`/`MarkdownToPM`/`MarkdownToDfM`) written only from documented schema, and closed satellites NEVER import the AGPL TS package. *Assertion: the SDD forbids any AGPL TS import and gates `pkg/dfm` behind the FR-L27 provenance audit.* [Source: project-context A-SEAMS; Evidence orvexstudiolib §3]
- [ ] **AC10 (negative — review non-override)** — Given a `PACK-REVIEW: REVISE`, When the author receives it, Then it bounces to a fix pass and is never overridden or self-advanced. *Assertion: no `PACK-REVIEW: PASS` may be posted by the authoring agent identity.* [Source: SE-Arch 8sYi523i4t; P1 yXUWpQpRjx §7]
- [ ] **AC11 (negative — untagged blocks dispatch)** — Given an untagged or fixture-failing contract, When Phase-2 dispatch is attempted, Then it is blocked. *Assertion: a claimed-but-absent tag (`git tag -l` empty) blocks the DoD gate.* [Source: Plan 5eFdxN3edd Phase-1 certification]
- [ ] **AC12 (forward-compat)** — Given later-wave packages (`pkg/billingclient`, `pkg/dfm`, `authtest`, `gen/` trees) land after v0.x, When they land, Then they MUST NOT break the frozen envelope helpers, the frozen `orvexcell` extension, or the frozen step-API error taxonomy. *Assertion: a future additive change routes to ADR-0008's automated lane; any envelope/cell reshaping requires an ADR + human ratify.* [Source: ADR-0008; Cell JGAUQRsw2g]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map §2/§5`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, cell contract `JGAUQRsw2g`, evidence `orvexstudiolib.md` (AC: 1–12)
- [ ] Draft **PRD-delta** into space `orvexstudiolib` (target page `orvex-studio-lib — PRD-delta`); correct the three stale PRD surfaces (AC: 1)
- [ ] Resolve/flag contested seams: the lib-vs-contracts cell-helper ownership contradiction (canon roster vs cell §5 vs CS §6) → flag as review must-resolve, do not silently choose (AC: 1, 9)
- [ ] Author **contract artifact** — pin the `orvex-studio-contracts` tag lib's `gen/` generates from; define `gen/` layout + regen-diff CI; specify step-API server contract + `pkg/dfm` four-function surface (repo paths: `orvex-studio-contracts` fixtures, `orvex-studio-lib/gen/`) (AC: 2, 8, 9)
- [ ] Land + **git-TAG** the pinned contracts tag; cut lib's `v0.x` tag; confirm fixtures round-trip in contracts CI (AC: 2, 11)
- [ ] Author **test plan** page (unit/store/contract/crew-slot/family-E2E; DfM parity corpus = 21 embeds; FR-L27 audit gate) (AC: 3)
- [ ] Author **SDD** page — all ten `pkg/*` eventual needs + cell-lint compliance + obs/SLOs + runbook (AC: 4)
- [ ] Author **build prompt** with 9-section H1–H17 stories: MultiIssuerVerifier (`pkg/auth`), module-layout/toolchain decision, `gen/` codegen, `pkg/dfm` clean-room build (AC: 5, 6, 7, 8, 9)
- [ ] Request **adversarial review** (reviewer ≠ author); on REVISE run a fix pass, re-request (AC: 10)
- [ ] Tick verified boxes only; hand to the delivery orchestrator for the Done advance (AC: all)

## 4. 🧠 Dev Context

**Inputs table**

| Canon page / slug | What it feeds in this pack |
|---|---|
| Brief `rgBOQh31p3` | new features folded into the PRD-delta |
| Map `current-state-map` §2/§5 | concept-to-service map + P0-4 verifier blocker |
| Evidence `orvexstudiolib.md` | ten-package topology, cell apparatus, DfM clean-room, OQ-L1..L7 |
| CS `6aMAzsYeQb` | tier placement, mocking, seam map for the test plan |
| SE-Arch `8sYi523i4t` | five adversarial review lenses + fake-done gates |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance declaration |
| ADR-0035 `QbEBPuKcGR` | Go stubs + TS-client bridge → why `gen/` exists |

- **Wiki space slug:** `orvexstudiolib`. **Per-space evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudiolib.md`.
- **Live-repo-wins reconciliation:** the repo (`c1bd0dd`, 52-byte `go.mod`, no CI, no tests) and the migration assessment outrank stale space canon; the wiki documents evolved design intent ahead of implementation — reconcile the PRD-delta against the deployed artifact, not the "~90% unbuilt" canon read [Source: Map current-state-map reconciliation note].

**Contested seams this pack MUST resolve or flag (must-resolve items):**

- [ ] Cell-helper ownership: canon roster says `lib` owns cell claim/envelope helpers, cell contract §5 phrases them in `contracts`, CS §6 makes contracts schema-only → flag for review, working split = lib owns runtime Go helpers, contracts owns wire schema/fixtures/cell-lint [Source: Evidence orvexstudiolib §6]
- [ ] OQ-L3 codegen contradiction: contracts D-CON-2 says "codegen is a build step in each consumer" vs lib's stance that satellites only import lib's `gen/` → resolve before freezing [Source: Evidence orvexstudiolib §6]

**❌ classic-mistakes (CS §0) — all 12 assessed:**

| ❌# | Canonical name | Assessment for this unit |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; binds the `pkg/*` build-prompt stories this pack authors (lib is a pure library with no `cmd/` per CS §6), not the pack's own artifacts |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — lib ships no store/persistence layer (event data = Postgres append/outbox owned by the engine); there is no Repository seam in this unit |
| ❌#3 | Premature interface / seam | APPLICABLE — binds the port/seam choices the pack pins: the ten-package topology + the lib/contracts cell-helper split; a port IS justified at the network seams the typed clients cross |
| ❌#4 | Mocking own packages | APPLICABLE — binds the test plan this pack authors: each `pkg/*` is tested through its exported interface with a real/in-memory substitute, never a mock of lib's own packages |
| ❌#5 | Horizontal slicing (all tests, then all code) | APPLICABLE — binds the build-prompt stories this pack authors: vertical RED→GREEN tracer bullets required (AC5), no test-then-code batching |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the contract/schema shapes this pack freezes: the envelope + `orvexcell` extension + step-API error taxonomy carry only the fields the current Issue needs |
| ❌#7 | Shallow pass-through package | APPLICABLE — binds the ten-package topology: each `pkg/*` must survive the deletion test (CS §3.1); fail-closed clients grow method-by-method, no god-client pass-through |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — binds the typed clients this pack specs: configured clients injected at the seam, credentials via env only (`billingclient`, identity/JWKS clients) |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — lib ships no projection/read-model layer (projections live in the engine/satellites); `pkg/dfm` determinism is covered by the FR-L28 parity gate, not this row |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/cap shapes: `billingclient` fail-closed entitlement/quota reads (402 `QUOTA_EXCEEDED` typed terminal); ceilings stay human-ratified (AC12 routes any reshaping to ADR + human ratify) |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; binds the `pkg/*` build-prompt stories' handlers (routing + marshalling only); lib is a pure library with no `cmd/` |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the frozen contract surfaces: concrete typed structs across exported `pkg/*` surfaces and the `gen/` trees; no `interface{}` laundering across the typed-client seams |

**SE-Arch lenses (all 5):** reliability — fail-closed clients + cell-guard 421 fail closed on mismatch. security — deny-by-default MultiIssuerVerifier is the family ceiling; AGPL clean-room boundary on `pkg/dfm`. cost governance — `billingclient` fail-closed entitlement reads; no frontier default. operational excellence — `pkg/obs` Kafka-first plumbing + `CELL_ID`/`CLUSTER_NAME` `/healthz` echo. performance-freshness — DfM parity gate + knowledge delta cursors. **ADR triggers this pack fires:** A-VERIFY-IMPL, A-DEPS, A-DFM, A-CELL, A-VERSION, OQ-L5 closure — each blocked on the Studio ADR registry standing up (**TBD — defined by the Studio Act-1 run**) [Source: Evidence orvexstudiolib §6].

## 5. 🧪 Verification

- [ ] Adversarial review returns `PACK-REVIEW: PASS` (reviewer ≠ author) — live-read of the wiki drafts, not the cache
- [ ] Pinned contracts tag EXISTS and its fixtures round-trip in contracts CI; lib `v0.x` tag cut
- [ ] All five artifacts are status=draft in space `orvexstudiolib`
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT
- [ ] SDD completeness checked against the concept-to-service map (all 10 packages)

**What NOT to fake** (plain bullets):
- No self-review — the author identity may never post `PACK-REVIEW: PASS`.
- No claimed-but-unverified tag — a tag is verified by `git tag -l`, not asserted.
- No SDD trimmed to the Wave-1 slice — every eventual-need line or it is not Done.
- No invented NFR numbers — write **TBD — defined by <owner>** where canon has none (SLOs, token-audience model, JWKS source).

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module + design-it-twice on any NEW seam — the lib/contracts cell split), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan), §6 (tier placement — lib is a pure library, no `cmd/`), §7 (seam map — name the ten `pkg/*` seams this lib pins), §8, §10, §11, §12 (wiki-first; the pinned contracts tag is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — `cell`/`cell_epoch` claim wire-names, cell-guard 421, `orvexcell` extension). **NO-MONGO override (D-S12):** event data = Postgres append/outbox → engine outbox→relay→Kafka is the sole event path; strike any Mongo or Redis-Streams wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` — Phase-1 Definition Factory; SDD ruling; certification gate
- Phase-1 orchestrator `yXUWpQpRjx` — §3 five artifacts; §4 stage gate; Wave-1 lib row
- Umbrella brief `rgBOQh31p3` — new features folded into the PRD-delta
- Coding Standards `6aMAzsYeQb` — §0, §3, §4, §5, §6, §7, §12
- SE-Arch review `8sYi523i4t` — five lenses + fake-done gates
- Issue Authoring `9VUHxAcoXw` — H1–H17 build-story standard
- ADR-0035 `QbEBPuKcGR` (Go↔TS bridge) · ADR-0033 `yNFx3YyNap` · ADR-0034 `12aDkq4iOd` · ADR-0008 (contracts change-authority)
- Cell + tenancy contract `JGAUQRsw2g` — 14-rule cell-lint
- Evidence: `evidence/orvexstudiolib.md`, `evidence/current-state-map.md` §5 P0-4, `evidence/migration-assessment.md`

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Lib · **Milestone:** P1 — Definition Factory (Wave 1)
- **Blocked by:** none (entry-criteria ADR ratify is a phase-level gate, not a unit blocker)
- **Blocks:** `bridge-proof` (Go↔TS bridge proof-on-one-seam — needs lib's generated Go stub + `gen/` layout), `ENG-2037` (Definition Factory Wave 1) — symbolic; ENG ids wired at filing
- **Deferred work (born FROM this pack, not before it):** the per-`pkg/*` build stories (Phase 2, owned by the isolated build agent); the six draft ADRs (A-VERIFY-IMPL/A-DEPS/A-DFM/A-CELL/A-VERSION/OQ-L5) — owner: Studio ADR registry once stood up; the DfM parity corpus expansion to 21 embeds — owner: wiki-api Phase-1 exit

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; resolve concurrent claims per ADR-0033 (`yNFx3YyNap`).
2. **PLAN comment** — the artifact order + seams to resolve.
3. **PROGRESS comments** — one per artifact drafted/landed + any blocker (e.g. ADR-registry gap).
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes); one PR per touched repo (`orvex-studio-contracts`, `orvex-studio-lib`) — the per-repo PR gate is the merge authority.
5. **STAGE HANDOFF** author→review.
6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** boxes only when genuinely verified (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances; the author CANNOT self-advance (fake-done gate).
9. **ESCALATIONS** as comments; judgment calls logged to `po-decisions/` under `flock` + a ticket comment "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
