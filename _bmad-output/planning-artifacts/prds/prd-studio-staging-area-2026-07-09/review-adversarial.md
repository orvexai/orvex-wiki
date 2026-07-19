---
title: "Adversarial Review — PRD: Agent Staging Area"
status: review
created: 2026-07-10
reviewer: SE-Architect adversarial lens (assume-wrong-until-proven)
target: prd.md (rev updated 2026-07-10) + addendum.md
evidence: research/engine-scale-mechanics.md, research/librarian-portal-scale-audit.md, project-context.md
---

# Adversarial Review — Agent Staging Area PRD

**Verdict: REVISE (do not advance to architecture as-is).** The staging *boundary* is the right bet and the research grounding is unusually honest, but the PRD's load-bearing safety invariant (NFR-STG5) has no enforcement home in the current architecture, its headline SLOs rest on two services the PRD's own audit rates as 501 scaffolds, and beautification-on-apply quietly breaks both the apply SLO and the section-level conflict model the whole design is keyed on. Several flagship claims are asserted over a substrate the sibling research proves cannot deliver them.

**Counts:** 1 critical · 6 high · 7 medium · 4 low (18 findings).

---

## CRITICAL

### C1 — The "agents physically cannot write the wiki" invariant has no enforcement point, and the hard cut misses the CLI path
**Sections:** NFR-STG5, FR-STG25, §2.2, §9; evidence: librarian-portal-scale-audit.md §2 (Path A), §5; addendum A3 (migration inventory); project-context.md (frozen 13-row allow-list, "keep fork surface minimal").

**Attack.** NFR-STG5 promises agent credentials "physically cannot write wiki canonical content … enforced at the credential layer" — this is the thesis the entire PRD sells. But the audit shows there is *no chokepoint where that can be enforced today*: the engine's `/update` accepts api-key (agent-class) writes with no human/agent distinction, `orvex-wiki-api` (the intended facade) is a 501 scaffold that MCP writes bypass straight to docmost, and enforcing it in the engine means a new authz dimension ("this api-key is the Librarian's apply engine → allow; that one is a customer agent → deny") — a fork edit against a **frozen 13-row inline-edit allow-list** the repo doctrine forbids growing. Worse, FR-STG25's actual mechanism only re-points the **MCP** `save_page`/`edit` tools; the audit's Path A (`docmost-cli` → docmost, the sanctioned skill/librarian write path) and the migration inventory in addendum A3 never mention the CLI at all — so the doc-librarian/doc-amend skill writes remain a live, un-cut agent→wiki path, directly contradicting NFR-STG5's blanket claim.

**Fix.** (a) Name the single enforcement chokepoint explicitly and make building it a prerequisite epic — realistically `orvex-wiki-api` becomes the *only* write ingress and the engine's direct `/update` is network-fenced to it; assert-and-test that api-key/agent credentials get 403 at that ingress. (b) Extend FR-STG25's hard cut to enumerate **every** agent write surface (MCP tools *and* `docmost-cli page create/update/patch/edit` *and* the hidden `studio_library_save`), not just the two MCP heroes. (c) Reconcile NFR-STG5 with the fork freeze: if the credential gate must live in the engine, it needs an allow-list amendment + ADR called out here; if it lives in wiki-api, say so and make wiki-api's promotion from 501 a gating dependency.

---

## HIGH

### H1 — The 100-proposal SLOs rest on two services the PRD's own audit rates as 501 scaffolds, and the values are self-flagged guesses — yet they're a release gate
**Sections:** FR-STG7 (`p95 ≤ 5 min/100`, `[ASSUMPTION: SLO value]`), FR-STG8, NFR-STG1, SM-3, 6.1 ("100-proposal load test as a release gate"); evidence: librarian-portal-scale-audit.md maturity table (ai = "501 observable stubs", knowledge = "typed 501 stubs"); engine-scale-mechanics.md §3 (45s read staleness).

