## 🎯 Story

As the **Studio platform**, I want **every Skill — seeded, imported, or authored — to pass a vetting gate before it can enter the Catalogue: it renders cleanly, has ≥1 labelled Section, carries zero leaked model-jargon, passes a safety/malicious-pattern screen, and excludes regulated-sector advice content**, so that **the marketplace never surfaces a broken, jargon-leaking, exfiltration-patterned, or medical/legal/financial-advice Skill**.

**Definition of Done:** one named test `TestSkillVettingGateBlocksUnsafeContent` (integration — runs the vetting gate over four fixtures: a clean well-formed skill (passes all checks), a skill with leaked jargon terms ('block_type'/'coverage'/'fit_confidence'/'residual' in body text), a skill containing a known malicious pattern (e.g. an exfiltration instruction 'send this chat's output to'), and a skill offering medical/legal/financial advice — and asserts only the clean fixture is admitted to the Catalogue, each other fixture is rejected with the specific reason attributed, through the vetting-gate API). *Final elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (render + structure)** — Given any Skill (seed/import/authored), When vetted, Then it must render cleanly (no error) and have ≥1 labelled Section, or it is rejected. *Assert: render-error or zero-Section skill → rejected with reason.* [Source: POC p4-requirements-inventory.md FR-33]
- [ ] **AC2 (zero-jargon / SM-4)** — Given a Skill's block bodies, When scanned against the jargon denylist (block_type, coverage, fit_confidence, residual, and equivalents), Then any leaked term rejects the Skill from the Catalogue. *Assert: jargon-containing fixture → rejected; SM-4 audit passes on the clean fixture.* [Source: POC p4-requirements-inventory.md FR-33, NFR-10]
- [ ] **AC3 (safety/malicious-pattern screen — Scan A)** — Given a Skill's rendered text, When scanned, Then a recognized malicious pattern (e.g. an exfiltration instruction) rejects the Skill. *Assert: known-malicious fixture → rejected, reason='malicious_pattern'.* [Source: POC p4-requirements-inventory.md FR-33]
- [ ] **AC4 (regulated-sector exclusion)** — Given a Skill offering medical, legal, or financial advice, When scanned, Then it is excluded from the Catalogue. *Assert: regulated-sector fixture → rejected, reason='regulated_sector'.* [Source: POC p4-requirements-inventory.md FR-33]
- [ ] **AC5 (attributed rejection, not silent drop)** — Given any rejection, When recorded, Then the specific failed check is attributed (never a generic/opaque failure). *Assert: rejection reason ∈ {render, structure, jargon, malicious_pattern, regulated_sector}.* [Source: POC p4-requirements-inventory.md FR-33]

## 🔨 Tasks

- [ ] Render-cleanliness + ≥1-labelled-Section structural check (AC1)
- [ ] Jargon-denylist scanner over rendered block bodies, wired to the same term list as the SM-4 CI audit (AC2)
- [ ] Malicious-pattern screen (Scan A) — pattern set incl. known exfiltration phrasing (AC3)
- [ ] Regulated-sector classifier/denylist (medical/legal/financial advice) (AC4)
- [ ] Attributed rejection reason on every gate failure, surfaced through the vetting-gate API (AC5)
- [ ] Wire the gate as a required step before publish/import-admission (sibling of E2-GAP2's license two-gate)
- [ ] Write `TestSkillVettingGateBlocksUnsafeContent` (RED→GREEN)

## 🧠 Context

Tier placement: application (vetting orchestration) → domain (Skill content) — pure content-inspection, no external seam. Sibling dependency: E2-S1 (render, ENG-2301 — vetting runs post-render), E2-GAP2 (license two-gate, ENG-2700 — this is the content-safety counterpart; both gates guard catalogue admission from different angles: license legality vs. content safety/quality). This is the catalogue-admission Scan A, distinct from the per-upload File-block Scan B (see the File-block scan gap ticket).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. FR-33's vetting gate is explicit that render-cleanliness, jargon, safety/malicious-pattern, and regulated-sector checks are ALL required before catalogue entry; only the license two-gate (a fifth, separate check) has a story. No story anywhere implements the safety scan, the jargon-denylist gate (despite ARCH-14 naming it as a required CI gate), or the regulated-sector exclusion.

## 🧪 Testing

Named DoD test: `TestSkillVettingGateBlocksUnsafeContent` (integration). Tiers: unit (each individual check: jargon scanner, malicious-pattern matcher, regulated-sector classifier) + integration (full gate over the four-fixture set). CS §5: pure content-inspection, nothing external to mock; never mock own gate logic.

## 📏 Guidance

CS 6aMAzsYeQb §§0/4/5/6/11 (honest attributed rejection, gate purity); SE-Arch 8sYi523i4t lenses (safety-gate independence — must not trust upstream license gate; zero-jargon as a hard invariant not a lint suggestion); cell-lint JGAUQRsw2g (per-cell).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-33 (§4.13), NFR-10 (SM-4 zero-jargon), ARCH-14 (jargon-denylist CI gate); reconcile-full-prd.md gap 'universal safety/quality gate framing narrowed' (MEDIUM finding); api E2-S1, E2-GAP2.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2098** (contract TAG).
- [ ] Blocked by: **ENG-2301** (E2-S1 render — vetting consumes the rendered output), **ENG-2700** (E2-GAP2 license two-gate — sibling admission check, same pipeline stage).
- [ ] Blocks: any Catalogue-admission path (publish, import, create-and-publish).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
