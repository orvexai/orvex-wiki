# Mem0 — Prior Art Deep Dive (Memory Track)

## What it is
Mem0 ("mem-zero") is a "universal, self-improving memory layer for LLM applications" — a managed platform plus an Apache-2.0 open-source library/server that lets AI agents and chat apps store, consolidate, and retrieve long-term memories (facts, preferences, entities) across sessions, instead of replaying full conversation history into context. It ships as three tiers: an embeddable library (pip/npm) for prototyping, a self-hosted Docker server, and a "zero-ops" managed cloud platform. (https://docs.mem0.ai/introduction, https://github.com/mem0ai/mem0)

## Behind it & traction
- YC S24-backed, launched January 2024. Raised $24M total: $3.9M unannounced seed (led by Kindred Ventures) + $20M Series A led by Basis Set Ventures, with Peak XV Partners, GitHub Fund and Y Combinator participating; angel backers include Olivier Pomel (Datadog), Paul Copplestone (Supabase), James Hawkins (PostHog), Thomas Dohmke (ex-GitHub CEO). (https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/, https://mem0.ai/series-a)
- GitHub: ~60.5k stars, ~7k forks, 237 watchers, Apache 2.0, 356+ releases — very active OSS project. (https://github.com/mem0ai/mem0)
- Marketing claim: "thousands of teams, from fastest-growing startups to Fortune 500 companies, use Mem0 in production"; native integrations cited for CrewAI, Flowise, Langflow. AWS selected Mem0 as the exclusive memory provider for its Agent SDK (Strands) in May 2025. These are vendor/press claims, not independently verified case-study data — treat as marketing. (https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)
- One semi-independent example: an (unnamed) insurance company plugging Mem0 into an existing LangChain stack for risk-assessment context — reported via a third-party blog, not a named/verifiable case study. (WebSearch result, https://www.spheron.network/blog/agent-memory-gpu-cloud-mem0-zep-guide/ class of source — treat as unverified)

## Architecture & data model
Per Mem0's own arXiv paper ("Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory", https://arxiv.org/html/2504.19413v1):
- **Extraction**: an LLM-based extractor processes each new message pair plus a rolling conversation summary and a recent-message window (default last 10 messages) to produce candidate facts.
- **Consolidation (update phase)**: for each candidate fact, the top-10 semantically similar existing memories are retrieved via vector search, and an LLM (via function-calling) picks one of four operations — **ADD** (no equivalent exists), **UPDATE** (merge complementary info), **DELETE** (contradicted by new info), **NOOP** (no change). This ADD/UPDATE/DELETE/NOOP loop is the core "self-improving" mechanism.
- **Two storage backends**: plain **Mem0** (dense vector store, natural-language memory text, ~7k tokens/conversation) and **Mem0^g** (graph memory on Neo4j: directed labeled graph of entity nodes + relationship-triplet edges, ~14k tokens/conversation, with temporal conflict detection — contradicted edges are marked invalid rather than deleted, preserving history for temporal reasoning).
- **Retrieval**: multi-signal — semantic similarity, BM25 keyword matching, and entity linking, run in parallel and fused; graph mode adds entity-centric traversal and triplet-similarity ranking.
- v3 (April 2026 per GitHub) claims a "single-pass ADD-only extraction" (one LLM call) with entity linking and temporal reasoning, reporting 92.5 on LoCoMo and 94.4 on LongMemEval. (https://github.com/mem0ai/mem0, https://mem0.ai/research)
- Default embedding model OpenAI `text-embedding-3-small`; supports hosted Qdrant for platform migrations; local/self-host is BYO vector store + BYO LLM.

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
- **SDKs**: Python and TypeScript, "21 frameworks and platforms" documented (LangChain, CrewAI, Vercel AI SDK, etc.). (https://docs.mem0.ai/introduction)
- **REST API**: managed platform exposes a hosted API ("no vector database or LLM configuration required"). (https://docs.mem0.ai/platform/overview)
- **CLI**: `npm install -g @mem0/cli` or `pip install mem0-cli`; supports an agent-first flow (`mem0 init --agent`) that mints an API key without email verification, for autonomous agent bootstrap. (WebSearch result citing docs.mem0.ai; https://github.com/mem0ai/mem0)
- **MCP**: Mem0 runs a hosted MCP server (`https://mcp.mem0.ai/mcp/`) addable to any MCP client in one command; a dedicated Claude Code/Claude Cowork plugin bundles the MCP server + lifecycle hooks + SDK "skills" that auto-capture learnings at session lifecycle points and inject relevant memory before each response. Third-party/self-hosted MCP servers also exist (e.g. coleam00/mcp-mem0). (https://docs.mem0.ai/integrations/claude-code, https://mem0.ai/blog/claude-code-memory, https://github.com/coleam00/mcp-mem0)
- Browser extension available; ChatGPT integration for persistent memory also referenced. (https://github.com/mem0ai/mem0)

## Memory lifecycle & sharing
- **Capture → consolidate → retrieve**: documented and paper-verified as above (extract → ADD/UPDATE/DELETE/NOOP against top-k similar memories → multi-signal retrieval at query time).
- **Decay/compact/summarize**: no explicit decay/forgetting mechanism confirmed in the paper; graph mode "soft-deletes" (marks invalid) contradicted edges instead of purging, for temporal reasoning. A separate asynchronous "summarization" module periodically refreshes the rolling conversation summary that feeds the extractor — this is a context-management aid, not a memory-store compaction/decay policy. **Unknown** whether any TTL/expiry/archival exists on the managed platform; not found in available docs.
- **Multi-agent sharing, namespaces, permissions**: the platform documents four memory scopes — **user, agent, run, session** — via `user_id`/`agent_id`/`run_id`/`session_id`-style parameters, letting multiple agents write into and read from a shared user-scoped memory pool or keep agent-private memory. Exact permission/ACL model (who can read across agent_id boundaries, tenant isolation mechanics) is **not detailed** in the fetched docs excerpt — unknown from available sources. Enterprise tier adds SSO, audit logs, and "bring-your-own-key" encryption, implying some tenant/role controls exist at that tier, but specifics weren't found. (https://docs.mem0.ai/platform/overview, https://mem0.ai/pricing)
- **Cross-session token-cost story**: this is Mem0's core marketing/technical claim — retrieval-augmented memory answers competitive-accuracy benchmarks using under ~7,000 tokens per call vs 25,000+ tokens for full-context/full-history approaches, a claimed 3–4x token/cost reduction, with p95 latency reported down 91% and token consumption down 90% vs. baseline in other marketing copy (this second stat is from a review site, not the primary paper — flag as less certain). (https://mem0.ai/research, https://arxiv.org/html/2504.19413v1; latency/90% figures from https://weavai.app/blog/en/2026/05/09/mem0-review-2026-ai-agent-memory-king-26-accuracy/ — marketing/review claim, unverified independently)
- **Chat-platform integration**: Claude Code / Claude Cowork plugin (MCP + lifecycle hooks + skills), ChatGPT persistent-memory integration, browser extension, and 20+ framework integrations (LangChain, CrewAI, Flowise, Langflow, Vercel AI SDK, AWS Agent SDK/Strands as exclusive memory provider). (https://docs.mem0.ai/integrations/claude-code, https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/)

## Scale & operational evidence
- Benchmarks (Mem0's own peer-reviewed-adjacent LOCOMO paper + v3 blog claims): LoCoMo 92.5 accuracy (1,540 questions), LongMemEval 94.4 accuracy (500 questions), BEAM 1M 64.1 / BEAM 10M 48.6 accuracy (long-horizon benchmarks — note accuracy drops substantially at 10M-token scale, an honest limitation signal). Mean tokens/retrieval: LoCoMo 6,956, LongMemEval 6,787, BEAM 1M 6,719. (https://mem0.ai/research)
- A third-party review site claims "+26% accuracy, p95 latency ↓91%, token consumption ↓90%" vs. unspecified baseline — this is a secondary/marketing source, not verified against the primary paper. (https://weavai.app/blog/en/2026/05/09/mem0-review-2026-ai-agent-memory-king-26-accuracy/)
- GitHub scale (community/operational proxy, not customer-scale evidence): ~60.5k stars, ~7k forks, 356+ releases, active cadence through v3 (April 2026). (https://github.com/mem0ai/mem0)
- No independently-published large-customer production metrics (QPS, memory-store size at scale, uptime SLA numbers) were found in available sources — unknown.

## Pricing & positioning
Managed platform, per https://mem0.ai/pricing:
- **Free**: 10,000 memories, 1,000 retrieval calls/mo, 1 project, community support.
- **Starter** ($19/mo): 50,000 memories, 5,000 retrieval calls, 1 project.
- **Growth** ($79/mo): 200,000 memories, 20,000 retrieval calls, 3 projects, email support, basic analytics.
- **Pro** ($249/mo): 500,000 memories, 50,000 retrieval calls, unlimited projects, private Slack support, advanced analytics, graph memory, unlimited end users.
- **Enterprise/Custom**: usage-based pricing, on-prem deployment, SSO, audit logs, HIPAA BAA, dedicated SLA, private Slack with SLA.
Positioning: "the memory layer for AI" — a horizontal, framework-agnostic infrastructure primitive (like a database) sold both as OSS (self-host, Apache 2.0) and as a managed, zero-ops API, explicitly targeting the build-vs-buy decision for teams that don't want to run their own vector DB + extraction pipeline. Also positions against context-window-stuffing ("full context") as the alternative it beats on cost/latency. (https://mem0.ai/pricing, https://docs.mem0.ai/platform/overview)

## STEAL — 3-5 concrete ideas for Orvex
1. **ADD/UPDATE/DELETE/NOOP consolidation loop** — instead of librarian-only merge logic, adopt Mem0's pattern of running each new staged item against the top-k semantically similar existing wiki/memory entries and having an LLM pick one of these four verbs. This gives the Orvex librarian (and cross-agent memory) a principled, auditable "why did this change land as an edit vs new doc vs contradiction-delete" decision trail — directly reusable for the agent staging area's merge step.
2. **Four-scope namespace model (user/agent/run/session)** — cross-agent memory should adopt an equivalent explicit scope hierarchy (e.g. tenant/agent/session/handoff-run) rather than a single flat memory store, so agents can read shared tenant-level memory while keeping run-scoped scratch state private and disposable.
3. **Token-cost story as a first-class metric** — Mem0 markets tokens-per-retrieval-call (~7k vs 25k+ full-context) as its headline number. Orvex's cross-agent memory should benchmark and publish an equivalent "cost of context per handoff" metric from day one; it's a strong PRD acceptance criterion and a good regression guardrail.
4. **Soft-delete/invalidate instead of hard-delete for contradicted facts** — Mem0^g marks contradicted graph edges invalid rather than removing them, preserving temporal history for later reasoning/audit. Orvex's memory/staging store should do the same (never hard-delete a superseded fact) — this also aligns with the existing "no fallbacks/hard cuts" philosophy for migrations, but here applied to memory records: keep the trail, don't silently erase.
5. **Ship both an MCP server and lifecycle hooks, not just a CLI** — Mem0's Claude Code plugin bundles MCP tools + lifecycle hooks (auto-capture at session end, auto-retrieve before response) + skills, which is the exact integration shape the cross-agent memory PRD should target for chat-platform stickiness (ChatGPT-style portals, Claude, Studio CLI) rather than requiring agents to remember to call memory tools manually.

## AVOID / where Orvex differs
- **No native staging/review gate**: Mem0's consolidation is fully automatic (LLM picks ADD/UPDATE/DELETE with no human-in-the-loop review step) — this is the opposite of Orvex's agent-staging-area requirement (agents never write the wiki directly; a librarian reviews first). Do not copy Mem0's "write straight into the memory store" trust model for the wiki-facing capability; keep the staging gate.
- **Permissions/ACL model is underspecified/unknown even in Mem0's own docs** — the fetched documentation did not clearly define cross-agent-id read/write permission boundaries. Orvex must not assume Mem0-parity on multi-tenant isolation; this needs to be designed explicitly, especially since Orvex is multi-tenant by construction (Mem0's scoping reads as single-tenant-per-project with add-on enterprise SSO).
- **No documented decay/TTL/archival policy** — Mem0 leaves long-term memory growth essentially unbounded (paid tiers are literally priced by memory count, i.e., growth is a revenue line for them, not a problem they solve for the customer). Orvex's cross-agent memory (inspired by beads) should design explicit compaction/decay/archival from the start rather than letting memory count grow indefinitely, since the "cheaper future sessions" goal implies the store must stay lean, not just paid-for.
- **Vendor lock risk / closed managed tier**: Mem0 OSS core is Apache 2.0, but the most-marketed capabilities (graph memory, advanced analytics, SSO, HIPAA BAA) sit behind the Pro/Enterprise managed tiers. If Orvex wants Dolt-backed, self-hostable memory as stated in the brief, treat Mem0 as a UX/API reference, not a dependency — replicate the developer experience, not the hosted lock-in.
- **Benchmarks are self-reported / vendor paper** — LoCoMo/LongMemEval numbers come from Mem0's own paper and blog; no independent third-party benchmark reproduction was found in this pass. Do not cite Mem0's accuracy numbers as ground truth in Orvex PRDs without an independent check.

## Sources
- https://docs.mem0.ai/introduction
- https://docs.mem0.ai/platform/overview
- https://docs.mem0.ai/integrations/claude-code
- https://github.com/mem0ai/mem0
- https://mem0.ai/pricing
- https://mem0.ai/research
- https://mem0.ai/series-a
- https://mem0.ai/blog/claude-code-memory
- https://arxiv.org/html/2504.19413v1
- https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps/
- https://weavai.app/blog/en/2026/05/09/mem0-review-2026-ai-agent-memory-king-26-accuracy/ (marketing/review — flagged as unverified secondary source where cited)
- https://github.com/coleam00/mcp-mem0 (third-party MCP server example)
