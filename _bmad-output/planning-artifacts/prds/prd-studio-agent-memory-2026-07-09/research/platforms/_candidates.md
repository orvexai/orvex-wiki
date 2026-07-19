# Cross-Agent Memory — Prior-Art Candidates

Shortlist of platforms/products/projects most worth a deep prior-art profile for Orvex Studio's **Cross-Agent Memory** service (hosted memory + coordination inspired by beads; MCP tools + Studio CLI; agents log work, discover each other's context, hand off, and make future sessions cheaper; storage possibly Dolt). Beads itself is excluded (separately audited). Angles swept: dedicated agent-memory platforms, hyperscaler managed memory, LLM-native memory, MCP memory servers, agent coordination/handoff protocols, and OSS/research systems.

---

## Dedicated agent-memory platforms

**Mem0** — The category-leading standalone memory layer you bolt onto any agent stack (~48k GitHub stars, $24M funding, largest dev community). Provides a three-tier scope model (user/session/agent) over a hybrid store combining vectors, a graph, and key-value lookups, with automatic fact extraction, contradiction resolution, and selective forgetting exposed via API + MCP. This is the reference bar for "memory as a managed layer" and the most direct competitor to Orvex's memory surface — study its scoping model, extraction pipeline, and self-host vs. cloud split. https://mem0.ai

**Zep / Graphiti** — Zep models memory as a *temporal knowledge graph* built on its open-source engine Graphiti (Apache-2.0, ~28k stars, open-sourced Jan 2025). Every fact edge is bi-temporal — it records both valid-time (when a fact was true in the world) and transaction-time (when the system learned it) — enabling "what was true as of date X?" queries. Directly relevant because Orvex's librarian/staging and cross-agent facts will change over time; Graphiti is the canonical design for as-of-date fact recall and PII/entity resolution on the write side. https://www.getzep.com / https://github.com/getzep/graphiti

**Letta (formerly MemGPT)** — A full agent *runtime* where the model pages its own memory like an operating system: core memory (in-context RAM), archival memory (external vector store, "disk"), and recall memory (conversation history), with the LLM issuing explicit OS-style paging ops. Carries the influential MemGPT research lineage. Matters to Orvex as the archetype for self-editing, long-horizon agents that manage what stays in context — informs how much memory curation is agent-driven vs. librarian-driven. https://www.letta.com

**Cognee** — Open-source, graph-native memory platform built around a structured ECL (Extract, Cognify, Load) pipeline that treats memory as an active, self-improving layer rather than a passive store; ships 14 retrieval modes, pluggable storage backends, and native LangGraph + MCP integrations. Relevant because Orvex needs a self-improving knowledge substrate and Cognee is the leading OSS example of pipeline-driven graph memory with a permissive self-host story. https://www.cognee.ai / https://github.com/topoteretes/cognee

---

## Hyperscaler managed memory

**AWS Bedrock AgentCore Memory** — Fully managed agent-memory service (announced AWS Summit NYC 2025, GA Oct 13 2025) offering both a *managed* strategy (automatic extraction + consolidation) and a *self-managed* strategy (full pipeline control for domain-specific knowledge graphs). Includes short-term (raw event) and long-term (semantic/summary/user-preference) plus episodic memory that lets agents accumulate experience across sessions. The most operationally complete managed offering — the reference for multi-tenant memory strategy configuration and the managed-vs-self-managed split Orvex must decide on. https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html

**Google Vertex AI Memory Bank (Agent Engine)** — Google's managed agent-memory service inside Vertex AI Agent Engine, extracting durable memories from sessions and serving them back for personalization; part of the ADK ecosystem (7M+ downloads by Q1 2026). Worth profiling as the Google-side managed peer to Bedrock AgentCore, and for how it couples memory to a broader agent runtime + A2A. https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/memory-bank/overview

