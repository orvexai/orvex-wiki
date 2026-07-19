# Orvex Studio — Current-State Map

**Date:** 2026-07-13 · Synthesized from 17 space digests + `migration-assessment.md` in this evidence folder.

**Reconciliation note:** the per-space digests are mostly snapshotted against the 2026-07-05 SE-Arch audits and read many satellites as "scaffold." `migration-assessment.md` (2026-07-13) is the freshest signal and shows several of those repos are now real, deployed, live-debugged code on one dev cell. Where they disagree, the migration assessment wins and both states are shown below.

---

## 1. Family rollup table

| Service / space | Mandate (≤8 words) | Canon maturity | Contract-API state | Delivery state | Biggest gap |
|---|---|---|---|---|---|
| **orvex-wiki** (engine) | Thin AGPL Docmost fork, kept primitives | rich-canonical (arch canonical; 5 ADRs "Proposed") | 8-op OpenAPI skeleton, real; not mirrored to contracts | Seam modules real (apply-ops 1756 LOC); `ORVEX_MODULES_ENABLED=false` in prod, on dev only since 2026-07-13 | Prod runs vanilla, emits zero events; module enablement dev-only (`orvexwiki`, migration) |
| **orvex-wiki-api** | Go composition tier; verb grammar | rich-canonical (arch canonical + unratified addendum) | `/v1` grammar draft; zero entries in contracts seam | Phase-0 proxy live+exercised on dev; composition Phases 1–3 unbuilt | Extraction not started; needs identity tokens + contracts authored (`orvexwikiapi`) |
| **orvex-studio-knowledge** | Single hybrid retrieval / RAG backbone | rich-canonical (arch+PRD canonical) | detailed design; source-of-truth in contracts; SSE cursor open | Real Go, Turbopuffer wired; **M5 E2E fake-done'd RED 2026-07-12** | The linchpin sync unproven E2E; `content_pm` parity (OQ6) open (`knowledge`, migration) |
| **orvex-studio-ai** | The AI brain; cited-ask, LLM gateway | draft-heavy (arch canonical, PRD draft) | shapes specified; deltas unfiled in contracts | Real Go, LiteLLM live-wired on dev (digest audit said scaffold; migration updates) | Break-glass/LLM-confinement ADRs open; billing SoR not landed (`ai`) |
| **orvex-studio-identity** | Dual-IdP auth spine; exchange tokens | draft-heavy (arch canonical, PRD draft) | design-stage; identity conforms | Real Go; M9 gate reported CLOSED 2026-07-12; **furthest along** | Deprovisioner owns orchestration (should be workflows); ADRs unfiled (`identity`) |
| **orvex-studio-billing** | Plan→entitlement→cap system-of-record | draft-heavy (arch canonical, PRD draft) | wire shapes in prose; nothing filed in contracts | Real Go + migrations + relay on dev (digest said scaffold) | AGPL engine still holds Stripe logic to sever; ai cap-delta unfiled (`billing`) |
| **orvex-studio-mcp** | Thin stateless MCP protocol gateway | rich-canonical (arch+PRD canonical) | consumes wiki-api OpenAPI; codegen'd from AGPL descriptor (transitional) | Built & deployed on dev; **~19/73 tools**, pre-repoint | Three-repo E2E never run; repoint blocked on tokens+contracts (`mcp`) |
| **orvex-studio-workflows** | Single Temporal control plane | rich-canonical (arch canonical, PRD draft) | CE types local, no contracts dep (F-SEAM) | **clerk-lifecycle live in prod**; CI exists; real code | Contract seam asserted in prose not enforced; as-built defects (`workflows`) |
| **orvex-studio-api** (BFF) | Studio product BFF; skills/memory/curator | draft-heavy (arch canonical, PRD draft) | design-only; TS-client codegen path OPEN | Honest scaffold — 59-line `index.ts`, 501 stubs | Go-vs-TS auth verify unimplementable as written (`api`) |
| **orvex-studio-ui** | Thin presentational React SPA | draft-heavy (arch canonical, PRD draft) | consumer of contracts DTOs/SSE | Single-commit scaffold; no CI, no tests | Serving topology drift; A11y/DS ship-gates unlanded (`ui`) |
| **orvex-studio-console** | Operator admin + observability BFF | rich-canonical (arch+PRD canonical) | BFF API repo-private (never a contract) | **Empty scaffold** — 4 files, no go.mod | Depends on un-chartered workflows proxy; RBAC unresolved (`console`) |
| **orvex-studio-contracts** | The single pinned Apache-2.0 seam | draft-heavy (arch canonical, PRD draft) | **~90% unbuilt**; validate CI + AGPL guard absent | Pure-artifact repo; real: `wiki-api.yaml`, cell-lint; stubs elsewhere | Change-authority contradiction (P3 vs CS §9) unresolved; no owner (`contracts`) |
| **orvex-studio-lib** | Shared Go lib; auth verifier ceiling | draft-heavy (arch canonical, PRD draft) | consumed via codegen; `gen/` trees absent | 52-byte go.mod scaffold; `doc.go` stubs; **no tests, no CI** | `MultiIssuerVerifier.Verify` deny-by-default stub blocks M7 family-wide (`lib`, `arch`) |
| **orvex-cli** | Multi-service agent CLI (from scratch) | draft-heavy (arch canonical, PRD+plan draft) | codegen from contracts tag; zero client generated | **Bare scaffold** — 2 files (CLAUDE.md, README) | Entire 10-phase build unstarted; hosts unpinned (`orvexcli`) |
| **orvex-studio-workgraph** | Multi-agent work-graph coordination kernel | rich-canonical (all 3 pages canonical) | contracts-first, fully specified in prose | **Pre-build** — planning canon only, no repo state | Hard dep on knowledge (still 501 scaffold); pricing dim open (`workgraph`) |
| **orvex-studio-staging** | Agent Staging Area + Librarian | rich-canonical (all 3 pages canonical) | shapes specified; receipts defined not built | **Pre-build** — 100% planning canon | Circular: hard-cut needs deps non-501, deps' benchmark needs staging (`staging`) |
| **orvexstudioarch** (family canon) | Cross-cutting canon root; ADRs; delivery | rich-canonical (31/32 ADRs canonical) | authors no contracts; gates the seam | N/A (canon space) | All 14 M0–M14 milestone pages still draft; spec-gate dropped (`arch`) |

