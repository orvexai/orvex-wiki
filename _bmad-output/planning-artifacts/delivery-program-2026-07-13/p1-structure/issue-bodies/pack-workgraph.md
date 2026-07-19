## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Service Definition Pack for `orvex-studio-workgraph` so that build stories dispatch only against a frozen, reviewed contract — the multi-agent work-graph coordination kernel, whose repo has **zero tickets today** and whose epics AND stories are born from this pack. [P1 `yXUWpQpRjx` §4 Wave 2] [Map current-state-map §1]

This is a Wave-2 pack: `orvex-studio-workgraph` is pre-build (planning canon only, no repo state). The three canonical space pages — `Kgp6JT3IOR` (Architecture), `2KrwsvY5zL` (PRD), `bnbRUdCm6R` (PRD Addendum), landed 2026-07-12 — are **reconciled, never regenerated**. [Map current-state-map §1] [Evidence orvexstudioworkgraph §2]

### Definition of Done — the binary gate

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [Source: P1 `yXUWpQpRjx` §4 stage gate; SE-Arch `8sYi523i4t`]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI run green on the tag commit* [Source: P1 `yXUWpQpRjx` §3(2); ADR-0008]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioworkgraph` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [Source: brief authoring §; P1 `yXUWpQpRjx` §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body 100% `[ ]`-shaped per H17, self-audit block present* [Source: `9VUHxAcoXw` H1–H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the wave slice — *machine check: SDD enumerates full API surface, events produced/consumed, entitlement/quota, cell-lint, obs+SLOs, all test tiers, runbook, family-E2E* [Source: P1 `yXUWpQpRjx` §3(4)]

Red on any = NOT done, no override.

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the brief `rgBOQh31p3` and the concept-to-service map, When the PRD-delta drafts, Then every added FR/NFR the brief folds into the work-graph kernel is cited and reconciled against the canonical PRD (`2KrwsvY5zL`) + Addendum (`bnbRUdCm6R`), reconciling against them (not superseding). *Assertion: zero PRD-delta FR/NFR lines lack a `[Brief …]` or `[Map …]` cite.* [Source: Brief `rgBOQh31p3`; Map current-state-map §2]
- [ ] **AC2 (kernel scope)** — Given the mandate "blackboard coordination kernel" (prime/ready/recall/search/stats/handoff/grants/batch verbs; agents log work, discover context, claim/hand off), When the SDD scopes the service, Then the full multi-agent work-graph coordination surface is enumerated as the eventual-need target, not a wave slice. *Assertion: SDD lists all sync verbs from the canonical contract surface (prime, ready, recall, search, stats, handoff, grants, batch).* [Source: P1 `yXUWpQpRjx` §4 W2; Evidence orvexstudioworkgraph §4]
- [ ] **AC3 (frozen contract)** — Given ADR-0007 envelope + ADR-0010 taxonomy, When the contract lands in `orvex-studio-contracts`, Then it declares the `studio.workgraph.<resource>.<past-tense>` CloudEvents subdomain (additive, distinct from reserved `studio.memory.*`) + OpenAPI + golden fixtures + generated clients, and is git-TAGGED. *Assertion: the tag exists and its fixtures round-trip green in contracts CI; the `studio.workgraph.*` taxonomy is present and no event reuses `studio.memory.*`.* [Source: Evidence orvexstudioworkgraph §4; ADR-0008; P1 `yXUWpQpRjx` §3(2)]
- [ ] **AC4 (workgraph→staging promotion edge)** — Given the Librarian's beads-fishing loop, When the contract is authored, Then a NEW `workgraph → staging` promotion-edge contract is defined (the edge staging's Librarian fishes beads across), with its event/verb shape frozen in the contracts tag. *Assertion: contract surface contains a named promotion-edge type consumed by `orvex-studio-staging`; a golden fixture for it round-trips.* [Source: P1 `yXUWpQpRjx` §4 W2; Map current-state-map §2 Librarian loop]
- [ ] **AC5 (beads product epic)** — Given the brief's cleanroom beads model (MIT, no CLI shipped), When Linear epics are authored, Then a **beads product epic** exists for this service, decomposed into H1–H17 stories, MCP-first with CLI parity. *Assertion: a `beads` epic exists in project "Orvex Studio Workgraph" with ≥1 child story authored to the 9-section standard.* [Source: Brief `rgBOQh31p3`; Evidence orvexstudioworkgraph §1]
- [ ] **AC6 (naming-collision guard)** — Given "memory" is split three ways (api `/v1/memory`, workgraph, knowledge corpus), When the pack names the work-graph store, Then it explicitly asserts **"workgraph memory" ≠ the Memory product** and never claims `/v1/memory` or `studio.memory.*`. *Assertion: pack contains an explicit collision-guard note; grep of the contract shows no `studio.memory.*` emission and no `/v1/memory` ownership claim.* [Source: Map current-state-map §2 memory split; Evidence orvexstudioworkgraph §1]
- [ ] **AC7 (reconcile, never regenerate)** — Given the three canonical pages landed 2026-07-12, When the pack drafts, Then it amends/extends them in place (draft revisions) rather than authoring parallel duplicates. *Assertion: no new page duplicates the title of `Kgp6JT3IOR`/`2KrwsvY5zL`/`bnbRUdCm6R`; the delta cites them as its base.* [Source: brief authoring §; Map current-state-map §1]
- [ ] **AC8 (NO-MONGO / Postgres-only)** — Given D-S12, When the store is defined, Then event data = Postgres append/outbox tables (Dolt + pgvector explicitly rejected; server-issued short IDs + Postgres CAS/row locks). *Assertion: no Mongo/Dolt/pgvector wording in any pack artifact.* [Source: brief authoring §NO-MONGO (D-S12); Evidence orvexstudioworkgraph §3]
- [ ] **AC9 (SDD full-surface)** — Given the SDD ruling, When it is authored, Then it carries the full API surface, events produced/consumed, entitlement/quota (402 `QUOTA_EXCEEDED`, never 429/destructive), cell-lint + tenancy compliance (`JGAUQRsw2g`), obs + SLOs, all test tiers, runbook, and family-E2E participation. *Assertion: each of those SDD sections is present and non-empty.* [Source: P1 `yXUWpQpRjx` §3(4); cell-lint `JGAUQRsw2g`]
- [ ] **AC10 (build prompt leaves zero architecture decisions)** — Given the per-agent build prompt, When it is authored, Then it names the seam map, deep-module boundaries, tier placement, versions, crew recipe, and deterministic Done gate so the build agent makes zero architecture calls. *Assertion: build prompt's stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes").* [Source: `9VUHxAcoXw` H4; CS §3/§6/§7]
- [ ] **AC11 (negative — REVISE bounces)** — Given a `PACK-REVIEW: REVISE` verdict, When it is posted, Then the pack goes to a fix pass and is never overridden; the author cannot self-advance to Done. *Assertion: no Done transition exists without a subsequent `PACK-REVIEW: PASS` comment; author ≠ advancer.* [Source: P1 `yXUWpQpRjx` §7; `9VUHxAcoXw` H14/H15]
- [ ] **AC12 (negative — untagged blocks dispatch)** — Given Phase-2's contract-first dispatch rule, When the contract is untagged or its fixtures fail to round-trip, Then this pack is NOT certified and no story dispatches against it. *Assertion: certification requires `git tag -l` non-empty AND green fixture CI on the tag commit.* [Source: P1 `yXUWpQpRjx` §4 stage gate; §9 exit]
- [ ] **AC13 (forward-compat)** — Given later-wave features (bi-temporal as-of queries, interop write adapter, learning-loop convergence with staging's Librarian, OQ7), When a future wave extends the contract, Then it must NOT break the frozen `studio.workgraph.*` envelope or the promotion-edge shape (additive lane per ADR-0008; breaking → ADR + human ratify). *Assertion: any later change to the tagged shapes is additive or carries an ADR + ratify record.* [Source: ADR-0008; Evidence orvexstudioworkgraph §3 deferred]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, plan `5eFdxN3edd`, P1 `yXUWpQpRjx`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, cell-lint `JGAUQRsw2g`, ADR-0035 `QbEBPuKcGR`, and the three space pages `Kgp6JT3IOR`/`2KrwsvY5zL`/`bnbRUdCm6R` (live read, `--no-daemon`) (AC: 1,2,7)
- [ ] Draft PRD-delta in space `orvexstudioworkgraph` — reconcile brief additions vs canonical PRD/Addendum; cite every FR/NFR (AC: 1,6,7)
- [ ] Resolve/flag contested seams as pack-review must-resolve items (memory-naming collision; learning-loop convergence with staging OQ7; quota/pricing dimension OQ2) (AC: 6)
- [ ] Author contract + golden fixtures in `orvex-studio-contracts`: `studio.workgraph.*` CloudEvents + OpenAPI verbs + the `workgraph→staging` promotion-edge type; generate Go stubs + TS clients (ADR-0035) (AC: 3,4)
- [ ] Land + **git-TAG** in `orvex-studio-contracts`; confirm fixtures round-trip green in contracts CI (AC: 3,4,12)
- [ ] Author test plan (unit / store-testcontainers / contract fixture round-trip / crew-slot / family-E2E per CS §5) — including the SM-1 lab A/B proxy caveat (no host-side token telemetry on hookless platforms) (AC: 9)
- [ ] Author the SDD (full-surface, everything-eventually-needed) in `orvexstudioworkgraph` (AC: 2,9)
- [ ] Author the per-agent build prompt with stories to the full 9-section H1–H17 standard; run FINAL SELF-AUDIT (AC: 10)
- [ ] Author Linear epics from zero: the **beads product epic** + the work-graph kernel epic, children as H1–H17 stories, in project "Orvex Studio Workgraph" (AC: 5)
- [ ] Request adversarial review (reviewer ≠ author); fix pass on any `REVISE`; tick boxes only when genuinely verified; hand to orchestrator (AC: 11,12)

## 4. 🧠 Dev Context

**Inputs**

| Canon page / slug | What it feeds in this pack |
|---|---|
| Brief `rgBOQh31p3` | New features folded in (beads epic, promotion-edge, prime-first ritual) |
| Map current-state-map §2 | memory three-way split; Librarian loop; capture-via-MCP fan-out |
| Space `Kgp6JT3IOR` / `2KrwsvY5zL` / `bnbRUdCm6R` | Existing canonical Arch/PRD/Addendum — the reconciliation base |
| ADR-0008 | Contract change-authority (additive lane vs ADR+ratify) |
| ADR-0035 `QbEBPuKcGR` | TS clients for TS consumers (mcp/cli) alongside Go stubs |
| cell-lint `JGAUQRsw2g` | 14-rule tenancy compliance the SDD declares |

- **Space slug:** `orvexstudioworkgraph`. **Per-space evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioworkgraph.md`.
- **Live-repo-wins reconciliation:** `orvex-studio-workgraph` is genuinely pre-build (no repo state), so here the **canonical space pages + the brief** are the reconciliation base; there is no ahead-of-canon repo to outrank them. [Map current-state-map §1]

