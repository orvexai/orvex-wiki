# LangMem — prior-art deep dive

## What it is
LangMem is an open-source (MIT) Python SDK from LangChain that gives LangGraph agents long-term memory — semantic, episodic, and procedural — so agents "learn and adapt from their interactions over time." It ships as a library, not a hosted service: a memory API that works with any storage backend, plus native integration with LangGraph's Long-Term Memory Store. It is explicitly framework-scoped to LangGraph/LangChain agents, not a standalone memory product.
Sources: https://langchain-ai.github.io/langmem/ , https://github.com/langchain-ai/langmem , https://www.langchain.com/blog/langmem-sdk-launch

## Behind it & traction
Built and maintained by LangChain AI (the `langchain-ai` GitHub org) — the same company behind LangChain, LangGraph, and LangSmith. It launched as a "hosted LangMem alpha service" before being released as an open SDK (the hosted service is referenced only historically in the launch post; current distribution is SDK-only). GitHub: ~1.5k stars, ~175 forks, MIT license, Python 99.4% of the codebase. Per one third-party scan, the repo had commits as recently as June 2026 (active) but the latest PyPI release was 0.0.30 from October 2025 — i.e., still pre-1.0 with a slow release cadence, and GitHub shows "no releases published" via the standard releases page. Community size is far smaller than competitor Mem0 (~1.5k vs ~47-56k stars per third-party comparisons).
Sources: https://github.com/langchain-ai/langmem , https://www.langchain.com/blog/langmem-sdk-launch , https://atlan.com/know/ai-agent/ai-agent-memory/langgraph-memory-vs-mem0/