---

## 2. Concept-to-service map (where the big concepts actually live)

- **The wiki (engine primitives).** `orvex-wiki` owns the block-write chokepoint (`apply-ops`), ACL, page lifecycle, session-mint-consume, outbox, quota. Real code, but **live only on dev**; prod is byte-parity vanilla Docmost with modules off (`orvexwiki`, migration).
- **The AI (cited-ask loop).** Cleanly owned by `orvex-studio-ai` end-to-end (D-ASK moved it out of wiki-api). ai owns no index and no write primitive. Clear ownership (`ai`, `contracts` D-ASK).
- **Knowledge / retrieval / import.** One backbone: `orvex-studio-knowledge` — all search/RAG/SSE/export/CLI-sync behind one ACL choke (R-9 consolidation). **Chat-history import is split:** the import *pipeline/ETL* lives in `orvex-studio-api` (Curator/`/v1/import`, `studio.conversation.imported`), while indexing lands in knowledge. Ownership of the import UX vs backbone is a seam to watch (`knowledge`, `api`).
- **Memory — genuinely split three ways and ambiguous.** (a) user-managed FormSpec Memory = `orvex-studio-api` `/v1/memory` / `studio.memory.*`; (b) multi-agent work-graph "memory" = `orvex-studio-workgraph` (explicitly NOT the memory product); (c) retrieval/isolation of the Memory corpus = `orvex-studio-knowledge` (isolation grade still open). Three homes, naming collision on "memory" (`api`, `workgraph`, `knowledge`).
- **The Librarian loop.** Productized in `orvex-studio-staging` (Agent Staging Area + Librarian), which **supersedes** OPS Librarian/Card Contract v1 and `orvex-studio-api`'s Curator. Today's real Librarian is the ad-hoc `doc-librarian` Claude skill chain. Staging is pre-build; the Curator it replaces still lives in the BFF — a live double-ownership until cutover (`staging`, `api`).
- **Capture via MCP.** `orvex-studio-mcp` is the agent front-door (protocol translation only); capture verbs fan out to wiki-api/knowledge/ai. Future `staging_*` and `workgraph_*` tools route capture into staging/workgraph (`mcp`, `staging`, `workgraph`).
- **Billing / entitlements.** `orvex-studio-billing` is the SoR for plans, caps AND wiki quotas; enforcement stays distributed (ai LiteLLM `max_budget`, engine Redis quota chokepoint). Clear SoR, but the value is not yet built and the engine still contains AGPL Stripe logic (`billing`, `ai`, `contracts`).
- **Identity.** `orvex-studio-identity` is the dual-IdP spine + owns the global org→cell registry (the platform's only global component). Furthest along. **Contested seam:** the Clerk-lifecycle deprovisioner currently lives in `workflows` and in `identity` — F2/F-IDP conflict over who owns Clerk webhook ingestion (`identity`, `workflows`).
- **Contracts seam.** `orvex-studio-contracts` should own every cross-boundary shape, but is ~90% unbuilt and **has zero wiki-api/ai/billing entries filed** — so most "contracts" are prose in each service's arch page, not enforceable artifacts (`contracts`, `wikiapi`, `ai`, `billing`).
- **Shared runtime seam.** `orvex-studio-lib` should own the auth verifier every satellite imports — but it is a 52-byte scaffold with a deny-by-default verifier stub, making it a silent single point of failure for the whole family's security ceiling (`lib`, `arch`).

---

## 3. Top 10 program risks for "define contracts per service → build in isolation → integrate at the end"

1. **The contract seam is 90% unbuilt and unowned.** The doctrine's foundation — `orvex-studio-contracts` — has no self-validation CI, no AGPL-import guard, no owner (OQ-C1), and no wiki-api/ai/billing/knowledge OpenAPI filed. "Build in isolation against the contract" is impossible when the contract doesn't exist yet (`contracts`, `wikiapi`, `billing`, `ai`).
2. **Contract change-authority is a live unresolved contradiction.** Canon P3 ("no human ratify step") vs Coding Standards §9 (mandatory ADR + human doc-ratify per change) — filed as ADR-0001 trigger, unsettled. Every contract edit hits ambiguous governance (`contracts`).
3. **`orvex-studio-lib` is an unbuilt shared dependency on the critical path.** A 52-byte scaffold whose `MultiIssuerVerifier.Verify` deny-by-default stub blocks M7 across every Go satellite. Isolated dev stalls the moment a real token must verify (`lib`, `arch`).
4. **"Integrate at the end" collides with never-run seams.** First true three-repo MCP E2E has never run; the knowledge sync (outbox→Kafka→index) linchpin only started emitting 2026-07-13; no surface has a green human-verified end-to-end pass. Big-bang integration risk is maximal (`mcp`, `knowledge`, migration).
5. **Fake-done on the exact integration gates.** `TestM5KnowledgeE2E` was fake-done'd RED 2026-07-12; documented fake-done history in `po-decisions/fake-done-forensics.md`. Gate-green ≠ working, so "integrate at the end" can be reported done while broken (`knowledge`, migration).
6. **Circular dependencies between pre-build services.** Staging's hard-cut needs deps non-501, but deps' benchmark needs staging to exist; workgraph's semantic leg is "dead" until knowledge exits its 501 scaffold. Isolation can't resolve mutual gates (`staging`, `workgraph`, `knowledge`).
7. **The event spine — the integration substrate — is barely on.** Prod engine emits zero events; outbox→Kafka→consumers wired late on dev, unproven under load; message-tracing-across-outbox is a known open gap. The substrate every service integrates through is the least-proven piece (`arch`, `knowledge`, migration).
8. **Draft-only canon under "canonical" wrappers.** Nearly every PRD is draft while its arch page is canonical; all 5 engine ADRs are "Proposed"; all 14 milestone pages draft; multiple services have zero filed ADRs blocked on a non-existent Studio ADR registry. Contracts get defined against unratified requirements (`ai`, `billing`, `identity`, `ui`, `api`, `lib`, `arch`).
9. **Ownership seams are split or contested.** Clerk deprovision (identity vs workflows), Curator/Librarian (api vs staging), "memory" naming (api/workgraph/knowledge), console's workflows-proxy (un-chartered, other space). Per-service isolation entrenches whichever side builds first (`identity`, `workflows`, `staging`, `console`).
10. **Go/TypeScript seam has no resolved mechanism.** `orvex-studio-lib/auth` and contract codegen are Go-authored; `orvex-studio-api`/`orvex-studio-mcp`/`orvex-studio-ui` are TS — no decided path to emit TS typed clients/verifier from the seam. Two isolated stacks that must integrate with no bridge specified (`api`, `mcp`, `lib`, `contracts`).

**Cross-cutting:** unresolved AGPL boundary posture ("not legal advice — confirm with counsel before prod"), Mongo canon self-contradiction (P5/D-S12 Postgres-only vs CS §5–10 naming Mongo), and repo-vs-wiki naming/scope drift recur in nearly every space — all raise the cost of isolated builds converging.

---

## 4. Wiki-migration verdict

Carried verbatim from `migration-assessment.md`: **"The wiki runs behind the microservices" is true only on dev, unproven end-to-end, and false in production. The PO's suspicion is correct.** Every satellite is genuine, deployed, live-debugged code — real, substantial *build* progress and the hard extraction work is underway — but prod/`main` is deliberately vanilla Docmost with the orvex modules OFF, the full end-to-end path runs only on one dev cell first switched on 2026-07-13, its proving E2E gates are still red or fake-done, and no surface has a green, human-verified, real-data acceptance pass. Strong build; **not migrated.**

---

## 5. What the research phase must answer (deduplicated, prioritized)

**P0 — blocks the whole delivery doctrine**
1. **Who owns and how is `orvex-studio-contracts` change-authority resolved** (P3 no-ratify vs CS §9 ADR+ratify)? Assign OQ-C1 owner; without this, no seam can freeze (`contracts`).
2. **When do wiki-api / ai / billing / knowledge / identity OpenAPI + CloudEvent + step-API deltas actually get filed into contracts** (all "owed, not done")? These are the seams every isolated build compiles against (`wikiapi`, `ai`, `billing`, `knowledge`, `identity`).
3. **Does the end-to-end path actually work on the dev cell with a fresh tenant + real token + real data** — api/mcp/cli/ai/rag/knowledge-sync — reproduced, not reported? Especially `TestM5KnowledgeE2E` genuinely green on merged code (`migration`, `knowledge`).
4. **How does `orvex-studio-lib` (auth verifier + `gen/` codegen) get built**, and what is the JWKS/issuer-registry source (OQ-L1), module layout (OQ-L2), generator toolchain (OQ-L3)? It gates every satellite (`lib`).
5. **What is the Go↔TypeScript contract/verifier bridge** for the TS satellites (api/mcp/ui)? No mechanism decided (`api`, `mcp`, `lib`).

**P1 — ownership & seam resolution**
6. **Where does Clerk lifecycle/webhook ingestion live** — identity or workflows (F-IDP / F2)? Resolves a double-owned seam (`identity`, `workflows`).
7. **Curator → Librarian cutover:** when does `orvex-studio-staging` absorb the BFF Curator, and how is the hard-cut of agent write surfaces sequenced against 501 deps (the circular gate)? (`staging`, `api`).
8. **"Memory" disambiguation and corpus-isolation grade** — user Memory (api) vs work-graph (workgraph) vs knowledge corpus isolation (attribute-scoped vs per-user namespace wall) (`api`, `workgraph`, `knowledge`).
9. **Studio ADR registry:** stand up the Decision-Records parent + numbering (blocks 20+ mandatory ADRs across nearly every space) (`arch`, `ai`, `billing`, `identity`, `ui`, `api`, `lib`, `cli`, `console`, `staging`).
10. **Console's cross-repo dependency:** charter the workflows authorizing-proxy and resolve OQ-CT4 (per-cell vs global) + OQ-CT3 (RBAC) before any admin writes (`console`, `workflows`).

**P2 — pin before cutover / GA**
11. **Host-routing form** (flat service hosts vs per-cell) — contradictory across contracts, wiki-api, cli, ui manifests; and the wiki-api edge mechanism (Worker vs Traefik) (`contracts`, `wikiapi`, `cli`, `ui`).
12. **SSE cursor scheme (A6a)** — epoch-ms/monotonicity the CLI needs; and `content_pm` parity (OQ6) — both "pin before CUTOVER" (`knowledge`).
13. **AGPL boundary legal posture** confirmed with counsel; sever residual Stripe/billing logic + `pkg/dfm` FR-L27 provenance audit before prod (`wikiapi`, `billing`, `lib`).
14. **Mongo canon reconcile** (P5/D-S12 vs CS §5–10) — family-wide (`billing`, `arch`).
15. **Anti-Sybil / trial-abuse anchor** (email-only vs email+phone; bind trial to principal) — no default chosen (`identity`).
16. **Deferred quota/pricing values** — Teams/Enterprise wiki quotas; workgraph/staging pricing dimensions; embedding budget sizing (`billing`, `workgraph`, `staging`).
17. **Standalone full-family stack** — a canon requirement with no built artifact and no absent-satellite degradation path; what does packaging look like (`migration`, `orvexwiki`)?
18. **Spec-gate rebuild** — dropped governance hole; rebuildable via text-only story-id matching (`arch`).
