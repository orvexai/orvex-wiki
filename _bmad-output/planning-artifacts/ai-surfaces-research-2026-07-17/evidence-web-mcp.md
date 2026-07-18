# Evidence: 2025–2026 State of the Art for Designing a Best-in-Class MCP Server (Wiki/KB Focus)

**Research date:** 2026-07-17
**Scope:** External web research only (no repo reading). Feeds the Orvex Studio Track 2 fresh AI-first redesign of orvex-studio-mcp (live at mcp.orvex.dev, 19-tool surface).

---

## 1. Anthropic Official Guidance — Writing Tools for Agents

**Source:** [Writing effective tools for AI agents—using AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — Anthropic Engineering blog.

Core philosophy: tools are **"a contract between deterministic systems and non-deterministic agents"** — not a 1:1 mirror of a REST/GraphQL API written for other developers.

### 1.1 Tool selection & scope

| Principle | Detail |
|---|---|
| Consolidate functionality | Combine multi-step operations into one tool call rather than exposing low-level endpoints separately (e.g. `schedule_event` finds availability **and** schedules — not two tools) |
| Avoid list-based tools | Prefer `search_contacts` over `list_contacts` to bound context consumption |
| Match evaluation tasks | Build tools around proven high-impact workflows, not speculative API coverage |
| Quality over quantity | "More tools don't always lead to better outcomes" |

Strong tool examples cited: `schedule_event`, `search_logs` (returns relevant lines **with context**, not raw logs), `get_customer_context` (compiles related info atomically instead of forcing multiple round trips).

### 1.2 Namespacing

Group related tools under a consistent prefix or resource grouping:
- Service-based: `asana_search`, `jira_search`
- Resource-based: `asana_projects_search`, `asana_users_search`

Anthropic notes prefix-vs-suffix ordering has **non-trivial effects on eval performance** — test both empirically, don't assume.

### 1.3 Response format optimization

- Return **meaningful, natural-language context** over technical plumbing: `name`, `image_url`, `file_type` instead of raw `uuid`, `256px_image_url`, `mime_type`.
- Resolve opaque IDs to semantically meaningful language wherever possible — this "significantly improves Claude's precision."
- Expose a **`ResponseFormat` enum** (`"detailed"` vs `"concise"`) so the agent can trade completeness for tokens:
  - Concrete Slack-thread example: detailed = 206 tokens (includes `thread_ts`, `channel_id`, `user_id`); concise = 72 tokens (~⅓), excluding chaining IDs.
- No universal best serialization (JSON vs XML vs Markdown) — determine by evaluation per tool.

### 1.4 Token efficiency / context budgets

- Claude Code defaults to a **25,000-token cap per tool response**. Implement pagination, range selection, filtering, truncation with sensible defaults server-side, not left to the agent.
- On truncation, give explicit corrective instructions in the response itself, e.g. *"Try making many small targeted searches instead of one broad search."*

### 1.5 Error handling as steering

Turn opaque errors into actionable guidance: exact expected format, a worked example of a correct call, and a suggestion toward a more token-efficient query pattern — errors should actively steer the agent's *next* action, not just report failure.

### 1.6 Tool descriptions

- "Think of how you would describe your tool to a new hire."
- Make implicit domain knowledge explicit in the description.
- Disambiguate parameter names (`user_id` not `user`).
- "Even small refinements to tool descriptions can yield dramatic improvements" in eval scores.

### 1.7 Evaluation-driven design (the loop Anthropic actually recommends)

1. Prototype tools, test locally.
2. Write **multi-step, realistic eval tasks** (weak: single-action toy tasks; strong: "Schedule a meeting with Jane next week to discuss our latest Acme Corp project. Attach the notes from our last planning meeting and reserve a conference room.")
3. Run programmatic agentic-loop evals; collect accuracy, runtime, tool-call count, token consumption, error rate.
4. Use interleaved/chain-of-thought traces to see **why** the agent picked or skipped a tool.
5. Feed eval transcripts back into Claude Code to auto-propose tool/description fixes — Anthropic reports this **exceeded** their own hand-tuned "expert" implementations.

---

## 2. Code Execution with MCP — the Architectural Argument

**Source:** [Code execution with MCP: building more efficient AI agents](https://www.anthropic.com/engineering/code-execution-with-mcp) — Anthropic Engineering, published ~Nov 8, 2025 (per [Anthropic's own announcement tweet](https://x.com/AnthropicAI/status/1985846791842250860) and [MarkTechPost coverage](https://www.marktechpost.com/2025/11/08/anthropic-turns-mcp-agents-into-code-first-systems-with-code-execution-with-mcp-approach/)).

### 2.1 The two problems

- **Tool-definition bloat**: every connected MCP server's full tool schema loads into context up front. Connecting ~a dozen popular servers can burn **50,000–66,000 tokens before the agent even sees the user's question** (secondary sourcing: MarkTechPost / Medium coverage of the same post).
- **Intermediate-result bloat**: chained tool calls push every intermediate payload through the model twice (once out, once back in). Anthropic's worked example — pull a 2-hour meeting transcript from Drive, attach it to a Salesforce record — shows the transcript alone can cost **~50,000 tokens** if routed through the model.

### 2.2 The solution: present MCP servers as code, not direct calls

- MCP servers are exposed as a **filesystem of code files** (e.g. `servers/google-drive/getDocument.ts`), and the agent writes TypeScript to import and call them, running in a sandboxed code-execution environment.
- **Progressive disclosure**: "models are great at navigating filesystems" — a `search_tools`-style function with adjustable detail level lets the agent discover only what it needs, instead of ingesting every schema.
- **State persistence**: intermediate results can be written to files so long workflows can resume.
- **Privacy/containment**: results stay in the execution sandbox by default; nothing enters model context unless the agent explicitly surfaces it. The MCP client can auto-tokenize PII in that boundary.

### 2.3 Headline number

The Drive→Salesforce workflow went from **~150,000 tokens (direct tool calls) to ~2,000 tokens (code execution)** — a **98.7% reduction** (also reported by [MarkTechPost](https://www.marktechpost.com/2025/11/08/anthropic-turns-mcp-agents-into-code-first-systems-with-code-execution-with-mcp-approach/) and [Medium/Joe Njenga](https://medium.com/ai-software-engineer/anthropic-just-solved-ai-agent-bloat-150k-tokens-down-to-2k-code-execution-with-mcp-8266b8e80301)).

### 2.4 Explicit caveats (don't cargo-cult this)

Anthropic itself flags the cost side: running agent-generated code needs "a secure execution environment with appropriate sandboxing, resource limits, and monitoring" — real infra/security overhead that a pure tool-calling design avoids. This is a build-vs-buy tradeoff, not a free win.

---

## 3. Progressive Disclosure / Tool Search / Toolsets — the 2025–2026 Consensus Pattern

**Sources:** [Introducing advanced tool use on the Claude Developer Platform](https://www.anthropic.com/engineering/advanced-tool-use) (Anthropic Engineering); [Tool search tool — Claude Platform Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool); [MCP.Directory — MCP Context Bloat Fix 2026](https://mcp.directory/blog/mcp-context-bloat-fix-2026-tool-search-code-mode-progressive-disclosure); [Andreas van den Boogaard — Progressive Tool Discovery & The Evolution of MCP](https://atheo.dev/articles/Progressive-Tool-Discovery-&-The-Evolution-of-MCP).

### 3.1 The pattern

Progressive disclosure = **don't load tool definitions until the agent needs them.** Two concrete Anthropic implementations, both live in 2025–2026:

**A. Tool Search Tool** (Claude Developer Platform)
- Mark low-frequency tools `defer_loading: true`. Claude sees only the search tool + a small set of always-loaded critical tools at start.
- On demand, Claude searches; matched tools' full definitions expand into context.
- Numbers: **191,300 tokens preserved vs 122,800 with the traditional approach (~85% reduction)**; separately reported as 77K→8.7K tokens before any work begins (~95% context preserved) in some framings — consistent order of magnitude, different baselines.
- **Accuracy gains on MCP evals**: Opus 4 **49%→74%**; Opus 4.5 **79.5%→88.1%**.
- Recommended threshold: use when tool definitions exceed **~10K tokens**, or with multiple MCP servers, or when tool-selection accuracy is degrading.

**B. Programmatic Tool Calling** (code-orchestrated tool calls, same blog)
- Claude writes code to orchestrate multiple/parallel tool calls in one pass; intermediate data is filtered before re-entering context.
- Token usage: **43,588 → 27,297 tokens (37% reduction)** on complex research tasks.
- Accuracy: internal knowledge retrieval 25.6%→28.5%; GIA benchmark 46.5%→51.2%.
- Best for: 3+ dependent calls, large-dataset aggregation, fan-out across many items.

**C. Tool Use Examples** (same blog)
- Concrete example payloads in the tool spec (beyond JSON Schema) teach date formats, ID conventions, nested-structure and optional-parameter correlation patterns.
- Accuracy: **72%→90%** on complex parameter handling.

### 3.2 Toolsets-as-config pattern (industry convergence, not just Anthropic)

- **GitHub MCP server** ([server-configuration docs](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md), [toolsets DeepWiki](https://deepwiki.com/github/github-mcp-server/3-github-toolsets)): 162+ tools, opt-in **toolsets** (`repos`, `issues`, `pull_requests`, `actions`, `code_security`, `experiments`, …), a **read-only mode** that hard-filters out all write tools regardless of what's requested (security precedence), a **dynamic toolsets (beta)** mode where the host discovers/enables toolsets at runtime instead of loading everything up front, and mixed pagination (page/per-page with a max of 100, cursor-based for some sub-resources like discussion comments).
- **Anthropic's own guidance in the advanced-tool-use writeup**: same idea — disable unused toolsets to reclaim most of an 18K-token GitHub-server tax if you only need `issues`.

### 3.3 Community/derivative framing worth citing

- [MCP.Directory: "MCP Context Bloat Fix 2026" (Tool Search, Code Mode, Progressive Disclosure)](https://mcp.directory/blog/mcp-context-bloat-fix-2026-tool-search-code-mode-progressive-disclosure) treats progressive disclosure as the *umbrella* pattern under which both Tool Search and Code Mode/code-execution sit — useful framing for a design doc.
- [Matthew Kruczek — "Progressive Disclosure MCP: 85x Token Savings Benchmark"](https://matthewkruczek.ai/blog/progressive-disclosure-mcp-servers.html) — independent benchmark corroborating order-of-magnitude gains.

---

## 4. MCP Spec Capabilities Worth Exploiting

**Primary sources:** [MCP spec changelog history via github.com/modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol/releases); [2025-06-18 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx); [ForgeCode — MCP 2025-06-18 Spec Update](https://forgecode.dev/blog/mcp-spec-updates/); [modelcontextprotocol.info specification overview](https://modelcontextprotocol.info/specification/); [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog); [MCP Blog — 2026-07-28 Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/).

### 4.1 Spec revision timeline (relevant to what a "current" server should support)

| Revision | Key additions |
|---|---|
| 2024-11-05 | Original spec (stdio, basic HTTP+SSE) |
| 2025-03-26 | Mature auth/transport model, Streamable HTTP replacing HTTP+SSE, tool metadata maturation |
| **2025-06-18** | **Elicitation** (server can request structured input from user mid-session), **structured tool output** (`structuredContent`), resource links in tool-call results, mandatory `MCP-Protocol-Version` header on subsequent HTTP requests, OAuth Resource-Server classification (RFC 8707 `resource` parameter binds tokens to a specific server) |
| 2025-11-25 | OpenID Connect Discovery 1.0 for auth-server discovery, icons metadata on tools/resources, **experimental "tasks"** for durable/long-running requests with polling + deferred result retrieval |
| 2026-07-28 (RC, in flight as of research date) | Release candidate — track for what lands next; see [MCP Blog RC post](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/) |

### 4.2 The three first-class context types

Tool (executable action), Resource (read-only, addressable data), Prompt (reusable template) — each with standardized list/get/call semantics ([modelcontextprotocol.info spec overview](https://modelcontextprotocol.info/specification/)).

### 4.3 Capability-by-capability, with the adoption caveat that matters for design

| Capability | What it does | Practical 2025–2026 status |
|---|---|---|
| **Resources** | Read-only addressable data the *user/host* chooses to attach, not model-invoked like tools | **Adoption gap**: "Every serious MCP client supports tools, but far fewer support the broader set cleanly" — resources/prompts/roots support varies a lot across hosts ([WorkOS "Everything your team needs to know about MCP in 2026"](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026), general 2026 ecosystem-status reporting). **Design implication: don't put load-bearing functionality behind Resources alone — tools are the safe universal surface; treat resources as a bonus channel.** |
| **Prompts** | Reusable prompt templates the host can surface (e.g. slash-command-like) | Same adoption gap as resources — nice-to-have, not core |
| **Elicitation** (2025-06-18+) | Server sends `elicitation/create` with a message + JSON schema to pull structured input from the user mid-call | Real pattern for confirmations/clarifications — e.g. "confirm deleting this page," "which space did you mean." Note: the confirmation itself is *not* the tool result — the actual tool result still arrives later via the original promise ([DZone](https://dzone.com/articles/mcp-elicitation-human-in-the-loop-for-mcp-servers), [Glama blog](https://glama.ai/blog/2025-09-03-elicitation-in-mcp-bridging-the-human-ai-gap)) |
| **Sampling** | Server asks the *client's* model to complete a sub-task (`createMessage`), without ever seeing the client's API key | Useful for servers wanting to do LLM-assisted work (e.g. summarizing a huge page before returning it) without owning their own model/API key |
| **Structured tool output (`structuredContent`)** | Typed JSON output alongside/instead of prose text | Directly reduces agent-side parsing errors vs the older "stringified JSON inside a text block" anti-pattern (see §6, Linear case study) |
| **Progress notifications** | Streaming/subscription updates during long-running calls | Pairs with 2025-11-25's experimental **tasks** primitive for durable/long ops with polling — relevant to e.g. bulk reindex or long ingest jobs on a wiki server |
| **Annotations (tool hints)** | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` metadata on each tool | Forms a **risk vocabulary** clients/governance layers use to gate approval — see [MCP Blog: "Tool Annotations as Risk Vocabulary"](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) and [Stacklok's writeup](https://stacklok.com/blog/tool-annotations-are-becoming-the-risk-vocabulary-for-agentic-systems-that-matters-more-than-it-might-seem/). **Defaults are pessimistic**: an unannotated tool is assumed destructive, non-idempotent, and open-world. Explicitly annotating read tools `readOnlyHint: true` unlocks lower-friction client UX (no confirm dialog) — a wiki MCP with a large read surface should annotate aggressively. Spec explicitly warns these are **hints, not guarantees** — a client must not blindly trust annotations from an untrusted server. |

---

## 5. How Exemplar Servers Actually Do It

### 5.1 GitHub MCP server
**Sources:** [github/github-mcp-server](https://github.com/github/github-mcp-server), [server-configuration docs](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md), [GitHub Changelog Dec 10 2025](https://github.blog/changelog/2025-12-10-the-github-mcp-server-adds-support-for-tool-specific-configuration-and-more/), [DeepWiki toolsets breakdown](https://deepwiki.com/github/github-mcp-server/3-github-toolsets).

- 162+ tools total, but never all loaded by default — **opt-in toolsets** (`repos`, `issues`, `pull_requests`, `actions`, `code_security`, `experiments`, etc.).
- **Read-only mode is a hard security filter** with precedence over any other config — disables every write tool even if explicitly requested elsewhent.
- **Dynamic toolsets (beta)**: runtime discovery/enable of toolsets in response to the conversation, rather than fixed at session start — explicitly aimed at avoiding "models get confused by the sheer number of tools available."
- Pagination: page/per-page (max 100) for most list tools; cursor-based for select sub-resources.
- Governance issue tracked live: [Feedback for dynamic tool selection #275](https://github.com/github/github-mcp-server/issues/275) — the community is actively iterating on this exact "too many tools" problem in the open.

### 5.2 Notion MCP server
**Sources:** [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server), [Notion's hosted MCP server: an inside look](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look), community forks [easy-notion-mcp](https://github.com/Grey-Iris/easy-notion-mcp), [nooon](https://zenn.dev/khasegawa/articles/3cc385185d763f?locale=en).

- **The single most important design decision for a wiki-shaped MCP**: page content is returned as **enhanced/Notion-flavored Markdown**, not raw block JSON — because Markdown has vastly better token density for LLM consumption than nested per-block metadata JSON.
- `retrieve-page-markdown`-style tool: full page content as one Markdown blob, not N block-fetch round trips.
- Main `search` tool supports **semantic** search (question-style queries), and reaches across 10+ connected third-party apps, not just the native workspace.
- **Direct evidence that raw block JSON is a real anti-pattern**: community fork `easy-notion-mcp` claims **~6–7× fewer response tokens** than the official server precisely by dropping per-block JSON metadata an agent reading for content never needs. Another fork, `nooon`, collapses recursive block-fetching into a **single tool call** that internally walks the tree — saving both tokens *and* round trips (fewer inference passes).
- **Direct precedent for Orvex Wiki**: this is exactly the docmost-fork situation — a block/PM-JSON-native wiki engine where the MCP layer must NOT expose that structure raw; it must synthesize clean Markdown as the default read shape.

### 5.3 Linear MCP server
**Source:** [Fiberplane — "The Linear Team Made a Good MCP"](https://blog.fiberplane.com/blog/mcp-server-analysis-linear/) (independent deep-dive analysis).

- **23 tools**, organized by function: querying (`list_issues`, `list_projects`, `list_teams`, `list_users`, `list_documents`, `list_cycles`, `list_comments`, `list_issue_labels`, `list_issue_statuses`, `list_project_labels`), detail retrieval (`get_issue`, `get_project`, `get_team`, `get_user`, `get_document`, `get_issue_status`), creation (`create_issue`, `create_project`, `create_comment`, `create_issue_label`), modification (`update_issue`, `update_project`), and one dedicated `search_documentation`.
- Explicitly **not** a mechanical GraphQL mirror — nested GraphQL filter objects are flattened (e.g. `assigneeId` instead of a nested filter structure) to cut agent cognitive overhead.
- **Value mapping is inlined in the description** (priority 0=No priority … 4=Low) so the agent never needs an external lookup.
- **Two concrete anti-patterns caught by the analysis, worth avoiding in Orvex's MCP:**
  1. Low-signal noise fields returned by default (`avatarUrl`, timestamps) when the agent only needed core identifiers.
  2. **Stringified JSON inside text fields** — data escaped as a JSON string within a text block (`\"id\":\"123\"`) forces the model to parse quote-escaped characters instead of reading structured/native output. The analysis cites research that flatter formats (CSV/TSV) are token-cheaper than nested JSON for this kind of tabular data.
- Error-message quality is uneven: invalid-cursor errors are actionable ("before is not a valid pagination cursor identifier"), but not-found vs invalid-argument aren't always distinguished — a concrete "do better than this" example.
- **Context tax is measured and citable**: adding Linear's MCP server raises baseline token usage from 61k→78k tokens; tool *definitions alone* cost 17.3k tokens. Direct proof that "tool definitions are not free," even before any tool is called.

### 5.4 Sentry MCP server
**Sources:** [getsentry/sentry-mcp](https://github.com/getsentry/sentry-mcp), [Sentry Blog — "Yes, Sentry has an MCP Server (...and it's pretty good)"](https://blog.sentry.io/yes-sentry-has-an-mcp-server-and-its-pretty-good/), [mcp.sentry.dev](https://mcp.sentry.dev/).

- Deliberately small surface: **16 tool calls (including prompts)**, covering project info, issues, project/DSN discovery, plus a call into Sentry's own AI agent ("Seer") to generate root-cause analyses and fixes — i.e. it **delegates heavy reasoning to a backend AI service** rather than dumping raw data on the calling agent.
- `search_events` / `search_issues` are themselves **LLM-backed translators** (require an LLM provider — OpenAI/Azure OpenAI/Anthropic/OpenRouter) that turn natural language into Sentry's native query syntax server-side — pushing query-language complexity off the calling agent.
- Released ~March 2025, and reportedly exceeded **30M requests/month** shortly after launch — evidence a small, well-targeted surface scales in real usage.

### 5.5 Context7 MCP server
**Sources:** [upstash/context7](https://github.com/upstash/context7), [context7mcp.com](https://context7mcp.com/), [a2a-mcp.org explainer](https://a2a-mcp.org/blog/what-is-context7-mcp).

- Exactly **two tools**: `resolve-library-id` (name → canonical library ID) and `get-library-docs` (ID [+ topic filter, + token budget] → ranked Markdown+snippets).
- **This two-step resolve→fetch shape is the direct template for "outline-first" reads**: don't return full docs on a fuzzy name match; force a disambiguation/resolution step, then let the caller bound the fetch by topic and token budget.
- Explicit **version-specific filtering** (Next.js 14 vs 15) prevents stale/mismatched doc injection — a direct analog to "don't return a stale/superseded wiki page version."
- Proprietary ranking+filtering surfaces only the most relevant snippets, explicitly to minimize tokens while maximizing relevance — snippets-not-bodies as the literal product.

### 5.6 Cloudflare MCP servers
**Sources:** [Cloudflare Agents docs — Build a Remote MCP server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/), [Cloudflare Blog — Scaling MCP adoption: reference architecture for enterprise MCP](https://blog.cloudflare.com/enterprise-mcp/), [Cloudflare Agents docs — MCP governance](https://developers.cloudflare.com/agents/model-context-protocol/governance/).

- Explicit anti-pattern warning in their own docs: **"Don't treat your MCP server as a wrapper around your full API schema."** Optimize each tool for a specific job-to-be-done and outcome reliability — one tool may map to many API calls, or vice versa.
- "Fewer but more powerful tools may be better for agents with smaller context windows, less cost, faster output, and likely more valid answers."
- **Security-by-decomposition**: deploy several narrowly-scoped MCP servers rather than one broad one, so each server's permission surface is auditable and minimal — directly relevant to Orvex's three-surface split (wiki-api / MCP / CLI) each getting least-privilege scope.
- Mandate **idempotency** on mutating tools specifically because agents/clients retry on network failure — a retried write must not double-apply.
- Mandate an **eval suite** run on every server/description change to catch regressions, mirroring Anthropic's own eval-loop guidance in §1.7.

---

## 6. Common Failure Modes (named across sources)

| Failure mode | What it looks like | Source |
|---|---|---|
| **API-mirror anti-pattern** | One tool per REST/GraphQL endpoint; agent has to know your internal API surface to be effective. "The most powerful tool layers aren't the ones that expose every endpoint; they're the ones agents can predict without reading the docs." | [Cloudflare](https://blog.cloudflare.com/enterprise-mcp/), synthesis piece on [mapping APIs to MCP tools](https://www.scalekit.com/blog/map-api-into-mcp-tool-definitions) |
| **Over-tooling / context bloat** | Every connected server adds 5–15 tool defs consumed even when unused — "paying for tools you're not using." Claude Code in particular has **no hot-reload**: MCP servers are picked at session start and fixed for the whole session, so over-provisioning a session with unused servers is a standing tax. | [Medium — "Your MCP Servers Are Eating Your Context"](https://medium.com/@lakshminp/your-mcp-servers-are-eating-your-context-549c472beaf2) |
| **List-not-search tools** | `list_x` tools return unbounded/large collections instead of a targeted `search_x` — directly named by Anthropic as a pattern to avoid | [Anthropic writing-tools-for-agents](https://www.anthropic.com/engineering/writing-tools-for-agents) |
| **Stringified-JSON-in-text output** | Nested JSON escaped inside a text content block instead of using `structuredContent` — forces the model to parse quote-escaped strings | Linear case study, [Fiberplane](https://blog.fiberplane.com/blog/mcp-server-analysis-linear/) |
| **Unbounded reads (perf + security)** | A tool like `web_url_read` with no size cap lets a caller force allocation proportional to an arbitrarily large response body — a real disclosed vulnerability class, not hypothetical | [GHSA-xcqx-9jf5-w339 — SearXNG MCP unbounded response read](https://github.com/advisories/GHSA-xcqx-9jf5-w339) |
| **Approval-fatigue / elicitation misuse** | Human-in-the-loop confirmation dialogs get rubber-stamped when they lack context, or can be socially engineered — HITL is not a free safety net | Security/safety survey coverage, e.g. [arXiv 2512.08290 SoK: Security and Safety in the MCP Ecosystem](https://arxiv.org/pdf/2512.08290) |
| **Resources/prompts as load-bearing** | Building critical functionality behind Resources or Prompts primitives when most hosts only reliably support Tools | Ecosystem status per [WorkOS 2026 MCP overview](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026) |
| **Untrusted annotation trust** | Treating `readOnlyHint`/`destructiveHint` as guarantees from a server you don't control, instead of hints | [MCP Blog — Tool Annotations as Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) |

---

## 7. Ranked Design Principles a Flagship Wiki MCP Must Satisfy

Ranked by leverage — highest-impact / most load-bearing first, synthesized from all sources above:

1. **Verb-oriented, not endpoint-oriented, tool surface.** Design around agent *intents* ("find the canonical page for X," "propose an edit," "resolve a duplicate cluster") not a mirror of wiki-api's REST routes. This is the single most repeated principle across Anthropic, Cloudflare, and the Linear/GitHub case studies — and matches Orvex's own program framing (orvex-studio-mcp is already named "intent-verb").

2. **Markdown/snippet-first reads, never raw block/PM-JSON.** The Notion precedent is a near-exact analog to docmost's block-tree/ProseMirror-JSON internals: default `get_page`-style output must be clean Markdown, with structured metadata (title, space slug, slug_id, status) as `structuredContent`, not nested JSON escaped into a text blob (Linear's documented anti-pattern).

3. **Search over list, everywhere.** Any `list_*` capability must default to bounded, relevance-ranked, targeted retrieval — full unfiltered collection dumps are explicitly called out by Anthropic as a pattern to avoid.

4. **Resolve-then-fetch (Context7 pattern) for ambiguous names.** A two-step `resolve_page`/`search` → `get_page` shape (with a topic/section filter and token budget on the fetch) prevents fuzzy-match fetches from ever returning a wrong or oversized page, and is a natural fit for a wiki's title/slug ambiguity problem.

5. **Progressive disclosure at the tool-catalog level.** With a 19-tool surface today and a fresh redesign in flight, plan explicitly for `defer_loading`/Tool-Search-Tool style deferral (or GitHub-style opt-in toolsets) once the surface grows past Anthropic's own ~10K-token tool-definition threshold — don't wait until it's already a measured tax the way Linear's 17.3K-token definition cost became.

6. **Response-verbosity control (concise/detailed) on every read tool**, following Anthropic's `ResponseFormat` pattern — cheap to add, directly cuts token cost 2-3x on the common case per their own Slack-thread measurement.

7. **Bound every read.** Page-size caps, snippet windows, pagination with explicit cursor/limit params on every list/search tool — closes both the token-bloat failure mode and the unbounded-read security failure mode (SearXNG CVE-class) in one move.

8. **Annotate every tool with MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).** Given the spec's pessimistic default (unannotated = assumed destructive/non-idempotent/open-world), a wiki server with a large read-heavy surface should annotate reads `readOnlyHint: true` aggressively to avoid needless client-side confirmation friction, while writes get explicit, honest destructive/idempotent hints — this is free governance leverage already standardized in the spec.

9. **Idempotent writes + elicitation-gated destructive actions.** Every mutating tool (page delete, space archive, supersede) must be safe to retry (Cloudflare's explicit mandate), and genuinely destructive/ambiguous writes should use MCP **elicitation** for an explicit confirm-with-context step rather than either silently executing or relying on client-side approval dialogs alone (which are known to suffer approval fatigue).

10. **Structured tool output (`structuredContent`) as the default, prose as a bonus.** Adopt 2025-06-18's structured-output capability everywhere instead of the stringified-JSON-in-text anti-pattern documented in Linear's server — cuts parsing errors and tokens simultaneously.

11. **Treat code-execution-with-MCP as the target architecture for heavy compositional workflows** (e.g. "ingest and cross-link 80 pages," "bulk supersede a duplicate cluster") even if not implemented on day one — the 150K→2K token precedent is the ceiling case for exactly the kind of bulk wiki operations Orvex's own P1 Definition Factory and doc-consolidate workflows already do by hand today. Budget the sandboxing/security overhead honestly (Anthropic's own caveat) rather than skipping it.

12. **Least-privilege, decomposed server boundaries.** Cloudflare's "several focused servers over one broad one" argument matches Orvex's existing three-surface split (wiki-api / MCP / CLI) — resist the temptation to let the MCP server become a superset god-object that also does auth, Linear, and infra; keep its permission surface scoped to wiki/KB capabilities only, consistent with the family's own no-fallbacks/no-legacy-shortcuts posture.

13. **Don't build load-bearing functionality on Resources/Prompts alone.** Given the 2025–2026 client-support gap, every critical capability must be reachable via a Tool call; Resources/Prompts/Sampling can enrich the experience for hosts that support them, but never become the only path.

14. **Evaluation is not optional — it's the design method.** Every tool/description change should run through Anthropic's and Cloudflare's shared eval-loop pattern (realistic multi-step tasks → agentic-loop run → accuracy/tokens/tool-calls/error-rate metrics → iterate) before it ships, not just before the initial design.

---

## Full Source List

- Anthropic — [Writing effective tools for AI agents—using AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- Anthropic — [Code execution with MCP: building more efficient AI agents](https://www.anthropic.com/engineering/code-execution-with-mcp) (~Nov 8, 2025)
- Anthropic — [Introducing advanced tool use on the Claude Developer Platform](https://www.anthropic.com/engineering/advanced-tool-use)
- Anthropic (X/Twitter) — [announcement of code-execution-with-MCP post](https://x.com/AnthropicAI/status/1985846791842250860)
- Claude Platform Docs — [Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- MarkTechPost — [Anthropic Turns MCP Agents Into Code First Systems](https://www.marktechpost.com/2025/11/08/anthropic-turns-mcp-agents-into-code-first-systems-with-code-execution-with-mcp-approach/) (Nov 8, 2025)
- Medium/Joe Njenga — [Anthropic Just Solved AI Agent Bloat — 150K Tokens Down to 2K](https://medium.com/ai-software-engineer/anthropic-just-solved-ai-agent-bloat-150k-tokens-down-to-2k-code-execution-with-mcp-8266b8e80301)
- Mbgsec (Michael Bargury) — [Code execution with MCP writeup](https://www.mbgsec.com/weblog/2025-11-08-code-execution-with-mcp-building-more-efficient-ai-agents-anthropic/)
- Medium/Shamsul Arefin — [Dramatically Reducing AI Agent Token Usage with MCP Code Execution](https://medium.com/@shamsul.arefin/building-an-ai-agent-with-mcp-code-execution-from-confusion-to-clarity-6b13fccc8c4b)
- MCP.Directory — [MCP Context Bloat Fix 2026 (Tool Search, Code Mode, Progressive Disclosure)](https://mcp.directory/blog/mcp-context-bloat-fix-2026-tool-search-code-mode-progressive-disclosure)
- Synaptic Labs — [The Meta-Tool Pattern: Progressive Disclosure for MCP](https://blog.synapticlabs.ai/bounded-context-packs-meta-tool-pattern)
- Matthew Kruczek — [Progressive Disclosure MCP: 85x Token Savings Benchmark](https://matthewkruczek.ai/blog/progressive-disclosure-mcp-servers.html)
- Andreas van den Boogaard — [Progressive Tool Discovery & The Evolution of MCP](https://atheo.dev/articles/Progressive-Tool-Discovery-&-The-Evolution-of-MCP)
- Model Context Protocol — [Specification overview (modelcontextprotocol.info)](https://modelcontextprotocol.info/specification/)
- ForgeCode — [MCP 2025-06-18 Spec Update: AI Security, Structured Output, and User Elicitation](https://forgecode.dev/blog/mcp-spec-updates/)
- modelcontextprotocol/modelcontextprotocol — [GitHub Releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases)
- modelcontextprotocol/modelcontextprotocol — [2025-06-18 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx)
- MCP spec — [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- MCP Blog — [The 2026-07-28 MCP Specification Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- GitHub — [github/github-mcp-server](https://github.com/github/github-mcp-server)
- GitHub — [github-mcp-server server-configuration.md](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md)
- GitHub Changelog — [GitHub MCP Server adds tool-specific configuration](https://github.blog/changelog/2025-12-10-the-github-mcp-server-adds-support-for-tool-specific-configuration-and-more/) (Dec 10, 2025)
- GitHub Docs — [Configuring toolsets for the GitHub MCP Server](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/configure-toolsets)
- DeepWiki — [github-mcp-server: GitHub Toolsets](https://deepwiki.com/github/github-mcp-server/3-github-toolsets) / [Additional Toolsets](https://deepwiki.com/github/github-mcp-server/3.8-additional-toolsets)
- GitHub Issue — [Feedback for dynamic tool selection #275](https://github.com/github/github-mcp-server/issues/275)
- GitHub Blog — [A practical guide on how to use the GitHub MCP server](https://github.blog/ai-and-ml/generative-ai/a-practical-guide-on-how-to-use-the-github-mcp-server/)
- Notion — [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server)
- Notion Blog — [Notion's hosted MCP server: an inside look](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look)
- Zenn/khasegawa — [nooon: A Notion MCP Server Designed for Maximum Token Efficiency](https://zenn.dev/khasegawa/articles/3cc385185d763f?locale=en)
- GitHub — [Grey-Iris/easy-notion-mcp](https://github.com/Grey-Iris/easy-notion-mcp) (~6–7× token reduction vs official server)
- Fiberplane Blog — [The Linear Team Made a Good MCP](https://blog.fiberplane.com/blog/mcp-server-analysis-linear/)
- Pragmatic Engineer — [Building MCP servers in the real world](https://newsletter.pragmaticengineer.com/p/mcp-deepdive)
- GitHub — [getsentry/sentry-mcp](https://github.com/getsentry/sentry-mcp)
- Sentry Blog — [Yes, Sentry has an MCP Server (...and it's pretty good)](https://blog.sentry.io/yes-sentry-has-an-mcp-server-and-its-pretty-good/)
- Sentry — [mcp.sentry.dev](https://mcp.sentry.dev/)
- GitHub — [upstash/context7](https://github.com/upstash/context7)
- Context7 — [context7mcp.com](https://context7mcp.com/)
- a2a-mcp.org — [Context7 Explained: Up-to-Date Docs for LLMs & AI Code Editors](https://a2a-mcp.org/blog/what-is-context7-mcp)
- Cloudflare Agents Docs — [Build a Remote MCP server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- Cloudflare Blog — [Scaling MCP adoption: reference architecture for enterprise MCP](https://blog.cloudflare.com/enterprise-mcp/)
- Cloudflare Agents Docs — [MCP governance](https://developers.cloudflare.com/agents/model-context-protocol/governance/)
- Cloudflare Blog — [Build and deploy Remote MCP servers to Cloudflare](https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/)
- Stacklok — [Tool annotations are becoming the risk vocabulary for agentic systems](https://stacklok.com/blog/tool-annotations-are-becoming-the-risk-vocabulary-for-agentic-systems-that-matters-more-than-it-might-seem/)
- MCP Blog — [Tool Annotations as Risk Vocabulary: What Hints Can and Can't Do](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) (Mar 16, 2026)
- MCPBlog.dev — [MCP Tool Annotations: What They Are, Why They Matter, and What's Coming Next](https://mcpblog.dev/blog/2026-03-13-mcp-tool-annotations) (Mar 13, 2026)
- Medium/Lakshmi Narasimhan — [Your MCP Servers Are Eating Your Context](https://medium.com/@lakshminp/your-mcp-servers-are-eating-your-context-549c472beaf2)
- ScaleKit — [How to map an existing API into MCP tool definitions](https://www.scalekit.com/blog/map-api-into-mcp-tool-definitions)
- GitHub Advisory — [GHSA-xcqx-9jf5-w339: SearXNG MCP unbounded response body read](https://github.com/advisories/GHSA-xcqx-9jf5-w339)
- DZone — [MCP Elicitation: Human-in-the-Loop for MCP Servers](https://dzone.com/articles/mcp-elicitation-human-in-the-loop-for-mcp-servers)
- Glama Blog — [Enabling Human-in-the-Loop Workflows with MCP Elicitation](https://glama.ai/blog/2025-09-03-elicitation-in-mcp-bridging-the-human-ai-gap) (Sep 3, 2025)
- arXiv 2512.08290 — [Systematization of Knowledge: Security and Safety in the Model Context Protocol Ecosystem](https://arxiv.org/pdf/2512.08290)
- arXiv 2603.18063 — [MCP-38: A Comprehensive Threat Taxonomy for Model Context Protocol Systems v1.0](https://arxiv.org/pdf/2603.18063)
- WorkOS Blog — [Everything your team needs to know about MCP in 2026](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)
- Medium/Laurent Kubaski — [MCP Resources explained (and how they differ from MCP Tools)](https://medium.com/@laurentkubaski/mcp-resources-explained-and-how-they-differ-from-mcp-tools-096f9d15f767)
