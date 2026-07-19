# orvexstudioknowledge — Discovery Digest

## 1. Mandate

orvex-studio-knowledge is the family's **single retrieval backbone**: one continuously-updated projection of wiki content (and, per the D-S12 broadening, any Studio entity), indexed into one hybrid keyword+vector store (Turbopuffer, committed D-S9), serving every retrieval surface — wiki UI search, AI/RAG, MCP agent search, Orvex CLI reads/cache-sync, bulk export bundles, and the SSE event stream — behind **one universal ACL choke point (FR-K12)** that governs every content-bearing egress surface. "The engine keeps zero search infrastructure; knowledge never decides access and never owns a model." Per R-9 (2026-07-05 binding ruling): knowledge is "THE one general multi-corpus search/RAG service" — wiki, Studio skills, Memory, and chat history all retire their own search stacks into it.

## 2. Inventory

- Architecture: orvex-studio-knowledge (canonical, ratified 2026-07-06)
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical)
  - R-9: Search-Stack Consolidation Design (draft)
- Importer Probe (delete me) (archived — junk/test page)
- PRD: orvex-studio-knowledge (canonical)
  - PRD Addendum — orvex-studio-knowledge (draft)

## 3. Decided vs draft

**Canonical / locked:**
- Datastore ruling **D-S12**: single Postgres (JSONB projection + RLS + range-partitioned append-table journals) + Turbopuffer + S3; **Mongo struck platform-wide**.
- **D-S9**: Turbopuffer committed (no longer pilot); vendor-neutral adapter seam kept as hygiene only.
- **D-S13**: Redis→Kafka bridge retired; engine's transactional outbox + relay publishes straight to Kafka — a launch prerequisite.
- **D-S14**: ranking lives in knowledge permanently (U13 closed, no wave-2 revisit); ai only consumes ranked results.
- **D-S17**: polymorphic {user|org} tenancy — personal users are user-keyed tenants, no Clerk org.
- **D-WF-1**: central Temporal in orvex-studio-workflows; knowledge runs no in-service Temporal worker, exposes idempotent step-APIs; NO KEDA (A-W6/C19) — KPA autoscaling only.
- **A5a**: IdP-agnostic auth (Clerk or Keycloak) via the identity project, superseding earlier Clerk-only wording.
- **A12 (Studio corpora ACL)** reinstated after being dropped in the D-S* fold-in — owner-scoped, employer-invisible, delegated-principal-only, ingestion-side exclusion.
- **D-R9-1/2/3/4/5** (R-9, binding though R-9 page itself is draft): every app chunks its own; per-content-type embedding models; no old-vs-new parity gate (forward-looking golden sets only); cutover order wiki→skills→memory/chat; each app owns its golden set, knowledge runs the harness.
- Binary count reconciled: **three binaries today** (`cmd/query`, `cmd/indexer`, `cmd/sse`) + `cmd/bundler` planned.

**Still draft / open:**
- R-9 page itself is status=draft despite carrying binding decisions.
- PRD Addendum is draft (architecture-depth detail).
- **OQ6 (content_pm parity)** — biggest flagged risk: projection stores text_repr/markdown only, no PM-JSON; must decide before CUTOVER.
- **A6a SSE cursor scheme** — `<topic-epoch>:<offset>` lacks epoch-ms/monotonicity CLI needs; open, ADR trigger.
- OQ2/R14 Turbopuffer commercial terms (multi-cell BYOC licensing) — open procurement item, not a design blocker.
- OQ3 CJK/multilingual tokenization — open, gate before SHADOW.
- Memory corpus isolation grade (attribute-scoped vs per-user namespace wall) — open, deferred to R-9 consolidation.
- ADRs 0001–0005 named but **not yet filed** — open human authoring action.
- DRAFT AMENDMENT (NFR-K11/12/13, ENG-1933, 2026-07-10) — pending ratification, not yet canonical.

## 4. API/contract surface

Authored in orvex-studio-contracts; knowledge conforms. Key surface (from Architecture §3 / PRD F3–F8):
- `POST /v1/query` (keyword|semantic|hybrid, facets, `corpora: []` selector), `POST /v1/retrieve` (RAG top-k), `POST /v1/related`, `POST /v1/duplicates`, `POST /v1/attachments/search`.
- `GET /v1/projection/delta?space&cursor` — CLI cache-sync (FR-K20), epoch-bearing cursor, hard-DELETE tombstones (FR-K20b).
- `POST /v1/bundles` + `GET /v1/bundles/:id` (FR-K18/19, principal-bound capability, A-bundle closes IDOR).
- `GET /events` (+`/head`, admin) — SSE gateway (A6/FR-K15/K15a): legacy unprefixed event names required (not `wiki.*`), 1 MiB max frame, <45s heartbeat, `Last-Event-ID`/cursor semantics load-bearing for CLI.
- `POST /internal/v1/keyword-upsert` (engine-only, FR-K4, ≤50ms budget, integrity-guarded); `POST /internal/v1/reindex`; `POST /internal/v1/tenant-move/{quiesce,export,import,activate}` (cell-contract rule 10, typed day-1 contract).
- All `/internal/*` require `Idempotency-Key` header (rule 11).
- `GET /healthz` (liveness, always-200, echoes CELL_ID+CLUSTER_NAME) vs `GET /readyz` (real dependency checks per binary) — O2 fix.
- **Maturity:** contract-shaped and detailed in design, but source-of-truth OpenAPI lives in orvex-studio-contracts (not in this space); SSE wire-contract, CloudEvent catalog, and cursor-scheme still have open decisions (A6a) that "must be pinned in contracts before CUTOVER."

