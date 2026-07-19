---
title: "Staging prior-art synthesis — Agent Staging Area + Librarian"
track: agent-staging-area
status: synthesis
created: 2026-07-10
inputs: 14 platform profiles + _candidates.md + _gaps.md (research/platforms/)
scope: >
  Cross-cuts every profiled platform for (a) a safe agent-write staging store OUTSIDE the wiki and
  (b) a per-customer-tweakable librarian that reviews/routes/merges/beautifies staged content in.
  Stress case throughout: one chat session proposing changes to 100 documents.
note: Every claim below traces to a profile file that carries its own sources. No new claims introduced.
---

# Staging prior-art synthesis

**Biggest strategic insight:** The big-vendor 2025-2026 bet is *govern the agent's direct write* (Atlassian Rovo, Notion Custom Agents, Microsoft SharePoint) — permissions + audit + rate limits over a staging plane. Only **Sanity** stages AI writes at all, and **nobody** ships a per-customer AI *reviewer* that merges. Orvex's "outside-the-wiki staging + librarian" is therefore genuine white space — but the same evidence base argues hard against three of Orvex's leaning choices (Dolt storage, literal separate store, section/field granularity), and warns that *every* platform's 100-doc atomic-batch claim is unbenchmarked marketing.

---

## 1. Landscape map

Four segments emerge: **wiki/CMS staging** (draft plane native to the store), **PR-model review** (branch/diff/merge), **moderation-queue + trust** (crowd/regulated), and **AI-agent governance** (the 2025-2026 vendor wave). The staging-adjacent gold is concentrated in the first and third; the fourth is mostly the *anti-pattern* (write-then-govern) Orvex is inverting.

