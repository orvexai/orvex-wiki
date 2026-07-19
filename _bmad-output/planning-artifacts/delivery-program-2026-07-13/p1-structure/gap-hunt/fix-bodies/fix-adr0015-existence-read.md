## 🎯 Story
As a satellite orphan-sweep (server) reconciling its projected engine references, I want `openapi/engine-primitives.yaml` extended with a cheap workspace-existence / `HEAD` read op — a body-less presence probe that answers "does this engine workspace still exist?" with `200` (exists) / `404` (absent), no payload, ETag-friendly, no ACL-materialisation cost — so that satellites can deterministically decide what is a true orphan without paying a full-read (and without inferring existence from an unrelated error), closing the contract hole ADR-0015 ruling 7b opened.

**Definition of Done:** ONE named test `TestEngineExistenceReadConforms` — a CI/drift-gate-layer test asserting, through the served-OpenAPI-diff drift gate (E6-S3) run against a conforming engine stub, that `engine-primitives.yaml` defines the workspace existence/`HEAD` read op with body-less `200`/`404` presence semantics and that no request/response body leaks workspace content. *Final H1–H17 elaboration + the exact contract tag/versions are pinned at pack certification (ENG-2091); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given a satellite orphan-sweep, When it probes an engine workspace that exists, Then the op returns `200` with no content body (presence only). *Assert: op defines a `HEAD`/existence read whose `200` carries no response body schema* [Source: ADR-0015 ruling 7b].
- [ ] **AC2** — Given the same probe (negative path), When the workspace is absent, Then a `404` is returned distinctly from any auth/error envelope. *Assert: op defines `404` = absent, disjoint from `401`/`403`* [Source: ADR-0015 ruling 7b].
- [ ] **AC3** — Given orphan-sweep determinism, When existence is checked, Then it MUST NOT require a full workspace read or ACL materialisation. *Assert: op documents cheap-read (no page/ACL body), ETag/`If-None-Match` friendly* [Source: ADR-0015 ruling 7b].
- [ ] **AC4** — Given the engine-primitives surface, When the op is authored, Then it lands inside the pinned primitive surface E2-S1 conforms to, using workload-identity auth via `$ref` `_components` (internal seam), not inlined. *Assert: op referenced from the primitives file, no inlined auth* [Source: FR-C1, A-OPENAPI].
- [ ] **AC5** — Given errors on the probe, When it fails (not a plain absence), Then codes ⊆ the frozen `errors/vocabulary.yaml`. *Assert: error codes ⊆ vocabulary* [Source: FR-C1].

## 🔨 Tasks
- [ ] RED (AC1–AC3): `TestEngineExistenceReadConforms` against a conforming stub — fails while the op is absent / while `200` carries a body.
- [ ] GREEN (AC1–AC2): author the workspace existence/`HEAD` read op in `engine-primitives.yaml` — body-less `200`/`404`.
- [ ] GREEN (AC3): document cheap-read + ETag/`If-None-Match` conditional semantics (no ACL materialisation).
- [ ] GREEN (AC4–AC5): wire workload-identity auth via `_components`; wire error codes to `errors/vocabulary.yaml`.
- [ ] Add the `SEAMS.md` row (satellite orphan-sweep ↔ engine existence probe).

## 🧠 Context
Expected tier placement: **none — CS §6 non-service repo**; the NestJS-engine controller conforms to this seam. Seam crossed: satellites↔engine (existence/orphan-sweep). Sibling deps: extends E2-S1 (the closed 15-op `engine-primitives.yaml`), depends on E1-S6 (`_components`) and E5-S1 (`errors/vocabulary.yaml`).

**🧾 Gap provenance (2026-07-14):** Filed by the post-decomposition gap-hunt (adversarially verified). Why missed: E2-S1 froze `engine-primitives.yaml` as a closed, audited 15-op list, and the orphan-sweep existence/`HEAD` read (ADR-0015 ruling 7b) lives on the satellite→engine seam that no single service story owned — it fell through the gap between the 15-op closure and each satellite's own plan.

**Must-resolve — do not assume ENG-1365 shipped it:** ENG-1365 (Done, Contracts project) touched this scope historically; the authored contract (E2-S1's 15-op list) verifiably lacks the existence/`HEAD` op, so treat ENG-1365 as prior context to cite, not as evidence the op exists. Pack review (ENG-2091) resolves whether any of ENG-1365's work is reusable before GREEN.

## 🧪 Testing
Named DoD test `TestEngineExistenceReadConforms` (CI/drift-gate layer). CS §5 mocking: mock the engine server surface as a golden fixture (sibling faked — CS mock-boundary rule); never mock own contract packages. Deterministic (NFR-C5).

## 📏 Guidance
CS 6aMAzsYeQb §0, §7 (seams), §9 (any breaking primitive change = ADR), §12 (contract-shape); SE-Arch 8sYi523i4t seam + honesty lenses; cell-lint JGAUQRsw2g (host/servers hygiene). §6 tiers N/A.

## 🔗 References
- ADR-0015 (PxoUAiGN29) ruling 7b — satellite existence/`HEAD` read for orphan-sweep determinism
- PRD (jwF4VLHfNs) FR-C1; Architecture (o2waDNw3ix) A-OPENAPI, §3
- Prior context: ENG-1365 (Done, Contracts) — historical touch on this scope; cite, do not assume it shipped the op

## 🔗 Dependencies
- [ ] Blocked by: ENG-2091 (Definition Pack — the contract TAG is the dispatch gate). Project: Orvex Studio Contracts · Milestone: B2 — OpenAPI seam surfaces (engine + satellites).
- [ ] Must-resolve (pack review ENG-2091): reconcile ENG-1365's prior work before authoring — reuse vs author-fresh.
- [ ] Depends on E2-S1 (extends the `engine-primitives.yaml` surface), E1-S6 (`_components`), E5-S1 (`errors/vocabulary.yaml`).
- [ ] Feeds: E6-S3 (served-OpenAPI drift gate), satellite orphan-sweep consumers.

## 📡 Protocol
CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-2091", never `closes`) → HANDOFF → REVIEW (reviewer ≠ author) → TICK → DONE (orchestrator-only) → ESCALATE on any breaking primitive reshape (ADR-0008 ADR lane) or if ENG-1365 reconciliation is unresolved.
