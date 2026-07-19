---
title: "Prior-art coverage verdict + gaps — Agent Staging Area + Librarian"
track: agent-staging-area
status: completeness-critic
created: 2026-07-10
role: completeness critic for the STAGING prior-art sweep
---

# Coverage verdict

**Adequate on the axes already chosen; two real holes.** The 10 profiled platforms cover the
core design lenses well: wiki moderation at scale (Wikipedia), PR-review for docs/data (GitHub,
Dolt), CMS content-staging incl. one shipping AI-write product (Sanity), configurable editorial
state machines (Drupal, Confluence+Comala), HITL agent approval (HumanLayer/Agent Inbox),
suggestion-mode editing (Google Docs), high-volume moderation queues + trust-tiering (Stack
Overflow), and post-merge trust decay (Guru). The 100-doc atomic case has two independent answers
(Sanity Content Releases, Drupal Workspaces).

Two gaps survive that would materially change the PRD:

1. **No regulated / controlled-document-management prior art.** This is the biggest miss. The
   pharma/manufacturing "controlled document" world (GxP, ISO-9001, FDA 21 CFR Part 11) has run
   exactly Orvex's problem — *nothing enters the controlled repository without review* — for
   decades, at high stakes, non-AI, and has solved sub-problems the AI-era candidates leave as
   "unknown/underspecified": **multi-document change control** (atomically promote N documents as
   one governed change = the 100-doc case), **automated periodic re-review** (Guru's trust-decay
   but rigorous and scheduled), **effective-dating** (a version is approved yet not yet live),
   and **e-signature audit trails**. Veeva Vault QualityDocs is the reference implementation.

