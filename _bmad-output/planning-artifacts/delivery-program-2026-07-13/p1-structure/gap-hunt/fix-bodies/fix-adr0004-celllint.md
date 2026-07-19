## 🎯 Story

**Audit: already implemented** (evidence in §4) — this story is VERIFY + harden: prove the behaviour via the named DoD test + adversarial review; do not rebuild.
As the cell-lint gate and every contracts consumer repo that files a `cell-lint-allow` exemption, I want the exemption trailer matcher to REQUIRE a non-empty reason — a trailer that carries the `cell-lint-allow` literal but no reason (empty, whitespace-only, or the token alone) MUST fail the gate — with the reason-required rule pinned to a contracts release tag and covered by a regression test, so that an exemption can never be smuggled in as a bare marker and every allow carries an accountable justification per ADR-0004 decision #2.

**Definition of Done:** ONE named test `TestCellLintAllowRequiresReason` — a gate-definition/CI-layer test asserting, run against synthetic trailer fixtures, that a `cell-lint-allow` trailer with an empty/whitespace-only/absent reason fails the gate (exit ≠ 0) while a trailer with a non-empty reason passes, deterministically and offline. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2091); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given a `cell-lint-allow` trailer with a non-empty reason, When the gate runs, Then the exemption is honoured and the line is exempt. *Assert: exit = 0; line exempt* [Source: ADR-0004 GABwtTr4pp #2].
- [ ] **AC2** — Given a `cell-lint-allow` trailer with the token alone (no reason), When the gate runs, Then the gate FAILS. *Assert: exit ≠ 0; reason-missing diagnostic* [Source: ADR-0004 GABwtTr4pp #2].
- [ ] **AC3** — Given a `cell-lint-allow` trailer whose reason is empty or whitespace-only, When the gate runs, Then the gate FAILS (whitespace is not a reason). *Assert: exit ≠ 0; empty-reason rejected* [Source: ADR-0004 GABwtTr4pp #2].
- [ ] **AC4** — Given the current matcher exempts any line merely containing the literal substring, When hardened, Then the matcher parses the trailing reason and no longer exempts on substring-presence alone. *Assert: substring-only match no longer exempts* [Source: ADR-0004 GABwtTr4pp #2].
- [ ] **AC5** — Given the reason-required rule, When wired into a consumer CI, Then it is pinned to a contracts release tag, never floating main. *Assert: CI-wiring spec references a tag* [Source: ADR-0004 GABwtTr4pp #2].

## 🔨 Tasks
- [ ] VERIFY: confirm the current matcher exempts on substring-presence alone (reproduce the hole named in §4) before changing anything (AC4).
- [ ] RED: `TestCellLintAllowRequiresReason` against synthetic trailer fixtures — fails until the matcher enforces reason-required (AC2, AC3, AC4).
- [ ] GREEN: fix the `cell-lint.yml` trailer matcher to parse and require a non-empty reason after the `cell-lint-allow` literal (AC1, AC2, AC3, AC4).
- [ ] GREEN: confirm the reason-required rule is pinned to a contracts tag in the consumer CI-wiring spec (AC5).
- [ ] RED: negative paths — token-alone, empty-reason, and whitespace-only-reason each fail the gate (AC2, AC3).
- [ ] REVIEW: adversarial pass — a reviewer ≠ implementer confirms no widening of the matcher re-opened the hole.

## 🧠 Context
Expected tier placement: **none — CS §6 non-service repo**; the rule DEFINITION lives in `cell-lint.yml`, EXECUTION in each consumer repo's CI. Seam crossed: the cell-lint exemption boundary family-wide. Sibling deps: complements the AGPL-import guard (E6-S1) and this repo's own authoring guard; the fixed matcher is consumed by every repo that files a `cell-lint-allow`.

**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified against live canon) — missed because the original decomposition treated the cell-lint gate as a single "gate exists" checkbox and never split out ADR-0004 decision #2's reason-required sub-rule, so the substring-only trailer hole slipped through untested.
**🧾 Code audit (live cell-lint.yml, orvex-studio-contracts @ ENG-1541, 2026-07-14):** partial — the gate EXISTS and matches the `cell-lint-allow` trailer, but per the gap the matcher exempts any line containing the literal substring regardless of what follows: reason-required is unenforced and there is no regression test. This is a small fix (harden the matcher) + a new regression test, NOT a rebuild — VERIFY the existing gate, then close the rule hole.

## 🧪 Testing
Named DoD test `TestCellLintAllowRequiresReason` (gate-definition layer, run against synthetic trailer fixtures). CS §5 mocking: fake trailer lines as fixtures (token-alone, empty-reason, whitespace-reason, valid-reason); never mock own contract packages. Deterministic, no network (NFR-C5).

## 📏 Guidance
CS 6aMAzsYeQb §0, §5 (gates), §9, §11 (honesty — no bare exemptions); SE-Arch 8sYi523i4t security-licensing lens (an unjustified exemption is a hole, not a style nit); cell-lint JGAUQRsw2g. §6 tiers N/A. A missing reason FAILS the gate — never widen the matcher to allow it back.

## 🔗 References
- ADR-0004 (GABwtTr4pp, live canon) decision #2 — `cell-lint-allow` reason-required
- cell-lint standard (JGAUQRsw2g); live `cell-lint.yml` (orvex-studio-contracts, ENG-1541)

## 🔗 Dependencies
- [ ] Blocked by: ENG-2091 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] Project: Orvex Studio Contracts · Milestone: B6 — Gates — divergence, drift, AGPL-import & parity.
- [ ] Parent pack: ENG-2091. Executed in every consumer repo's CI. Related: E6-S1 (AGPL-import guard).

## 📡 Protocol
CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-2091", never `closes`) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE if fixing the matcher reveals existing bare exemptions already merged in consumer repos.
