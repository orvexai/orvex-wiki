# Supermemory — prior-art deep dive (memory track)

Researched 2026-07-10. Closest analog to Orvex's cross-agent memory use case: a hosted memory API + MCP server aimed at coding agents and chat-platform plugins writing durable memory as they work.

## What it is

Supermemory bills itself as "the Memory API for the AI era" — a memory and context engine plus a hosted app, positioned to give LLMs/agents persistent memory across sessions and applications. It runs both "knowledge base retrieval" (RAG over documents) and "personalized memory" (facts/preferences that evolve) through one stack, and ships a standalone MCP server so any MCP-compatible client (Claude Desktop, Cursor, Windsurf, VS Code, Cline/Roo-Cline, ChatGPT via plugin, etc.) can read/write memory.
Source: https://supermemory.ai/docs/supermemory-mcp/introduction , https://github.com/supermemoryai/supermemory

## Behind it & traction

- Founder: Dhravya Shah, a then-19-year-old (India-based) solo founder who scaled it into a company.
- Seed funding: $2.6M led by Susa Ventures, Browder Capital, and SF1.vc, with individual checks from Cloudflare's [Knecht], Google AI chief Jeff Dean, DeepMind PM Logan Kilpatrick, Sentry founder David Cramer, and OpenAI/Meta/Google execs (Oct 2025). A separate company blog post references a "$3M raise."
- Not a YC company — YC reportedly approached but the seed round was already closed.
- GitHub (supermemoryai/supermemory): 28.3k stars, 2.4k forks, 106 watchers, 1,751 commits — high open-source visibility, but stars/forks are marketing-adjacent vanity metrics, not usage evidence.
Source: https://techcrunch.com/2025/10/06/a-19-year-old-nabs-backing-from-google-execs-for-his-ai-memory-startup-supermemory/ , https://supermemory.ai/blog/supermemory-raises-3-million-and-building-the-best-memory-engine-for-llms/ , https://github.com/supermemoryai/supermemory

## Architecture & data model

- Monorepo (Turborepo), TypeScript-heavy (68.6%) with a Remix full-stack app, Tailwind, Vite; Python (5.2%) for AI/ML pieces.
- Backend: Cloudflare Workers (serverless compute) + Cloudflare KV, Cloudflare Pages for hosting, Postgres via Drizzle ORM for durable storage. MCP server specifically built on Cloudflare Workers + Durable Objects "for scalable, persistent connections."
- Data model distinguishes "memory" (evolving user facts/profile, temporal tracking, contradiction resolution) from "RAG" (static document chunks with metadata), processed through one pipeline. Connector sync state (Google Drive, Gmail, Notion, GitHub, OneDrive) is tracked alongside.
- File processing: PDFs, OCR on images, video transcription, AST-aware code chunking.
- Deployment options: hosted cloud (console.supermemory.ai / app.supermemory.ai), self-hosted "one binary, zero config," and a local dev mode (`npx supermemory local`, data in `./.supermemory`, port 6767).
Source: https://github.com/supermemoryai/supermemory

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- **MCP**: dedicated MCP server (`supermemoryai/supermemory-mcp`), one-command install (`npx -y install-mcp@latest` / `npx supermemory-mcp`), OAuth by default, `sm_`-prefixed API keys for programmatic use. Exposes primarily two tools: `memory` (write/capture) and `recall` (retrieve). Project scoping via `x-sm-project` header.
- **SDKs / framework integrations**: Vercel AI SDK, LangChain, LangGraph, OpenAI Agents SDK, Mastra, Agno, Claude "Memory Tool," n8n; npm and PyPI packages published under `supermemory`.
- **Chat-platform / IDE clients**: Claude Desktop, Cursor, Windsurf, VS Code, Cline/Roo-Cline, plus a "Hermes" plugin and explicit "Claude Code" and "OpenCode" plugin support (per marketing/search results) — i.e. it specifically targets coding-agent workflows, the same shape as Orvex's Studio CLI.
- No CLI beyond `npx supermemory local` for self-hosting was documented in what we fetched; a full CLI product surface is **unknown** from primary sources checked.
Source: https://supermemory.ai/docs/supermemory-mcp/introduction , https://github.com/supermemoryai/supermemory

## Memory lifecycle & sharing

