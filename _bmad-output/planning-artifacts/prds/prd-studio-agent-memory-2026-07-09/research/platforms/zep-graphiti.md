# Zep / Graphiti — Prior-Art Deep Dive (Memory Track)

## What it is
Zep is a hosted "agent memory at enterprise scale" platform built on top of Graphiti, an open-source (Apache-2.0) Python framework for building and querying **temporal context graphs** for AI agents. Graphiti ingests conversational "episodes" plus structured business data, extracts entities/relationships with an LLM, and stores them as a bi-temporal knowledge graph that tracks how facts change over time with full provenance back to source episodes. Zep is the managed/enterprise product; Graphiti is the open-core engine anyone can self-host. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti), [Zep Docs — Graphiti overview](https://help.getzep.com/graphiti/getting-started/overview), [getzep.com](https://www.getzep.com/))

## Behind it & traction
- Company: Zep (getzep.com / getzep org on GitHub). Authors of the core Zep paper: Preston Rasmussen, Pavlo Paliychuk, Travis Beauvais, Jack Ryan, Daniel Chalef. ([arXiv:2501.13956](https://arxiv.org/abs/2501.13956))
- Funding: only a $500K seed round (April 2024) from Y Combinator per Tracxn/Crunchbase aggregation — no Series A found. Treat as a small, early-stage vendor, not a scaled incumbent. ([Tracxn](https://tracxn.com/d/companies/zep/__poSadJnSfLWHjz05Xi3U5KwnpCMWSU3aDrihLX_8FLs), [Crunchbase](https://www.crunchbase.com/organization/zep-ai))
- Open-source traction: Graphiti repo shows 28.6k GitHub stars, Apache-2.0 license. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti))
- Academic validation: published on arXiv (2501.13956, Jan 2025) with benchmark claims (below); this is the vendor's own paper, not independent peer review — treat benchmark numbers as marketing-adjacent evidence, not third-party audit. unknown whether any independent/third-party benchmark of Zep vs. competitors exists.

## Architecture & data model
- **Bi-temporal edges**: every relationship (edge) carries both *event time* (when the fact was true in the world) and *ingestion/system time* (when Zep/Graphiti first observed it). This lets the system distinguish "old fact superseded" from "fact retracted," and answer as-of-date queries. ([emergentmind summary of arXiv:2501.13956](https://www.emergentmind.com/topics/zep-a-temporal-knowledge-graph-architecture), [GitHub - getzep/graphiti](https://github.com/getzep/graphiti))
- **Core primitives**: Entities (nodes, with temporally-adapting summaries), Facts/Relationships (edges as triplets with validity windows: when a fact became true and when it ceased being true), Episodes (raw source data giving full lineage from derived facts back to origin), and optional custom entity/edge types via Pydantic models. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti))
- **Conflict handling**: "temporal edge invalidation" — contradictions are resolved by bi-temporal bookkeeping rather than by LLM judgment calls at write time. ([Zep Docs overview](https://help.getzep.com/graphiti/getting-started/overview))
- **Retrieval**: hybrid search combining vector/semantic similarity, BM25 full-text, and graph traversal into one ranked result set — no LLM call/reranking needed at retrieval time, which is the source of the low-latency claim. ([Zep Docs overview](https://help.getzep.com/graphiti/getting-started/overview), [Neo4j blog on Graphiti](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/))
- **Storage backends**: graph databases — Neo4j, FalkorDB, Amazon Neptune; Kuzu support is deprecated. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti))
- **LLM/embedder pluggability**: OpenAI, Anthropic, Google Gemini, Groq, Azure OpenAI, OpenAI-compatible endpoints; embedders OpenAI/Azure/Voyage/Gemini; local inference via Ollama, vLLM, llama.cpp, LM Studio. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti))

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
- **MCP server**: Graphiti ships an (explicitly labeled "experimental") MCP server (`mcp_server` directory in the repo; also hosted at `https://help.getzep.com/_mcp/server`) exposing episode management, entity handling, semantic search, and "group" organization to MCP clients such as Claude Desktop, Claude Code, Cursor, and VS Code+Copilot. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti), [Zep MCP server docs](https://help.getzep.com/graphiti/getting-started/mcp-server))
- **REST API**: a `server` component in the repo provides a REST layer alongside the core engine (`graphiti_core`) and the MCP layer. ([GitHub - getzep/graphiti](https://github.com/getzep/graphiti))
- **ChatGPT integration**: no first-party ChatGPT connector found; third-party (Composio) offers a managed MCP bridge for ChatGPT "Developer Mode" apps. unknown whether Zep offers an official ChatGPT plugin. ([Composio — Zep + ChatGPT](https://composio.dev/toolkits/zep/framework/chatgpt))
- **SDK languages**: unknown from sources fetched — the docs pages retrieved did not enumerate SDK languages; GitHub repo structure suggests Python-first (`graphiti_core` is Python). No claim found about official JS/Go/other SDKs; do not assume.
- **CLI**: unknown — no CLI product surfaced in research.

## Memory lifecycle & sharing
- **Capture**: data is ingested as discrete "episodes" (raw conversational turns or structured JSON), preserving full provenance/lineage. Extraction of entities/edges happens incrementally per episode rather than in scheduled batch jobs. ([Zep Docs overview](https://help.getzep.com/graphiti/getting-started/overview))
- **Consolidate**: entity summaries adapt temporally as new episodes arrive; edges get bi-temporally invalidated/superseded rather than deleted, preserving history. unknown whether there is an explicit "consolidation" pass distinct from per-episode extraction — sources describe this as continuous/incremental, not a separate batch consolidation step.
- **Retrieve**: hybrid vector + BM25 + graph-traversal search returns a single ranked answer without an LLM call in the retrieval path, which the vendor cites as the reason for sub-second/300ms P95 latency. ([Zep Docs overview](https://help.getzep.com/graphiti/getting-started/overview), [emergentmind](https://www.emergentmind.com/topics/zep-a-temporal-knowledge-graph-architecture))
- **Decay/compact/summarize**: unknown/not found in sources — no explicit decay, pruning, or compaction mechanism was documented in the pages fetched. This is a real gap in the public docs relative to the "consolidate -> retrieve -> decay" lifecycle framing; Orvex should not assume Zep solves unbounded graph growth.
- **Multi-agent sharing, namespaces, permissions**: the MCP server documentation mentions "group organization" (episode/entity grouping), implying a `group_id`-style namespace concept exists in the product, but the fetched overview page explicitly stated it did **not** address group_id namespaces or multi-tenant/multi-agent sharing in the detail Orvex needs. Treat namespace/permission model as **unknown/underspecified** pending direct product trial — this is a load-bearing gap for Orvex's multi-tenant, per-customer requirements.
- **Cross-session token-cost story**: the vendor's core claim is that because retrieval is hybrid-search (not LLM-mediated) and returns a compact ranked fact set rather than raw transcript replay, sessions avoid re-paying context-window tokens for prior conversation. Reported: LongMemEval showed up to 18.5% accuracy improvement and ~90% latency reduction vs. baseline (full-context or naive RAG) approaches; DMR benchmark 94.8% (Zep) vs 93.4% (MemGPT baseline). These are self-reported vendor/paper numbers. ([arXiv:2501.13956](https://arxiv.org/abs/2501.13956))
- **Chat-platform integration**: MCP is the integration surface for Claude Desktop/Code, Cursor, VS Code+Copilot; ChatGPT only via a third-party (Composio) bridge, not confirmed first-party. No evidence found of native "portal" or generic chat-widget SDKs beyond the MCP/REST/Python surface. ([Zep MCP server docs](https://help.getzep.com/graphiti/getting-started/mcp-server), [Composio](https://composio.dev/toolkits/zep/framework/chatgpt))

## Scale & operational evidence
- Vendor-reported P95 retrieval latency of ~300ms with no LLM call during retrieval. ([emergentmind summary](https://www.emergentmind.com/topics/zep-a-temporal-knowledge-graph-architecture))
- Marketing language describes Zep as serving "a governed Context Lake of millions of Context Graphs served in milliseconds" — this is a marketing claim from getzep.com, not an independently verified production metric. unknown what "millions of Context Graphs" corresponds to in concurrent customers/QPS/data volume. ([getzep.com](https://www.getzep.com/))
- No independent case studies, uptime/SLA track record, or third-party production-scale write-ups were found in this pass. Enterprise plan advertises SOC 2 Type II and HIPAA BAA plus BYOC/BYOK deployment options, which implies some enterprise customers exist, but no named references were found. ([Zep pricing](https://www.getzep.com/pricing/))

## Pricing & positioning
- **Free**: 10,000 credits/month, 2 projects, 5 custom entity/edge types, variable rate limits, no rollover/auto-topup.
- **Flex**: $1,250/yr ($104/mo annual), 50,000 credits/mo, overage $25/10,000 credits, 600 req/min, 5 projects, 30-day credit rollover, auto top-up.
- **Flex Plus**: $3,750/yr ($312/mo annual), 200,000 credits/mo, overage $75/40,000 credits, 1,000 req/min, 10 projects, 60-day rollover, adds observations/webhooks/analytics/7-day API logs.
- **Enterprise**: custom credits/negotiated rates, guaranteed rate limits + SLA, unlimited projects, 1-year API log retention, SOC 2 Type II, HIPAA BAA, Cloud / Cloud+BYOK / BYOC deployment.
- **Credit model**: 1 credit per episode up to 350 bytes, +1 credit per additional 350 bytes; ⅛ credit per webhook invocation; **memory, retrieval, storage, threads, users, and graph storage are all unmetered (0 credits)** — you only pay for write/ingest volume, not for reads or standing storage.
- **Positioning**: "Credit-based plans for teams of every size. Enterprise plans for production agent memory at scale." Positions itself as infrastructure ("agent memory at enterprise scale"), not a consumer product. ([Zep pricing](https://www.getzep.com/pricing/))

## STEAL — 3-5 concrete ideas for Orvex
1. **Bi-temporal edges (event time + ingestion time) as the core fact primitive.** Orvex's cross-agent memory needs exactly this for "as-of-date" recall (e.g., "what was the customer's SLA tier when agent A made that decision last month?"). Model facts as edges with valid-from/valid-to plus observed-at, not as flat key-value memory rows.
2. **Ingest-time-only extraction, zero-LLM retrieval path.** Doing entity/relationship extraction once at write time and serving retrieval via hybrid vector+BM25+graph traversal (no LLM call) is the direct lever for Orvex's token-cost and latency goals for cross-session handoff — worth adopting as the retrieval architecture pattern regardless of storage engine (Dolt or otherwise).
3. **Provenance-by-construction (episodes as immutable source-of-truth, facts derived).** Every derived fact keeps a pointer back to the raw episode it came from — directly useful for Orvex's librarian-review and staging-area audit trail (agents proposing wiki changes could cite the memory episode that justified the change).
4. **Usage-based, ingest-metered / retrieval-unmetered pricing model.** Charging only for writes (episodes) while making reads/storage free removes the disincentive for agents to query memory often — a good model for Orvex's own MCP memory tool pricing/quota design, especially given the "100 documents in one session" staging-area scale target.
5. **MCP-first exposure of memory with explicit "group" namespacing primitive.** Even though the exact permission model is underdocumented, the existence of a group/namespace concept at the MCP layer confirms multi-tenant grouping is treated as first-class, not bolted on — Orvex should design group/tenant scoping into its MCP memory tool schema from day one, not retrofit it.

## AVOID / where Orvex differs
- **Company is small and thinly capitalized** ($500K seed only, per Tracxn/Crunchbase) — do not treat Zep as a durable, well-resourced vendor to build a hard dependency on; if evaluated as a buy option it carries real vendor-continuity risk for a multi-tenant platform like Orvex.
- **No documented decay/compaction/pruning mechanism.** Orvex's cross-agent memory, if run continuously across many agents and long-lived customers, will hit unbounded graph growth; Zep's public docs do not show how (or whether) they solve this — Orvex must design an explicit decay/summarize/archive policy rather than assume the Graphiti pattern handles it for free.
- **Namespace/permission model is underdocumented for true multi-tenant, per-customer isolation.** Orvex is a multi-tenant platform with hard customer-boundary requirements; Zep's "group" concept is not confirmed to provide the strict per-tenant isolation and access-control Orvex needs — this must be verified hands-on before any reliance, and Orvex's own design should treat tenant isolation as a first-class requirement rather than inherit Zep's ambiguity.
- **MCP server is explicitly "experimental."** Do not assume production-hardened MCP semantics; Orvex's own MCP surface for memory needs its own hardening/versioning story rather than copying Graphiti's server as-is.
- **ChatGPT support is third-party-only (Composio), not native.** If Orvex commits to first-class ChatGPT-portal support (per the platform's stated customer surface — "ChatGPT-style portals"), it cannot follow Zep's pattern of leaving that integration to a third party; Orvex needs a native chat-platform integration story, unlike Zep.
- **Benchmark numbers (DMR 94.8%, LongMemEval +18.5%) are vendor-authored, not independently verified.** Use directionally only; do not cite as neutral proof when comparing memory architectures internally.
- **No case studies / production scale evidence found.** Do not size Orvex's own scale assumptions off Zep's "millions of Context Graphs" marketing line — it is unverified and unaccompanied by any concrete tenant/QPS numbers.

## Sources
- https://github.com/getzep/graphiti
- https://help.getzep.com/graphiti/getting-started/overview
- https://help.getzep.com/graphiti/getting-started/mcp-server
- https://www.getzep.com/
- https://www.getzep.com/pricing/
- https://arxiv.org/abs/2501.13956
- https://arxiv.org/html/2501.13956v1
- https://www.emergentmind.com/topics/zep-a-temporal-knowledge-graph-architecture
- https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/
- https://tracxn.com/d/companies/zep/__poSadJnSfLWHjz05Xi3U5KwnpCMWSU3aDrihLX_8FLs
- https://www.crunchbase.com/organization/zep-ai
- https://composio.dev/toolkits/zep/framework/chatgpt
