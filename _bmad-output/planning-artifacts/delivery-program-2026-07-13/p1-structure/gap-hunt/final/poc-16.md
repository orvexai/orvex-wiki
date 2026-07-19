## 🎯 Story

As a **signed-in user who just got a useful woven skill render**, I want **a subordinate 'Save to Wiki' action on the Skill Use surface that opens a Save Sheet and files the answer into my own Docmost space**, so that **useful AI answers are captured into a home I own, distinct from Copy and distinct from Memory capture-back** (your-wiki-scenario-and-spec.md §2).

**Definition of Done:** ONE named test `TestSaveToWikiWritesDeterministicPageToDocmost` — an integration test asserting: (a) 'Save to Wiki' renders as a subordinate `.btn-soft` action on Skill Use that never outranks the Tier-1 Copy button, (b) tapping it opens the Save Sheet overlay (focus-trapped, shared overlay contract) with the deterministic content mapping pre-filled from the woven render, (c) confirming issues a real POST to the BFF which writes to the user's provisioned private Docmost space via the service-account write path, and (d) every fail-soft state (space not yet provisioned, Docmost unreachable, offline) renders an honest inline message — never a silent failure or a fabricated 'Saved' confirmation. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given the Skill Use surface (`/app/s/:skillId/use`), When rendered for a signed-in user, Then 'Save to Wiki' appears as a subordinate `.btn-soft` action that never outranks the Tier-1 Copy button, and is absent for anonymous users (Wiki is signed-in only). *Assertion: subordinate placement; anon-absent.* [Source: POC your-wiki-scenario-and-spec.md §6.5, secondary-screens-and-shell-spec.md §5.3.4]
- [ ] **AC2** — Given 'Save to Wiki' is tapped, When the Save Sheet opens, Then it is a focus-trapped overlay (shared overlay contract) pre-filled via the deterministic content-mapping rules (the woven render's typed blocks mapped onto Docmost page content, never an AI-generated summary). *Assertion: deterministic pre-fill, no LLM in the mapping.* [Source: POC your-wiki-scenario-and-spec.md §2.2, §2.3]
- [ ] **AC3** — Given the Save Sheet is confirmed, When the write executes, Then the BFF issues a real POST to `/api/pages/create` against the user's provisioned PRIVATE Docmost space via the service-account auth path (never the user's own Clerk-SSO session for the write), and a real confirmation renders only after the write succeeds (never an optimistic fake-render of Docmost content). *Assertion: real write; confirmation gated on success.* [Source: POC your-wiki-scenario-and-spec.md §2.4, §5.3, §5.4]
- [ ] **AC4** — Given the user's private Docmost space has not yet been provisioned, When Save to Wiki is used for the first time, Then provisioning runs as a real prerequisite step with an honest in-flight state (never a silent stall or a fabricated success). *Assertion: first-save provisioning state renders honestly.* [Source: POC your-wiki-scenario-and-spec.md §1.3 Journey C, §2.6]
- [ ] **AC5** — Given Docmost is unreachable or the user is offline, When Save to Wiki is attempted, Then it fails-soft inline with a clear retry (never queued as silently-done, never blocking Copy or any other action on the page). *Assertion: fail-soft, never silent, never blocks Copy.* [Source: POC your-wiki-scenario-and-spec.md §5.7, §2.5]

## 🔨 Tasks

- [ ] RED: `TestSaveToWikiWritesDeterministicPageToDocmost` (AC2/AC3/AC5).
- [ ] GREEN: subordinate Save-to-Wiki action on Skill Use (AC1); Save Sheet overlay + deterministic content mapping (AC2); BFF write path + success-gated confirmation (AC3); first-save provisioning state (AC4); fail-soft states (AC5).

## 🧠 Context

React-front capture surface (CS §6 — the content-mapping is deterministic/presentational, no LLM). Distinct from E7-S1, which is explicitly read-only ('no in-app wiki editing per non-goal') — this is the write/capture direction. Also distinct from Memory's capture-back (M4.3, E5-S2) which saves a FACT into Memory (goes IN); this saves an ARTIFACT into the Wiki (comes OUT) — the two must never blur per the POC's D-2 sibling-not-same-loop note. Seam: BFF wiki-write + Docmost provisioning (the DocmostPort backend is api E8-S1). Sibling dependency: E4-S2/E4-S3 (hosts the Skill Use render this action mounts on), E1-S6 (entitlement gating if any).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. your-wiki-scenario-and-spec.md §2, §5. E7-S1 is scoped read-only; this is the write/capture direction and appears in no ui story's ACs.

## 🧪 Testing

`TestSaveToWikiWritesDeterministicPageToDocmost` (integration) + unit tests on the deterministic content-mapping rules. CS §5 mocking: BFF wiki-write/provisioning fixtures; never mock own Save-Sheet rendering.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view · §11 honesty (no black-box scores, no fabricated proof, honest empty states) · §3 naming.
- SE-Arch `8sYi523i4t`: honesty lens (no fabricated 'Saved'); reuse-don't-redesign lens.

## 🔗 References

PRD `xsRMrju3D1` (distinct from FR-UI24's read-only Ask surface) · POC `your-wiki-scenario-and-spec.md` §2, §5 (PO-decided 2026-06-17 D-5 in-app /app/wiki route + D-2 sibling-not-same-loop).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Related:** E7-S1 (read-only Wiki surface, distinct direction), E5-S2 (Memory capture-back, the sibling IN-loop that must not blur with this OUT-loop), api E8-S1 (DocmostPort write path).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