**Contested seams this pack MUST resolve or flag**

- [ ] **"memory" naming collision** — assert workgraph "memory" ≠ the api `/v1/memory` Memory product ≠ knowledge corpus isolation; flag corpus-isolation grade as knowledge-owned, OQ open. [Map current-state-map §2]
- [ ] **Learning-loop convergence with staging's Librarian (OQ7)** — flag as deferred; do not silently choose a merged tuning loop. [Evidence orvexstudioworkgraph §6]
- [ ] **Quota/pricing dimension (OQ2)** — items vs edges vs tokens unresolved; flag to billing, do not invent a value. [Evidence orvexstudioworkgraph §3/§6]
- [ ] **`workgraph→staging` promotion-edge ownership** — new seam; pin the producing/consuming side in the contract, not by first-builder. [P1 `yXUWpQpRjx` §4 W2]

**❌ classic-mistakes (CS §0)**

| Row | Canonical name | Assessment for this pack |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; no handler/cmd code authored here. Binds the build-prompt stories this pack authors (beads product epic + work-graph kernel epic): work-graph rules must live in the owning domain service, never the sync-verb handlers. |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — no store code authored at pack stage. Binds the build-prompt stories: the Postgres append/outbox access (D-S12) stays behind the Repository seam, tests included. |
| ❌#3 | Premature interface / seam | APPLICABLE — the `workgraph→staging` promotion edge is a network seam (cross-service, consumed by `orvex-studio-staging`), so a port IS justified; design-it-twice and pin the producing/consuming side in the contract this pack freezes, not by first-builder. |
| ❌#4 | Mocking own packages | NOT APPLICABLE — no tests authored here. Binds the build-prompt test-plan tiers: exercise workgraph modules through their exported interface with a real/in-memory (testcontainers) substitute, never a mock of an owned package. |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — pack is definition-only. Binds the build-prompt stories: vertical RED→GREEN tracer bullets, not all-tests-then-all-code. |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the OpenAPI + `studio.workgraph.*` CloudEvents shapes this pack freezes and git-TAGs; only freeze the fields the enumerated surface justifies, not a speculative superset. |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — no packages created here. Binds the build-prompt module boundaries: each workgraph package must survive the deletion test (CS §3.1). |
| ❌#8 | Inline credentialed/IO client | NOT APPLICABLE — no client code authored at pack stage. Binds the build-prompt stories: the `orvex-studio-lib` MultiIssuerVerifier and any IO client are injected at the seam, credentials via env only. |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — no projection code authored here. Binds the build-prompt stories: workgraph projections stay deterministic, timestamps derived from event payloads (reinforced by the server-issued short-ID / no-client-clock ruling). |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/quota/cap shapes this pack defines (402 `QUOTA_EXCEEDED`, never 429/destructive); the pricing dimension is human-ratified and TBD by `orvex-studio-billing` (OQ2) — do not bake a cap; a change needs ADR + human sign-off. |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — no handler/cmd files authored here. Binds the build-prompt stories: sync-verb handlers (prime/ready/recall/…) hold routing + marshalling only. |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the generated Go stubs + TS clients (ADR-0035) that cross the exported contract surface: freeze concrete typed structs, with `unknown` (TS) as the only sanctioned scaffold placeholder. |

