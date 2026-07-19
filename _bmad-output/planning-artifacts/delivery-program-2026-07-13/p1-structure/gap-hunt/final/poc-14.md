## 🎯 Story

As a **user with a growing library**, I want **a segmented All / Created / Saved / Drafts control (with live counts, empty sub-groups omitted), an in-library search box, a sort control, filter chips, and a full status badge per card (Draft / Published / Native / Forked+lineage / Saved+source)** so that **I can find and understand any of my skills at a glance, however large my library grows** (sibling of FR-UI19/E5-S5).

**Definition of Done:** ONE named test `TestLibrarySegmentsSearchSortFilterAndStatusBadges` — a component-integration test asserting the segmented control renders All/Created/Saved/Drafts with live counts and omits empty sub-groups, in-library search filters the current segment as-you-type, sort and filter chips compose with the segment and search, and every card renders the correct status badge (Draft/Published/Native/Forked with a lineage chip/Saved with a source chip) using text+shape never colour-alone, verified through rendered state. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given the library, When it loads, Then a segmented control renders All / Created / Saved / Drafts with live counts inline; empty sub-groups are omitted, never shown as a fake '0' segment. *Assertion: segment counts are real; zero-count segments hidden.* [Source: POC design-artifacts/D-Design-System/screens/10-myskills.md Reconciliation]
- [ ] **AC2** — Given a segment, When the user types in the in-library search box, Then results filter live within that segment (scope label visible). *Assertion: search scoped to active segment.* [Source: POC 10-myskills.md Reconciliation]
- [ ] **AC3** — Given a segment, When Sort is applied, Then ordering changes accordingly and composes with any active search/filter. *Assertion: sort + search + filter compose.* [Source: POC 10-myskills.md Reconciliation]
- [ ] **AC4** — Given results, When a filter chip is applied, Then the grid narrows accordingly and composes with segment/search/sort. *Assertion: filter composes with the rest.* [Source: POC 10-myskills.md Reconciliation]
- [ ] **AC5** — Given a card, When rendered, Then its status badge is one of Draft / Published / Native / Forked (with a lineage chip to the parent) / Saved (with a source chip) — rendered as text+shape, never colour-alone. *Assertion: correct badge per skill state; text+icon present.* [Source: POC 10-myskills.md Reconciliation 'Card status badge']
- [ ] **AC6 (negative)** — Given a segment/search/filter combination with zero results, When rendered, Then an honest segment-specific empty state renders (never a blank grid, never '0'). *Assertion: empty combination shows guidance.* [Source: POC 10-myskills.md 'Segment-empty / filtered-empty']

## 🔨 Tasks

- [ ] RED: `TestLibrarySegmentsSearchSortFilterAndStatusBadges` (AC1/AC5/AC6).
- [ ] GREEN: segmented control + live counts + empty-subgroup omission (AC1); in-library search (AC2); sort (AC3); filter chips (AC4); full status-badge set (AC5); composed-empty honest state (AC6).

## 🧠 Context

E5-S5 covers Delta-intact reopen, Collections CRUD, bulk export, and cross-device hydrate for the library, but ships a flat unsegmented list with only a binary 'Made yours'/'Saved' badge (matching the POC's own flat 4-card capture). The POC's own reconciliation explicitly calls out the segmented control, in-library search/sort/filter, and the fuller status-badge set as required additions this story fills. React-front presentation layer (CS §6). Seam: BFF library read (shared with E5-S5). Sibling dependency: E5-S5 (Library & Collections — this story extends its list surface; ship after E5-S5's base list lands).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. design-artifacts/D-Design-System/screens/10-myskills.md ('No segmented control… ADD in build', 'No search-within-library/sort/filter… ADD per spec', 'Card status badge… extend to the full §2.4 badge set'). E5-S5's ACs cover only reopen/Collections/export/hydrate — no segmentation/search/sort/filter/status-badge AC.

## 🧪 Testing

`TestLibrarySegmentsSearchSortFilterAndStatusBadges` (component-integration) + unit tests on the segment/search/sort/filter composition. CS §5 mocking: BFF library fixtures (shared with E5-S5); never mock own composition logic.

## 📏 Guidance

CS `6aMAzsYeQb` §6 shallow view · §11 honest empty states (segment/filtered-empty distinct) · §5 fixture the sibling; SE-Arch `8sYi523i4t` honesty lens (text+shape status, never colour-alone).

## 🔗 References

PRD `xsRMrju3D1` (FR-UI19) · POC design-artifacts/D-Design-System/screens/10-myskills.md.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2109** (Definition Pack — the contract TAG is the dispatch gate).
- [ ] Sibling: E5-S5 (Library & Collections — this story extends its list surface with segmentation/search/sort/filter/status-badges; ship after E5-S5's base list lands).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
