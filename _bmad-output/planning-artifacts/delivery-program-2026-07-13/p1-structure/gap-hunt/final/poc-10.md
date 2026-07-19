## 🎯 Story

As a **Skill contributor uploading a file into a File block**, I want **a visible upload → size/type guard → real safety-scan badge (Scanning / Passed / Flagged) → visualizer pipeline, with Flagged content quarantined (never rendered, but the skill still saves) and honest inline errors on over-limit/unsupported files**, so that **I can trust what I upload is safe, and never lose my other edits to one bad file**.

**Definition of Done:** one named test `TestFileBlockUploadScanQuarantineAndVisualize` (integration — uploads four fixtures: a clean image (renders inline), a clean PDF (renders inline), a clean code file (renders with syntax highlighting inline), a clean Word/sheet doc (renders as a typed download card), and a fixture flagged by the safety scan (quarantined, not rendered, skill save still succeeds) plus an over-limit file (honest inline error, recoverable placeholder) — and asserts the badge sequence Scanning→Passed/Flagged renders with non-color status text throughout, through the Builder's File-block component). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (guard + scan badge)** — Given a file upload into a File block, When it starts, Then a size/type guard runs first, followed by a real safety-scan with a visible badge sequence Scanning → Passed or Scanning → Flagged, and the badge status is conveyed by non-color text (never color-alone). *Assert: badge sequence renders; status text present at every state.* [Source: POC p4-requirements-inventory.md FR-33]
- [ ] **AC2 (Flagged = quarantine, not delete)** — Given a Flagged scan result, When processed, Then the file is quarantined — not rendered as content — but the Skill itself still saves successfully (the flag does not block the rest of the edit). *Assert: Flagged file → no content render; Skill save succeeds.* [Source: POC p4-requirements-inventory.md FR-33]
- [ ] **AC3 (over-limit/unsupported)** — Given a file that is over the size limit or an unsupported type, When uploaded, Then an honest inline error renders with a recoverable placeholder (retry/replace), never a silent failure or crash. *Assert: over-limit/unsupported → inline error + recoverable placeholder.* [Source: POC p4-requirements-inventory.md FR-33]
- [ ] **AC4 (visualizers)** — Given a Passed file, When rendered, Then it uses the correct typed visualizer: image and PDF render inline, code files render inline with syntax highlighting, and Word/sheet documents render as a typed download card (never raw bytes or a broken embed). *Assert: each of the four fixture types renders through its correct visualizer.* [Source: POC p4-requirements-inventory.md FR-33]

## 🔨 Tasks

- [ ] File-block upload component: size/type guard → BFF scan call → badge state machine (Scanning/Passed/Flagged) (AC1)
- [ ] Quarantine-on-Flagged: exclude flagged content from render, keep Skill save path unblocked (AC2)
- [ ] Inline error + recoverable placeholder for over-limit/unsupported uploads (AC3)
- [ ] Four typed visualizers: image, PDF, code-highlight (inline), Word/sheet (typed download card) (AC4)
- [ ] Non-color status text on every badge state (a11y) (AC1)
- [ ] Write `TestFileBlockUploadScanQuarantineAndVisualize` (RED→GREEN)

## 🧠 Context

React-front Builder sub-component (CS §6 — the scan itself is BFF/backend; ui owns the upload UX + visualizers). Seam: BFF safety-scan endpoint (the backend Scan-B half should ride the same api vetting-gate work as the Scan-A vetting-gate ticket). This is the per-upload pipeline (Scan B), distinct from the catalogue-level vetting gate (Scan A, the api vetting-gate ticket). Sibling dependency: ui E4-S3 Builder (ENG-2669 — File block is one Item kind within it), api E2-S1 skill model (ENG-2301 — File-block persistence). Also surfaces inside the create-from-scratch authoring editor's file block.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. FR-33 specifies this per-upload pipeline in full (guard → badge → quarantine → visualizer); neither the Builder story nor any other ui/api story references a File block, an upload scan, or any of the four visualizer types.

## 🧪 Testing

Named DoD test: `TestFileBlockUploadScanQuarantineAndVisualize` (integration/component). Tiers: unit (badge state machine, visualizer dispatch-by-type) + integration (upload→scan→render round trip against BFF fixtures). CS §5 mocking: mock the BFF scan endpoint; never mock own upload/visualizer UI.

## 📏 Guidance

CS 6aMAzsYeQb §6 shallow view · §11 honest states (Flagged quarantined not hidden; over-limit error recoverable); SE-Arch 8sYi523i4t lenses (fail-typed not silent, quarantine-never-blocks-save); a11y non-color-alone status (NFR-UI2).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-33 (§4.13); PRD `xsRMrju3D1` (FR-UI13 Builder); ui E4-S3.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2109** (Definition Pack — contract TAG gate).
- [ ] Blocked by: **ENG-2669** (ui E4-S3 Builder — File block hosts within it), **ENG-2301** (api E2-S1 skill model — File-block field persistence); the backend Scan-B endpoint rides the same api vetting-gate work as the Scan-A ticket.
- [ ] Blocks: none (leaf UI feature).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
