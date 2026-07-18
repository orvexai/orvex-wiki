# Wiki study — space `orvexstudioknowledge`

All 11 pages in the space read in full (per INDEX.md, 2026-07-17 sync). This space governs
`orvex-studio-knowledge` — the single multi-corpus search/RAG/SSE/export/CLI-sync backbone for
the whole Orvex family (wiki + Studio skills + Memory + chat), sitting downstream of orvex-wiki
and upstream of orvex-studio-mcp / orvex-cli / orvex-studio-ai.

## 1. Per-page table (every page, none skipped)

| slug | title | status | one-line substance |
|---|---|---|---|
| `azRwTCZMqw` | Architecture: orvex-studio-knowledge | canonical | Governing arch: 3 Go binaries (query/indexer/sse) + planned 4th (bundler); single Postgres (RLS, JSONB projection + partitioned journals) + Turbopuffer (committed) + S3 + Redis; A1 ACL choke point (engine FR-13 ∩ token-scope, never cached); A12 Studio-corpora owner-scoped ACL; central-Temporal rebuild (no in-service worker); IdP-agnostic auth via identity project; cell-contract conformance table. |
| `NdH4benMGe` | Architecture Audit — SE-Arch review (2026-07-05) | canonical | Adversarial review of the architecture page; verdict "needs-tightening", all findings fixed-in-draft (S1 Studio-corpora ACL reinstated, S2 FR-13 overload protection added, R1 tenant-move added, R2 cluster-local DNS, O1 ADR triggers named, O2 liveness/readiness split, C1/C2 reconciled). Notes build state: SCAFFOLD-honest at review time. |
| `0mFImku9Gp` | R-9: Search-Stack Consolidation Design | **draft** | THE #1 program risk: 3 parallel search stacks (engine tsvector/pgvector, Studio skills-RRF POC, Turbopuffer target) collapse into ONE — knowledge is THE multi-corpus search/RAG service family-wide. Corpus registry model, RRF fusion by rank, migration trains (wiki→skills→memory/chat, never big-bang), binding decisions D-R9-1..5 (each app chunks its own; per-content-type embeddings; no old-vs-new comparison gate; wiki-first cutover order; each app owns its golden query set). |
| `dm0YOFovjb` | Importer Probe (delete me) | archived | Empty test/probe page, no content of substance — housekeeping artifact. |
| `oqrEtMg46M` | PRD-delta — orvex-studio-knowledge (Wave 3) | canonical | Wave-3 Definition Factory delta pack (ENG-2099). Reconciles a new brief against the mature canonical PRD/Architecture AND the live deployed artifact (which is MATURE-DEPLOYED, not the stale "scaffold" README). Surfaces 8 new FR-K-D items and MR-K1/K3/K4/K5/K6/K7/K8/K9 as contested/open — decides none. |
| `dCbFzRQGDr` | PRD: orvex-studio-knowledge | canonical | The canonical product requirements: FR-K1–K31b, NFR-K1–K13. Knowledge is retrieval backbone for wiki + Studio corpora, one ACL choke point, event-fed freshness, Turbopuffer committed store, central-Temporal rebuild, SSE wire-contract-exact for the Orvex CLI. Includes draft NFR-K11/12/13 amendment (query-latency/freshness/warm-cache budgets) and Memory gap-closure fold-in (F5 eval harness, FR-E1-4). |
| `dcOUbpzE8L` | PRD Addendum — orvex-studio-knowledge | draft | Downstream depth preserved from PRD conversation: Go stack decision, store decision trail (Turbopuffer vs OSS rejects), event-spine mechanics, Orvex CLI refactor sketch, rejected alternatives (Knative Eventing for CLI sync, tsvector fallback, engine-side proxy). |
| `eFq4WnWOGC` | SDD — orvex-studio-knowledge (Wave 3) | canonical | The full service-level "Done list" — everything the service will EVER need (not a wave slice): complete API surface census (22 internal packages, 3 binaries, 21 routes, 5 typed-501 stubs), events consumed, entitlement/quota, all 14 cell-lint rules assessed, observability/SLOs, test tiers, runbook, family-E2E. Explicit anti-fake-done clause: NOT done despite green CI / ArgoCD Healthy / 41/41 stories / a tagged contract. |
| `XZiMOK2l4N` | Test Plan — orvex-studio-knowledge (Wave 3) | canonical | 5-tier test plan (unit/store/contract/crew-slot/family-E2E) mapped to CS §5 dependency-category rows; Turbopuffer + LiteLLM are the service's Row-4 true-external deps (unlike sibling workgraph). Names ~20 specific unit tests tied to stories. Honest baseline: M5 family-E2E gate (`TestM5KnowledgeE2E`) is RED (ENG-2050) — not credited green anywhere. |
| `3z7lJ1t9N9` | Build Prompt — orvex-studio-knowledge (Wave 3) | canonical | Per-build-agent dispatch prompt (ENG-2099). Corrects the stale "scaffold" README (service is MATURE-DEPLOYED, prod-Healthy, 62 test files/11,658 LOC). Splits the 41 stories into dispatchable-now / dispatch-caveated / dispatch-blocked by MR. Names the 12-row CS ❌ standards check, seam map, tier placement, pinned versions, crew-testing recipe, deterministic Done gate. |
| `6Wb2fYVQI2` | Contract Summary — orvex-studio-knowledge (Wave 3) | canonical | The contract seam is PARTIALLY frozen: OpenAPI tagged at contracts v0.1.3, but only the 6 rebuild step-APIs are `x-status: pinned`; the whole query/SSE/projection/keyword-upsert surface (12 ops) is `x-status: draft`. Knowledge produces ZERO events (pure spine consumer). Contract-vs-served drift on 5 routes (provision/deprovision, llms-full.txt, page.md) = MR-K10. |