**Azure AI Foundry Agent Service** — Microsoft's managed agent runtime (GA with 10,000+ customers, deep M365/Teams integration) with thread-scoped state and emerging memory features. Weaker as a dedicated memory product than Bedrock/Vertex, but essential for hyperscaler completeness and because its enterprise/thread-state and governance model is the pattern many Orvex customers already expect. https://learn.microsoft.com/en-us/azure/ai-foundry/agents/

---

## LLM-native memory

**OpenAI / ChatGPT Memory** — Consumer/prosumer memory with three layers: Saved Memory (explicit facts), Chat History Reference (automatic retrieval across past conversations, Plus/Pro since Apr 2025), and Inferred Profile Context (behavioral patterns). Defines end-user expectations for "the assistant just remembers me" and the UX/transparency/editing bar (view, edit, forget) that Orvex customers will implicitly benchmark against. https://help.openai.com/en/articles/8590148-memory-faq

**Anthropic / Claude Memory & Projects** — Persistent, editable, *project-scoped* memory (each project isolated so contexts don't overlap) plus cross-conversation search, with import/export of memory between accounts/tools. Directly relevant because Orvex embeds chat-based agents (Claude included) and Claude's project-isolation model is a strong analog for per-customer / per-workspace memory partitioning and portability. https://support.claude.com/en/articles/11817273

---

## MCP memory servers

**MCP Knowledge Graph Memory Server (reference implementation)** — The official Model Context Protocol reference memory server: a lightweight local knowledge graph (entities, relations, observations) letting agents like Claude and Cursor persist structured info across sessions via MCP tools. Since Orvex is MCP-first, this is the baseline interface contract and the simplest shape of "memory as MCP tools" that customers may already run — the thing Orvex's richer service must interoperate with and out-class. https://github.com/modelcontextprotocol/servers/tree/main/src/memory

---

## Agent coordination / handoff (beads-adjacent)

**Google Agent2Agent (A2A) protocol** — Open standard (announced Apr 2025) for agents built by different vendors to discover each other (Agent Cards), delegate Tasks, and coordinate work over HTTP/SSE/JSON-RPC 2.0; complementary to MCP (A2A = agent-to-agent coordination, MCP = tool/data access). The leading standard for the *coordination/handoff* half of Orvex's mandate — profile it for how cross-agent discovery, task delegation, and shared work state are modeled without a central coordinator (the same problem space beads addresses via a Git-backed issue graph). https://a2aprotocol.ai / https://google.github.io/A2A/

---

## OSS / infrastructure entrants

**LangMem (LangChain)** — LangChain's native memory library, a first-class layer in the LangGraph ecosystem for storing/retrieving/managing agent memories over the LangGraph store abstraction (semantic, episodic, procedural memory helpers). Matters as the default memory path for the huge LangGraph builder base and a reference for memory-type taxonomy and background "memory manager" patterns. https://langchain-ai.github.io/langmem/

**Supermemory** — Purpose-built for *coding-agent* memory workflows (single memory API for fact extraction, user-profile building, contradiction resolution, selective forgetting) with an MCP server and plugins for Claude Code and OpenCode, deployed on Cloudflare Workers for low latency. The closest analog to Orvex's own use case (agents/CLI writing durable memory as they work) — study its write API, plugin surface, and forgetting policy. https://supermemory.ai

**Redis Agent Memory Server** — Open-source memory server (from Redis) giving agents persistent working + long-term memory over Redis, with structured extraction and low-latency recall; increasingly the trusted memory backend for agent devs per the 2025 SO survey. Relevant as the "fast infra backend" pattern and a contrast to Orvex's possible Dolt (versioned SQL) choice — informs the latency/versioning trade-off. https://github.com/redis/agent-memory-server

**Cloudflare Agent Memory** — Managed edge memory service (built on Durable Objects / the Agents SDK) that extracts facts from conversations with relative-date resolution and runs verification checks for entity identity, temporal accuracy, and whether inferred facts are supported by the source. A notable 2026 managed entrant worth profiling for its verification-on-write model and edge/multi-tenant isolation approach. https://blog.cloudflare.com/introducing-agent-memory/