**Attack.** Triage-to-disposition in ≤5 min for 100 proposals requires, *per proposal*, a find-before-create search against `orvex-studio-knowledge` (FR-STG8) **and** an LLM classification/routing call against `orvex-studio-ai` (FR-STG7) **and** a rendered diff against a live page whose content can lag ≤45s. That is ~3s/proposal end-to-end including an LLM round-trip — achievable only under heavy concurrency against **two services the audit says do not exist yet** (both 501). The SLO number is explicitly `[ASSUMPTION]`, and NFR-STG1 simultaneously stakes a competitive claim on it ("no vendor in the field publishes this; we do") while 6.1 makes it a **release gate**. You cannot gate a release on a benchmarked contract whose value is a guess and whose dependencies are stubs.

**Fix.** Demote the SLO numbers to *targets to be discovered* until a spike measures real `ai`/`knowledge` latency, then ratify. Add explicit dependency-maturity gates: the load-test release gate cannot bind until `orvex-studio-ai` classify and `orvex-studio-knowledge` search/dedup are past 501. State the concurrency model and per-tenant `ai` rate-limit budget the SLO assumes.

### H2 — Beautification-on-apply blows the 15-minute apply SLO (per-page LLM re-authoring is unaccounted)
**Sections:** FR-STG14, NFR-STG1 ("apply ≤ 15 min"), UJ-2 climax; evidence: engine-scale-mechanics.md §1–3 (per-save ~2 round-trips + 5–7 jobs + ≤45s persist debounce).

**Attack.** FR-STG14 re-authors *each landing page* to full ProseMirror (callouts, tables, columns, diagrams, TL;DR lead) at apply time — i.e. a full-document LLM generation call **per page**, on top of the engine write. 100 pages × a realistic 5–30s beautify generation is 8–50 min of LLM latency alone, before the engine's own per-page write cost and the ≤45s read-after-write verification tolerance the apply engine must poll through (addendum A3). The 15-minute apply budget silently assumes beautification is free; it is the single most expensive step in the loop.

**Fix.** Either move beautification off the apply hot path (apply raw-but-valid content within SLO; beautify as a follow-up recommendation stream) or exclude beautify-generation latency from NFR-STG1 and give it its own budget. Decide explicitly and state the number.

### H3 — Whole-page beautification contradicts section-anchor conflict keying, so "hard conflict detection, never silent merge" cannot hold at the granularity claimed
**Sections:** Glossary (Operation: `(document_id, section_anchor)` "Dolt-cell-style conflict keying"), FR-STG9, FR-STG13, FR-STG14; evidence: addendum A3 (unknown nodes silently stripped; adjacent same-mark runs coalesce; anchors non-stable); memory `[[docmost-cli-edit-path-corruption]]` (section/heading edit path corrupts nested spans).

**Attack.** The design keys conflicts at `(document_id, section_anchor)` cell granularity and forbids silent prose merge (FR-STG9). But FR-STG14 re-authors the **whole page** on apply — a page-level rewrite conflicts with *any* concurrent human edit anywhere on the page, collapsing the promised cell-level granularity back to whole-doc conflict and making the "two proposals to different sections don't conflict" story false the moment beautify runs. Independently, ProseMirror section anchors are heading/block-derived and shift after the first section apply mutates the doc; combined with server-side node-stripping and same-mark coalescing (addendum A3) and the known edit-path span corruption (memory), splicing N section proposals into one live doc *is* a merge problem — the very thing FR-STG9 says never happens. The within-page atomic `batch` verb (audit §2) gives atomicity but not anchor stability or merge-freedom.

**Fix.** Pick one granularity and make it consistent: if beautification is page-level, conflict keying is page-level (drop the cell-keying claim from the Glossary and Operation semantics). If you keep section-level cell-keying, beautification must be section-scoped and anchor resolution must be specified against stable block IDs, with an explicit statement of behavior under coalescing/stripping. Add an FR for how multiple section proposals to one page are sequenced and re-anchored.

