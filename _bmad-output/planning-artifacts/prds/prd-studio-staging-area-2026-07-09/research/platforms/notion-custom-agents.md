# Prior Art Deep-Dive: Notion Custom Agents

Researched 2026-07-10. Scope: staging-area track, cautionary anti-pattern (write-then-govern vs. Orvex's stage-then-review).

## What it is

Custom Agents are Notion's autonomous, trigger-driven AI workers, generally available since 24 February 2026 (Notion 3.3) on Business and Enterprise plans. Unlike the on-demand "Notion Agent" assistant, Custom Agents run unattended in the background off schedules or events, using a workspace's own pages/databases as context, and **write directly into live Notion content and connected tools** — there is no separate staging store. Users configure an agent via natural-language instructions (AI-assisted draft, a template, or from scratch), test it in a Chat tab, then deploy it against real triggers.
[Custom Agents – Notion Help Center](https://www.notion.com/help/custom-agents) · [Introducing Custom Agents](https://www.notion.com/blog/introducing-custom-agents) · [Feb 24, 2026 – Notion 3.3](https://www.notion.com/releases/2026-02-24)

## Behind it & traction

- Public beta launched Feb 2026, free through 3 May 2026; general availability with credit-based pricing from 4 May 2026.
- Beta traction (Notion's own numbers): 1M+ Custom Agents created in the two-month beta window; 21,000 built by early testers pre-GA; Notion says it has "more agents than employees" internally.
- Named customers/case studies: Ramp (300+ agents for internal Q&A), Braintrust ("Deal Spotter" reports), Clay ("Incident Reporter"), Remote (IT help-desk replacement, claimed 20 hrs/week saved), Heidi (claimed 60 hrs/month saved by one agent).
- These are marketing-blog claims (Notion's own case studies), not independently audited — treat as vendor-reported, not verified evidence.
[What we learned during the Custom Agents beta](https://www.notion.com/blog/what-we-learned-during-the-custom-agents-beta) · [Introducing Custom Agents](https://www.notion.com/blog/introducing-custom-agents)

## Architecture & data model

Unknown in technical/engineering-blog detail — Notion has not published an architecture post on Custom Agents' internals (model orchestration, storage, execution runtime). What's documented from a product-behavior standpoint:
- Agents are scoped objects with instructions, a trigger set, and an explicit access grant list (pages/databases/apps) — "agents act only on the pages, databases, and external apps you explicitly grant access to. They never have full workspace access by default."
- Model selection is pluggable per agent: Claude Fable 5 (Business/Enterprise only, requires admin enablement citing Anthropic data-handling policy), Claude Sonnet 5, GPT variants, Gemini, Grok, with lighter models (Haiku 4.5, GPT-5.4 Mini) introduced post-beta specifically to cut credit cost (Notion claims up to 10x fewer credits, ~50% cheaper to run).
- No published data model for how agent runs/edits are represented internally; user-facing surface is Notion's normal page/block/database model plus a per-agent Activity Log and workspace-wide Audit Log.
[Custom Agents – Notion Help Center](https://www.notion.com/help/custom-agents) · [What we learned during the Custom Agents beta](https://www.notion.com/blog/what-we-learned-during-the-custom-agents-beta)

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- **MCP**: Yes — first-class. Custom Agents connect to external tools via Model Context Protocol: pre-configured hosted MCP servers for popular apps (one-click auth), or custom MCP servers via publicly reachable URLs (workspace admin must enable "Custom MCP servers" under AI connectors). MCP tools work across all trigger types (scheduled, event, manual/@mention). Each MCP connection is scoped to one Custom Agent and runs under the credentials of whichever user authenticated it — connections are not shared across agents even to the same service. Notion also ships an official open-source MCP server (`makenotion/notion-mcp-server`) and a separate "Notion MCP" product exposing Notion itself as an MCP host to external AI clients.
- **Triggers**: scheduled/recurring (with timezone support), Notion events (comment added, page added/removed from DB, property updated, with filters), and Slack events (message posted, emoji reaction, @mention). No native email or generic webhook trigger documented.
- **Chat-platform surface**: Slack is a first-class trigger + read/write surface; agents can read and post to Slack channels. No CLI is documented for Custom Agents specifically (Notion has a general API/SDK for the workspace, but Custom Agent configuration is UI/chat-driven, not CLI-driven).
- **SDK**: none documented specifically for building/deploying Custom Agents programmatically — creation is via the Notion UI (AI-assisted, template, or manual instructions).
[MCP connections for Custom Agents](https://www.notion.com/help/mcp-connections-for-custom-agents) · [Notion's hosted MCP server: an inside look](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look) · [GitHub: makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server) · [Custom Agents – Notion Help Center](https://www.notion.com/help/custom-agents)

## Staging & review workflow (propose→review→apply/reject, granularity, batch review at 100-change scale, conflict handling, reviewer UX)

This is the core anti-pattern finding: **there is no staging tier**. Confirmed by direct evidence:

- **Propose→review→apply**: Does not exist as a workspace-content gate. Agents write directly to live pages/databases/Slack. The closest thing to a "review" primitive is per-*tool* (not per-*change*) confirmation: each MCP tool can be set to "Always ask" (human must approve/cancel before that tool call executes) or "Run automatically" (no confirmation) — "Always ask" is the default for write tools (create/update/delete/send), "Run automatically" is recommended only for read-only tools. This is a synchronous in-the-loop approval on a single tool call, not an asynchronous staged batch a reviewer triages later.
- **Change granularity**: undocumented at the field/section level. Edits land as ordinary Notion page/block writes; there's no evidence of a diff/patch abstraction distinct from Notion's native edit model.
- **Batch review at scale (e.g., 100 changes in one session)**: not supported. There is no batch queue of pending proposals to triage; recovery after the fact relies on Notion's per-page **version history / undo**, reviewed one page at a time, not a bulk review surface.
- **Conflict handling vs. live content**: not addressed in any Notion documentation found — no collision detection or concurrent-modification safeguard is described for agent writes clashing with human edits or other agents.
- **Reviewer UX / automation**: no dedicated reviewer role or approval queue exists. Governance is realized through: (a) the synchronous per-tool "Always ask" confirmation prompt, (b) after-the-fact per-agent **Activity Log** (what triggered a run, actions taken, errors) visible to users with Full Access, (c) workspace-wide **Audit Log** for Enterprise admins capturing agent config changes (instructions, permissions, integrations, trigger changes, credit-limit changes) and standard page-edit events attributed to the agent + the human who triggered the run, and (d) **credit-based rate governance**: per-agent credit limits, 80%/100% usage alerts, auto-pause when a workspace or agent exceeds its credit budget, and anomaly detection ("if a new agent starts spending unusually fast, it pauses and the creator is notified to review"). None of this is a content-approval gate — it is spend/rate throttling plus forensic audit trail, not pre-publication review.
[Custom Agents – Notion Help Center](https://www.notion.com/help/custom-agents) · [MCP connections for Custom Agents](https://www.notion.com/help/mcp-connections-for-custom-agents) · [May 5, 2026 – New Custom Agent controls for admins](https://www.notion.com/releases/2026-05-05) · [Buy & track Notion credits for Custom Agents](https://www.notion.com/help/buy-and-track-notion-credits-for-custom-agents) · [An admin's guide to getting started with Custom Agents](https://www.notion.com/help/guides/admin-guide-to-getting-started-with-custom-agents)

## Scale & operational evidence

- Vendor-reported beta scale: 1M+ agents created in ~2 months; Ramp running 300+ agents; no independent/third-party benchmark of run volume, latency, or failure rate found.
- Independent (non-Notion) reviews report real reliability problems: r/Notion threads (March 2026, per secondary source) describe Custom Agents silently failing to fire on scheduled triggers during the beta — a directly relevant cautionary data point since Orvex's staging area must survive a single session proposing changes to 100 documents without silent drops.
- Third-party reviewers (eesel AI, Síntesi Studio) characterize Custom Agents as strong at read/synthesize but weak at reliable write/execute *outside* Notion's own data (e.g., "can surface a Jira ticket but can't assign it or change its status"), and note that in a messy/poorly-permissioned workspace, autonomous agents amplify existing disorder rather than curate it — precisely the failure mode a librarian/review gate is meant to prevent.
[eesel AI: Notion AI review 2026](https://www.eesel.ai/blog/notion-ai-review) · [eesel AI: Notion review 2026](https://www.eesel.ai/blog/notion-review) · [Síntesi Studio: Notion Custom Agents — what actually works](https://www.sintesi.studio/blog/notion-custom-agents-honest-review)

## Pricing & positioning

- Requires Business plan ($20/user/month baseline per third-party pricing writeups) or Enterprise; Custom Agents themselves were free during the Feb–May 2026 beta, then moved to **Notion Credits**, a paid add-on, from 4 May 2026.
- Credits reportedly priced around $10 per 1,000 credits per third-party coverage (Notion's own official pricing page does not publish the per-credit rate; it defers to "purchase in-product or via account team" — treat the $10/1,000 figure as third-party-reported, unverified against Notion's own pricing page).
- Positioning: "Meet your 24/7 AI team" — Notion frames Custom Agents as autonomous teammates replacing recurring human workflows, competing on breadth (single workspace-as-agent-hub) rather than on governance rigor.
[Notion credits – Notion Help Center](https://www.notion.com/help/custom-agent-pricing) · [Meet your 24/7 AI team | Notion](https://www.notion.com/product/agents) · [eesel AI: Notion AI review 2026](https://www.eesel.ai/blog/notion-ai-review)

## STEAL - 3-5 concrete ideas for Orvex

1. **Per-write-type default confirmation posture, not per-agent.** Notion's "Always ask" default specifically on write-class MCP tools (create/update/delete/send) vs. auto-run for reads is a clean, cheap policy primitive Orvex's librarian config could adopt: default every *destructive* staged-change type (delete, replace) to mandatory review, while low-risk types (append, add-section) could be eligible for auto-merge rules — without waiting for a full trust model.
2. **Credit/rate anomaly detection as a second, orthogonal safety net.** Notion's "pause agent + notify creator if spend spikes abnormally" is a good complement (not substitute) to Orvex's review gate — a runaway agent proposing garbage to the staging store 1000x/session should trip a rate/anomaly circuit breaker even though staging already prevents live-content damage.
3. **Attribution binding: agent action + triggering human, always paired.** Notion's audit log always records both the agent and the human whose trigger caused the run. Orvex's staged-change records and librarian merge log should carry the same two-sided attribution (which agent proposed it, which end-user conversation/session generated it) for traceability.
4. **MCP-first tool surface with per-connection, per-user credential scoping.** Notion's model — each MCP connection is unique to one agent and runs under the authenticating user's own credentials, never shared — is a good pattern for Orvex's agent-to-staging-store MCP tool: scope write-capability tokens per agent instance, not a shared service credential.
5. **Named-customer scale story as validation, cautiously.** Ramp's 300-agent, Notion's "agents > employees" framing shows real enterprises will deploy hundreds of concurrently active agents against a shared knowledge base — useful ammunition for justifying the 100-documents-per-session batch-staging requirement as a realistic (even conservative) target, not a hypothetical.

## AVOID / where Orvex differs

- **No staging tier at all.** Notion's core anti-pattern: agents write directly to production pages/Slack; "review" is either a synchronous single-tool-call approval (blocks the agent mid-run, doesn't scale to reviewing 100 proposed document changes at once) or purely retrospective (activity/audit log + undo). Orvex's staging store is an explicit architectural rejection of this — proposals never touch the live wiki until a librarian pass.
- **No batch-review UX.** There is no queue/dashboard for a human (or AI reviewer) to triage N pending proposed changes together, compare against live content, and approve/reject/merge in bulk — Orvex's requirement to survive "a single chat session proposing updates to 100 documents" has no analogue in Notion's product; this is a genuine gap Orvex can differentiate on.
- **No conflict detection vs. live content.** Nothing in Notion's documentation addresses an agent's proposed edit colliding with a human's concurrent edit or another agent's edit — Orvex's staging model, sitting outside the wiki, needs to explicitly solve stale-base-version detection before the librarian merges (Notion evidently just lets last-write-win + version history be the safety net).
- **Governance is rate/spend-shaped, not content-quality-shaped.** Notion's admin levers (credit limits, pause-on-anomalous-spend, per-agent visibility) throttle *how much* an agent can do, not whether any given *piece of content* is any good before it lands. Orvex's librarian is explicitly a content-quality/routing/beautification gate — a different and, per the third-party reviews above ("amplifies disorder in a messy workspace"), evidently necessary layer that Notion lacks.
- **Confirmation dialog is agent-blocking, not async.** "Always ask" halts the agent's own run waiting on a human, which doesn't scale to unattended/scheduled agents (defeats the point of autonomy) and doesn't work for a single session generating 100 proposals — Orvex's decouple-via-staging-store avoids ever blocking the producing agent.

## Sources

- [Custom Agents – Notion Help Center](https://www.notion.com/help/custom-agents)
- [Introducing Custom Agents (Notion blog)](https://www.notion.com/blog/introducing-custom-agents)
- [February 24, 2026 – Notion 3.3: Custom Agents](https://www.notion.com/releases/2026-02-24)
- [What we learned during the Custom Agents beta (Notion blog)](https://www.notion.com/blog/what-we-learned-during-the-custom-agents-beta)
- [MCP connections for Custom Agents – Notion Help Center](https://www.notion.com/help/mcp-connections-for-custom-agents)
- [Notion's hosted MCP server: an inside look (Notion blog)](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look)
- [GitHub: makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server)
- [May 5, 2026 – New Custom Agent controls for admins](https://www.notion.com/releases/2026-05-05)
- [Buy & track Notion credits for Custom Agents – Notion Help Center](https://www.notion.com/help/buy-and-track-notion-credits-for-custom-agents)
- [Notion credits / Custom Agent pricing – Notion Help Center](https://www.notion.com/help/custom-agent-pricing)
- [An admin's guide to getting started with Custom Agents – Notion Help Center](https://www.notion.com/help/guides/admin-guide-to-getting-started-with-custom-agents)
- [Meet your 24/7 AI team | Notion](https://www.notion.com/product/agents)
- [eesel AI: Notion AI review 2026](https://www.eesel.ai/blog/notion-ai-review)
- [eesel AI: Notion review 2026 (docs/wikis vs. automation)](https://www.eesel.ai/blog/notion-review)
- [Síntesi Studio: Notion Custom Agents — what actually works (and what doesn't)](https://www.sintesi.studio/blog/notion-custom-agents-honest-review)
