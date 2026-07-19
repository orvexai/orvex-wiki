## 🎯 Story

As a **signed-in creator with no existing Skill to fork**, I want **a create-from-scratch authoring surface at `/app/create/:skillId` — a 2-step scaffold wizard (name+intent → starter template / pick-sections) that dissolves into a Notion-style block canvas of the 11 typed block kinds via a slash-menu, a re-enterable Guide rail, a live deterministic preview, a file-block dual safety-scan, and a draft→vetting→published lifecycle** so that **I can author a real Skill from nothing — never a blank prompt box, never a fake capture score — using the same Render/validation/publish path as every seeded Skill**.

**Definition of Done:** ONE named test `TestAuthoringScaffoldToPublishedNativeSkill` (integration — asserts S1 name+intent → S2 starter-template pick mints a NATIVE draft with ≥1 non-empty Section (Skip never yields a blank canvas), the canvas renders all 11 block kinds via the slash-menu with per-kind typed widgets + inline plain-English validation, a lossy transform names exactly what is lost and disables-not-destroys the original, a file block runs both Scan A (catalogue-vetting posture) and Scan B (per-upload) and quarantines a Flagged file while the Skill still saves, the live preview renders byte-stable deterministic text matching Copy exactly with an approximate (labelled, non-token) word count, and Publish transitions draft→vetting→published minting v1 NATIVE with a 'New' badge (never 'Used by 0') and a version-history panel — through the create-surface + skill APIs). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (scaffold + name, no Base)** — Given the scaffold wizard, When the user enters name+intent and either picks starter sections or taps Skip, Then a NATIVE draft is minted with no Base/Delta parent (authored directly, not forked), Skip deposits ≥1 empty Section, and the canvas is never blank. *Assertion: new skill has no parent ref; ≥1 Section always present.* [Source: POC skill-authoring-scenario-and-spec.md §3.1 S1–S2; POC authoring.jsx L20-52; POC p4-requirements-inventory.md FR-32]
- [ ] **AC2 (11 typed kinds via slash-menu)** — Given the block canvas, When the slash menu or drag-handle context menu is used, Then all 11 first-class kinds (Text, Instruction, Example, Placeholder, Rule, Conditional, Task-list, Context, Verbatim, File, Free-form/Raw) are insertable via a per-kind default-content factory, each rendering its own typed widget (e.g. Example = input+output+few-shot; Placeholder = name+type+options+default+required; Rule = must/must-not polarity), and 2+ advanced kinds are labelled 'Advanced'. *Assertion: 11/11 kinds render their typed widget; advanced kinds tagged.* [Source: POC skill-authoring-scenario-and-spec.md §4.1; POC authoring.jsx L94-96, L607-655, L724-863]
- [ ] **AC3 (inline validation)** — Given a block with incomplete content, When rendered, Then an inline plain-English validation hint renders (e.g. Example needs input+output; Placeholder needs a name; Conditional needs cond+then) — never a blocking error; the block stays editable. *Assertion: hint matches the per-kind rule; block editable.* [Source: POC authoring.jsx L707-721]
- [ ] **AC4 (transform loss-matrix)** — Given a kind-to-kind transform, When it is lossy (e.g. Example→Text), Then a confirm names exactly what is lost and the original block is kept disabled (reversible), never destroyed; transforms that would reflow Verbatim bytes are refused. *Assertion: loss-matrix enforced; no silent data loss.* [Source: POC skill-authoring-scenario-and-spec.md §4.4]
- [ ] **AC5 (re-enterable Guide rail)** — Given the Guide rail, When toggled open, Then it shows a live, honest, no-score checklist (name set / intent set / N blocks in M sections / publish-ready) and can add/edit intent without leaving the canvas (no second editor). *Assertion: checklist booleans derive from real state; rail intent edits persist to the same Delta.* [Source: POC authoring.jsx L152-164, L461-497]
- [ ] **AC6 (live deterministic preview + shared Render)** — Given authored content, When any block changes, Then a live preview re-renders via the same deterministic Render used for seeded/forked Skills (pure, no LLM, byte-identical for identical input) with an approximate (labelled, non-token) word count, and Copy emits the exact same plain text; disabled/Raw/Verbatim blocks pass through byte-for-byte. *Assertion: preview output === `render()` output byte-for-byte; preview text === Copy payload.* [Source: POC authoring.jsx L104-146, L563-587; POC p4-requirements-inventory.md FR-32]
- [ ] **AC7 (file block dual-scan + quarantine)** — Given a file-block upload, When created, Then both Scan A (import/catalogue vetting posture) and Scan B (real per-upload in-editor scan) run; a Flagged result quarantines the file (not rendered, Skill still saves) with an honest inline error + recoverable placeholder, and an unsupported type is held with a 'not added and not lost' message — never silently dropped. *Assertion: dual-scan pipeline; Flagged/unsupported → quarantine copy, Skill save succeeds.* [Source: POC skill-authoring-scenario-and-spec.md §3.1 S4, §8 Q9; POC authoring.jsx L866-916]
- [ ] **AC8 (save + publish lifecycle)** — Given a named, authored Skill, When saved, Then it persists to the user's Library (publish optional, not required to save); When published, Then status moves draft→vetting→published, mints v1 NATIVE with social ON, provenance 'Created in Orvex', a 'New' badge (never 'Used by 0'), and a version-history panel (browse + diff + revert); editing a published skill returns it to draft-until-republish (honest, non-silent). *Assertion: save→Library; publish reuses the shared publish/vetting pipeline; status transitions in order; badge never implies false usage.* [Source: POC skill-authoring-scenario-and-spec.md §3.1 S6–S7; POC authoring.jsx L179-181, L253-258, L387-414; POC p4-requirements-inventory.md FR-32]
- [ ] **AC9 (no whole-Skill AI generation)** — Given the authoring surface, When used, Then it contains no whole-Skill AI-generation affordance — authoring is manual only. *Assertion: no 'generate skill' AI action present.* [Source: POC p4-requirements-inventory.md FR-32, §5 Non-Goals]