### H4 — Hard-cutting the only working write path before the scaffolded dependencies are real, under a no-fallbacks rule, can brick agent knowledge-write at cutover
**Sections:** FR-STG25, 6.1 (hard cut + triage both MVP-in), §10 (no-fallbacks); evidence: librarian-portal-scale-audit.md maturity table; memory `[[no-fallbacks-hard-cuts]]`.

**Attack.** FR-STG25 removes the direct agent write path with loud errors and *no shim* (correctly, per the no-fallbacks rule) — but triage/route/apply (FR-STG7/8/13/14) depend on `orvex-studio-ai` and `orvex-studio-knowledge`, both 501 today. If the MVP ships the hard cut alongside triage-on-scaffolds (both are in 6.1), then at cutover agents can *propose* but nothing can classify, route, or apply: the knowledge-write capability is dead, and the no-fallbacks rule guarantees there is no path back. The PRD states no sequencing constraint tying the cut to dependency readiness.

**Fix.** Add an explicit MVP sequencing invariant: the hard cut is the **last** step, gated on staging being able to triage→apply end-to-end against real (non-501) `ai`/`knowledge`. Until then agents keep the current path. State this as a release-ordering constraint, not a hope.

### H5 — Superseding a FROZEN, shipped, tested Card Contract v1 + Curator with field-authority still undecided and no consumer-migration plan
**Sections:** §0, §9 (Supersedes), Glossary (Proposal = "descendant of Card Contract v1's card"), Open Q5; evidence: librarian-portal-scale-audit.md §Curator (card.ts real/ENG-1528; classifyOnSave real + full test suite/ENG-1527).

**Attack.** §0/§9 claim to supersede-and-generalize "the shipped product-feature specs," but the audit shows Card Contract v1 (`card.ts`) and Curator `classifyOnSave` are **real built code with golden tests** (curator-idempotent-golden, curator-cap-keyed-on-principal, …) encoding a **frozen** field-authority split. Open Q5 admits the PRD has not decided whether that field authority "transfers verbatim or gets a v2 revision" — i.e. it proposes to replace a frozen tested contract while leaving open whether it breaks it, with no migration/compat story for existing Card consumers or the tested Curator paths. "Curator becomes a staging client" is asserted without saying what Curator *does* as a client (does `classifyOnSave` still run? forward to staging? become dead code?), risking two live classification paths.

**Fix.** Resolve Open Q5 inside this PRD before architecture: either Proposal is a strict superset of Card v1 (field authority verbatim, goldens still pass) or it is v2 with an explicit migration + supersession ADR and a deprecation of the Curator classify path. Define the post-supersession responsibility of Curator concretely (kept / forwarded / removed).

### H6 — The mandate's core failure mode (mis-routing) is not reviewable: the batch UX shows diffs, not routing confidence, and drops doc-amend's "ask when fuzzy" gate
**Sections:** FR-STG7, FR-STG8 ("never a sibling page"), FR-STG12, UJ-2; evidence: librarian-portal-scale-audit.md §1 (doc-amend "asks one plain-English question at a time on a fuzzy candidate"; ratify "human delight-review").

**Attack.** The Librarian's job is to *route to the right living page*; the characteristic failure is a confident mis-route (amend the wrong page / create a sibling it shouldn't). Today's doc-amend surfaces exactly that risk by **asking the human a plain-English question when the match is fuzzy**. The PRD replaces this with uniform batch treatment: FR-STG12 gives diffs + bulk accept/reject, but a content diff does not reveal whether the *target* is correct, and there is **no per-Proposal routing-confidence/ambiguity signal** to focus the human's ≤10 interactions on the uncertain routes. So low-confidence routes get the same 2-second skim as high-confidence ones and apply unreviewed — the mis-route is structurally invisible in the review surface, and "never a sibling page" (an absolute over a fuzzy matcher) is unenforceable.

