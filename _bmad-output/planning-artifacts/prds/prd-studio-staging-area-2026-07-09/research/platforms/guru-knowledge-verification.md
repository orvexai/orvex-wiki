# Guru — Knowledge Verification / Trust Decay (Prior Art Research)

Researched 2026-07-10. Scope: Guru's card-verification / trust-decay mechanism as prior art for Orvex's librarian-driven post-merge wiki-trust problem.

## What it is

Guru (getguru.com) is a card-based enterprise knowledge base / "AI knowledge layer" that surfaces answers inside Slack, Teams, Chrome, and search, and layers a verification workflow on top of every unit of content ("Card") so staleness is caught on a schedule rather than discovered by a user hitting wrong information. Each Card has an assigned verifier (person or group) and a verification interval; when the interval lapses the card is flagged rather than silently trusted, and routed back to its owner for re-confirmation. Guru markets this explicitly as solving "content rot" / trust decay in knowledge bases.
Source: https://www.getguru.com/features/verification

## Behind it & traction

Founded 2013, Philadelphia, founders Rick Nucci and Mitchell Stewart, CEO Rick Nucci. Raised $68M total across 6 rounds; Series B ($25M, 2020) led by Thrive Capital with Emergence Capital, FirstMark Capital, Slack Fund, and Michael Dell's MSD Capital participating. Most recent disclosed round was $30M (April 2020) — no confirmed funding events found in 2025-2026 search results, so unknown whether they've raised since.
Source: https://www.getguru.com/blog/guru-secures-25m-series-b-funding, https://tracxn.com/d/companies/guru/__cuYzb8BMWwWyggzhkbQKcEYQD3CA0F1hM_WoPd_UDxs/funding-and-investors

Employee count: Tracxn reports "2,399 employees" as of April 2026 — this figure is inconsistent with Guru's known market position as a mid-market SaaS vendor and is likely a data-quality error in that aggregator (possibly conflating with a different "Guru" entity; note PitchBook also surfaces unrelated "Guru.com" freelance-marketplace and "Guru (Philadelphia)" as separate profiles). Treat as unknown/unverified rather than fact.
Source: https://tracxn.com/d/companies/guru/__cuYzb8BMWwWyggzhkbQKcEYQD3CA0F1hM_WoPd_UDxs (low confidence, marketing/aggregator data — not confirmed against an official Guru statement)

## Architecture & data model

