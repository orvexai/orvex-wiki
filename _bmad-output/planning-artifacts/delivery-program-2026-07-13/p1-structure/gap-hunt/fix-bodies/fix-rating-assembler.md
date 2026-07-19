## 🎯 Story

As a **marketplace browser**, I want **the Orvex rating assembled as one composite — structural AI-quality factor × usage/popularity × upvotes — and served on every marketplace prompt**, so that I can trust a single itemized reputation signal that recomputes from its sources and is never hand-set.

**Definition of Done:** one named test **`TestOrvexRatingCompositeAssembleAndServe`** (integration layer — seeds a marketplace prompt with an ai structural-quality factor, usage/popularity counts, and an upvote tally, then asserts the served rating equals the deterministic composite of the three factors, recomputes when any source signal changes, exposes every factor's itemized contribution, and rejects any manual-override write path — through the marketplace serving API). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given a marketplace prompt with an ai structural-quality factor, usage/popularity counts, and upvotes, When its rating is requested, Then the served value is the deterministic composite of all three factors. *Assertion: served rating == composite(structural, usage/popularity, upvotes); no factor silently dropped.* [Source: Brief rgBOQh31p3 (Orvex rating multi-factor), FR-SA3]
- [ ] **AC2** — Given the composite, When any source signal changes (new upvote, usage tick, re-scored structural factor), Then the rating recomputes from source and is never hand-set. *Assertion: signal change → recomputed rating; no manual-override write path exists.* [Source: Brief rgBOQh31p3, FR-SA3]
- [ ] **AC3** — Given the served rating, When rendered on a marketplace surface, Then each factor's itemized contribution is exposed (never a single opaque score). *Assertion: response carries per-factor breakdown, not just an aggregate number.* [Source: Brief rgBOQh31p3, FR-SA3]
- [ ] **AC4** — Given the ai structural-quality factor is api's input (ai's share), When it is missing or stale, Then the composite degrades honestly (partial rating flagged) rather than fabricating a structural score. *Assertion: absent structural factor → rating marked partial, not defaulted to a fake value.* [Source: Brief rgBOQh31p3 (ai's share), FR-SA3]
- [ ] **AC5** — Given the composite is assembled, When served on the marketplace, Then it appears on **every** marketplace prompt (not a subset). *Assertion: enumerated marketplace prompts each carry a served rating.* [Source: Brief rgBOQh31p3 (on every marketplace prompt)]
- [ ] **AC6** (negative) — Given a request to set a rating directly, When attempted, Then it is refused. *Assertion: direct rating write → rejected (derive-only).* [Source: Brief rgBOQh31p3, FR-SA3]

## 🔨 Tasks
- [ ] Composite assembler: fold ai structural factor × usage/popularity × upvotes into one derived rating (AC: 1,2)
- [ ] Recompute-on-signal-change wiring off the reputation ledger + usage counters (AC: 2)
- [ ] Itemized per-factor breakdown in the serve payload (AC: 3)
- [ ] Honest degradation when ai's structural factor is missing/stale (AC: 4)
- [ ] Serve the rating on every marketplace prompt surface (AC: 5)
- [ ] Derive-only guard — reject any manual rating write (AC: 6)
- [ ] Write `TestOrvexRatingCompositeAssembleAndServe` (RED→GREEN) (AC: 1,2,6)

## 🧠 Context
**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed — E2-S3 lists "multi-factor Orvex rating derivation" as a *task* and asserts (AC6) the rating is derived-not-hand-set, but no story owns the **assembly of the composite across the ai↔api seam nor its serving on marketplace surfaces**: ai owns only the structural-quality AI scoring factor (ai's share) and api owns the reputation ledger/upvotes, so the composite fell between the two owners and was never storied end-to-end.

Tier placement: route (serve) → application (composite assembler) → domain (reputation ledger + usage/popularity signals) → Postgres. Cross-seam input: ai's structural-quality factor is consumed as an api input, not recomputed here. Sibling dependency: **E2-S3** owns the append-only `reputation_ledger` + upvotes this assembler reads. api is the marketplace owner and therefore assembles; ai's factor and api social signals are the inputs.

## 🧪 Testing
- Named DoD test: `TestOrvexRatingCompositeAssembleAndServe` (integration + serve path).
- Tiers: unit (composite fold, degradation, derive-only guard) + integration (serve on every prompt, recompute-on-change). CS §5 mocking: mock the ai structural-factor source at the seam; use real reputation-ledger + usage signals — never mock own domain.

## 📏 Guidance
CS 6aMAzsYeQb §§0/4/5/6 (derived-not-opaque, honest partial states, no manual override); SE-Arch 8sYi523i4t lenses (opaque-score anti-pattern, cross-seam input trust, fabricated-default foot-gun); cell-lint JGAUQRsw2g (per-cell).

## 🔗 References
PRD `85qj2wwU2L` (FR-SA3); Architecture `ekTh7nDQqo` (A-OWN reputation_ledger); Brief `rgBOQh31p3` (Orvex rating — multi-factor: structural quality × popularity/usage × upvotes, on every marketplace prompt).

## 🔗 Dependencies
- [ ] Blocked by: **ENG-2098** (contract TAG = dispatch gate; project **Orvex Studio API**, milestone **B2 — Skill domain, library, marketplace & social**).
- [ ] Blocked by: parent epic **E2**; **E2-S3** (reputation ledger + upvotes = api social-signal inputs).
- [ ] Blocked by (cross-seam input): ai's structural-quality AI scoring factor (ai's share) — the assembler consumes it; wiring the shared factor contract is a pack-review (ENG-2098) coordination point, flag it.
- [ ] Blocks: marketplace surfaces that render the served Orvex rating.

## 📡 Protocol
CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
