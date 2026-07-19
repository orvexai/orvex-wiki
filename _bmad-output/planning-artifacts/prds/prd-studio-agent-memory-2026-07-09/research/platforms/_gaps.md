# Cross-Agent Memory — Prior-Art Coverage Gaps

Completeness-critic pass over the 14 profiled platforms (Mem0, Zep/Graphiti, Letta, Cognee, AWS Bedrock AgentCore, Vertex Memory Bank, Azure AI Foundry, OpenAI ChatGPT Memory, Claude Memory & Projects, MCP KG Memory Server, Google A2A, LangMem, Supermemory, Redis Agent Memory Server — plus Cloudflare Agent Memory listed in `_candidates.md`).

## Coverage verdict

**Strong** on the "memory layer" world — dedicated memory platforms, hyperscaler *managed* memory, LLM-native consumer memory, MCP memory servers, and OSS memory backends are all well represented, with good bitemporal (Zep/Graphiti), self-editing (Letta), and pipeline-graph (Cognee) coverage.

**Weak — one whole segment missing — on the coordination/handoff half of the mandate**, which is the beads-inspired center of gravity of this PRD. In the current set that half is represented only by:
- **A2A** — a wire protocol that is *explicitly not a memory system* (agents stay "opaque" to each other; no shared queryable state), and
- **LangMem** — a memory library, not an orchestration/handoff runtime.

The missing segment is **multi-agent orchestration frameworks that natively combine memory tiers WITH handoff/delegation** — i.e., the systems that actually implement "agent finishes, hands off work + context to the next agent" as a first-class primitive. A cross-check search for "2026 agent orchestration tools" returns a canonical list — LangGraph, Temporal, Microsoft Agent Framework, CrewAI, OpenAI Agents SDK, Google ADK/A2A, Bedrock AgentCore, Claude Agent SDK — of which the profiled set covers the managed/protocol members (A2A/ADK, Bedrock, Azure Foundry, Claude, LangChain) but **none of the framework members that own the handoff primitive**. That is the gap.

Also missing: **an unglamorous non-AI durability system** for the "survive one session proposing 100 documents" + durable-handoff requirement. Every profiled system is an LLM-era product; none demonstrates the decades-old durable-work-state pattern the staging burst actually needs.

## Gaps worth filling (ranked)

1. **CrewAI** — the clearest single system that fuses BOTH halves of Orvex's mandate: native 4-tier memory (short-term / long-term / entity / procedural) AND handoff-as-context-passing plus hierarchical (manager→specialist) delegation. Short-term memory *is* the handoff channel between sequential agents; long-term (SQLite) persists cross-session "the crew gets better." This is the most direct prior art for memory+coordination-in-one and is entirely absent. Note: CrewAI's own docs steer production users to Mem0 for memory, an instructive "framework memory isn't enough" signal.

2. **Temporal (durable execution)** — the *non-AI, unglamorous, instructive* pick the mandate asked for, and the sharpest prior art for the staging-burst durability requirement. Immutable event-history replay ("die at step 47 of 100, resume at 48") maps exactly onto "survive a chat session proposing 100 document changes"; durable handoff-with-compensation across workers models cross-agent handoff without a central in-memory coordinator. $300M Series D / $5B (Feb 2026) and a GA OpenAI Agents SDK integration make it the consensus durability substrate under agent runtimes. Informs whether Orvex's coordination layer should sit on a durable-execution engine rather than be reinvented.

3. **OpenAI Agents SDK (Sessions + Handoffs)** — owns the canonical, explicitly-named **`handoff`** primitive plus built-in **Session** memory, AND a human-in-the-loop *pause-for-approval* in its tool loop that maps directly onto Orvex's librarian review gate. A distinct developer-facing surface from the already-profiled *consumer* ChatGPT Memory; a genuine 2025-2026 entrant (AgentKit announced DevDay Oct 2025; Apr 2026 SDK adds configurable memory). Reference for the handoff API shape + approval-gated agent loop.

4. **Microsoft Agent Framework** — completeness pick for the hyperscaler-move angle: the Oct 2025 preview / Apr 2026 GA 1.0 consolidation of AutoGen + Semantic Kernel (both now maintenance-only) into one SDK, with **context providers for agent memory**, session/thread state, and stateful long-running multi-agent workflows with **context persistence + recovery**. Distinct from the already-profiled *managed* Azure AI Foundry Agent Service (this is the OSS SDK layer many Orvex MS-shop customers will standardize on). Lowest-priority of the four — its framework lessons partly overlap CrewAI/OpenAI — but it is the missing Microsoft OSS agent-runtime peer.

## Explicitly NOT recommending (to avoid padding)
- **Bitemporal/versioned DBs (Dolt/XTDB/Datomic)** — the Dolt-vs-Postgres storage decision is separate research, and Zep/Graphiti already covers the bitemporal fact model.
- **LangGraph / Claude Agent SDK** — LangGraph is covered via LangMem; Claude Agent SDK's memory is covered via Claude Memory & Projects.
- **Agent-observability tools (LangSmith/Langfuse/AgentOps)** — "continuous logging of what agents do" overlaps these, but they are tracing/eval, not a memory/coordination store; out of scope.
- **Salesforce Agentforce / ServiceNow** — enterprise agent platforms, but grounding-on-data-cloud, not a distinct memory or handoff model worth a profile.
