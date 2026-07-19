---
title: "Completeness Audit — Product Brief: Orvex Studio"
status: draft
created: 2026-07-13
---

# Completeness Audit — Product Brief: Orvex Studio

Synthesis of `brief.md` + `addendum.md` against 17 per-space rechecks, 203 OPS
archive pages (7 batches), and 2 targeted hunts. Sources cited by recheck file
or OPS slug.

## 1. Verdict

The brief is **substantially complete at its stated altitude and near-flawless
as a stitch of canon** — every archive batch and 6 of 17 space rechecks returned
zero product-level gaps, and the biggest concepts (three-layer system, Librarian,
Composer, outbound sync, doctrine) are faithfully carried. It is **not yet
"complete"** because of one material contradiction and a cluster of scope calls it
neither makes nor consciously defers: pricing/packaging that the brief frames as
*open* is already **locked** across ten services (£7/£70, GBP-only, hidden
Enterprise, concrete free caps), and — more sharply — the free tier's AI is a
**10-action lifetime trial**, which directly conflicts with the brief's "cheap-model
AI included free forever" doctrine. Resolve that plus the outbound-sync caveat and
a few persona/marketplace scope calls, and the brief is done.

## 2. Genuine gaps (deduplicated, prioritized)

1. **[P0 — CONTRADICTION] Pricing is locked, not open; free-tier AI is a one-time
   trial, not "cheap AI forever."** Sources: billing (Blcvui4UIn D-S7/S19/S23),
   ai (FR-AI12), api, contracts (FR-C24), identity, console, workflows, lib,
   knowledge, orvexwiki (W613jcEl3k). Canon has frozen £7/£70, GBP-only, 14-day
   dunning, 7-day card-required trial, hidden Enterprise, Teams-teaser, and Free
   caps (200 pages/1 GiB/2,000 files/25 members) — while the brief says "£5–7
   pending blessing." Worse, Free AI = **10 lifetime actions → paywall**, which
   contradicts the brief's free-tier cost doctrine ("cheap models… included free").
   → *Reconcile brief §Scope + addendum §3a/§4: adopt locked numbers (or flag brief
   as superseding), and resolve the free-AI-trial-vs-cheap-model-forever conflict
   (needs Daniel — Q1/Q2).*
2. **[P1] Outbound sync has a hard per-vendor limit the brief states as unqualified.**
   Sources: arch (FR-MEM27), workgraph. Claude has a native memory-tool backend
   adapter (v1); **ChatGPT is platform-blocked — OpenAI exposes no memory API.** The
   brief's headline "syncs to the AIs you use" (and free-tier promise) needs the
   caveat. Also un-flagged: inbound un-lock-in angle (Claude memory-backend +
   MCP-KG interop adapter FR-MEM16 — any MCP tool can read/write the workgraph).
   → *Qualify brief §Product ¶5 + addendum §1.*
3. **[P1] Admin / curator / fleet-operator is a first-class JTBD, not "same product,
   different UI."** Sources: arch, staging (§2.1), workgraph (§2.4). Bulk review
   queues, per-space Autonomy-Dial tuning, and a fleet dashboard (persona "Rhea")
   are distinct workflows the "three-surface arc" reduces to UI+entitlements.
   → *Add to brief "Who This Serves" / addendum ownership map.*
4. **[P1] Marketplace seeding + license gate is undefined.** Sources: OPS Nu970wBBTm
   (GitHub import/vet/claim/star-sync, shipped M11), klYZDJsSQr+pYnqge4a9r
   (permissive-license two-gate seeding). The Composer depends on a populated
   marketplace but the brief never says where skills come from; the license gate
   ties directly to the brief's own P2 AGPL research item.
   → *Add marketplace-seeding to Scope; fold license gate into the P2 AGPL question.*
5. **[P1] Already-shipped marketplace trust/social mechanics ≠ the excluded "trust
   badges."** Sources: OPS RpBg6Diub2 (live-data-only, usage-tracking, publish/fork/
   claim/review stage-critical), n5WAqVxCgy (forking-with-lineage, creator profiles),
   api (transparent `reputation_ledger`). The one-line Scope-Out on "trust badges"
   does not cover these built mechanics. → *Explicit include/exclude ruling (Q4).*