| Platform | Segment | Data model (staging unit) | Surfaces | Scale evidence | Pricing signal | #1 steal |
|---|---|---|---|---|---|---|
| **Wikipedia** (Pending Changes / AfC / FlaggedRevs) | Wiki moderation at scale | Dual pointer (draft vs. stable) in *same* revision stream; `Draft:` namespace; diff/whole-page granularity | MediaWiki Action API, ORES ML risk score (advisory), Page Curation toolbar; no MCP/SDK | Hard: AfC backlog 3,268-5,000+; some wikis >1,000-day unreviewed backlog; deployment moratorium since 2017 | Free/OSS (GPL); 7-mo/8-staff rollout = expensive to build | **Trust-tiered autopromotion** — clean track record auto-bypasses review (the throughput valve) |
| **GitHub** (PRs + Suggested Changes + Merge Queue) | PR-model review for code/docs | Branch = staging; PR = diff envelope; file/hunk granularity, no doc/section awareness | REST + GraphQL, `gh` CLI, Copilot review (comment-only, never approve) | 518.7M PRs merged/yr; merge-queue corruption reported under agentic load (third-party) | Bundled into seats ($4-$21+/user/mo); review pipeline not itself priced | **Speculative-merge validation** — re-validate approved change against *current* live state, evict only the conflicting one |
| **Dolt / DoltHub** (Data PRs) | PR-model for structured data | Prolly-tree; branch-per-proposal; **cell (row×col) granularity**; schema-conflict vs data-conflict split | MySQL/Postgres wire, official MCP server (stdio+HTTP), web PR UI | Beads runs it for agent memory; "millions of versions" (vendor, unbenchmarked); auto-commit "db read-only" errors under batch load | DoltHub Pro $5/mo <5GB; Hosted ~$438/mo (unconfirmed) | **Cell/field-level conflict keying** — key proposals by (document_id, section/field), not whole-doc |
| **Sanity** (Content Releases + Content Agent) | CMS staging + shipping AI-write | `drafts.*` shadow + N per-Release versions coexisting with published; field/doc/bulk | Hosted MCP (mcp.sanity.io, 40+ tools), Content Agent API (Vercel AI SDK), Slack | Vendor-only ("650 franchise pages"); no doc-per-release ceiling published | Free/$15-seat; **Content Releases (the batch answer) is Enterprise-gated** | **Agent creds physically can only write drafts/versions**, never published — enforce isolation in the storage layer |
| **Drupal** (Workspaces + Content Moderation) | Editorial config state machine | Workspace = parallel site copy; whole-entity granularity; revision-tree parent tracking; soft-delete | JSON:API/REST; no MCP/CLI/SDK for it | Legacy contrib 138 sites; core usage unknown; "zero overhead"/batch claims unverified | Free/OSS; Tag1 monetizes via consulting | **Split the two axes** — batching (which proposals group) orthogonal to per-item workflow state |
| **HumanLayer + LangGraph Agent Inbox** | HITL agent approval | `interrupt()` + checkpointer; one interrupt = one tool call; typed `HumanInterrupt`/`HumanResponse` | SDK (LangChain/CrewAI/Vercel), Agent Inbox UI (polls), Slack/email routing | No first-party 100-item benchmark; 3rd-party: 18,400 checkpoint writes/s, WAL bottleneck at 100 users | Agent Inbox free/MIT; HumanLayer pivoted to $100/seat coding IDE | **Checkpointed parking** — a pending proposal costs storage only, zero compute, while it waits |
| **Google Docs** (Suggesting mode) | Suggestion-mode editor | Suggestions as `suggestedInsertionIds`/`deletionIds` annotations *on* live doc; sub-paragraph granularity | REST + SDKs; write/accept/reject still **Developer Preview**, not GA; no MCP | No high-suggestion-count scale evidence; 12-yr-unfilled "selective bulk accept" gap | Free in all Workspace tiers | **Re-fetch current state before resolving** any op; hard-conflict if base moved (fits no-fallbacks rule) |
| **Confluence + Comala** | Enterprise wiki + configurable approval | State label over *live* page (no staging copy); whole-page granularity; per-space workflows by label | Status/Activity/CQL REST; no MCP/CLI/chat plugin | Install counts only (6,077 / 753); no batch-review evidence | Paid Marketplace app (~$3,600/yr, unconfirmed) | **Per-space workflow selected by content label** = per-doc-type librarian policy without separate spaces |
| **Stack Overflow** (Suggested Edits + Stack Internal) | Crowd moderation queue + trust | Suggested edit = diff object separate from canonical; field/segment granularity; AI pre-scores in Stack Internal | Stack Internal first-party **bidirectional MCP** (read grounding + write-back); read API | Proven historically (>200k Q/mo peak); now 76% decline; exact quorum unconfirmable | Teams $6.50-$13.50/seat; Ingestion = Enterprise | **Queue admission control** — "if the queue is full, stop accepting edits" backpressure valve |
| **Guru** | Post-merge trust decay | Per-Card verifier + interval + status; post-*publish* loop, no pre-publish gate | REST, Slack/Teams (verify-from-Slack), Chrome; markets itself as MCP-servable | No published verification-at-scale metrics | Was ~$25/seat; now hides price behind "talk to sales" + Expertise Layer | **Retrieval-time trust gating** — agent MCP grounds only on content above a trust threshold |
| **Veeva Vault QualityDocs** | Regulated controlled-doc lifecycle | Draft→review→approved→**effective**; whole-doc; DCR (proposal) + DCC (batched change) objects | REST + Java SDK + batch IDF; **no MCP/agent surface** (pre-LLM stack) | 500+ companies (marketing); MDCC batch ceiling unknown | Opaque enterprise contracts, 5-figure+ onboarding | **Batch = first-class ChangeSet object** (DCR+DCC) with all-or-nothing state gate + related-proposal auto-discovery |
| **Atlassian Rovo** (Confluence AI agents) | AI-agent governance (govern-not-stage) | **No staging plane**; direct write; agent acts under invoking user's permissions; page-level | Official remote MCP server (OAuth + API-token M2M), Teamwork Graph MCP+CLI, `/ai` in editor | 14M+ Rovo actions/mo (vendor); community: hallucinated write-success, amplifies messy content | Bundled into paid Jira/Confluence; Rovo credits 25-150/user/mo | **Inherit the proposing agent's existing RBAC**; ship a fleet-level "what have my agents proposed" dashboard |
| **Notion Custom Agents** | AI-agent governance (write-direct) | **No staging tier**; direct write to live pages/Slack; per-*tool* "Always ask" confirm, not per-change | First-class MCP (per-agent, per-user scoped creds); Slack triggers; UI-configured | 1M+ agents in beta (vendor); silent scheduled-trigger failures reported | Business $20/user + Notion Credits (~$10/1k, unconfirmed) | **Per-write-type default posture** (destructive=ask, read=auto) + **rate/anomaly circuit-breaker** as orthogonal safety net |
| **Microsoft SharePoint Knowledge Agent** | Hyperscaler AI-over-KB (read-only) | **No write-staging**; read/ground only; agent-approval gate is for *agents*, not content; site-level | PowerShell cmdlets, Copilot Studio, admin UI; no MCP found | Flag propagation >1 week for >500k-item sites; area still being deprecated/replaced | Copilot $18-$30/user + Azure PAYG; SPAM governance = paid add-on | **AI-groundable flag decoupled from human ACLs** — mark content "human-only, agents may not cite/edit" independent of read permission |

