# Microsoft Agent Framework — Platform Deep-Dive

## What it is
Microsoft Agent Framework (MAF) is an open-source SDK (Python + .NET) for building, orchestrating and deploying AI agents and multi-agent workflows. It is Microsoft's direct successor to, and unification of, AutoGen (simple multi-agent abstractions) and Semantic Kernel (enterprise features: session-based state, type safety, middleware, telemetry). It ships two capability layers — **Agents** (single LLM-driven actors with tools/MCP servers) and **Workflows** (graph-based, type-safe, checkpointable multi-step/multi-agent orchestration) — plus foundational building blocks: model clients, agent sessions, context providers (memory), middleware, and MCP clients. It is the OSS SDK layer, distinct from the managed Azure AI Foundry Agent Service ("hosted agents") profile that can run MAF-built agents on managed compute.
Source: https://learn.microsoft.com/en-us/agent-framework/overview/

## Behind it & traction
Announced October 2025 as the consolidation point for AutoGen and Semantic Kernel, whose teams were merged into one unit; both prior projects entered maintenance mode (bug/security fixes only, no new features). MAF reached GA v1.0 on April 3, 2026 ("production-ready convergence of AutoGen and Semantic Kernel," stable APIs, long-term support). At Microsoft Build 2026, additional features graduated preview→GA including an "Agent Harness," hosted agents, CodeAct, and support for building agents on the GitHub Copilot SDK as a backend. AutoGen and Semantic Kernel together had accumulated 75,000+ GitHub stars historically (exact current MAF repo star count not captured in this pass — unknown).
Sources:
- https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
- https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-at-build-2026-announce/
- https://visualstudiomagazine.com/articles/2025/10/01/semantic-kernel-autogen--open-source-microsoft-agent-framework.aspx
- https://github.com/microsoft/agent-framework

## Architecture & data model
Core primitives per Microsoft docs:
- **Model clients** — chat completions/responses abstraction across providers (Microsoft Foundry, Anthropic, Azure OpenAI, OpenAI, Ollama, and more).
- **Agent Session** (`ChatClientAgentSession` in .NET, `AgentSession` in Python) — stateful container for conversation state, holding a `StateBag` for arbitrary key-value data and integrating with history providers.
- **Chat History Providers** — manage persistence/retrieval of conversation message history for models without built-in conversation management. Implementations include `InMemoryChatHistoryProvider`, `RedisHistoryProvider` (Python), `FileHistoryProvider` (Python, JSON Lines).
- **Context Providers** — the memory/RAG injection mechanism; two-phase lifecycle hook (`InvokingAsync`/`before_run` to inject context/tools, `InvokedAsync`/`after_run` to process results and mutate state) around each agent invocation. `ProviderSessionState<T>` gives typed, consistent storage per provider.
- **Middleware** — intercepts agent actions generically (not memory-specific).
- **Workflows** — graph-based orchestration executing on a synchronized "superstep" model based on Pregel, giving deterministic, checkpointable multi-step/multi-agent execution with type-safe routing and human-in-the-loop support.
- **Checkpointing** — workflow state can be persisted at points during execution and resumed later; `CosmosCheckpointStorage` persists to Azure Cosmos DB NoSQL for production/distributed durable, cross-process checkpointing.
Sources:
- https://learn.microsoft.com/en-us/agent-framework/overview/
- https://deepwiki.com/microsoft/agent-framework/3.4-memory-and-context-management
- https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints
- https://learn.microsoft.com/en-us/agent-framework/workflows/state
- https://deepwiki.com/microsoft/agent-framework/4.4-workflow-execution-and-checkpointing

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
- **SDK-first**: official Python (`pip install agent-framework`) and .NET (`dotnet add package Microsoft.Agents.AI.Foundry`) packages; no evidence of a standalone CLI product in sources reviewed (unknown).
- **MCP**: native "MCP clients for tool integration" is a first-class building block; agents can call hosted MCP servers as tools. GA v1.0 announcement explicitly calls out MCP and A2A (agent-to-agent) protocol support.
- **Chat-platform plugins**: not evidenced in sources reviewed — MAF is a backend/orchestration SDK, not a ChatGPT/Claude-style portal plugin (unknown).
- **Hosted/managed path**: Azure AI Foundry "Agent Service" can run externally-built MAF (and LangGraph) agents as "hosted agents" on a managed Foundry runtime — this is the productized/managed complement to the OSS SDK.
Sources:
- https://learn.microsoft.com/en-us/agent-framework/overview/
- https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
- https://azure.microsoft.com/en-us/products/ai-foundry/agent-service

