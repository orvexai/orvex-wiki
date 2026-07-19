## 🎯 Story

As a **new Studio user**, I want a **guided first-run seed that generates profession-aware starter Memory plus a seeded demo world in my very first session**, so that I reach a first useful, memory-enriched output before I have entered any data of my own.

**Definition of Done:** one named test **`TestProfessionAwareSeedFirstSession`** (integration layer — declares a profession on first run, asserts the seed generates profession-tailored starter Memory rows plus a seeded demo world flagged Demo Data in the user's own tables, that the result is memory-enriched (a first useful output is derivable from the seeded Memory) and produced within the first session ≤60s within quota, through the real first-run seed interface). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given a first-run user who declares a profession, When the seed runs, Then it generates profession-aware starter Memory (content tailored to the declared profession, not a generic fixture). *Assertion: seeded Memory differs by declared profession; teacher ≠ developer starter set.* [Source: FR-O1 (g9vWbSYplh F0)]
- [ ] **AC2** — Given the same declaration, When the seed runs, Then it seeds a demo world flagged Demo Data in the user's own tables (not a separate tenant), co-produced with the starter Memory. *Assertion: demo-world rows carry the demo flag; seed emits both Memory + demo world in one guided pass.* [Source: FR-O1 (g9vWbSYplh F0), axvs1ZzxGn]
- [ ] **AC3** — Given the seed completes, When the user's first session continues, Then a first useful, memory-enriched output is derivable from the seeded Memory without any user-entered data. *Assertion: a first output references seeded Memory; empty-state is never shown post-seed.* [Source: FR-O1 (g9vWbSYplh F0)]
- [ ] **AC4** — Given the seed, When it runs, Then it completes within the first session (≤60s) and counts against tenant quota kept tiny. *Assertion: seed completes ≤60s; seeded volume within quota, over-quota → engine 402 handled.* [Source: FR-O1 (g9vWbSYplh F0), axvs1ZzxGn]
- [ ] **AC5** (negative) — Given no profession is declared, When first-run seeding is invoked, Then it fails loudly (no baked generic default seed). *Assertion: missing profession → explicit error, not a silent generic fallback.* [Source: FR-O1 (g9vWbSYplh F0)]

## 🔨 Tasks
- [ ] Profession-aware starter Memory generator (declared profession → tailored Memory set) (AC: 1)
- [ ] Demo-world seed co-produced with starter Memory, flagged Demo Data in-tenant (AC: 2)
- [ ] Guarantee a memory-enriched first useful output is derivable post-seed (AC: 3)
- [ ] First-session budget (≤60s) + quota-tiny seed + engine 402 handling (AC: 4)
- [ ] Require a declared profession — loud error, no generic default (AC: 5)
- [ ] Idempotent first-run guard — re-running the seed for an already-seeded user is a no-op, not a duplicate (AC: 3,4)
- [ ] Write `TestProfessionAwareSeedFirstSession` (RED→GREEN) (AC: 1,2,3)

## 🧠 Context
**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified) — FR-O1 (Tier-1) appears in NO plan.json `covers[]`; it was missed because it straddles two adjacent-but-untagged stories (ui "Streaming FormSpec onboarding" renders it, api "Demo World lifecycle" seeds the demo half) so neither claimed the profession-aware starter-Memory seeding logic. This story owns that seeding logic in api; the ui onboarding story renders it — note the interplay.

Tier placement: application (first-run seed orchestration) → Memory domain (starter Memory generation) + Demo World seed (co-produced). Seams crossed: knowledge (Memory indexing so the first output is memory-enriched), engine (demo wiki space, 402 on over-quota), ui (Streaming FormSpec onboarding renders the guided seed). Sibling dependency: api "Demo World lifecycle" (E7-S1) owns demo-flag discipline/isolation/cap — this story produces the seed it governs; do not duplicate that discipline, call into it. Persona packs lead with teachers (Brief wedge).

## 🧪 Testing
- Named DoD test: `TestProfessionAwareSeedFirstSession` (integration — declare profession, assert tailored Memory + seeded demo world + memory-enriched first output ≤60s).
- Tiers: unit (per-profession Memory generation, missing-profession loud error) + integration (end-to-end first-run seed). CS §5 mocking: mock engine/knowledge externals; never mock own Memory/demo domain.

## 📏 Guidance
CS 6aMAzsYeQb §§0/4/5/11 (no baked default, in-tenant demo flag, quota); SE-Arch 8sYi523i4t lenses (empty-state honesty, seed-bleed, first-session budget); cell-lint JGAUQRsw2g (per-cell).

## 🔗 References
FR-O1 brief `g9vWbSYplh` (F0, Tier-1 first-useful-output mandate); onboarding/demo-data research `axvs1ZzxGn`; interplay: ui "Streaming FormSpec onboarding" (renders), api "Demo World lifecycle" (E7-S1, demo-flag governance).

## 🔗 Dependencies
- [ ] Blocked by: **ENG-2098** (Definition Pack — contract TAG is the dispatch gate). Project **Orvex Studio API**, milestone **B7 — Demo World**.
- [ ] Blocked by (must-resolve): api "Demo World lifecycle" (**E7-S1**) — demo-flag discipline/isolation/cap this seed must obey.
- [ ] Interplays with: ui "Streaming FormSpec onboarding" — renders this seed's guided first-run flow.

## 📡 Protocol
CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
