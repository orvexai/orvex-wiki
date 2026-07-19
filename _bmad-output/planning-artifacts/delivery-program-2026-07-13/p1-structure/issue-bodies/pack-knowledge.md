## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-knowledge` so that build stories dispatch only against a frozen, reviewed contract for the family's single retrieval/sync backbone. This is a **Wave-3 delta pack**: it folds the brief's new features into the service's existing (mature, deployed) PRD and freezes the total contract — it does not build. `orvex-studio-knowledge` is "THE one general multi-corpus search/RAG service" (R-9), so every seam it pins gates ai, api, mcp, cli, wiki retrieval downstream. [P1 yXUWpQpRjx §3; Map current-state-map §2]

**Definition of Done — the binary gate** (all red-on-any, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; golden fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI green on the tag commit* [P1 yXUWpQpRjx §3.2; ADR-0008]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioknowledge` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body 100% `[x]` self-audit block*
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-3 slice — *machine check: SDD lines cross-map 1:1 to concept-to-service map rows for this service* [Plan 5eFdxN3edd Phase-1 SDD ruling]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief's outbound-sync feature, When the PRD-delta is authored, Then it records that **knowledge is the ONE retrieval/sync backbone** for outbound sync with **per-vendor caveats** enumerated, each added FR cited. *Assertion: PRD-delta page contains a per-vendor caveat table with ≥1 cited FR row.* [Source: P1 yXUWpQpRjx §3 W3; Brief rgBOQh31p3]
- [ ] **AC2 (Orvex rating seam)** — Given the Orvex rating is a **shared** ai↔knowledge feature, When the delta is authored, Then the knowledge-owned slice (ranking/retrieval contribution) is pinned and the ai-owned slice is flagged as the contested seam, not silently claimed. *Assertion: PRD-delta flags `orvex-rating: ai↔knowledge` as a must-resolve seam.* [Source: P1 yXUWpQpRjx §3 W3; Map current-state-map §2]
- [ ] **AC3 (private-memories isolation)** — Given the Memory corpus-isolation-grade OQ is open (attribute-scoped `owner_user` vs per-user Turbopuffer namespace wall), When the pack freezes, Then it either resolves the grade with a cited decision or flags it as a review must-resolve, never freezes a corpus ACL over an open OQ. *Assertion: SDD/PRD-delta contains an explicit isolation-grade decision line OR a `- [ ]` must-resolve item.* [Source: Map current-state-map §2 private memories; evidence orvexstudioknowledge §6]
- [ ] **AC4 (chat-import indexing side)** — Given chat import is a Curator/api seam (`/v1/import`, `studio.conversation.imported`), When the delta is authored, Then the **indexing side of that seam** is defined in knowledge (index the imported corpus) and the import-UX-vs-backbone split is flagged as a pack must-resolve. *Assertion: contract exposes an internal index path consuming `studio.conversation.imported`; seam flagged.* [Source: P1 yXUWpQpRjx §3 W3; Map current-state-map §2 chat import]
- [ ] **AC5 (open-defect fold-in)** — Given open defects D7/ENG-2046 (rag v2 rejects `include_vectors` → `Hit.Vector` dropped), D8/ENG-2047, D9/ENG-2048 (extraction pipeline), D10/ENG-2049, D11/ENG-2050, When the PRD-delta + SDD are authored, Then each defect informs a corresponding SDD line or an FR/NFR the contract must satisfy. *Assertion: SDD references each of ENG-2046..2050 against a done-line.* [Source: program-status §2]
- [ ] **AC6 (frozen tagged contract)** — Given the OpenAPI + CloudEvents surface (query/retrieve/related/duplicates, `/v1/projection/delta`, `/v1/bundles`, `/events` SSE, `/internal/*`), When frozen, Then it lands in `orvex-studio-contracts`, git-TAGGED, with TS clients generated per ADR-0035 for TS consumers (api/mcp/wiki). *Assertion: tag exists; TS + Go clients generated; fixtures round-trip.* [Source: P1 yXUWpQpRjx §3.2; ADR-0035 QbEBPuKcGR; evidence orvexstudioknowledge §4]
- [ ] **AC7 (SSE cursor / A6a)** — Given the CLI needs epoch-ms monotonicity the `<topic-epoch>:<offset>` scheme lacks, When the contract freezes `/events` + `/v1/projection/delta`, Then the cursor scheme is pinned in contracts (ADR trigger) or flagged must-resolve before CUTOVER. *Assertion: cursor-scheme decision recorded in contract notes or a `- [ ]` must-resolve.* [Source: evidence orvexstudioknowledge §4/§6 A6a]
- [ ] **AC8 (NO-MONGO / append-outbox)** — Given D-S12 struck Mongo platform-wide, When event/journal storage is specified, Then it is Postgres JSONB projection + range-partitioned append tables + transactional outbox→Kafka (D-S13), with zero Mongo wording. *Assertion: `grep -i mongo` over pack drafts returns nothing.* [Source: Guidance D-S12; evidence orvexstudioknowledge §3]
- [ ] **AC9 (negative — untagged blocks dispatch)** — Given a contract with no git tag, When Phase-2 attempts dispatch, Then dispatch is blocked and the pack is NOT certified. *Assertion: certification refuses with `git tag -l`=empty.* [Source: P1 yXUWpQpRjx §4]
- [ ] **AC10 (negative — REVISE bounces)** — Given a `PACK-REVIEW: REVISE`, When received, Then it routes to a fix pass and is never overridden by the author. *Assertion: no Done advance while last review verdict = REVISE.* [Source: SE-Arch 8sYi523i4t; P1 yXUWpQpRjx §7]
- [ ] **AC11 (forward-compat)** — Given a future wave adds surfaces (comment-body indexing OQ4, CJK tokenization OQ3), When the contract freezes, Then those are additive-only extension points and must NOT force an envelope/breaking reshape of the frozen surface. *Assertion: SDD marks OQ3/OQ4 as later-wave additive; ADR-0008 additive-lane note present.* [Source: ADR-0008; evidence orvexstudioknowledge §6]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, plan `5eFdxN3edd` W3, map `current-state-map §2`, evidence `orvexstudioknowledge.md`, CS, SE-Arch, cell contract (AC: all)
- [ ] Draft **PRD-delta** in space `orvexstudioknowledge` (page: "PRD-delta — orvex-studio-knowledge (P1)"); reconcile against the live repo `orvex-studio-knowledge`, not stale space canon (AC: 1,2,4,5)
- [ ] Resolve or flag contested seams — Orvex-rating ai↔knowledge, chat-import UX-vs-backbone, memory isolation grade — as `- [ ]` must-resolve items (AC: 2,3,4)
- [ ] Author **contract + golden fixtures** in repo `orvex-studio-contracts` (OpenAPI + CloudEvents on ADR-0007 envelope / ADR-0010 `studio.*`); generate Go stubs + TS clients (AC: 6,7,8)
- [ ] Land + **git-TAG** the contract; confirm fixtures round-trip in contracts CI (AC: 6,9)
- [ ] Author **test plan** (page in `orvexstudioknowledge`): unit / store (testcontainers Postgres+Turbopuffer adapter) / contract fixture round-trip / crew-slot / family-E2E per CS §5 (AC: 5,6)
- [ ] Author **SDD** (page): the total everything-eventually-needed list incl. later-wave surfaces, ENG-2046..2050 done-lines, cell-lint + SLOs (AC: 3,5,11)
- [ ] Author **per-agent build prompt** whose stories meet the full 9-section H1–H17 `9VUHxAcoXw` standard (AC: all)
- [ ] Request **adversarial review** (reviewer ≠ author); run fix pass if REVISE; tick boxes only when verified; hand to orchestrator (AC: 10)

## 4. 🧠 Dev Context

Inputs table:

| Canon page / slug | Feeds |
|---|---|
| Brief `rgBOQh31p3` | outbound sync, Orvex rating, private memories, chat import features → PRD-delta |
| Map `current-state-map §2` | concept-to-service allocation + contested seams |
| Evidence `orvexstudioknowledge.md` | D-S9/12/13/14/17 rulings, API surface §4, SCAFFOLD state §5, OQ list §6 |
| `program-status §2` | open defects ENG-2046..2050 |
| W1 contracts pack · ADR-0008 | tag scheme (per W1 contracts pack), change-authority ADR-0008 |

- **Space slug:** `orvexstudioknowledge`. **Evidence file:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioknowledge.md`.
- **Live-repo-wins reconciliation:** the space canon reads "SCAFFOLD / ~90% unbuilt"; the live `orvex-studio-knowledge` repo is further along (`internal/search`/`internal/workflow`/`internal/store/postgres` with passing tests per the DRAFT AMENDMENT). The PRD-delta reconciles against the **deployed artifact + migration-assessment**, not the stale audit. [Map reconciliation note; migration-assessment §2]

Contested seams this pack MUST resolve or flag:

- [ ] Orvex-rating ownership split ai↔knowledge (must-resolve) [Map §2]
- [ ] Memory corpus-isolation grade: attribute-scoped vs per-user namespace wall (open OQ — resolve or flag) [evidence §6]
- [ ] Chat-import UX-vs-backbone seam with api Curator (must-resolve) [Map §2]
- [ ] A6a SSE cursor scheme (epoch-ms monotonicity) — pin in contracts or flag (ADR trigger) [evidence §4]

❌ classic-mistakes (CS §0):

| ❌# | Canonical row | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; the row binds the query/indexer/sse build-prompt stories this pack authors (domain rules in the owning package), enforced at build via the H1–H17 self-audit |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — definition-only; binds the Postgres+Turbopuffer store stories this pack authors (Repository seam, incl. tests) |
| ❌#3 | Premature interface / seam | APPLICABLE — binds the port/seam choices this pack pins; the network seams (`/events` SSE, `/internal/*`) justify ports, the in-process ai↔knowledge rating + import seams do not until ≥2 real impls — design-it-twice before pinning |
| ❌#4 | Mocking own packages | APPLICABLE — binds the test plan this pack authors: testcontainers Postgres+Turbopuffer + contract fixture round-trip, never a mock of an owned module |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; binds the build-prompt story shape this pack authors (vertical RED→GREEN tracer bullets, enforced by the `9VUHxAcoXw` audit) |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the contract/schema shapes this pack freezes; freeze only the fields the surface needs, additive-lane for OQ3/OQ4 |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — definition-only; the deletion test (CS §3.1) binds the package stories this pack authors |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — binds the client-injection seam this pack pins: Turbopuffer/Postgres clients injected at the seam, credentials via env only (BYOC terms OQ2) |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — binds the projection contract this pack freezes: Postgres JSONB projection deterministic, timestamps derived from event payloads (D-S13 outbox) |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/cap shapes this pack freezes (bundle-size, query-cost ceilings); ceilings are human-ratified, change needs ADR + human sign-off |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; handlers-hold-routing-only binds the build-prompt stories this pack authors |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the exported contract surfaces this pack freezes: concrete typed structs across boundaries; `unknown` is the sanctioned TS scaffold placeholder (ADR-0035 clients) |

SE-Arch lenses (`8sYi523i4t`): **Reliability** — SSE frames + outbox delivery must be at-least-once with idempotency-keyed `/internal/*`. **Security** — universal ACL choke point FR-K12 + A12 Studio-corpora ACL + private-memory isolation grade. **Cost governance** — bundle/query ceilings + Turbopuffer BYOC terms (OQ2). **Operational excellence** — `/healthz` vs `/readyz` split, cell-lint tenant-move contract. **Performance-freshness** — read-your-writes + rerank graceful-skip; delta-cursor lag budget. **ADR triggers expected:** SSE cursor scheme (A6a), source-adapter, single-Postgres/Mongo-struck, Turbopuffer commit — file per-service ADRs in the Studio registry.

## 5. 🧪 Verification

- [ ] Adversarial review PASS comment (`PACK-REVIEW: PASS`) present and mirrored on the pack root draft
- [ ] Contract tag exists in `orvex-studio-contracts`; fixtures round-trip green in contracts CI
- [ ] TS clients generated per ADR-0035 for TS consumers (api/mcp/wiki)
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT
- [ ] SDD completeness check: every SDD line cross-maps to a concept-to-service map row (no wave-slice trimming)
- [ ] `grep -i mongo` over all pack drafts returns nothing (D-S12 compliance)

**What NOT to fake:**

- no self-review (reviewer ≠ author, non-overridable)
- no claimed-but-unverified tag (a claimed tag is not a tag — verify `git tag -l` + CI)
- no SDD trimmed to the Wave-3 slice
- no invented NFR numbers (use "TBD — defined by owner" where canon is silent, e.g. bundle-size ceiling, SSE lag budget)

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌ assessed above); §3 (deep-module — one backbone, design-it-twice on the ai↔knowledge + import seams); §4 (TDD contract binds the build-prompt stories); §5 (mocking categories bind the test plan — testcontainers for store, fixture round-trip for contract); §6 (tier placement binds the build prompt); §7 (seam map — this pack pins the retrieval/sync, ACL choke, and event-consume seams); §8, §10, §11; §12 (wiki-first; pinned contracts are contract-shape law); §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — declare compliance incl. rule 10 tenant-move, rule 11 idempotency-key). **NO-MONGO override (D-S12):** event/journal data = Postgres append/outbox tables → Kafka (D-S13); strike any Mongo wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` — Phase 1 Definition Factory, Wave 3 (delta packs)
- Phase-1 prompt `yXUWpQpRjx` — §3 five artifacts, §4 stage gate, §4 Wave-3 content
- Umbrella brief `rgBOQh31p3` — outbound sync, Orvex rating, private memories, chat import
- Coding Standards `6aMAzsYeQb` — §0/§3/§4/§5/§6/§7/§12
- SE-Arch `8sYi523i4t` — 5 review lenses + fake-done gates
- Issue Authoring `9VUHxAcoXw` — H1–H17 build-prompt story standard
- ADR-0008 (contracts change-authority) · ADR-0035 `QbEBPuKcGR` (Go↔TS bridge) · ADR-0007/0010 (event envelope / `studio.*` taxonomy)
- Cell + tenancy contract `JGAUQRsw2g` — 14-rule cell-lint
- Evidence: `evidence/orvexstudioknowledge.md`; `evidence/current-state-map.md §2`; `program-status-2026-07-14.md §2`

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Knowledge · **Milestone:** P1 — Definition Factory
- **Blocked by:** `wave2-gate` (Wave 3 opens only after the Wave-2 staging + workgraph packs certify; ENG ids wired at filing)
- **Blocks:** `wave3-gate` (this delta pack is one of the 11 Wave-3 packs that must all certify to close the wave)
- **Deferred (born FROM this pack):** the build/test story-level issues for `orvex-studio-knowledge` are authored in Phase 2 against this frozen contract — future owner: Phase-2 build orchestrator. Per-service P1 milestone creation is a batched human dependency (Linear-MCP-only) — future owner: PO.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo → In Progress; post agent + model; claim arbiter per ADR-0033 `yNFx3YyNap`. 2. **PLAN** comment before authoring. 3. **PROGRESS** comments continuously (each artifact drafted/landed, blockers). 4. **COMMITS** — every commit/PR body carries "Part of ENG-NNN" (links, never closes; Done is gate-owned). 5. **STAGE HANDOFF** author → reviewer. 6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden. 7. **TICK** boxes only when genuinely verified (full-body read-modify-write, preserve every other byte). 8. **DONE** — ONLY the delivery orchestrator advances (author CANNOT self-advance — fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI through `lnr-tracking-adapter`; reads from `.cache/linear/`; never the Linear MCP.
