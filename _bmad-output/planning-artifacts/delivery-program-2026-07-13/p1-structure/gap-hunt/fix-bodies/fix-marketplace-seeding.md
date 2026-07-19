## 🎯 Story

As a **Studio operator seeding the marketplace at launch**, I want the **POC's GitHub-import → vet → claim pipeline with a permissive-license two-gate**, so that the marketplace opens with real, license-clean prompts that a verified original author can later claim — without hand-loading or license risk.

**Definition of Done:** one named test **`TestSeedingLicenseTwoGate`** (integration layer — runs the import→vet→claim pipeline over a fixture repo with a permissive license and asserts the seeded skill lands as unclaimed, then runs it over a non-permissive/absent-license fixture and asserts BOTH gates reject (import-time and claim-time) so nothing is seeded, through the seeding pipeline API). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given a public GitHub repo holding a prompt/skill, When the import step runs, Then its content + provenance (repo, ref, author handle) are ingested into a staged seed record. *Assertion: a staged seed row exists with source repo + ref captured.* [Source: rgBOQh31p3]
- [ ] **AC2** — Given a staged seed, When the vet step runs, Then structural validity + license are checked and only passing seeds advance to publishable. *Assertion: a vetted seed is queryable on the marketplace as unclaimed; a failed vet is not.* [Source: rgBOQh31p3]
- [ ] **AC3** — Given a permissive license (allowlist: MIT/Apache-2.0/BSD-style), When the import-time gate evaluates it, Then it passes gate one. *Assertion: allowlisted license → import gate = pass.* [Source: rgBOQh31p3]
- [ ] **AC4** — Given a seeded, unclaimed skill, When its verified original author claims it, Then the claim-time gate re-checks the license before transferring ownership. *Assertion: claim on a still-permissive seed → ownership transfers; provenance retained.* [Source: rgBOQh31p3]
- [ ] **AC5** (negative) — Given a repo with a non-permissive or missing license, When the import-time gate evaluates it, Then it is rejected and nothing is staged. *Assertion: non-permissive/absent license → import gate = reject, zero seed rows.* [Source: rgBOQh31p3]
- [ ] **AC6** (error-path) — Given a seed whose license changed to non-permissive between import and claim, When the claim-time gate re-checks, Then the claim is refused. *Assertion: gate two independently rejects; no ownership transfer.* [Source: rgBOQh31p3]

## 🔨 Tasks
- [ ] Port the POC GitHub-import ingester (repo/ref/author → staged seed record) (AC: 1)
- [ ] Vet step: structural validation + license detection → publishable/rejected (AC: 2)
- [ ] Gate one (import-time): permissive-license allowlist enforcement (AC: 3,5)
- [ ] Claim path: verified-author ownership transfer on unclaimed seeds (AC: 4)
- [ ] Gate two (claim-time): independent license re-check before transfer (AC: 4,6)
- [ ] Persist source provenance (repo, ref, author handle) on every seed for audit + claim matching (AC: 1,4)
- [ ] Write `TestSeedingLicenseTwoGate` (RED→GREEN) (AC: 3,5,6)

## 🧠 Context
**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified). api's skill/marketplace stories cover the model, Library, Builder, social and reputation surfaces but NO authored story carries the seeding pipeline or the license gates — the census-brief confirmed it unowned. Why it was missed: seeding is a pre-launch data-population concern that sits between "build the marketplace" and "operate it", so it fell through the surface-oriented epic split — every marketplace story assumed content already existed.

Tier placement: route → application (pipeline orchestration) → domain (skill/seed) → Postgres port; the import step crosses one external seam (GitHub read). Sibling dependency: E2-S1 (skill model + Base/Delta), E2-S3 (publish path — seeds land as publishable). The composite Orvex rating (`fix-rating-assembler`) serves over seeded skills once claimed. License allowlist is the two-gate's single source of truth (import + claim both consult it).

## 🧪 Testing
- Named DoD test: `TestSeedingLicenseTwoGate` (integration).
- Tiers: unit (license-gate allowlist logic, claim-time re-check) + integration (full import→vet→claim over fixture repos). CS §5 mocking: mock the GitHub read + Postgres port for unit; real DB + a fixture repo for integration. Never mock own packages.
- Fixtures: one permissive-license repo (happy path), one non-permissive, one absent-license, and one that flips license between import and claim (drives AC6's gate-two independence).

## 📏 Guidance
CS 6aMAzsYeQb §§0/4/5/6 (boundaries, external-seam isolation, gate purity); SE-Arch 8sYi523i4t lenses (two-gate independence — gate two must not trust gate one; provenance integrity); cell-lint JGAUQRsw2g (per-cell seed store).

## 🔗 References
Brief `rgBOQh31p3` (marketplace seeding — POC GitHub-import → vet → claim pipeline, permissive-license two-gate).

## 🔗 Dependencies
- [ ] Blocked by: **ENG-2098** (contract TAG = dispatch gate) — project *Orvex Studio API*, milestone *B2 — Skill domain, library, marketplace & social*.
- [ ] Blocked by: parent epic **E2**; E2-S1 (skill model), E2-S3 (publish path), E1 (persistence).
- [ ] Blocks: marketplace serving surfaces that assume seeded content (incl. `fix-rating-assembler` over claimed seeds).

## 📡 Protocol
CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
