# Confluence + Comala Document Management workflows — prior-art deep dive

## What it is
Comala Document Management (also sold as Comala Workflow / Comala Document Control / Comala Document Approval — a family of related Atlassian Marketplace apps) is a Confluence add-on that overlays a configurable state-machine (workflow) on individual pages or whole spaces: Draft → Review → Approved-style states, with role-based reviewers, e-signatures, expiry dates, and audit trails. It does not replace Confluence's page store — it attaches workflow metadata (state, approvals, history) to existing Confluence content. ([Atlassian Marketplace listing](https://marketplace.atlassian.com/apps/142/comala-document-management), [Comala Workflow docs](https://appfire.atlassian.net/wiki/spaces/CDML/pages/682591102/Comala+Workflow))

## Behind it & traction
Built by Comalatech (founded 2005, Vancouver + Bilbao), which passed $10M ARR with 10,000+ active installs across its product suite before being acquired by Appfire on 2022-04-04 for a reported "mid-8 figures." Now sold and supported under the Appfire (Platinum Atlassian Marketplace Partner) umbrella as part of a family: Comala Document Management (6,077 installs), Comala Document Control (753 installs), Comala Document Approval, Comala Publishing, Comala Metadata. Actively maintained — Comala Document Management shipped v46.0.0 on 2026-07-08 and Comala Document Control shipped v4.26.0 on 2026-06-29. Neither flagship app has user reviews on the Marketplace listing itself despite install counts in the thousands. ([Comalatech joins Appfire](https://appfire.com/resources/blog/comalatech-has-joined-the-appfire-family), [BusinessWire acquisition release](https://www.businesswire.com/news/home/20220404005033/en/Appfire-Acquires-Comalatech-To-Elevate-Document-Management-in-the-Atlassian-Ecosystem), [Marketplace listing](https://marketplace.atlassian.com/apps/142/comala-document-management), [Comala Document Control listing](https://marketplace.atlassian.com/apps/1215729/comala-document-control))

## Architecture & data model
- **Workflow states**: named milestones (e.g. Draft, Review, Approved, Rejected); a page/blogpost holds exactly one state at a time, rendered in a workflow status bar/macro on the page.
- **Transitions**: named routes between states, triggered by an "action" (e.g. an "approved" transition from Draft→Approved).
- **Content reviews (approvals)**: attached to a state via an `{approval}` macro inside a `{state}` macro; a review can require one or more assigned reviewers, minimum-reviewer counts, and dependencies between multiple review groups on the same state.
- **Workflows are defined per space** ("space workflow", applied by a space admin to all pages/blogposts) or **per page** ("page workflow", applied by a page editor); a space can run multiple active space workflows simultaneously, filtered by content labels.
- **Events/triggers**: `statechanged`, `pageapproved`, `pagerejected`, `pageapprovalassigned`, etc., each firing one or more configured actions (email notification, label change, restriction removal, further state transition).
unknown: exact underlying storage schema (whether workflow state lives as Confluence page properties/content-properties vs. an external app table) — not documented in the pages fetched.
([Comala Workflow overview](https://appfire.atlassian.net/wiki/spaces/CDML/pages/682591102/Comala+Workflow), [Adding Multiple Reviews](https://wiki.comalatech.com/display/CWL/Adding+Multiple+Reviews), [Applying workflows (Cloud)](https://appfire.atlassian.net/wiki/spaces/CDMC/pages/656674827/Applying+workflows), [Events docs](https://wiki.comalatech.com/display/CWL/Events))

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)
- **Status REST API**: content-level endpoints to read current workflow state and interact with states/approvals/workflow parameters (`ContentWorkflowResources`).
- **Document Activity REST API**: separate audit-trail API (does NOT include native Confluence activities like page edits/comments), published as OpenAPI/Swagger.
- **CQL REST API extension**: adds new CQL fields so Confluence's native Search REST API can filter by workflow status/state.
- No MCP server, no dedicated CLI, and no chat-platform (Slack/Teams) plugin surfaced in vendor docs — integration is REST-only, consumed by custom scripts/automations against Confluence's existing app infrastructure.
unknown: whether a webhook push model exists vs. poll-only REST reads.
([Status REST API](https://appfire.atlassian.net/wiki/spaces/CDML/pages/649692021/Status+REST+API), [Document Activity REST API](https://appfire.atlassian.net/wiki/spaces/CDML/pages/649791485/Document+Activity+REST+API), [CQL REST API](https://appfire.atlassian.net/wiki/spaces/CDML/pages/649921636/CQL+REST+API))

## Staging & review workflow
- **Propose → review → apply/reject**: content is edited in place on the live Confluence page (there is no separate staging copy); the workflow state macro gates what "counts" as approved/published, and view restrictions can be auto-applied/removed on transition so unapproved edits are hidden from consumers until approved. This is a "state label over live content" model, not a fork-and-merge model.
- **Change granularity**: state and approval are applied at the whole-page (or whole-blogpost) level — there is no native sub-page/section/field-level approval; multiple reviewers can be required on one page, but not multiple independent approvals for different sections of the same page.
- **Batch review at scale (~100 changes/session)**: unknown / not evidenced. No vendor documentation, blog, or third-party review found describing bulk/multi-page batch review UX; space-level workflows apply the *same* workflow definition across many pages, but each page still requires its own individual state transition and reviewer action — there is no evidence of a "review 100 pending changes in one sitting" console. This is a documented gap, not a confirmed absence.
- **Conflict handling vs. live content**: unknown — because edits happen directly on the live page (optionally view-restricted while in Draft/Review state), Confluence's native page-versioning/conflict-resolution applies; Comala does not appear to add its own diff/merge layer on top.
- **Reviewer UX + automation**: role-based reviewer assignment, minimum-reviewer thresholds, dependent multi-review chains, and "fast-tracked" approvals/rejections — configuring a `pageapproved` trigger with `partial=true` lets the workflow transition on the *first* approval/rejection rather than waiting for all assigned reviewers, effectively an auto-progress rule (not an AI auto-approve). No evidence of an AI/LLM reviewer role; all decisions are human-assigned users or role-based groups.
([Fast-tracked Rejections and Approvals](https://wiki.comalatech.com/display/CDML/Fast-tracked+Rejections+and+Approvals), [Approvals docs](https://appfire.atlassian.net/wiki/spaces/CDML/pages/650153766/Approvals), [Adding Multiple Reviews](https://wiki.comalatech.com/display/CWL/Adding+Multiple+Reviews), [Events docs](https://wiki.comalatech.com/display/CWL/Events))

## Scale & operational evidence
- Install counts are the only public scale signal: 6,077 (Comala Document Management), 753 (Comala Document Control) on Atlassian Marketplace as of this research — these count *site installs*, not documents/pages under workflow or concurrent reviewers, so they say little about per-tenant throughput.
- Predecessor company scale (pre-Appfire, across its whole product suite): 10,000+ active installs, $10M+ ARR (2021), ~45 employees at acquisition.
- No published benchmark, case study, or third-party review found quantifying review-workflow performance at high page-change volume (e.g., no equivalent of "reviewed 100 pages in one sitting").
unknown: uptime/SLA figures, largest known customer deployment size.
([Marketplace listing installs](https://marketplace.atlassian.com/apps/142/comala-document-management), [Comala Document Control installs](https://marketplace.atlassian.com/apps/1215729/comala-document-control), [Acquisition coverage](https://www.businesswire.com/news/home/20220404005033/en/Appfire-Acquires-Comalatech-To-Elevate-Document-Management-in-the-Atlassian-Ecosystem))

## Pricing & positioning
- Sold as a paid Atlassian Marketplace app (Commercial license), billed through Atlassian per the standard Marketplace per-user-tier model for Cloud, and per-user-tier annual licensing for Data Center/Server.
- Third-party aggregator (SourceForge) lists a starting price around $3,600/year for Comala Document Control; this is a third-party marketing/listing figure, not confirmed directly from Atlassian's own pricing tab (pricing tiers did not render in fetched pages — flag as unverified).
- Positioned against native Confluence approval features and lighter competitors (e.g., "Approval Path") as the deeper, more configurable governance/compliance layer (e-signatures, expiry, audit trail) for regulated/enterprise documentation. ([Approval Path vs. Comala comparison](https://warsawdynamics.com/posts/-approvalpath-vs-comala-document-management/), [SourceForge listing](https://sourceforge.net/software/product/Comala-Document-Control/))
unknown: exact current per-tier price table (Atlassian pricing tab content did not return usable data during this research pass — treat SourceForge figure as marketing-adjacent, not confirmed).

## STEAL — 3-5 concrete ideas for Orvex
1. **State-machine-per-space-with-label-filtering**: letting a customer run multiple concurrently-active workflow definitions in one wiki space, selected by content label, maps directly onto Orvex's per-customer-tweakable librarian prompt — different document types (e.g. runbooks vs. policy docs) could route to different review policies without needing separate spaces.
2. **Event/trigger model as the automation backbone**: Comala's `statechanged`/`pageapproved`/`pagerejected`/`pageapprovalassigned` event vocabulary is a clean, reusable pattern for the librarian agent's own hook points (e.g. `proposal_submitted`, `proposal_merged`, `proposal_rejected`) — each with pluggable actions (notify, relabel, auto-republish).
3. **Fast-track / partial-approval escape hatch**: the `partial=true` "first decision wins" trigger is a good precedent for a tunable auto-approve threshold in the librarian (e.g. auto-merge low-risk single-field edits, but require full review for document-level restructures) — gives customers a dial between full-audit-trail and low-friction throughput.
4. **CQL-style status filtering as query surface**: exposing workflow/staging status as first-class search filters (rather than a separate staging DB with its own query language) lowers integration cost for any dashboard/agent that already queries the wiki.
5. **Audit trail as a separate API surface from content**: splitting "document activity/audit" from "content-edit activity" into its own API is a useful separation for the staging area — Orvex's staging store could expose a parallel activity feed independent of the wiki's own page history, avoiding coupling review audit trail to Confluence-style page versioning.

## AVOID / where Orvex differs
- **No true staging area**: Comala's biggest structural gap for Orvex's use case is that it has no separate staging store — edits happen on the live page (hidden via view restrictions during review). Orvex's PRD explicitly requires agents to NEVER touch the live wiki; this is a deliberate architectural improvement over the Comala model, not something to copy.
- **No batch/bulk review UX at scale**: no evidence Comala was built for or tested against "one session proposes 100 documents" — its unit of review is one page transition at a time via manual reviewer action. Orvex must design its own batch-review console/queue rather than assume this pattern is solved prior art.
- **Page-level-only granularity**: Comala has no section/field-level approval; Orvex's PRD wants add-document/add-section/edit/replace/delete as distinct proposal types, which is finer-grained than anything evidenced in Comala's model.
- **No AI reviewer / no MCP surface**: Comala's review actors are exclusively human users/role groups, and its integration surface is classic REST-only with no MCP, CLI, or chat-platform plugin — Orvex's librarian-agent-as-reviewer and MCP-first exposure have no direct analog here to borrow implementation detail from, only the workflow-state vocabulary.
- **Pricing/packaging model differs**: Comala monetizes as a per-seat Atlassian Marketplace add-on bolted onto an existing wiki product; Orvex's staging+librarian is a native platform capability, not a bolt-on, so the per-seat-app pricing precedent likely doesn't transfer directly.

## Sources
- https://marketplace.atlassian.com/apps/142/comala-document-management
- https://marketplace.atlassian.com/apps/1215729/comala-document-control
- https://marketplace.atlassian.com/apps/1219822/comala-document-approval
- https://appfire.atlassian.net/wiki/spaces/CDML/pages/682591102/Comala+Workflow
- https://appfire.atlassian.net/wiki/spaces/CDML/pages/650153766/Approvals
- https://appfire.atlassian.net/wiki/spaces/CDML/pages/649692021/Status+REST+API
- https://appfire.atlassian.net/wiki/spaces/CDML/pages/649791485/Document+Activity+REST+API
- https://appfire.atlassian.net/wiki/spaces/CDML/pages/649921636/CQL+REST+API
- https://appfire.atlassian.net/wiki/spaces/CDMC/pages/656674827/Applying+workflows
- https://wiki.comalatech.com/display/CWL/Adding+Multiple+Reviews
- https://wiki.comalatech.com/display/CWL/Events
- https://wiki.comalatech.com/display/CDML/Fast-tracked+Rejections+and+Approvals
- https://appfire.com/resources/blog/comalatech-has-joined-the-appfire-family
- https://www.businesswire.com/news/home/20220404005033/en/Appfire-Acquires-Comalatech-To-Elevate-Document-Management-in-the-Atlassian-Ecosystem
- https://sourceforge.net/software/product/Comala-Document-Control/
- https://warsawdynamics.com/posts/-approvalpath-vs-comala-document-management/