**Fix.** Add an FR for a per-Disposition routing-confidence score (distinct from producer Trust Tier), and make the queue route low-confidence items to mandatory human adjudication (the doc-amend "ask" preserved as a queue lane), excluded from safe-bulk-accept. Reframe FR-STG8's "never a sibling" as a measurable target (duplicate-sibling rate) rather than an absolute.

---

## MEDIUM

### M1 — The flagship journey (UJ-2) misrepresents the autonomy dial: "62 auto-apply-eligible" cannot exist under the `recommend` default
**Sections:** UJ-2, FR-STG10, Glossary (Autonomy Dial default `recommend`).

**Attack.** UJ-2 triages Marta's ChangeSet into "62 auto-apply-eligible" then has her "bulk-accept the recommended set … and hit Apply." Under the default `recommend` dial, FR-STG10 says *every* apply needs a human accept — nothing is auto-apply-eligible. Under `auto-apply-low-risk`, those 62 would have applied *before* Marta opened the queue at 9am, so she wouldn't be accepting them. The narrative conflates "auto-apply-eligible" (a Trust-Tier/Operation property) with "recommended-accept" (a Disposition), muddling what the dial actually does in the one story meant to prove it.

**Fix.** Rewrite UJ-2 to a single coherent dial state. If `recommend`: 62 are *high-confidence recommendations* cleared by one bulk-accept; drop "auto-apply-eligible." If `auto-apply-low-risk`: show the 62 as already-applied on arrival and have Marta attend only to the 31 + 7. Make the ≤10-interaction math follow from the chosen state.

### M2 — "All-or-nothing" apply is a state-machine label over a non-atomic substrate; a mid-apply pause leaves the live wiki partially mutated and delete-rollback is unsolved
**Sections:** FR-STG13, Glossary (Apply, ChangeSet "unit of … rollback"), NFR-STG1 ("zero partial-silent failures"), UJ-2 climax ("100 documents updated"), Open Q3; evidence: engine-scale-mechanics.md §5 (no cross-page atomicity, partial failure by design).

**Attack.** FR-STG13 is honest that it's a workflow-state gate, not a transaction — but the consequence is under-owned. Because the substrate applies 100 independent engine writes with per-page CONFLICT/5xx possible, a "pause with explicit state" after page 50 leaves the customer's **live** wiki with 50 pages changed and 50 not, which is the opposite of the atomic "100 documents updated" climax UJ-2 sells. Rollback is `[ASSUMPTION: compensating inverse ops]`, but the inverse of `delete-document` is re-create-with-original-content, whose fidelity is exactly what Open Q3 leaves unresolved — so a mid-apply failure on a ChangeSet containing deletes cannot be cleanly rolled back.

**Fix.** State the partial-application reality plainly in FR-STG13 and UJ-2 (a paused ChangeSet = a partially-mutated live wiki with an explicit resume/abort decision). Resolve delete-rollback fidelity (snapshot-before-delete in the staging store, not inverse-op reconstruction) before architecture, and reflect it in Open Q3's closure.

### M3 — The learning loop's effect is confounded and partly measures a feature that's cut from v1
**Sections:** FR-STG16 ("measurably adjusts future behavior"), FR-STG17 ("changelog of prompt-pack revisions with measured effect"), SM-2, 6.2 (self-revision OUT).

**Attack.** SM-2 (acceptance ≥90% after 4 weeks) is offered as validation of FR-STG16, but an acceptance-rate change is confounded by producers improving, reviewers relaxing, and easier proposals — the loop's contribution is not isolable, so SM-2 cannot falsify FR-STG16. Separately, FR-STG17 promises admins "a changelog of prompt-pack revisions with their measured effect," but prompt-pack self-revision is explicitly **6.2-OUT for v1** — so in v1 that changelog measures manual edits only, and FR-STG17 is not marked down accordingly.