## Memory lifecycle & sharing
**Capture → consolidate → retrieve → decay/compact/summarize**: Microsoft's own docs (via DeepWiki secondary source) describe capture (messages stored through `ChatHistoryProvider` implementations) and retrieve (context providers inject enriched info pre-invocation via `InvokingAsync`) clearly. "Consolidate" is approximated by `ProviderSessionState<T>` typed state, but there is **no documented decay/compaction/summarization mechanism** in the framework itself — that logic is delegated to whichever context provider is plugged in.

**Long-term memory via Mem0**: MAF ships a first-party `Mem0Provider` (.NET) / equivalent Python samples integrating the third-party Mem0 service. Each message added to a thread is sent to Mem0 to extract memories. Mem0 provides **scoping by Application, Agent, Thread, and User** (`ApplicationId`, `AgentId`, `ThreadId`, `UserId` on `Mem0ProviderOptions`), enabling both durable cross-thread user memory and short-term thread-scoped memory. This is the closest thing to a namespace/permission model MAF exposes for memory — and it is delegated to Mem0, not built natively into MAF's own state layer.

**Multi-agent sharing / namespaces / permissions**: not addressed by MAF's own memory/session docs; deferred to A2A communication patterns or provider-specific implementation (e.g., Mem0's scoping). No native cross-agent memory bus, no built-in ACL model found in sources reviewed.

**Cross-session token-cost story**: no explicit token-cost/compaction guidance found in sources reviewed (unknown) — checkpointing (Cosmos DB-backed) addresses workflow-resume durability, not context-window cost control.

**Chat-platform integration**: no evidence of ChatGPT/Claude/portal-specific memory integration; MCP client support means an MAF agent could consume an external MCP memory server, but no first-party "memory MCP server" product was found in this pass (unknown).
Sources:
- https://deepwiki.com/microsoft/agent-framework/3.4-memory-and-context-management
- https://learn.microsoft.com/en-us/python/api/agent-framework-core/agent_framework.mem0.mem0provider?view=agent-framework-python-latest
- https://github.com/microsoft/agent-framework/tree/main/python/samples/02-agents/context_providers/mem0
- https://learn.microsoft.com/en-us/agent-framework/get-started/memory

## Scale & operational evidence
- Workflow checkpointing is positioned explicitly for production/distributed use via `CosmosCheckpointStorage` (Azure Cosmos DB NoSQL) — the only concrete durability/scale claim found.
- A third-party critical take ("Still Not Durable: MS Agent Framework & Strands," diagrid.io) argues MAF's durability story has gaps relative to true durable-execution systems — flagged as a third-party critical review, not verified independently in this pass.
- Hosted agents billing (see Pricing below) began preview April 22, 2026, implying real production usage is still early/limited; no independent customer case studies or scale benchmarks were found in this pass.
Sources:
- https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints
- https://www.diagrid.io/blog/still-not-durable-how-microsoft-agent-framework-and-strands-agents-repeat-the-same-mistake
- https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/

## Pricing & positioning
- **MAF SDK itself**: open-source, free (Python/.NET packages).
- **Foundry Agent Service** (managed runtime): no additional charge for the service itself; customers pay separately for model tokens and invoked tools (knowledge connections like Fabric/SharePoint/Bing Search/Azure AI Search, action tools like Logic Apps/Azure Functions).
- **Hosted agents** (running external frameworks incl. MAF and LangGraph on managed Foundry runtime): compute billed at $0.0994/vCPU-hour, memory at $0.0118/GiB-hour; model inference and "persistent memory" billed separately (implies a distinct persistent-memory billing line, details not found). Hosted agents billing began April 22, 2026, in preview.
- **Positioning**: MAF is Microsoft's bet on OSS-first agent orchestration (competing conceptually with LangGraph, CrewAI) with a managed on-ramp (Foundry Agent Service) for enterprises that want Azure-hosted, billed-by-consumption execution — mirroring the classic OSS-core/managed-cloud-profile split relevant to Orvex's own AGPL-engine + closed-satellite model.
Sources:
- https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/
- https://azure.microsoft.com/en-us/products/ai-foundry/agent-service