2. **The profiled AI candidates under-sample the big-vendor 2025-2026 move — and it cuts AGAINST
   Orvex's thesis.** Sanity (stages to drafts/releases) is the *one* vendor that stages AI writes.
   But the other three big knowledge-platform vendors shipped native AI agents that write into the
   KB in 2025-2026 with **governance + audit + in-editor human control INSTEAD OF a staging plane**:
   Atlassian Rovo (into Confluence, a direct Docmost peer), Notion Custom Agents (into the
   workspace), Microsoft 365 Copilot / SharePoint Knowledge Agent. The meta-finding — the market
   is betting on "govern the agent" not "stage the write" — is itself PRD-load-bearing (it is
   Orvex's differentiation, and a risk signal that a staging plane may be seen as friction). Only
   Confluence is in the set, and via **Comala** (a third-party human-approval workflow), which is a
   different thing from **Rovo** (Atlassian's first-party AI agent layer).

Nothing else rises to "would change the PRD." Deliberately NOT adding: WordPress/Reddit AutoMod
(Stack Overflow already carries queue+trust-tiering), Glean (read-mostly enterprise search),
PlanetScale deploy requests / Liquibase (Dolt covers structured-data PR-merge), ITIL/ServiceNow
CAB (risk-tiered change approval is well-represented by Stack Overflow trust-tiering + Veeva change
control; a third would pad), localization TMS / translation memory (segment-level review + reuse is
interesting but bleeds into the *memory* track, not staging). Logged, not profiled.

# Fill-in platforms (4) — genuinely new, non-padding

## A. Veeva Vault QualityDocs — regulated GxP controlled-document lifecycle  `veeva-vault-qualitydocs`
- **category:** regulated / controlled document management (unglamorous non-AI gold standard) — UNCOVERED SEGMENT
- **angle:** The mature, high-stakes, decades-proven answer to "nothing enters the controlled
  repository without review," with primitives the AI-era candidates leave underspecified.
- **Mine:** draft→review→approved→**effective** lifecycle (approved-but-not-yet-live = a staged
  successor waiting to supersede canonical); **Multi-Document Change Control** (promote N docs as
  one governed change — a fourth independent design for the 100-doc atomic case, and the most
  rigorous); **automated periodic review** (a scheduled job finds docs due and spawns review tasks
  — the disciplined form of Guru's trust decay); role-specific review tasks + e-signature (21 CFR
  Part 11); full versioned audit trail; configurable change control (customer-tunable, like the
  per-customer librarian policy).
- **Why it changes the PRD:** imports effective-dating, atomic multi-doc change, and scheduled
  re-review as first-class primitives; sets the audit/compliance bar for regulated Orvex tenants.

## B. Atlassian Rovo (Confluence AI agents)  `atlassian-rovo-confluence`
- **category:** first-party AI agents writing into a wiki that is a direct Docmost peer (hyperscaler-tier vendor)
- **angle:** The closest big-vendor analog to Orvex's *exact product shape* — autonomous/assistive
  AI agents acting inside a real wiki — and, crucially, it appears to bet on **governance + audit +
  in-editor `/ai` human control rather than a staging plane outside the wiki.** Distinct from the
  Comala profile (third-party human workflow, no AI).
- **Mine:** custom/no-code agents that create & edit Confluence pages; `/ai` in-editor draft seam
  (human-in-loop, not staged-outside); Team '26 (May 2026) enterprise agent-governance —
  dashboards, audit logging, granular controls over agent behavior; Teamwork Graph as the routing
  substrate. Test the hypothesis: does Rovo stage agent output for review, or write in place under
  governance? Either answer is instructive.
- **Why it changes the PRD:** it's the primary competitor's opposite bet (govern-the-agent vs
  stage-the-write); Orvex must position its staging plane against "just add governance + audit."

## C. Notion Custom Agents  `notion-custom-agents`
- **category:** 2025-2026 AI-native all-in-one workspace/wiki competitor with autonomous agents
- **angle:** May 2026 "workspace as a hub for AI agents" — the closest all-in-one product shape to
  Docmost+agents, and a **cautionary anti-pattern**: agents build pages / update DB properties
  directly, governed by admin controls + audit rather than a review/staging gate.
- **Mine:** Custom Agents that run **autonomously on schedules / event triggers** (vs a personal
  manually-directed agent) — the trigger model for when a proposing agent fires; admin circuit
  breakers ("if an agent is pacing higher than expected, disable it") = a **rate-based kill switch**
  distinct from per-item review; per-run audit trail (trigger → what it did → why); who-can-create-
  agents access tiers; MCP-connected agents.
- **Why it changes the PRD:** direct competitor; validates Orvex's staging thesis by contrast
  (Notion's write-direct + disable-if-runaway is the failure mode staging prevents), and donates
  the scheduled/triggered-agent + rate-limit-circuit-breaker patterns.

## D. Microsoft 365 Copilot / SharePoint Knowledge Agent  `microsoft-sharepoint-knowledge-agent`
- **category:** the true hyperscaler move — AI agents over an enterprise knowledge repository (GA early 2026)
- **angle:** Hyperscaler-scale governance of AI-in-KB, contributing a primitive none of the others
  have: **AI-grounding scoping decoupled from human ACLs.**
- **Mine:** **content-safety metadata flags that exclude a site/file from ALL Copilot & declarative-
  agent grounding even while it stays human-visible in search** — a per-resource "AI may not touch
  this" control independent of read permissions (directly reusable for scoping which wiki
  spaces/pages agents may propose against or read); **site-owner agent approval** (owner approves /
  sets-default / deletes agents) = a per-space human gate on which agents operate; declarative-agent
  knowledge-source binding; content-moderation response filters.
- **Why it changes the PRD:** the grounding-exclusion-flag is a clean model for per-tenant, per-
  space AI-access policy (what agents may read/propose against) separate from human permissions —
  a control surface the librarian/staging design will need.

# Sources (verification)
- [Rovo in Confluence: AI features | Atlassian](https://www.atlassian.com/software/confluence/ai)
- [The AI-powered way to create and edit content in Confluence | Atlassian](https://www.atlassian.com/software/confluence/create-and-edit-with-rovo)
- [Atlassian Rovo AI Agents 2026 review (Kvasar)](https://landing.kvasar.tech/articles/atlassian-s-rovo-agents-dissected/) — Team '26 governance/audit
- [QualityDocs Overview | Veeva Vault Help](https://quality.veevavault.help/en/lr/5442/)
- [Configuring Multi-Document Change Control (QualityDocs) | Veeva Vault Help](https://quality.veevavault.help/en/gr/37406/)
- [Configuring Periodic Review (QualityDocs) | Veeva Vault Help](https://quality.veevavault.help/en/gr/72024/)
- [Notion just turned its workspace into a hub for AI agents | TechCrunch](https://techcrunch.com/2026/05/13/notion-just-turned-its-workspace-into-a-hub-for-ai-agents/)
- [Meet your 24/7 AI team | Notion](https://www.notion.com/product/agents)
- [Introducing Knowledge Agent in SharePoint | Microsoft Community Hub](https://techcommunity.microsoft.com/blog/spblog/introducing-knowledge-agent-in-sharepoint/4454154)
- [Add knowledge sources to your declarative agent in M365 Copilot | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-add-knowledge)