- **Capture**: `memory` MCP tool stores facts extracted from conversation during use; marketing copy says the engine "automatically learns from conversations, extracts facts, builds user profiles, handles knowledge updates and contradictions."
- **Retrieve**: `recall` tool / hybrid search combining RAG + personalized memory in one query; user-profile retrieval claimed at ~50ms.
- **Decay / consolidate / summarize**: marketing claims the engine "forgets expired information," but the MCP docs we fetched do not describe a concrete forgetting/decay mechanism, and a third-party technical critique (Hindsight blog) states explicitly that "neither [Mem0 nor Supermemory] claims a sleep/consolidation pass" and both lack "a consolidation and salience-decay cognition step" — i.e. independent analysis contradicts or at least is unable to verify the marketing "forgets expired information" claim. Treat decay/consolidation as a **marketing claim, not verified in the technical docs**.
- **Multi-agent / namespace / permissions**: docs describe "complete user data separation per account" and project scoping via header, but do not explicitly address multi-agent coordination, team-shared memory graphs, or fine-grained per-document permissions beyond account/project boundaries. Team tiers (Pro/Scale) add "teammates" (2 on Pro, up to 10 on Scale) but the semantics of shared vs. isolated memory across teammates is **unknown** from sources checked.
- **Cross-session token-cost story**: deduplicates at the token level ("SM tokens") so re-uploading the same document/conversation doesn't redraw balance — only net-new content is charged; pitched as "100% prompt-cache discount." Independent benchmark data (via search) puts Supermemory at "5.04 min, $0.58" for an unspecified benchmark run, contrasted with Mem0's claim of "under 7,000 tokens per retrieval call" — the two aren't directly comparable from what we captured, so **exact apples-to-apples token cost is unknown**.
Source: https://supermemory.ai/docs/supermemory-mcp/introduction , https://hindsight.vectorize.io/blog/2026/05/21/agent-memory-consolidation , https://supermemory.ai/pricing/

## Scale & operational evidence

- Claims #1 rank on three memory benchmarks: LongMemEval (81.6% on the LongMemEval-s split), LoCoMo, and ConvoMem — these are Supermemory's own claims plus an open-source "MemoryBench" comparison tool the team itself maintains, so the benchmark wins are **self-reported / self-hosted**, not independently audited.
- Competing vendor Mem0 disputes the LongMemEval ranking directly: Mem0's own comparison page states Mem0 scores 93.4% (after an April 2026 "token-efficient memory algorithm" update) vs. Supermemory's 81.6% on the same split — a direct contradiction of Supermemory's "#1" claim, sourced from a competitor with its own incentive to win the comparison. Net: benchmark leadership is contested, not settled.
- No public customer logos, uptime SLA history, or incident postmortems were found in the sources checked. SOC 2 / HIPAA compliance is claimed at the Scale tier ($399/mo) and up but no certification body/report was surfaced.
- GitHub activity (1,751 commits, 28.3k stars) indicates active open-source development, not production scale at customers.
Source: https://mem0.ai/compare/mem0-vs-supermemory , https://mem0.ai/blog/comparison-mem0-vs-hindisght-vs-supermemory , https://github.com/supermemoryai/supermemory

## Pricing & positioning

Two parallel pricing surfaces exist and are somewhat inconsistent across sources fetched (search-summary vs. direct pricing-page fetch) — using the direct pricing-page fetch as authoritative:

- **Free**: $0/mo, ~$5/mo usage included ("builders tinkering, prototypes, side projects"); includes Hermes plugin + Supermemory MCP.
- **Pro**: $19/mo, ~$20/mo usage included; unlimited storage/users claimed, 2 teammates, Drive/Notion/OneDrive connectors, email support.
- **Max**: $100/mo, ~$130/mo usage (marketed as "6x Pro value"); adds Gmail/Granola connectors, priority support.
- **Scale**: $399/mo, ~$600/mo usage; up to 10 teammates, all connectors, spend caps, SOC 2/HIPAA claimed, self-hosted option.
- **Enterprise**: custom — air-gapped self-hosting, dedicated account manager, uptime SLA, unlimited usage.
- **Usage-based unit pricing**: Memory writes $0.005/1K SM tokens (plain), $0.010 (rich); SuperRAG $0.001/1K SM tokens ($0.002 rich); search/traversal $0.005/1K queries; operations $0.10/1K ops.
- Positioning line from the pricing page: "2x cheaper than next-best, with better quality," plus the token-level dedup "100% prompt-cache discount" pitch.
Source: https://supermemory.ai/pricing/

