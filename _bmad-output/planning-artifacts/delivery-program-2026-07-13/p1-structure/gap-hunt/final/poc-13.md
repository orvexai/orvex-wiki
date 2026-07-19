## 🎯 Story

As a **user editing a Skill in the Builder**, I want **an approximate word count (e.g. '~320 words') shown at the preview header, updating live as I edit**, so that **I get a quick sense of prompt length without needing exact tokenization**.

**Definition of Done:** one named test `TestBuilderPreviewShowsLiveApproxWordCount` (component-integration — edits Delta content in the Builder and asserts the preview header's word-count string updates live to reflect an approximate count, using a simple whitespace-split heuristic rather than true tokenization, through the Builder preview component). *Final elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (display + placement)** — Given the Builder's live preview, When it renders, Then an approximate word count (e.g. '~320 words') is shown at the preview header, alongside the rendered content. *Assert: word-count string present in the preview header DOM region.* [Source: POC p4-requirements-inventory.md FR-9]
- [ ] **AC2 (live update)** — Given an edit to any Item, When the preview re-renders, Then the word count updates to reflect the new content without a manual refresh. *Assert: edit → count changes within the same render pass as the preview update.* [Source: POC p4-requirements-inventory.md FR-9]
- [ ] **AC3 (approximate, not tokenized)** — Given the count method, When computed, Then it uses a simple approximate heuristic (e.g. whitespace-split word count), explicitly not true LLM tokenization — and is never presented as an exact token count. *Assert: count uses the documented approximate method; no tokenizer dependency.* [Source: POC p4-requirements-inventory.md FR-9, addendum.md §9]

## 🔨 Tasks

- [ ] Approximate word-count function (whitespace-split heuristic) over the rendered preview text (AC1, AC3)
- [ ] Wire into the preview header, recomputed on every preview re-render (AC1, AC2)
- [ ] Write `TestBuilderPreviewShowsLiveApproxWordCount` (RED→GREEN)

## 🧠 Context

React-front presentational addition to the existing Builder preview (CS §6). Pure client-side computation, no new seam. Sibling dependency: ui E4-S3 (Builder, ENG-2669 — the preview header this mounts inside). The same approximate word-count also surfaces in the create-from-scratch authoring editor and the Review-inbox post-merge preview.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. FR-9 names the approximate word count as one of the preview header's required elements (alongside the deterministic render and exact-plain-text Copy, both of which ARE covered by E4-S3); only the word count itself has zero coverage anywhere.

## 🧪 Testing

Named DoD test: `TestBuilderPreviewShowsLiveApproxWordCount` (component-integration). Tiers: unit (count-function correctness on fixture strings) + component (live-update on edit). CS §5: pure function, nothing to mock.

## 📏 Guidance

CS 6aMAzsYeQb §6 shallow view · §3 naming (label it 'approximate', never imply exact tokenization — honesty lens); SE-Arch 8sYi523i4t (no-overclaim lens); cell-lint JGAUQRsw2g (n/a runtime).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-9 (§4.4 Builder); addendum.md §9 Assumptions Index; ui E4-S3.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2109** (Definition Pack — contract TAG gate).
- [ ] Blocked by: **ENG-2669** (ui E4-S3 Builder — hosts the preview header this mounts inside).
- [ ] Blocks: none (leaf presentational feature).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
