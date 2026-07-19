## 🎯 Story

As a **user with a customised skill**, I want **a merge overlay when the maker publishes a new Base version — non-conflicting maker changes auto-applied with nothing to decide, and for each piece I've also customised a side-by-side My-changes/New-version choice (Keep mine · Take the new one · Blend both)**, so that **the maker's improvements land without ever silently overwriting my own edits** (sibling of FR-UI13/E4-S3).

**Definition of Done:** ONE named test `TestGotBetterAutoAppliesSimpleAndResolvesConflictsPerPiece` — a component-integration test asserting: (a) maker changes to pieces the user never touched are classified 'simple' and rendered under an informational 'Updated for you · nothing to decide' section with an 'Applied' tag and no decision control, (b) maker changes to pieces the user DID customise are classified 'conflicts' and rendered as side-by-side My-changes/New-version panes defaulting to Blend both, (c) choosing Keep mine / Take the new one / Blend both per conflict and hitting Apply persists exactly that resolution per piece with the user's untouched Delta pieces left intact, and (d) the user's original Delta is always recoverable (undo), verified through the resolved Delta state. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a Base version advances on a skill the user has customised, When the pieces the maker changed do NOT overlap the user's touched pieces, Then those changes render under an informational, non-decision 'Updated for you · nothing to decide' list with an 'Applied' tag. *Assertion: simple changes render with no decision control.* [Source: POC design-artifacts/D-Design-System/screens/07-gotbetter.md Region B1]
- [ ] **AC2** — Given a Base version advances, When a changed piece DOES overlap a piece the user customised, Then a conflict card renders with side-by-side 'My changes' / 'The new version' panes for that piece only. *Assertion: conflict card scoped to the overlapping piece(s).* [Source: POC 07-gotbetter.md Region B2]
- [ ] **AC3** — Given a conflict card, When it opens, Then the default resolution is 'Blend both' (keeps the user's wording, folds in genuinely-new maker content) — never silently 'Take the new one'. *Assertion: default decision === blend.* [Source: POC 07-gotbetter.md 'Default decision']
- [ ] **AC4** — Given a conflict card, When the user picks Keep mine / Take the new one / Blend both, Then the choice is recorded per-piece and does not affect other conflicting pieces. *Assertion: per-piece independent decisions.* [Source: POC 07-gotbetter.md Choice segmented control]
- [ ] **AC5** — Given the resolutions, When 'Apply update' is hit, Then the Delta is updated to reflect exactly the chosen per-piece resolutions, the user's untouched Delta pieces are unchanged, and the prior Delta remains recoverable (undo/original-safe). *Assertion: resolved state matches decisions; undo path exists.* [Source: POC 07-gotbetter.md Region C safety line + Reconciliation 'Never overwrite the user's work']
- [ ] **AC6 (negative)** — Given no maker update exists for a skill, When the overlay is invoked, Then nothing renders (no update = no overlay). *Assertion: guard renders null.* [Source: POC 07-gotbetter.md 'No update / guard']

## 🔨 Tasks

- [ ] RED: `TestGotBetterAutoAppliesSimpleAndResolvesConflictsPerPiece` (AC1/AC2/AC5).
- [ ] GREEN: simple-vs-conflict piece classification against the user's touched-pieces set (AC1/AC2); side-by-side merge panes + Blend-both default (AC3); per-piece Choice control (AC4); Apply → resolved Delta + undo-safe (AC5); no-update guard (AC6).

## 🧠 Context

The only ticketed behaviour for a Base version advancing while the user has an unsaved/saved Delta is E4-S3 AC5's flat 'updated to vN — reload' banner — materially simpler than the POC's promise ('we never overwrite your work; choose what to keep — piece by piece'). The banner is a reasonable floor for the unsaved-edit concurrency case; this story is the richer published-new-Base-version merge flow the POC specifies, referenced from the Your-Skills library ('New version available' inline button, 10-myskills.md B3). React-front overlay (CS §6). Seam: BFF Delta + Base-diff. Sibling dependency: E4-S3 (Base+Delta Builder — hosts the Delta this overlay resolves into; E4-S3's 'reload' banner remains the concurrent-edit floor, this is the richer new-version merge).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. design-artifacts/D-Design-System/screens/07-gotbetter.md + 10-myskills.md B1/B3. Zero 'gotbetter'/'blend'/'keep mine' hits anywhere in the delivery program; no story owns the simple/conflict classification or the per-piece Keep-mine/Take-new/Blend-both resolution UI.

## 🧪 Testing

`TestGotBetterAutoAppliesSimpleAndResolvesConflictsPerPiece` (component-integration) + unit tests on the simple/conflict classifier. CS §5 mocking: BFF Delta + Base-diff fixtures; never mock own classifier/merge render.

## 📏 Guidance

CS `6aMAzsYeQb` §6 shallow view · §11 honest (never overwrite, undo-safe) · §5 fixture the sibling; SE-Arch `8sYi523i4t` no-data-loss lens.

## 🔗 References

PRD `xsRMrju3D1` (FR-UI13, MB3 canon) · POC design-artifacts/D-Design-System/screens/07-gotbetter.md · 10-myskills.md B1/B3.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2109** (Definition Pack — the contract TAG is the dispatch gate).
- [ ] Sibling: E4-S3 (Base+Delta Builder — hosts the Delta this overlay resolves into; its simpler 'reload' banner remains the concurrent-edit floor).
- [ ] PO scope confirmation: whether GotBetter ships as a baseline flow or a later power surface (per the POC's own flagged open call) should be confirmed before dispatch; the functionality is unticketed either way.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
