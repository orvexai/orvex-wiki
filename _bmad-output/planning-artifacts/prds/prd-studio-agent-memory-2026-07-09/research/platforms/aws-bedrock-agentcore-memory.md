# AWS Bedrock AgentCore Memory — Deep Dive

## What it is
AgentCore Memory is a fully managed AWS service (one of ~7 modular services under Amazon Bedrock AgentCore, alongside Runtime, Gateway, Identity, Browser, Code Interpreter, Observability) that gives AI agents short-term (in-session) and long-term (cross-session) memory without the customer building/operating memory infrastructure. It targets the "statelessness" problem: agents that treat every interaction as new.
Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html

## Behind it & traction
- Built by AWS as part of Amazon Bedrock AgentCore. Preview announced 2025-07-16; AgentCore (including Memory) reached **General Availability on 2025-10-13** across 9 AWS regions (us-east-1, us-east-2, us-west-2, ap-south-1, ap-southeast-1, ap-southeast-2, ap-northeast-1, eu-central-1, eu-west-1). Episodic memory strategy added 2025-12-02.
  Source: https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-bedrock-agentcore-available/
- Framework-agnostic but has first-class integration with AWS's own **Strands Agents SDK** (`AgentCoreMemorySessionManager` / `AgentCoreMemoryConfig`), plus documented samples for other frameworks (LangGraph, CrewAI mentioned in AWS sample repos).
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/strands-sdk-memory.html
- Third-party commentary (consultancies Rackspace, Cloudvisor, Devoteam, Pulumi, Cloud Burn, individual engineers on Medium/Dev.to) treats it as the most "complete" managed entrant as of mid-2026, but flags immaturity: no IaC (CDK/CloudFormation/Terraform) support noted at review time, async extraction lag, and rigid TTL floors.
  Source: https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing ; https://medium.com/data-reply-it-datatech/stateful-agents-on-amazon-bedrock-how-agentcore-runtime-solves-the-memory-problem-74ba885776e7
- unknown: independent customer-count, revenue, or adoption-scale figures — AWS has not published usage statistics for Memory specifically.

