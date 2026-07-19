# orvexstudiostaging — Evidence Digest

## 1. Mandate

`orvex-studio-staging` is a new cross-service platform capability — the **Agent Staging Area + Librarian**. Agents lose direct wiki-write access and get one safe verb, *propose*: every agent-intended change (add/edit/replace/delete a doc or section) lands as a Proposal in a dedicated staging store outside the wiki, grouped per session into a ChangeSet. The **Librarian** (an AI reviewer with a per-tenant prompt and an autonomy dial defaulting to "recommend, not act") triages, routes (find-before-create), merges, beautifies, and applies these into the wiki via the wiki-api chokepoint, learns from human feedback, and runs a standing maintenance/tidy sweep. It supersedes OPS "The Librarian"/Card Contract v1 and `orvex-studio-api`'s Curator.

## 2. Inventory

- Architecture: orvex-studio-staging (canonical)
- PRD: orvex-studio-staging (canonical)
- PRD Addendum — orvex-studio-staging (canonical)

Only 3 pages, but all `status: canonical` and dense/final — this is a fully-baked spine (created/updated 2026-07-10), not a stub space.

## 3. Decided vs draft

**Locked (PO decisions, 2026-07-10, "nothing deferred"):**
- Full Autonomy Dial ships in v1: `recommend` (default) → `auto-apply-low-risk` → `full-auto`.
- Scheduled ChangeSet publishing (FR-STG28) and prompt-pack marketplace v1-minimal (FR-STG29) — both in scope, not deferred.
- Service is one closed Go satellite; Librarian is domain packages within it, never a second deployable (AD-1).
- Postgres-only (rejected Dolt — see A1 rationale: MySQL-wire, auto-commit failures under batch load, Doltgres beta).
- `divert-to-workgraph` (renamed from `divert-to-memory`, PO 2026-07-10) targets `orvex-studio-workgraph`, not the wiki path.
- Card v1 → Proposal is a **verbatim superset**; Curator's classify path is absorbed with a loud migration error at cutover (AD-12).
- Hard-cut migration of ALL agent wiki-write surfaces (FR-STG25) — sequenced LAST, gated on non-501 deps.

**Still draft/open (§11, §12 assumptions):**
- Final service deployable shape / whether Librarian is its own module (OQ1 partly resolved via AD-1).
- Snapshot/rejected-payload retention windows — `[ASSUMPTION: 30-day purge / 90-day snapshots]`.
- Dial granularity per doc-type (deferred — per-tenant+space ships first).
- Card v1→Proposal concrete field-mapping table (produced during migration epic).
- Pricing/entitlement shape for quotas and Librarian LLM spend — unresolved.
- Studio Decision-Records registry is **blocked** (project-context §9, TBD Act-1) — named prerequisite blocking the supersession ADR, the `studio.staging.*` subdomain ADR, and the service-name decision.
- Numeric SLOs (500ms submit p95, 5min triage, 15min apply) are provisional pending the 100-Proposal benchmark.

## 4. API/contract surface

- MCP: new `staging_*` tools — `staging_propose`, `staging_changeset_submit/status`, `staging_list_mine`, `staging_withdraw`, `staging_review_queue`, `staging_decide` (bulk), `staging_apply`.
- CLI: `orvex-cli staging <verb>` namespace, parity with MCP.
- Contracts authored in `orvex-studio-contracts` first, tag-pinned (additive = automated lane; reshaping = ADR + human ratify) — per family P3/ADR-0008.
- Events: `studio.staging.<resource>.<past-tense>` CloudEvents on the outbox, envelope per ADR-0007; **new subdomain requires an ADR** `[ASSUMPTION: approved via ADR]` — not yet ratified, and blocked behind the same Decision-Records registry gap.
- Error shape: frozen 402 `QUOTA_EXCEEDED`, contracts `Error` envelope + `ErrorCode` vocabulary (never 429/destructive).
- Apply engine talks to `orvex-wiki-api` exclusively (CAS `ifVersion`, per-page block ops, per-item receipts) — the wiki-api write facade itself is currently a **501 scaffold**; promoting it past 501 is a named prerequisite epic.
- `SubmitReceipt` / `ApplyReceipt` are distinct contract shapes (defined, not yet built).

Maturity assessment: contract *shape* is fully specified at PRD/architecture level (operations, envelope, error codes, receipts) but nothing is implemented — this is pre-build, spine-only.

## 5. Delivery state

- No code, no repo scaffold evidence in these 3 pages — this is 100% pre-implementation planning canon (PRD + architecture + addendum), explicitly gating on other services' 501s.
- Named blocking 501s: `orvex-wiki-api` write facade, `orvex-studio-ai` classify, `orvex-studio-knowledge` search/dedup — "the benchmark run against real dependencies is the release gate."
- Engine outbox (`wiki.*` events) does not exist yet ("the engine emits zero events today") — reindex-on-apply is "dark until it ships," a second gating prerequisite alongside the three 501s.
- Sequencing invariant: hard-cut of agent write surfaces (FR-STG25) is explicitly the LAST release step — "until that gate passes, agents keep the current path."
- MCP migration inventory documented precisely (11 hero tools + 8 hidden `studio_*` tools) as a target for re-pointing — inventory done, migration not started.
- Today's "Librarian" reality is the `doc-librarian` (Marian) Claude skill + doc-amend/ratify/drift chain over docmost-cli with per-repo `customize.toml` — i.e., the ad-hoc precursor this PRD productizes.
- `orvex-prompt-studio` (would-be prompt product) is "a near-skeleton."

## 6. Gaps & tensions

- Studio Decision-Records registry **blocked** — stalls 3 downstream ADRs (supersession, staging.* event subdomain, service-name).
- Sequencing paradox flagged explicitly: hard cut can't happen until dependents are non-501, but dependents' benchmark can't run until staging exists — a no-fallbacks tension the PRD manages via explicit gating language rather than resolving.
- Engine `page_history` grows unboundedly with zero retention; PRD recommends filing an engine/wiki-api issue for batch-aware history — unfiled action item.
- Read-after-write staleness (≤45s debounced ydoc persist) forces apply receipts to poll with tolerance rather than assume immediate consistency — an integration risk called out but not yet tested.
- Retrieval trust-gating enforcement is delegated to `orvex-studio-knowledge` as a "v1 dependency deliverable" — cross-service dependency not yet contracted.
- FR-STG22 groundability flag and AD-6/AD-7 both note this gating contract "lands in `orvex-studio-contracts`" but is not yet authored.
- No numeric SLOs are final; all NFR-STG1 targets are provisional pending a benchmark that itself cannot run yet (circular until deps ship).
