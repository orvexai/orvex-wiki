## 🎯 Story

As the **Studio platform**, I want **a golden-fixtured CI correctness gate proving that every fact present in the Claude export of a woven Prompt is also present in the ChatGPT export (Claude ⊆ ChatGPT fact-parity), for every Skill and every applicable Memory weave**, so that **no export target can silently drop a woven fact and the parity guarantee is enforced by CI, not by developer discipline**.

**Definition of Done:** one named test `TestExportFactParityClaudeSubsetChatGpt` (CI-gate, golden-fixture — runs a committed fixture set of (Skill, woven Memory) pairs through both the Claude and ChatGPT export formatters, extracts the fact/field set each produces, and asserts the Claude fact-set is a subset of (or equal to) the ChatGPT fact-set for every fixture; asserts the gate is build-blocking on divergence, not a soft warning; a deliberately-broken fixture (one formatter dropping a woven fact) must fail the gate). *Final elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (fact extraction)** — Given a woven Prompt exported to both Claude and ChatGPT formats, When compared, Then a deterministic fact/field extractor produces a comparable fact-set from each export artifact. *Assert: extractor is pure and produces stable output on identical input.* [Source: POC p4-requirements-inventory.md FR-14, FR-31]
- [ ] **AC2 (subset guarantee)** — Given the two fact-sets, When compared, Then the Claude fact-set is a subset of (or equal to) the ChatGPT fact-set for every fixture in the committed golden set. *Assert: Claude_facts ⊆ ChatGPT_facts, all fixtures.* [Source: POC p4-requirements-inventory.md FR-14, FR-31]
- [ ] **AC3 (build-blocking gate)** — Given a code change that causes divergence (a fact present in Claude's export but missing from ChatGPT's, or a dropped fact in Claude's own export), When CI runs, Then the gate fails and blocks merge — never a ship/fallback switch or a soft warning. *Assert: an intentionally-broken formatter fixture fails CI red.* [Source: POC p4-requirements-inventory.md FR-14, FR-31]
- [ ] **AC4 (side-by-side card honesty)** — Given the cross-AI export UI showing Claude + ChatGPT cards side by side, When the parity gate passes, Then both cards are guaranteed fact-complete relative to each other at ship time (the UI claim and the CI guarantee are the same invariant). *Assert: UI card content traces to the same extractor the CI gate uses.* [Source: POC p4-requirements-inventory.md FR-31]

## 🔨 Tasks

- [ ] Deterministic fact/field extractor over each export formatter's output (AC1)
- [ ] Golden fixture set: (Skill, woven Memory) pairs spanning typical + edge weaves (sensitive-excluded, per-Skill override, empty-Memory) (AC2)
- [ ] Subset-comparison assertion + CI wiring as a required, build-blocking check (AC2, AC3)
- [ ] Deliberately-broken negative fixture proving the gate actually fails on divergence (AC3)
- [ ] Wire the same extractor into the export UI's side-by-side card rendering, so UI and CI share one source of truth (AC4)
- [ ] Write `TestExportFactParityClaudeSubsetChatGpt` (RED→GREEN)

## 🧠 Context

Tier placement: pure `deterministic/` extractor + comparison (no I/O) sitting alongside the FR-31 weave (E3-S5, ENG-2309) and the export formatters (E2-S4 prompt-use surfaces, ENG-2304; ui E5-S3 five-AI export, ENG-2672). This is a correctness-invariant gate, not a feature surface — it belongs next to the weave because the weave is what produces the facts being compared.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. The reconciled POC requirements inventory names this parity guarantee twice (FR-14 and FR-31) and is explicit it must be 'golden-fixtured in CI as a correctness gate — never a ship/fallback switch'. Neither the export UI story nor the weave story nor any other story builds this comparison or wires it into CI.

## 🧪 Testing

Named DoD test: `TestExportFactParityClaudeSubsetChatGpt` (CI-gate, golden-fixture). Tiers: unit (extractor purity) + fixture-regression (full golden set, required CI job). CS §5 mocking: none — pure extraction over already-rendered export artifacts; never mock own comparison logic.

## 📏 Guidance

CS 6aMAzsYeQb §§0/4/5/6 (purity, determinism, golden-fixture regression discipline); SE-Arch 8sYi523i4t lenses (correctness-gate-not-soft-warning, cross-target drift lens — same class of risk as a two-front-door API drifting); cell-lint JGAUQRsw2g (n/a compute-only).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-14, FR-31 (§4.5, §4.11); api E3-S5, E2-S4; ui E5-S3.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2098** (contract TAG).
- [ ] Blocked by: **ENG-2309** (api E3-S5 FR-31 weave — the source of the facts being compared).
- [ ] Blocks: nothing functionally, but should land before ui E5-S3 (ENG-2672)/E5-S4 (ENG-2673) are marked ship-ready, since it is the correctness proof behind their side-by-side export claim.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
