---
title: "PRD: Workgraph — cross-agent coordination service, beads-inspired (MCP + CLI)"
status: final
created: 2026-07-09
updated: 2026-07-10
wiki: https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/prd-cross-agent-memory-service-hosted-beads-inspired-mcp-cli-HTExyRFHhs
---

# PRD: Workgraph — cross-agent coordination service, beads-inspired (MCP + CLI)

**In short:** A hosted, multi-tenant coordination service — the **workgraph** — where a customer's agents continuously log what they're doing and how, discover each other's context, claim and hand off work, and start every future session with context already worked out — cutting token cost session over session. The data model and agent rituals are embedded from **beads** (Steve Yegge's agent issue-graph; MIT-licensed, concepts reimplemented in our own Go/Postgres code — we ship no beads CLI); the delivery is **MCP-first with CLI parity**, driven on chat platforms (ChatGPT portals, Claude) purely by prompts and instructions since they have no hook system. Coordination writes are **direct and ungated** (async consolidation keeps the store lean); only wiki-bound knowledge crosses into the sibling Agent Staging Area. Nobody in the profiled market combines a queryable multi-agent work-graph with curated knowledge routing — this is unoccupied ground.

## 0. Document Purpose

For Daniel (PO), the SE-Architect review agent, and downstream architecture/epics workflows. Glossary-anchored (§3); features grouped with FR-MEM requirements; inferences tagged `[ASSUMPTION]` and indexed in §12. Platform-level cross-service canon. **Naming (PO ruling 2026-07-10):** the service is **Workgraph** (`orvex-studio-workgraph`) — the word *memory* names the user-managed memory product only (the `/v1/memory` FormSpec store, its `studio.memory.*` namespace and `studio_memory_*` tools), which stays product-side untouched; FR-MEM requirement ids are stable from the original Cross-Agent-Memory draft. Supersedes the OPS "Memory & The Librarian" agent-side design and the planned agent-side concepts of `orvex-studio-ai` FR-AI11 — see §9 and the rescoped FR-MEM21/22. Research grounding: `research/beads-audit.md` (+ agent-layer, CLI-surface, design-docs distillations), `research/dolt-and-beads-upstream.md`, `research/memory-prior-art-synthesis.md` (18 platforms).

## 1. Vision

Every agent session today starts amnesiac: context is re-derived at full token price, agents can't see what sibling agents are doing, discovered side-work evaporates in scrollback, and "done" work goes untracked. Beads proved the fix for CLI coding agents — a persistent, dependency-aware work-graph the agents themselves keep current through cheap rituals (file before coding, claim before working, log discoveries, land the plane before saying done). But beads is local-first, git-shaped, single-workspace, and CLI-native.

Orvex Studio hosts that idea for the chat-agent world. The Workgraph service is the fleet's shared working memory: a work-item graph with typed edges, ready-work computation, atomic claims with leases, durable notes and handoffs, persistent remembered facts, and a `prime` call that reconstitutes a session's context in a few hundred tokens. It is MCP-first because the customers' agents live in ChatGPT portals and Claude apps; a matching CLI section serves CI and terminal agents. The market gap is stark: every profiled memory product is single-user personalization ("remember the user likes short answers"); none offers discover-claim-handoff coordination, and the only coordination protocol (A2A) explicitly has no memory. Workgraph + staging together complete the loop: work context lives here, and when something matures into durable knowledge, it flows through the Staging Area's Librarian into the customer's wiki.

## 2. Target User

### 2.1 Jobs To Be Done
- **Chat-based agents:** "start my session knowing what the fleet knows; log what I'm doing so others (and future me) don't repeat it; hand off cleanly."
- **Agent fleet operators:** "see what my agents are working on, what's blocked, and what got dropped — without reading transcripts."
- **Customers' finance/eng leads:** "cut per-session token spend — context reconstruction is our biggest hidden cost."
- **Orvex platform:** "a memory substrate every product (Studio, wiki, portals) and every surface (MCP, CLI) shares, instead of three half-memories."

