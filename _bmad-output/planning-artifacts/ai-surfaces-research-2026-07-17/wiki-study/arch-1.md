# orvexstudioarch — Slice 1 of 3 (lexical, first third: 12aDkq4iOd → dCNYFnoLNF)

Space: `orvexstudioarch` (family architecture canon, 123 pages total). This slice = 41 pages (alphabetically first third of the non-INDEX page list). Read via local read-only mirror `/home/daniel/repos/orvex-studio/.cache/docs/orvexstudioarch/`, synced 2026-07-17. INDEX.md hierarchy read first for context.

---

## 1. Per-page table (every page in slice)

| Slug | Title | Status | One-line substance |
|---|---|---|---|
| 12aDkq4iOd | ADR-0034: Credential lanes for agent execution | canonical | Deny-by-default allow-list credential lanes (control/build/verify) for dispatched sub-agents; replaces ADR-0006's withdrawn raw-key refuse-gate; scoped-ephemeral OIDC→OpenBao mint pattern; interim raw provider key legal until orvex-studio-ai broker ships. |
| 2nwLE1RUmd | PostHog | draft | PostHog Cloud EU (Frankfurt) is the product-analytics/session-replay/web-analytics platform, distinct from the LGTM ops stack; server-side CloudEvent bridge (consent-gated, pseudonymous) + client-side posthog-js; console fronts, never stores. |
| 32Huug8U4B | Decision Records — Orvex Studio | canonical | The ADR registry/index for the family; catalogs ADR-0001 through 0040 (as of sync) with status/summary; documents the renumbering history and a scan-before-file process guard. |
| 3diqY9yV7b | orvex-studio-identity | draft | Auth authority: dual-IdP (Clerk+Keycloak) verify/introspect, token minting, FR-15 exchange-token seam, global tenant→cell registry; scaffold with real progress on token-verification path (ENG-1944). |
| 4CdrayMofg | Tempo | draft | Distributed-tracing backend (LGTM "T"); TraceQL; console is the sole query UI (no Grafana server, waterfall is original console code per AGPL constraint); trace-context persisted (not propagated) across the outbox async seam. |
| 4vmBIkbP46 | Grafana & the LGTM Stack | draft | Umbrella page: Loki+Grafana(company)+Tempo+Mimir; Grafana server never deployed (AGPL); console is the sole observability UI reusing Apache-2.0 Grafana front-end libs. |
| 5C574cvOVZ | orvex-studio-knowledge | draft | Central read-optimized replica / search engine: hybrid keyword+vector (Turbopuffer), first Kafka-spine subscriber, SSE gateway for CLI cache-sync, bulk export bundles; scaffold, zero live index yet. |
| 6aMAzsYeQb | Coding Standards | canonical | THE binding engineering rules-of-engagement (CS) for the whole family — anti-slop table, TDD contract, mock boundaries, six-tier service shape, seam map, ADR triggers, CI/build substrate, wiki-first governance. Primary citation source for every PR/issue. |
| 6NzRX4JMMo | Technology Stack | draft | Catalog of ~26 technologies across 8 layers (edge, data plane, events/compute, workflows, identity/SaaS, observability, platform/delivery, collaboration); most application-facing pieces provisioned but not exercised. |
| 79YR5C7caM | ADR-0006: Orchestrator execution seat | canonical | Delivery orchestrator runs on the operator's laptop (not in-cluster crew pod); ≤32 concurrent sub-agents; credential model (control lane never leaks down); persistence = git+GitHub; amended 2026-07-07 to allow agent API keys (never-block > hard gate). |
| 7D3Ic5hsZk | Questions for Daniel — Studio Reframe Autonomous Run | archived | Historical decision log from the 2026-07-03/05 autonomous run; 10 numbered questions resolved/reversed/re-reviewed (tenancy model, canon service list, plans owner, search consolidation, AI guardrail, event backbone=Kafka-first, background jobs=central Temporal, pricing, code reuse, naming). |
| 7E0Hbb9it2 | ADR-0003: Frozen QUOTA_EXCEEDED (402) contract | canonical | Freezes over-quota signal as HTTP 402 + errorCode QUOTA_EXCEEDED family-wide; never 429, never destructive; reads/exports/deletes always succeed; verdict is domain logic; pinned in orvex-studio-contracts. |
| 7Okcxv4i3Y | ADR-0040 (draft): Workgraph Claim Lease Shape | draft | PO RULED 2026-07-17: claim lease is AUTHORITATIVE (grantToken/grantExpiresAt), not advisory — a hard dispatch gate pulling the combined ADR-0033-CAS + ADR-0034-credential redesign into v1 scope; distinct `CLAIM_CONFLICT` (409) errorCode settled; Part B (ADR-0034 workgraph door-auth amendment) remains draft/unratified. |
| 7QkzUaXZJK | orvex-studio-billing | draft | Stripe + entitlement system-of-record for both products (wiki + Studio); plan catalog, entitlement versioning (append-only, grandfathering), never enforces itself (ai/wiki-engine enforce); scaffold, zero Stripe code yet. |
| 86CiGucQwU | URL, Environment & Multi-Region Scheme | canonical | 3 environments (prod/dev/crew); flat `{service}.orvex.{tld}` hosts for Studio/shared services vs cell-in-hostname for wiki (`{tenant}.wiki.{cell}.orvex.tld`); tenant→cell global registry; dev = prod with .ai→.dev. |
| 8kTZK91vHd | ADR-0028: 402 vocabulary — staging/workgraph enrollment | canonical | Enrolls orvex-studio-staging and orvex-studio-workgraph write surfaces into the frozen 402 QUOTA_EXCEEDED vocabulary (ADR-0003 D5 lane); pricing dimensions remain open. |
| 8sYi523i4t | SE Architect — Review Agent | canonical | The adversarial architecture-review doctrine: Well-Architected lenses (reliability/security/cost/opex/perf), decision trees (seam/event/store/package design), ADR triggers, fake-done prevention, merge-boundary rules (resolve-at-merge-gate, no prevent-at-dispatch). Reviewer never the implementer. |
| 8titaI7P5P | Keycloak | draft | Second first-class per-tenant IdP (self-hosted/BYO-IdP path), brokered behind identity alongside Clerk; reserved for standalone deployments needing no external SaaS dependency; live E2E parked per ADR-0009, code path built. |
| 94xrZhXCej | ADR-0009: Auth-flow / exchange-token contract | canonical | Dual-IdP → exchange-token → engine session-mint flow ratified; Clerk-first (dev instance reused), Keycloak live E2E parked; identity GA is a hard prerequisite for removing native engine login (no fallback issuer). |
| 9A8BcWctzC | ZZZ Publish Path Test (delete me) | archived | Test/debris page — no substantive content, slated for deletion. |
| 9KcwAG5SRg | ADR-0020: MCP cell-discovery routing | canonical | Discover-once-then-pin-by-account cell routing for the MCP gateway global entry; invalidation only on real 421; SOLO_CELL short-circuit; fail-closed on ambiguous/missing cell claims. |
| 9VUHxAcoXw | Issue Authoring Prompt — Project Milestones & Issues | canonical | The fill-in-the-blanks prompt template producing un-fakeable, fully-traced Linear issues for autonomous agents; 17 hard requirements (H1-H17); merge boundary = per-repo GitHub PR gate, collisions resolved by rebase at merge, never prevented at dispatch. |
| AD0LBqmjtA | Mimir | draft | Metrics store (LGTM "M"), Prometheus-compatible/PromQL; every Go satellite emits via `pkg/obs`; engine emits via its own TS OTel SDK (ADR-0016); console is the sole read-only query UI. |
| ag6EECjLHu | Build Log — Studio Split Delivery | archived | Historical ledger of the 2026-07-03 autonomous split-out session: 13 repos scaffolded, 14 wiki spaces created, docs published as drafts, decision record + corrections (who-pays reversed, naming, cell-token URL grammar). |
| AJzAntNPsz | ADR-0010: studio.* CloudEvent type taxonomy | canonical | Ratifies `studio.<subdomain>.<event>` naming/envelope taxonomy for Studio-product-origin events (skill/memory/chat); envelope conforms to ADR-0007; concrete schemas land as-built; taxonomy stable ahead of Studio product build. |
| akzWiopQBD | ADR-0016: Engine distributed tracing | canonical | Engine (AGPL/TS) adopts TS OTel SDK conforming to obs/CONVENTIONS.md without importing pkg/obs; trace-context PERSISTED (not propagated) across the outbox async seam via new outbox columns + CloudEvent Distributed-Tracing extension; consumers LINK not child. PO direction: embrace Tempo/OTel best practices, embed Apache-2.0 Grafana UI controls (never the AGPL server); corrected 2026-07-09 — trace waterfall must be original console code (Grafana's waterfall is AGPL-only). |
| AqPkQypf5a | Architecture Audit — Family Rollup (2026-07-05) | canonical | SE-Arch adversarial audit of 14 repos: zero passed clean, 3 contradict canon (orvex-cli, mcp, lib), 21 HIGH findings; two dominant gaps — day-1 cell contract unhonored in ~13/14 services, and zero ADRs filed (no registry existed yet); 7 cross-cutting themes + 16 consolidated open decisions. |
| AqXpAlgvIv | ADR-0025: Workgraph supersedes OPS agent-side memory | canonical | Workgraph PRD supersedes OPS "Memory & The Librarian" agent-side design and narrows ai's FR-AI11 to user-facing chat-recall only; `/v1/memory` FormSpec store (user product) stays untouched — workgraph starts empty, no migration. |
| B66dINHNvs | orvex-cli | draft | The one platform CLI (Go/cobra): wiki/search/ai/auth/admin namespaces, domain-pure routing (never engine-direct); from-scratch rewrite using docmost-cli as behavioral reference only; scaffold — repo has 2 files, no code. |
| BfqcqwCHZZ | orvex-studio-workflows | draft | Central Temporal control plane (one home for all durable workflows family-wide); only clerk-lifecycle domain is live; owns no datastore; several safety nets not-yet-built (no WorkflowReplayer CI gate, AUTHORITATIVE retry still capped at 10, no DLQ). |
| bL9bUj4tua | ADR-0014: Knowledge store engine = Turbopuffer | canonical | Turbopuffer is the SOLE knowledge/search store (no pgvector primary/pilot); namespace-per-tenant structural isolation; cross-tenant bytes=0 probe is the top M5 gate; key in OpenBao. |
| bLhqYrJLRu | orvex-studio-ai | draft | The AI brain: chat/ask(cited-RAG)/inline via LiteLLM (sole model gateway family-wide); owns the cited-ask loop end-to-end, PII/secret redaction, cost metering+enforcement (per-caller budgets + tenant hard cap); ground-up Go rewrite (not ported from AGPL); scaffold. |
| BO1PMLK9hn | OpenTelemetry | draft | The vendor-neutral instrumentation standard/OTLP wire protocol every service is meant to speak; W3C trace-context propagation; engine emits zero signals today (vanilla Docmost). |
| bpmGdbGXiN | Temporal | live | Durable-execution engine; ONE shared cluster/namespace-per-app in orvex-studio-workflows; four-role domain template (ingest→dispatch→workflow→activity); sanctioned global-singleton exception; live for clerk-lifecycle only, several decided rules (ID-only payloads, unbounded AUTHORITATIVE retry) not yet true as-built. |
| C3EDqJjJjq | Research — Centralized Audit Service (orvex-studio-audit, #18) | archived | SUPERSEDED duplicate of the audit research (canonical lives in orvex-studio-audit space, page zPssXupzLZ). Recommends building orvex-studio-audit as an 18th Go microservice: durable-async off studio-spine, 3-tier same-stack storage (Postgres hot / Rook-Ceph S3 WORM warm-cold / AWS Glacier Deep Archive offsite DR), hash-chain+signed-checkpoint tamper-evidence, 6-year uniform retention floor, novel completeness/gap-detection design. |
| CBXmt8eSVq | Our Systems | canonical | The 18-component roster (17 services + 1 extension) in 3 tiers: products&shells, wiki tier, shared platform services; build-state honesty note — only mcp and workflows carry real code, engine is vanilla Docmost, everything else is 501-stub scaffold or earlier. |
| chBPEXsXPR | Turbopuffer | draft | Hosted hybrid vector+FTS search database; sole owner = orvex-studio-knowledge; namespace-per-tenant (structural isolation, ADR-0014); RRF fusion; account live/keyed but index not built; workgraph rides knowledge's index rather than its own vector store. |
| cpeenW2R9t | Doc Governance — Drift & Spec-Gate | canonical | Drift detection + spec-gate (page-content governance, distinct from contracts-repo code drift-gates) owned by orvex-wiki-api; engine only stores 3 stamp fields; spec-gate DROPPED for now (was Linear-dependent), drift is active; surfaced via orvex-cli/MCP. |
| CxjFpIVUZY | Orvex Studio — Architecture & Principles | canonical | THE family constitution: 13 principles (primitives-in/brains-out, events-as-integration, contract-first, one auth spine, one datastore doctrine, one Temporal home, workload shapes, fail-closed, multi-publisher, AGPL boundary, two-products-one-platform, one CLI, observability-as-product), full family/service roster table, system diagram, URL scheme, Kafka event catalog, platform substrate table, TLS chain. Contains a 2026-07-17 roster CORRECTION note (see Staleness flags). |
| DBA3v1gglh | Architecture Spine: orvex-studio-staging | archived | Full architecture spine for the Agent Staging Area + Librarian service: state-machine pipeline, 14 architecture decisions (AD-1..AD-14) covering conflict keying, wiki-write chokepoint via wiki-api only, central Temporal orchestration, per-tenant autonomy dial as server-side domain verdict, tenancy/RLS, staging events as telemetry (wiki.* is truth), pointer-state S3 payloads, quota, supersession-is-loud cutover, beautify-at-triage, learning/pack governance. |
| dCNYFnoLNF | orvex-wiki-api | draft | The Go composition/facade tier in front of the AGPL engine: verb grammar (search/get/save/edit/list), DfM⇄ProseMirror serialization (clean-room pkg/dfm), atomic block-patch with CAS (ifVersion), drift/spec-gate (re-homed from engine per D-S8), never talks to ai's cited-ask; Phase-0 byte-compatible proxy is real+live, composition tier actively landing. |

---

## 2. Deeper summaries — load-bearing pages

### `6aMAzsYeQb` — Coding Standards (CS) — CANONICAL
- Binds every family repo (Go services, orvex-cli, contracts, lib, the AGPL TS wiki engine, React fronts); cited as `CS §N` in every Issue's "Guidance to follow" block.
- **❌ 12-item anti-slop table**: domain logic in handlers/cmd banned, store driver confined to its package, no premature interfaces (one-adapter rule — port only at network seams), never mock own packages, no horizontal slicing, no big-upfront schema, no shallow pass-through, no inline credentialed client, no time/rand in projections, no raising a ratified ceiling to pass CI, no `any`/`interface{}` laundering across boundaries.
- **§0 binding gate**: independent adversarial review (reviewer ≠ implementer) is required before any Issue moves to Done; tickable DoD checkboxes; unchecked box = fake-done.
- **§3 deep-module discipline**: deletion test, one-adapter rule (in-process/local-substitutable = ONE adapter, no port; port justified only at network boundary — Kafka/Redis/Temporal/sibling-service = remote-but-owned; Clerk/Keycloak/Stripe/Linear/GitHub/LiteLLM/Turbopuffer = true-external), design-it-twice (mandatory ≥2-interface sketch for any new seam/domain package/contract change).
- **§5 mocking table**: mock ONLY true-external/remote-but-owned boundary ports; local-substitutable (Postgres) uses testcontainers; never mock a package you own.
- **§6 six-tier shape per Go service**: handler/workflow/domain/store/event/cache, each with strict prohibitions; cross-service rule = never share a database, always cross the pinned contract seam; LLM confinement — no provider client exists anywhere except orvex-studio-ai's LiteLLM bridge.
- **§9 ADR triggers**: costly to reverse AND reasonable engineers differ AND constrains future work (all three).
- **§10 zero-trust**: secrets via env only, GitOps ExternalSecrets, telemetry three-way split (metrics→Mimir OTLP, ops logs→Loki, domain/audit events→CloudEvents on studio-spine — NEVER Loki).
- **§13/§14 (amended 2026-07-07 twice)**: private repos → shared self-hosted `runners` group; public repo `orvex-wiki` → dedicated `public-runners` group (ephemeral, non-privileged, no OpenBao/cluster-admin reach); CI never builds/pushes images — Tekton→Harbor exclusively with auto-rollout; stable dependency versions must come from the authoritative stable channel (npm `latest` dist-tag / Go non-prerelease / PyPI stable), never the numerically-highest published version.
- **§12 wiki-first**: the orvexstudioarch + per-service spaces outrank local files for intent; AI writes drafts only; draft→canonical is human-only doc-ratify.

### `CxjFpIVUZY` — Orvex Studio — Architecture & Principles — CANONICAL (family constitution)
- **Principle 1** — primitives stay in the AGPL engine, brains move out to closed satellites (licence-compliance strategy).
- **Principle 2** — events are the integration surface: transactional outbox → relay → Kafka `studio-spine` CloudEvent; NO Redis→Kafka bridge, no polling, no dual-write.
- **Principle 3** — contract-first, one seam (orvex-studio-contracts, Apache-2.0); contracts governance is FULLY AUTOMATED (agents author/evolve; CI drift-gates + AGPL import-guard are the only police — no human ratify step for contracts themselves, distinct from the wiki's own doc-ratify).
- **Principle 4** — one IdP-agnostic auth spine via identity; polymorphic tenancy `{user|org}`; no native engine login; one break-glass credential (console admin plane only).
- **Principle 5** — one datastore doctrine: Postgres (CNPG/RLS) + Redis (speed-only) + S3 (Rook-Ceph) + Turbopuffer (search/RAG, the one approved 4th store).
- **Principle 6** — one Temporal home (orvex-studio-workflows); satellites expose idempotent step-APIs, never run their own worker; ID-only payloads.
- **Principle 7** — workload shapes by role (Deployment for request-serving/streaming, Knative for event-driven scale-to-zero, fixed-replica for Temporal worker).
- **Principle 8** — fail closed, verify by probe; egress narrows through live ACL ∩ token-scope on every request.
- **Principle 9** — multiple publishers, multiple consumers (source-adapter registration, no pipeline change).
- **Principle 10** — closed code never imports AGPL; network-only reuse; clean-room `pkg/dfm` serializer.
- **Principle 11** — two products (wiki, Studio), one platform; shared services serve both as peers.
- **Principle 12** — orvex-cli is the ONE command line for the whole platform, domain-pure routing, never engine-direct.
- **Principle 13** — observability is a product (Tempo/Mimir/Loki via OTel, console fronts).
- Full service roster table (17 services + engine), system diagram, Kafka event catalog table, platform substrate table, TLS chain, URL scheme.
- **Standalone deployment rule**: a wiki install ALWAYS ships the full family stack (identity/ai/knowledge/mcp/console/billing/workflows) — no absent-satellite degradation path is permitted (Ruling 5).
- **2026-07-17 roster correction banner** (see Staleness flags below) — the MCP roster rows in this very page contain a known-wrong inversion that the page itself flags but has not yet fixed in-table.

### `8sYi523i4t` — SE Architect — Review Agent — CANONICAL
- The adversarial review doctrine every PR is graded against; pairs with CS.
- Well-Architected lenses ranked for Orvex Studio: correctness-first/fabricate-nothing, tenant isolation+security, reliability (outbox-not-dual-write, idempotent consumers, Temporal crash-resume), AI/cost governance, observability.
- **Merge-boundary doctrine (RETIRED items explicitly named)**: OWNED-files / must-NOT-touch lists / machine-enforced file ownership / disjoint-file-set dispatch / "conflict-free by construction" are ALL retired — do not flag a PR for violating them. Collision model = pure resolve-at-the-merge-gate (branch protection + CI); two agents MAY touch the same file; the second PR to land hits the conflict and rebases. Hot-file contention is observability only, never a dispatch gate.
- Linear/GitHub write discipline: app/bot-attributed, idempotent, echo-suppressed, NEVER auto-close — Done is orchestrator-gated only.
- Mandatory ADR triggers list (new external dependency, CloudEvent/topic schema change, store schema affecting projections, auth-flow change, any contracts change, parallel-agent-ceiling change, merge-authority-boundary change).
- Fake-done prevention: the coding agent cannot advance Linear to Done — only the orchestrator can, after PRs merge + review PASS.

### `9VUHxAcoXw` — Issue Authoring Prompt — CANONICAL
- Produces one Linear issue body an autonomous agent executes end-to-end with ZERO architecture decisions left to make (seam, deep module, tiers, versions, adapters, mocking strategy all pre-named).
- 9 mandatory output sections; H1–H17 hard requirements; the merge-boundary section (H10) restates SE-Arch's retired-collision-avoidance doctrine verbatim: repos are DISCOVERED from the work not declared, collisions resolved by rebase at the per-repo PR gate, no file ownership.
- Every completable item (AC/task/test/DoD-checkbox/review-gate) must be a tickable `- [ ]` — plain prose for a completable item is a defect.
- §9 STAGE-BY-STAGE Linear protocol: claim→plan→continuous progress→commits ("Part of ENG-NNN", never auto-close)→handoff→QA→tick→Done (orchestrator-only)→escalations.
- Includes full CS §7 seam-map and §5 mocking-category cheat-sheets as copy-paste reference tables — directly reusable for the MCP/API/CLI PRD-architecture redo's own issue authoring.

### `AqPkQypf5a` — Architecture Audit — Family Rollup (2026-07-05) — CANONICAL
- 14 services audited (orvex-studio-linear excluded, postponed); zero passed clean; 3 contradict canon (orvex-cli, orvex-studio-mcp, orvex-studio-lib); 21 HIGH findings total.
- **Cross-cutting themes (fixed once at family level, not per-service)**: CC-1 day-1 cell contract unhonored in ~13/14 services; CC-2 no ADRs filed anywhere (blocked on the missing Decision-Records registry, since created); CC-3 liveness/readiness conflation; CC-4 the phantom "Redis→Kafka bridge" still cited on some pages despite canon abolishing it; CC-5 outbox omitted on a service's OWN producer path (dual-write); CC-6 URL-scheme divergence from canon; CC-7 stale change-log archaeology (org-keyed tenancy bullets not yet struck).
- 16 consolidated open decisions (OD-1..OD-16) fed into Act-1 — many since resolved by later ADRs in this same slice (e.g. OD-2 contracts change-authority → ADR-0008; OD-6 cell-routing for flat-hosted services → ADR-0020 for MCP).
- HIGH findings directly relevant to MCP/wiki-api/CLI: mcp's Redis→Kafka bridge for revocation (canon-forbidden — later resolved by ADR-0013's raw in-process Kafka consumer exception), mcp's stale DOCMOST_SERVICE_TOKEN README claim, wiki-api's phantom bridge citation, studio-api's TS-can't-import-Go-lib/auth blocker (OD-4, still cited as unresolved by name in this slice).

### `AqXpAlgvIv` / `7Okcxv4i3Y` — Workgraph ADRs (0025, 0040-draft)
- ADR-0025 (canonical): the naming/ownership split between the user-managed memory product (`/v1/memory` FormSpec store in orvex-studio-api, untouched) and agent-side coordination (workgraph, new). "memory" never used for the coordination service.
- ADR-0040 (draft, PO-ruled 2026-07-17 on Part A only): claim lease is AUTHORITATIVE not advisory — a hard, no-two-agents-ever-hold-the-same-claim dispatch gate; pulls the ADR-0033 Temporal-CAS successor + ADR-0034 per-agent-OIDC credential redesign into v1 scope; distinct `CLAIM_CONFLICT` (409) errorCode settled, `retryable:false`+`retryAt:"next-ready"`; `gen.Error` needs a `details` field added before this is buildable; Part B (declaring workgraph in ADR-0034's credential-lane model) remains an unratified recommendation. Directly relevant precedent for MCP's own claim/lease-style tool design.

### `DBA3v1gglh` — Architecture Spine: orvex-studio-staging (archived, but load-bearing precedent)
- Full worked example of a satellite architecture spine following the six-tier shape with 14 numbered architecture decisions — a template shape the MCP/API/CLI redo's own architecture spines should likely mirror.
- AD-4 is the sharpest precedent for wiki-api/MCP: ALL wiki writes go through wiki-api exclusively, with agent-class tokens 403'd at wiki-api ingress and only human + the privileged apply-engine service credential passing.
- AD-9: `studio.staging.*` events are telemetry only — `wiki.*` events (from the engine's own outbox) are the sole reindex trigger; staging is explicitly NOT a P9 content-source (no source-adapter).

### `C3EDqJjJjq` — Research: Centralized Audit Service (archived duplicate)
- Superseded by canonical page `zPssXupzLZ` in the `orvex-studio-audit` space (not in this slice) — flagged per memory: "Audit+compliance service incoming — Daniel designing it personally, fold-in imminent; artifacts here = seam reservations only, his design supersedes."
- Still useful as background: recommends `audit.<category>.<verb>` CloudEvent type family extending ADR-0007's envelope, a durable-async write model off the same transactional-outbox+relay guarantee as everything else, and a raw in-process Kafka consumer group (the SECOND documented exception to Knative-Trigger-default after ADR-0013's MCP gateway) — this pattern (always-on service, no scale-to-zero, no Knative cold-start risk) is precedent the MCP/wiki-api redo can cite if either needs the same exception.

---

## 3. Bindings on the AI-surfaces redo (MCP / wiki-api / CLI)

Commitments from this slice that constrain or directly inform the PRD/architecture redo for orvex-wiki-api, orvex-studio-mcp, and orvex-cli:

**Layering / contracts**
- Principle 3 (CxjFpIVUZY): orvex-studio-contracts is the ONE pinned seam (OpenAPI + CloudEvent catalog + golden fixtures); contracts changes are agent-automated for additive changes, ADR+human-ratify only for breaking/reshaping (ADR-0008 — not in this slice but referenced repeatedly, e.g. by ADR-0028, DBA3v1gglh).
- wiki-api's own served `/v1/openapi.json` is a CONFORMANCE CHECK ONLY — never the source of truth; the contract is authored in orvex-studio-contracts first (dCNYFnoLNF).
- CS §7 seam map (reprinted in 9VUHxAcoXw) is the canonical reference for classifying every new seam MCP/wiki-api/CLI introduce (in-process/local-substitutable/remote-but-owned/true-external) — directly reusable when authoring the redo's own Issues.
- No service imports another's database; wiki verbs from CLI/MCP must go through orvex-wiki-api, NEVER the engine directly (Principle 12, B66dINHNvs "domain-pure routing").

**MCP-specific**
- ADR-0020 (canonical): discover-once-pin-421 cell-routing model for MCP's global entry — front-door redirect only, never per-request proxying; pin invalidated ONLY by a real 421, never by re-resolve heuristics. Binding shape for any MCP routing/tool-dispatch redesign.
- CxjFpIVUZY roster table STILL SAYS "mcp routes knowledge via wiki-api + ai (not directly)" in its live table cells — but the page's own 2026-07-17 banner says this is WRONG and the correct, PO-ruled split is: search/related → knowledge DIRECT (ENG-1403, Done); ask → ai; wiki verbs → wiki-api. Any MCP architecture redo MUST use the corrected split, not the stale table cells (see Staleness flags).
- AqPkQypf5a HIGH finding: MCP's revocation-consumption originally cited a canon-forbidden Redis→Kafka bridge — resolved by a later ADR (ADR-0013, referenced but not itself in this slice) sanctioning a raw in-process Kafka consumer as a scoped exception (always-on service, no Knative cold-start risk). If the redo touches MCP's event consumption, this precedent + its exception rationale is directly reusable.

**wiki-api-specific**
- dCNYFnoLNF: verb grammar `search/get/save/edit/list` over `{resource_type, locator}` is the stable agent-facing contract; block-patch orchestration uses the engine's single atomic `apply-ops` primitive with CAS `ifVersion` (409 VERSION_MISMATCH on staleness); doc-governance (drift + spec-gate) lives HERE not in the engine (cpeenW2R9t) — spec-gate is currently DROPPED (Linear-dependent, rebuildable via text-only story-id matching), drift is active.
- wiki-api holds NO durable store; Redis caches only principal-independent artifacts (never shaped/ACL-gated response bodies) — "the engine stays the cache for anything access-controlled" (D-A10).
- Every upstream call from wiki-api forwards the caller's own token verbatim — never an elevated service credential on user-facing paths (ADR-0021, referenced not in-slice, but the pattern is stated here too).

**CLI-specific**
- B66dINHNvs: orvex-cli is a from-scratch rewrite (not a fork of docmost-cli) using docmost-cli's output/exit-code contract as a BEHAVIORAL SPEC ONLY, never imported (AGPL-clean provenance). Namespace-first (`wiki/search/ai/auth/admin`), each routed to exactly one owning service. Local SQLite read-cache kept warm via SSE from knowledge (not the Kafka spine directly). Codegens typed clients from the pinned contracts OpenAPI tag, never from a live server's descriptor.
- Flat family hosts for all services except the wiki tenant host (which alone is cell-segmented) — corrected from an earlier draft that wrongly cell-segmented every host.

**Quota / 402 contract (binds any new write verb in MCP/CLI/wiki-api)**
- ADR-0003 (canonical, frozen): 402 + `QUOTA_EXCEEDED` is THE over-quota shape family-wide; never 429, never destructive, reads/exports/deletes always succeed; verdict is a domain function, never handler-embedded.
- ADR-0028 shows the enrollment PATTERN for new write surfaces (staging, workgraph) into this frozen vocabulary — any new MCP/CLI write verb needing quota enforcement follows the same ADR+human-ratify D5 lane, not an ad-hoc error shape.

**Credential/auth lanes (binds how MCP/CLI agent tooling is itself built, and how agent-facing tokens work)**
- ADR-0034 (canonical): deny-by-default allow-list credential lanes for build/verify/control sub-agents — directly informs how any agent-facing MCP tool credential should be scoped (mint-scoped-ephemeral, never a standing master key).
- ADR-0009 (canonical): exchange-token → engine session-mint is the ONLY interactive-login path; MCP/CLI never talk to an IdP directly, they consume identity-minted scoped tokens (per 3diqY9yV7b, "MCP/agent tokens... claims frozen at mint").
- ADR-0020's SOLO_CELL short-circuit and 421-only pin-invalidation model is the concrete worked example for how MCP should route/re-route without per-request proxying overhead.

**Governance / process (binds how the redo's PRDs/architectures/tickets should be produced)**
- 9VUHxAcoXw is the literal template to reuse for authoring the redo's own Linear issues (H1-H17 hard requirements, tickable-everything, merge-at-gate-not-dispatch).
- 8sYi523i4t is the literal review lens to apply to the redo's own PRs.
- CS §9's three-part ADR trigger test binds: any new external dependency, CloudEvent/contract change, auth-flow change, or store-schema-affecting-projections change coming out of the redo needs a filed ADR (next-free number must be re-scanned live, per 32Huug8U4B's own caution against trusting a hardcoded "next free" line — a caution born from three real same-day ADR-number collisions on 2026-07-10).

**Observability (binds any new MCP/wiki-api/CLI telemetry)**
- CS §10 three-way split: metrics→Mimir (OTLP), ops logs→Loki, domain/audit events→CloudEvents on studio-spine (never Loki) — applies to any new MCP or wiki-api emission.
- akzWiopQBD's consumer-LINK-not-child + outbox trace-context-persistence pattern is the binding shape if wiki-api or MCP ever needs to correlate a trace across the async outbox→Kafka boundary.

---

## 4. Staleness flags — claims in this slice contradicted by newer state or the 2026-07-16/17 live picture

1. **`CxjFpIVUZY` MCP roster rows are self-flagged stale as of 2026-07-17.** The page's own banner (added 2026-07-17) says the "Family" and "Services & responsibilities" table rows still read *"routes knowledge via wiki-api + ai (not directly)"* — but this is a known-wrong inversion introduced by a stale OD-7 side-note applied verbatim during an "OD-7 canon-hygiene batch." The CORRECT, PO-ruled split (per PO ruling 9 / D-M8, ENG-1403 Done) is: **search/related → knowledge DIRECT**; **ask → ai**; **wiki verbs → wiki-api**. The table cells themselves are NOT yet fixed (embed/table format prevents an in-place patch) — the banner is the authoritative correction. **Any redo work reading this page's tables verbatim will get the MCP↔knowledge relationship backwards.**

2. **MCP live-green 19-tool state (per orchestrating-agent context, 2026-07-16/17) is NOT reflected anywhere in this slice.** Every MCP-adjacent page here (`CxjFpIVUZY` roster, `9KcwAG5SRg` ADR-0020, `AqPkQypf5a` audit) describes MCP as `partial`/scaffold-with-real-code or names 2026-07-05/07-10-era findings. None of the pages in this slice mention amazing-MCP, the 19-tool surface, or R21 (streaming folded into existing verbs). The redo must treat this slice's MCP framing as **pre-delivery design**, not the current shipped state — cross-check against the MCP service's own space (orvexstudiomcp, not in this slice) and the live deployment for the actual current tool roster.

3. **wiki-api /v1 cutover-done state is not reflected.** `dCNYFnoLNF` (synced 2026-07-13) still frames wiki-api as "Partial — Phase-0 proxy live, composition tier landing," with drift/spec-gate re-homing "designed (Phases 1-2) but not yet built," and explicitly warns: *"Treat any claim of 'drift/spec-gate live' or 'search fronting live' as forward-looking design, not current behavior."* Given the orchestrating context says wiki-api /v1 cutover is done, this page is now behind the live state — verify current wiki-api build status against its own space / live deployment rather than this snapshot.

4. **`cpeenW2R9t` doc-governance page frames spec-gate as "DROPPED for now"** because it depended on the removed Linear ProseMirror-node-scan trigger — but the memory context notes Linear integration and `docmost-cli`/`orvex-cli` tooling has since matured substantially (e.g., ratify-token guards, force-self-ratify). Confirm whether spec-gate has since been rebuilt via the text-only story-id matching this page names as the intended replacement path, since that rebuild was open as of this page's last sync (2026-07-08).

5. **Audit-service research (`C3EDqJjJjq`) is explicitly self-marked superseded** by a canonical version in the `orvex-studio-audit` space, and per user memory, Daniel is personally designing the audit/compliance service now (2026-07-16) — this slice's copy should be treated as historical background only, never cited as current audit-service design; any binding here is a "seam reservation," not a commitment (per the audit-compliance-service-incoming memory note).

6. **`AqPkQypf5a` (2026-07-05 rollup) cites several HIGH findings and open decisions that later ADRs in THIS SAME SLICE have since resolved** — e.g. OD-1 (no ADR registry) was closed by the creation of `32Huug8U4B`; the "phantom Redis→Kafka bridge" cross-cutting theme (CC-4) for MCP's revocation consumption was resolved by ADR-0013's raw in-process Kafka consumer exception (referenced by `32Huug8U4B` and `9KcwAG5SRg` but ADR-0013 itself is not in this slice). Treat AqPkQypf5a's finding list as a HISTORICAL SNAPSHOT whose "still-open" framing needs re-verification against the current Decision Records registry (`32Huug8U4B`), not as live findings.

7. **`ag6EECjLHu` Build Log (archived, 2026-07-05)** contains an explicitly-marked-superseded decision (Q1 "who pays" — reversed twice within the log itself: orgs-from-the-start → then reversed back to polymorphic user|org with free=personal-account). The log's own "Post-log corrections" section flags this. Safe to use only for historical provenance, not as a live decision source — `32Huug8U4B`/`CxjFpIVUZY` are the current authorities on tenancy.

8. **`akzWiopQBD` (ADR-0016) required a 2026-07-09 in-page correction** to its own Decision-3/4: the trace WATERFALL cannot be an embedded/copied Grafana component (AGPL-only, `@grafana/ui` has zero trace-viewer components) — only the pane shell/controls can be Apache-2.0-embedded; the waterfall itself must be original console code. Any redo touching observability UX should cite the corrected position (§ "Correction — 2026-07-09"), not the original Decision-3/4 text.

9. **Draft-status pages presented as settled design should be flagged as unratified**: `2nwLE1RUmd` (PostHog), `3diqY9yV7b` (identity), `4CdrayMofg`/`4vmBIkbP46`/`AD0LBqmjtA`/`BO1PMLK9hn` (observability stack pages), `5C574cvOVZ` (knowledge), `7QkzUaXZJK` (billing), `8titaI7P5P` (Keycloak), `B66dINHNvs` (orvex-cli), `BfqcqwCHZZ` (workflows), `bLhqYrJLRu` (ai), `chBPEXsXPR` (Turbopuffer), `dCNYFnoLNF` (wiki-api) are ALL status:`draft` — substantively mature and internally consistent, but not yet human doc-ratified. Cite with the draft caveat in any downstream PRD/architecture that treats them as binding.

10. **ADR-0040 (`7Okcxv4i3Y`) is only PARTIALLY ratified.** Part A (authoritative claim lease + CLAIM_CONFLICT code) is PO-ruled and settled as of 2026-07-17. Part B (the proposed ADR-0034 door-auth amendment declaring a workgraph credential lane) is explicitly still an unratified DRAFT recommendation, and the canonical ADR-0034 page (`12aDkq4iOd`) itself has NOT been edited to reflect it. Do not treat workgraph as having a declared ADR-0034 credential lane yet.
