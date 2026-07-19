---
title: "Prior-art candidates — Agent Staging Area + Librarian"
track: agent-staging-area
status: shortlist
created: 2026-07-10
purpose: >
  Shortlist of platforms/systems most worth a DEEP prior-art profile for (a) a safe
  agent-write staging store that sits OUTSIDE the wiki and (b) a per-customer-tweakable
  "librarian" that reviews, routes, merges, and beautifies staged content into the wiki.
  Selected for lateral diversity — the best prior art is deliberately NOT all AI products.
  Stress case every profile must answer: a SINGLE chat session proposing changes to 100 documents.
---

# Candidates (10) — ranked by profiling value

Each entry: **angle** = the single most load-bearing reason to profile it, then the specific
mechanisms to mine and how it speaks to the 100-doc single-session scale case.

---

## 1. Wikipedia — Pending Changes + Articles for Creation + FlaggedRevs
- **slug:** `wikipedia-pending-changes`
- **category:** wiki moderation at scale (the closest structural twin — a wiki)
- **angle:** The canonical "untrusted edits are buffered as *pending* against a *stable public revision*, a trusted reviewer accepts/reverts/modifies" model — exactly agents=untrusted editors, librarian=reviewer, wiki=stable published surface.
- **Mine:** stable-vs-pending revision split (FlaggedRevs); `Special:PendingChanges` as a review *queue* with diffs; AfC Draft: namespace as a staging *namespace* outside mainspace; reviewer permission tiers / autoreview trust; AbuseFilter as a pre-queue automated gate; reviewer throughput + backlog metrics (`Pending changes/Metrics`).
- **Scale:** decades of hard data on reviewer backlogs, queue starvation, and trust-tiering to auto-clear the firehose — directly informs 100-doc throughput and which staged items can skip the librarian.

## 2. GitHub — Pull Requests + Suggested Changes + Merge Queue
- **slug:** `github-pull-requests`
- **category:** PR-style review for docs/code
- **angle:** The reference mental model for "propose → diff → review → merge" that every engineer already has; suggested-changes gives the *inline, one-click-apply* edit primitive the librarian needs.
- **Mine:** branch-as-staging (proposals isolated from `main` = wiki never polluted mid-review); PR review states (approve/request-changes/comment); *suggested changes* (reviewer-authored applyable edits — the "beautify" seam); CODEOWNERS auto-routing (→ librarian routing); merge queue + batching; draft PRs; conflict surfacing on merge.
- **Scale:** merge queue and review-batch patterns are the industry answer to "many proposals landing at once" — model for serializing/merging 100 staged docs.

## 3. Dolt — Data Pull Requests (Git-for-data)
- **slug:** `dolt-data-prs`
- **category:** PR-style review for *structured data* (not files)
- **angle:** Proves the branch/diff/PR/merge model works on **structured rows**, not markdown blobs — the staging store is almost certainly structured records, and Dolt is already the mooted storage for the sibling memory track.
- **Mine:** branch-per-proposal on a table; cell-level three-way diff + merge; conflict resolution on structured data; `dolt_pull_requests` system tables; commit graph as audit trail of who-proposed-what.
- **Scale:** shows whether a data-native merge engine can absorb 100 concurrent doc-shaped proposals with per-field conflict handling instead of textual merge.

## 4. Sanity — Content Releases + Drafts perspective + Content Agent
- **slug:** `sanity-content-releases`
- **category:** headless CMS content-staging + live AI-write prior art
- **angle:** The single closest *shipping* analog: **Content Agent (GA Jan 2026) stages every AI-authored change as a draft**, and Content Releases bundle *many documents* into one reviewable/publishable set — a direct answer to the 100-doc atomic case.
- **Mine:** drafts-vs-published "perspectives" (query-time overlay, published surface never dirtied); Content Releases as a named bundle of cross-document changes that preview/validate/publish together; scheduled drafts; Content Releases API; how Content Agent (Mastra+Temporal) constrains AI writes to the draft plane.
- **Scale:** Content Releases is *designed* for coordinated multi-doc launches — the reference implementation for "100 docs proposed in one session, reviewed and merged as a unit."

## 5. Drupal — Content Moderation + Workspaces (with Contentful as SaaS cousin)
- **slug:** `drupal-workspaces`
- **category:** editorial workflow / configurable moderation state machine
- **angle:** **Workspaces** stages an entire set of edits across many nodes and publishes them **atomically**; **Content Moderation** gives a *per-site-configurable* workflow state machine + roles — the direct analog to a **librarian prompt/policy tweakable per customer**.
- **Mine:** configurable workflow states + transitions + per-role transition permissions (customer-tunable routing rules as config, not code); Workspaces as a full staging overlay that diffs then merges wholesale; scheduled transitions; Contentful's draft→review→published + scheduled publish as the SaaS equivalent.
- **Scale:** Workspaces atomic multi-entity publish is a second independent design for the 100-doc-in-one-shot merge; also surfaces the failure modes of large staged overlays.