## Architecture & data model
Two layers of primitives sit on top of any `BaseStore` implementation (LangGraph's storage abstraction):
- **Hot-path tools**: `create_manage_memory_tool()` and `create_search_memory_tool()` let the agent itself decide, mid-conversation, to create/update/delete/search memories by ID.
- **Background memory manager**: `create_memory_store_manager()` (and the lower-level `create_memory_manager()`) runs after/between conversations to extract, consolidate, and update memories automatically ("subconscious" processing), returning `ExtractedMemory` objects with stable IDs it can later update rather than duplicate.

Storage is namespace-scoped using tuple namespaces (e.g. `namespace=("memories",)`), commonly parameterized by `user_id` for per-user isolation, with the same mechanism usable to share memory across a team, app route, or globally. Two concrete store backends are documented: `InMemoryStore` (dev) and `AsyncPostgresStore` (production). Conversation-level state (checkpointing) is kept separate from long-term memory (the `BaseStore`) — LangGraph's `MemorySaver` checkpointer handles the former, `BaseStore` the latter.
Sources: https://langchain-ai.github.io/langmem/ , https://langchain-ai.github.io/langmem/hot_path_quickstart/ , https://www.langchain.com/blog/langmem-sdk-launch

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
Python SDK only. No MCP server, no CLI, and no chat-platform plugins (ChatGPT, Claude.ai, Slack, etc.) were found in official docs or the GitHub repo — direct fetch of the hot-path quickstart page confirmed no mention of MCP/ChatGPT/Claude-app/Slack/CLI. It is designed to be wired into a LangGraph agent (e.g., `create_react_agent`) or a custom LangGraph graph; any exposure to an end-user chat surface (ChatGPT, Claude, a portal) has to be built by the integrator on top of a LangGraph-based agent — LangMem provides none of that plumbing itself. (Unrelated third-party MCP memory servers exist in the ecosystem, e.g. `alphaonedev/ai-memory-mcp`, but they are not LangMem.)
Sources: https://langchain-ai.github.io/langmem/hot_path_quickstart/ , https://github.com/langchain-ai/langmem

## Memory lifecycle & sharing
- **Capture**: either explicit (agent calls the hot-path `manage_memory` tool during the conversation) or implicit (background manager extracts facts/episodes after the fact from message history).
- **Consolidate**: the memory manager can update an existing `ExtractedMemory` by ID rather than always inserting a new one, which is LangMem's basic dedup/consolidation mechanism; no separate decay, compaction, or summarization scheduler was documented — "specific details about reflection, consolidation, decay, or compaction mechanisms are not included" in the primary hot-path doc, and episodic memory is explicitly called out as immature: "LangMem doesn't yet support opinionated utilities for episodic memory."
- **Retrieve**: `create_search_memory_tool()` gives the agent an in-conversation semantic search tool over the namespace's memory collection.
- **Memory types**: semantic (facts/preferences, collection-based), episodic (distilled past interactions — least developed), procedural (the agent rewrites its own system prompt/instructions based on feedback, via reflection algorithms named `metaprompt`, `gradient`, `prompt_memory`). Procedural memory-as-prompt-editing is the one genuinely distinctive idea in the taxonomy relative to typical "fact store" memory products.
- **Multi-agent sharing / namespaces / permissions**: sharing is entirely namespace-driven — "all memories are given a namespace," typically `user_id`-scoped, but the same primitive can be widened to share across a team, app route, or globally "determined by privacy and performance needs." There is no separate ACL/permission model beyond namespace choice — no roles, no per-memory grants documented.
- **Token-cost story**: no explicit token-cost or context-budget documentation was found (no cost-per-recall accounting, no auto-summarization-to-save-tokens narrative surfaced by any of the fetched pages).
- **Chat-platform integration**: none — see API section above. LangMem lives entirely inside the LangGraph agent-development surface, not at the chat-platform edge.
Sources: https://langchain-ai.github.io/langmem/hot_path_quickstart/ , https://www.langchain.com/blog/langmem-sdk-launch , https://langchain-ai.github.io/langmem/

## Scale & operational evidence
No official published benchmarks, uptime/SLA data, or named-customer case studies were found from LangChain itself. The most concrete scale/performance data point in circulation is a **competitor-published** benchmark: Mem0's own blog claims LangMem's retrieval/write path takes ~59.82s versus Mem0's ~0.200s p95 in a memory benchmark — this is a vendor (competitor) claim, not independently verified, and should be treated as marketing rather than evidence. Third-party comparison articles consistently describe LangMem as coupling memory tightly to the LangGraph runtime (no standalone latency/scale story of its own) versus Mem0's standalone REST-service model. Community-size proxies (GitHub stars ~1.5k vs Mem0's ~47-56k) suggest a much smaller adoption/production footprint than the memory-market leader.
Sources: https://mem0.ai/blog/benchmarked-openai-memory-vs-langmem-vs-memgpt-vs-mem0-for-long-term-memory-here-s-how-they-stacked-up , https://atlan.com/know/ai-agent/ai-agent-memory/langgraph-memory-vs-mem0/ , https://agentmarketcap.ai/blog/2026/04/10/agent-memory-vendor-landscape-2026-letta-zep-mem0-langmem

## Pricing & positioning
LangMem the SDK is free and MIT-licensed — there is no separate LangMem product price. It sits inside the broader (paid) LangChain ecosystem: LangSmith (observability/tracing) has a free tier, $39/mo Developer, $259/mo Plus, and custom Enterprise pricing; LangGraph Platform deployment is metered (~$0.005/run plus ~$0.0036/min production uptime, ~$0.0007/min dev uptime), with one free dev-sized deployment on the Plus plan. Positioning: LangMem is the "path of least resistance" memory layer specifically for teams already committed to LangGraph — its value proposition is deep framework-native integration, not portability or being the best standalone memory product (that positioning is ceded to Mem0 in third-party comparisons).
Sources: https://www.langchain.com/pricing , https://atlan.com/know/ai-agent/ai-agent-memory/langgraph-memory-vs-mem0/ , https://www.langchain.com/blog/langmem-sdk-launch

## STEAL - 3-5 concrete ideas for Orvex
1. **Procedural memory as prompt-editing, not just fact storage.** LangMem's `metaprompt`/`gradient` reflection loop that rewrites an agent's own system instructions from observed feedback is a genuinely useful pattern Orvex's librarian agent could borrow: let repeated correction patterns from staged-content review feed back into a per-customer agent prompt tweak, not just into wiki content.
2. **Explicit hot-path vs background-manager split.** Cleanly separating "agent decides mid-conversation to save something" (hot path, cheap, synchronous) from "a background process extracts/consolidates after the fact" (async, can be heavier) maps directly onto Orvex's staging-area design: agents propose in-session, a librarian consolidates out-of-band.
3. **ID-stable "extracted memory" objects that get updated in place.** Returning a stable ID per extracted fact so re-extraction updates rather than duplicates is a simple, effective consolidation primitive worth copying for cross-agent memory dedup.
4. **Namespace-as-the-only-sharing-primitive is a legitimate v1 simplification.** For an MVP, "share by namespace" (user/team/app-scoped tuples) with no separate ACL layer is enough — Orvex could adopt namespace-scoping as the initial cross-agent memory sharing mechanism rather than building a full permissions model up front.
5. **Storage-backend abstraction (BaseStore working over InMemory or Postgres).** A thin memory-store interface that works over an in-memory dev backend and a Postgres prod backend (mirroring Orvex's existing Postgres-centric stack) is a low-risk architectural template, cheaper than committing to Dolt immediately.

## AVOID / where Orvex differs
- **No MCP, no CLI, no chat-platform surface** — LangMem is invisible outside a LangGraph Python process. Orvex's cross-agent memory service must be exposed as MCP tools + CLI + chat-platform-driven prompts by design; LangMem offers nothing to copy here, this is a gap Orvex fills that LangMem doesn't even attempt.
- **No decay/compaction/summarization story and immature episodic memory** — LangMem admits it "doesn't yet support opinionated utilities for episodic memory," and no lifecycle mechanism for pruning stale memories was documented. Orvex's memory service needs a real decay/compaction design; don't assume LangMem solved this.
- **No permissions/ACL model, only namespaces** — fine for LangMem's single-framework, single-tenant-per-deployment usage, but Orvex is explicitly multi-tenant; namespace-only sharing is insufficient long-term and should be treated as a starting point, not the destination.
- **Weak operational/scale evidence and a competitor-reported latency red flag (~60s)** — even if unverified, this signals LangMem was not built for low-latency production recall at scale; Orvex's cross-agent memory (used inside live agent conversations) cannot inherit that risk and needs its own latency budget/benchmarking from day one.
- **Small community, slow release cadence, pre-1.0** — not a platform to depend on or emulate for maturity signals; treat as a design-pattern source, not an integration target.
Sources: https://langchain-ai.github.io/langmem/hot_path_quickstart/ , https://github.com/langchain-ai/langmem , https://mem0.ai/blog/benchmarked-openai-memory-vs-langmem-vs-memgpt-vs-mem0-for-long-term-memory-here-s-how-they-stacked-up

## Sources
- https://langchain-ai.github.io/langmem/ — official docs home
- https://langchain-ai.github.io/langmem/hot_path_quickstart/ — hot-path tools quickstart
- https://langchain-ai.github.io/langmem/reference/memory/ — memory API reference
- https://github.com/langchain-ai/langmem — source repo, stars/forks/license/activity
- https://www.langchain.com/blog/langmem-sdk-launch — official SDK launch post (memory types, namespaces)
- https://www.langchain.com/pricing — LangSmith/LangGraph Platform pricing
- https://atlan.com/know/ai-agent/ai-agent-memory/langgraph-memory-vs-mem0/ — third-party comparison (architecture, community size, positioning)
- https://mem0.ai/blog/benchmarked-openai-memory-vs-langmem-vs-memgpt-vs-mem0-for-long-term-memory-here-s-how-they-stacked-up — competitor-published benchmark (marketing claim, not independently verified)
- https://agentmarketcap.ai/blog/2026/04/10/agent-memory-vendor-landscape-2026-letta-zep-mem0-langmem — third-party vendor landscape roundup
