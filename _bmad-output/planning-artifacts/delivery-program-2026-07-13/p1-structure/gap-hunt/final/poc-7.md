## 🎯 Story

As a **signed-in skill owner**, I want **one unified inbox at `/review` (J5) across all my skills — tagging each item Comment vs Suggestion with the contributor's reputation chip, a per-type diff stack with independent per-block Accept/Reject plus Accept-all/Reject-all (partial-accept), rebase-conflict surfacing, and comment→suggestion conversion** so that **I can triage community feedback fast even at hundreds of items, nothing ever merges without an explicit decision, and I never lose an unsaved Delta to an accidental auto-merge**.

**Definition of Done:** ONE named test `TestReviewInboxPerBlockDecideNeverAutoLands` (integration — asserts the inbox lists comments+suggestions scoped ONLY to the signed-in owner's skills with honest counts ('—' loading, never '0'), a suggestion opens as a per-type diff stack with independent per-block Accept/Reject and a global Accept-all/Reject-all, a partial-accept mints a new version through the SAME publish/re-vet path a manual edit uses (never a second pipeline) crediting the contributor and emitting the append-only reputation-ledger effect, a conflicting sibling suggestion is marked Needs-rebase (never auto-merged) with its diff re-anchored against the new Base before any decision is enabled, a comment thread's anchored block is read-only and 'Turn into a suggestion' pre-anchors to the same block, and nothing lands without an explicit per-block or per-group Accept — through the render + emitted decision payload). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (owner-scoped unified queue)** — Given `/review`, When it loads, Then it shows one unified queue across ALL the owner's skills (never another user's), each row tagged Comment vs Suggestion with a skill→section→block label and the contributor's reputation chip, with type/status filters (suggestion/comment, pending/open/needs-rebase) and default-sort by highest reputation; counts render '—' while loading, never '0'. *Assertion: scope excludes non-owned skills; honest loading counts.* [Source: POC review.jsx L117-119, L570-575, L594-627; POC skill-authoring-scenario-and-spec.md §3.3 A1]
- [ ] **AC2 (per-block diff decide + partial-accept + post-merge preview)** — Given a Suggestion, When opened, Then each touched block renders as an independent before/after diff (non-colour-alone +/− markers) with its own Accept/Reject plus a global Accept-all/Reject-all; accepting a subset publishes a new version crediting the contributor and shows a live post-merge preview (Original ⇄ With-this-change) with an approximate word-count delta; status derives to accepted/partially-accepted/rejected. *Assertion: per-block decisions independent; accepted-subset preview reflects only accepted blocks.* [Source: POC review.jsx L214-269, L271-427; POC skill-authoring-scenario-and-spec.md §3.3 A2, §8 Q3]
- [ ] **AC3 (same-path version mint + reputation)** — Given an Accept decision, When it commits, Then accepted blocks merge into the owner's Delta and mint a new version via the identical publish/re-vet path a manual edit uses (never a second pipeline), notify the contributor, and emit the itemised append-only `reputation_ledger` effect (accept → credit per accepted block; reject → no clawback). *Assertion: accept → same-path version mint; ledger call shape matches E2-S3's append-only contract.* [Source: POC skill-authoring-scenario-and-spec.md §1 J5.4; api E2-S3 AC4]
- [ ] **AC4 (conflict / needs-rebase)** — Given two suggestions targeting the same block (or a base block that advanced since authoring), When one is accepted or the block moved, Then the other is marked Needs-rebase with a banner and its diff is recomputed/re-anchored against the new Base before any decision is enabled — never auto-merged. *Assertion: conflicting sibling → Needs-rebase; diff matches current base, not stale.* [Source: POC review.jsx L68-84, L328-338; POC skill-authoring-scenario-and-spec.md §1 J5.4, §3.3 A2]
- [ ] **AC5 (comment thread + convert)** — Given a comment thread, When viewed, Then the anchored block renders read-only (comments never edit), replies are chronological, 'Turn into a suggestion' opens a pre-anchored suggestion linked back to the thread (a reject on the derived suggestion returns the thread to Open), and 'Resolve with a decision' closes the thread and notifies the contributor. *Assertion: anchor read-only; turn-into-suggestion pre-anchors to the same block; linked.* [Source: POC review.jsx L429-499; POC skill-authoring-scenario-and-spec.md §1 J3.4]
- [ ] **AC6 (decomposable reputation chip)** — Given a contributor's accepted history, When the reputation chip is expanded, Then it renders an itemized, decomposable New→Contributor→Reliable→Steward tier with real thresholds and 'X to next level' — never a black-box composite score, sourced from the append-only `reputation_ledger`, and NEVER mounted on any Memory surface. *Assertion: chip itemizes (≥4 facts), no composite score, absent from Memory routes.* [Source: POC review.jsx L132-180, L606-607; POC skill-authoring-scenario-and-spec.md §5]
- [ ] **AC7 (honest empty + drawer peek)** — Given zero pending items, When the inbox loads, Then an honest empty state renders ('Nothing to review yet.'), never a fabricated queue; the shell inbox-drawer remains a PEEK ONLY (no Accept/Reject) that deep-links here — all decisions happen in `/review`. *Assertion: empty-queue path renders honest copy; drawer has no decision controls.* [Source: POC review.jsx; POC secondary-screens-and-shell-spec.md §5.2]