## 2. Deeper summaries — load-bearing pages

### `azRwTCZMqw` — Architecture: orvex-studio-knowledge (canonical, ratified 2026-07-06)

- **Topology**: `cmd/query` (always-warm, request-serving), `cmd/indexer` (Knative, scale-to-zero, Trigger-fed + cache eviction), `cmd/sse` (long-lived SSE, plain Deployment), planned `cmd/bundler`. One image, `ARG CMD` selects binary. Three binaries exist TODAY; bundler is planned-only.
- **A1 (the ACL choke point)** — the single most load-bearing decision: every content-bearing egress narrows through engine FR-13 ∩ token-scope (C5), on EVERY request, no cached allow-decision ever (Redis included). Projected ACL metadata is an over-narrowing prefilter ONLY. Counts computed post-admission only (no existence/count oracle). Engine-down ⇒ fail closed. Budget: over-fetch 4×k, requery cap 2, FR-13 batch ceiling 500 IDs.
- **A1a (S2 fix)** — FR-13 hot-path overload protection: single-flight/request-coalescing (not a cache), interactive-vs-bulk bulkhead to the engine, explicit engine-side rate contract.
- **A2 (D-S12 datastore ruling)** — single Postgres (JSONB projection + RLS fail-closed + range-partitioned append-table journals) + Turbopuffer (all vectors) + S3 + Redis. **Mongo struck from the platform doctrine entirely.** Chunk TEXT never lives in Postgres (load-bearing sizing invariant — keeps projection to tens of GB even at 250k-tenant cell ceiling).
- **A2a/A2b** — Postgres CAS-first write order closes the concurrent-indexer race; RLS GUC-per-principal is the structural tenancy backstop (not by convention), enforced by CI lint against raw table access.
- **A3** — store adapter seam: Turbopuffer + memindex reference, dual-adapter conformance in CI.
- **A4** — source-adapter contract: any Studio system becomes a publisher (CloudEvent types, content-resolver, ACL-narrowing primitive, purge events) — registry entry + client, no pipeline changes. Publisher authenticity enforced by studio-spine topic-level publish auth.
- **A5** — sync keyword upsert (FR-K4): engine calls `POST /internal/v1/keyword-upsert` post-commit-pre-ack, ≤50ms, circuit breaker, mTLS + tenant/page-id coherence + version-bound (integrity surface, not just auth).
- **A5a** — IdP-agnostic auth via the identity project (Clerk or Keycloak); canonical principal `{idp, subject, tenant, org_or_realm, roles, token_scope}`; polymorphic {user|org} tenant (personal users = user-keyed, no Clerk org).
- **A6/A6a** — SSE gateway wire-contract-exact for the Orvex CLI: single-partition raw topic, standalone assigned consumers, cursor v2 `<topic-epoch>:<offset>` — **but this does NOT satisfy the CLI's required numeric-monotonic + epoch-ms-lag cursor properties (open tension, must pin before cutover)**; legacy unprefixed event names required (`page.updated` not `wiki.page.updated`) or the CLI skips every frame.
- **A7** — chunking/embeddings: each publisher chunks its own (D-R9-1); per-content-type embedding models (D-R9-2); cross-corpus fusion by RANK (RRF) not raw score.
- **A8** — rebuild: central Temporal in orvex-studio-workflows calls knowledge's idempotent step-APIs; knowledge runs NO in-service Temporal worker and NO KEDA (fixed-replica worker + KPA HTTP step-APIs).
- **A9** — fairness: per-principal/tenant token buckets; QoS interactive > CLI sync > bundles/rebuilds.
- **A11** — Redis read-path cache, event-driven eviction (indexer's first action on any event); never caches allow/deny decisions or ACL metadata.
- **A12 (REINSTATED, S1 fix)** — Studio user-corpora (skill/memory/chat) ACL mechanics: owner-scoped admission, employer/org-admin firewall (never-employer-visible), delegated-principal-only (service tokens rejected on memory/chat), ingestion-side privacy exclusion, per-corpus fail-closed default. **Marks the memory-corpus isolation GRADE as OPEN (attribute-scoped `owner_user` is the DEFAULT)** — this directly contradicts AD-7 (see Staleness flags below).
- **A-bundle** — bundle artifacts are principal-bound capabilities (closes an IDOR); never a bare presigned URL.
- **Cell-contract conformance table (§6)**: rules 1,3,4,5,6,10,11,13 addressed; tenant-move (rule 10) is the non-retrofittable day-1 commitment — typed quiesce/export/import/activate step-API + `TENANT_MOVE.md` store inventory.
- **Change-log fold-ins**: D-S12 (Mongo struck), D-S13 (Redis→Kafka bridge retired; engine transactional outbox + relay is the launch prerequisite), D-S14 (ranking lives in knowledge PERMANENTLY, ai consumes ranked results only), D-S17 (polymorphic tenancy).
- **Memory gap-closure fold-in (AD-7/9/11)**: AD-7 says memory retrieval uses a Turbopuffer **namespace wall** (the stronger grade, NOT attribute-scoped filtering), keyed by `owner_scope` — stated as "Resolves OQ2" and decided. This is the exact item A12 (same page, §5) calls OPEN with attribute-scoped as default. **The page contradicts itself.**

### `NdH4benMGe` — Architecture Audit (SE-Arch review, 2026-07-05)

- Verdict: needs-tightening → all findings fixed-in-draft in the amended arch page. Build state at review time: SCAFFOLD, honestly labelled (stubs, 501s).
- Top finding (S1, HIGH): the governing arch had dropped the Studio-corpora ACL controls its own canonical PRD (FR-K31b) required — fixed by reinstating A12.
- Also flagged reliability (S2, FR-13 overload — no coalescing/bulkhead), cell-contract gaps (tenant-move R1, cluster-local DNS R2), governance (no ADRs filed, O1), consistency (R-9 not folded into A7, C1; binary count 3-vs-4, C2), ops excellence (no readiness split, O2).
- Strengths recorded: contracts-seam discipline (no shared-DB imports), textbook ACL/fail-closed model.
- **Open decisions carried forward (not defects)**: content_pm parity (OQ6), SSE cursor scheme (A6a), Turbopuffer commercial terms (OQ2), CJK tokenization (OQ3), **memory corpus isolation grade** (explicitly still open per this audit too), comment-body indexing (OQ4), the 5 ADRs to file.

### `0mFImku9Gp` — R-9: Search-Stack Consolidation Design (DRAFT — the doc meant to settle the contradiction is itself unratified)

- Binding platform ruling (Daniel, 2026-07-05): knowledge is THE ONE general multi-corpus search/RAG service family-wide; no second search-infrastructure stack anywhere.
- 3 stacks today → 1: engine tsvector+pgvector (DELETE at cutover), Studio skills-RRF POC/Typesense (RETIRE into knowledge), Turbopuffer (the destination, COMMITTED).
- Corpus model: corpus registry per source-adapter (CloudEvent types, resolver, ACL primitive, purge events); per-corpus chunking + ranking config; unified `POST /v1/query` with a `corpora: []` selector; RRF fusion (rank-based, cross-corpus safe).
- Corpus catalog (phase-1): wiki content (engine FR-13∩token-scope ACL), Studio skills, Memory, chat history (all three Studio corpora owner-scoped by polymorphic tenant).
- Migration trains: wiki via wiki-api strangler; Studio skills via studio-api strangler; memory+chat additive (ai-published), sequenced LAST, lowest risk.
- **Binding decisions D-R9-1..5**: chunking = every app chunks its own; embedding models per-content-type; **NO old-vs-new comparison gate** — the new stack is not benchmarked against legacy, built to work well and cut over (retires the "RRF parity regression" risk framing); cutover order wiki→skills→memory/chat, never big-bang; golden sets are each app's own, knowledge owns/runs the harness.
- **Does NOT explicitly resolve** the memory-corpus isolation GRADE (attribute-scoped vs namespace wall) — despite being "the doc meant to settle it" (per the PRD-delta), and is itself still status=draft.

### `dCbFzRQGDr` — PRD: orvex-studio-knowledge (canonical, synced 2026-07-16)

- Charter: retrieval backbone; one hybrid keyword+vector store (Turbopuffer BYOC, committed D-S9); serves UI search, AI/RAG, MCP search, Orvex CLI (formerly docmost-cli), bulk export, SSE — behind ONE ACL choke point governing every content-bearing egress. Engine keeps zero search infra; knowledge never decides access, never owns a model.
- Studio (Studio app) and orvex-wiki are **co-equal, peer first-class consumers** (2026-07-05 ruling).
- Multi-publisher model: docmost is first of many; any Studio system registers via the source-adapter contract.
- Broadened intent (D-S12): knowledge is the central read-optimized replica of ANY Studio entity, not just wiki — the Kafka spine itself (not a DB) is the platform's "subscribe to anything" surface; knowledge is its first subscriber. Event-archive sink (S3+Postgres) for long-horizon replay.
- Goals: G1 one retrieval substrate, G2 event-fed freshness (no polling), G3 CLI ≥5× faster, G4 open subscription (zero engine/knowledge changes for new consumers), G5 tenant/principal safety (cross-tenant=0, intra-tenant-restricted=0 bytes).
- Non-goals: ranking-brain ownership beyond phase 1 is STRUCK — **ranking lives in knowledge PERMANENTLY** (D-S14, U13 closed, no wave-2 revisit); anonymous/public share-page search stays in docmost; owning any model/prompt loop is ai's charter; knowledge never builds/owns the outbox relay.
- FR-K1..K31b cover: event subscription/ingestion, projection/index, query API, SSE gateway (with a very detailed FR-K15a wire-contract-deltas list — cursor semantics, legacy event names, heartbeat, frame size, cold-start bootstrap — each explicitly "load-bearing, MUST be pinned in contracts EVENTS.md, else CLI freshness silently breaks"), bulk export/bundles, CLI projection sync (FR-K20/20a/20b — the `content_pm` parity risk is called "the single biggest FR-K22 parity risk"), rebuild/backfill/DR, ops.
- NFR-K1..K13: freshness floor (async p95<5s/p99<30s regardless of sync-upsert fate), throughput (≥20 pages/s), isolation (NFR-K3 automated CI+deploy probes: cross-tenant=0, intra-tenant-restricted=0), durability/DR (RTO tenant<15min, cell<24h), degradation (NFR-K5 — knowledge down ⇒ wiki works minus search; engine down ⇒ retrieval fails closed; **standalone-wiki posture: search surfaces are simply absent, never an error**), cost, vendor seam, security/audit, residency, fairness. NFR-K11/12/13 are a **DRAFT pending-ratify amendment** (appended 2026-07-10, ENG-1933) filing query-latency/freshness/warm-cache budgets with documented headroom — not yet ratified.
- Dependencies table names the engine, contracts, lib, workflows, and infra seams explicitly.
- Rollout: SHADOW → CANARY → CUTOVER (delete engine tsvector except share-subtree carve-out; delete pgvector coupled to collab-outbox coverage) → STEADY.
- Open questions: OQ2 Turbopuffer procurement (not a design blocker), OQ3 CJK tokenization, OQ4 comment-body indexing (deferred), OQ5 eval-set ownership, **OQ6 content_pm — gate before CUTOVER**.
- Memory gap-closure fold-ins: knowledge owns memory retrieval projection (AD-1c, read-only), F5 retrieval eval harness (FR-E1-4, recall@10≥0.80), AD-7 (namespace-per-user keyed by owner_scope — **again stated as decided here**), AD-11 (projection consistency, card-id partitioned, read-your-writes).
- **Family audit stream owner note (ADR-0037, ratified 2026-07-16)**: orvex-studio-audit now owns the family WORM audit sink; knowledge's admin-ops audit re-pointing to it is named but NOT yet built/scheduled.

### `oqrEtMg46M` — PRD-delta Wave 3 (canonical as a delta pack, but content is explicitly non-ratifying)

- Establishes the reconciliation base as the DEPLOYED PRODUCTION artifact (not the stale "scaffold" README, not just the canonical docs) — main/dev are byte-identical, 0 git tags on the knowledge repo itself (only contracts repo tags the seam, at v0.1.3).
- **HOLLOW-HEALTHY WARNING (D-STG1)**: ArgoCD Healthy across 4 apps (incl. PROD) is NOT evidence of a working surface — `/readyz` is still TODO-probed. Honest program baseline: 1 PASS / 5 FAIL / 1 BLOCKED across 7 family surfaces.
- 8 new FR-K-D items (Wave-3 brief deltas), each surfaced not decided:
  - **FR-K-D1** outbound Memory sync (master→replica push to vendor native memories; Claude native adapter real, ChatGPT platform-blocked, MCP fallback universal; free forever) — story ENG-2696 exists; home contested = MR-K3.
  - **FR-K-D2** private memories + consumption-time consent (NEW layer on top of A12's ingestion-side exclusion) — extends ENG-2368, not a new MR.
  - **FR-K-D3** chat-history import: indexing side is knowledge's (already in FR-K31b/ENG-2367); import UX/ETL is api's — event-vocab seam = MR-K4.
  - **FR-K-D4 (the headline must-resolve)**: memory corpus isolation GRADE — canon **literally contradicts itself**: A12 says OPEN/attribute-scoped-default; AD-7 says DECIDED/namespace-wall; story ENG-2369's title bakes in the namespace-wall side. R-9, the doc meant to settle it, is still draft. = MR-K1.
  - **FR-K-D5** Orvex-rating popularity/usage leg — no story exists, no owner ruled (ai/api/knowledge split) = MR-K5, explicitly not filed.
  - **FR-K-D6** SSE cursor scheme pin (A6a) = MR-K6, before cutover.
  - **FR-K-D7** content_pm parity (OQ6) = MR-K7, before cutover.
  - **FR-K-D8** the one retrieval/sync backbone — reaffirms scope floor+ceiling (no delta to the model itself; Decision 4/D-S14 stand).
- Artifact-driven findings: query/retrieve/duplicates/rebuild/provision surfaces are REAL (not stubs) — only 5 of ~21 routes are honest 501s; knowledge is a pure spine CONSUMER (zero events produced); LiteLLM token confinement verified as FR-K10-sanctioned scoped key (not master); contract is tagged but only PARTIALLY frozen (rebuild pinned, query/SSE/projection draft).
- Folds in known defects: ENG-2046 (raw-embedding leak, DONE), ENG-2047 (BM25 leg disabled, DONE), ENG-2048 (P0, 112 un-extracted registry stubs — cited-ask can't cite, still open), ENG-2049 (DLQ self-heal, In Progress), ENG-2050 (M5 E2E RED, In Progress).
- Full MR-K1/K3/K4/K5/K6/K7/K8/K9 register — none decided by this pack.

### `eFq4WnWOGC` — SDD Wave 3 (the total service-level Done list)

- Mechanical totality check (not a self-audit): 22/22 internal packages, 3/3 binaries, gen/ present — zero omissions found.
- Per-package census with SRC-LOC/tests/tier/role for all 22 packages (admission=A1 choke, cache=A11 Redis, turbopuffer=A3/Row4, workflow=A8 rebuild [largest, 1388 LOC], etc.).
- Full "Done list" split into: 2a API surface (real handlers vs 5 typed-501 stubs vs later-wave/unbuilt), 2b events consumed, 2c entitlement/quota, 2d all 14 cell-lint rules individually assessed (2 evidenced, 1 N/A, 11 not-yet-hard), 2e observability/SLOs (several DRAFT pending-ratify), 2f degradation posture, 2g test tiers, 2h runbook (owed), 2i family-E2E participation per seam (engine/identity/workflows/workgraph/ai/mcp-cli/console/api).
- **Anti-fake-done clause**: explicitly enumerates why CI-green, ArgoCD-Healthy, 41/41 story count, and a tagged contract each individually do NOT mean done — done requires `TestM5KnowledgeE2E` genuinely round-tripping on a fresh tenant with real data.

### `XZiMOK2l4N` — Test Plan Wave 3

- 5 tiers: unit / store (testcontainers, real) / contract (fixture round-trip + dual-adapter conformance) / crew-slot / family-E2E.
- CS §5 category table: Turbopuffer + LiteLLM are Row-4 TRUE-EXTERNAL (must replay committed real responses, never hand-authored); Postgres is Row-2 (testcontainers); Redis/Kafka/S3/Tika/engine/identity are Row-3 (port + adapter/fixtures).
- ~20 named unit tests tied 1:1 to specific stories (e.g., `TestOverNarrowPrefilterNeverAdmits`, `TestEmployerNeverSeesOwnerMemory`, `TestSSECursorMonotonicEpochMs`).
- Honest tier status: Tier 2 real+passing; Tier 3 green-capable ONLY for rebuild step-APIs, draft-sourced for query/SSE/projection; Tier 5 (M5 family-E2E) is RED and does not count as green anywhere in this plan.
- NFR-K3 isolation probes (cross-tenant=0, intra-tenant-restricted=0, count-oracle, page-level hard-delete tombstone) are the load-bearing safety tier; **cannot be finalized for the memory corpus until MR-K1 rules** the isolation grade.
- "Looks good AND works" bar explicitly N/A — knowledge has no UI surface; consumers (wiki search box, console, Memory product in api/ui) carry that bar.

### `3z7lJ1t9N9` — Build Prompt Wave 3

- Corrects 6 traps a build agent would fall into, most importantly: the README says "scaffold" and is stale-false — service is MATURE-DEPLOYED (prod-Healthy, bugfixes landing 2026-07-14); Healthy/green-CI prove almost nothing (M5 gate red); contract is only partially frozen; knowledge is a pure event CONSUMER (no outbox/publisher — do not build one); the LiteLLM token is a sanctioned scoped key, not a CS §6 violation, but must be verified not assumed.
- Dispatch state splits 41 stories into now/caveated/blocked buckets by MR.
- Lists what's genuinely REAL (do not rebuild): store, turbopuffer, workflow, event, server, clients, and 15 other domain packages all carry real code.
- Full MR-K1..K10 register restated for build-agent consumption, each with "you are BLOCKED, say so, do not decide" framing.
- CS ❌ 12-row standards checklist assessed per-repo; seam map (in-process/local-substitutable/store-adapter-port/network-seams/deep-modules); tier placement; pinned versions (go 1.26, pgx/v5, contracts v0.1.3, Turbopuffer v2); crew-testing recipe; deterministic Done gate (11 checkboxes).

### `6Wb2fYVQI2` — Contract Summary Wave 3

- The base contract IS tagged at v0.1.3 (unlike sibling workgraph, which has no tag) — but only the 6 `rebuild*` internal step-APIs are `x-status: pinned`; all 12 other ops (query/retrieve/related/duplicates/attachmentsSearch/bundles/SSE/llms/projection-delta/keyword-upsert) are `x-status: draft`.
- Knowledge produces ZERO CloudEvents (pure consumer) — no `studio.knowledge.*` subdomain exists. Consumes `wiki.*` (engine outbox) and `studio.workgraph.*` (workgraph); does NOT yet consume `studio.skill.*`/`memory.*`/`chat.*` (FR-K31b) — zero wiring in code.
- Contract-vs-served drift (MR-K10): 5 served routes have no contract op — provision/deprovision namespace, llms-full.txt, page.md, and a possible GET-duplicates variant. Must settle before the query/projection surface pins.
- ADR-0035 governs TS-consumer codegen (mcp/cli/ui) from knowledge's OpenAPI — GA cutover of a TS consumer must not pin a draft artifact; only the rebuild ops are GA-pinnable today.
- Change-authority = ADR-0008; next-free ADR = 0036; ADR-0033/34/35 canonical.

## 3. Bindings on the AI-surfaces redo (MCP / wiki-api / CLI)

These are commitments in this space that directly constrain the PRD/architecture redo for the three AI-facing surfaces:

- **Layering / no shortcuts**: knowledge is reached via wiki-api's `/v1` surface per family doctrine (memory: no legacy shims/direct-to-engine). MCP and CLI query verbs must go through the query API, not around it. The engine keeps ZERO search infrastructure post-cutover — MCP/CLI cannot fall back to any in-fork tsvector/pgvector path once knowledge cuts over.
- **The universal ACL choke point (A1) is the single non-negotiable contract for any AI surface**: every content-bearing egress (search, RAG retrieval, related, bundles, SSE, projection download) MUST narrow through engine FR-13 ∩ token-scope on every request, with no cached allow-decision. Any MCP tool or CLI verb that reads content must respect this — it cannot introduce a second, weaker ACL path.
- **Corpus model + `corpora: []` selector**: the redo should assume MCP/CLI query verbs select from a multi-corpus space (wiki, studio-skill, memory, chat), not wiki-only — this is the target shape per R-9, even though memory/chat consumption is not yet wired.
- **CLI (Orvex CLI, formerly docmost-cli) SSE + cache-sync wire contract is EXTREMELY prescriptive and load-bearing** — FR-K15/K15a/K20/K20a/K20b name exact behaviors (legacy unprefixed event names, cursor monotonicity + epoch-ms lag derivation, `/events/head` bootstrap, 1 MiB frame cap, <45s heartbeat, `content_pm` field for PM-JSON parity, hard-DELETE tombstones not soft-trash). Any CLI PRD/architecture redo MUST treat these as binding wire-contract requirements, not implementation details — several are still UNPINNED in contracts (MR-K6 cursor, MR-K7 content_pm) and gate CUTOVER.
- **`ask` routes to orvex-studio-ai, not knowledge** (D-A12) — knowledge only serves the retrieval sub-call. The CLI/MCP redo should not route `ask`-style verbs directly to knowledge.
- **Ranking lives in knowledge PERMANENTLY (D-S14, closed)** — ai/mcp/cli consume ranked results only; they must never build a second ranking/fusion layer.
- **Quotas**: content quota is enforced at the engine's F-QUOTA write chokepoint, NOT by knowledge, NOT by any AI surface — knowledge only sizes against caps. The AI-surfaces redo should not invent its own quota enforcement for content.
- **Tenancy**: polymorphic {user|org} principal (A5a/D-S17) — personal users are user-keyed tenants with no Clerk org. Any auth/entitlement design in the MCP/API/CLI redo must use this canonical shape, never IdP-specific fields.
- **Auth is IdP-agnostic via the identity project** — MCP/API/CLI token verification should go through identity's JWKS/introspection, not directly to Clerk.
- **Events**: knowledge is consumer-only; the AI surfaces should not expect knowledge to publish events they can subscribe to for freshness signals beyond what SSE/projection-delta already expose.
- **Observability**: troubleshooting UI = orvex-studio-console over LGTM (not Grafana) — any new surface's admin/observability plan should route there, not build bespoke dashboards.
- **Cell-contract rules 1/3/4/5/6/10/11/13** apply to any new service in this family the same way — cluster-local peer DNS, cell-guard/421, liveness-vs-readiness split, tenant-move step-API, Idempotency-Key on internal endpoints, no-KEDA. These bind the MCP/wiki-api/CLI-backing-service redo equally if they deploy as cells.
- **Governance**: change-authority for any shared contract touching knowledge's surface is ADR-0008; a GA cutover may not pin a draft (`x-status: draft`) OpenAPI artifact (ADR-0035 §3) — this directly bears on when MCP/CLI can treat the knowledge query surface as stable.
- **Family audit stream**: orvex-studio-audit (ADR-0037) is now the canonical family audit sink — any new AI-surface admin-operations audit should target it, not invent a local audit log.

## 4. Staleness flags

Claims in this space contradicted by newer pages, by each other, or by the known 2026-07-16/17 live state (MCP live-green 19 tools on dev; wiki-api /v1 cutover done; streaming folded into existing tools per R21; audit-service PRD canonical):

1. **Internal self-contradiction, unresolved as of this space's latest pages (2026-07-15)**: the Architecture page (`azRwTCZMqw`, canonical) states in its own §5 "Open decisions" that the memory-corpus isolation GRADE is OPEN with attribute-scoped `owner_user` as the DEFAULT — and then, in its own "Memory gap-closure fold-in" section further down the SAME page, states AD-7 as DECIDED ("memory retrieval uses a Turbopuffer NAMESPACE WALL... Resolves OQ2"). The canonical PRD (`dCbFzRQGDr`) repeats the AD-7 "decided" framing verbatim. Story ENG-2369's title bakes in the namespace-wall side. R-9 (`0mFImku9Gp`), the draft explicitly meant to reconcile this, does NOT resolve it and is itself still `status: draft`. The Wave-3 PRD-delta/SDD/Build-Prompt (2026-07-15, all canonical as delta-pack artifacts) correctly flag this as MR-K1 and refuse to decide it. **Any AI-surfaces redo that touches Memory-corpus retrieval/isolation must treat this as unresolved, not settle it by picking whichever canonical page it read last.**
2. **README staleness (service-level, not this space, but repeatedly documented from this space)**: the orvex-studio-knowledge repo README says "scaffold — compiling skeleton" as of last touch 2026-07-06. This is confirmed FALSE by three Wave-3 pages (PRD-delta, SDD, Build Prompt, all dated 2026-07-15) — the service is MATURE-DEPLOYED (22 packages, 62 test files/11,658 LOC, 4 ArgoCD apps Healthy incl. PROD, prod bugfixes as recent as 2026-07-14). Per this session's memory (`certified-is-not-current.md`), deployed reality outranks doc status — this is a textbook instance and the wiki pages themselves already apply that discipline correctly.
3. **Healthy/green-CI is explicitly flagged (repeatedly, across NdH4benMGe, oqrEtMg46M, eFq4WnWOGC, XZiMOK2l4N) as NOT evidence of a working surface** for this service — `/readyz` is still TODO-probed and the M5 family-E2E gate (`TestM5KnowledgeE2E`) is RED and absent from main (ENG-2050) as of 2026-07-15. If more recent program state (post-2026-07-15) shows this gate now green, that would supersede these pages — worth checking against current Linear/CI state before treating "1 PASS/5 FAIL/1 BLOCKED" as still current.
4. **The contract freeze state (v0.1.3, 6/18 ops pinned) is dated 2026-07-15** — given the session context states wiki-api /v1 cutover is done and MCP is live-green 19/19 as of 2026-07-16/17, it is plausible the contracts repo has since advanced past v0.1.3 and pinned more of the query/SSE/projection surface (MR-K6/K7/K10 may have been resolved in the interim). This space's pages do not reflect any contracts advance after v0.1.3 / 2026-07-15 — **treat the "query/SSE/projection surface is draft" claim as possibly stale relative to the 2026-07-16/17 live state** and verify against the current contracts repo tag before relying on it.
5. **R21 (session memory: "MCP streaming folded into 19-tool surface, not separate tools")** is not mentioned anywhere in this space — this space's SSE/streaming discussion (FR-K15/A6/A6a) is scoped to the Orvex CLI's SSE wire contract, not MCP. No contradiction found, but also no corroboration — the MCP-streaming decision appears to postdate or sit outside this space's knowledge.
6. **Linear-issue source_type "removed"**: PRD change-log notes `linear-issue` source_type was removed from FR-K7 because "Linear is dropped product-wide" (D-S11/C1, 2026-07-05) — this is an old, already-folded-in decision, not a live staleness risk, but worth noting for anyone who still sees `linear-issue` referenced in older mirrors/branches.
7. **The audit-stream fold-in (ADR-0037, ratified 2026-07-16)** is the ONE piece of this space that is genuinely current and consistent with the session context's "audit-service PRD canonical" fact — it correctly names orvex-studio-audit as the family audit sink but flags that knowledge's own re-pointing to it is NOT yet built — a real, current, tracked gap rather than a stale claim.
8. **Turbopuffer commercial terms (OQ2/R14)** are repeatedly stated as "open, procurement action, not a design blocker" as of 2026-07-05/07-15 — if a vendor contract was since signed, this open item may now be closed; not verifiable from within this space.