---

## 2. Recurring design patterns

The workflow patterns everyone converges on — and who owns each step:

- **Proposal is a first-class object separate from canonical, resolved as a diff.** Universal wherever staging exists: SO suggested-edit (diff object), GitHub PR (diff envelope), Google Docs (annotation IDs), Sanity draft, Veeva DCR, Wikipedia pending revision. *Agent authors it; reviewer resolves it against a diff view; canonical is never mutated until accept.* The three govern-not-stage vendors (Rovo, Notion, SharePoint) are the explicit exceptions — and they carry the visible pain (hallucinated write-success, "amplifies disorder").

- **Batch = one named, atomic, reviewable, rollback-able container** — the dominant answer to the 100-doc case. Four independent designs: Sanity **Content Release**, Drupal **Workspace**, Veeva **DCC/Multi-Document Change Control**, and (implicitly) Beads' **branch-per-session** on Dolt. *The producing session emits one container; the reviewer accepts/schedules/rolls-back at container level with per-item drill-down.* Nobody triages 100 independent rows.

- **Atomicity via workflow-state gate, not a true transaction.** Veeva's "advance only once *every* member doc reaches the required state" and Sanity's release-run are state-machine gates, not cross-domain DB transactions — because the staging store and the live store are different storage domains (true for Orvex too). *The batch cannot go effective while any member lags; but it is optimistic/polling, not ACID.*

- **Conflict handling = optimistic base-version tracking, resolve against current state.** Drupal Multiversion flags a conflict "when two revisions share the same parent"; Google Docs *requires* re-fetch with inline suggestions for correct indices before further writes; Wikipedia collapses the pending stack by accepting the latest. *Nobody does three-way auto-merge of prose.* HumanLayer, Sanity, Notion, Rovo all leave the stale-base/concurrent-edit problem **explicitly undocumented** — a shared gap, not a solved-and-uncopied thing.

- **Approval policy is tiered, and AI is advisory — never the autonomous approver.** Trust-tiering that skips review: Wikipedia autopromotion (account age/edit count/revert history), SO reputation gates. Static per-type policy: LangGraph `interrupt_on:False`/`when`, Notion "Always ask" on write tools, Comala `partial=true` first-decision-wins. AI as *risk score for human triage*: Wikipedia ORES, Stack Internal pre-scoring. AI deliberately *barred from self-approving*: GitHub Copilot is comment-only-never-approve; Veeva mandates human e-signature (21 CFR Part 11). *In every profiled system, the final accept is a human, a static rule, or a trust tier — never an LLM judging content autonomously.*

- **Queue backpressure + provenance are load-bearing at scale.** SO caps the queue ("if full, stop accepting"); Wikipedia's own 1,000-day backlogs prove a pure human queue silently rots without admission control + alerting. Provenance is two-sided: Notion pairs agent-action + triggering-human in the audit log; Google Docs attaches immutable suggestion provenance; SO preserves full `PostHistory`. *Park pending items at storage-cost-only (LangGraph checkpointer), offload diff bodies to blob with pointers in the queue row (Pointer State Pattern).*

- **Governance-as-product + MCP-first, bidirectional read/propose.** Rovo, SharePoint (SPAM), Guru, Veeva all sell/surface the safety-scoping layer as a *named, demoable* capability, not a buried detail. Dolt, Sanity, Stack Internal, Rovo, Notion all expose MCP; Stack Internal makes the *same* MCP surface both serve grounding and accept write-back. Machine-to-machine auth (Rovo API-token / Notion per-agent creds) is distinct from interactive OAuth.

