# Addendum — PRD: Cross-Agent Memory Service

Depth for downstream architecture/design work; preserved rationale that doesn't belong in the PRD narrative. Current as of 2026-07-10.

## A1. The Dolt decision — full rationale (rejected for the core store)

Daniel's brief asked to confirm "Dolt will function at scale." The confirmation came back negative for our shape:

- **Mechanics:** Dolt serializes all writes through one primary; cannot shard (a tenant's data must fit one disk); loads each database's full commit graph into memory at startup; copy-on-write garbage demands an ongoing decay→compact→flatten→gc lifecycle. MySQL-wire (Doltgres beta) inside a Postgres-only family (D-S12).
- **The strongest production datapoint is ours to learn from:** beads/Gastown — the reference agent-memory-on-Dolt stack — runs one Dolt server per "town" with ~5 databases, all-writes-on-main, after **abandoning branch-per-worker** ("the wins were illusory: workers couldn't see each other's beads until merge") on the Dolt founder's own advice. It also hit auto-commit "database is read only" errors under concurrent batch load, built `bd batch` to compensate, and spent three releases fixing multi-clone schema-migration divergence.
- **Verdict tiers:** viable to ~10 tenants trivially; ~1,000 tenants as a sharded-server fleet with real operational cost; wrong at ~100,000 as sole store. Nobody in the 18-platform memory field uses a versioned SQL store; Postgres+pgvector is the consensus substrate.
- **What we keep from Dolt/beads storage thinking:** cell-level conflict keying (as schema design), history/restore via an audit/event trail on Postgres, and "time-travel" delivered as a **bi-temporal edge model** (event-time + ingestion-time, Zep/Graphiti pattern) rather than a versioned engine.
- **Post-review amendment (2026-07-10, adversarial findings M-4/L-1):** the adaptive hash-ID collision math, content-derived deterministic row IDs, and any `row_lock`-style synthetic conflict column were **dropped from the port** — they solve offline/decentralized-convergence problems a centralized single-writer Postgres service does not have. Server-issued per-tenant short IDs (sequence + short encoding, unique index) replace the hash ladder; Postgres row locks / version columns replace the synthetic conflict column. The collision-math documentation remains valuable reference only.

Sources: `research/dolt-and-beads-upstream.md` (§A1–A11), `research/beads-design-docs-distillation.md` (dolt-concurrency design doc, changelog eras), `research/memory-prior-art-synthesis.md` §4.1.

## A2. Rejected alternatives

- **Gating memory writes through the Librarian** — rejected: every low-latency memory system writes direct + consolidates async; a review gate on work-logs kills the coordination surface (synthesis §4.3). The Librarian's mandate covers the wiki; memory hygiene is owned by consolidation/compaction inside the service.
- **LLM knowledge-graph extraction over conversations (Mem0^g/Cognee-style)** — rejected for the coordination track: our substrate is structured Work Items, not prose-derived entity graphs; Cognee is independently reviewed as weakest at task/conversational memory. Notes hold prose; retrieval handles it hybridly.
- **Per-item ACLs in v1** — originally deferred on field consensus: the entire mature field ships namespace-prefix + IAM (Bedrock/Vertex/Azure/Redis/Mem0); LangMem argues namespace-only is a legitimate v1. **Overridden 2026-07-10: the PO pulled per-item grants into v1 (FR-MEM23), building on the migrated 3-state privacy enum; the consensus note stands as risk context, not a veto.** Tenant isolation remains non-negotiable either way.
- **Wrapping the beads CLI / forking beads** — rejected by Daniel up front ("we won't be using the Beads CLI; we will be embedding the functionality using our own code"). Also technically right: beads is local-first (git remotes, embedded Dolt, JSONL exports, worktree routing) — the hosted service drops that entire layer.
- **Building on an existing memory platform (Mem0/Zep/Letta as substrate)** — rejected: all are single-user personalization shapes without work-graph coordination; adopting one buys their model and their gaps (no decay in Mem0, seed-stage vendor risk in Zep) while our differentiator is exactly the part they lack.

## A3. beads → Orvex port map (operative copy)

The full keep/adapt/drop table, v1 subset, and risk register live in `research/beads-audit.md` §8 (authored as the audit's final synthesis; treat as the operative porting reference for architecture). Highlights the PRD relies on: ready/claim/lease/heartbeat/reclaim semantics (FR-MEM3/4), `bd prime` compact-vs-full modes + truncation-defense (FR-MEM9), remember/recall with injection caps + elision banners (FR-MEM8), `bd batch` single-transaction semantics (FR-MEM6), close-protocol gated on completion language (FR-MEM18), MCP context-budget levers — lazy schema discovery, brief returns, result compaction (FR-MEM14), tier-1 Haiku compaction with restore (FR-MEM12), interactions audit log → our CloudEvents audit (NFR-MEM5).

## A4. Prompt-pack design notes (chat platforms have no hooks)

- beads' context-recovery rides host hooks (SessionStart/PreCompact; Codex needs a 4-event dance because compact-hook stdout is ignored). ChatGPT portals and Claude projects offer none of this — the pack therefore leans on: (1) MCP server `instructions` (delivered at connect), (2) tool descriptions as micro-prompts (the `discover_tools` lazy pattern keeps them cheap), (3) portal/system-prompt blocks we install per platform, (4) the `prime` tool as the recovery ritual with a truncation-defense first line.
- Ritual wording to preserve from beads (verbatim patterns proven in the field): "Create issue BEFORE writing code"; claim-before-work as a named atomic verb; "Before saying 'done' or 'complete', you MUST run this checklist"; prohibition of shadow tracking ("do NOT use markdown files / TodoWrite for task tracking"); "Persistence you don't need beats lost context"; the resumability test ("would a fresh agent resume this from the description alone?") and the note template `COMPLETED / IN PROGRESS / NEXT / KEY DECISION / BLOCKER`.
- Anti-footguns worth porting: never emit a copy-pasteable destructive command in an error message (beads ADR-0002 — an agent destroyed 247 issues by obeying error text; "the text was the bug"); memory-key writes that look like reads become reads (bd remember's guard); always-at-least-one-memory + explicit elision banner over silent truncation.
- Per-tenant tweakability: pack templates are versioned artifacts; tenant overrides layer on top (the hosted analog of beads' `PRIME.md` override + `customize.toml` chains); revisions ship as admin-approved proposals with adherence-metric before/after (FR-MEM19).

## A5. Competitive positioning notes

- **Claim:** "the first hosted, multi-tenant, MCP-first memory that is *coordination* memory — discover/claim/handoff — not just personalization." Evidence: 18-platform sweep; A2A issue #893 (community asking for memory on top of A2A); every hyperscaler memory is runtime-coupled (Strands/ADK/Foundry) and none is chat-platform-native.
- **Interop stance:** complementary to MCP (we are an MCP server), complementary to A2A (they move tasks between opaque agents; we hold shared queryable state), adapter-compatible with the MCP KG reference shape (FR-MEM16).
- **Pricing signals observed:** Mem0 prices per memory count (anti-pattern we counter-metric), Bedrock $0.25/1k events + $0.25–0.75/1k records/mo, Supermemory token-level dedup billing (interesting), Zep meters writes with free reads. Our quota dimensions remain an open question (PRD §11.2).
- **Compliance bar:** Cognee lacks SOC2/HIPAA; Azure carves memory out of VNet support — day-one compliance posture is a sales weapon (NFR-MEM7).

## A6. Evidence pointers

`research/beads-audit.md` (+ `beads-agent-layer.md`, `beads-cli-surface.md`, `beads-design-docs-distillation.md`) — the embedded-concepts source; `research/dolt-and-beads-upstream.md` — storage verdict + upstream signal; `research/memory-prior-art-synthesis.md` + `research/platforms/*.md` (18) — market; `../prd-studio-staging-area-2026-07-09/research/librarian-portal-scale-audit.md` — current MCP surface + the built `/v1/memory` in studio-api (user-memory product — stays product-side per the 2026-07-10 split ruling; originally scoped as a supersession target); `research/wiki-canon-map.md` (staging workspace) — canon placement + supersession targets + the reserved `studio.memory.*` subdomain (ADR-0010 — stays with user memory; the workgraph mints `studio.workgraph.*`).
