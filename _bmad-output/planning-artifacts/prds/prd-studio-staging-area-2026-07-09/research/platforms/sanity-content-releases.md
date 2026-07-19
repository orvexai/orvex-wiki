# Sanity: Content Releases + Drafts + Content Agent — Prior Art Deep-Dive

Researched 2026-07-10. Prior-art analog for Orvex's Agent Staging Area track.

## What it is

Sanity is a headless content platform (structured content backend + Studio editor) that in 2026 repositioned itself as an "AI Content Operating System." Three pieces compose the staging story:

- **Drafts** — core Sanity primitive: every document has a `drafts.*` shadow version that is separate from the published version until explicitly published.
- **Content Releases** — a bundling mechanism that groups many document versions (drafts) into one named, schedulable, previewable unit that publishes (or rolls back) atomically. Announced as "No More 'DO NOT PUBLISH'" ([Sanity blog](https://www.sanity.io/blog/introducing-content-releases)).
- **Content Agent** — the AI layer (launched as part of the "AI Content Operating System" push, announced 2026-03-04) that performs bulk/conversational content operations and stages every change it makes as a draft, optionally organized into a Content Release for batch review ([Content Agent](https://www.sanity.io/content-agent), [PR Newswire](https://www.prnewswire.com/news-releases/sanity-launches-the-ai-content-operating-system-for-the-ai-era-302704294.html)).

## Behind it & traction

- Founded 2018 (Oslo/San Francisco). ~304 employees as of May 2026.
- Total raised: $173M over 5 rounds; Series C was $87.2M (April 2025) led by Bullhound Capital, with Shopify, ICONIQ Growth, Threshold, Heavybit among investors. Secondary-sale valuation reported at $5B ([Clay dossier](https://www.clay.com/dossier/sanity-funding), [SaaS News](https://www.thesaasnews.com/news/sanity-raises-85-million-in-series-c/)).
- Named enterprise customers: Burger King, Expedia, Riot Games, Morning Brew (per funding trackers); Content Agent page cites Braze and a franchise-marketing customer (Elizabeth Piñón, "we have 650 franchise pages... Content Agent finally made bulk update mean what it should") ([Content Agent](https://www.sanity.io/content-agent)).
- unknown: independent (non-vendor) case studies or usage benchmarks — all traction evidence found is Sanity-published (blog, product page, press release), not third-party verified.

## Architecture & data model

- Content Lake is Sanity's proprietary hosted document store (not open-source; Studio, the editor UI, is open-source but the backend is not).
- Every published document can have exactly one draft (`drafts.<id>`) and, additionally, one version per active Content Release — i.e. a document can have N concurrent in-flight versions (one per release) plus the live published version and the default draft ([Content Releases user guide](https://www.sanity.io/docs/user-guides/content-releases)).
- A release is a named container of document *versions* (not diffs) — "each release can only contain one version of a document." Releases have a type: ASAP (publish when ready) or At Time (scheduled) ([WebSearch summary, Sanity docs](https://www.sanity.io/docs/user-guides/content-releases)).
- Publishing a release is presented as an atomic "run release" action across all its document versions; rollback is supported at the release level (Enterprise).
- Content Agent itself is described in its API docs as "a Vercel AI SDK provider" (npm package) that bridges natural-language turns to Sanity's write API — it is explicitly constrained to **only write drafts and versioned (release) documents, never published documents directly** ([Content Agent API](https://www.sanity.io/docs/apis-and-sdks/content-agent-api)).

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- **MCP server**: hosted remote server at `mcp.sanity.io`, OAuth + token auth, 40+ tools spanning schema/studio management, document CRUD via GROQ, release management (create/list releases, discard versions), project/org admin, AI image gen, doc search. Integrates with Claude Code, Cursor, VS Code, v0, Lovable, Replit, OpenCode. The MCP docs make **no mention of Content Agent, ChatGPT, or Slack** — MCP is a separate, more general-purpose dev-tool surface from the Content Agent product ([Sanity MCP server docs](https://www.sanity.io/docs/ai/mcp-server)).
- **Content Agent API**: `.agent(threadId)` for stateful multi-turn conversations, `.prompt()` for stateless one-shot calls; integrates with Vercel AI SDK's `generateText`/`streamText`. Permissions are fine-grained: read/write toggles, presets (`minimal`, `standard`), GROQ filters restricting document types, "perspectives" targeting drafts/published/raw/a specific release ID, and feature toggles (e.g. disable web search) ([Content Agent API](https://www.sanity.io/docs/apis-and-sdks/content-agent-api)).
- **Slack**: a dedicated integration lets users "query and action content without leaving" Slack ([Content Agent, meet Slack](https://www.sanity.io/blog/content-agent-meet-slack)).
- **Content Releases API**: `@sanity/client`'s `client.releases` namespace plus top-level document-version methods ([Content Releases API](https://www.sanity.io/docs/apis-and-sdks/content-releases-api)).
- unknown: whether Content Agent or the MCP server ships a first-class CLI beyond the Sanity CLI's existing dataset/deploy commands.

## Staging & review workflow

- **Propose → review → apply/reject**: Content Agent always writes drafts (never published docs). Marketing copy: "Nothing goes live until you're ready. Content Agent stages all edits as drafts in a bundle, so you can review, adjust, and publish on your own terms" ([Content Agent user guide](https://www.sanity.io/docs/user-guides/content-agent-user-guide)).
- **Change granularity**: field-level, document-level, and bulk (hundreds/thousands of documents in one operation), described as "schema-aware" — it respects validation, required fields, and referential integrity ([Content Agent](https://www.sanity.io/content-agent)) — this last claim is marketing copy, not independently verified.
- **Batch review at scale (100 changes in one session)**: this is the closest direct answer to Orvex's 100-doc case — a Content Release is explicitly designed to bundle many document versions into one reviewable/schedulable/publishable/rollback-able unit, and Content Agent can target a release directly so a whole batch of AI-authored changes lands as one release ("stage a whole batch of regenerated product copy, review it as a set, schedule it, and roll it back if a reviewer rejects the batch"). unknown: any published upper bound on documents-per-release or documented performance/UX degradation at 100+ documents in one release — not found in docs or blog.
- **Conflict handling vs. live content**: not explicitly documented. The data model (draft + per-release versions coexisting with the published doc) structurally avoids the AI overwriting live content, but the docs are silent on what happens when two releases (or a release and a manual draft edit) touch the same document concurrently — Content Agent API docs state plainly: "conflict resolution mechanisms between concurrent writes... multi-user scenarios remain underspecified" (own synthesis from docs gap, not a direct Sanity quote).
- **Reviewer UX + automation**: review happens in the Studio release-detail screen (preview all changes together before going live) and can be shared with a teammate before publishing. unknown: no evidence of an "auto-approve rule" engine or a distinct AI-reviewer role (Content Agent is the *proposer*, not a separate reviewing agent) — Orvex's librarian-agent concept (a second AI role that reviews/merges/beautifies) has no documented Sanity equivalent.

## Scale & operational evidence

- All scale evidence is vendor-published: the "650 franchise pages" bulk-update testimonial and Braze's "democratized access to our content" quote ([Content Agent](https://www.sanity.io/content-agent)).
- Content Releases and Content Agent's release-scoped writes are the mechanism Sanity points to for bulk/atomic operations, but no numeric ceiling, latency figures, or failure-mode data for a 100-document single-session batch were found.
- unknown: any public postmortem, benchmark, or third-party review quantifying Content Agent/Content Releases behavior at scale.

## Pricing & positioning

- **Free**: $0/mo, 20 seats, 2 datasets, 10k documents. Content Releases not included.
- **Growth**: $15/seat/mo, up to 50 seats, 25k documents. Content Releases not included (Enterprise add-on). Add-ons: dedicated support +$799/mo, increased quota +$299/mo, extra datasets +$999/dataset/mo.
- **Enterprise**: custom pricing; includes Content Releases (active releases, rollback, overlap preview) plus SSO/advanced security/SLA ([Pricing](https://www.sanity.io/pricing)).
- **AI credits**: $0.05/credit. Free & Growth include 1,000 credits/mo (one WebSearch result said 100 — treat as unconfirmed/possibly stale; the pricing-page fetch says 1,000); Enterprise includes 5,000/mo (one source said 500 credits — same discrepancy). Query = 4 credits ($0.20), tool-use Action = 2 credits ($0.10), Agent Action = 1 credit ($0.05). Overage at $0.05/credit on Growth. unknown: exact current numbers — the two fetches disagreed (100 vs 1,000 monthly credits on Free/Growth), so treat both as approximate and re-verify against the live pricing page before quoting externally.
- Positioning: **Content Releases (the batch-review mechanism Orvex cares most about) is Enterprise-gated**, not available on Free/Growth. Content Agent itself is available on all tiers but metered by credits.

## STEAL — 3-5 concrete ideas for Orvex

1. **Structural non-negotiable: agent writes never touch live content, by construction.** Sanity enforces this at the data-model level (Content Agent's API can literally only write `drafts.*` or `versions.<releaseId>.*` documents, never the published doc). Orvex's staging store already does this via being "outside the wiki," but Sanity's version proves the stronger form: enforce it in the storage/permissions layer itself (agent's write credentials physically cannot target canonical wiki tables), not just via a submit-then-review process convention.
2. **Batch = one addressable, atomic, reviewable, rollback-able container (the Release).** For Orvex's 100-doc case, model a single agent session's proposals as one named "release" object with its own lifecycle (draft → reviewed → published/rolled-back) rather than 100 independent proposal rows the librarian must individually triage. Bulk accept/reject/schedule at the container level, with per-document drill-down — directly answers the "100 documents in one session" requirement.
3. **Fine-grained scoped agent permissions (GROQ filters, perspectives, read/write toggles, tool disables).** Rather than one flat "agent can propose changes" permission, Orvex could let each customer scope what an agent may touch (doc types, spaces, sections) and what capabilities are active per session — directly reusable for the per-customer-tweakable librarian prompt, and extendable to scoping the *proposing* agents too.
4. **Preview-before-publish as a first-class UX, not just a diff view.** Content Releases let reviewers see the *combined effect* of all bundled changes rendered together before going live, not just a list of diffs. For the librarian agent, consider rendering a full "what the wiki would look like" preview of the merged/beautified batch, not only a per-page diff queue.
5. **Meet agents/reviewers where they work (Slack integration) alongside a dedicated API/SDK.** Sanity ships both a general MCP dev-tool surface and a separate, purpose-built Content Agent Slack integration for content ops staff. Orvex's librarian and staging-review UX should likewise have a chat-platform-native review surface (approve/reject bundles from Slack/Teams), distinct from the MCP tools exposed to authoring agents.

## AVOID / where Orvex differs

- **No distinct AI-reviewer role.** Sanity's Content Agent is proposer-only; a human (or a teammate share) reviews. Orvex's PRD calls for a *second* agent (the librarian) that itself reviews, routes, merges, and beautifies — Sanity has no shipped analog for this, so there's no prior art to lean on for the librarian's automation/auto-approve logic; Orvex is on its own here and should treat this as the differentiated, harder-to-copy part of the design.
- **Content Releases (the actual 100-doc batch answer) is Enterprise-only** in Sanity's model. Orvex should decide deliberately whether atomic-batch staging is a premium/gated capability or a baseline guarantee for every tenant — Sanity's choice to gate it suggests it's non-trivial to operate cheaply at scale, which is a cost signal, not just a business-model signal.
- **Documented conflict handling is thin.** Sanity does not publish what happens when a release and a live edit (or two releases) collide on the same document. Orvex should not assume "coexisting versions" alone solves conflicts and should design/document explicit conflict-resolution semantics (e.g., staged proposal becomes stale/needs-rebase if the underlying wiki page changed canonically since the proposal was filed) rather than following Sanity's silence.
- **Credit-metered AI usage with unclear/inconsistent published numbers.** The discrepancy found between sources on Free/Growth monthly credit allowances (100 vs 1,000) suggests even Sanity's own ecosystem struggles to keep this documented consistently — Orvex should avoid a pricing model whose unit economics require this much external decoding, and if usage-based pricing is used, keep the numbers in one canonical, easily-verified place.
- **Proprietary hosted backend.** Content Lake is not open-source (unlike Sanity Studio). Given Orvex embeds a Docmost *fork* (AGPL, self-hostable) as the wiki, Orvex's staging store and librarian should preserve that self-hosted/open posture rather than drifting toward a closed hosted-only data layer the way Sanity has.

## Sources

- [Sanity Launches The AI Content Operating System for the AI Era (PR Newswire)](https://www.prnewswire.com/news-releases/sanity-launches-the-ai-content-operating-system-for-the-ai-era-302704294.html)
- [Content Agent: AI-powered content operations at scale](https://www.sanity.io/content-agent)
- [Content Agent API | Sanity Docs](https://www.sanity.io/docs/apis-and-sdks/content-agent-api)
- [Content Agent quick start guide | Sanity Docs](https://www.sanity.io/docs/user-guides/content-agent-user-guide)
- [Content Agent, meet Slack | Sanity blog](https://www.sanity.io/blog/content-agent-meet-slack)
- [Sanity MCP server | Sanity Docs](https://www.sanity.io/docs/ai/mcp-server)
- [Content Releases: Schedule and coordinate content launches](https://www.sanity.io/content-releases)
- [Content Releases user guide | Sanity Docs](https://www.sanity.io/docs/user-guides/content-releases)
- [Content Releases API | Sanity Docs](https://www.sanity.io/docs/apis-and-sdks/content-releases-api)
- [No More 'DO NOT PUBLISH': Introducing Content Releases | Sanity blog](https://www.sanity.io/blog/introducing-content-releases)
- [Pricing | Sanity](https://www.sanity.io/pricing)
- [How AI Credits work | Sanity Docs](https://www.sanity.io/docs/platform-management/how-ai-credits-work)
- [Sanity Funding & Key Investors | Clay dossier](https://www.clay.com/dossier/sanity-funding)
- [Sanity Raises $85 Million in Series C | The SaaS News](https://www.thesaasnews.com/news/sanity-raises-85-million-in-series-c/)
