## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a **certified Service Definition Pack for `orvex-studio-api`** (the Studio product BFF/composition tier) so that build stories dispatch only against a frozen, reviewed contract — not against the 59-line 501-stub scaffold that exists today. This pack **leaves the build agent zero architecture decisions**: it fixes the BFF surface, the events, the SDD, and the contract tag. That is what the pack is FOR. [P1 yXUWpQpRjx §3][Map current-state-map §1]

**Definition of Done — the binary gate** (all red = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS**, posted as a Linear comment + mirrored on the pack root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch 8sYi523i4t][P1 yXUWpQpRjx §4]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI green on the tag commit* [P1 yXUWpQpRjx §3 artifact 2]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioapi` — *machine check: `docmost-cli page get <slug> --no-daemon` returns status=draft for each* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body carries the self-audit block, all "yes"* [Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-3 delta slice — *machine check: each concept-to-service-map line for api maps to an SDD line* [P1 yXUWpQpRjx §3 artifact 4]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief and the concept-to-service map, When the PRD-delta is authored, Then every added FR/NFR is cited and reconciled against the existing draft PRD `85qj2wwU2L`, not regenerated. *Assert: each PRD-delta FR line carries a `[Brief rgBOQh31p3]` or `[Map]` cite.* [Source: Brief rgBOQh31p3][Map current-state-map §2]
- [ ] **AC2 (Composer + wizard BFF)** — Given the Composer (teaching Prompt Composer) + task-first wizard concept, When the delta is scoped, Then the api BFF surface is defined as the composition tier over `orvex-studio-ai` (surface itself defined in Wave 4). *Assert: PRD-delta names the wizard BFF route + its ai delegation seam.* [Source: P1 yXUWpQpRjx W3]
- [ ] **AC3 (private memory)** — Given private memories + consent, When the contract is frozen, Then `/v1/memory*` (FormSpec via SSE) + `studio.memory.updated` on the `studio-spine` are specified; corpus-isolation grade is flagged as an OQ owned by the knowledge pack, not chosen here. *Assert: contract carries `/v1/memory` + `studio.memory.*`; a must-resolve item names the knowledge-owned isolation-grade OQ.* [Source: P1 yXUWpQpRjx W3][api evidence §4]
- [ ] **AC4 (chat import)** — Given chat import, When the contract is frozen, Then the Curator `/v1/import` route + `studio.conversation.imported` event are specified, and the import-UX-vs-backbone seam (api ETL vs knowledge indexing) is raised as a review must-resolve. *Assert: contract carries `/v1/import` + `studio.conversation.imported`; must-resolve names the api↔knowledge seam.* [Source: P1 yXUWpQpRjx W3][Map current-state-map §2]
- [ ] **AC5 (memory ×3 homes)** — Given "memory" is split three ways, When the delta is authored, Then the api home (user FormSpec Memory) is bounded away from workgraph "memory" and knowledge corpus-isolation, and the contest is flagged must-resolve, never silently chosen. *Assert: a must-resolve item names all three homes.* [Source: Map current-state-map §3]
- [ ] **AC6 (Curator supersession)** — Given the staging Librarian epic supersedes the BFF Curator, When the delta is authored, Then it reconciles with the Wave-2 staging pack ruling — the api Curator is defined as the pre-cutover home with the supersession named, not double-owned silently. *Assert: PRD-delta cites the Wave-2 staging pack for the Curator→Librarian cutover.* [Source: Map current-state-map §2]
- [ ] **AC7 (D-S17 principal)** — Given the twice-reversed polymorphic {user|org} principal ruling, When contract shapes bind, Then they honour D-S17 (personal = user-keyed, no Clerk org) with no personal-org backfill. *Assert: contract auth shapes carry the {user|org} principal, no personal-org field.* [Source: api evidence §3]
- [ ] **AC8 (TS-client bridge)** — Given `orvex-studio-api` is the one TS/Hono satellite, When the tag cuts, Then it emits a **TS typed client** per ADR-0035, resolving the open Go-vs-TS codegen seam (audit finding #5). *Assert: the tag pipeline generates a TS client for api; it compiles.* [Source: ADR-0035 QbEBPuKcGR][api evidence §3]
- [ ] **AC9 (negative — untagged blocks dispatch)** — Given an untagged or fixture-failing contract, When Phase-2 dispatch is attempted, Then no api build story is frontier-eligible. *Assert: dispatch check rejects when `git tag -l` is empty for api's tag.* [Source: P1 yXUWpQpRjx §4]
- [ ] **AC10 (negative — REVISE bounces)** — Given a pack-review verdict `REVISE`, When the author responds, Then it routes to a fix pass and is never overridden or self-advanced. *Assert: no Done transition exists without a later `PACK-REVIEW: PASS` comment.* [Source: SE-Arch 8sYi523i4t][P1 yXUWpQpRjx §4]
- [ ] **AC11 (forward-compat)** — Given a later UI/Composer wave, When it consumes this contract, Then the frozen `/v1/*` grammar + `studio.*` taxonomy MUST NOT be reshaped except via ADR-0008 (breaking → ADR + human ratify). *Assert: any envelope-reshaping change carries an ADR ref.* [Source: ADR-0008][P1 yXUWpQpRjx §3 artifact 2]
- [ ] **AC12 (cell-lint)** — Given the day-1 cell + tenancy contract, When the SDD is authored, Then it declares compliance with all 14 cell-lint rules (per-cell deployment D-SA11/A-CELL, no cross-cell reach). *Assert: SDD carries a 14-rule cell-lint compliance block.* [Source: Cell contract JGAUQRsw2g][api evidence §3]
- [ ] **AC13 (SDD ratchet)** — Given the SDD is the everything-eventually-needed list, When Wave-3 scopes a slice, Then the SDD still carries every later-wave api surface (Composer/wizard, Demo World, Your-Wiki, social) so no slice masquerades as the whole service. *Assert: SDD line count ≥ the concept-to-service-map api line count.* [Source: P1 yXUWpQpRjx §3 artifact 4]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map §2/§3, api evidence, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, ADR-0035 `QbEBPuKcGR`, cell contract `JGAUQRsw2g` (AC: 1)
- [ ] Draft **PRD-delta** in space `orvexstudioapi`, reconciled against draft PRD `85qj2wwU2L` (live repo @ 5993805 wins over stale canon) (AC: 1,2,3,4)
- [ ] Resolve or **flag for review** the contested seams: memory ×3 homes, import-UX-vs-backbone, Curator↔Librarian supersession (AC: 4,5,6)
- [ ] Author **contract** (OpenAPI `/v1/skills|collections|marketplace|social|memory|curator|demo|import|prompt-use` + SSE entitlement channel; CloudEvents `studio.*` on ADR-0007 envelope / ADR-0010 taxonomy) + golden fixtures in repo `orvex-studio-contracts` (AC: 2,3,4,7)
- [ ] Land + **git-TAG** in `orvex-studio-contracts`; wire **TS-client generation** per ADR-0035 into the tag pipeline (AC: 8)
- [ ] Author **test plan** (unit / store testcontainers / contract fixture round-trip / crew-slot / family-E2E per CS §5; SSE paywall-dissolve <60s covered) (AC: 3,9)
- [ ] Specify **satellite-fake categories** in the test plan: DocmostPort/ai/knowledge = owned-satellite fakes; billing→Stripe = true-external port with committed replay fixtures (AC: 3)
- [ ] Author **SDD** — the full eventual api surface incl. later-wave Composer/wizard, events produced/consumed, entitlement/quota (402 `QUOTA_EXCEEDED` on DocmostPort writes), cell-lint compliance, observability+SLOs, runbook, family-E2E (AC: all)
- [ ] Author **per-agent build prompt** whose stories meet the full 9-section H1–H17 `9VUHxAcoXw` standard: scope, machine-checkable ACs, standards refs (CS/SE-Arch/cell-lint), the crew testing recipe, deterministic Done gate (AC: all)
- [ ] Run the `9VUHxAcoXw` **FINAL SELF-AUDIT** on every build-prompt story before emitting (H1–H17 all "yes") (AC: all)
- [ ] Request **adversarial review** (reviewer ≠ author); on `REVISE` run a fix pass; on `PASS` tick + hand to orchestrator (AC: 10)

## 4. 🧠 Dev Context

**Inputs**

| Canon page/slug | What it feeds |
|---|---|
| Brief `rgBOQh31p3` | Composer/wizard, private memory, chat import, Orvex rating source features |
| Map `current-state-map` §2/§3 | Concept-to-service homes + contested seams |
| PRD `85qj2wwU2L` (draft) | Existing api PRD to reconcile, not regenerate |
| Arch `ekTh7nDQqo` + Audit `TpxkDsKTkC` (canonical) | D-S17 principal, D-SA1–11, 2 HIGH findings (Go/TS auth, outbox fix) |
| ADR-0035 `QbEBPuKcGR` | TS-client codegen for the one TS satellite |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance declaration |

- **Space slug:** `orvexstudioapi` · **Evidence:** `briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioapi.md`
- **Live-repo-wins:** the deployed artifact + migration assessment outrank stale space canon; reconcile the PRD-delta against the honest scaffold (59-line `index.ts`, 501 stubs @ 5993805), not the "shipped poc" it strangles. [Map current-state-map reconciliation note]

**Contested seams this pack MUST resolve or flag (must-resolve items):**

- [ ] Memory ×3 homes — api FormSpec vs workgraph "memory" vs knowledge corpus-isolation (naming collision) [Map §3]
- [ ] Import-UX-vs-backbone — api Curator `/v1/import` ETL vs knowledge indexing [Map §2]
- [ ] Curator supersession by the staging Librarian epic — reconcile with the Wave-2 staging pack ruling (live double-ownership until cutover) [Map §2]

**❌ classic-mistakes (CS §0)** — all 12 assessed:

| # | Row | Assessment |
|---|---|---|
| #1 | domain logic in handler/cmd/main.go | NOT APPLICABLE — definition-only work authors no runtime code |
| #2 | raw store-driver calls outside the store package | NOT APPLICABLE — definition-only; no store code authored here |
| #3 | premature seam | APPLICABLE — binds the ai/knowledge/identity/DocmostPort delegation ports |
| #4 | mocking own packages | APPLICABLE — test plan mocks only true boundaries: DocmostPort/ai/knowledge = owned-satellite fakes from contracts fixtures, never api's own packages |
| #5 | horizontal slicing | NOT APPLICABLE — definition-only; vertical tracer-bullet discipline binds the build-prompt stories, not this pack |
| #6 | big-upfront schema | APPLICABLE — binds the OpenAPI + CloudEvent shapes frozen at the tag |
| #7 | dual-write | APPLICABLE — the fixed-in-draft HIGH finding: own Postgres outbox+relay, never direct-to-spine |
| #8 | inline credentialed/IO client | APPLICABLE — SDD pins injected ports (DocmostPort/ai/knowledge, Stripe-via-billing); no client constructed in a domain function |
| #9 | time/randomness in the projection layer | NOT APPLICABLE — definition-only; determinism binds the build-prompt stories |
| #10 | ceilings guessed | APPLICABLE — 402 `QUOTA_EXCEEDED` + entitlement shapes consumed from the W1 contracts pack, not re-derived |
| #11 | domain logic in cmd/handler files | NOT APPLICABLE — definition-only work authors no runtime code |
| #12 | `any`/`interface{}` type-laundering across boundaries | APPLICABLE — the TS-satellite typed client + contract shapes forbid `any` crossing the BFF exported surface |

**SE-Arch lenses (all 5)** — one line each:

- *Reliability* — SSE entitlement channel + outbox relay dictate at-least-once + idempotent step-APIs.
- *Security* — D-S17 {user|org} principal + the Go↔TS auth-verify HIGH finding (verify via lib codegen/ADR-0035).
- *Cost governance* — entitlement/quota shapes consumed from W1, not invented.
- *Operational excellence* — liveness/readiness split (audit fix-in-draft) + runbook in SDD.
- *Performance-freshness* — paywall dissolves <60s without reload (D-S20).

**ADR triggers expected:** the unfiled `studio.*` event taxonomy ADR (CS §9), and the Go/TS bridge resolution recorded via ADR-0035.

## 5. 🧪 Verification

- [ ] `PACK-REVIEW: PASS` comment exists (reviewer ≠ author) [SE-Arch 8sYi523i4t]
- [ ] api's contract tag exists in `orvex-studio-contracts`; fixtures round-trip green in contracts CI [P1 yXUWpQpRjx §4]
- [ ] TS client generates + compiles for api per ADR-0035 [ADR-0035 QbEBPuKcGR]
- [ ] Build-prompt stories pass the H1–H17 FINAL SELF-AUDIT [9VUHxAcoXw]
- [ ] SDD completeness cross-checked line-by-line against the concept-to-service map [P1 yXUWpQpRjx §3 artifact 4]

**What NOT to fake:** no self-review; no claimed-but-unverified tag (a claimed tag is not a tag); no SDD trimmed to the Wave-3 delta slice; no invented NFR/quota numbers — quota + entitlement caps are consumed from the W1 contracts pack, written "TBD — defined by W1 contracts pack" where absent.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module; design-it-twice on the ai/knowledge delegation seams), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan — DocmostPort/ai/knowledge are owned-satellite fakes, Stripe-via-billing is true-external), §6 (BFF tier placement; LLM calls NEVER here — they belong to `orvex-studio-ai`), §7 (seam map — this contract pins the memory, import, and DocmostPort seams), §8, §10, §11, §12 (wiki-first; the pinned contract is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — declare compliance). **NO-MONGO (D-S12):** event data = Postgres append/outbox tables (api's own outbox+relay) → Kafka `studio-spine`; strike any Mongo wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` (Phase 1 waves) · P1 orchestrator `yXUWpQpRjx` §2–§4 (pack artifacts, stage gate, Wave 3)
- Umbrella brief `rgBOQh31p3` · Coding Standards `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12 · SE-Arch `8sYi523i4t` (5 lenses)
- Issue Authoring `9VUHxAcoXw` (H1–H17) · ADR-0008 change-authority · ADR-0035 `QbEBPuKcGR` Go↔TS bridge · Cell contract `JGAUQRsw2g`
- api canon: PRD `85qj2wwU2L`, Arch `ekTh7nDQqo`, Audit `TpxkDsKTkC` · Evidence `orvexstudioapi.md` · Map `current-state-map` §2/§3
- ADR triggers this pack is expected to file: the unfiled `studio.*` event-taxonomy ADR (CS §9), and the Go↔TS bridge resolution recorded via ADR-0035 — both blocked on the Studio ADR registry stand-up (entry criterion) [Map current-state-map §5 P1-9]

## 8. 🔗 Dependencies

- **Project:** Orvex Studio API · **Milestone:** P1 — Definition Factory
- **Blocked by:** `wave2-gate` (Wave-2 packs staging + workgraph certified; the Curator↔Librarian ruling this pack reconciles against lives there) — ENG id wired at filing
- **Blocks:** `wave3-gate` (Wave-3 delta-packs gate) — ENG id wired at filing
- **Deferred, named with future owner:**
  - the Composer/wizard UI surface → Wave-4 `orvex-studio-ui` pack (this pack defines only the BFF composition tier)
  - corpus-isolation grade for private memory → `orvex-studio-knowledge` pack (OQ open there, not chosen here)
  - entitlement/cap contract shapes → W1 `orvex-studio-contracts` pack (consumed via cite, not authored here)
  - per-service P1 milestone creation → operator (Linear-MCP human dependency; batch-escalated, non-blocking)
  - Story-level build issues are born FROM this pack, never before it.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent id + model; claim arbiter per ADR-0033. 2. **PLAN** comment before authoring. 3. **PROGRESS** comments continuously (each artifact drafted/landed; blockers). 4. **COMMITS** — every commit/PR body carries `Part of ENG-NNN` (links, never closes; one PR per touched repo — `orvex-studio-api` + `orvex-studio-contracts`; the per-repo PR gate is merge authority). 5. **STAGE HANDOFF** author→review. 6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings (live-reads the wiki drafts, verifies the tag exists + fixtures round-trip, never the cache). 7. **TICK** boxes only when genuinely verified (full-body read-modify-write; preserve every other byte). 8. **DONE** — ONLY the delivery orchestrator advances; author CANNOT self-advance (fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority" in `po-decisions/`. Writes via linearis CLI; reads from `.cache/linear/`; never the Linear MCP.