**Fix.** Replace "measurably adjusts" with a falsifiable A/B or held-out design (exemplars-on vs exemplars-off routing accuracy on a labeled set), owned as an experiment, not asserted as an FR consequence. Mark the self-revision portions of FR-STG17 as v1.1 to match 6.2.

### M4 — Auto-apply to AI-groundable `published` status plus the learning loop reproduces the "AI amplifying messy workspaces" failure the vision explicitly disclaims
**Sections:** §1 (vision cites competitor failure), FR-STG10 (`auto-apply-low-risk`), §5 assumption (applied content lands `draft/published`), FR-STG22, FR-STG16; evidence: librarian-portal-scale-audit.md §5 (`published` is agent-settable, retrieval-visible).

**Attack.** Under `auto-apply-low-risk`, high-trust-producer content applies to `published` — which is AI-groundable by default (FR-STG22 is opt-*out*). Agents then ground on that human-unreviewed AI content and propose more from it; the learning loop tunes toward *acceptance*, not truth. This is a closed AI-writes→AI-grounds→AI-writes amplification loop — precisely the "AI amplifying messy workspaces" failure §1 sells against. No FR addresses grounding provenance or gating AI-groundability on human review.

**Fix.** Gate AI-groundability on human-review state, not just the AI-groundable flag: auto-applied-but-unreviewed content is human-visible but not agent-groundable until reviewed (tie FR-STG22 to review status). Add a counter-metric for share of agent grounding sourced from unreviewed auto-applied content.

### M5 — Undeclared cross-service dependencies: `divert-to-memory` and object-storage payloads
**Sections:** Glossary (Disposition `divert-to-memory`), FR-STG6 (object storage), §9 (Depends-on list); evidence: librarian-portal-scale-audit.md §1 (the only built Memory store is in `orvex-studio-api`).

**Attack.** The `divert-to-memory` disposition implies staging writes into a Memory store, but the only real Memory store is `orvex-studio-api`'s — and `orvex-studio-api` is listed in §9 only as *superseded / a client*, never as a **dependency**, so a staging→api Memory write crosses an undeclared contract seam. FR-STG6 mandates object storage for large payloads, which appears nowhere in §9's dependency list either.

**Fix.** Add `orvex-studio-api` (Memory write contract) and an object-storage dependency to §9, or drop `divert-to-memory` from v1. Specify the Memory-write contract if kept.

### M6 — The whole-wiki tidy mandate targets human-authored pages (contradicting the untouched-human-edit boundary) and its sweeps contend with intake for the ≤10-interaction budget
**Sections:** FR-STG18, FR-STG21 ("structurally poor pages", unscoped), §2.2 (human editor path "untouched"), UJ-4, NFR-STG1/SM-3 (≤10 interactions per 100-proposal ChangeSet).

**Attack.** FR-STG21 (beautify structurally-poor pages) and FR-STG18 (supersede-merge near-duplicates) operate on the *whole* wiki, including human-authored pages — so the Librarian will propose rewriting/merging humans' work, which sits uneasily beside §2.2's promise that the human edit path is untouched (recommend-default softens but does not remove the trust hit). Separately, UJ-4's nightly sweeps land in the *same* queue Marta works, so her 9am queue is intake **plus** maintenance recommendations — but the ≤10-interaction budget (NFR-STG1/SM-3) is scoped to a single 100-proposal ChangeSet and ignores this contention.

**Fix.** Scope sweeps' write-proposals to agent-authored pages by default (human-authored pages get flag-only, opt-in beautify), aligning FR-STG21 with UJ-4's "agent-era" wording and §2.2. Separate the maintenance queue budget from the intake ChangeSet budget in NFR-STG1, or state how they share the ≤10.

### M7 — Cold-start gap: a new tenant gets the worst Librarian at first impression, with no default trust or starter prompt pack specced
**Sections:** FR-STG11 (Trust Tiers "derived from historical acceptance"), SM-2 ("after 4 weeks"), Glossary (Prompt Pack "per-customer-tweakable").

