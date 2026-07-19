# Prior Art Deep-Dive: HumanLayer + LangGraph Agent Inbox

Researched 2026-07-10. Two related but distinct projects: **HumanLayer** (YC-backed startup, originally a human-approval API/SDK for agent tool calls) and **Agent Inbox** (LangChain's own open-source inbox UI for LangGraph `interrupt()`s). They are frequently cited together as "the" approve/reject seam for agents, but as of mid-2026 they have diverged significantly.

## What it is

- **HumanLayer (original, 2024)**: an API/SDK that let developers require human approval before sensitive agent tool calls, route approval requests across Slack/Email/Discord, and "contact a human as a tool." Framework-agnostic (LangChain, CrewAI, Vercel AI SDK, Mastra, etc.), sitting at the tool-calling layer rather than owning orchestration. [PyPI](https://pypi.org/project/humanlayer/), [YC launch](https://www.ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond)
- **HumanLayer (current, 2026)**: the company has pivoted hard — it is now positioned as an AI coding IDE / "CodeLayer" for multi-agent software engineering workflows ("ship 2-3x faster... Token Smarter, not Harder"), built around a QRSPI workflow (Questions → Research → Design → Structure → Plan → Implement) and real-time human/agent collaboration on design docs before implementation. The original generic human-approval-for-tool-calls product is no longer the front-door offering. [humanlayer.com](https://humanlayer.dev), [GitHub repo notice](https://github.com/humanlayer/humanlayer) (marks the public repo as a deprecated issue tracker, project rebuilt at humanlayer.com)
- **LangGraph Agent Inbox**: a separate, LangChain-maintained open-source Next.js app — a Gmail-style inbox UI that polls a LangGraph deployment for `interrupt()`-generated pending items and lets a human accept/edit/respond/ignore them, then resumes the graph. [github.com/langchain-ai/agent-inbox](https://github.com/langchain-ai/agent-inbox)

## Behind it & traction

- HumanLayer: YC-backed (YC F24 batch), raised on the order of ~$0.5M–3M depending on source (Crunchbase lists a $0.5M convertible note Oct 2024; other aggregators cite up to $3M from YC, Pioneer Fund, Multimodal Ventures, and angels including Guillermo Rauch and Paul Klein). Sources disagree on exact total — treat as small/seed-stage, not deeply capitalized. [Crunchbase](https://www.crunchbase.com/organization/humanlayer), [YC company page](https://www.ycombinator.com/companies/humanlayer)
- Strategic/angel backers named on their site: Vercel, Browserbase, Daily. Customer logos shown: Upstart, Osmosis, Ambral, Nautilus, SQDS, Weave, Ristotto, Roadrunner — logos only, no case studies or usage numbers published. [humanlayer.dev](https://humanlayer.dev)
- GitHub (`humanlayer/humanlayer`): 11.1k stars, 2,098 commits, 714 releases, 37 open issues — but the README itself says this repo is now a deprecated issue tracker for the pre-pivot product.
- Agent Inbox (`langchain-ai/agent-inbox`): 1,000 stars, 141 forks, 337 commits, 11 open issues, 15 open PRs, MIT license — smaller but actively maintained by LangChain directly, which is a stronger traction signal than raw stars given it's a first-party LangChain tool.

## Architecture & data model

Agent Inbox / LangGraph `interrupt()` (the actual approve/reject mechanism underlying both projects):
- Core primitive is `interrupt()`, which halts graph execution at any node and requires a **checkpointer** (persistent, e.g. `AsyncPostgresSaver` in production; `InMemorySaver` for testing) to save state across the pause — this is the "parks pending items at zero cost" property: a checkpointed thread consumes no compute while awaiting a human, only storage. [LangChain HITL docs](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- Execution is addressed by a `thread_id` in the run config, which ties a specific interrupt back to a specific conversation/session.
- Data model per pending item:
  - `HumanInterrupt`: `action_request` (action name + args), `config` (booleans for which responses are allowed: ignore/respond/edit/accept), `description` (optional markdown context shown to the reviewer)
  - `HumanResponse`: `type` ∈ {accept, ignore, response, edit} + `args`
- Multi-tool-call batches: when a model proposes several tool calls in one step, each becomes its own interrupt/decision, decisions must be returned in the same order the actions were proposed, and calls whose `when` predicate evaluates false are never added to the batch at all (silently auto-run, not shown to the reviewer).
- Policy-based auto-approval: tools can be marked `interrupt_on: False` to always auto-approve, or gated by a `when` predicate for conditional interrupt — this is the closest thing to an "auto-approve rule" system; there is no learned/AI-driven auto-approval in the OSS core.
- Scale numbers for the underlying LangGraph checkpoint store come from third-party production write-ups, not LangChain itself: one blog reports 18,400 checkpoint writes/sec across six shards with p99 write latency under 30ms, and warns that at 100 concurrent users write-ahead-log throughput can spike to ~150MB/s causing disk I/O bottlenecks — treat these as one practitioner's numbers, not vendor-published SLAs. [NVIDIA technical blog on scaling LangGraph](https://developer.nvidia.com/blog/how-to-scale-your-langgraph-agents-in-production-from-a-single-user-to-1000-coworkers/)

HumanLayer's original approval-API architecture (2024-era, now de-emphasized): decorator-based (`@human_approval` style) wraps a function call, request routed via configured channel (Slack/Email/Discord/Teams/SMS on paid tiers), response comes back via webhook, and the SDK records the decision for "learning"/future auto-approval. No independent architecture detail was available for the current CodeLayer product beyond marketing copy.

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- HumanLayer (original product): Python/TS-ish SDK across LangChain, CrewAI, ControlFlow, Vercel AI SDK, Mastra; approval routing over Slack, Email, Discord, (paid tiers add Microsoft Teams, SMS, RCS); webhooks for agent/response events; CLI + a React embed component. No MCP-specific integration was surfaced in research.
- HumanLayer (current CodeLayer product): described as an IDE with a "remote daemon," multi-repo workspace/worktree management, and BYOK model access to Claude/Codex — i.e. it is now closer to a coding-agent orchestration tool than a generic approval API. No public MCP server was found for it.
- Agent Inbox: pure frontend — connects to a LangGraph Platform deployment via a LangSmith API key + deployment URL + graph ID, and polls that deployment's API for interrupts. No CLI or MCP surface; it is a UI layer on top of LangGraph's own APIs, not a standalone service.

## Staging & review workflow

- **Propose → review → apply/reject**: an agent's tool call (or `interrupt()` call) becomes a pending item tied to a checkpointed thread; a human reviewer sees it in Agent Inbox and chooses accept / edit / respond / ignore; the response is fed back into `interrupt()`'s return value and the graph resumes deterministically from that point.
- **Change granularity**: one interrupt = one action/tool call, not a whole document or session. There is no built-in concept of grouping many tool calls into one "session-level" review; each proposed action is reviewed (or auto-approved) independently, though a batch of simultaneous tool calls from one step is shown as an ordered set.
- **Batch review at scale (100 changes in one session)**: no first-party evidence found that Agent Inbox or HumanLayer have been demonstrated/benchmarked at 100-pending-items-per-session scale. The docs establish the *mechanism* scales (checkpointed interrupts are cheap to park, ordering is preserved), but there is no published UI/UX pattern for a reviewer triaging 100 queued items at once (no bulk-accept, no diff view across items, no priority sorting called out in docs).
- **Conflict handling vs. live content**: not addressed in any source found. LangGraph's HITL docs are silent on what happens if underlying state changes between when an interrupt is raised and when it's resolved (e.g., two agents proposing conflicting edits to the same resource). This is an explicit gap, not just an omission by us — worth flagging as unresolved in the prior art, not solved-and-uncopied.
- **Reviewer UX + automation**: reviewer UX is "Gmail-like" — a list, expand for detail (markdown description + action args), buttons for accept/edit/respond/ignore. Automation is limited to static policy (which tools always interrupt vs. always auto-approve, or a `when` predicate); there is no AI-reviewer / LLM-as-approver pattern documented in either project's OSS core.

## Scale & operational evidence

- No vendor-published benchmark exists for either project at agent-fleet scale (e.g., "N agents proposing M changes/day").
- The only concrete scale numbers found are third-party (non-vendor) LangGraph checkpoint-store benchmarks: 18,400 checkpoint writes/sec across 6 shards, p99 <30ms; and a warning that 100 concurrent users can push WAL throughput to ~150MB/s and cause I/O bottlenecks unless large payloads (logs, attachments) are offloaded to Redis/S3 rather than kept in graph state ("Pointer State Pattern"). [NVIDIA dev blog](https://developer.nvidia.com/blog/how-to-scale-your-langgraph-agents-in-production-from-a-single-user-to-1000-coworkers/) — this is a practitioner blog, not a LangChain or HumanLayer SLA, so treat as illustrative not authoritative.
- HumanLayer's customer logos (Upstart, Osmosis, Nautilus, etc.) are marketing evidence only — no case study, usage volume, or uptime data published alongside them.

## Pricing & positioning

- HumanLayer (current, CodeLayer product):
  - **Starter (free)**: up to 3 team members, 200 sessions/month
  - **Pro ($100/user/month)**: BYOK for Claude/Codex/others, unlimited tasks/sessions, multi-repo workspace + worktrees, inline diagrams/mockups, real-time human+AI collaboration on design docs, remote daemon infra
  - **Enterprise (custom)**: SSO/SAML, audit logging, volume pricing, on-prem/private VPC
  - Notably billed **per seat**, not per approval/interrupt volume, and pricing is now for a coding-IDE product, not a generic human-approval API — the thing this task asked us to deep-dive (a purpose-built approve/reject seam) is no longer HumanLayer's flagship product. [humanlayer.dev/pricing]
- Agent Inbox: free, open-source (MIT), no pricing — it's a reference UI on top of LangGraph Platform, whose own pricing is separate and not covered here.
- Positioning takeaway: the "agent proposes, human approves" market has bifurcated — LangChain kept the generic OSS primitive (`interrupt()` + Agent Inbox) as a low-level building block, while HumanLayer (one of the earliest companies in this exact niche) migrated upmarket into a coding-agent IDE, suggesting the generic "approval API as a standalone product" niche was not primarily what deep-pocketed HITL demand looked like in the SDLC space.

## STEAL - 3-5 concrete ideas for Orvex

1. **Checkpointed-thread parking is the right cost model.** Orvex's staging store should ensure a pending proposal costs storage only, zero compute, while awaiting librarian review — mirror LangGraph's checkpointer pattern so 100 agents each proposing changes overnight doesn't burn compute sitting idle in a queue.
2. **Per-action typed decision, not per-document blob.** Copy the `HumanInterrupt`/`HumanResponse` shape: each proposed change carries an explicit `action_request` (what/where/args) plus a `config` of which response types are legal for it (e.g., a delete might only allow accept/reject, not edit) — gives the librarian agent a structured contract instead of free-text diffs.
3. **Static auto-approve policy as a first cut, not an AI reviewer.** Their `interrupt_on: False` / `when`-predicate mechanism is a cheap, auditable way to skip review for low-risk proposal types (e.g., typo fixes) before Orvex invests in a full AI-librarian-as-reviewer — ship the deterministic policy layer first, since even LangChain's OSS core hasn't gone further than this.
4. **Offload large payloads out of the review-state row (Pointer State Pattern).** For the 100-document-in-one-session case, store diff bodies/attachments in blob storage and keep only pointers in the queue row — directly addresses the WAL/I-O bottleneck the NVIDIA writeup warns about, and Orvex will hit that exact shape (100 proposals, each potentially a full document body).
5. **Preserve batch ordering but don't force strict sequential review.** LangGraph preserves proposal order within a batch; Orvex's librarian UX should keep that but explicitly design for *bulk* triage (sort/filter/bulk-accept across the 100) since neither HumanLayer nor Agent Inbox has solved that UX — this is whitespace Orvex can differentiate on.

## AVOID / where Orvex differs

- **Don't copy the "one interrupt = one tool call" granularity as the only unit.** It works for agent-execution gating but Orvex's use case is explicitly document/section-level content changes across up to 100 documents in a single session — Orvex needs a session/batch as a first-class object with its own state, which neither prior-art project models (each interrupt is independent and there's no native "up to 100 in one review pass" UX).
- **Don't inherit the conflict-handling gap.** Neither project documents what happens when live content changes underneath a pending proposal; Orvex's wiki is a live, multi-writer surface (librarian + human editors), so this must be designed explicitly rather than assumed away.
- **Don't chase HumanLayer's current product shape.** Its pivot into a per-seat ($100/user/month) coding IDE confirms the standalone "agent-approval-API" business didn't scale as a company on its own — validates that Orvex's approach (staging as a feature of the platform, not a sellable point solution) is the more defensible shape, but also means there's no longer a mature commercial reference implementation to benchmark against for the exact use case.
- **Don't assume AI-reviewer automation is a solved pattern to borrow.** Both projects stop at static policy rules; Orvex's "librarian agent that reviews, routes, merges and beautifies" is more ambitious than anything found in this prior art — treat it as green field, not an area to copy-adapt.
- **Be skeptical of scale claims.** No first-party benchmark exists for either project at 100-items/session; the only numbers available are a third-party LangGraph infra blog, not evidence about the inbox/review UX layer at all. Do not cite "Agent Inbox is proven at scale" — it isn't, per available evidence.

## Sources

- [HumanLayer PyPI package](https://pypi.org/project/humanlayer/)
- [HumanLayer — Y Combinator launch post](https://www.ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond)
- [HumanLayer — Y Combinator company page](https://www.ycombinator.com/companies/humanlayer)
- [humanlayer.dev (current site/positioning/pricing)](https://humanlayer.dev)
- [github.com/humanlayer/humanlayer (deprecated public repo, issue tracker only)](https://github.com/humanlayer/humanlayer)
- [github.com/langchain-ai/agent-inbox](https://github.com/langchain-ai/agent-inbox)
- [LangChain docs — Human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- [NVIDIA Technical Blog — Scaling LangGraph agents from a single user to 1,000 coworkers](https://developer.nvidia.com/blog/how-to-scale-your-langgraph-agents-in-production-from-a-single-user-to-1000-coworkers/)
- [Crunchbase — HumanLayer company profile](https://www.crunchbase.com/organization/humanlayer)
- [Crunchbase — HumanLayer Pre-Seed round](https://www.crunchbase.com/funding_round/humanlayer-pre-seed--ba5f5592)
- ["Stop Building Bad AI Agents! Agent Inbox Fixes HIL" (third-party blog, context only, not authoritative)](https://prompts.brightcoding.dev/blog/stop-building-bad-ai-agents-agent-inbox-fixes-hil)