---

## 3. White space — what NOBODY does that Orvex covers

Honest assessment: Orvex's design occupies four genuinely unoccupied cells, but two of them are unoccupied partly *because they are hard/risky*, not merely overlooked.

1. **A per-customer-tweakable AI *reviewer* that reviews, routes, merges, AND beautifies.** No profiled platform ships this. Sanity's Content Agent is proposer-only; SO/Wikipedia pre-score but a human clears; Veeva mandates human e-sign; GitHub Copilot is comment-only; Drupal/Comala reviewers are humans; Guru's "auto-verify" acts on trust metadata not content. *The librarian is the differentiated, hardest-to-copy part — treat it as green field, not adapt-from-prior-art.* (Honest caveat: it's unoccupied because AI-as-autonomous-content-approver is unproven everywhere; this is opportunity and risk in one.)

2. **A hard, mandatory staging boundary OUTSIDE the live store, for AI writes specifically.** The three closest product-shape competitors (Rovo into Confluence, Notion, SharePoint) all chose govern-the-direct-write instead — and community evidence shows the resulting pain (Rovo hallucinated success; Notion amplifies messy workspaces). Sanity is the only stager, and it isolates *within* one store via drafts, not a separate store. *Orvex's mandatory-outside-store is a structural inversion of the market's default — real white space, and the documented failure modes of the alternative are Orvex's marketing ammunition.*

3. **Section/field-level proposal granularity across a rich-text wiki with 5 op types** (add-doc/add-section/edit/replace/delete). Only Dolt (cell), Google Docs (annotation), and SO (field diff) go sub-document at all — and none over a rich-text wiki. Wikipedia, Drupal, Comala, Veeva, Rovo are all whole-page/whole-entity. *Nobody has proven fine-grained structured proposals over a wiki; Orvex would be first.* (Caveat: also unproven-because-hard.)

4. **Filtered bulk review at 100-item single-session scale.** Google Docs' 12-year-unfilled "accept all from author X / in section Y" complaint is the canonical evidence of the gap; GitHub has no 100-proposal batch-review UX; HumanLayer/Agent Inbox have no bulk-triage; Comala/Rovo/Notion have none. Guru's Card Manager (filter + multi-select + bulk action) is the *only* bulk-triage UX found — but for post-merge re-attestation, not a pre-merge proposal queue. *Orvex must build filtered bulk accept/reject/merge as a core primitive; the shape exists (Guru) but not for this job.*

---

## 4. Contradictions — where the evidence argues AGAINST the current plan

Stated bluntly, not softened.

1. **Dolt as staging storage is contradicted by its own strongest production data point.** The sibling-memory track moots Dolt, and separate research already favors Postgres — the staging evidence reinforces Postgres, hard. Dolt proper is **MySQL-wire, not Postgres**; DoltgreSQL is **Beta only**; every `bd` write **auto-commits**, and the one real deployment (Beads) hit **"database is read only" errors under concurrent/batch auto-commit** and had to add a no-auto-commit batch mode; **single-writer embedded is the recommended default**, multi-writer needs a separate `dolt sql-server`. For a Postgres-first, multi-tenant, multi-agent staging store absorbing 100 proposals/session, adopting Dolt injects a MySQL-protocol component and a documented batch-write failure mode. *Steal Dolt's cell-level conflict model as a schema idea; do not adopt Dolt as the store.*

2. **"Staging store OUTSIDE the wiki" is not the pattern the successful stagers use.** Wikipedia's draft is another revision in the *same* stream; Sanity's drafts/versions live in the *same* Content Lake; Comala labels the *live* page. Sanity proves the isolation goal is met by a **storage-layer permission boundary** (agent creds physically cannot target published rows), not necessarily by a physically separate database. Conversely, Drupal's separate-overlay approach carries the "**every query must check the workspace field**" scaling smell. *The requirement to isolate AI writes is sound and well-supported; the specific choice of a literal separate store versus a credential-enforced boundary inside one store is NOT settled by prior art and should be an explicit decision, not an assumption.*

3. **Section/field granularity is unproven over a wiki and is the hardest cell in the whole landscape.** Every wiki/CMS/regulated stager operates whole-document/whole-page (Wikipedia, Drupal, Comala, Veeva, Rovo). The finer-grained systems (Dolt cells, Docs annotations, SO field diffs) are not rich-text wikis. *The PRD's 5-op section-level model is finer than almost all prior art — plan for it to be genuinely novel engineering with its own conflict semantics, not a borrowable pattern.*

4. **The market is actively betting AGAINST a staging plane.** Rovo (into Confluence, a direct Docmost peer), Notion, and Microsoft all shipped govern-the-agent (permissions + audit + rate limits) *instead of* staging in 2025-2026. This is a competitive-positioning risk: buyers may read a mandatory staging plane as friction and reach for "just add governance + audit." *Orvex must position explicitly against "govern the direct write" — and the community pain evidence (Rovo/Notion) is the counter-argument, but the PRD has to make it.*

5. **The 100-doc atomic-batch guarantee has zero benchmarked prior art.** Sanity, Drupal, Veeva, and Comala all *claim* atomic multi-doc batching; **none** publishes a documents-per-batch ceiling, latency, or failure-mode data at 100-in-one-session. HumanLayer/Agent Inbox scale numbers are third-party infra blogs about the checkpoint store, not the review UX. *Do not cite any of these as proof the 100-doc case is solved; it must be Orvex's own load-tested guarantee.*

6. **AI-as-autonomous-approver is contradicted everywhere.** GitHub deliberately made Copilot comment-only; Veeva legally mandates a human e-signature; SO/Wikipedia keep AI advisory. *A librarian that auto-*merges* content above trivial risk has no supporting prior art and cuts against a strong industry convention — default the auto-approve surface to low-risk op types + trust tiers, keep a human/policy gate load-bearing above a threshold.*

---

## 5. Decisions forced into the PRD

Ten crisp questions, each with an evidence-backed default and one-line rationale.

1. **Q: What backs the staging store — Postgres or Dolt?**
   **Default: Postgres.** Dolt is MySQL-wire (Doltgres only Beta), auto-commits every write, and its one production deployment (Beads) hit "db read-only" errors under batch load; borrow Dolt's cell-level conflict *model*, not the engine.

2. **Q: Is isolation a physically separate store, or a credential-enforced boundary inside one store?**
   **Default: enforce at the write-credential/permission layer (Sanity's strong form) — agent tokens physically cannot target canonical tables — and keep proposals in a logically distinct staging schema.** Successful stagers isolate by permission, not by a separate DB; Drupal's separate-overlay approach shows the "every query checks the workspace field" scaling smell.

3. **Q: What is the atomic review unit — the session/batch or the individual proposal?**
   **Default: session-as-ChangeSet, a first-class container with its own lifecycle** (Sanity Release / Drupal Workspace / Veeva DCC). Proposals are created cheaply/incrementally; the batch is what gets reviewed, scheduled, and rolled back.

4. **Q: How is 100-doc atomicity enforced across two storage domains?**
   **Default: all-or-nothing workflow-state gate (Veeva MDCC), not a cross-domain transaction** — the batch cannot go effective while any member proposal is unresolved; accept it is optimistic/polling, not ACID.

5. **Q: How are conflicts against a moving live wiki detected?**
   **Default: optimistic base-version tracking (Drupal revision-parent) + re-fetch-current-state-before-resolve (Google Docs); surface a HARD conflict, never a silent merge.** Matches the "no fallbacks — hard cuts" house rule; three-way prose auto-merge is done by nobody.

6. **Q: What granularity do proposals carry?**
   **Default: section/field-level, keyed by (document_id, section/field) like Dolt cells, with structural-vs-content conflict classes.** This is finer than nearly all prior art — budget it as novel engineering, not a borrowed pattern.

7. **Q: Can the librarian auto-approve, and how far?**
   **Default: deterministic policy first — destructive ops (delete/replace) always route to review; low-risk ops (append/add-section) eligible for auto-merge — layered with trust-tiered autopromotion; AI stays advisory (risk score), never the autonomous approver above a risk threshold.** GitHub/Veeva/SO all keep AI out of the final accept seat.

8. **Q: How does the queue avoid silent rot at 100-item bursts?**
   **Default: admission control (cap in-flight per session/customer, reject-at-door when saturated — SO) + queue age/depth alerting from day one (Wikipedia's 1,000-day-backlog lesson) + a per-agent proposal-quality score that throttles repeat-rejected producers (SO submitter gate).**

9. **Q: How are 100 pending proposals held without burning compute?**
   **Default: park at storage-cost-only (LangGraph checkpointer); store diff bodies in blob storage with pointers in the queue row (Pointer State Pattern).** Directly answers "100 agents shouldn't pin 100 live agents / spike WAL."

10. **Q: Does the staging system own post-merge trust/staleness, and how is agent access scoped?**
    **Default: yes — stamp merged pages with verifier + next_review_due + status; gate agent MCP retrieval on a trust threshold (Guru); schedule periodic re-review (Veeva); and carry an AI-groundable flag decoupled from human ACLs (SharePoint) so a page can be human-visible yet off-limits to agent cite/propose.**

11. **Q: What is the exposure + auth surface?**
    **Default: MCP-first, one bidirectional surface for read-grounding AND propose-change (Stack Internal), with machine-to-machine service-account/API-token auth (Rovo) and per-agent credential scoping (Notion) — never a shared service credential.**

12. **Q: What provenance must survive a merge?**
    **Default: two-sided immutable attribution — which agent proposed it AND which end-user conversation/session triggered it (Notion) — persisted into the applied wiki history (Google Docs), plus a one-line justification recorded whenever an auto-approve rule lets content bypass human review (SharePoint delegated-change pattern).**

---

## 6. Sources index

Each profile below carries its own full source list; this index maps segment → profile file. Governing selection rationale: `platforms/_candidates.md` (10 ranked) and `platforms/_gaps.md` (4 fill-ins + coverage verdict).

- **Wiki moderation at scale** — `platforms/wikipedia-pending-changes.md` (FlaggedRevs, Pending Changes, AfC, ORES, backlog metrics)
- **PR-model review for code/docs** — `platforms/github-pull-requests.md` (PRs, Suggested Changes, CODEOWNERS, Merge Queue, Octoverse)
- **PR-model review for structured data** — `platforms/dolt-data-prs.md` (Data PRs, cell conflicts, MCP server, Beads deployment)
- **CMS staging + shipping AI-write** — `platforms/sanity-content-releases.md` (Drafts, Content Releases, Content Agent, MCP)
- **Editorial config state machine** — `platforms/drupal-workspaces.md` (Workspaces, Content Moderation, Multiversion, WSE)
- **HITL agent approval** — `platforms/humanlayer-agent-inbox.md` (HumanLayer, LangGraph interrupt(), Agent Inbox)
- **Suggestion-mode editor** — `platforms/google-docs-suggesting.md` (Suggesting mode, annotation model, Developer Preview API)
- **Enterprise wiki + configurable approval** — `platforms/confluence-comala-workflows.md` (Comala Document Management, per-space workflows)
- **Crowd moderation queue + trust** — `platforms/stackoverflow-suggested-edits.md` (Suggested Edits, review queues, Stack Internal, bidirectional MCP)
- **Post-merge trust decay** — `platforms/guru-knowledge-verification.md` (Card verification, retrieval-time trust gating, Card Manager)
- **Regulated controlled-doc lifecycle** — `platforms/veeva-vault-qualitydocs.md` (Draft→effective, DCR/DCC Multi-Document Change Control, periodic review, 21 CFR Part 11)
- **AI-agent governance / govern-not-stage (Confluence peer)** — `platforms/atlassian-rovo-confluence.md` (Rovo agents, permissions-inheritance, Teamwork Graph MCP, Team '26 governance)
- **AI-agent governance / write-direct** — `platforms/notion-custom-agents.md` (Custom Agents, per-tool confirm, credit/anomaly circuit-breaker, MCP)
- **Hyperscaler AI-over-KB / read-only** — `platforms/microsoft-sharepoint-knowledge-agent.md` (Knowledge Agent, Restricted Content Discovery, AI-groundable decoupled from ACLs)

Selection/coverage authorities: `platforms/_candidates.md`, `platforms/_gaps.md`.