## Architecture & data model
- Two-layer model: **short-term memory** (raw turn-by-turn conversation events within a session) and **long-term memory** (extracted, persisted knowledge across sessions).
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html
- Organizing primitives: **Actor** (end user, or agent/user pair), **Session** (one conversation), and for long-term memory, **Strategy** (an extraction policy) plus a **Namespace** (hierarchical path like `/strategy/{memoryStrategyId}/actor/{actorId}/session/{sessionId}/`) that scopes where extracted memories land. Namespaces support variable interpolation (`{actorId}`, `{strategyId}`, `{sessionId}`) and can be scoped at 4 granularities from session-level up to global.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html
- Long-term memory is populated by one or more **memory strategies** attached to a memory resource via `CreateMemory`/`UpdateMemory`. Supported strategy types: **SEMANTIC**, **SUMMARIZATION**, **USER_PREFERENCE**, **EPISODIC** (added Dec 2025). If no strategy is configured, no long-term extraction happens at all (short-term-only mode is explicit, not a fallback).
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html ; https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html
- Three tiers of strategy control: **Built-in** (AWS-managed extraction+consolidation, predefined algorithms, no config, highest storage cost), **Built-in overrides** (customize prompts/model choice, still AWS-managed pipeline, mid cost), **Self-managed** (customer owns extraction/consolidation algorithm, model choice, schema, namespace logic — full control, lowest storage cost, most engineering burden).
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html
- Underlying storage engine: unknown (AWS does not disclose whether it's DynamoDB/OpenSearch/proprietary; not stated in docs reviewed).
- Access control: IAM policies can restrict `RetrieveMemoryRecords` (and similar actions) by `namespace` / `namespacePath` condition keys — i.e., permissions are enforced at the namespace-prefix level via standard IAM, not a bespoke ACL system.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
- Core surface is a **control-plane + data-plane REST API**: `CreateMemory`/`UpdateMemory` (control plane, define strategies/namespaces), `CreateEvent` (write short-term events), retrieval operations for short-term events and long-term `RetrieveMemoryRecords`.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html
- **SDK**: Python SDK with a starter toolkit (`bedrock-agentcore-starter-toolkit`) and tight integration into AWS's own **Strands Agents SDK** via `AgentCoreMemorySessionManager`/`AgentCoreMemoryConfig` — pass a config object at Agent construction and memory capture/retrieval is largely automatic.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/strands-sdk-memory.html ; https://aws.github.io/bedrock-agentcore-starter-toolkit/index.html
- **MCP**: AgentCore has a separate "Gateway" service that exposes tools/APIs as MCP servers, and AWS blogs show building long-running MCP servers "on" AgentCore Runtime with Strands integration — but this is MCP as a way to expose *tools*, not documented evidence of Memory itself being surfaced as an MCP resource/tool out of the box. unknown whether AWS ships a ready-made "memory" MCP server.
  Source: https://aws.amazon.com/blogs/machine-learning/build-long-running-mcp-servers-on-amazon-bedrock-agentcore-with-strands-agents-integration/
- **CLI**: the `bedrock-agentcore-starter-toolkit` provides CLI/quickstart tooling for scaffolding memory resources.
  Source: https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/memory/quickstart.html
- **Chat-platform plugins (ChatGPT/Claude/portal-style integrations)**: none found. This is an AWS-agent-framework-first product (Strands, plus generic SDK for any agent code); there is no documented first-party ChatGPT or Claude Desktop/Claude.ai integration.
- **Cross-account access**: documented capability to share a Memory resource across AWS accounts.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/how-it-works.html (topic: "Cross-account memory access")

## Memory lifecycle & sharing
- **Capture**: raw conversation turns written as short-term "events" via `CreateEvent`, tagged with `sessionId` + `actorId`.
- **Consolidate/extract**: attached memory strategies run asynchronously over raw events to produce long-term memory records (semantic facts, summaries, user preferences, episodic records), written under the configured namespace. AWS docs explicitly warn of a **delay between writing events and long-term records becoming retrievable** (async pipeline, not real-time).
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html ; third-party review noting async lag: https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing
- **Retrieve**: long-term records fetched via `RetrieveMemoryRecords`, scoped/filtered by namespace; described by AWS as offering "semantic filtering and top-K retrieval."
  Source: (third-party) https://medium.com/data-reply-it-datatech/stateful-agents-on-amazon-bedrock-how-agentcore-runtime-solves-the-memory-problem-74ba885776e7
- **Decay/compact/summarize**: SUMMARIZATION is one of the four built-in strategy types (session→summary compaction). Short-term events have configurable TTL/expiration, but AWS imposes a **floor of 7 days minimum** and **no force-expire** for events set at 30/90-day retention — i.e., you can't manually purge early. No explicit "forgetting"/decay-scoring mechanism is documented beyond TTL expiry and summarization.
  Source: https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing (limitations roundup); strategy list: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html
- **Multi-agent sharing / namespaces / permissions**: sharing across agents/users is achieved by pointing multiple actors/agents at the same memory resource and namespace tree; isolation is namespace-prefix based, enforced via IAM condition keys on `namespace`/`namespacePath`. AWS's own use-case list explicitly names "multi-agent systems... share memory to synchronize" as a target scenario.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html ; https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html
- **Cross-session token-cost story**: the pitch is that long-term memory avoids re-sending full conversation history — agent queries a namespace for relevant facts instead of replaying transcripts. No AWS-published quantitative token-savings benchmark was found. unknown magnitude of savings.
- **Chat-platform integration**: unknown/none documented for ChatGPT, Claude, or generic "portal" chat UIs; integration story is agent-framework/SDK-first (Strands) and raw API/SDK for custom agent code.

## Scale & operational evidence
- Runtime constraint (adjacent to Memory but operationally coupled): AgentCore Runtime microVMs have a **max 8-hour lifetime per instance**; sessions/memory persist beyond that but compute must be reprovisioned.
  Source: https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing
- Managed session storage (separate from long-term Memory) is still **in preview**, with session data reset after 14 days of inactivity or on runtime-version updates — signals the broader AgentCore stack is not uniformly GA-mature even though Memory itself is GA.
  Source: https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing
- No publicly disclosed multi-tenant scale numbers (records/sec, customers, largest deployment) were found in AWS or third-party sources reviewed. unknown.
- Built-in strategies are described by AWS as "optimized and benchmarked" but no benchmark data/methodology was published in sources reviewed. Treat as a marketing claim, not evidence.
  Source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html

## Pricing & positioning
- **Short-term memory**: $0.25 per 1,000 new events.
- **Long-term memory storage**: $0.75 per 1,000 memory records/month for **built-in** strategies (AWS absorbs model cost); $0.25 per 1,000 memory records/month for **built-in-with-override or self-managed** strategies (customer pays model/embedding cost separately at standard Bedrock rates). Billed hourly, assuming a 31-day month.
- **Long-term memory retrieval**: $0.50 per 1,000 memory-record retrievals.
- **Model cost**: included in the $0.75 built-in tier; billed separately (standard Bedrock pricing) once you override prompts/models or self-manage.
- **Free tier**: none dedicated to Memory; only generic new-account AWS credits apply.
  Source: https://aws.amazon.com/bedrock/agentcore/pricing/ ; corroborating breakdown: https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing
- **Positioning**: sold as "eliminate memory infrastructure" for teams already on AWS/Bedrock, with a deliberate three-tier cost/control tradeoff (built-in convenience at 3x the storage price of self-managed). It is consumption-priced (pay per event/record/retrieval), not seat- or plan-based — no published enterprise/committed-use tier found.

## STEAL - 3-5 concrete ideas for Orvex
1. **Three-tier control/cost dial per strategy** (built-in fully-managed vs. built-in-with-overrides vs. self-managed) is a clean way to let customers trade convenience for cost/control per memory type, and it maps well onto Orvex's per-customer-tweakable librarian prompt idea — apply the same dial to memory extraction strategies (semantic/summary/preference/episodic), not just the librarian.
2. **Namespace-as-permission-boundary via path prefix + condition keys** is a lightweight, well-understood pattern (same shape as S3 prefix IAM) for multi-tenant, multi-agent memory isolation — reuse this instead of inventing a bespoke ACL model for cross-agent memory sharing.
3. **Explicit strategy taxonomy (SEMANTIC / SUMMARIZATION / USER_PREFERENCE / EPISODIC)** gives customers/agents a predictable mental model of *what kind* of thing gets remembered — worth adopting or explicitly deciding Orvex's fewer/different categories, rather than one opaque "memory."
4. **Consumption-based pricing split by lifecycle stage** (write events, stored records/month, retrieval calls) cleanly isolates the three cost drivers and could inform how Orvex prices/monitors the memory/coordination service's staging store and librarian-merge costs.
5. **Async extraction with disclosed lag** — AWS is upfront in docs that long-term records aren't immediately queryable after a raw event; Orvex should decide and document the same latency contract for the librarian/beads-style consolidation pass rather than implying real-time availability.

## AVOID / where Orvex differs
- **No MCP-first memory surface, no chat-platform plugin story** — AgentCore Memory is AWS-SDK/Strands-first; Orvex's stated requirement is MCP tools + CLI + chat-platform-driven prompts (ChatGPT/Claude/portals). This is a clear gap AgentCore doesn't fill — Orvex should not assume MCP exposure "comes free" with a memory backend; it must be built explicitly, unlike AgentCore where Memory-as-MCP-tool is unconfirmed/absent.
- **Rigid TTL floors, no force-expire** — AWS's 7-day-minimum, no-early-purge design is a poor fit for "no fallbacks / hard cuts" data-governance expectations (per Orvex's own house rule) where customers may need immediate deletion (e.g., compliance/right-to-erasure). Orvex's memory/coordination service should support hard, immediate deletion rather than copying AWS's TTL-floor model.
- **Opaque built-in extraction ("benchmarked" but unpublished methodology)** — Orvex's librarian is explicitly customer-tweakable-prompt-driven and should stay auditable/inspectable, rather than following AWS's black-box built-in tier as the default.
- **AWS-account/IAM-bound multi-tenancy** — AgentCore's isolation model assumes the customer's own AWS account boundary; Orvex is itself the multi-tenant platform operator, so the same namespace-prefix idea (STEAL #2) needs to be reimplemented inside Orvex's own tenant model, not borrowed as "use IAM."
- **Storage backend undisclosed / no self-host option** — AgentCore Memory is AWS-managed-only, no open-source or self-hostable path, whereas beads (github.com/steveyegge/beads), Orvex's stated inspiration for cross-agent memory, is a self-managed/local-first prior art. Orvex's PRD should keep evaluating a managed-vs-self-managed split explicitly rather than defaulting to a closed managed service.

## Sources
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-strategies.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-organization.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/how-it-works.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/strands-sdk-memory.html
- https://aws.github.io/bedrock-agentcore-starter-toolkit/index.html
- https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/memory/quickstart.html
- https://aws.amazon.com/bedrock/agentcore/pricing/
- https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-bedrock-agentcore-available/
- https://cloudburn.io/blog/amazon-bedrock-agentcore-pricing
- https://aws.amazon.com/blogs/machine-learning/build-long-running-mcp-servers-on-amazon-bedrock-agentcore-with-strands-agents-integration/
- https://medium.com/data-reply-it-datatech/stateful-agents-on-amazon-bedrock-how-agentcore-runtime-solves-the-memory-problem-74ba885776e7