### 2.2 Non-Users (v1)
- End consumers of customer products (they see effects, not the workgraph).
- Agents wanting an orchestration engine — scheduling, routing, retries live elsewhere (beads' own charter boundary).
- Single-user "personal assistant memory" — served by LLM-native memory; we interoperate, not compete, there. [NON-GOAL for MVP]

### 2.3 Key User Journeys

- **UJ-1. Cold start becomes warm start.**
  Nova, a ChatGPT-portal engineering agent, opens a new session. Its system prompt (installed from our prompt pack) says to call `workgraph_prime` first. One call returns ~200 tokens: active claims, top ready work, recent handoffs, pinned tenant facts. Nova continues yesterday's migration exactly where it stopped — no transcript replay, no re-discovery. **Climax:** the session's first useful action happens within one tool call. **Edge case:** workgraph service degraded → `prime` returns an honest empty-with-status payload; Nova proceeds statelessly in read-only mode and says so (coordination writes wait — a blind `claim` would still CAS-fail on conflict, per NFR-MEM6).

- **UJ-2. Two agents, one hand-off, zero context loss.**
  Atlas (planner agent) finishes a design and calls `workgraph_handoff` with a typed payload (scope, decisions, next steps, blockers) targeting the `builder` role. Bolt (builder agent, different platform — Claude) later calls `workgraph_ready`, sees the handoff-backed item at the top, `workgraph_claim`s it atomically (no double-claim race with its twin), and works with Atlas's context inline. Mid-build Bolt discovers a bug, files it with a `discovered-from` edge, and finishes with the close ritual: close item, log outcome note, release claim. **Edge case:** Bolt crashes mid-work → its lease expires, the reaper returns the item to ready, nothing is lost.

- **UJ-3. The fleet dashboard answers "what's happening?"**
  Rhea, operations lead, opens the workgraph view in the Studio console: 7 in-progress items (with lease freshness), 12 ready, 3 blocked with named blockers, yesterday's 41 closed items, and stale-claim alerts. She spots a blocked cluster, reprioritizes, and pins a tenant fact ("release freeze Friday") that every agent's next `prime` will carry. **Edge case:** an agent keeps re-opening rejected work → its trust/priority signal drops and the anomaly is flagged.

- **UJ-4. Working memory matures into wiki knowledge.**
  Over a week, item `mem-4f2a` accumulates notes proving a recurring customer issue and its fix. Nova marks the resolution *wiki-worthy*; the service packages the item's distilled content and submits it as a Proposal to the Staging Area (UJ-1 of the sibling PRD). The Librarian routes it into the runbook; the workgraph item links to the applied page and its bulky notes become compaction-eligible. **Resolution:** coordination memory stays lean; durable knowledge lands curated in the wiki.

## 3. Glossary

- **Work Item** — the core workgraph record (beads "issue" generalized): typed (`task`, `bug`, `decision`, `note`, `handoff`, `epic`), with title, description, status (`open`, `in-progress`, `blocked`, `closed`, `deferred`), priority, producer, claims, notes, and edges. `[ASSUMPTION: v1 type set]`
- **Edge** — typed link between Work Items; v1 set: `blocks`, `related`, `parent-child`, `discovered-from` (the four that beads' rituals lean on, of its 19).
- **Ready Work** — Work Items open with zero unresolved `blocks` edges, not claimed/deferred; served by a denormalized blocked-flag with recompute repair (beads' `recompute-blocked` lesson).
- **Claim / Lease** — atomic assignment of a Work Item to an agent with a TTL lease; **Heartbeat** renews, the **Reaper** returns stale-leased items to ready.
- **Handoff** — a first-class typed transfer of work + context between agents/roles (OpenAI `handoff()` + A2A task-state shape).
- **Remembered Fact** — a persistent tenant/agent-scoped KV fact (`remember`/`recall`/`forget`), injection-capped, carried by Prime. Never called "memory" — that word names the user-managed memory product (PO 2026-07-10).
- **Prime** — the session-start context call: compact (budgeted ≤ 300 tokens p95, typically ~200) or full (~1–2k tokens) summary of claims, ready work, handoffs, pinned facts, close-protocol reminder (beads `bd prime`, hosted).
- **Close Protocol** — the session-end ritual the prompt pack mandates before an agent declares "done": close/update items, log outcome notes, submit wiki-worthy content, release claims ("landing the plane").
- **Consolidation** — async post-write pass: top-k similar retrieval → ADD/UPDATE/DELETE/NOOP decision (Mem0 loop) + cheap 0.98-cosine intra-batch dedup; soft-delete with trail.
- **Compaction** — scheduled decay: closed items past their window are LLM-summarized (tiered), originals restorable from history; policies are per-tenant config (max-age / max-inactive / keep-top-N).
- **Namespace** — isolation tuple `tenant / agent / session` (+ optional item scope); prefix isolation, no per-item ACLs in v1.
- **Prompt Pack** — the per-platform instruction bundle (ChatGPT portal system blocks, Claude project instructions, CLI agent snippets) that installs the rituals: prime at start, file-before-work, claim-before-work, discovered-from on side-quests, close protocol at end.

## 4. Features

### 4.1 Work-graph core
**Description:** The beads-derived substrate: items, edges, ready computation. Direct writes, no gate — latency is the product. Realizes UJ-2, UJ-3.

- **FR-MEM1: Item CRUD + notes/comments.** Agents create, update, close, reopen Work Items; append-only notes and comments capture durable context "so nobody has to read the transcript". Consequences: create p95 ≤ 150ms (provisional — NFR-MEM1); every mutation emits `studio.workgraph.*` CloudEvents; human-typeable short IDs are server-issued (per-tenant sequence + short encoding, unique-indexed) — beads' content-derived hash IDs and collision ladders are decentralized-merge machinery a centralized store doesn't need.
- **FR-MEM2: Typed edges.** The four v1 edge types with cycle detection on `blocks`; `discovered-from` is the mandated provenance edge for side-quests (the single most-repeated beads ritual).
- **FR-MEM3: Ready-work query.** `ready` returns unblocked, unclaimed, undeferred items ranked by priority/age/hybrid; `blocked` explains blockers; `stats` summarizes. Denormalized blocked flag + idempotent recompute job.
- **FR-MEM4: Claims, leases, heartbeat, reclaim.** `claim` is atomic (assignee + in-progress in one CAS operation — no double-claim between concurrent agents); leases carry TTL; `heartbeat` renews (owner-only); the reaper reverts stale leases to ready with a recovery event. `[ASSUMPTION: default lease TTL 30 min, reaper grace 2× TTL — beads defaults]`
- **FR-MEM5: Handoff.** First-class `handoff` carrying typed payload (reason, scope, decisions, next steps, priority) targeted at an agent or role; state machine `submitted → claimed → accepted/returned`; surfaced by `ready`/`prime` to the target.
- **FR-MEM6: Batch.** One call executes N mutations in one transaction (beads `bd batch` — the write-amplification killer for agent loops).
- **FR-MEM7: Defer / undefer.** Deliberate "not now" distinct from blocked; hidden from ready until due.

### 4.2 Remembered facts & session context
**Description:** The cheap-future-sessions layer. Realizes UJ-1.

- **FR-MEM8: Remember / recall / forget.** Tenant- and agent-scoped persistent facts with keys; admin-pinnable tenant facts; injection caps (max-count, max-chars) with an explicit elision banner — hosts truncate silently, we never do.
- **FR-MEM9: Prime.** Compact and full modes with an explicit content contract. **Compact guarantees:** the calling agent's own active claims, the close-protocol reminder, and pinned tenant facts (capped); ready work and pending handoffs appear as counts plus the single top item with a fetch hint; **no semantic retrieval runs in compact mode** (pinned-only — retrieved "relevant" facts are full-mode). **Full mode** carries the lists (~1–2k tokens). Anything elided is announced with an explicit elision banner, never silently dropped. Token-budgeted; per-tenant template override (the hosted analog of beads' `PRIME.md` escape hatch). p95 ≤ 300ms compact (provisional — NFR-MEM1; compact is index-scan-bound by construction).
- **FR-MEM10: Search & recall retrieval.** Hybrid retrieval over items+notes+facts: semantic (via the knowledge service’s Turbopuffer store — architecture ruling 2026-07-10, ADR-0014: no service-local vector store) + keyword + graph adjacency, fused with composite ranking (similarity + exponential recency decay + importance); **no LLM in the retrieval hot path** (Zep's ~300ms lesson).

### 4.3 Consolidation, compaction & deletion
**Description:** What keeps the store lean enough to keep sessions cheap — the field's weakest area, our differentiator.

- **FR-MEM11: Async consolidation.** Post-write: top-k similar → ADD/UPDATE/DELETE/NOOP via `orvex-studio-ai`; cheap non-LLM 0.98-cosine intra-batch dedup first; contradictions soft-delete (invalidate with trail), never silently overwrite. Off the hot path (sleep-time pattern). **Hard scope invariant:** consolidation operates ONLY on Remembered Facts (FR-MEM8) and *closed* Work Items; it must never mutate, invalidate or merge open/in-progress/claimed items or pending handoff targets — live coordination state is untouchable by the LLM loop (protects SM-2).
- **FR-MEM12: Tiered compaction.** Per-tenant policies (max-age / max-inactive / keep-top-N per class): tier-1 LLM summarization of closed items past window (default 30d) with restore-from-history; tier-2 deep archive (default 90d) `[ASSUMPTION: defaults mirror beads]`. **Reference-aware guard:** an item referenced by any non-closed item's notes or edges is compaction-protected, or its summary must preserve resolution of the cited ID — compaction must never gut context an active item depends on (beads `prune` lesson). Runs as scheduled platform workflows.
- **FR-MEM13: Hard cascading delete.** Right-to-erasure deletes an item/fact AND its derived artifacts (summaries, embeddings, consolidation traces) immediately — no TTL-floor soft-expiry (contra AWS 7-day floors; per house no-fallbacks rule). GDPR-aligned per-principal purge. **Precedence rule (erasure vs. audit/restore):** erasure wins — it purges history, summaries, embeddings and traces for the erased principal, overriding FR-MEM12's restore promise and the reference-aware guard; the audit trail retains only a content-free tombstone event recording that a deletion occurred. Retention promises (NFR-MEM5) are always subject to this precedence.

### 4.4 Surfaces: MCP section, CLI section, console
**Description:** MCP-first, CLI parity, console read view. Realizes all UJs.

- **FR-MEM14: MCP workgraph section.** New tools on the Studio MCP server: `workgraph_prime`, `workgraph_ready`, `workgraph_claim`, `workgraph_heartbeat`, `workgraph_create`, `workgraph_update`, `workgraph_close` (with `claim_next` chaining), `workgraph_dep_add`, `workgraph_note`, `workgraph_handoff`, `workgraph_remember`, `workgraph_recall`, `workgraph_search`, `workgraph_stats`, `workgraph_batch`. Context-budget levers from day one: lazy schema discovery, `brief=true` minimal returns, result-compaction above threshold with preview+hint (beads MCP measured 10–50k tokens for eager schemas; we ship the lean contract). The hidden `studio_memory_get/save` passthroughs are user-memory product surfaces and remain product-side — their descriptions point agent-state usage here (rescoped FR-MEM22).
- **FR-MEM15: CLI workgraph section.** `orvex-cli workgraph` namespace with parity verbs (`prime`, `ready`, `claim`, `close`, `note`, `dep`, `handoff`, `remember`, `recall`, `search`, `stats`, `batch`) with `--json` throughout for scripted agents.
- **FR-MEM16: Interop adapter (read + write).** An entity/relation/observation-shaped surface compatible with the MCP KG reference contract (the `modelcontextprotocol/servers` memory reference server's entities/relations/observations tool shape; exact version pinned at architecture time), so hosts/tools expecting the de-facto baseline can ground against — and write into — the Orvex workgraph. Writes map entities/observations onto Remembered Facts and relations onto edges, route through the same direct-write path with namespace scoping and grants (FR-MEM23), and are v1 per PO decision (2026-07-10).
- **FR-MEM17: Console fleet view.** Studio console renders per-tenant work-graph state: in-progress with lease freshness, ready, blocked-with-blockers, closed trail, and the v1 anomaly set — exactly three detectors: stale claim (lease expired without close), re-open loop (item re-opened after rejection ≥ 2×), and orphaned blocker (`blocks` edge pointing at a closed/missing item); further anomaly classes are deferred. Pin/unpin tenant facts. Read via knowledge projections of `studio.workgraph.*` events.

### 4.5 Prompt & instruction pack (the chat-platform "hooks")
**Description:** Chat platforms have no SessionStart/PreCompact hooks — the rituals ride prompts, tool descriptions, and server instructions. This pack is a first-class, versioned deliverable, per-customer tweakable, co-owned with the Librarian's prompt pack.

- **FR-MEM18: Ritual pack per platform.** Installable instruction blocks for ChatGPT portals, Claude (projects/system), and CLI agents encoding: prime-at-start, file-before-work, claim-before-work, `discovered-from` on discoveries, note-for-resumability ("would a fresh agent resume from this?"), and the Close Protocol gated on the agent's own completion language ("before saying done…"). The pack does not rely on voluntary compliance alone — server-side reinforcement ships with it: compact prime content is auto-delivered via MCP server `instructions` at every connect, tool descriptions carry the ritual micro-prompts, and close-protocol nudges ride tool results when a session holds a claim that is going stale.
- **FR-MEM19: Adherence telemetry + viability gate.** Per-tenant ritual metrics: prime-rate, claim-before-work rate, close-rate, stale-claim rate, discovered-from usage — the measurable proxy for prompt-pack effectiveness; regressions flag prompt-pack revision `[ASSUMPTION: revisions proposed to admins, mirroring the Librarian learning loop]`. A **pre-GA adherence spike** on real ChatGPT-portal + Claude tenants measures actual prime/close rates with the shipped pack; **GA gates on the spike**, which sets the published viability floor `[ASSUMPTION: floor ≥ 50% prime-first among workgraph-active sessions; below the floor, the server-side auto-injection posture (FR-MEM18) becomes the default product mode rather than an assist]`.
- **FR-MEM20: Wiki-worthy flow.** Marking an item/note wiki-worthy packages distilled content and submits it as a Staging Proposal (sibling PRD FR-STG1) with cross-links both ways; the workgraph never writes the wiki directly. Realizes UJ-4.

### 4.6 The user/agent memory split (rescoped — PO ruling 2026-07-10)
**Description:** The original draft scoped a data migration of the built `/v1/memory` store. The split ruling rescopes it: that store is the USER-managed memory product (as-built audit 2026-07-10: FormSpec privacy metadata only — no content, no agent identity) and stays product-side; the workgraph is greenfield and migrates nothing.

- **FR-MEM21: Design inheritance, no data migration (rescoped, PO 2026-07-10).** The built store's **3-state per-item privacy (`open / private / shared-private`) is adopted as a first-class workgraph attribute and the base FR-MEM23's explicit grants build on** — a design transfer only. No backfill, no cutover, no client swap: `/v1/memory`, its `memory` table, and its clients remain the user-memory product's, untouched.
- **FR-MEM22: MCP tool disambiguation (rescoped, PO 2026-07-10).** `studio_memory_get/save` are user-memory FormSpec wrappers and remain product-side — never stubbed or removed by this service. Their tool descriptions gain a disambiguation pointer directing agent-state usage to the `workgraph_*` section; the `workgraph_*` tools are net-new and supersede nothing.

### 4.7 v1-completion additions (PO decision 2026-07-10: nothing deferred)
**Description:** Items previously deferred, pulled into v1 by Daniel's explicit call. Where the pull overrides an evidence-backed default, the risk note stays inline.

- **FR-MEM23: Per-item access grants.** Building on the inherited 3-state privacy enum (FR-MEM21), Work Items and Remembered Facts accept explicit grants — agent- and role-scoped read/write shares — evaluated at retrieval and mutation; namespace-prefix isolation remains the outer boundary and is never crossable by a grant. Included in v1 by PO decision, overriding the field-consensus default (namespace-only) recorded in the prior-art synthesis — that risk note stands as context, not as a veto.
- **FR-MEM24: Registered handoff roles.** Handoff targets resolve against identity-service-registered agent roles, not just free-form tags; unregistered tags remain usable but are flagged in the console. (Closes Open Question 4.)
- **FR-MEM25: Org-shared namespaces.** Workspaces under one org principal can share a workgraph namespace via explicit admin grant (polymorphic `{user|org}` tenancy); arbitrary cross-tenant sharing between distinct tenants remains excluded (§5) — the isolation boundary is unchanged, only intra-org sharing is enabled.
- **FR-MEM26: Coordination primitives — gates, templates, dispatch views.** beads-style *data-plane* primitives: **gate items** (human / timer / external-check wait conditions that block dependents until resolved), **work templates** (parameterized multi-item instantiation with pre-wired edges, beads formula-style), and **epic dispatch views** (computed ready-front / parallelism summaries over an epic subtree, beads swarm-style — computed live from item state, never stored separately). Data plane only: scheduling, execution and retries stay in Studio workflows (§5 boundary, beads' own charter). Messaging/mail stays excluded — beads deleted `bd mail` for exactly this boundary; comments + handoffs cover the need.
- **FR-MEM27: Claude memory-tool backend.** An adapter that serves Anthropic's API memory-tool file protocol (`/memories` file ops) from the workgraph store (protocol pinned at architecture: `memory_20250818`), so Claude API agents get native memory backed by Orvex with the same namespaces, grants and audit. (A ChatGPT-native-memory bridge is **platform-blocked** — OpenAI exposes no memory API/MCP surface; recorded as an external constraint, not an Orvex deferral.)

## 5. Non-Goals (Explicit)
- Not an orchestration engine: no scheduling, routing, model choice, retries, or workflow execution (beads charter boundary; Studio workflows own that). Data-plane coordination primitives — gates, work templates, dispatch views (FR-MEM26) — are in scope; a workflow *engine* is not, and neither is agent-to-agent mail (beads deleted `bd mail` on this exact boundary).
- Not single-user personalization memory; no attempt to replace ChatGPT/Claude native memory (FR-MEM27 *backs* Claude's memory tool; it does not clone the consumer feature).
- No LLM-extracted knowledge-graph pipeline over conversations (Cognify-style) — structured Work Items are the substrate; prose stays in notes.
- No peer-to-peer federation/sync (centralized multi-tenant SaaS).
- No cross-tenant sharing between distinct tenants — org-internal shared namespaces only (FR-MEM25).
- Coordination writes never pass the Librarian gate (only wiki-bound exports do).
- We do not ship or wrap the beads CLI; concepts are reimplemented (MIT license permits, attribution in NOTICE) `[ASSUMPTION: NOTICE-level attribution]`.

## 6. MVP Scope

### 6.1 In
Work-graph core (items, 4 edge types, ready/blocked/stats, claims+leases+heartbeat+reaper, handoff, batch, defer); remember/recall with caps; prime compact+full; hybrid retrieval; async consolidation + tier-1 compaction + hard delete; MCP section + CLI section (parity); prompt packs for ChatGPT portals + Claude + CLI; adherence telemetry v1 (prime/close/claim rates); wiki-worthy → staging flow; console fleet view (read); `studio.workgraph.*` events + knowledge projection; the user/agent memory split (FR-MEM21–22 rescoped: user-memory stays product-side, 3-state privacy enum inherited as the grants base, `studio_memory_*` descriptions re-pointed — no data migration).

Also in, per the same PO decision (2026-07-10 — nothing deferred): tier-2 deep compaction (FR-MEM12); the interop write adapter (FR-MEM16); per-item access grants (FR-MEM23); registered handoff roles (FR-MEM24); org-shared namespaces (FR-MEM25); coordination primitives — gates, work templates, dispatch views (FR-MEM26); the Claude memory-tool backend (FR-MEM27); and the sub-100ms fast-path retrieval tier (NFR-MEM1).

### 6.2 Out of scope
Nothing is deferred (PO decision 2026-07-10). Where that decision overrides an evidence-backed caution, the risk note stays inline (FR-MEM23's field-consensus note). True exclusions are §5 Non-Goals — including the platform-blocked ChatGPT-native bridge (no API exists) and agent mail (charter boundary). The pre-GA adherence spike, retrieval spike and load test remain as **validation gates**, which is sequencing, not deferral.

## 7. Cross-Cutting NFRs
- **NFR-MEM1 Latency:** committed invariant: **zero LLM calls on any hot path**. Numeric budgets are per-op-class **provisional targets pending a retrieval spike on our actual stack** (the knowledge-service semantic leg + tsvector + edge-adjacency fusion at the target envelope): create ≤ 150ms, claim ≤ 100ms, prime-compact ≤ 300ms, hybrid recall ≤ 500ms p95, plus a **fast-path tier**: exact-key recall and pinned-only prime-compact target ≤ 100ms p95 (index-bound reads, no vector search) — the spike fixes the published SLOs. (The oft-cited ~300ms figure is Zep's vendor-reported number on a different substrate; per our own research caveat it is inspiration, not a contract.)
- **NFR-MEM2 Scale envelope:** 100k items + 500k edges per tenant `[ASSUMPTION: envelope is 10× the top of beads' evidenced comfort range (10–100k per workspace); a pre-GA load test validates it or lowers it]` with a **published, measured degradation curve** (not asserted "flat" latency). The blocked-flag recompute must be incremental — scoped to the affected subgraph, never a full-graph rebuild under 100-item batch writes `[ASSUMPTION: incremental recompute strategy]`. Tenant *data* partitioning does not isolate *compute*: cell pinning + per-tenant rate limits are the noisy-neighbor controls. Burst-safe under batch writes (checkpointed, event-count-capped workflows; store-by-reference for large payloads — Temporal cliff lesson).
- **NFR-MEM3 Token economy:** prime-compact ≤ 300 tokens p95; measured session-over-session context-cost reduction is a product KPI (SM-1).
- **NFR-MEM4 Tenancy & isolation:** polymorphic `{user|org}`; tenant-partitioned Postgres; namespace-prefix isolation; per-agent credentials; cell-pinned per family rules.
- **NFR-MEM5 Durability & audit:** every mutation audited (CloudEvents on the spine); consolidation/compaction decisions carry trails; restore-from-history for compacted items.
- **NFR-MEM6 Degradation:** a workgraph outage degrades to honest-empty prime/recall with status — never blocks the agent's platform, never fabricates. **Degraded-mode coordination rule:** reads degrade; coordination writes do not get blind trust — `claim` remains a server-side atomic CAS even when `prime` is degraded, so a stale-blind claim still fails on conflict rather than double-claiming; degraded-mode guidance to agents is read-only proceed.
- **NFR-MEM7 Compliance posture:** SOC2-track controls, EU residency on the eu1 cell, no training on customer workgraph content — day-one requirements, not retrofits. **Dependency clause:** the consolidation/compaction LLM path (FR-MEM11/12 via `orvex-studio-ai`) MUST run under a contractual no-train, EU-resident, zero-retention provider configuration, enforced in orvex-studio-ai and named in the contracts seam — NFR-MEM7 is conditional on that dependency contract and is otherwise unbacked.

## 8. Success Metrics
**Primary**
- **SM-1: Session context cost (lab-validated claim, not live telemetry).** Median context-reconstruction cost drops ≥ 40% with prime+recall enabled vs. control. The service cannot observe host-side token accounting on hookless platforms, so SM-1 is measured in an **instrumented A/B harness**: control cohort runs the same prompt pack with prime/recall disabled; treatment tokens are prime+recall returned tokens **net of their own round-trip cost**; reconstruction cost in control is measured via the harness's own instrumentation (re-reads, transcript replays). Production tracking uses the observable proxy — injected-tokens-per-session trend — explicitly labeled a proxy. Validates FR-MEM8–10, NFR-MEM3.
- **SM-2: Coordination integrity.** < 1% double-claims; ≥ 95% of expired-lease items returned to ready within the reaper grace window (crash vs. slow-agent is unobservable — the metric measures lease expiry recovery, not crash attribution). Validates FR-MEM4.
- **SM-3: Ritual adherence (hypothesis under test, not a launch commitment).** Initial hypotheses: ≥ 80% prime-first and ≥ 70% Close Protocol after 4 weeks of prompt-pack tuning — validated or revised by the FR-MEM19 pre-GA spike, which sets the real targets and the viability floor. Denominator is the observable proxy: *workgraph-active sessions* (≥ 1 workgraph tool call), "prime-first" = first workgraph call is prime; this undercounts fully non-adherent sessions and says so. Validates FR-MEM18–19.

**Secondary**
- **SM-4:** missed-side-quest rate declines: of items created by an agent *while holding an active claim, within that claim's lifetime*, the share lacking a `discovered-from` edge trends down (true side-quest population is unknowable; this proxy is the honest signal). Validates FR-MEM2.
- **SM-5:** store leanness — consolidation+compaction keep active-item median age and store size within policy envelopes. Validates FR-MEM11–12.

**Counter-metrics (do not optimize)**
- **SM-C1: Item count growth.** More stored items is not success (Mem0's pricing anti-pattern); optimize recall usefulness and leanness, not volume. Counterbalances SM-5.
- **SM-C2: Prime size creep.** Prime must stay budgeted even as tenants grow; a fatter prime that "helps" is a regression. Counterbalances SM-1.

## 9. Relationship to Existing Features (Integration & Dependencies)
- **Supersedes (with ADR + supersession links):** OPS "Memory & The Librarian" *agent-side* design (typed atoms/areas/on-ramps → carried into item/note/fact semantics; Cross-AI Sync vision realized here); the *agent-side* concepts of `orvex-studio-ai` FR-AI11 ai_memories (planned-only). **Explicitly NOT superseded (user/agent split, PO 2026-07-10):** `orvex-studio-api`'s `/v1/memory` FormSpec store (FR-SA5–11), the `studio.memory.*` namespace, and the `studio_memory_get/save` tools — all user-memory product surfaces, staying product-side (rescoped FR-MEM21/22).
- **Depends on:** `orvex-studio-ai` (consolidation/compaction LLM calls, embeddings), `orvex-studio-knowledge` (projection of `studio.workgraph.*` for console/search + the semantic recall leg), Studio MCP + `orvex-cli` (new sections), `orvex-studio-identity` (per-agent credentials), `orvex-studio-billing` (quota entitlements: items, injected tokens `[ASSUMPTION: quota dimensions]`), `orvex-studio-workflows` (compaction/consolidation schedules, burst applies), `orvex-studio-contracts` (OpenAPI incl. the sync-verb schemas + the NEW `studio.workgraph.*` subdomain — additive; `studio.memory.*` stays reserved for the user-memory product per ADR-0010), Staging Area service (wiki-worthy flow).
- **Service:** new platform service `orvex-studio-workgraph` (name ruled by PO 2026-07-10; never shortened, keeping distance from orvex-studio-workflows), Go, six-tier family shape, own Postgres (no pgvector — semantic leg via knowledge/Turbopuffer, ADR-0014).

## 10. Constraints and Guardrails
- Family Coding Standards bind; **Postgres-only (D-S12)**: Postgres with a bi-temporal edge model (event-time + ingest-time) for as-of recall; the semantic/embedding leg rides the knowledge service (Turbopuffer, ADR-0014 — architecture ruling 2026-07-10), no service-local vector store; **Dolt is dropped** per the at-scale verdict (single-writer, no sharding, commit-graph memory load, field consensus against) — its cell-conflict and history ideas survive as schema design only.
- Concurrency: all-on-main + row-level transactions; never per-agent branches (beads' own reversal).
- beads is MIT; we embed concepts and selected algorithms (ready-work computation semantics, claim/lease mechanics) in clean Orvex code with attribution; no AGPL contamination concerns. (Collision-math/content-derived IDs were dropped from the port — FR-MEM1, addendum A1 amendment.)
- Privacy: items, notes and facts may embed end-user content; hard cascading delete (FR-MEM13); retention windows per plan tier; no cross-tenant retrieval ever.
- Prompt-pack changes are versioned and admin-approved (no silent behavior shifts on chat platforms).

## 11. Open Questions
1. ~~Service name + deployable topology~~ — RESOLVED 2026-07-10: `orvex-studio-workgraph`, separate service from day one (PO ruling + architecture spine).
2. Quota/pricing dimensions (items vs edges vs injected tokens vs consolidation LLM spend) — billing SoR mapping.
3. Bi-temporal edge model depth in v1 (full as-of queries vs invalidation timestamps only).
4. Role-registry schema in the identity service (the registry itself is decided — FR-MEM24).
5. How much of the short-ID ergonomics (server-issued per-tenant short IDs, FR-MEM1) surface to end users in console vs internal-only.
6. The concrete entity/relation/observation ↔ item/fact/edge mapping table for the interop adapter (read+write is decided — FR-MEM16).
7. Whether adherence telemetry (FR-MEM19) can share the Librarian's feedback-learning machinery (one learning loop, two prompt packs).

## 12. Assumptions Index
- §3/§4.1 — v1 item-type set; lease TTL 30 min, reaper grace 2× TTL.
- §4.3 FR-MEM12 — compaction windows 30d/90d default.
- §4.5 FR-MEM19 — pack revisions proposed to admins (mirrors Librarian loop); adherence viability floor ≥ 50% prime-first pending the pre-GA spike.
- §4.7 FR-MEM27 — memory-tool protocol version pinned at architecture time (pinned: `memory_20250818`).
- §5 — NOTICE-level MIT attribution for beads concepts.
- §7 NFR-MEM2 — 100k items/500k edges tenant envelope (pre-GA load test validates or lowers); incremental blocked-flag recompute strategy.
- §9 — ~~service name~~ (ruled: `orvex-studio-workgraph`); quota dimensions items + injected tokens.
