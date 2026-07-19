source: /home/daniel/repos/orvex-studio/.cache/docs/orvexstudioworkgraph/ (3 pages, all status: canonical)

## 1. Mandate

`orvex-studio-workgraph` is a hosted, multi-tenant coordination service — a "blackboard coordination kernel" — where a customer's chat/CLI agents log work, discover each other's context, claim/hand off items, and start every session pre-primed via a `prime` call ("~200 tokens"), cutting token cost session over session. Its data model and rituals are cleanroom-reimplemented from Steve Yegge's **beads** (MIT, no CLI shipped); delivery is MCP-first with CLI parity, since ChatGPT/Claude chat platforms have no hook system. It is explicitly NOT the user-managed memory product (`/v1/memory`, `studio.memory.*`) — that stays product-side, untouched. Positioned as market-unoccupied: "Nobody in the profiled market combines a queryable multi-agent work-graph with curated knowledge routing."

## 2. Inventory

- Architecture: orvex-studio-workgraph (canonical) — full architecture spine, status `final`
- PRD: orvex-studio-workgraph (canonical)
- PRD Addendum — orvex-studio-workgraph (canonical) — rationale depth (Dolt rejection, rejected alternatives, beads port map, prompt-pack notes, competitive positioning)

## 3. Decided vs draft

**Locked/canonical (PO rulings 2026-07-10):**
- Service renamed `orvex-studio-workgraph` (never `wg`/`work`), own repo/CNPG Postgres, greenfield — no data migration from `/v1/memory`.
- User/agent memory split: `/v1/memory` FormSpec store stays product-side untouched; 3-state privacy enum (`open|private|shared-private`) is design-inherited only as the base for workgraph's grants (FR-MEM23).
- Semantic leg rides `orvex-studio-knowledge`/Turbopuffer, NOT a local vector store — "this service ships no pgvector" (ADR-0014 respected, not carved out).
- Dolt rejected for the core store (serialized single-writer, no sharding, memory-loaded commit graph); Postgres-only (D-S12); bi-temporal edges instead of a versioned engine.
- Hash-ladder/content-derived IDs dropped post-adversarial-review (M-4/L-1 findings); replaced by server-issued short IDs + Postgres CAS/row locks.
- "Nothing deferred" PO decision (2026-07-10) pulled FR-MEM12 tier-2 compaction, FR-MEM16 interop write adapter, FR-MEM23 per-item grants, FR-MEM24 registered roles, FR-MEM25 org-shared namespaces, FR-MEM26 gates/templates/dispatch, FR-MEM27 Claude memory-tool backend, and sub-100ms fast-path retrieval all into v1 scope.

**Still draft/provisional:**
- Numeric latency SLOs (NFR-MEM1) are "provisional targets pending a retrieval spike" — could trigger an ADR-0014 carve-out if the budget fails.
- Scale envelope 100k items/500k edges per tenant is `[ASSUMPTION]`, pending pre-GA load test to validate or lower.
- Adherence viability floor (≥50% prime-first) is a hypothesis pending pre-GA spike; quota/pricing dimensions (items vs edges vs tokens) are open (§11 OQ2).
- Bi-temporal depth (full as-of queries vs invalidation-only) deferred; interop entity/relation mapping table detail open (OQ6); learning-loop convergence with staging's Librarian deferred (OQ7).

## 4. API/contract surface

- Contracts-first via `orvex-studio-contracts` (pinned tag, v0.1.2 at authoring); additive lane vs ADR lane per ADR-0008.
- New CloudEvents subdomain `studio.workgraph.<resource>.<past-tense>` (ADR-0007 envelope), additive, distinct from reserved `studio.memory.*`.
- Sync verb schemas (prime, ready, recall, search, stats, handoff, grants, batch) authored in contracts tag; `cmd/api` and all adapters codegen from it.
- Four-way adapter surface, all thin protocol translators, none bypassing core: MCP (`workgraph_*` on Studio MCP server, 14 tools listed FR-MEM14), CLI (`orvex-cli workgraph`), KG interop adapter (pinned to `@modelcontextprotocol/server-memory` 2026.7.4 shape), Claude memory-tool backend (`memory_20250818` protocol, `/memories` file ops).
- Source-adapter contract for knowledge indexing (P9): rich-event-inline authoritative, `acl_primitive` shaped `{principal, candidate_ids[]} → allowed_ids[]`, fail-closed.
- Frozen error posture: 402 `QUOTA_EXCEEDED` (never 429/destructive), banner envelope `{kind: elision|staleness|degraded, scope, detail}`.
- Maturity: contract-first design is fully specified in prose but **not yet built** — this is a PRD+architecture pair with no delivery/build page in this space.

## 5. Delivery state

No build, handoff, or gate-result pages exist in this space — only PRD + Architecture + Addendum. Signals of pre-build status:
- Architecture explicitly calls out **two dependency gates** blocking parts of the design: `orvex-studio-knowledge` is still "past its 501 scaffold" — i.e., the semantic leg (AD-3) and console anomaly view (AD-7) are "dead until then."
- OTel via `pkg/obs` is noted as "stub today — wiring is early scope."
- Three explicit pre-GA validation gates treated as sequencing, not deferral: the retrieval spike (latency SLOs), the load test (scale envelope), and the adherence spike (ritual viability floor) — none has run yet.
- "Workload shape" for `cmd/reaper` (Deployment vs workflows cron) is still open.
- No code repo state, CI status, or story/epic tracking is referenced in this space at all — this is planning-only, pre-implementation canon.

## 6. Gaps & tensions

- Hard external dependency on `orvex-studio-knowledge` reaching production readiness before the semantic retrieval leg or console fleet view can function — currently blocked on a 501 scaffold.
- Quota/pricing dimension mapping to billing is unresolved (OQ2), yet FR-MEM1 caps and NFR-MEM3 token economy already assume it.
- Tenant-move cross-store ordering (quiesce across outbox drain + knowledge re-projection) flagged as "an open question for the move implementation."
- SM-1 (session cost reduction) admits it cannot use live production telemetry — "the service cannot observe host-side token accounting on hookless platforms" — so it relies on a lab A/B harness proxy, a real measurement-validity gap.
- The learning-loop convergence between workgraph's adherence telemetry and the sibling Staging Area's Librarian feedback loop is explicitly deferred (OQ7), leaving two parallel unconverged prompt-tuning loops for now.
- ChatGPT-native memory bridge is flagged as platform-blocked (no API) — a permanent external gap, not solvable by Orvex.