**SE-Arch lenses (`8sYi523i4t`, all 5)**

- Reliability — Postgres CAS/row-lock claim path + outbox durability; server-issued short IDs (hash-ladder rejected M-4/L-1).
- Security — deny-by-default auth via `orvex-studio-lib` MultiIssuerVerifier; per-tenant ACL `acl_primitive` fail-closed.
- Cost governance — token-economy claim (prime ~200 tokens); pricing dimension flagged OQ2, not invented.
- Operational excellence — `pkg/obs` OTel wiring is early scope (stub today); runbook + reaper workload shape named.
- Performance/freshness — latency SLOs (NFR-MEM1) provisional pending a retrieval spike; may trigger an ADR-0014 carve-out (TBD — defined by the retrieval spike).

**ADR triggers this pack is expected to fire:** the new `studio.workgraph.*` topic subdomain (topic-schema change → additive lane per ADR-0008); the `workgraph→staging` promotion edge (new cross-service dependency); a possible latency-SLO ADR-0014 carve-out if the retrieval budget fails.

## 5. 🧪 Verification

- [ ] Adversarial review returns `PACK-REVIEW: PASS` (reviewer ≠ author) — live-read of the wiki drafts, not the cache.
- [ ] Contract tag exists in `orvex-studio-contracts` and its fixtures round-trip green in contracts CI (a claimed tag is not a tag).
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT.
- [ ] SDD completeness check against the concept-to-service map (every eventual-need line present + evidenceable).
- [ ] The `workgraph→staging` promotion-edge fixture and the `studio.workgraph.*` taxonomy both verified present.