## STEAL - 3-5 concrete ideas for Orvex
1. **Two-phase context-provider hook (before_run/after_run around every invocation)** — a clean, generic seam for injecting memory/RAG context pre-call and harvesting new facts post-call, decoupled from the agent's own logic. Orvex's staging-area submission point and the memory service's "log what I'm doing" write could both hang off an equivalent before/after hook rather than requiring bespoke agent-side code per platform.
2. **Explicit memory scoping dimensions (Application / Agent / Thread / User)** — Mem0Provider's four-way scoping is a directly reusable namespace model for Orvex's cross-agent memory service: per-tenant (Application), per-agent-identity, per-conversation (Thread), and per-end-user, so a memory item's visibility/lifetime is a first-class, queryable attribute rather than convention.
3. **Delegate memory intelligence to a pluggable provider, keep the core framework provider-agnostic** — MAF doesn't hardcode Mem0's extraction/decay logic into the framework; it's an interchangeable provider. Orvex's memory/coordination service should similarly keep the "what to remember, how to summarize/decay" policy swappable per-customer (echoing the librarian's per-customer-tweakable prompt for the staging area).
4. **Workflow checkpointing as a durable, resumable state pattern** — Pregel-style superstep checkpointing to a durable store (their choice: Cosmos DB) for long-running multi-agent workflows is directly applicable to Orvex's "hand off work" and "future sessions cheaper because context already worked out" goal: checkpoint agent workflow state, not just chat history.
5. **"Hosted agents on managed runtime, billed by compute + persistent memory as separate line items"** — validates that persistent memory can be a distinct, separately-metered resource from compute/tokens; useful precedent if Orvex wants to price/meter its memory service independently of agent-runtime consumption.
Sources: same as Architecture and Pricing sections above.

## AVOID / where Orvex differs
- **No native decay/compaction/summarization** — MAF punts memory-quality lifecycle entirely to third-party providers (Mem0). Orvex's PRD explicitly wants a hosted, opinionated cross-agent memory service; copying MAF's "leave it to the provider" stance would leave the actual hard problem (decay/compact/summarize) unsolved. Orvex should own this natively rather than defer it.
- **No native multi-agent namespace/ACL model** — MAF explicitly defers cross-agent sharing and permissions to A2A patterns or provider specifics; it is not a solved, first-party feature. Orvex needs this natively for a multi-tenant platform — cannot copy an absent pattern.
- **SDK/framework, not a hosted product** — MAF is a library developers embed; the managed Foundry Agent Service is Azure-specific and coupled to Azure billing/infra. Orvex's memory service is meant to be a hosted, MCP+CLI-exposed cross-platform service usable from ChatGPT/Claude/portals — a different product shape than "embed this SDK in your own app."
- **No evidence of chat-platform-native integration** (ChatGPT/Claude connectors, portal plugins) — this is a genuine capability gap in MAF relative to what Orvex needs; do not assume MAF has solved this.
- **Durability critiques exist** — a third-party review argues MAF's checkpointing/durability model has real gaps versus purpose-built durable-execution engines (e.g., Temporal-style systems); Orvex should not treat MAF's checkpointing as a gold-standard reference architecture without independent verification.
Sources:
- https://deepwiki.com/microsoft/agent-framework/3.4-memory-and-context-management
- https://www.diagrid.io/blog/still-not-durable-how-microsoft-agent-framework-and-strands-agents-repeat-the-same-mistake

## Sources
- https://learn.microsoft.com/en-us/agent-framework/overview/
- https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
- https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-at-build-2026-announce/
- https://visualstudiomagazine.com/articles/2025/10/01/semantic-kernel-autogen--open-source-microsoft-agent-framework.aspx
- https://github.com/microsoft/agent-framework
- https://deepwiki.com/microsoft/agent-framework/3.4-memory-and-context-management
- https://deepwiki.com/microsoft/agent-framework/4.4-workflow-execution-and-checkpointing
- https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints
- https://learn.microsoft.com/en-us/agent-framework/workflows/state
- https://learn.microsoft.com/en-us/python/api/agent-framework-core/agent_framework.mem0.mem0provider?view=agent-framework-python-latest
- https://github.com/microsoft/agent-framework/tree/main/python/samples/02-agents/context_providers/mem0
- https://learn.microsoft.com/en-us/agent-framework/get-started/memory
- https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/
- https://azure.microsoft.com/en-us/products/ai-foundry/agent-service
- https://www.diagrid.io/blog/still-not-durable-how-microsoft-agent-framework-and-strands-agents-repeat-the-same-mistake
