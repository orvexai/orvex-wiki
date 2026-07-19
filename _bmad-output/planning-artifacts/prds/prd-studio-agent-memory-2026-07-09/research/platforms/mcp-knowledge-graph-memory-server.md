# MCP Knowledge Graph Memory Server — Prior Art Deep Dive

## What it is
The official reference "Memory" MCP server maintained in the `modelcontextprotocol/servers` GitHub org repo (Anthropic-stewarded), published to npm as `@modelcontextprotocol/server-memory`. It gives an LLM client (Claude Desktop, or any MCP host) persistent memory across chat sessions by exposing a local knowledge graph — entities, relations, observations — as a set of MCP tools. It is explicitly framed by the maintainers as a reference/educational implementation of MCP features and SDK usage, not a production memory platform. (Sources: https://github.com/modelcontextprotocol/servers/tree/main/src/memory ; https://www.npmjs.com/package/@modelcontextprotocol/server-memory)

## Behind it & traction
- Lives inside `modelcontextprotocol/servers`, the umbrella repo of official MCP reference servers; that repo has ~88k GitHub stars as of July 2026 (repo-wide, not memory-server-specific). (Source: web search result citing repo star count, July 6 2026 — no single authoritative URL beyond the repo itself: https://github.com/modelcontextprotocol/servers)
- npm package `@modelcontextprotocol/server-memory` reports roughly 45,000 weekly downloads per a 2026 third-party roundup. (Source: https://chatforest.com/guides/best-memory-mcp-servers/)
- Confirmed still actively shipped in the maintained repo, NOT in `modelcontextprotocol/servers-archived` (which holds retired reference servers like Redis, Slack, GitHub, Puppeteer, Sentry, etc.). (Source: https://github.com/modelcontextprotocol/servers-archived)
- MIT licensed. No company/commercial entity behind it beyond Anthropic's MCP stewardship — it is not a funded product with its own roadmap or support SLA. (Source: https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- Numerous community forks exist (e.g. `shaneholloman/mcp-knowledge-graph` ~674 stars / ~9,675 weekly downloads; `aaronsb/memory-graph`; DuckDB-backed variants), signaling the official server is widely used as a starting template rather than a finished product. (Sources: https://github.com/shaneholloman/mcp-knowledge-graph ; search results referencing aaronsb/memory-graph)

## Architecture & data model
Three primitives, all held in a single flat store:
- **Entities**: primary graph nodes — unique name (identifier), an entity type string (e.g. "person", "organization", "event"), and a list of observations.
- **Relations**: directed edges between entities, stored in active voice (e.g. "works_at") to describe how entities interact.
- **Observations**: discrete, atomic fact strings attached to a specific entity (not to a relation).

Storage is a single JSONL file (`memory.jsonl`) written/read directly by the server process — an append-friendly, git-diffable text format, not a database. Location is configurable via the `MEMORY_FILE_PATH` environment variable; default is inside the server's own directory. There is no built-in DB engine, indexing, or query planner — search is in-memory string matching over the loaded file. (Source: https://github.com/modelcontextprotocol/servers/tree/main/src/memory)

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
Pure MCP tool surface — no separate SDK or CLI product. 8–9 tools exposed over MCP:
`create_entities`, `create_relations`, `add_observations`, `delete_entities`, `delete_observations`, `delete_relations`, `read_graph`, `search_nodes`, `open_nodes` (plus the graph is also exposed as a readable MCP Resource).
- `create_relations` skips duplicates.
- `delete_entities` cascade-deletes the entity's relations.
- `search_nodes` matches against entity names, types, and observation content (plain substring/text search, no vector/semantic search).
Deployment is via `npx -y @modelcontextprotocol/server-memory` or a Docker image (`mcp/memory`, volume-mounted for persistence); VS Code has one-click install buttons. Because it's MCP-native, any MCP host (Claude Desktop, Claude Code, Cursor, etc.) can attach it directly — no chat-platform-specific plugin needed, but conversely nothing hosted/multi-tenant is offered either. (Sources: https://github.com/modelcontextprotocol/servers/tree/main/src/memory ; https://hub.docker.com/r/mcp/memory)

## Memory lifecycle & sharing
- **Capture**: the client model itself decides what to write, driven entirely by a system-prompt convention the maintainers publish as an example — at conversation start, retrieve memory and identify the user ("default_user"); during conversation, watch for new info across categories (identity, behaviors, preferences, goals, relationships) and add it via `create_entities`/`add_observations`. This is prompt-engineered discipline, not a server-enforced protocol.
- **Consolidate**: none. There is no merge/dedup step — the server does not detect that two observations restate the same fact.
- **Retrieve**: either `read_graph` (dumps the *entire* graph) or `search_nodes`/`open_nodes` (text-match a subset).
- **Decay/compact/summarize**: none built in. Facts "don't expire or conflict-resolve — they just accumulate" per third-party review. (Source: https://chatforest.com/guides/best-memory-mcp-servers/)
- **Multi-agent sharing / namespaces / permissions**: none. It's a single flat file per configured `MEMORY_FILE_PATH`; there is no user/project/agent scoping, no ACLs, no multi-tenancy primitive at all — every MCP client pointed at the same file sees and can mutate the same global graph.
- **Cross-session token-cost story**: poor by design at scale — `read_graph` returns the full JSONL graph as context, reported at "14,000+ tokens for modest graphs," with no pagination, ranking, or relevance filtering. (Source: https://chatforest.com/guides/best-memory-mcp-servers/)
- **Chat-platform integration**: MCP-only; works with any MCP host (Claude Desktop/Code, Cursor, VS Code Copilot, etc.) but has no ChatGPT-native plugin, no web portal, no hosted/SaaS surface.

## Scale & operational evidence
No published benchmarks, load tests, or production case studies from the maintainers — it is explicitly a reference/demo implementation. Third-party technical commentary (independent of the maintainers) describes the JSON/JSONL-file, in-memory-search design as degrading in performance and memory footprint as entity/relation counts grow, and as unable to support complex/conditional queries — motivating community forks onto DuckDB and other backends. No maintainer-published numbers on max graph size, latency, or concurrent-client behavior were found. (Sources: search results on limitations; https://github.com/shaneholloman/mcp-knowledge-graph)

## Pricing & positioning
Free and open source (MIT), self-hosted only — no cloud/hosted tier, no pricing page, no company monetizing it directly. Positioned by its own maintainers as an educational reference for MCP server/SDK patterns, not a competitive memory product. A 2026 third-party comparison (covering the official server plus Zep/Graphiti, mem0, Basic Memory, Chroma, Engram, mcp-memory-service) rates it lowest of the field at 3.5/5, calling it "a starting point, not a destination," useful only for a solo developer wanting a few dozen facts remembered — while Zep (temporal graph, $25/mo Flex tier) and mem0 (vector+graph, $249/mo Pro) are rated higher on search quality and are actual commercial products. (Sources: https://chatforest.com/guides/best-memory-mcp-servers/ ; https://vectorize.io/articles/mem0-vs-zep)

## STEAL - 3-5 concrete ideas for Orvex
1. **Radical minimalism of the data model** — entity/relation/observation as three primitives is genuinely easy for an LLM to reason about and emit correctly in tool calls; Orvex's cross-agent memory schema should keep a similarly small "core kernel" even if richer metadata (namespace, TTL, confidence, provenance) is layered on top, so agents don't fumble the write API.
2. **MCP Resource exposure of the whole graph, not just tools** — letting a host read memory as a Resource (not only via tool calls) is a cheap, standards-native way to let any MCP client browse state without a bespoke UI; worth mirroring for beads-style work-item state in Orvex's memory service.
3. **Publish a canonical system-prompt recipe** — the official server ships an explicit "when to read/write memory" prompt pattern (retrieve at start, categorize new facts, update). Orvex's librarian/memory-service should ship the equivalent default prompt fragment so every customer agent behaves consistently out of the box, rather than leaving capture discipline entirely to each customer's prompt.
4. **Interop target, not architecture target** — because this server is the de facto baseline every MCP host already expects, Orvex should expose an MCP-compatible entity/relation/observation-shaped view (or a thin adapter) so agents and tools built against the reference contract "just work" against Orvex memory, even though the real backend is far more capable (Dolt, namespaces, decay).
5. **Cascade-delete on entity removal** is a small but correct integrity rule (deleting an entity removes its dangling relations) — replicate it in Orvex's memory graph to avoid orphaned edges accumulating as agents hand off work.

## AVOID / where Orvex differs
- **No flat single-file/global-graph model** — the reference server has zero namespace/tenant/agent scoping; every writer shares one graph. Orvex is explicitly multi-tenant and multi-agent, so memory must be namespaced (customer, agent, project) with permissions from day one — this is the reference server's single biggest gap and Orvex's clearest differentiation.
- **No context-bloat-inducing full-dump retrieval** — `read_graph` returning an entire unbounded graph into context (14k+ tokens on "modest" graphs) is the opposite of the cheap-cross-session-token story Orvex needs; retrieval must be relevance-ranked/paginated/summarized, not a full dump.
- **No dedup/conflict-resolution = fact accumulation rot** — Orvex's "future sessions cheaper because context is already worked out" goal requires consolidation/decay/summarization the reference server entirely lacks; without it, memory becomes a write-only junk drawer.
- **No semantic/vector search** — reference server is plain substring text-match; Orvex should assume semantic retrieval is required for agents to actually find relevant prior context, matching what mem0/Zep already provide and the reference server doesn't.
- **Not a hosted/multi-agent coordination product** — it has no handoff, no ownership/claiming, no beads-style work-item lifecycle; it is a personal-memory demo, not a coordination service, so Orvex's beads-inspired cross-agent memory is a different product category entirely, only sharing the MCP-tool exposure pattern.

## Sources
- https://github.com/modelcontextprotocol/servers/tree/main/src/memory
- https://www.npmjs.com/package/@modelcontextprotocol/server-memory
- https://github.com/modelcontextprotocol/servers-archived
- https://github.com/modelcontextprotocol/servers
- https://github.com/shaneholloman/mcp-knowledge-graph
- https://hub.docker.com/r/mcp/memory
- https://chatforest.com/guides/best-memory-mcp-servers/
- https://vectorize.io/articles/mem0-vs-zep