## 5. Delivery state

Per the Architecture Audit (2026-07-05), build state = **SCAFFOLD**:
- `cmd/query`: `/healthz`→200; `POST /v1/query`→**501** (TODO Turbopuffer + engine ACL narrow).
- `cmd/indexer`: decodes a hand-rolled CloudEvent, logs, acks `wiki.page.updated` — TODO fetch/Tika/Turbopuffer upsert; **no idempotency/CAS; no orvexcell parse**.
- `cmd/sse`: `GET /events` opens a stub stream, holds until disconnect — **no Kafka consumer, no frames**.
- `internal/config/config.go`: missing `DATABASE_URL`, identity/JWKS URL, LiteLLM, `CLUSTER_NAME`.
- Deploy (kustomize): real/detailed for query+sse; indexer's Knative Service + kafka-triggers deferred/commented pending shared `studio-spine` broker; `cluster-config.yaml` points at **public** hosts, not cluster-local (R2, since fixed in design only).
- No tests anywhere; no `internal/{store,sources,acl}` layers yet.
- **Fake-done check: PASS** — audit explicitly notes stubs are "honestly labelled ('not_implemented', 'stub — not wired yet')."
- One later note (arch change log, ENG-1475, filed 2026-07-10): a rerank stage (`clients.Reranker`) was added to the ratified pipeline as nil-safe/off-by-default, with graceful-skip tests (`TestRerankerUnavailableGracefulSkip`) — suggests some `internal/search`/`internal/workflow` code now exists beyond the audit's SCAFFOLD snapshot (PRD's DRAFT AMENDMENT cites passing tests like `TestUnifiedSearchReadYourWritesAndCitations`, `TestHybridRetrieveRanksAndQuarantines`, `TestRebuildMeetsRTOBudget`, `TestUpsertDocumentVersionGuardedCAS` as of HEAD 2026-07-10) — build has progressed past pure scaffold in at least `internal/search`/`internal/workflow`/`internal/store/postgres`, though this space's own architecture audit hasn't been re-run to confirm.

## 6. Gaps & tensions

- **R-9 status=draft carries BINDING decisions** (D-R9-1..5) — a live tension between doc status and actual authority; digest treats them as decided per explicit "BINDING" labels but the page itself is unratified.
- **OQ6 content_pm parity** — flagged repeatedly (PRD, arch §5, audit) as "the single biggest FR-K22 parity risk," still open.
- **SSE cursor scheme tension (A6a)** — CLI depends on numeric monotonicity + epoch-ms lag that the proposed `<topic-epoch>:<offset>` scheme doesn't natively provide; unresolved, must pin before CUTOVER.
- **ADRs never filed** — five named triggers (Turbopuffer, single-Postgres/Mongo-struck, SSE cursor, source-adapter, central-Temporal) have no actual ADR pages; O1 finding, open human action.
- **No Decision Records page in this space at all.**
- **Studio-corpora ACL mechanics (A12) were dropped once already** during the D-S* fold-in and had to be reinstated by the SE-Arch audit (S1 HIGH) — signals fragility in change-management discipline around this canon.
- **Deploy-repo lag vs design**: `cluster-config.yaml` still targets public edge hosts, not cluster-local DNS (R2); SSE HTTPRoute lacks long-lived-connection timeout overrides (R4) — both explicitly out-of-scope "wont-fix" for wiki-only work, i.e. real follow-up needed elsewhere.
- **Memory corpus isolation grade** unresolved (attribute-scoped `owner_user` vs hard per-user Turbopuffer namespace wall) — deferred, no firm decision found in these pages despite a due date of 2026-07-10 having passed.
- **Comment-body indexing (OQ4)** and **CJK/multilingual tokenization (OQ3)** explicitly deferred/open.
- **Turbopuffer commercial terms (OQ2/R14)** — multi-cell BYOC licensing/support-SLA/escrow unresolved, called procurement-not-design but still a real external dependency risk.
- Junk page in inventory: "Importer Probe (delete me)" (archived, empty table/list scaffolding) — no content value, likely should be purged from the space.