## 🔨 Tasks

- [ ] RED: `TestAuthoringScaffoldToPublishedNativeSkill` (AC1/AC6/AC8).
- [ ] GREEN: S1/S2 scaffold wizard + starter templates + Skip-deposits-empty-Section (AC1); block factory + slash-menu + 11 per-kind widgets (AC2); inline validation (AC3); transform loss-matrix disable-not-destroy (AC4); re-enterable Guide rail (AC5); shared deterministic Render preview + approximate word count + byte-faithful Copy (AC6); file dual-scan + quarantine + visualizer (AC7); save→Library + publish lifecycle + New badge + version history (AC8); explicitly omit AI-generate-whole-skill (AC9).

## 🧠 Context

React-front authoring editor (CS §6 — the deterministic weave/render is presentational, no-LLM). Distinct from E4-S3 'Builder Base+Delta', whose AC1 is explicitly scoped 'Given a fork' — it edits an EXISTING skill's Delta over a Base and has no scaffold wizard, no 11-block-kind picker, no Guide rail, no draft→vetting→published lifecycle for a brand-new NATIVE skill. Create has no Base, so it reuses E4-S3's typed-block toolbar + the shared Render call + the Base/Delta persistence primitive (a NATIVE draft is Base+Delta from birth) rather than the fork semantics. Seam: BFF skill-create/Delta persist. Sibling dependency: E2-S3 (routing map, ENG-2660 — the `/app/create/:skillId` route this mounts at), E4-S2 (Skill Viewer, ENG-2668 — shared preview rendering), E4-S3 (shared weave/Delta model), api E2-S1 (skill model + shared Render + persistence, ENG-2301), E1-S5 (honest states), E1-S3 (DS tokens for the 11 block-kind badges).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. Consolidates three independent finds of the same surface: FR-32 (p4-requirements-inventory.md, create-from-scratch), skill-authoring-scenario-and-spec.md §1 J1/§3.1/§4 (scaffold wizard + 11 kinds + loss-matrix + dual-scan), and web/src/prototype/screens/authoring.jsx (918-line live prototype). The `/app/create/:skillId` route is acknowledged only as a routing-map line in E2-S3; no story builds what mounts there.

## 🧪 Testing

`TestAuthoringScaffoldToPublishedNativeSkill` (integration) + unit tests on each block-kind widget, the loss-matrix, keyboard-reorder equivalents, and the deterministic-weave pure function. CS §5 mocking: BFF skill-create/scan fixtures; never mock own canvas/wizard/weave rendering.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view (no client-side domain logic — BFF/api own it) · §11 honesty (no fake score, no silent file loss, 'New' never 'Used by 0') · §3 naming (block-kind labels) · §5 fixture the sibling (E4-S3 weave).
- SE-Arch `8sYi523i4t`: honesty lens (lossless Raw catch-all); no-data-loss lens (disable-not-delete, quarantine-not-drop); reuse-don't-redesign lens (cite the reused surfaces, don't re-spec them).
- Cell-lint `JGAUQRsw2g`: N/A runtime.

## 🔗 References

PRD `xsRMrju3D1` (FR-UI12/FR-UI13 family; nearest existing FR covers only the fork/edit Builder) · POC `p4-requirements-inventory.md` FR-32 · POC `skill-authoring-scenario-and-spec.md` §1 J1/§3.1/§4 (PO-confirmed 2026-06-16, all 11 open questions resolved) · POC `web/src/prototype/screens/authoring.jsx` (ground truth, 918 lines) · ui E2-S3/E4-S2/E4-S3; api E2-S1.

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Blocked by:** ENG-2660 (ui E2-S3 routing map — the route this mounts at), ENG-2668 (ui E4-S2 Skill Viewer — shared preview rendering), ENG-2301 (api E2-S1 skill model — shared Render + persistence).
- [ ] **Intra-service order:** after E4-S2; shares the weave/Delta substrate with E4-S3.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
