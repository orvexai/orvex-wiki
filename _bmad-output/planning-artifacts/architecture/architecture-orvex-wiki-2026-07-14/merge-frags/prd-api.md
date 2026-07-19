
## Memory gap-closure — requirements (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned slice: **F3 data model + F4 lifecycle + F7 team-memory**.

- **FR-M1** The Memory **card schema MUST be frozen**: content, provenance/source, owner/scope, sensitivity, confidence, timestamps, and lifecycle state.
- **FR-M2** Every memory MUST have a **human-readable, human-editable** representation — the legible portrait, not an opaque blob.
- **FR-M3** The schema MUST be **versioned and forward-compatible**.
- **FR-M4** The schema MUST carry the fields the firewall (FR-S5), consent, and lifecycle (F4) features require (scope, sensitivity, validity window, state).
- **FR-L1** A memory MUST carry **temporal validity** (observed-at, valid-from, valid-until) so superseded facts do not surface as current.
- **FR-L2** Contradictions MUST be **reconciled, not silently overwritten** — the Librarian's *Reconcile* disposition, with the older assertion invalidated (not deleted) and reversible.
- **FR-L3** A memory MUST have a **state model** (active / superseded / archived) consistent with the wiki's draft→canonical discipline where it applies.
- **FR-L4** A **retention / decay policy** MUST exist (staleness signals, optional expiry) under user control.
- **FR-L5** Deletion MUST erase every **Orvex-controlled** copy and every synced-out vendor memory **the vendor API allows** to delete. Content already *injected* into a third-party session (FR-D1) is outside Orvex's deletion reach; this boundary MUST be **disclosed to the user** at consent time, not silently assumed away.
- **FR-T4** *(v1 MUST)* The data model MUST be **minimally team-aware** — nullable owner/scope, free CAS concurrency — so shared/official memory lands later without a rewrite, and MUST NOT leak personal memory (firewall).
- **FR-T1** *(SHOULD, phased)* Teams SHOULD support **shared/official Memory** with RBAC (read / propose / approve / admin).
- **FR-T2** *(SHOULD, phased)* A **moderation queue** SHOULD gate promotion of a team memory to "official" — the Librarian pattern at team scale.
- **FR-T3** *(SHOULD, phased)* Setup-chosen **governance models** (moderator-permissioned / self-curate / mix) SHOULD be selectable.
