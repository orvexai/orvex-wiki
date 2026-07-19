## 🎯 Story

As a **marketplace user browsing imported skills**, I want **a real, recorded GitHub ★ star count on repo-sourced skills, a claim/unclaim flow authenticated by real GitHub OAuth, a sync pipeline that runs on every GitHub-sourced skill whether claimed or not, and a deletion-lifecycle matrix that can never delete a published-and-used skill**, so that **provenance signals are trustworthy (ALL-REAL, never fabricated) and ownership transfer is verifiable, not just asserted**.

**Definition of Done:** one named test `TestGithubProvenanceStarClaimSyncLifecycle` (integration — imports a fixture skill with a GitHub source, asserts a real ★N count is fetched+recorded via the BFF-proxied GitHub API and refreshed on a scheduled cadence with a staleness indicator on API failure; asserts a claim only succeeds through real GitHub OAuth against the source repo and only one user may hold it at a time; asserts unclaim reverts to unclaimed status; asserts sync (star refresh + upstream change detection) runs on an unclaimed GitHub-sourced skill exactly as on a claimed one; asserts delete is refused for any published skill with used_count>0 — allowed only for drafts or used_count=0 — and account deletion unclaims rather than deletes, through the marketplace + claim + sync APIs). *Final elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (star count)** — Given a Skill imported from a GitHub repo, When displayed, Then a real ★N count fetched via a BFF-proxied GitHub API call is shown, recorded at import and refreshed on a scheduled cadence; a repo with zero stars shows an honest '0 / New' state; a Skill with no associated repo shows no star count at all. *Assert: star count == last fetched real value; never fabricated/estimated.* [Source: POC p4-requirements-inventory.md FR-26a]
- [ ] **AC2 (staleness)** — Given the GitHub API is unavailable, When the star count is served, Then the last recorded value renders with a visible staleness indicator, never a silent stale-as-fresh render. *Assert: API-down → staleness badge present.* [Source: POC p4-requirements-inventory.md FR-26a]
- [ ] **AC3 (OAuth claim)** — Given an unclaimed imported Skill, When a user claims it, Then the claim succeeds only via real, BFF-proxied GitHub OAuth authenticating against the Skill's source repo (no API keys in the browser) and grants claimed/native status. *Assert: claim without a verified OAuth match against the source repo → rejected.* [Source: POC p4-requirements-inventory.md FR-26b]
- [ ] **AC4 (single claimant + reversible)** — Given a claimed Skill, When a second user attempts to claim it, Then the attempt is rejected (one claimant at a time); When the claimant unclaims, Then it reverts to unclaimed status. *Assert: concurrent claim → 409/rejected; unclaim → status=unclaimed.* [Source: POC p4-requirements-inventory.md FR-26b]
- [ ] **AC5 (always-on sync)** — Given any Skill with a recorded GitHub source, When the sync pipeline runs (star refresh + upstream change detection), Then it runs regardless of claimed/opt-in status — not limited to claimed Skills. *Assert: an unclaimed GitHub-sourced skill's star count still refreshes on cadence.* [Source: POC p4-requirements-inventory.md FR-26c]
- [ ] **AC6 (deletion-lifecycle matrix)** — Given a published-and-used Skill (used_count>0), When deletion is attempted, Then it is refused — only deprecate or unclaim are allowed; Given a draft or a Skill with used_count=0, When deletion is attempted, Then it succeeds. *Assert: used_count>0 → delete refused; draft/used_count=0 → delete succeeds.* [Source: POC p4-requirements-inventory.md FR-26d]
- [ ] **AC7 (account deletion)** — Given a user with published/claimed Skills, When their account is deleted, Then those Skills are unclaimed (never deleted), and only the user's own personal data is removed via the standard data-deletion path. *Assert: account delete → skills survive as unclaimed; personal data rows removed.* [Source: POC p4-requirements-inventory.md FR-26d]

## 🔨 Tasks

- [ ] BFF-proxied GitHub API star-count fetch at import + scheduled refresh job + staleness flag (AC1, AC2)
- [ ] GitHub OAuth claim flow (BFF-proxied token exchange, no browser keys) verifying claimant against source repo (AC3)
- [ ] Single-claimant DB constraint + unclaim transaction (AC4)
- [ ] Sync scheduler scoped to 'any Skill with recorded GitHub source', decoupled from claimed-status (AC5)
- [ ] Deletion-lifecycle guard: used_count-gated delete refusal + deprecate/unclaim actions (AC6)
- [ ] Account-deletion hook: unclaim-not-delete published/claimed Skills + personal-data purge (AC7)
- [ ] Write `TestGithubProvenanceStarClaimSyncLifecycle` (RED→GREEN)

## 🧠 Context

Tier placement: application (claim/sync orchestration) → domain (Skill ownership, star-count field) → Postgres port + one external seam (GitHub API/OAuth, BFF-proxied). Sibling dependency: E2-S1 (skill model + never-delete-used, ENG-2301 — this story extends AC4 into the full matrix), E2-S3 (marketplace/social, ENG-2303), E2-GAP2 (import→vet→claim license two-gate, ENG-2700 — this story is the claim-time OAuth + ongoing-sync half that the seeding pipeline hands off to).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. Filed against the reconciled POC requirements inventory (p4-requirements-inventory.md), the ground-truth the Studio UI/API rewrite draws from. E2-S3's ACs cover the general marketplace/reputation surface but never assert a fetched star count, an OAuth-based claim, a claim-independent sync scope, or the deletion-lifecycle matrix beyond the bare 'never delete published+used' rule already in E2-S1/AC4. Nothing else in api or ui owns these mechanics.

## 🧪 Testing

Named DoD test: `TestGithubProvenanceStarClaimSyncLifecycle` (integration). Tiers: unit (deletion-lifecycle guard, single-claimant constraint) + integration (OAuth claim round-trip against a fixture GitHub app, sync scheduler, staleness fallback). CS §5 mocking: mock the external GitHub API/OAuth seam; never mock own claim/sync domain logic.

## 📏 Guidance

CS 6aMAzsYeQb §§0/4/5/6/7 (external-seam isolation, ALL-REAL — no fabricated/estimated counts, append-only provenance); SE-Arch 8sYi523i4t lenses (honesty lens — staleness never hidden; ownership-transfer integrity — claim must be independently verifiable, not asserted); cell-lint JGAUQRsw2g (per-cell).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-26a/FR-26b/FR-26c/FR-26d (§4.9 Marketplace); PRD `85qj2wwU2L` (FR-SA3); api E2-S1/E2-S3/E2-GAP2.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2098** (contract TAG = dispatch gate).
- [ ] Blocked by: **ENG-2301** (E2-S1 skill model — this story's AC6 extends its bare delete-refusal into the full matrix), **ENG-2303** (E2-S3 marketplace/social — the surface this claim/star data is displayed on), **ENG-2700** (E2-GAP2 marketplace seeding — hands off unclaimed seeds this story's claim flow operates on).
- [ ] Blocks: any UI star-count/claim-button rendering on the Skill card/detail surfaces (ui E4-S1/E4-S2).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
