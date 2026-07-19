## 🎯 Story

As a **marketplace contributor**, I want **my reputation shown as a transparent 'N suggestions accepted across M skills' track record on a New→Contributor→Reliable→Steward ladder, protected by live velocity-anomaly freezing, self-accept prevented at the data layer, and higher levels gated on verified Clerk identity**, so that **reputation can never be gamed by bursts, self-approval, or unverified accounts, and is never an opaque score**.

**Definition of Done:** one named test `TestReputationLadderAndAntiGamingLive` (integration — accrues accepted-suggestion ledger rows for a fixture contributor and asserts the level ladder derives correctly from itemized counts (never a hand-set field); asserts an abnormal burst of accepted suggestions triggers an automatic temporary freeze on further accrual, surfaced to the user; asserts a self-accept attempt on the contributor's own suggestion is rejected at the data/domain layer even if a UI check is bypassed; asserts an unverified-Clerk-identity account is capped at Contributor regardless of accepted count, through the reputation + suggestion APIs). *Final elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (ladder derivation)** — Given the append-only reputation_ledger, When a contributor's level is computed, Then it derives transparently from itemized accepted-suggestion counts as 'N suggestions accepted across M skills' on the New→Contributor→Reliable→Steward ladder, never a black-box composite score, and never shows an acceptance-rate percentage. *Assert: level == pure function of ledger counts; UI chip renders the itemized string, not a percentage.* [Source: POC p4-requirements-inventory.md FR-36]
- [ ] **AC2 (partial-accept grain)** — Given a partially-accepted suggestion (≥1 block accepted), When counted, Then it counts once toward the contributor's total, never overstating partials; comments earn nothing (anti-spam) and rejects cost nothing. *Assert: partial-accept counted once; comment/reject → zero ledger delta.* [Source: POC p4-requirements-inventory.md FR-36]
- [ ] **AC3 (velocity-anomaly freeze)** — Given an abnormal burst of accepted-suggestion accrual for one contributor, When detected, Then reputation accrual is automatically, temporarily frozen and the freeze is surfaced to the affected user. *Assert: burst pattern → accrual freeze flag set + user-visible notice.* [Source: POC p4-requirements-inventory.md FR-36a]
- [ ] **AC4 (self-accept impossible)** — Given a contributor's own suggestion, When they attempt to accept it (directly at the API, bypassing any UI guard), Then it is rejected at the data layer, not merely hidden in the UI. *Assert: API-level self-accept call → rejected, enforced by a DB/domain constraint, not just a disabled button.* [Source: POC p4-requirements-inventory.md FR-36a]
- [ ] **AC5 (identity gate)** — Given an account without verified Clerk identity, When its reputation would otherwise cross into Reliable/Steward, Then it is capped at Contributor until identity is verified. *Assert: unverified account + high accepted-count → level capped at Contributor.* [Source: POC p4-requirements-inventory.md FR-36a]

## 🔨 Tasks

- [ ] Level-ladder derivation function over reputation_ledger counts (no hand-set field) (AC1, AC2)
- [ ] Velocity-anomaly detector + accrual-freeze flag + user-facing surfacing (AC3)
- [ ] Data-layer self-accept constraint (reject where suggester_id == accepter_id, enforced below the API handler) (AC4)
- [ ] Clerk-verified-identity check gating Reliable/Steward level assignment (AC5)
- [ ] Write `TestReputationLadderAndAntiGamingLive` (RED→GREEN)

## 🧠 Context

Tier placement: domain (reputation ladder + anti-gaming policy) over the existing reputation_ledger (E2-S3/ENG-2303) + Clerk identity claim read. Sibling dependency: E2-S3 (the ledger this reads), the FR-28 structured-suggestions accept path (see the Review-inbox / feedback gap tickets) which is this ladder's sole write trigger.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. The reconciled POC requirements inventory names the level ladder and three anti-gaming signals as explicitly LIVE-not-stubbed (FR-36a), and no api/ui/ai story references any of velocity-anomaly detection, self-accept-impossible-by-construction, the level ladder itself, or the Clerk-identity level gate.

## 🧪 Testing

Named DoD test: `TestReputationLadderAndAntiGamingLive` (integration). Tiers: unit (ladder derivation purity, self-accept constraint) + integration (velocity-anomaly detection over a synthetic burst fixture, identity-gate enforcement). CS §5 mocking: mock Clerk identity-verification read; never mock own reputation domain.

## 📏 Guidance

CS 6aMAzsYeQb §§0/4/5/6/7 (append-only integrity, anti-gaming-as-invariant, honest never-opaque scoring); SE-Arch 8sYi523i4t lenses (self-accept-at-the-data-layer, not the UI; abuse-resistance under adversarial bypass); cell-lint JGAUQRsw2g (per-cell).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-36/FR-36a (§4.10 Community); PRD `85qj2wwU2L` (FR-SA3); api E2-S3.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2098** (contract TAG).
- [ ] Blocked by: **ENG-2303** (E2-S3 reputation_ledger — this story's ladder + anti-gaming layer sits directly on top of it).
- [ ] Blocks: the FR-28 structured-suggestions accept path's reputation write, any ui reputation-chip rendering.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