**What NOT to fake:** no self-review; no claimed-but-unverified tag; no SDD trimmed to the wave slice; no invented NFR/latency-SLO or pricing-dimension numbers (they are TBD — defined by the retrieval spike / billing); no `studio.memory.*` reuse.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (classic mistakes), §3 (deep-module; design-it-twice the promotion edge), §4 (TDD contract binds build-prompt stories), §5 (mocking categories bind the test plan tiers), §6 (tier placement binds the build prompt), §7 (seam map — pin the kernel↔staging↔knowledge↔mcp seams this contract fixes), §8, §10, §11, §12 (wiki-first; pinned contracts are contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules) — declared in the SDD. **NO-MONGO override (D-S12):** event data = Postgres append/outbox tables; strike any Mongo/Dolt/pgvector wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` (Phase 1 Wave 2) · Phase-1 orchestrator `yXUWpQpRjx` §3–§4, §7, §9
- Umbrella brief `rgBOQh31p3` (beads epic; prime-first ritual; promotion edge)
- Coding Standards `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12 · SE-Arch `8sYi523i4t` (5 lenses)
- Issue Authoring `9VUHxAcoXw` (H1–H17) · ADR-0008 · ADR-0033 `yNFx3YyNap` · ADR-0035 `QbEBPuKcGR` · cell-lint `JGAUQRsw2g`
- Space pages `Kgp6JT3IOR` / `2KrwsvY5zL` / `bnbRUdCm6R` · Evidence `evidence/orvexstudioworkgraph.md` · Map `evidence/current-state-map.md`

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Workgraph · **Milestone:** P1 — Definition Factory (per-service P1 milestone creation is a batched human/Linear-MCP dependency; do not block pack authoring on it).
- **Blocked by:** ENG-2037 (Definition Factory Wave 1 — contracts + lib + Go↔TS bridge proof; the tag scheme + promotion-edge codegen path this pack depends on).
- **Blocks:** wave2-gate (Wave-2 completion gate; sibling `orvex-studio-staging` pack consumes the `workgraph→staging` promotion edge).
- **Deferred, named with owner:** build/story-level issues are born FROM this pack (Phase 2), not before it; latency-SLO ADR-0014 carve-out → the retrieval spike; quota/pricing dimension → `orvex-studio-billing`; learning-loop convergence (OQ7) → a later wave.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent id + model; claim arbiter per ADR-0033 `yNFx3YyNap`.
2. **PLAN** — comment the artifact-by-artifact plan + the seams to resolve/flag.
3. **PROGRESS** — continuous comments as each artifact is drafted/landed; blockers surfaced immediately.
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes); one PR per touched repo (`orvex-studio-contracts`, space drafts).
5. **STAGE HANDOFF** — author → review.
6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** — boxes only when genuinely verified (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances through the deterministic gate; the author CANNOT self-advance (fake-done gate).
9. **ESCALATIONS** — as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority".

Writes via the `linearis` CLI (`lnr-tracking-adapter`); reads from `.cache/linear/`; never the Linear MCP.
