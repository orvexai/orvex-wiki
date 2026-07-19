# Prior Art Deep-Dive: Google Agent2Agent (A2A) Protocol

Research date: 2026-07-10

## What it is

A2A (Agent2Agent) is an open, application-level protocol that lets independent, "opaque" AI agents — built on different frameworks, by different vendors — discover each other's capabilities, negotiate interaction modes, delegate tasks, and exchange conversational context/results, without either side needing access to the other's internal state, memory, or tools. It was created by Google, announced 2025-04-09 with 50+ launch partners, and donated to the Linux Foundation (Agentic AI Foundation) in mid-2025 for vendor-neutral governance. It is explicitly positioned as *complementary* to Anthropic's Model Context Protocol (MCP): MCP is agent-to-tool, A2A is agent-to-agent.
Sources: [GitHub - a2aproject/A2A](https://github.com/a2aproject/A2A), [Google Cloud donates A2A to Linux Foundation](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/), [A2A and MCP](https://github.com/a2aproject/A2A/blob/main/docs/topics/a2a-and-mcp.md)

## Behind it & traction

Originated at Google, now stewarded by a Technical Steering Committee with representatives from AWS, Cisco, Google, IBM Research, Microsoft, Salesforce, SAP, and ServiceNow under the Linux Foundation. At its one-year mark (announced 2026-04-09): 150+ supporting organizations (up from 50+ at launch), 22,000+ GitHub stars, SDKs in 5 languages (Python, JavaScript, Java, Go, .NET), v1.0 stable spec, and a companion Agent Payments Protocol (AP2) with 60+ supporting orgs. Cloud integrations cited: Microsoft Azure AI Foundry / Copilot Studio, AWS Bedrock AgentCore Runtime; framework compatibility cited: LangGraph, CrewAI. Production deployment areas named: supply chain, financial services, insurance, IT operations. Quote from Google's Rao Surapaneni: "AI agents are only as useful as their ability to collaborate, and adoption by more than 150 organizations underscores enthusiasm for an open protocol." Quote from Cisco's Luca Muscariello: "A2A has emerged as the syntactic layer that makes agent-to-agent communication reliable and interoperable." These adoption figures are vendor/foundation press-release claims (Linux Foundation + Google), not independently audited; treat "150+ organizations" as "organizations listed as supporters," not "organizations running A2A in production at scale."
Sources: [Linux Foundation: A2A Protocol Surpasses 150 Organizations](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year), [Linux Foundation Launches the Agent2Agent Protocol Project](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents), [HPCwire/AIwire coverage](https://www.hpcwire.com/aiwire/2026/04/09/linux-foundation-a2a-protocol-marks-one-year-with-broad-enterprise-and-cloud-adoption/)

## Architecture & data model

Core objects (from the v1.0 specification):
- **Agent Card**: metadata document describing an agent's identity/capabilities — `name`, `description`, `version`, `supportedInterfaces` (protocol bindings + URLs for HTTP+JSON, gRPC, JSON-RPC), `capabilities` (boolean flags for streaming, push notifications, extended cards), `securitySchemes` (OAuth2, API keys, mTLS, etc.), `skills` array, `defaultInputModes`/`defaultOutputModes`. Cards can be digitally signed (JWS) for authenticity — new in v1.0.
- **Task**: the unit of work, with a server-generated `taskId` and a formal lifecycle state machine: `SUBMITTED → WORKING → (INPUT_REQUIRED | AUTH_REQUIRED) → COMPLETED | FAILED | CANCELED | REJECTED`.
- **Message**: a communication turn with a `role` ("user" or "agent"), composed of **Parts** — the smallest content unit: text parts (plain string), file parts (URL reference or raw bytes + mediaType), data parts (structured JSON).
- **Artifact**: task *output*, deliberately separated from Messages — "Results SHOULD BE returned using Artifacts... This separation allows for a clear distinction between communication (Messages) and data output (Artifacts)."
- **contextId**: groups related tasks for conversational continuity (server- or client-generated); each domain agent maintains its own context store keyed on this.
- Delivery modes: synchronous request/response, SSE streaming (`SendStreamingMessage`/task subscription, events MUST be delivered in generation order), and asynchronous push notifications (agent POSTs to a client-registered webhook on state change, same `StreamResponse` payload shape as streaming).
- v1.0 additions: multi-tenancy (one endpoint hosting multiple agents for different tenants) and multi-protocol bindings (same agent reachable via JSON-RPC and gRPC).
Sources: [A2A specification.md](https://github.com/a2aproject/A2A/blob/main/docs/specification.md), [A2A Protocol docs site](https://a2a-protocol.org/latest/)

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- **Not MCP** — A2A is a separate, complementary protocol. The official positioning: "An agentic application might primarily use A2A to communicate with other agents. Each individual agent internally uses MCP to interact with its specific tools and resources." No merger of the two specs.
- **SDKs**: official SDKs in Python, JavaScript, Java, Go, .NET (5 languages).
- **Transport**: JSON-RPC and gRPC bindings over HTTP(S); auth delegated entirely to standard web security (TLS, bearer tokens, OAuth2, API keys, mTLS) declared per-agent in the Agent Card; in-task authorization is modeled as a task state (`AUTH_REQUIRED`) rather than a side-channel.
- **CLI**: no first-party CLI found in the sources reviewed.
- **Chat-platform plugins**: the official A2A-and-MCP doc contains **no mentions of chat-platform integration (ChatGPT/Claude/portal), CLI tooling, or plugin ecosystem** — it is scoped purely to the agent-to-agent wire protocol and its relationship to MCP. Cloud-vendor integration exists at the platform level (Azure AI Foundry/Copilot Studio, AWS Bedrock AgentCore Runtime, LangGraph, CrewAI) rather than as chat-app plugins.
Sources: [A2A and MCP](https://github.com/a2aproject/A2A/blob/main/docs/topics/a2a-and-mcp.md), [Linux Foundation press release](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)

## Memory lifecycle & sharing

A2A is explicitly **not a memory system** — it is a task/coordination transport, and this is the single most important distinction for Orvex.
- **Capture/consolidate/retrieve/decay**: unknown / not specified. The spec states "The agent is responsible to determine which Messages are persisted in the Task History" — persistence policy is left entirely to each implementing agent, with no protocol-level consolidation, decay, or summarization mechanism.
- **Cross-session continuity**: handled only via `contextId`, which groups tasks for a logical conversation; each domain agent keeps its own private context store keyed on that id. There is no shared, protocol-defined memory store other agents can query — an agent cannot read another agent's Task History or memory directly, only what is explicitly exchanged as Messages/Artifacts.
- **Reliability caveat from the spec itself**: "Clients using streaming to retrieve task updates MAY not receive all status update messages if the client is disconnected" — i.e., no durable at-least-once guarantee for state history by default.
- **Multi-agent sharing / namespaces / permissions**: no shared memory namespace concept exists in the protocol; isolation is achieved because agents are "opaque" to each other by design — the opposite of a shared cross-agent memory graph. The open GitHub issue "Best Practices for Agent Memory Across Tasks" (a2aproject/A2A#893) indicates the community itself is still discussing memory conventions on top of A2A, confirming this is unresolved/out of scope for the core spec as of this research.
- **Token-cost story**: unknown — not addressed in the spec; each agent's context/memory management (and its token cost) is entirely internal/opaque to A2A.
- **Chat-platform integration for memory**: none found; A2A does not define ChatGPT/Claude/MCP memory bridges.
Sources: [A2A specification.md](https://github.com/a2aproject/A2A/blob/main/docs/specification.md), [GitHub issue #893: Best Practices for Agent Memory Across Tasks](https://github.com/a2aproject/A2A/issues/893), [Microsoft ISE blog: Passing Context Between Agents in Multi-Agent A2A Systems](https://devblogs.microsoft.com/ise/a2a-context-passing-multi-agent-systems/)

## Scale & operational evidence

- 150+ supporting organizations, 22,000+ GitHub stars, v1.0 stable, SDKs in 5 languages (all as of the 2026-04-09 one-year announcement) — press-release-sourced, not independently verified benchmark numbers.
- Named production deployment verticals: supply chain, financial services, insurance, IT operations — no named customer case studies, throughput numbers, latency figures, or uptime SLAs were found in the sources reviewed.
- Cloud platform landings: Microsoft Azure AI Foundry/Copilot Studio, AWS Bedrock AgentCore Runtime — these are marketing/integration announcements, not operational evidence of scale (no request-volume or reliability data disclosed).
- No independent third-party benchmark, postmortem, or scale report was found for A2A specifically (searches surfaced academic papers referencing A2A as one of several "internet of agents" protocols, not operational case studies).
Sources: [Linux Foundation press release](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year), [arxiv: A Layered Protocol Architecture for the Internet of Agents](https://arxiv.org/pdf/2511.19699)

## Pricing & positioning

Apache License 2.0 — free, open source, no licensing cost for the protocol itself. Governed by the Linux Foundation's Agentic AI Foundation as a vendor-neutral standard (same umbrella as MCP). No A2A-specific commercial product/pricing exists — costs to an adopter come from implementation effort and whatever cloud platform (Azure, AWS Bedrock, etc.) is used to host/run agents, not from the protocol. Positioned as the "interoperability layer" / "syntactic layer" for agent-to-agent communication, sitting alongside MCP (tool access) and AP2 (agent payments) as a set of complementary open standards rather than a single vertically integrated product.
Sources: [Linux Foundation Agent2Agent (A2A) Protocol project page](https://insights.linuxfoundation.org/project/agent2agent-a2a-protocol), [Google Cloud donates A2A to Linux Foundation](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/)

## STEAL - 3-5 concrete ideas for Orvex

1. **Formal Task state machine with explicit `AUTH_REQUIRED`/`INPUT_REQUIRED` states.** Orvex's staging area and cross-agent handoffs could adopt an explicit, protocol-level state machine (submitted → working → needs-human/needs-approval → completed/failed/rejected) instead of ad hoc status strings — this is exactly the shape needed when a librarian agent must pause a staged change for human review.
2. **Separate "communication" from "data output" (Message vs Artifact).** A2A's hard split between conversational Messages and the actual work-product Artifacts maps cleanly onto Orvex's staging area: agent chat/reasoning stays out of the wiki; only the finished proposed document/section/edit becomes the "artifact" the librarian reviews. Adopt this distinction explicitly in the staging schema.
3. **Agent Cards as a discovery/capability contract.** A lightweight, signable capability manifest (skills, input/output modes, auth requirements) per agent is a good pattern for Orvex's agent fleet and MCP tool surface — customers/agents could discover what a given customer's agent fleet or the librarian agent can do without hardcoding integration per agent.
4. **contextId as a cheap conversation-grouping primitive.** Even without solving memory, a lightweight session/context id that threads through staged proposals lets the librarian and downstream tooling group "everything this agent proposed in this conversation" (needed for the 100-document staging burst case) without building a heavier memory system.
5. **Treat A2A as the "task delegation transport," not the memory answer.** Its own community (GitHub issue #893) is still asking "how should agent memory work on top of A2A" — confirming Orvex's cross-agent memory service is solving a real, unaddressed gap and could itself become the memory layer that A2A-style coordination protocols lack. Consider exposing Orvex's memory service so any A2A-speaking agent can consult it as a context source, positioning Orvex as the memory complement to A2A/MCP rather than competing with them.

## AVOID / where Orvex differs

- **A2A has no shared/queryable cross-agent memory** — it explicitly keeps agents "opaque" to each other's internal state/memory by design. Orvex's mandate (agents "discover each other's context") is the opposite goal; do not assume A2A gives you this for free — it is a peer-to-peer task/message protocol, not a memory substrate. If Orvex adopts A2A for delegation, it still needs its own memory service (the beads-inspired track) on top.
- **No protocol-level decay/consolidation/summarization** — A2A leaves all history/persistence policy to each individual agent implementation ("The agent is responsible to determine which Messages are persisted"). Orvex should not point to A2A as prior art for memory lifecycle management; it simply doesn't specify one.
- **No durable delivery guarantee for streamed status by default** — disconnected clients "MAY not receive all status update messages." Orvex's staging area, which must survive a single session proposing 100 document changes, needs a durable store (per the mandate) rather than relying on stream delivery semantics like A2A's default.
- **Traction numbers are vendor press-release claims**, not audited or independently benchmarked; do not cite "150+ organizations" or "22K+ stars" internally as evidence of production robustness without caveating the source.
- **No chat-platform (ChatGPT/Claude portal) or CLI integration story** exists in the core spec — unlike Orvex's requirement to be "driven by prompts/instructions in chat platforms," A2A operates purely at the agent-service wire-protocol layer, not the chat-UI layer. Orvex will need to build that layer itself; A2A offers no template for it.

## Sources

- https://github.com/a2aproject/A2A
- https://github.com/a2aproject/A2A/blob/main/docs/specification.md
- https://github.com/a2aproject/A2A/blob/main/docs/topics/a2a-and-mcp.md
- https://github.com/a2aproject/A2A/issues/893
- https://a2a-protocol.org/latest/
- https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/
- https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year
- https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents
- https://www.hpcwire.com/aiwire/2026/04/09/linux-foundation-a2a-protocol-marks-one-year-with-broad-enterprise-and-cloud-adoption/
- https://insights.linuxfoundation.org/project/agent2agent-a2a-protocol
- https://devblogs.microsoft.com/ise/a2a-context-passing-multi-agent-systems/
- https://arxiv.org/pdf/2511.19699
