# Addendum — PRD: Agent Staging Area

Depth that belongs downstream (architecture, positioning, ops) or earned preservation but not PRD placement. Current as of 2026-07-10.

## A1. Rejected alternatives (with rationale)

**Dolt as the staging store — rejected.** Attractive on paper (branch-per-ChangeSet, cell-level conflicts, data PRs). Rejected because: MySQL-wire in a Postgres-only family (D-S12; Doltgres is beta); every write auto-commits and the one production agent deployment (beads) hit "database is read only" errors under concurrent batch load and had to build a no-auto-commit batch mode; single-writer embedded is the recommended default and multi-writer requires a separate `dolt sql-server` fleet; beads itself retired branch-per-worker on the Dolt founder's advice ("hundreds of transactions per second on a single branch" — all-on-main + transactions). What we keep: **cell-style conflict keying** — Proposals key conflicts by `(document_id, section_anchor)`, giving Dolt-grade granularity on Postgres. Sources: `research/dolt-and-beads-upstream.md`, `research/beads-design-docs-distillation.md`, `research/platforms/dolt-data-prs.md`.

**Staging inside the wiki as draft pages — rejected (Daniel: "would prefer not", plus engine evidence).** A Docmost draft is a full-cost `pages` row: status is 8 columns ON `pages` (no side-table), fully indexed, slug-holding, tree-visible, history-tracked; the REST path writes a non-diff-gated full-content `page_history` row per save into a table with zero retention anywhere; content persistence is debounced 10–45s through the Yjs seam; there is no cross-page batch primitive (`/bulk` excludes content ops, caps at 100, runs `Promise.all` non-atomically). 100 staged revisions/day/tenant inside the wiki = unbounded history growth + tree pollution + version churn. Sources: `research/engine-scale-mechanics.md`, `research/draft-status-prosemirror.md`.

**Govern-the-direct-write (the Rovo/Notion/SharePoint bet) — rejected as architecture, adopted as garnish.** The 2025–2026 vendor wave writes directly and wraps RBAC + audit + rate limits. Community evidence of the failure mode: Rovo hallucinated write-success reports; Notion "amplifies messy workspaces"; both lack any content-quality gate. We adopt their good parts — per-agent credentials, fleet-level "what did my agents do" dashboards, rate/anomaly circuit-breakers — as staging NFRs, not as a substitute for the boundary. Positioning: sell the boundary with their communities' pain as evidence. Source: `research/staging-prior-art-synthesis.md` §4.4, platform profiles.

**LLM-as-autonomous-approver by default — rejected.** Zero prior art puts AI in the final accept seat (GitHub Copilot is comment-only by design; Veeva mandates human e-signature under 21 CFR Part 11; Wikipedia/SO keep ML advisory). Hence recommend-first + earned, scoped autonomy (Daniel's call, aligned with the field).

**Cross-store ACID for ChangeSet apply — rejected.** Staging store and wiki are different storage domains; every credible batch system (Veeva MDCC, Sanity releases) uses a workflow-state gate with optimistic polling. Pretending to have transactionality across the seam would be a silent-failure factory.

## A2. Options considered — isolation boundary

| Option | Exemplar | Verdict |
|---|---|---|
| Physically separate store (own service Postgres) | (none in field — our choice) | **Chosen.** Cleanest blast-radius + engine-load isolation; wiki contracts remain the routing target. Cost: our own review/diff UX (planned anyway). |
| Credential-enforced boundary inside one store | Sanity (agent creds physically can't touch published) | Strong pattern; we adopt the *credential* half (agent creds cannot write wiki canonical) but not co-residency — engine history/tree pollution kills it. |
| Same store, workspace-overlay | Drupal Workspaces | Rejected: "every query must check the workspace field" scaling smell; whole-entity granularity. |

## A3. Mechanism notes for architecture

- **Apply path specifics:** engine accepts `format:'json'` (raw ProseMirror, schema-validated server-side; unknown nodes silently stripped — Librarian must author only registered nodes) and lossless DfM; markdown/html rejected on write. Per-page block-op API (28 types incl. mermaid, which is block-op-only, not a PM node) plus a within-page atomic `batch` verb exist today; cross-page batch does not — the apply engine sequences per-page writes with CAS `--if-version`, receipts, and resumable checkpoints. Adjacent same-mark text runs coalesce server-side: verify applies by full-text + effective-marks equality, never run-by-run identity.
- **Engine-load guardrails for apply:** the `/update` route is unthrottled and fans out ~5–7 async jobs + a full-content history row per save; the apply engine self-throttles (configurable pages/min per tenant), and we should file an engine/wiki-api issue for batch-aware history (diff-gated or ChangeSet-batched history rows) — currently `page_history` grows unboundedly with zero retention. `[Routed to Open Question 3 / engine backlog]`
- **Read-after-write:** engine content reads can lag ≤ 45s (debounced ydoc persist). Apply receipts must not assume immediate read-back consistency; verification reads poll with tolerance.
- **MCP surface today (migration inventory):** 11 hero tools + 8 hidden `studio_*` tools; `save_page`/`edit` (incl. within-page `batch`) write to docmost directly via DocmostWrapper (the Go wiki-api facade is 501). FR-STG25's hard cut re-points these; the hidden `studio_library_list/save` + `studio_librarian_session` passthroughs get absorbed or removed at supersession time.
- **Librarian prompt heritage:** today's "librarian" is the `doc-librarian` (Marian) Claude skill + doc-amend/ratify/drift skill chain over docmost-cli, with per-repo `customize.toml` overrides as the only tweak surface; `orvex-prompt-studio` (the would-be per-customer prompt product) is a near-skeleton. The Prompt Pack productizes what customize.toml does ad-hoc.

## A4. Sizing & evidence data worth keeping at hand

- 100-doc direct-write cost today: ~200 HTTP round-trips (2/page via CLI path; 3 with embed guard), ≥100 full-content history rows (+ up to ~100 more via debounced Yjs path), ~500–700 BullMQ jobs, non-coalescing embed jobs keyed by timestamp.
- docmost-cli patch path: 2 round-trips happy-path per page (freshness probe + write); CAS server-arbitrated; local-cache find/replace.
- Wikipedia scale anchors: AfC backlog 3,268–5,000+, >1,000-day unreviewed tails on some wikis — the "pure human queue rots" datum behind FR-STG3/SM-4.
- Veeva MDCC: batch-of-proposals as first-class object with all-or-nothing state gate — the only regulated-grade exemplar of our ChangeSet.
- Field gap our SM-3 exploits: no vendor publishes a docs-per-batch ceiling, latency, or failure data for ~100-doc batches; all atomicity claims are unbenchmarked.

## A5. Prior-art pointers

Synthesis: `research/staging-prior-art-synthesis.md` (landscape table, patterns, white space, contradictions, 12 PRD decisions). Profiles: `research/platforms/*.md` (14). Code/engine evidence: `research/librarian-portal-scale-audit.md`, `research/engine-scale-mechanics.md`, `research/draft-status-prosemirror.md`, `research/cli-*.md`. Canon/conventions + supersession targets: `research/wiki-canon-map.md`.