**Attack.** Trust Tiers derive from history and learning needs 4 weeks (SM-2) — so a brand-new tenant has empty tiers (nothing auto-apply-eligible) and an untuned prompt, i.e. the Librarian performs *worst* exactly when the customer forms its first impression. No FR specifies a sane default Trust Tier, starter exemplars, or a shipped default Prompt Pack.

**Fix.** Add an FR for cold-start defaults: a shipped baseline Prompt Pack, a conservative default trust posture, and (optionally) cross-tenant priors that never leak tenant content. State the intended day-1 experience.

---

## LOW

### L1 — Multiple load-bearing assumptions are gated on an ADR process the family says is currently blocked
**Sections:** FR-STG26 + §12 (`[ASSUMPTION: new subdomain approved via ADR]`, service name via ADR), §9; evidence: project-context.md §9 ("blocked on the Studio Decision-Records parent + fresh 0001 registry (TBD Act-1)").

**Attack.** FR-STG26 (events), the `studio.staging.*` subdomain, and the service name are all deferred "via ADR," but project-context §9 states the ADR registry itself is blocked pending the Studio Decision-Records parent (TBD Act-1). Assumptions routed to a blocked process are not actually resolvable on the stated path.

**Fix.** Note the ADR-registry dependency explicitly and either unblock it as a prerequisite or provide an interim decision record so these FRs aren't parked behind a blocked gate.

### L2 — SM-1 self-contradicts: "≥99%" vs "zero direct agent wiki writes" after a hard cut
**Sections:** SM-1, FR-STG25.

**Attack.** After a loud hard cut (FR-STG25), direct agent writes fail — the number should be 100% / zero, not "≥99%." The 99% implies a residual leak path the hard cut is supposed to eliminate (and see C1: one really does remain via the CLI).

**Fix.** State it as 100% post-cut, and treat any non-zero direct-write count as an alarm (it means the cut leaks), not an accepted SLO.

### L3 — Unfalsifiable absolutes: "beautiful" pages (FR-STG14) and "never a sibling page" (FR-STG8) have no acceptance criteria
**Sections:** FR-STG14, FR-STG8.

**Attack.** "Re-authored to beautiful ProseMirror pages" has no test — no Success Metric measures beautification quality, yet it's MVP-in and on the apply hot path. "Never a sibling page" is an absolute over a probabilistic matcher (the doc-amend skill only manages it *with* a human question).

**Fix.** Give beautification a checkable definition (schema-valid, contains a TL;DR lead + ≥1 structured node, passes lint) rather than "beautiful," and convert "never a sibling" to a measured duplicate-sibling rate target.

### L4 — Base-version stamping and triage diffs read engine content that can lag ≤45s, so the diffs Marta trusts may be stale
**Sections:** FR-STG4, FR-STG7 (rendered diff), UJ-2 ("skims ten diffs"); evidence: engine-scale-mechanics.md §3 (ydoc→DB persist debounced 10s/45s; `page.content` stale after write).

**Attack.** The engine's `version` bumps synchronously but `page.content` flushes on a 10–45s debounce, so a diff rendered at triage can be computed against content that lags the authoritative ydoc. The review UX ("skim the diff and bulk-accept") assumes the diff is faithful; within the staleness window it may not be.

**Fix.** Have triage read content through the authoritative path (ydoc/`orvex-wiki-api`) rather than the lagging column, or stamp diffs with the source version and re-render on any change before apply. Note the ≤45s tolerance in the apply/verify contract (already half-captured in addendum A3).

---

## What would move this to PASS
Close C1 (name and gate the single enforcement chokepoint; extend the hard cut to the CLI path), resolve the beautification double-bind (H2/H3 — decide granularity and move beautify off the apply-SLO path), reground the SLOs on measured non-501 dependencies with an explicit sequencing gate (H1/H4), and settle the Card Contract v1 supersession field-authority + migration (H5). The mediums are mostly honest-scoping and coverage fixes that architecture can absorb once the highs are closed.
