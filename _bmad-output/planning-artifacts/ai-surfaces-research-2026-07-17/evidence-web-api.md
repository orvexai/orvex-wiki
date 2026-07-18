# Evidence: 2025–2026 State of the Art — Designing HTTP APIs for AI-Agent Consumption

**Mapper scope**: web research only (WebSearch/WebFetch). Feeds the orvex-wiki-api / orvex-studio-mcp / orvex-cli AI-first redesign track.
**Compiled**: 2026-07-17.

---

## 1. Framing: "Agent Experience" (AX) is now a named discipline

- **Term coined**: Matt (Mathias) Biilmann, CEO of Netlify, coined **"Agent Experience (AX)"** in early 2025 — deliberately "Agent Experience" not "Agentic Experience," by analogy to UX/DX ("we say User Experience and Developer Experience, not 'Useric' or 'Developerish'").
  Source: [Netlify — Agent Experience](https://www.netlify.com/agent-experience/), [Nordic APIs — What Is Agent Experience (AX)?](https://nordicapis.com/what-is-agent-experience-ax/)
- **Definition** (Nordic APIs, 2025–2026): AX is "the holistic experience AI agents have as users of a product or platform: how well they can discover what your service does, call it reliably, and recover when something goes wrong." AX supplements, does not replace, human-facing DX/UX — most successful APIs now serve **both** audiences from the same surface.
- **Why it matters now**: Gartner is cited (via Nordic APIs) projecting 33% of enterprise applications will include agentic AI by 2028, with agents making 15% of day-to-day work decisions autonomously. Biilmann's 2026 prediction: AX becomes a mainstream concern beyond dev-tools, alongside a growing "Agent Skills" ecosystem.
  Source: [Nordic APIs, "What Is Agent Experience (AX)?"](https://nordicapis.com/what-is-agent-experience-ax/)
- **Framing quote** (Fern, Mar 2026): "In 2026, a growing share of API traffic isn't from humans at all — it's from AI agents reading your OpenAPI spec at runtime, making probabilistic decisions about which tools to call, retrying on partial failures, and chaining calls across services they discovered seconds ago. An API has good AX when an LLM that has never seen it before can call the right tool, with the right arguments, on the first try, recover from errors without human help, and chain to the next tool without prompting."
  Source: [Fern — API design best practices guide (March 2026)](https://buildwithfern.com/post/api-design-best-practices-guide)

**Takeaway for orvex-wiki-api**: AX is now a distinct, named review lens (parallel to DX) — the three surfaces under review (wiki-api, MCP, CLI) should each get an explicit AX pass, not just a REST-conventions pass.

---

## 2. Agent-consumable REST patterns

| Pattern | What state-of-the-art says | Source |
|---|---|---|
| **Consistency over cleverness** | "Agents learn from patterns" — uniform naming, standard HTTP verbs, predictable pagination across *every* endpoint lets an agent generalize instead of special-casing each route. | [Stainless, 23 Mar 2026](https://www.stainless.com/blog/steps-toward-great-agent-experience-every-api-provider-can-take-today) |
| **Workflow context, not just endpoint docs** | Docs must say "when to call, what it does, and what follows" — sequencing constraints (e.g. "billing address must be set before cart validation") belong in the spec, not buried in a tutorial. | [Speakeasy — Designing agent experience](https://www.speakeasy.com/blog/agent-experience-introduction) |
| **Explicit business-rule constraints** | Agents can't infer business logic from vibes. State exact preconditions in machine-readable form: "only proceed if order status is `delivered`," not "when appropriate." | [Speakeasy — Designing agent experience](https://www.speakeasy.com/blog/agent-experience-introduction) |
| **Scoped tool surfaces ("toolability")** | Don't expose the full 300-endpoint API to every agent; expose a scoped, role-appropriate subset (mirrors Stripe's restricted-key pattern below). | [Speakeasy — Designing agent experience](https://www.speakeasy.com/blog/agent-experience-introduction) |
| **Agent-attribution headers** | Custom headers like `X-Agent-Request: true` / `X-Agent-Name` let logs/audit trails separate agent actions from human ones — important for a wiki where both humans and agents write pages. | [Speakeasy — Designing agent experience](https://www.speakeasy.com/blog/agent-experience-introduction) |
| **Prefer targeted, small calls over one broad call** | Anthropic's own tool-design guidance: encourage "many small and targeted searches instead of a single, broad search" — favors cursor-paginated, filterable list endpoints over "return everything." | [Anthropic Engineering, 11 Sep 2025 — Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) |
| **Typed SDKs beat raw HTTP** | Idiomatic, typed SDKs give models stronger signal about expected params/response shape than raw HTTP calls, measurably reducing agent error rates. | [Stainless, 23 Mar 2026](https://www.stainless.com/blog/steps-toward-great-agent-experience-every-api-provider-can-take-today) |
| **Restricted / scoped auth per agent** | Stripe issues restricted API keys scoped to exactly the operations an agent needs (e.g. a refund-only agent gets a refund-only key) rather than a god-key. | [MindStudio — Lessons from Stripe, Google, Anthropic](https://www.mindstudio.ai/blog/how-to-build-agent-first-product-design-principles) |

---

## 3. Machine-readable errors: RFC 9457 (`application/problem+json`) and self-healing messages

### 3.1 RFC 9457 — Problem Details for HTTP APIs
- **Status**: IETF standard, published **July 2023**, authored by M. Nottingham, E. Wilde, S. Dalal. **Obsoletes RFC 7807** (2016).
  Source: [RFC 9457 — datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc9457), [RFC Editor info page](https://www.rfc-editor.org/info/rfc9457/)
- **Media type**: `application/problem+json` (an XML sibling `application/problem+xml` also defined, Appendix B).
- **Five core fields**:
  | Field | Meaning |
  |---|---|
  | `type` | URI identifying the problem *category*; defaults to `"about:blank"` if absent |
  | `status` | HTTP status code as an integer — "advisory only" but generator MUST match the actual response status |
  | `title` | Short, human-readable summary; should stay stable/non-localized-per-occurrence unless explicitly localized |
  | `detail` | Occurrence-specific explanation — intended to help the **client fix the problem**, not for developer debugging/tracebacks |
  | `instance` | URI referencing this specific occurrence, optionally dereferenceable for more detail |
- **Extensibility**: problem types may add custom members beyond the five; "clients consuming problem details MUST ignore any such extensions that they don't recognize" — this is the exact mechanism to hang agent-specific remediation hints off of (e.g. a `retry_after`, `suggested_fix`, or `valid_values` extension member) without breaking spec compliance.
- **Guidance**: `type` URIs should resolve to HTML documentation of the error; avoid leaking implementation details (stack traces, SQL) via `detail`; batch/multi-error scenarios should still report the single most relevant problem type rather than inventing a bespoke batch-error format.
  Source: [RFC 9457 full text](https://datatracker.ietf.org/doc/html/rfc9457)
- **Adoption**: widely adopted by Spring Boot 6+, ASP.NET Core 7+, referenced directly from OpenAPI 3.x tooling.
  Source: [Jsonic — JSON API Error Handling: RFC 9457](https://jsonic.io/guides/json-api-error-handling)

### 3.2 Self-healing / actionable error messages (agent-specific layer on top of RFC 9457)
- **Anthropic's framing** (11 Sep 2025, "Writing effective tools for AI agents"): prompt-engineer error responses to be **actionable, not opaque**. Replace tracebacks with messages that "clearly communicate specific and actionable improvements" and show an example of a correctly formatted input. This lets the calling agent **self-correct without a human in the loop** — Anthropic explicitly calls this pattern letting Claude act as a "self-healing agent."
  Source: [Anthropic Engineering — Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- **Claude tool-use runtime mechanics**: when a tool call fails, set `"is_error": true` in the `tool_result` block with an informative message; by default this is passed back into the model's context, and Claude will typically acknowledge the error and either retry differently or ask for clarification — i.e. the *transport* for self-healing is "structured error object returned into the same context," not a side channel.
  Source: [Claude Platform Docs — Implement tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- **Stainless's concrete example** (23 Mar 2026): swap generic `400 Bad Request` for `"amount must be a positive integer in cents"` — the difference between an agent self-correcting in one round-trip vs. entering a debugging loop.
  Source: [Stainless, 23 Mar 2026](https://www.stainless.com/blog/steps-toward-great-agent-experience-every-api-provider-can-take-today)
- **digitalapi.ai's 2026 checklist** for error bodies: structured JSON with `error_code`, `message`, `type`, and `hint` fields, consistent HTTP status codes, and `Retry-After` on 429s.
  Source: [digitalapi.ai — How to Make Your APIs Ready for AI Agents (2026)](https://www.digitalapi.ai/blogs/how-to-make-your-apis-ready-for-ai-agents)
- **Speakeasy's fallback-instruction pattern**: don't just return a code — prescribe the next action in the spec itself, e.g. "If refund fails (403 or 500), respond with…" so the agent has a scripted recovery path rather than failing silently.
  Source: [Speakeasy — Designing agent experience](https://www.speakeasy.com/blog/agent-experience-introduction)

**Synthesis for orvex-wiki-api**: adopt RFC 9457 `application/problem+json` as the wire format, but treat `detail` (and a namespaced extension member, e.g. `x-agent-hint`) as the self-healing channel — write `detail` copy as if the reader is an LLM one prompt away from retrying correctly, with a corrected example inline.

---

## 4. Idempotency keys

- **Origin & mechanism** (Stripe, published **22 Feb 2017**, still the reference design in 2025–2026 sources): clients send an `Idempotency-Key` header (client-generated unique ID) on mutating (POST-equivalent) requests. Server correlates the key with request state:
  - First attempt → processed normally, key + result cached.
  - Retry after a mid-operation failure → server recovers/continues from stored state rather than re-executing side effects.
  - Retry after the operation actually succeeded → server replays the **cached response**, guaranteeing "exactly once" semantics (e.g. no double charge).
  - Clients should pair this with **exponential backoff + jitter** to avoid a thundering-herd retry storm against a degraded server.
  Source: [Stripe Blog — Designing robust and predictable APIs with idempotency, 22 Feb 2017](https://stripe.com/blog/idempotency)
- **2025–2026 restatement, agent-specific rationale**: "AI agents may retry requests due to timeouts or uncertainty about whether a previous request succeeded. Idempotency keys ensure that duplicate requests don't cause duplicate actions — critical for payment flows, state changes, and any operation where 'doing it twice' would cause problems." This is now framed explicitly as an *agent-reliability* feature, not just a network-reliability one — agents retry far more casually than human-driven UIs because they lack the human's "did that actually work?" instinct.
  Source: [Fern — API design best practices guide, Mar 2026](https://buildwithfern.com/post/api-design-best-practices-guide)
- **Stripe's Agent Toolkit / MCP server (2024–2026)** operationalizes this for LLM callers directly: "enforcing idempotency to make retries safe" is called out as one of the toolkit's three core design moves, alongside a curated tool surface and rich error messages.
  Source: [Stripe Docs — Model Context Protocol (MCP)](https://docs.stripe.com/mcp), [Stripe Docs — Agents and AI on Stripe](https://docs.stripe.com/agents)
- **digitalapi.ai 2026 checklist**: `Idempotency-Key` on all write endpoints, results stored/replayable for a defined window (they cite 24h) to enable safe retries without duplicate side effects.
  Source: [digitalapi.ai, 2026](https://www.digitalapi.ai/blogs/how-to-make-your-apis-ready-for-ai-agents)

**Synthesis**: every write verb the wiki API exposes to agents (page create/update/move/delete, block ops) needs `Idempotency-Key` support with a bounded replay window — this is now table stakes for agent-facing write APIs, not an advanced feature.

---

## 5. Optimistic concurrency: ETags / If-Match / compare-and-swap (verified writes)

- **Mechanism**: server returns an `ETag` representing a resource's exact version on GET/create; client round-trips it via `If-Match` on the next PUT/PATCH/DELETE; server returns **412 Precondition Failed** if the ETag no longer matches current state, forcing a re-read before overwrite.
  Source: [Zuplo — Optimizing REST APIs with Conditional Requests and ETags](https://zuplo.com/learning-center/optimizing-rest-apis-with-conditional-requests-and-etags), [Ed-Fi Alliance — Handling Optimistic Concurrency with ETags](https://docs.ed-fi.org/reference/data-exchange/api-guidelines/design-and-implementation-guidelines/api-implementation-guidelines/handling-optimistic-concurrency-with-etags/)
- **Compare-and-swap framing**: this is explicitly the same pattern as S3's conditional-write compare-and-swap — "S3's conditional writes enable atomic compare-and-swap operations to prevent race conditions" — generalized to any resource API.
  Source: [AWS Blog — Building multi-writer applications on Amazon S3 using native controls](https://aws.amazon.com/blogs/storage/building-multi-writer-applications-on-amazon-s3-using-native-controls/)
- **Agent-specific product evidence**: Tokanban (an agent task-management API) "carries an ETag on every resource, and conditional updates via `If-Match` headers let agents do read-modify-write cycles safely, even when other agents are working on the same project" — i.e. this is being built specifically to handle *multiple concurrent agents*, not just human-vs-human races.
  Source: [Tokanban — AI agent task management and memory](https://tokanban.com/)
- **Combined pattern**: "Optimistic concurrency combines with idempotency keys and transactional messaging to convert unreliable networks into predictable, safe write semantics" — the two mechanisms (idempotency-key for retry-safety, ETag/If-Match for concurrent-writer-safety) are complementary, not substitutes.
  Source: [event-driven.io — How to use ETag header for optimistic concurrency](https://event-driven.io/en/how_to_use_etag_header_for_optimistic_concurrency/)

**Synthesis for orvex-wiki-api**: page writes need BOTH `Idempotency-Key` (retry-safety for one agent) AND `ETag`/`If-Match` CAS semantics (safety when multiple agents/humans edit the same page concurrently — directly relevant given the fleet-of-agents pattern already in play on this wiki). This maps onto the "receipts / verified writes" ask in the prompt: a write's response should return the new `ETag` as a receipt the caller can cite as proof-of-write.

---

## 6. Cursor pagination

- **Why cursor over offset for agent/AI workloads**: cursor pagination uses an opaque position marker instead of a numeric offset, so there are no skipped/duplicated records under concurrent writes, and query performance stays flat regardless of table size — "can reduce query time by up to 40% compared to offset-based models for datasets exceeding one million rows."
  Source: [Speakeasy — Pagination Best Practices in REST API Design](https://www.speakeasy.com/api-design/pagination), [BusinessCompassLLC, Sep 2025](https://blogs.businesscompassllc.com/2025/09/best-practices-for-api-pagination.html)
- **Encoding**: cursor values should be base64-opaque, so clients (including agents) cannot hand-construct invalid cursors by guessing at offsets.
- **Error handling for stale/invalid cursors**: return `400 Bad Request` or `410 Gone` with an explicit instruction to restart pagination from the beginning — critical for an agent, which cannot "notice" a subtly wrong page the way a human scrolling a UI would.
- **Edge cases an agent-facing pagination contract must cover explicitly**: empty result sets return an empty array + metadata (not null/omitted field), out-of-range page requests get a clear structured error (not a silent empty page), and a **server-enforced max page size** must exist so an agent cannot accidentally request an unbounded page that blows its own context window.
  Source: [Merge.dev — Cursor pagination: how it works and its pros and cons](https://www.merge.dev/blog/cursor-pagination), [Gusto Embedded — A Developer's Guide to API Pagination](https://embedded.gusto.com/blog/api-pagination/)

**Synthesis**: `cursor-pagination.ts` in this repo (currently under a fix branch) should treat the 410-on-stale-cursor + explicit restart instruction as the agent-facing contract, and cap page size server-side rather than trusting a client-supplied `limit`.

---

## 7. Partial reads, field selection, and token-budget-aware responses

| Technique | Evidence | Source |
|---|---|---|
| **`ResponseFormat` verbosity enum** (`concise` \| `detailed`) | Anthropic's own worked example: a "detailed" tool response cost 206 tokens vs. 72 tokens "concise" — roughly a 2/3 token reduction for the same underlying data, letting the *caller* choose its own budget per call. | [Anthropic Engineering, 11 Sep 2025](https://www.anthropic.com/engineering/writing-tools-for-agents) |
| **Pagination + filtering + truncation as first-class response controls** | Anthropic: "implement some combination of pagination, range selection, filtering, and/or truncation" specifically framed as *context-consumption management*, not just data-volume management. | [Anthropic Engineering, 11 Sep 2025](https://www.anthropic.com/engineering/writing-tools-for-agents) |
| **GraphQL-style field selection reduces context pollution** | "GraphQL lets agents query exactly the fields they need, reducing token usage and context window pollution… smaller payloads meaning fewer tokens consumed in agent context windows and less post-processing code." Benchmarked at ~180ms median for complex multi-resource queries that would otherwise need several chained REST calls (a 28% latency advantage), but REST still wins or ties for simple single-resource fetches (no parse/validate overhead). | [Apollo GraphQL Blog — Every Token Counts](https://www.apollographql.com/blog/building-efficient-ai-agents-with-graphql-and-apollo-mcp-server), [tech-insider.org, GraphQL vs REST 2026](https://tech-insider.org/graphql-vs-rest-2026/) |
| **Practical resolution: REST for the public surface, GraphQL/field-selection for the composition layer** | "No clear winner… use both, leveraging REST for public exposure and GraphQL for internal composition." A pragmatic middle path for a REST-first system like orvex-wiki-api is a `fields=` / sparse-fieldset query parameter rather than a full GraphQL layer. | [fastCRW / Apollo synthesis](https://www.apollographql.com/blog/building-efficient-ai-agents-with-graphql-and-apollo-mcp-server) |

**Synthesis**: orvex-wiki-api's `/v1` composition tier should expose (a) a response-verbosity switch on read endpoints (mirrors Anthropic's `concise`/`detailed`), (b) sparse-fieldset selection (`?fields=title,slug,updatedAt`) for read endpoints instead of always returning full page bodies, and (c) hard server-side truncation limits with a `truncated: true` + continuation-cursor marker rather than silently clipping.

---

## 8. Capability discovery: well-known endpoints, llms.txt, OpenAPI-for-agents, Arazzo workflows

### 8.1 `llms.txt` / `llms-full.txt`
- **Origin**: proposed by **Jeremy Howard (Answer.AI)**, published **3 September 2024**, hosted at llmstxt.org with growing community support.
  Source: [llmstxt.org](https://llmstxt.org/)
- **Format** (strict order): optional BOM → **required H1** (project/site name) → **blockquote** summary → optional free-text context sections → **H2-delimited link lists** (markdown links + optional one-line notes per link), with an "Optional" H2 section for content that's safe to skip under a tight context budget.
- **`llms-full.txt` distinction**: the expanded/full-content sibling; some implementations (FastHTML) further split into `llms-ctx.txt` (no URLs) vs `llms-ctx-full.txt` (URLs included) for different context-budget needs.
- **Design rationale, in the spec author's own words**: Markdown was chosen deliberately because it's "human and LLM readable" while maintaining a "precise format allowing fixed processing methods" — parsing raw HTML is "slow and error-prone for models."
- **Adoption**: 844,000+ sites per BuiltWith as of 25 Oct 2025; Anthropic, Cloudflare, and **Stripe** are cited adopters; Anthropic explicitly requested `llms.txt` **and** `llms-full.txt` for its own docs on Mintlify.
  Source: [Bodhost — What is llms.txt? (2025 Guide)](https://www.bodhost.com/blog/what-is-llms-txt/), [Mintlify — What is llms.txt?](https://www.mintlify.com/blog/what-is-llms-txt)

### 8.2 Well-known endpoints / manifests
- `/.well-known/ai-plugin.json` — the ChatGPT-plugin-era manifest, now treated as a de facto general AI-agent discovery standard by several 2025–2026 sources (though its ecosystem centrality has faded relative to MCP).
- `/.well-known/agent.json` — cited as an emerging convention carrying pricing + capability metadata for agent-to-service discovery.
- Standard machine-spec paths: `/openapi.json` or `/openapi.yaml` at a stable, discoverable path, cross-linked *from* `llms.txt` so an agent that lands on the text file can traverse straight to the full machine spec.
  Source: [BluePages — How to Make Your API Discoverable by AI Agents](https://www.bluepages.ai/blog/how-to-make-api-discoverable-by-ai-agents), [Fern, Mar 2026](https://buildwithfern.com/post/api-design-best-practices-guide)
- **Consolidated 2026 discoverability checklist** (BluePages): publish a rich, example-laden OpenAPI 3.x spec; serve `/.well-known/ai-plugin.json`; serve `/.well-known/agent.json` with pricing/capability metadata; add `llms.txt` (+ optionally `llms-full.txt`) at the domain root; build and publish an MCP server for direct tool integration; list the API in third-party agent-tool directories.
  Source: [BluePages](https://www.bluepages.ai/blog/how-to-make-api-discoverable-by-ai-agents)

### 8.3 OpenAPI-for-agents / spec-to-MCP tooling
- Tools like `openapi-mcp` read an existing OpenAPI 3.x spec and auto-generate a fully functional MCP server, exposing each operation as a distinct discoverable "tool" — meaning a sufficiently good OpenAPI spec becomes the *single source of truth* that both human SDKs and agent tool-surfaces are generated from, rather than hand-authoring two parallel descriptions.
  Source: [Skywork — Frank Denis's openapi-mcp](https://skywork.ai/skypage/en/openapi-mcp-agent-apis/1977918528394547200)
- Stainless's own framing (23 Mar 2026) makes the OpenAPI spec the literal "single source of truth" driving SDKs, docs, and agent tools simultaneously — reinforcing that maintaining a second, hand-rolled "agent-facing" spec is an anti-pattern; extend the canonical spec (e.g. via `x-speakeasy-mcp`-style vendor extensions) instead of forking it.
  Source: [Stainless, 23 Mar 2026](https://www.stainless.com/blog/steps-toward-great-agent-experience-every-api-provider-can-take-today)

### 8.4 Arazzo — deterministic multi-step API workflows
- **What it is**: an OpenAPI-Initiative specification (sibling to OpenAPI/AsyncAPI) that expresses **sequences of API calls with explicit dependencies, inputs, outputs, and success/failure conditions** to accomplish a business outcome — where OpenAPI describes an API's *surface*, Arazzo describes how to *complete a workflow* using that surface.
  Source: [OpenAPI Initiative — Arazzo Specification](https://www.openapis.org/arazzo-specification), [GitHub OAI/Arazzo-Specification](https://github.com/OAI/Arazzo-Specification)
- **Version history**: v1.0.0 with a v1.0.1 patch (Jan 2025); **v1.1.0** adds AsyncAPI support, letting Arazzo workflows declaratively span both sync (REST) and async (event-driven) calls in one workflow document.
  Source: [Arazzo Specification v1.1.0 — spec.openapis.org](https://spec.openapis.org/arazzo/latest.html)
- **Explicit agent rationale**: "Arazzo is fully aware of the needs of AI-agents and simultaneously improves the agent experience (AX) by providing the deterministic semantics needed for them to parse and execute complex and/or sensitive API workflows" — i.e. it exists specifically to stop agents from having to *infer* call ordering/dependencies from prose docs (contrast with Speakeasy's "workflow context" point in §2).
  Source: [SmartBear — From Endpoints to Intent: Designing AI Agent Workflows with Arazzo and MCP](https://smartbear.com/blog/from-endpoints-to-intent-rethinking-agent-api-workflows-with-arazzo/), [Nordic APIs — Why AI Agents Need Deterministic API Workflows](https://nordicapis.com/why-ai-agents-need-deterministic-api-workflows/)
- **Tooling ecosystem** has matured significantly since 1.0: editors, validators, parsers, resolvers, generators, and standalone workflow-execution engines all exist as of 2025–2026.
  Source: [Jentic — Building Reliable API Workflows with Arazzo](https://jentic.com/blog/building-reliable-api-workflows-with-arazzo)

**Synthesis for orvex-wiki-api / orvex-studio-mcp**: (1) publish `llms.txt` + `llms-full.txt` at the wiki's root pointing at the OpenAPI spec and the MCP server; (2) keep ONE canonical OpenAPI 3.x spec and generate the MCP tool surface from it (or annotate it with agent-specific extensions) rather than hand-maintaining two divergent descriptions; (3) for genuinely multi-step flows (e.g. "create page → wait for embedding → ratify → supersede old page"), consider publishing an Arazzo workflow document alongside the OpenAPI spec so agents get deterministic step-ordering instead of inferring it from prose.

---

## 9. MCP (Model Context Protocol) vs. REST — when to use which layer

- **Origin**: MCP is "an open JSON-RPC-based standard originally published by Anthropic in November 2024" that lets AI applications discover tools, resources, and prompts from external servers and invoke them through **stateful sessions**.
  Source: [Medium — Model Context Protocol (MCP) vs. APIs](https://medium.com/@tahirbalarabe2/model-context-protocol-mcp-vs-apis-the-new-standard-for-ai-integration-d6b9a7665ea7)
- **Core architectural distinction**: REST is stateless/low-level transport; MCP is a higher-level, **stateful** protocol that "maintains a persistent session between client and server where context persists" across a multi-step agent task (open a file → run tests → see errors, without losing context between steps) — "comparing REST APIs to MCP is a category error."
  Source: [WorkOS — MCP vs. REST: What's the right way to connect AI agents to your API?](https://workos.com/blog/mcp-vs-rest)
- **MCP "Resources" primitive** is explicitly the wiki/KB-shaped primitive: "Resources are endpoints for information retrieval… resources are read-only or passive — they provide data but typically do not cause side effects." Official spec: [modelcontextprotocol.io/specification/2025-06-18/server/resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources).
- **Worked knowledge-base pattern**: "the client might do a search resource request, get relevant article URIs, then do read requests for those articles, and the returned text is then included in the AI's prompt context" — this is close to a two-tool `search` → `get_page` chain, matching the existing amazing-MCP delivered pattern (per memory: "search→get_page chain closes on real evidence").
  Source: [Medium — MCP's Resources: Providing Data Context to AI](https://medium.com/@whatsupai/mcp-series-mcps-resources-providing-data-context-to-ai-a6ac45231763)
- **Practical layering advice** (multiple sources converge): REST/OpenAPI stays the durable, versioned, machine-verifiable contract; MCP sits on top as a **stateful orchestration/discovery layer** that a well-designed REST/OpenAPI surface can even be auto-derived into (see §8.3, `openapi-mcp`). This matches the locked orvex strategy of wiki-api (Go /v1 composition) as the source of truth with orvex-studio-mcp as an intent-verb layer over it — not a parallel implementation.

---

## 10. Versioning, receipts, and verified writes

- **Versioning baseline**: URL-based or header-based versioning (`/v1/orders`), always version, document changes between versions explicitly, maintain backward compatibility within a major version.
  Source: [digitalapi.ai, 2026](https://www.digitalapi.ai/blogs/how-to-make-your-apis-ready-for-ai-agents)
- **"Receipts" for verified writes = the ETag/If-Match CAS pattern from §5**, combined with the Idempotency-Key from §4: a write response should hand back (a) the new resource version/`ETag` as proof-of-write the caller can cite, and (b) honor the same idempotency key on retry so a receipt is never silently duplicated.
- **Rate-limit / capability negotiation headers**: return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response — "a documented rate limit isn't useful to an autonomous agent; a rate limit surfaced in the response headers is." Also `Retry-After` on 429s.
  Source: [Xano — Modern API Design Best Practices for 2026](https://www.xano.com/blog/modern-api-design-best-practices/), [digitalapi.ai, 2026](https://www.digitalapi.ai/blogs/how-to-make-your-apis-ready-for-ai-agents)

---

## 11. Batch vs. single-op

| Consideration | Finding | Source |
|---|---|---|
| Batch endpoints reduce overhead | "Reduce per-call overhead… often improving throughput by 17–92% in large-scale operations"; combining many independent requests into one call cuts latency, bandwidth, and connection overhead. | [Novita — Batch API: Reduce Bandwidth Waste](https://blogs.novita.ai/batch-api-reduce-bandwidth-waste-and-improve-api-efficiency/) |
| Batch is for async/bulk, not live agent decisions | Batch APIs "sacrifice real-time speed" and excel at asynchronous, large-scale operations (bulk vectorizing, evals, sync jobs); single-op calls remain better for real-time in-the-loop agent decision-making. | [Voyage AI — Introducing the Batch API, Dec 2025](https://blog.voyageai.com/2025/12/04/batch-api/) |
| Design implication | Offer BOTH: a synchronous single-resource `/v1/pages/{id}` for live agent turns, and an async batch endpoint (submit → poll/webhook for completion) for bulk agent jobs like a doc-migration or drift-reconciliation sweep — don't force one shape to serve both. | Synthesized from above + [Composio](https://composio.dev/content/apis-ai-agents-integration-patterns) |

---

## 12. Webhooks / changes feed for agent sync

- **Core trade-off**: webhooks express events directly (push); polling has to reconstruct events by diffing state (pull). Only "~11% of SaaS APIs natively support webhooks — the rest require polling or a virtual webhook layer."
  Source: [Unified.to — Virtual Webhooks vs Polling Jobs](https://unified.to/blog/virtual_webhooks_vs_polling_jobs_how_integrations_handle_change_detection)
- **2025–2026 development — CloudEvents as the payload standard**: CNCF's CloudEvents spec defines a standard envelope for event data, making events portable across systems — directly relevant since the orvex program already uses Kafka **CloudEvents** for its microservices bus (per repo context), so a webhook/changes-feed layer for agents should reuse the *same* CloudEvents envelope rather than inventing a bespoke webhook payload shape.
  Source: [Hooklistener — Webhooks Fundamentals (2026)](https://www.hooklistener.com/learn/webhooks-fundamentals)
- **Agent-specific pattern**: "Agents now emit and consume webhooks directly — a model finishes a task, fires an event, and another system reacts. AI agents need machine-readable webhook schemas to understand what events a system can fire," ideally documented in OpenAPI/AsyncAPI so agents can autonomously discover and subscribe to relevant events rather than being hand-configured by a human.
  Source: [Hooklistener, 2026](https://www.hooklistener.com/learn/webhooks-fundamentals)
- **Production pattern**: most real integrations use APIs for reads/mutations/backfills and webhooks for change-driven events — i.e. a changes-feed endpoint (poll-based, cursor-paginated per §6) is the right *fallback/backfill* companion to webhooks, not a replacement for either.
  Source: [Unified.to — Which Event Delivery Model Scales](https://unified.to/blog/which_event_delivery_model_scales_polling_webhooks_or_virtual_webhooks)

**Synthesis**: expose a cursor-paginated `/v1/changes` (or `/v1/pages?since=cursor`) feed using the existing CloudEvents envelope for agent backfill/catch-up, PLUS webhook subscriptions (documented in the OpenAPI/AsyncAPI spec, per §8) for live push — this gives agents both a resumable pull path and a low-latency push path off one shared event vocabulary.

---

## 13. How AI-native products shape their APIs — company-by-company

| Company | Agent-facing design moves | Source |
|---|---|---|
| **Stripe** | Restricted, narrowly-scoped API keys per agent; `Idempotency-Key` on all mutating calls (foundational 2017 design, now explicitly framed as agent-retry-safety); MCP server exposing a curated tool subset (not the full API surface) with rich, actionable error messages; docs split for humans vs. agent/MCP consumption. | [Stripe Docs — MCP](https://docs.stripe.com/mcp), [Stripe Docs — Agents and AI on Stripe](https://docs.stripe.com/agents), [Stripe Blog — idempotency](https://stripe.com/blog/idempotency) |
| **Anthropic** | Own engineering guidance (§3.2/§7) treats tool/API design as a first-class discipline: actionable errors, `ResponseFormat` verbosity control, prefix-namespaced tool names, evaluation-driven naming, prompt-engineered tool descriptions as "one of the most effective methods for improving tools." Publishes `llms.txt`/`llms-full.txt` for its own docs. | [Anthropic Engineering, 11 Sep 2025](https://www.anthropic.com/engineering/writing-tools-for-agents), [Mintlify](https://www.mintlify.com/blog/what-is-llms-txt) |
| **OpenAI** | Pushes strict-mode Structured Outputs (`additionalProperties: false`, all fields required, optionality via nullable types) as the 2025–2026 production default over legacy JSON-mode, specifically to make agent-parsed responses schema-reliable rather than best-effort; separate `refusal` field surfaced distinctly from normal schema output so agents can branch on "the model declined" vs. "malformed data." | [OpenAI — Introducing Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/), [OpenAI — Function calling guide](https://developers.openai.com/api/docs/guides/function-calling) |
| **Exa** | Built an entirely separate, AI-native search index (not a wrapper on a human search engine) ranked by neural/semantic relevance rather than SEO signals; offers a range of latency profiles (from ~200ms "instant" search up to deeper multi-step research modes) so an agent can trade off speed vs. depth per call. | [fastCRW — What Is Exa AI?](https://fastcrw.com/blog/what-is-exa-ai) |
| **Firecrawl** | Extraction-first API: single call wraps search + full content extraction (not just links) + freshness monitoring + an `/agent` endpoint for autonomous multi-step research, explicitly to cut "the effort models and automation systems spend dealing with web noise." | [Firecrawl Blog — Best Web Search APIs for AI Applications in 2026](https://www.firecrawl.dev/blog/best-web-search-apis) |

---

## 14. Ranked design principles for an AI-first wiki API

Ranked by (a) how strongly the 2025–2026 evidence converges on it, and (b) how directly it affects the orvex-wiki-api / orvex-studio-mcp / orvex-cli surfaces.

1. **One canonical machine spec, everything else generated from it.** Keep a single OpenAPI 3.x spec as source of truth; derive SDKs, human docs, AND the MCP tool surface from it (extend via vendor extensions for agent-only guidance) rather than hand-maintaining a parallel agent description. *(Stainless, Speakeasy, openapi-mcp)*
2. **RFC 9457 `application/problem+json` errors, written to be self-correcting.** Every error carries `type`/`title`/`status`/`detail`/`instance`, plus a namespaced extension member with a concrete corrected-example — `detail` copy should assume the reader is an LLM one retry away from success. *(RFC 9457, Anthropic, Stainless)*
3. **`Idempotency-Key` on every mutating call, with a bounded replay window.** Non-negotiable given how casually agents retry versus humans. *(Stripe, Fern 2026, digitalapi.ai)*
4. **`ETag` + `If-Match` compare-and-swap on every writable resource**, returning the new ETag as a write receipt — essential once multiple agents (this program's own fleet pattern) can touch the same page concurrently. *(Zuplo, Tokanban, event-driven.io)*
5. **Cursor pagination everywhere, with a server-enforced max page size and explicit `410`-plus-restart-instruction on stale cursors.** Never trust a client-supplied unbounded limit. *(Speakeasy, Merge.dev, Gusto)*
6. **Response-verbosity and field-selection controls on every read**, mirroring Anthropic's `concise`/`detailed` split and REST sparse-fieldsets — token budget is now a response-shape concern, not just a client-side concern. *(Anthropic 11 Sep 2025, Apollo GraphQL)*
7. **Publish `llms.txt` + `llms-full.txt` at the wiki root, cross-linked to the OpenAPI spec and the MCP server.** Cheap, increasingly standard (844k+ adopting sites, Stripe/Anthropic/Cloudflare among them), and is the literal entry point an agent (or a general-purpose LLM without the MCP configured) will look for first. *(llmstxt.org, Bodhost, Mintlify)*
8. **Scope auth per agent, not per app.** Restricted/scoped credentials (Stripe pattern) so a given agent's blast radius is bounded to the operations it actually needs — directly reusable for the orvex-cli / MCP token model. *(MindStudio, Speakeasy "toolability")*
9. **Encode workflow ordering explicitly (Arazzo or equivalent), don't leave sequencing to prose docs.** For any multi-step wiki operation (draft→ratify→supersede, embed-then-index, etc.), publish the dependency graph machine-readably. *(OpenAPI Initiative, SmartBear, Nordic APIs)*
10. **CloudEvents-shaped changes feed (cursor-paginated) + webhooks off the same envelope**, so agents get both a resumable pull path for backfill and a push path for live sync — reusing the Kafka CloudEvents envelope already in use elsewhere in the program rather than inventing a new one. *(Hooklistener, Unified.to)*
11. **Rate-limit and retry signals in headers, always.** `X-RateLimit-{Limit,Remaining,Reset}` + `Retry-After` on every response, not just documented limits — an agent can only self-throttle on what it can read at runtime. *(Xano, digitalapi.ai)*
12. **Batch endpoints for bulk/async agent jobs, kept separate from the synchronous single-resource path used in live agent turns.** Don't force one endpoint shape to serve both a live decision loop and a bulk migration sweep. *(Novita, Voyage AI, Composio)*
13. **MCP as a stateful orchestration layer over REST, not a competing implementation.** REST/OpenAPI stays the durable, versioned contract; MCP's `resources` primitive is the natural fit for read-only wiki content, `tools` for the mutating verbs — matches the existing amazing-MCP search→get_page pattern already delivered live. *(WorkOS, modelcontextprotocol.io, program memory)*

---

## Source list (all fetched/cited above)

- [RFC 9457 — Problem Details for HTTP APIs (IETF, Jul 2023)](https://datatracker.ietf.org/doc/html/rfc9457)
- [RFC 9457 — RFC Editor info page](https://www.rfc-editor.org/info/rfc9457/)
- [Jsonic — JSON API Error Handling: RFC 9457 Problem Details](https://jsonic.io/guides/json-api-error-handling)
- [Fern — API design best practices guide (Mar 2026)](https://buildwithfern.com/post/api-design-best-practices-guide)
- [Xano — Modern API Design Best Practices for 2026](https://www.xano.com/blog/modern-api-design-best-practices/)
- [Apideck — API Design Principles for the Agentic Era](https://www.apideck.com/blog/api-design-principles-agentic-era)
- [digitalapi.ai — How to Make Your APIs Ready for AI Agents (2026 Guide)](https://www.digitalapi.ai/blogs/how-to-make-your-apis-ready-for-ai-agents)
- [Composio — APIs for AI Agents: The 5 Integration Patterns (2026)](https://composio.dev/content/apis-ai-agents-integration-patterns)
- [Anthropic Engineering — Writing effective tools for AI agents (11 Sep 2025)](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Claude Platform Docs — Implement tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [Speakeasy — Designing agent experience: A practical guide for the era of AX](https://www.speakeasy.com/blog/agent-experience-introduction)
- [Speakeasy — Pagination Best Practices in REST API Design](https://www.speakeasy.com/api-design/pagination)
- [Stainless — Steps toward great agent experience every API provider can take today (23 Mar 2026)](https://www.stainless.com/blog/steps-toward-great-agent-experience-every-api-provider-can-take-today)
- [Stripe Blog — Designing robust and predictable APIs with idempotency (22 Feb 2017)](https://stripe.com/blog/idempotency)
- [Stripe Docs — Model Context Protocol (MCP)](https://docs.stripe.com/mcp)
- [Stripe Docs — Agents and AI on Stripe](https://docs.stripe.com/agents)
- [MindStudio — How to Build an Agent-First Product: Lessons from Stripe, Google, and Anthropic](https://www.mindstudio.ai/blog/how-to-build-agent-first-product-design-principles)
- [Netlify — Agent Experience](https://www.netlify.com/agent-experience/)
- [Nordic APIs — What Is Agent Experience (AX)?](https://nordicapis.com/what-is-agent-experience-ax/)
- [Nordic APIs — Why AI Agents Need Deterministic API Workflows](https://nordicapis.com/why-ai-agents-need-deterministic-api-workflows/)
- [llmstxt.org — the llms.txt specification (Jeremy Howard, 3 Sep 2024)](https://llmstxt.org/)
- [Bodhost — What is llms.txt? (2025 Guide)](https://www.bodhost.com/blog/what-is-llms-txt/)
- [Mintlify — What is llms.txt? Breaking down the skepticism](https://www.mintlify.com/blog/what-is-llms-txt)
- [BluePages — How to Make Your API Discoverable by AI Agents](https://www.bluepages.ai/blog/how-to-make-api-discoverable-by-ai-agents)
- [Skywork — Frank Denis's openapi-mcp: The Go-To Tool for Agent-Ready APIs](https://skywork.ai/skypage/en/openapi-mcp-agent-apis/1977918528394547200)
- [OpenAPI Initiative — Arazzo Specification](https://www.openapis.org/arazzo-specification)
- [GitHub — OAI/Arazzo-Specification](https://github.com/OAI/Arazzo-Specification)
- [Arazzo Specification v1.1.0](https://spec.openapis.org/arazzo/latest.html)
- [SmartBear — From Endpoints to Intent: Designing AI Agent Workflows with Arazzo and MCP](https://smartbear.com/blog/from-endpoints-to-intent-rethinking-agent-api-workflows-with-arazzo/)
- [Jentic — Building Reliable API Workflows with Arazzo](https://jentic.com/blog/building-reliable-api-workflows-with-arazzo)
- [WorkOS — MCP vs. REST: What's the right way to connect AI agents to your API?](https://workos.com/blog/mcp-vs-rest)
- [Model Context Protocol — Resources spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [Medium — Model Context Protocol (MCP) vs. APIs: The New Standard for AI Integration](https://medium.com/@tahirbalarabe2/model-context-protocol-mcp-vs-apis-the-new-standard-for-ai-integration-d6b9a7665ea7)
- [Medium — MCP Series: MCP's Resources — Providing Data Context to AI](https://medium.com/@whatsupai/mcp-series-mcps-resources-providing-data-context-to-ai-a6ac45231763)
- [Apollo GraphQL Blog — Every Token Counts: Building Efficient AI Agents with GraphQL and Apollo MCP Server](https://www.apollographql.com/blog/building-efficient-ai-agents-with-graphql-and-apollo-mcp-server)
- [tech-insider.org — GraphQL vs REST 2026: 28% Latency Gap and 340% Surge](https://tech-insider.org/graphql-vs-rest-2026/)
- [Zuplo — Optimizing REST APIs with Conditional Requests and ETags](https://zuplo.com/learning-center/optimizing-rest-apis-with-conditional-requests-and-etags)
- [Ed-Fi Alliance — Handling Optimistic Concurrency with ETags](https://docs.ed-fi.org/reference/data-exchange/api-guidelines/design-and-implementation-guidelines/api-implementation-guidelines/handling-optimistic-concurrency-with-etags/)
- [event-driven.io — How to use ETag header for optimistic concurrency](https://event-driven.io/en/how_to_use_etag_header_for_optimistic_concurrency/)
- [AWS Blog — Building multi-writer applications on Amazon S3 using native controls](https://aws.amazon.com/blogs/storage/building-multi-writer-applications-on-amazon-s3-using-native-controls/)
- [Tokanban — AI agent task management and memory](https://tokanban.com/)
- [Merge.dev — Cursor pagination: how it works and its pros and cons](https://www.merge.dev/blog/cursor-pagination)
- [Gusto Embedded Blog — A Developer's Guide to API Pagination](https://embedded.gusto.com/blog/api-pagination/)
- [BusinessCompassLLC — Best Practices for API Pagination (Sep 2025)](https://blogs.businesscompassllc.com/2025/09/best-practices-for-api-pagination.html)
- [Novita — Batch API: Reduce Bandwidth Waste and Improve API Efficiency](https://blogs.novita.ai/batch-api-reduce-bandwidth-waste-and-improve-api-efficiency/)
- [Voyage AI Blog — Introducing the Batch API (4 Dec 2025)](https://blog.voyageai.com/2025/12/04/batch-api/)
- [Hooklistener — Webhooks Fundamentals: Complete Implementation Guide (2026)](https://www.hooklistener.com/learn/webhooks-fundamentals)
- [Unified.to — Virtual Webhooks vs Polling Jobs: How Integrations Handle Change Detection](https://unified.to/blog/virtual_webhooks_vs_polling_jobs_how_integrations_handle_change_detection)
- [Unified.to — Which Event Delivery Model Scales: Polling, Webhooks, or Virtual Webhooks?](https://unified.to/blog/which_event_delivery_model_scales_polling_webhooks_or_virtual_webhooks)
- [OpenAI — Introducing Structured Outputs in the API](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- [OpenAI Developers — Function calling guide](https://developers.openai.com/api/docs/guides/function-calling)
- [Firecrawl Blog — Best Web Search APIs for AI Applications in 2026](https://www.firecrawl.dev/blog/best-web-search-apis)
- [fastCRW — What Is Exa AI? Search API, Pricing, MCP, and Where It Fits (2026)](https://fastcrw.com/blog/what-is-exa-ai)