## 🔨 Tasks

- [ ] RED: `TestReviewInboxPerBlockDecideNeverAutoLands` (AC2/AC3/AC4).
- [ ] GREEN: owner-scoped unified queue + filters/sort + honest states (AC1); per-type diff stack + per-block partial-accept + post-merge preview (AC2); accept → same-path version mint + notify + ledger effect (AC3); rebase-conflict banner + re-anchored diff (AC4); comment thread + turn-into-suggestion + resolve (AC5); shared decomposable reputation chip + Memory-exclusion guard (AC6); honest empty queue + drawer-peek deep-link (AC7).

## 🧠 Context

React-front review surface (CS §6). api E2-S3 builds the `reputation_ledger`/comments/suggestions/use-gated-reviews backend (FR-SA3) but no consuming UI story renders it. Confirmed distinct from E6-S4 Curator desk (explicitly wiki-content proposals from the Librarian, PO-boundary-separated from 'Your Wiki') and from staging's Review Queue (FR-STG12, wiki ChangeSets) — neither renders skill-marketplace suggestion/comment triage. The shell inbox-drawer (E2-S1) is a peek-only; this is the canonical J5 decision surface. Reuses the per-type diff widgets from the Skill feedback overlay (companion gap) for rendering, the shared reputation chip, and E4-S3's publish/version-mint path. Seam: BFF marketplace comments/suggestions/reputation read+decide. Sibling dependency: E4-S2 (Skill Viewer, shares block/section labels), E4-S3 (shared version-mint-on-accept), E1-S4 (draft-vs-committed proposal-rendering layer — reusable for the diff UI).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. Consolidates two independent finds of the same J5 surface: web/src/prototype/screens/review.jsx (785-line live prototype) and skill-authoring-scenario-and-spec.md §1 J5/§3.3/§5. `/app/review` is one of E2-S1's six shell destinations but E2-S1 only wires the route + badge — no story builds the page.

## 🧪 Testing

`TestReviewInboxPerBlockDecideNeverAutoLands` (integration) + unit tests on the per-block decision reducer, conflict detection, and reputation-tier ranking/itemization. CS §5 mocking: BFF marketplace/reputation fixtures (E2-S3 reputation_ledger + suggestions); never mock own inbox render/decision logic.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view · §11 honest ('—' counts, decomposable reputation, no opaque score, honest empty) · §5 fixture the sibling.
- SE-Arch `8sYi523i4t`: opaque-score anti-pattern lens; no-silent-merge lens (nothing lands without a recorded decision); privacy lens (Memory never appears here, RC-1).
- Cell-lint `JGAUQRsw2g`: N/A runtime.

## 🔗 References

PRD `xsRMrju3D1` (FR-UI family) / api PRD `85qj2wwU2L` (FR-SA3, `reputation_ledger`) · POC `web/src/prototype/screens/review.jsx` (ground truth, 785 lines) · POC `skill-authoring-scenario-and-spec.md` §1 J5, §3.3, §5 (PO-confirmed 2026-06-16, Q6/Q10 build-the-full-ladder) · POC `secondary-screens-and-shell-spec.md` §5.2 (drawer peek-only).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Blocked by:** ENG-2303 (api E2-S3 — reputation_ledger + comments/suggestions backend this inbox decides against).
- [ ] **Depends on:** the Skill feedback overlay companion gap (produces the queued items); shares E2-S1's route/badge scaffold and E4-S3's version-mint path.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