## 6. HumanLayer + LangGraph Agent Inbox
- **slug:** `humanlayer-agent-inbox`
- **category:** human-in-the-loop approval layer for AI agents (the native-AI reference)
- **angle:** Purpose-built "agent proposes an action, a human approves/edits/rejects before it commits" — the exact approval seam, with a production **inbox** UI and an interrupt architecture that costs nothing while 100 items wait.
- **Mine:** `require_approval` gate + `human_as_tool`; approve/edit/reject/respond response types (edit = librarian refinement); omnichannel routing (Slack/email) → who is the librarian and can it be human-or-agent; LangGraph `interrupt()` (agent parks, zero resources, resumes on decision) as the pattern for parking 100 pending proposals; Agent Inbox as a ready-made triage queue UI.
- **Scale:** interrupt-not-poll is the answer to "100 pending items shouldn't pin 100 live agents."

## 7. Google Docs — Suggesting mode
- **slug:** `google-docs-suggesting`
- **category:** suggestion-mode editor (in-place tracked proposals)
- **angle:** Best-understood consumer UX for "edits arrive as *suggestions* laid over the live doc; an owner accepts/rejects per-suggestion or in bulk" — models edit/replace/delete staged ops as reversible overlays rather than commits, plus the bulk accept/reject the librarian needs at scale.
- **Mine:** suggestion as a non-destructive overlay on live content; per-suggestion vs accept-all/reject-all; attribution + comment thread per suggestion; how granular (section/replace/delete) ops render as suggestions.
- **Scale:** bulk accept/reject ergonomics are the human-throughput lever when the librarian defers to a person on 100 items.

## 8. Confluence + Comala Document Management (Document Control workflows)
- **slug:** `confluence-comala-workflows`
- **category:** enterprise wiki with a per-space configurable approval workflow
- **angle:** A **wiki** (peer to Docmost) bolted to a *configurable per-space* review/approval state machine — the closest "same product shape + tweakable moderation policy" analog, showing how draft/review/approved/published overlays sit on wiki pages.
- **Mine:** per-space workflow config (states, approvals, reviewer assignment) = customer-tunable librarian policy expressed declaratively; published-vs-working page versions on a wiki; review-due / expiry triggers; approval reviewer routing.
- **Scale:** exposes how a page-oriented wiki handles many pages in-review at once and where per-page approval breaks down vs. batching.

## 9. Stack Overflow — Suggested Edits + Review Queues
- **slug:** `stackoverflow-suggested-edits`
- **category:** crowd moderation queue at scale + trust-tiering
- **angle:** The best-documented *moderation queue* mechanics: low-trust edits land in a **suggested-edit review queue**, reviewers approve/reject/improve, and reputation auto-approves trusted authors — directly the librarian's routing + which staged items bypass review.
- **Mine:** review queue task model (binary/triage decisions, N-approvals-to-clear); reputation-gated auto-accept (trust tiers that skip the librarian); reviewer daily caps + queue-starvation defenses; anti-abuse (rejection penalties) to keep the queue clean.
- **Scale:** the canonical high-volume queue-throughput design — informs SLAs, auto-clear thresholds, and reviewer-fatigue limits for a 100-item burst.

## 10. Guru — Knowledge Verification / trust decay
- **slug:** `guru-knowledge-verification`
- **category:** AI-era knowledge base with a verification/trust lifecycle
- **angle:** Uniquely covers the *post-merge* half of the librarian's job: cards carry a **verification** owner + cadence and go *stale/unverified* on a schedule — the librarian doesn't just admit content, it must keep the wiki trustworthy over time (and this overlaps the memory track's staleness problem).
- **Mine:** verification workflow (assigned verifier, verification interval, unverified state as a soft-quarantine); trust badges; duplicate/expiry detection; how AI-suggested cards get human-verified before entering the trusted set.
- **Scale:** answers "after 100 docs land, how does the librarian keep them from rotting" — the ongoing-curation dimension the other nine under-serve.

---

## Coverage map (lateral-diversity check)
| Prior-art lens (from brief) | Covered by |
|---|---|
| Wiki moderation at scale | #1 Wikipedia |
| PR-style review for docs/data | #2 GitHub, #3 Dolt |
| CMS content-staging | #4 Sanity, #5 Drupal/Contentful |
| Editorial workflow / config state machine | #5 Drupal, #8 Confluence+Comala |
| Suggestion-mode editors | #7 Google Docs, #8 Confluence |
| Human-in-the-loop agent approval | #6 HumanLayer/Agent Inbox |
| AI content pipeline w/ review queue | #4 Sanity Content Agent, #6 |
| Moderation-queue systems + trust-tiering | #9 Stack Overflow, #1 Wikipedia |
| Post-merge curation / trust decay | #10 Guru |

## Notes for deep-profile pass
- Rank for depth: **#4 Sanity, #1 Wikipedia, #6 HumanLayer, #2 GitHub, #9 Stack Overflow** are highest-signal for the staging+librarian design; **#3 Dolt** and **#5 Drupal Workspaces** are the two independent answers to the 100-doc atomic-merge case; **#10 Guru** is the sole prior art for ongoing trust/staleness.
- Runners-up NOT profiled (log only): WordPress editorial/AutoMod, Reddit AutoModerator, Notion AI drafts, Zendesk/Intercom AI answer-suggestions, Temporal-as-durable-approval-engine, Payload/Strapi draft-preview. Pull one in only if a profiled candidate proves thin.
