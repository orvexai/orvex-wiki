# Cross-Agent Memory — Prior-Art Synthesis

Synthesis of 18 profiled platforms (plus A2A and the MCP reference server as boundary cases) for Orvex Studio's **Cross-Agent Memory** service (beads-style hosted memory + coordination, MCP tools + Studio CLI) and its sibling **Agent Staging Area** (librarian-gated wiki writes). Every claim below traces to a profile file; where a profile flagged a claim as vendor-marketing or unverified, that flag is carried forward. **The single biggest strategic insight is at the top of §3.**

---

## 1. Landscape map

The field splits into five segments. Nobody in it does what Orvex is scoping — they cluster tightly around *single-user personalization memory* and *in-process orchestration*, and the "coordination" half is served only by a wire protocol that is explicitly not a memory system.

| Platform | Segment | Data model | Surfaces | Scale evidence | Pricing signal | #1 steal |
|---|---|---|---|---|---|---|
| **Mem0** | Dedicated memory layer | Vector + optional Neo4j graph + KV; user/agent/run/session scopes | SDK, REST, hosted MCP, Claude Code plugin+hooks | ~60.5k stars; self-reported LoCoMo 92.5 / LongMemEval 94.4 (unverified) | $19→$249/mo, priced **per memory count** (growth = revenue) | ADD/UPDATE/DELETE/NOOP consolidation loop as auditable merge trail |
| **Zep / Graphiti** | Dedicated memory layer | **Bi-temporal** knowledge graph (event-time + ingest-time edges); episodes→facts | Experimental MCP, REST, Python | ~28.6k stars; only $500K seed (vendor-continuity risk); ~300ms P95 (vendor) | Credit-based, **writes metered / reads+storage free** | Bi-temporal edges for as-of-date recall; zero-LLM retrieval path |
| **Letta (MemGPT)** | Memory runtime | OS-tiered: core (in-context) / archival (vector) / recall (history); shared **blocks** | REST, SDKs (Py/TS/Rust), MCP-consumer, Channels | ~23.7k stars; $10M seed; no prod-scale numbers | $20/mo + $0.10/agent + tool-sec | Sleep-time async consolidation on a cheaper model; shared blocks as multi-agent primitive |
| **Cognee** | Memory layer (graph pipeline) | ECL pipeline (Add→Cognify→**Memify**→Search); graph+vector+relational | SDK, CLI, REST, MCP, Claude Code plugin | ~27.4k stars; "70+ deployments" (unverified); no SOC2/HIPAA | Free self-host; $2.50/1M tokens | Explicit **Memify** decay/reweight stage separate from capture/retrieve |
| **AWS Bedrock AgentCore Memory** | Hyperscaler managed | Actor/Session/Strategy/**Namespace path**; SEMANTIC/SUMMARIZATION/USER_PREFERENCE/EPISODIC | REST (control+data plane), Python SDK, Strands | GA Oct 2025, 9 regions; no published scale numbers | $0.25/1k events, $0.75 or $0.25/1k records/mo, $0.50/1k retrievals | Three-tier control dial (built-in / override / self-managed) per strategy |
| **Google Vertex Memory Bank** | Hyperscaler managed | Gemini-extracted facts; scopes = user/app/session; revision tracking | ADK-native, direct REST, Express Mode | GA 2026; no independent scale evidence; **Gemini-only** | $0.25/1k stored events or memories | Split `GenerateMemories` (async) vs `RetrieveMemories` (sync) |
| **Azure AI Foundry Agent Service** | Hyperscaler managed | Threads (≤100k msgs) + Memory store; `scope` string; user-profile/chat-summary/procedural | SDKs (4 langs), MCP-consumer, REST Memory Store API | GA May 2025 (core); Memory still **preview**; no VNet for memory | Consumption; memory = model-token passthrough | Named memory-type taxonomy, on-by-default, independently toggleable |
| **OpenAI ChatGPT Memory** | LLM-native consumer | Saved Memories (list) + Reference Chat History (synthesis) + Dreaming | ChatGPT apps only — **no API/MCP** | ~5x cost cut enabled free-tier; 42-state AG probe, harm lawsuits cite memory | Bundled in plans; Business = no-train guarantee | Two-tier transparency: explicit editable list + implicit synthesis |
| **Anthropic Claude Memory & Projects** | LLM-native consumer + API tool | Consumer: per-Project RAG + 24h synthesis. API `memory_20250818`: file ops on `/memories`, BYO storage | Native app; Messages API tool (not MCP); Managed Agents (hosted) | $47B run-rate co.; Managed Agents beta w/ audit+rollback+concurrent-write | Consumer free; API = token passthrough, storage is yours | Managed-Agents governance: audit trail + rollback + concurrent-write safety |
| **MCP KG Memory Server** | MCP reference | Entities / relations / observations in one flat JSONL file | MCP tools only (8-9) + Resource | ~88k repo stars; explicitly a demo, degrades with size | Free MIT, self-host | Radical 3-primitive minimalism as an **interop target** (adapter), not the backend |
| **Supermemory** | Coding-agent memory | "memory" (evolving facts) vs "RAG" (chunks); Postgres+Cloudflare | 2-verb MCP (`memory`/`recall`), SDKs, coding-agent plugins | ~28.3k stars; benchmark "#1" contested by Mem0; SOC2/HIPAA claimed | $19→$399/mo; **token-level dedup** billing | Two-verb MCP surface + token-level dedup (only net-new charged) |
| **Redis Agent Memory Server** | OSS infra backend | Working (TTL'd) + long-term (vector/FT/hybrid); namespace/user/session | REST, MCP, Python SDK | ~292 stars; borrows Redis-wide case studies (not product-specific) | OSS; Redis Cloud ~$5→$200+/mo | Named **forgetting policies as config** (max-age / max-inactive / keep-top-N) |
| **LangMem** | OSS memory library | Semantic/episodic/**procedural** over LangGraph BaseStore; tuple namespaces | Python SDK only — no MCP/CLI/chat | ~1.5k stars; pre-1.0; competitor claims ~60s recall | Free MIT (inside paid LangChain stack) | Procedural memory = agent rewrites its own prompt from feedback |
| **CrewAI** | Orchestration + memory | Unified Memory (LanceDB default); **MemoryScope/MemorySlice**; composite recall scoring | Python SDK, CLI, MCP-consumer, AMP | ~54k stars; "2B executions" (unverified); **no per-user scope in server → context bleed** | Free→$25/mo→enterprise | Composite recall score: similarity + exp recency decay (tunable half-life) + importance |
| **OpenAI Agents SDK** | Orchestration framework | Agents/tools/**handoffs** + Sessions; pluggable session backends | SDK (Py/TS), MCP-consumer, AgentKit canvas | ~27.8k stars; snapshot/rehydrate durability; HITL gaps (issue #636) | Free MIT; token passthrough | Named `handoff()` primitive as first-class tool + two-tier ephemeral/long-term memory |
| **Temporal** | Durable execution (non-AI) | Append-only **Event History** replay; Workflows/Activities; Saga/compensation | SDKs (6 langs), CLI, Web UI; MCP-wrapped-as-workflow | $5B val (Feb 2026); hard cap 51.2k events/50MB, degrades ~10k | Cloud $100→$500+/mo, ~$0.00005/Action | Model the 100-doc burst as a durable Workflow w/ per-change checkpoint + saga rollback |
| **OpenAI Agents SDK (handoffs)** | *see above* | — | — | — | — | — |
| **Microsoft Agent Framework** | Orchestration SDK | Context Providers (before/after hooks); Chat History Providers; Pregel checkpointing | SDK (Py/.NET), MCP-consumer, Foundry hosted | GA v1.0 Apr 2026; durability critiqued (diagrid); defers memory to Mem0 | Free SDK; hosted $0.0994/vCPU-h | Two-phase context-provider hook (before_run inject / after_run harvest) |
| **Google A2A** | Coordination protocol (**not memory**) | Agent Card / Task state machine / Message vs Artifact / contextId | JSON-RPC + gRPC; SDKs (5 langs); no CLI | 150+ orgs, 22k stars (press-release); no scale numbers | Apache-2.0 free | Formal Task state machine (submitted→working→INPUT/AUTH_REQUIRED→done) for the review gate |

---

## 2. Recurring design patterns (the memory lifecycle everyone converges on)

Across the field, "agent memory" has crystallized into a repeatable pipeline. Orvex should treat these as the table-stakes shape and differentiate elsewhere.

**Extraction (capture).** Two capture modes recur everywhere: *implicit* LLM extraction of facts from the raw transcript, and *explicit* agent-initiated "remember this" tool calls. Mem0, Zep, Vertex, Bedrock, Azure, Redis, Supermemory all do implicit LLM extraction; Letta, LangMem (hot-path), OpenAI Agents SDK (long-term tool), Claude's API memory tool make the *agent itself* decide via tool call. The emerging consensus (OpenAI Apr-2026 update, Letta) is a **two-tier split**: auto-summarize ephemeral session memory, but require a deliberate tool call to write durable long-term memory — keeping the durable store curated rather than a transcript firehose.

**Consolidation / conflict resolution.** The near-universal primitive is *retrieve top-k similar existing memories → have an LLM pick an operation*. Mem0's ADD/UPDATE/DELETE/NOOP is the reference; CrewAI does keep/update/delete/insert_new above a 0.85 similarity threshold (with a cheap non-LLM 0.98-cosine intra-batch dedup pass); Vertex, Azure, Bedrock, Redis all name dedup+contradiction-resolution as a distinct stage. The mature systems make this an *explicit named pipeline stage with its own surface*, not a silent side effect. Soft-delete/invalidate (Mem0^g marks contradicted edges invalid; Zep bi-temporally invalidates) beats hard-delete — preserve the trail.

**Retrieval ranking.** The field has settled on *hybrid search with no LLM in the hot path*: semantic (vector) + keyword (BM25/full-text) + graph/entity, fused into one ranked set. Zep explicitly attributes its ~300ms P95 to keeping the LLM out of retrieval. CrewAI adds the most explainable formula: **composite score = semantic similarity + exponential recency decay + importance**. Cheap fast-paths recur (CrewAI skips LLM analysis under 200 chars; a shallow/deep recall split).

**Decay / compaction.** This is where the field is *weakest and least converged* — and thus where the honest signal is "everyone punts." No decay at all: MCP KG server, LangMem (admits it), Vertex ("TTL on roadmap"), Azure (manual TTL + "forget" command only), MS Agent Framework (defers to Mem0), Mem0 (unbounded — growth is their revenue line). Real decay exists in only three places: **Redis** (named forgetting policies as config: max-age / max-inactive / keep-top-N), **Cognee** (Memify prune+reweight stage), **CrewAI** (0.5^(age/half_life), default 30-day half-life, tunable per memory class). Letta's **sleep-time compute** (async consolidation on a cheaper model, off the hot path) is the cost-lever pattern. Bedrock/AWS is upfront that extraction is async with disclosed lag.

**Namespacing / sharing.** Everyone scopes memory by a small tuple, and almost nobody has real ACLs. The recurring axes: **user / agent / session/thread / app-or-tenant** (Mem0's user/agent/run/session; Bedrock's actor/session/strategy namespace *path*; Vertex's user/app/session; MS/Mem0's Application/Agent/Thread/User; Redis's namespace/user/session). Isolation is almost always *namespace-prefix + external IAM* (Bedrock IAM condition keys on namespace path; Vertex/Azure GCP/Entra IAM), **not** memory-item-level ACLs. The richest first-party sharing primitives are Letta's attach-one-block-to-many-agents and CrewAI's MemoryScope (subtree restriction) + MemorySlice (compose a read-only shared branch with a private branch). Nobody demonstrates true multi-tenant per-item ACLs as a solved feature.

**Who owns what (quick read):** dedicated bar = Mem0 (consolidation) and Zep (temporal + zero-LLM retrieval); decay leaders = Redis, CrewAI, Cognee; async-consolidation cost lever = Letta, OpenAI, ChatGPT "Dreaming"; governance/audit = Anthropic Managed Agents; handoff primitive = OpenAI Agents SDK; durability substrate = Temporal.

---

## 3. White space — what NOBODY does that Orvex's combo covers

> **THE STRATEGIC INSIGHT: The entire market builds *single-user personalization memory* (extract facts about a user → consolidate → retrieve into that user's next turn). Not one profiled platform combines a beads-style queryable, discoverable multi-agent WORK-GRAPH with a human-gated librarian review boundary before durable knowledge lands. That intersection — coordination-memory + curated-write-gate — is genuinely unoccupied.**

Concretely, four things nobody does, honestly assessed:

1. **A shared, queryable cross-agent work-graph (the beads half).** Every "memory" product is a fact/preference store keyed to a *user*; "multi-agent sharing" everywhere means *point two agents at the same scope key* (Azure, Bedrock, Redis, OpenAI Sessions all say this explicitly). There is **no discover-what-others-are-doing, claim-work, hand-off-with-context work-item lifecycle** in any memory product. The only coordination prior art is **A2A**, which is explicitly *not a memory system* — it keeps agents "opaque" to each other, has no shared queryable state, and its own community (issue #893) is still asking how memory should work on top of it. Orvex's beads-inspired work-graph fills exactly the gap A2A leaves open. **Honest caveat:** CrewAI *does* fuse memory + handoff, but its handoff is a synchronous manager-LLM routing decision *inside one crew run* — not async, cross-session, discoverable coordination. It solves a different problem.

2. **A librarian review gate between agent proposal and durable write.** Every memory system writes straight into the store (Mem0, Redis `create_long_term_memories`, Cognee `cognify`/`delete`/`prune`, Letta self-editing blocks). The closest analogs are *primitives, not workflows*: OpenAI's `needs_approval` (which its own community says ships with no notification, no timeout/escalation, no audit trail — issue #636) and A2A's `INPUT_REQUIRED`/`AUTH_REQUIRED` task states. **Nobody ships a full review→route→merge→beautify curated-write workflow with a per-customer-tweakable reviewer.** Anthropic's Managed Agents (audit trail + rollback + concurrent-write safety) is the nearest governance analog but has no human curation stage.

3. **Memory that feeds a living wiki, not just a context window.** All prior art loads memory back into the *next prompt*. Orvex's staging area targets a durable, human-readable, canonical knowledge base (the wiki) as the destination — a different artifact with different quality bars (readability, structure, non-duplication) than "facts injected into context."

4. **A durable, MCP-first, cross-platform hosted service.** The MCP-exposed products are thin/single-tenant (MCP KG server, Supermemory, Redis); the durable/governed ones aren't MCP-first (Temporal, Anthropic Managed Agents); the hyperscaler managed ones are runtime-coupled and not chat-platform-native (Bedrock=Strands, Vertex=ADK/Gemini-only, Azure=Foundry). **No single system is simultaneously hosted, multi-tenant, MCP-first, chat-platform-native (ChatGPT + Claude + CLI), AND durable enough to survive the 100-doc burst.** That combination is Orvex's to claim.

---

## 4. Contradictions — where the evidence argues AGAINST Orvex's current plan

These are stated hard, per instruction. Do not soften.

1. **The Dolt lean has zero support in the field and real cost against it.** Every profiled storage backend is vector/graph/relational: Postgres+pgvector (Letta, LangMem, Supermemory, Cognee's single-instance mode), Neo4j/Kuzu/FalkorDB (Zep, Cognee, Mem0^g), Redis, LanceDB (CrewAI), Cosmos DB (Azure/MS). **Not one uses a versioned/diffable SQL store like Dolt**, and the separate storage research already favors Postgres core. The bitemporal capability Dolt-style versioning would buy is *already solved differently* by Zep/Graphiti's bi-temporal edges (event-time + ingest-time) — which run on ordinary graph DBs, no version-control engine needed. Meanwhile the memory hot path demands **hybrid semantic+keyword+graph retrieval with sub-second P95** (Zep ~300ms, no LLM in path) — a retrieval profile Dolt does not natively serve and pgvector does. Evidence points to Postgres+pgvector for the store and a bitemporal *edge model* for as-of-date recall, **not** Dolt.

2. **Fine-grained per-item ACLs may be over-engineering for v1.** Orvex's instinct is strict multi-tenant per-item permissions. But *the entire mature field ships namespace-prefix isolation + external IAM and calls it done* (Bedrock, Vertex, Azure, Redis, Mem0, OpenAI). LangMem explicitly argues namespace-only is a legitimate v1 simplification. The contradiction: Orvex could burn v1 building an ACL model no competitor found necessary. Tenant-isolated namespaces from day one — yes; per-memory-item grants — probably defer.

3. **A pure staging *gate* on everything fights the "make future sessions cheaper" goal.** The staging-area philosophy (agents never write directly; librarian reviews first) is right for the *wiki*. But the memory/coordination track's value is *low-latency, high-frequency logging and recall* — and every low-latency system (Zep, Redis, OpenAI Sessions) writes directly and consolidates async/in-background. If every beads-style work-log entry must pass a human/librarian gate, the coordination surface becomes too slow to be worth calling. Contradiction to resolve: the wiki write path needs the gate; the coordination-memory write path probably needs direct-write + async consolidation, *not* the same gate.

4. **Granularity: fact-graph extraction may be more machinery than a work-log needs.** Mem0/Zep/Cognee build entity/relationship knowledge graphs via LLM extraction on every write. Cognee is explicitly weakest at *conversational/task* memory (third-party review) and strongest at document→graph. Orvex's beads inspiration is a *structured issue/task-log*, not a prose knowledge graph — the heavy Cognify-style entity-extraction pipeline may be scope Orvex should deliberately cut, storing structured work-items directly rather than extracting a graph from them.

5. **MCP-first is a real differentiator — but also means there's no reference to copy.** The MCP KG server proves MCP memory can be trivially thin; the capable products (Zep's MCP is "experimental," Bedrock has no memory-as-MCP, Vertex's MCP surface is unconfirmed, Azure/CrewAI/MS are MCP *consumers* not memory servers). So MCP-first is genuinely open ground — but that cuts both ways: **Orvex must harden and version its own MCP memory contract from scratch; there is no production-grade MCP memory server to fork.**

6. **"Survive 100 documents in one session" is a durability problem the memory vendors don't address — and the one system that does has a cliff.** None of the memory platforms speak to burst-durability. Temporal does — but its Event History hard-caps at 51.2k events/50MB and *degrades visibly around 10k events*, with Continue-As-New capped at 2MB (external store required for larger state). The lesson cuts against assuming a naive event-log survives the burst: design compaction + store-by-reference up front, or the durability substrate itself becomes the bottleneck.

---

## 5. Decisions forced into the PRD

Each has an evidence-backed default and a one-line rationale. These are the questions the PRD must answer explicitly.

1. **Storage engine for the memory core?** → **Default: Postgres + pgvector, with a bitemporal edge model for as-of-date recall; drop Dolt.** Rationale: universal in the field, matches the separate storage research and Orvex's Postgres stack; Zep proves bitemporality needs an edge model, not a versioned DB (§4.1).

2. **Do coordination-memory writes go through the librarian gate, or direct-write + async consolidate?** → **Default: wiki writes are gated; cross-agent coordination writes are direct + async-consolidated.** Rationale: every low-latency system writes direct and consolidates in background; a gate on high-frequency work-logs kills the coordination surface (§4.3).

3. **Namespace model + isolation depth for v1?** → **Default: tenant / agent / session (+ optional work-item) namespaces with prefix isolation; defer per-item ACLs.** Rationale: the whole mature field ships namespace-prefix + IAM and stops there; LangMem calls namespace-only a legitimate v1 (Bedrock/Vertex/Azure/Redis, §2, §4.2).

4. **Consolidation contract?** → **Default: retrieve top-k similar → LLM picks ADD/UPDATE/DELETE/NOOP (Mem0), with a cheap non-LLM intra-batch dedup pass (CrewAI 0.98-cosine), soft-delete not hard-delete.** Rationale: this is the field's reference merge loop and it doubles as the librarian's auditable "why this landed as edit vs new vs contradiction" trail (§2).

5. **Decay/compaction policy — build it now or defer?** → **Default: build it now, as per-customer config (Redis-style max-age / max-inactive / keep-top-N) plus a Cognee-style prune/reweight pass; run it async (Letta sleep-time).** Rationale: the field's biggest gap is *no decay*; the "cheaper future sessions" goal requires a lean store, and the reference platforms punt this (§2, §4).

6. **Retrieval architecture?** → **Default: hybrid semantic + keyword + graph, no LLM in the hot path, ranked by composite score (similarity + exp recency decay + importance); fast-path cheap lookups.** Rationale: Zep's ~300ms P95 comes from zero-LLM retrieval; CrewAI gives the explainable ranking formula (§2).

7. **MCP tool surface shape?** → **Default: a minimal verb set (Supermemory's `memory`/`recall`, extended with beads work-item verbs claim/handoff/discover), plus an entity/relation/observation-shaped read adapter for interop with the MCP KG reference contract.** Rationale: small surfaces are used correctly by agents; the reference server is the de-facto baseline every host expects (MCP KG steal #4, Supermemory steal #1).

8. **Handoff / coordination primitive?** → **Default: a first-class `handoff` tool carrying a typed payload (reason/scope/priority), backed by an explicit Task state machine (submitted→working→INPUT/AUTH_REQUIRED→done).** Rationale: OpenAI Agents SDK owns the named handoff primitive; A2A supplies the state-machine shape the librarian review needs (§1 steals).

9. **Burst-durability for the 100-doc staging session?** → **Default: model the burst as a durable, checkpointed workflow (per-change checkpoint + saga/compensation rollback), with an explicit event-count cap and store-by-reference for large payloads.** Rationale: Temporal's exact use-case map — but heed its ~10k-event degradation cliff and 2MB state cap; design compaction up front (§4.6).

10. **Extraction granularity — structured work-items or LLM-extracted knowledge graph?** → **Default: store beads-style structured work-items directly; skip the heavy Cognify-style entity-extraction pipeline for the coordination track.** Rationale: Orvex's model is a task-log, not a prose graph; Cognee is admittedly weak at task/conversational memory (§4.4).

11. **Human review workflow — full loop or bare primitive?** → **Default: ship the "boring parts" as core requirements: notification hooks, timeout/escalation, and a structured decision audit log (who/when/what/why) + rollback.** Rationale: OpenAI's `needs_approval` gap (#636) and Anthropic Managed Agents' audit+rollback set the bar; the review gate is a workflow, not an interrupt (§1.2, OpenAI/Anthropic steals).

12. **Deletion / right-to-erasure contract?** → **Default: hard, immediate, cascading delete through consolidated/derived artifacts — not TTL-floor soft-expiry.** Rationale: aligns with Orvex's "no fallbacks / hard cuts" rule; beats AWS's 7-day TTL floor and OpenAI's non-cascading purge (a documented failure mode driving lawsuits) (Bedrock/ChatGPT AVOID sections).

*(Bonus decision worth stating: **compliance posture (SOC2/HIPAA, VNet/network isolation) as a day-one requirement, not a retrofit** — Cognee lacks it, Azure carves memory out of VNet support; Orvex's enterprise multi-tenant customers will benchmark against this.)*

---

## 6. Sources index

Per-platform profiles (each carries its own full source list):

- `platforms/mem0.md` — Mem0 (arXiv 2504.19413; docs.mem0.ai; GitHub; pricing)
- `platforms/zep-graphiti.md` — Zep / Graphiti (arXiv 2501.13956; getzep.com; GitHub getzep/graphiti; Neo4j blog)
- `platforms/letta-memgpt.md` — Letta / MemGPT (letta.com; docs.letta.com; GitHub letta-ai/letta)
- `platforms/cognee.md` — Cognee (cognee.ai; GitHub topoteretes/cognee; vectorize.io; mcp.directory)
- `platforms/aws-bedrock-agentcore-memory.md` — AWS Bedrock AgentCore Memory (docs.aws.amazon.com bedrock-agentcore; cloudburn.io)
- `platforms/google-vertex-ai-memory-bank.md` — Vertex AI Memory Bank (cloud.google.com blog + docs; discuss.google.dev FAQ)
- `platforms/azure-ai-foundry-agent-service.md` — Azure AI Foundry Agent Service (learn.microsoft.com foundry/agents; techcommunity; Gartner Peer Insights)
- `platforms/openai-chatgpt-memory.md` — OpenAI ChatGPT Memory (openai.com; help.openai.com; memx.app; litigation coverage)
- `platforms/anthropic-claude-memory-projects.md` — Claude Memory & Projects (claude.com/blog/memory; platform.claude.com memory-tool; support.claude.com; edtechinnovationhub)
- `platforms/mcp-knowledge-graph-memory-server.md` — MCP KG Memory Server (github.com/modelcontextprotocol/servers; npm; chatforest.com)
- `platforms/supermemory.md` — Supermemory (supermemory.ai; GitHub supermemoryai; TechCrunch; hindsight.vectorize.io)
- `platforms/redis-agent-memory-server.md` — Redis Agent Memory Server (GitHub redis/agent-memory-server; redis.github.io docs; redis.io/agent-memory)
- `platforms/langmem.md` — LangMem (langchain-ai.github.io/langmem; GitHub langchain-ai/langmem; langchain.com/blog)
- `platforms/crewai.md` — CrewAI (docs.crewai.com; GitHub crewaiinc/crewai; mem0.ai/blog crewai-memory; GitHub issues #4783/#2606)
- `platforms/openai-agents-sdk.md` — OpenAI Agents SDK (openai.github.io/openai-agents-python; cookbook.openai.com; GitHub issue #636)
- `platforms/temporal-durable-execution.md` — Temporal (docs.temporal.io; temporal.io/blog OpenAI+Vercel integrations; pricing; GeekWire)
- `platforms/microsoft-agent-framework.md` — Microsoft Agent Framework (learn.microsoft.com/agent-framework; devblogs.microsoft.com; deepwiki; diagrid.io critique)
- `platforms/google-a2a-protocol.md` — Google A2A (github.com/a2aproject/A2A spec + issue #893; linuxfoundation.org press; a2a-protocol.org)

Meta-inputs: `platforms/_candidates.md` (shortlist rationale), `platforms/_gaps.md` (coverage-gap critique that added CrewAI, Temporal, OpenAI Agents SDK, MS Agent Framework).

**Evidence caveat carried throughout:** benchmark and adoption numbers (Mem0/Zep/Supermemory LoCoMo/LongMemEval scores, CrewAI "2B executions", A2A "150+ orgs", ChatGPT/Claude recall %, all customer-metric case studies) are vendor-self-reported or third-party-estimated and flagged as unverified in the source profiles — do not cite as ground truth in the PRD without that caveat.