Content unit = **Card** (a single Q&A/fact-sized piece of knowledge, can include HTML content, images, attachments). Cards are grouped into **Collections** with tags and folder hierarchy; Cards can have a **share status** (TEAM or PRIVATE) and can carry **verifiers**, **verification intervals**, and **collaborators**. Each Card independently tracks its own verification state — verification is a per-card attribute, not a per-document or per-collection one, i.e. the smallest unit of "trust" in Guru is the same as the smallest unit of authored content.
Sources: https://developer.getguru.com/docs/import-content, https://help.getguru.com/docs/verifying-and-unverifying-cards

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- **REST API**: root `https://api.getguru.com/api/v1/`, JSON, Basic Auth. Endpoints for card CRUD (`GET/POST /v1/cards/extended`, `GET /v1/cards/{cardId}/extended`), search (`GET /v1/search/query`), and attachment upload (`POST /v1/attachments/upload`). Documented verification-specific endpoints were not surfaced in the fetched docs (community threads reference them but detail wasn't found).
  Source: https://developer.getguru.com/docs/getting-started, https://developer.getguru.com/docs/listing-cards
- **MCP**: Guru's current marketing copy claims "100+ integrations and MCP delivery" as part of its AI knowledge layer — i.e. they position Guru itself as MCP-servable content for third-party agents, not that Guru consumes MCP tools from agents. Marketing claim, not verified against a technical MCP spec doc.
  Source: https://www.getguru.com/pricing
- **Chat-platform plugins**: native Slack and Microsoft Teams apps — create/update Cards from a thread, search/share Cards without leaving Slack, auto-suggested answers in a channel, and **verify Cards directly from Slack** ("Verifying Guru Cards in Slack" is a documented feature, though the fetched doc didn't expose the exact interaction mechanics).
  Sources: https://www.getguru.com/integrations/slack, https://help.getguru.com/docs/setting-up-gurus-app-for-slack, https://help.getguru.com/docs/creating-and-adding-to-guru-cards-in-slack
- **Chrome extension** for capture/search in-browser.
  Source: https://www.pixiebrix.com/tool/guru
- No CLI was found in any source.

## Staging & review workflow (propose → review → apply/reject, granularity, batch review at scale, conflict handling, reviewer UX + automation)

Guru's verification loop is explicitly a **post-publish maintenance loop**, not a pre-publish staging/proposal gate — this is a structural difference from Orvex's staging-area problem (Orvex needs propose→review→merge before anything touches the wiki; Guru assumes content is already live and periodically re-attests it).

- **Granularity**: per-Card (smallest content unit), not per-document or per-field.
- **Cadence/decay**: configurable per Card — "Does not expire" (default for new Collections), or 30/60/90 days, 6 months, 1 year, or (per one third-party summary) custom dates up to year 9999. Third-party blog content described a three-phase "decay" narrative (card turns yellow at 90 days → auto-notify SME via Slack/email → one-click re-verify) — this specific phased/color-coded mechanic was NOT corroborated in Guru's own help docs, which instead describe simple ✅ Verified / ❔ Unverified / no-badge states; treat the "yellow card" phase language as an unverified secondary-source claim, not confirmed product behavior.
  Sources (official): https://help.getguru.com/docs/verifying-and-unverifying-cards, https://www.getguru.com/features/verification
  Source (unverified claim): search-engine summary of third-party blog content, no single stable URL captured
- **Expired/unverified-card behavior**: unverified cards stay searchable and answerable by default; they're flagged in the verifier's task queue. A Knowledge Agent (Guru's RAG/answer surface) can be scoped to "Verified only," "Verified and no verification status," or "All sources" — i.e. trust state gates *retrieval*, not just display, letting an org choose to exclude unverified content from AI-generated answers entirely.
  Source: https://help.getguru.com/docs/verifying-and-unverifying-cards
- **Batch review at scale**: **Card Manager** supports filtering by verification status, multi-select checkboxes, and bulk actions (bulk re-verify, bulk reassign verifier, bulk change interval, bulk archive). This is Guru's answer to "100 changes in one session" — but it's bulk *re-attestation* of already-live cards, not bulk review of a queue of proposed diffs.
  Source: https://help.getguru.com/docs/verifying-and-unverifying-cards
- **Conflict handling vs. live content**: not addressed by any source found — Guru's model doesn't appear to have a draft/live distinction at all; edits appear to write directly to the Card and then require re-verification. No evidence of an edit-proposal/pending-diff object.
- **Reviewer UX + automation**: "My Tasks" dashboard uses relevancy scoring to prioritize which unverified/expiring cards matter most. AI suggests the right verifier based on content creation/edit history. **Auto-Verify / Auto-Unverify** are configurable, described as Knowledge-Agent-level settings letting agents "verify and unverify info for you" based on usage signals (e.g., frequently-used, unflagged cards may get their verification window auto-extended) — this is Guru's closest analog to an "AI reviewer," but it operates on trust-state metadata, not on the content edits themselves; a human still owns the actual content correction.
  Sources: https://help.getguru.com/docs/verifying-and-unverifying-cards, https://www.getguru.com/features/verification

## Scale & operational evidence

No published case study, benchmark, or customer quote was found specifically about verification workload at scale (e.g., "customer X verifies N cards/month" or "reduced staleness by Y%"). Guru's own marketing repeats generic claims ("gets more accurate over time," "corrections propagate organization-wide") without cited metrics. Treat all scale claims as unsubstantiated until a primary source (case study, earnings-style blog, or customer reference) is found — none surfaced in this pass.
Source: https://www.getguru.com/pricing (marketing language only, no metrics)

## Pricing & positioning

Two publicly-known historical tiers per third-party pricing aggregators (not confirmed on Guru's current site, which now hides pricing behind "Talk to sales"): Self-serve ~$25/seat/month with a 10-seat minimum (~$250-300/mo effective floor), and Enterprise (custom, usage-based rather than per-seat). Guru's current live pricing page (fetched 2026-07-10) no longer publishes numbers at all — it repositions the product as a "platform + expertise" solution with a bundled "Expertise Layer" (architecture design, agent tuning, integration rollout, change management, ongoing optimization) sold alongside the software, explicitly framed as more than "just a per-seat tool." This is a meaningful 2025-2026 positioning shift: verification/quality automation is now bundled into a consultative, high-touch enterprise sale rather than a self-serve feature line-item.
Sources: https://www.eesel.ai/blog/guru-pricing (third-party, historical numbers), https://www.getguru.com/pricing (current, official, no numbers)

## STEAL — 3-5 concrete ideas for Orvex

1. **Retrieval-time trust gating, not just display-time.** Guru's "Verified only / Verified+unreviewed / All sources" toggle on the Knowledge Agent is a strong pattern: let each customer's chat agents be configured to only ground answers in wiki content above a trust threshold, independent of whether stale content is still visible to human browsers. This maps directly onto Orvex's agent-facing MCP surface — the librarian doesn't have to hide stale pages from humans, but agent retrieval can exclude them.
2. **Verification is a first-class per-page (or per-section) metadata object with owner + cadence, decoupled from the edit history.** Orvex's librarian could stamp every merged page/section with `verifier`, `next_verification_due`, and a status enum, independent of who wrote it — this gives a natural "staleness queue" the librarian (or a human) can work down, and gives Orvex a second signal (trust decay) distinct from the cross-agent-memory track's staleness problem, so the two can share one due-date/queue primitive.
3. **Bulk re-attestation UX for scale.** Guru's Card Manager bulk-filter-and-action pattern (filter by status, multi-select, bulk reassign/re-verify/archive) is the right shape for the "review 100 changes in one session" requirement — but Orvex should apply it to the *pre-merge proposal queue* (which Guru doesn't have), not just post-merge re-verification, since that's the actual PRD-1 requirement.
4. **Usage-weighted auto-extension of trust windows.** Guru's "frequently-used, unflagged cards may auto-extend their verification" is a cheap heuristic worth stealing for the librarian: pages an agent frequently retrieves-and-succeeds-with (no correction, no user pushback) can have their re-verification cadence stretched automatically, focusing human/SME attention on pages that are both stale AND actually being used.
5. **AI-suggested verifier assignment from edit/ownership history.** Cheap, low-risk automation Orvex's librarian can copy directly: infer the right SME/owner for a page from who wrote or last substantively edited it, rather than requiring manual assignment for every page.

## AVOID / where Orvex differs

- **Guru has no pre-publish staging/proposal gate** — edits appear to land directly on the live Card and only then require re-verification. Orvex's PRD-1 requirement (agents never write the wiki directly; proposals sit in a staging store until a librarian merges) is structurally absent from Guru's model. Don't copy the "write-then-verify" sequencing; Orvex needs "propose→review→apply," which is a different pipeline than anything documented for Guru.
- **No documented conflict-resolution model** for concurrent edits vs. live content — nothing to steal here since it doesn't appear to exist; Orvex needs to solve this itself.
- **Verification cadence is manually configured per card/collection**, not automatically inferred from content volatility or business criticality — a naive port of "everything defaults to 90 days" will be wrong for Orvex's mixed content (a pricing page and a design-philosophy page shouldn't share a cadence); Orvex's librarian should set cadence based on inferred content type/volatility, not force customers to hand-tune every page.
- **Pricing/positioning is now a high-touch enterprise consulting motion**, not a transparent self-serve SaaS price — if Orvex wants faster adoption than Guru's current GTM, don't copy the "talk to sales, bundle an Expertise Layer" opacity; keep staging/verification features legible and self-serve-configurable.
- **No evidence of scale/operational metrics being published** — Orvex should not assume Guru's approach is proven at the "100 documents in one chat session" scale Orvex specifically needs to survive; this remains an open validation gap for Orvex to close with its own load testing, not something to inherit confidence from Guru's marketing.

## Sources

- https://www.getguru.com/features/verification
- https://help.getguru.com/docs/verifying-and-unverifying-cards
- https://www.getguru.com/pricing
- https://www.getguru.com/blog/guru-secures-25m-series-b-funding
- https://tracxn.com/d/companies/guru/__cuYzb8BMWwWyggzhkbQKcEYQD3CA0F1hM_WoPd_UDxs/funding-and-investors
- https://developer.getguru.com/docs/getting-started
- https://developer.getguru.com/docs/listing-cards
- https://developer.getguru.com/docs/import-content
- https://www.getguru.com/integrations/slack
- https://help.getguru.com/docs/setting-up-gurus-app-for-slack
- https://help.getguru.com/docs/creating-and-adding-to-guru-cards-in-slack
- https://www.pixiebrix.com/tool/guru
- https://www.eesel.ai/blog/guru-pricing (third-party, unverified against official current pricing)
