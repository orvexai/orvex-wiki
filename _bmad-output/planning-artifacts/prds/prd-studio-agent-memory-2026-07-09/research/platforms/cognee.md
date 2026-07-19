# Cognee — Platform Deep Dive

## What it is
Cognee is an open-source AI memory platform (Apache-2.0) that gives AI agents persistent, cross-session memory by building a self-hosted "knowledge graph + vector" hybrid store from ingested data. Its pitch is "memory in 6 lines of code": ingest data in any format, run an ECL-style pipeline (cognee calls it Add → Cognify → Memify → Search / "ACMS"), and query it back through 14 retrieval modes combining graph traversal and vector similarity. It ships as a Python SDK (with Rust and TypeScript ports), a CLI, a REST API, and an MCP server, plus a managed Cognee Cloud offering.
Source: [GitHub — topoteretes/cognee](https://github.com/topoteretes/cognee), [cognee.ai](https://www.cognee.ai/)

## Behind it & traction
- Company: Topoteretes UG (haftungsbeschränkt), operating as "Cognee Inc" / cognee, based in Berlin, founded 2024 by Vasilije Markovic (CEO, background in clinical psychology/engineering/business) and Boris Arzentar (Co-founder & CTO). Source: [Cognee — About Us](https://www.cognee.ai/about-us), [Crunchbase — cognee inc](https://www.crunchbase.com/organization/cognee-inc)
- Funding: raised a $7.5M seed (marketing blog) — Crunchbase/Tracxn aggregate total funding at $9.09M from investor Pebblebed. Source: [Cognee blog — seed announcement](https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed), [Crunchbase — cognee inc](https://www.crunchbase.com/organization/cognee-inc)
- GitHub traction (as fetched): ~27.4k stars, 2.6k forks, 8,438 commits, 125+ releases, 80+ contributors. Marketing claims "70+ production deployments." These adoption/deployment numbers are marketing claims, not independently verified. Source: [GitHub — topoteretes/cognee](https://github.com/topoteretes/cognee), [Cognee blog — memory frameworks guide](https://www.cognee.ai/blog/guides/open-source-memory-frameworks-llm-agents)
- Notable: cognee is called out as having "graduated" GitHub's Secure Open Source program. Source: [Cognee — GitHub Secure Open Source](https://medium.com/@cognee/cognee-ai-memory-security-cognee-graduates-github-secure-open-source-3032d42f78a1)

## Architecture & data model
Four async pipeline stages (cognee's "ACMS"):
1. **Add** — ingests files/URLs/S3 URIs across 38+ formats, normalizes and dedupes via content hashing.
2. **Cognify** — a six-stage sub-pipeline: classify documents → check permissions → extract chunks → LLM-based entity/relationship extraction → generate summaries → embed everything into the graph+vector stores.
3. **Memify** — refinement pass: prunes stale nodes, strengthens frequently-used edges, reweights connections by usage signal, generates derived facts ("evolving structure that adapts based on feedback").
4. **Search** — 14 retrieval modes spanning graph completion, RAG, semantic match, code analysis, summaries, and raw Cypher queries, with an auto-selection mode.

Storage is a hybrid of three swappable layers:
- Graph store (default Kuzu; also Neo4j, FalkorDB, Neptune, Memgraph)
- Vector store (default LanceDB; also Qdrant, pgvector, Redis, DuckDB, Pinecone, ChromaDB)
- Relational store (default SQLite; also PostgreSQL)
Cognee 1.0 marketing also claims the entire memory layer can run on a single Postgres instance (pgvector for vectors + relational). The core unit of data is a `DataPoint`, a Pydantic model carrying content plus customizable indexed metadata.
Source: [Cognee blog — how cognee builds AI memory](https://www.cognee.ai/blog/fundamentals/how-cognee-builds-ai-memory), [GitHub — topoteretes/cognee](https://github.com/topoteretes/cognee)

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
- **SDK**: Python (primary), Rust (`cognee-rs`), TypeScript (`@cognee/cognee-ts`).
- **CLI**: `cognee-cli`; `cognee-cli -ui` (v0.3.5+) launches a UI and the MCP server together.
- **REST API**: HTTP server mode.
- **MCP server**: exposes tools — `cognify` (ingest→graph), `save_interaction` (captures agent/user interaction, generates coding rules), `search` (multi-mode retrieval), `list_data`, `delete`, `prune` (full reset). Configured in an MCP-compatible client's config file (e.g. Claude Desktop `.claude/config.json`).
- **Chat/agent-platform plugins**: a "Cognee memory plugin for Claude Code" that captures prompts, tool traces, and assistant responses into session memory, injects relevant context on every prompt, and syncs session memory into the permanent knowledge graph at session end. Also native `add_tool`/`search_tool` integrations for LangGraph and the OpenAI Agents SDK, plus an "OpenClaw" integration mentioned in the README.
- No authentication/API-key/permission model for the MCP server itself is documented — this is a gap.
Source: [Cognee blog — introducing cognee MCP](https://www.cognee.ai/blog/cognee-news/introducing-cognee-mcp), [GitHub — topoteretes/cognee](https://github.com/topoteretes/cognee), [mcpmarket.com — cognee](https://mcpmarket.com/server/cognee)

## Memory lifecycle & sharing
- **Capture → consolidate → retrieve → decay/compact**: Add/Cognify capture and structure; Memify is the explicit consolidation/decay stage (pruning stale nodes, reweighting edges by usage, generating derived facts); Search is retrieval across 14 modes. Cognee distinguishes short-term "session" working context (loaded embeddings/graph fragments for in-flight reasoning, including pronoun/reference resolution) from permanent cross-linked long-term memory.
- **Multi-agent sharing / namespaces / permissions**: memory graphs instantiate per-user, per-group, or as shared public graphs, with dataset-level permissions (read, write, delete, share) — supported across pgvector, Neo4j, Kuzu, and LanceDB backends. Marketing also describes "multiple AI agents (Claude, GPT-4, local Llama) talking to the same cognee instance through a shared protocol" via MCP, but no documented namespace-isolation or access-control mechanism at the MCP-tool level was found — this looks thinner than the dataset-permission model in the core SDK.
- **Cross-session token-cost story**: not quantified with a documented methodology beyond a self-reported BEAM benchmark (0.79 at 100K tokens, 0.67 at 10M tokens) claimed to outperform prior long-context agent-memory approaches — this is a vendor-reported benchmark, not independently reproduced.
- **Chat-platform integration**: concretely documented for Claude Code (memory plugin) and generic MCP clients (Claude Desktop config). No ChatGPT-specific or generic "customer portal" integration story was found.
- **Known weakness (third-party)**: reviewers note cognee "doesn't handle conversation personalization well — remembering user preferences, tracking session context, or adapting to individual users over time" as well as Mem0/Zep do; it's positioned as strongest for document→knowledge-graph extraction, not per-user conversational memory.
Source: [Cognee blog — how cognee builds AI memory](https://www.cognee.ai/blog/fundamentals/how-cognee-builds-ai-memory), [Cognee blog — introducing cognee MCP](https://www.cognee.ai/blog/cognee-news/introducing-cognee-mcp), [MCP.Directory — Mem0 vs Letta vs Zep vs Cognee 2026](https://mcp.directory/blog/mem0-vs-letta-vs-zep-vs-cognee-2026), [vectorize.io — Best Cognee Alternatives 2026](https://vectorize.io/articles/cognee-alternatives)

## Scale & operational evidence
- Vendor-reported: 27.4k GitHub stars, 2.6k forks, 8,438 commits, 80+ contributors, "70+ production deployments" (marketing claim, unverified).
- Vendor-reported BEAM benchmark scores (0.79/0.67 at 100K/10M tokens) — no independent reproduction found.
- Third-party assessment: "Cognee's managed cloud service is newer and less battle-tested than alternatives like Mem0 or Zep," and it "does not advertise SOC 2 or HIPAA certification" as of mid-2026 — flagged as potentially disqualifying for regulated enterprise procurement.
- No independently published uptime/SLA data, customer case studies with named logos, or load/latency benchmarks were found.
Source: [GitHub — topoteretes/cognee](https://github.com/topoteretes/cognee), [vectorize.io — Best Cognee Alternatives 2026](https://vectorize.io/articles/cognee-alternatives)

## Pricing & positioning
- **Free**: $0/mo — 1M tokens included, 1 workspace, unlimited users, unlimited API calls, agentic integrations (Claude Code, Codex, MCP), no card required.
- **Standard** ("Popular"): $2.50 per 1M tokens processed + $5/month per additional workspace; adds data-source integrations (Slack, Notion, Google Drive) and in-app support.
- **Enterprise**: contact sales — dedicated Slack channel, dedicated support engineer, BYO cloud, support SLA.
- **Self-host**: full open-source engine runnable locally or on your own stack, "free, forever" (Apache-2.0).
- Positioning vs. peers (per third-party comparisons): Cognee is the graph-native/document-to-knowledge-graph specialist; Mem0 is favored for simple chatbot memory; Zep for enterprise apps with rapidly-changing user state. Cognee is noted as offering full knowledge-graph capability at every tier (including free/self-hosted) whereas Mem0 gates graph memory behind its $249/mo Pro plan.
Source: [Cognee — Pricing](https://www.cognee.ai/pricing), [MCP.Directory — Mem0 vs Letta vs Zep vs Cognee 2026](https://mcp.directory/blog/mem0-vs-letta-vs-zep-vs-cognee-2026), [vectorize.io — Best Cognee Alternatives 2026](https://vectorize.io/articles/cognee-alternatives)

## STEAL — 3-5 concrete ideas for Orvex
1. **Explicit memory-native verb API** (`remember` / `recall` / `improve` / `forget`) instead of raw CRUD — gives agents (and the librarian) a small, stable contract to code against, and "forget" as a first-class operation maps directly onto Orvex's need for staged content to be revocable/expirable, not just append-only.
2. **A distinct consolidation/decay stage ("Memify")** separate from capture and retrieval — pruning stale nodes and reweighting by usage is a concrete pattern Orvex's librarian agent or the cross-agent memory service could adopt so memory doesn't grow unbounded across 100-document staging sessions.
3. **Dataset-level permission model (read/write/delete/share) per user/group/shared-graph** — directly reusable as the shape of a multi-tenant, per-customer namespace/permission scheme for Orvex's memory/coordination service, which today is only "possibly Dolt" with no permission model defined.
4. **Swappable-backend design (graph/vector/relational each pluggable, with a single-Postgres "run everything on one instance" mode)** — since Orvex is already Postgres-centric, mirroring cognee's "start on one Postgres instance, graduate to dedicated graph/vector stores later" path lowers the barrier for self-hosted customers without forcing an early Dolt/graph-DB commitment.
5. **Ship both an MCP server and a chat-platform session-capture plugin (the Claude Code plugin pattern: capture prompt/tool-trace/response → inject context on every turn → sync to permanent store at session end)** — this is close to exactly the cross-agent memory UX Orvex wants; cognee's plugin is concrete prior art for "continuously log what agents are doing" that could be studied file-by-file.

## AVOID / where Orvex differs
- **No documented MCP-level auth/permission model**: cognee's MCP tools (`cognify`, `search`, `delete`, `prune`) have no documented API-key or access-control layer distinct from the SDK's dataset permissions — a real gap Orvex must not repeat, especially since Orvex is explicitly multi-tenant and agents must never write directly to customer-facing stores (the wiki analog: the whole point of Orvex's staging area is to interpose review before any write, whereas cognee's `cognify`/`delete`/`prune` MCP tools appear to write/mutate directly).
- **Weak on per-user conversational personalization** per third-party review — Orvex's cross-agent memory track explicitly needs "make future sessions cheaper because context is already worked out" across agents/customers, which is closer to conversational/task memory than cognee's document-to-knowledge-graph strength; don't assume cognee's graph-extraction focus transfers cleanly to that use case.
- **No SOC 2/HIPAA and an admittedly less battle-tested managed cloud** — Orvex is building for enterprise multi-tenant customers; compliance posture needs to be a first-class requirement from day one rather than retrofitted, unlike cognee's current state.
- **Benchmarks are vendor-self-reported and unverified** — Orvex should not cite cognee's BEAM numbers as evidence of production-grade retrieval quality without independent testing.
- **Storage choice unconfirmed for Orvex (possibly Dolt) vs. cognee's graph+vector+relational triad** — cognee's model assumes knowledge-graph extraction is central; if Orvex's memory service is closer to a structured issue/task-log store (beads-inspired), the graph-extraction pipeline (Cognify's LLM entity/relationship extraction) may be more machinery than needed and worth deliberately scoping out rather than copying wholesale.

## Sources
- [GitHub — topoteretes/cognee](https://github.com/topoteretes/cognee)
- [Cognee — homepage](https://www.cognee.ai/)
- [Cognee — About Us](https://www.cognee.ai/about-us)
- [Cognee — Pricing](https://www.cognee.ai/pricing)
- [Cognee blog — how cognee builds AI memory](https://www.cognee.ai/blog/fundamentals/how-cognee-builds-ai-memory)
- [Cognee blog — introducing cognee MCP](https://www.cognee.ai/blog/cognee-news/introducing-cognee-mcp)
- [Cognee blog — seed funding announcement](https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed)
- [Cognee blog — open-source memory frameworks guide](https://www.cognee.ai/blog/guides/open-source-memory-frameworks-llm-agents)
- [Crunchbase — cognee inc](https://www.crunchbase.com/organization/cognee-inc)
- [Medium — Cognee graduates GitHub Secure Open Source](https://medium.com/@cognee/cognee-ai-memory-security-cognee-graduates-github-secure-open-source-3032d42f78a1)
- [mcpmarket.com — Cognee MCP server listing](https://mcpmarket.com/server/cognee)
- [vectorize.io — Best Cognee Alternatives for AI Agent Memory in 2026](https://vectorize.io/articles/cognee-alternatives)
- [MCP.Directory — Best AI Agent Memory 2026: Mem0 vs Letta vs Zep vs Cognee](https://mcp.directory/blog/mem0-vs-letta-vs-zep-vs-cognee-2026)