6. **[P1] Outbound-content safety (Personal-Data Guard + AI-Privacy Setup).** Sources:
   nmIMlwFvHM (live canon), Laura persona. Screens PII/SEND *before* it reaches the
   third-party AI and ensures the connected AI won't train — a trust differentiator
   distinct from "private memories" (which gates Orvex's own enrichment). Not in
   brief, not in Scope Out. → *Add to brief §Product trust paragraph.*
7. **[P1] Personal↔org firewall, personal→Teams upgrade journey, polymorphic
   tenancy.** Sources: nmIMlwFvHM (firewall "confirmed model"), identity (D-S17),
   workflows (FR-W13). Solo user gets NO org (user-keyed tenant); upgrade mints an
   org and carries data + entitlements, with new members NOT retroactively seeing
   pre-upgrade private content. The three-surface arc mentions none of it.
   → *One paragraph in brief arc; detail → PRD (Q5).*
8. **[P2] Memory's own surface deserves the flagship-quality bar the Composer got.**
   Sources: OPS P2mbhAv7SI, TMaaxw0kRZ (Living Portrait: typed atoms, Areas,
   navigator, scales to 1,000, nod-stream, therapist-chat on-ramp). Per the repo's
   "Delivered = looks good AND works" note. → *Add a flagship note to brief Memory
   bullet; detail → PRD (Q6).*
9. **[P2] Composer differentiator: per-piece attribution in the assembled prompt is
   an empty competitive slot (0 of 18 tools).** Source: OPS JDvrKcC0Gp. Makes the
   "most amazing prompt editor" claim concrete + evidenced. → *Downstream PRD /
   Composer positioning.*
10. **[P2] Consumer-launch go/no-go blockers: Complexity + Observability.** Source:
    t34ohaxVps. Benefit is invisible to peers (throttles word-of-mouth); needs
    shareable before/after wins pre-launch — a launch-readiness gate distinct from
    the engineering E2E doctrine. → *Add to Delivery Doctrine / Research Phase.*
11. **[P2] Onboarding: Demo World aha-mechanic + demo-data graduation model.**
    Sources: ui (FR-UI20 visible enrichment citations), qTF4fTd1Wb (flagged-rows vs
    demo-tenant isolation), O78H0DBQaw. Addendum §3b covers the tour-collapse but not
    the Demo World device or the isolation/graduation choice. → *Downstream PRD;
    pointer in addendum §3b.*
12. **[P2] Second marketplace + scheduling.** Source: staging (FR-STG29 Librarian
    Prompt Pack templates; FR-STG28 scheduled ChangeSet publishing, PO-decided
    2026-07-10). Two v1 features absent from the brief's Librarian scope.
    → *Downstream PRD; one Scope-In line.*

Minor/fold-ins (not separately counted): image-gen paid-only (into #1); per-workspace
Memory recall default-off GDPR gate (ai FR-AI11 — note in Memory framing);
search-unavailable graceful-degrade (knowledge NFR-K5); Professional Mode dual-skin
(ui FR-UI10 — into #3); competitive scorecard/ERRC/130-product scan (t1lizeJLTy,
Blue Ocean canvases — evidence, not a scope decision; cite if desired).

## 3. Consciously excluded (no action)

- **Community marketplace trust badges, developer product, regulated sectors,
  team/shared-curation v1, free-form generation as default, auto-disposition
  without confirm** — all explicit in brief §Scope Out (auto-disposition further
  amended by the full-auto ruling). *Note:* the badges exclusion is narrow — see
  gap #5, which is a different construct.
- **workgraph/staging pricing dimensions** — brief §Scope Open explicitly defers
  (workgraph recheck confirms §11.2/§A5 are consciously deferred).
- **Autonomy Dial** — already in the brief's confirm→auto-when-confident→full-auto
  trust-dial paragraph (staging recheck agrees).
- **"No Kanban board" non-goal (ApOYJwtWnK)** — covered by the brief's "tiny My
  skills list" posture; too cosmetic to restate.
- **All engineering minutiae** (auth verifier, Kafka spine, DfM, cell contracts,
  SSE wire, tool-count design) — correctly below the brief's altitude; mcp, cli,
  wiki-api rechecks returned clean NO-GAPS on exactly this basis.

## 4. Safely archived

All 203 OPS pages across 7 batches audited; every product-shaped page resolves to a
live canonical successor already cited by the brief, restates covered ground, or is
process/build/gate noise. **The eight archive candidate-gaps (JDvrKcC0Gp, Nu970wBBTm,
P2mbhAv7SI, RpBg6Diub2, TMaaxw0kRZ, klYZDJsSQr+pYnqge4a9r, n5WAqVxCgy, qTF4fTd1Wb) are
all folded into §2 above** — no orphaned product idea remains unsurfaced. The
`general` space is confirmed empty (clean negative).

**Ambiguous (one item):** the canonical Vision (`CSqjqciAX9`) cites, as one of three
"see also" links, `ApOYJwtWnK` ("What We Will Not Build") — which is superseded,
parked under the OPS Archive, and excluded from RAG grounding; its "what changed and
why" gloss also overstates the page (the "why" lives in the also-superseded
HD9ky5WSVU). This is canon hygiene, not an orphaned idea — bundle the fix with the
Vision re-ratification the brief already owes (addendum §3).

## 5. Questions for Daniel (defaults in italics)

1. **Free-tier AI — "10 lifetime actions then paywall" (canon) or "cheap-model AI
   free forever" (brief doctrine)?** They conflict. *Default: keep the built 10-action
   trial as the mechanic; reframe the doctrine as "free's ~zero-cost value is the full
   non-AI loop + a one-time AI taster."*
2. **Is £7/£70, GBP-only, hidden-Enterprise, Teams-teaser now LOCKED?** *Default: yes
   — brief adopts it and drops "£5–7 pending blessing."*
3. **Ship the outbound-sync headline knowing ChatGPT can't be natively synced (Claude
   yes, OpenAI platform-blocked)?** *Default: yes — keep the promise, caveat per-vendor.*
4. **Is the shipped marketplace social layer (forking-with-lineage, gated reviews,
   reputation ledger, creator profiles) in-scope for this program or frozen behind the
   community-marketplace deferral?** *Default: keep forking/reviews/ledger in; defer
   creator-profiles + following-graph.*
5. **Does the free-tier account model (firewall + personal→Teams upgrade journey)
   belong in the umbrella brief or downstream PRD?** *Default: one paragraph in the
   three-surface arc; mechanics to PRD.*
6. **Should Memory's own surface carry the "flagship quality bar" ruling the Prompt
   Composer got?** *Default: yes — Memory is a headline claim and must look good AND
   work.*