## STEAL — 3-5 concrete ideas for Orvex

1. **Two-verb MCP surface (`memory` write, `recall` read)** — a minimal, opinionated tool surface is easy for agents to use correctly and easy to reason about for permissions; Orvex's cross-agent memory MCP tools should similarly collapse to a small verb set rather than a sprawling API, with routing/complexity (consolidation, decay, dedup) hidden server-side.
2. **Token-level dedup billing/storage** — treating re-submitted/overlapping content as free (only net-new tokens count) directly solves the "100 documents in one session" cost/staging problem named in Orvex's own agent-staging-area PRD; worth stealing as a design principle for both the memory track and the librarian's staging store (don't re-embed/re-charge unchanged content).
3. **Project/namespace scoping via a simple header (`x-sm-project`)** — a lightweight tenancy primitive that's cheap to implement and easy for MCP clients to set; a good minimum bar for Orvex's per-customer / per-agent-fleet namespacing before building anything more elaborate.
4. **Self-hosted "one binary, zero config" escape hatch** — offering a local/self-hosted mode alongside the hosted service lowers adoption friction for security-sensitive customers and gives Orvex's Enterprise tier a credible on-prem story without a separate codebase.
5. **Coding-agent-first plugin distribution (Claude Code, OpenCode, Cursor, Windsurf, Cline)** — Supermemory explicitly targets the CLI/IDE-agent segment closest to Orvex's Studio CLI; the one-command `npx install-mcp` onboarding flow is a low-friction pattern worth mirroring for Orvex CLI + MCP setup.

## AVOID / where Orvex differs

- **Don't trust "forgets expired info" as a solved problem.** Independent technical commentary (Hindsight) says neither Supermemory nor Mem0 has a real consolidation/salience-decay pass; Orvex's cross-agent memory (inspired by beads) explicitly needs handoff/consolidation semantics — this is a real gap to design deliberately, not something to assume a hosted vendor already solved.
- **Don't treat "#1 on three benchmarks" as settled fact.** The claim is self-reported (Supermemory maintains its own MemoryBench) and directly disputed by competitor Mem0's own comparison page (93.4% vs 81.6% on LongMemEval-s). For Orvex, benchmark marketing from any vendor (including future Orvex claims) should be sourced to independent, reproducible evaluations, not vendor-run leaderboards.
- **Multi-agent coordination is not really Supermemory's product.** Its docs emphasize per-account/per-project isolation for a single user's memory across apps, not agents handing off work to other agents with shared task/context graphs (the beads-inspired coordination model Orvex wants). Orvex's cross-agent memory track is closer to a distributed work-tracking system with memory attached than to Supermemory's personal-assistant-memory model — don't assume Supermemory's namespace model transfers to multi-agent handoff.
- **No fallbacks (per repo convention):** Supermemory's "knowledge base + personalized memory both on by default" and broad connector surface (Gmail, Drive, Notion...) is optimized for a consumer/prosumer multi-app assistant, not a hard-cut, auditable enterprise agent-memory system. Orvex should avoid importing that "sync everything, blend it all" posture — per `no-fallbacks-hard-cuts` and the wiki's staging-area design, Orvex wants an explicit review/staging boundary, not silent auto-merge into a blended memory store.
- **Governance/compliance evidence is thin.** SOC 2/HIPAA are claimed at the Scale tier but no certificate/report was found in sources checked; Orvex, building for enterprise multi-tenant customers, should not assume Supermemory-grade claims are audit-ready without asking for the actual report.

## Sources

- https://supermemory.ai/docs/supermemory-mcp/introduction
- https://github.com/supermemoryai/supermemory
- https://github.com/supermemoryai/supermemory-mcp
- https://supermemory.ai/pricing/
- https://supermemory.ai/blog/supermemory-raises-3-million-and-building-the-best-memory-engine-for-llms/
- https://techcrunch.com/2025/10/06/a-19-year-old-nabs-backing-from-google-execs-for-his-ai-memory-startup-supermemory/
- https://hindsight.vectorize.io/blog/2026/05/21/agent-memory-consolidation
- https://mem0.ai/compare/mem0-vs-supermemory
- https://mem0.ai/blog/comparison-mem0-vs-hindisght-vs-supermemory
