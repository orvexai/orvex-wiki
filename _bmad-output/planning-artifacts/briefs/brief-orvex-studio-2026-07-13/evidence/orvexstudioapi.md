# orvexstudioapi — Evidence Digest

## 1. Mandate

`orvex-studio-api` is the **Studio product BFF/composition tier**: a TypeScript/Hono service physically strangled out of `orvex-prompt-studio-poc` (Orvex's own closed code, so free reuse, not a clean-room rebuild). It OWNS the Studio product domain — skills/builder/library/collections/marketplace/social, Memory (FormSpec, 3-state privacy), the Curator capture pipeline (`engineGate()` / Card Contract v1), Demo World, Chat History/Import, Your-Wiki surfaces, and server-side tier enforcement — while DELEGATING every platform capability to a satellite: models→ai, retrieval→knowledge, MCP protocol→mcp, auth→identity, entitlements→billing, admin→console, durable workflows→workflows, wiki CRUD→orvex-wiki (via DocmostPort). Its only browser client is orvex-studio-ui. Deployment is per-cell behind a single seamless `orvex.ai` URL (global anycast edge).

## 2. Inventory

- Architecture: orvex-studio-api (canonical) — `ekTh7nDQqo`
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical) — `TpxkDsKTkC`
- PRD: orvex-studio-api (draft) — `85qj2wwU2L`

Only 3 pages; no Decision Records page or ADRs exist yet (flagged gap).

## 3. Decided vs draft

**Canonical/locked:**
- Architecture page and its Audit are both status=canonical (ratified 2026-07-06, batch approval).
- **D-S17 polymorphic {user|org} principal** is the authoritative, twice-reversed-back-to ruling: a personal user is user-keyed with NO Clerk org; only Teams are real Clerk orgs. Existing user-keyed poc rows stay user-keyed (no personal-org backfill).
- D-SA1–D-SA11 (PRD "Decisions this session," all USER-confirmed 2026-07-05): strangle-not-clean-room; TS/Hono retained; UI/API split; billing = entitlement system-of-record incl. wiki quotas; knowledge = ONE multi-corpus service; ADR-0002 ceiling reproduced in ai; Kafka-first day one (engine transactional-outbox is a launch prerequisite, "Redis→Kafka bridge retired"); `engineGate()`/Card Contract v1 authority stays local; propose-only invariant; no Temporal worker (D-WF-1); per-cell deployment (D-SA11/A-CELL).
- A-CELL-COMPLIANCE rules (3/4/6/11/14) from the cell contract are bound into the architecture as fixed-in-draft.

**Still draft / open:**
- The **PRD itself is status=draft** ("Draft stays a draft" per its own change log) despite carrying many USER-confirmed decisions.
- Named OPEN DECISIONS carried to "Studio Act-1": Go-vs-TS auth verify mechanism (orvex-studio-lib/auth is Go, studio-api is TS — HIGH finding #1), how orvex-studio-contracts emits TS typed clients/golden fixtures for a TS consumer (MED #5), ADR sequence/registry + Decision Records parent page (MED #6), OQ-SA2 (AST-gate fate), OQ-SA4 (personal→Teams upgrade mechanics), OQ-SA5 (skill-search cutover pace), OQ-SA6 (DocmostPort re-point to wiki-api vs engine-direct), OQ-SA9 (identity cutover timing).
- Flagged upward: billing PRD and studio-ui still carry stale "Alpha=user"/org-keyed residue — cross-doc reconciliation to D-S17 not yet confirmed everywhere.

## 4. API/contract surface

- Product domain routes (PRD/Arch): `/v1/skills*`, `/v1/collections*`, `/v1/marketplace*`, `/v1/social*`, `/v1/memory*` (FormSpec via SSE), `/v1/curator*`, `/v1/demo*`, `/v1/import*`, `/v1/prompt-use*`, plus one **SSE entitlement channel** (D-S20, paywall dissolves <60s without reload).
- Internal: idempotent step-APIs + dual-gated callbacks for workflows (provision, Graduation, import, purge); MCP-facing domain APIs.
- OpenAPI + CloudEvent catalog + golden fixtures are meant to be **authored in orvex-studio-contracts**; studio-api conforms — but the TS-client codegen path from that (Go-oriented) seam is explicitly an **open decision** (audit finding #5).
- CloudEvents on Kafka-backed `studio-spine`: `studio.user.provisioned/graduated`, `studio.memory.updated`, `studio.skill.published/updated`, `studio.conversation.imported`, `studio.card.staged/approved/rejected`; consumes `billing.entitlement.changed`, `billing.trial.*`, `ai.cap.*`. No numbered ADRs exist yet for this event taxonomy (CS §9 trigger, unfiled).
- Maturity: **design-only**. Actual code (per audit, verified against repo @ commit 5993805) is a 59-line `src/index.ts` — a `GET /healthz` plus `app.all` 501 `not_implemented` stubs for `/v1/skills|/v1/memory|/v1/marketplace`. No layering, no tests, no CI, no lockfile.

## 5. Delivery state

- **Honest scaffold**, per the SE-Arch audit's explicit build-state check: "honest scaffold... no `src/` layering, no tests, no `.github/` CI, no lockfile."
- Deploy tree is real and complete: kustomize namespace/Deployment+SA+PDB/service/configmap/external-secrets, distroless non-root Dockerfile, per-cell shape.
- Verdict on the architecture: **needs-tightening** — 2 HIGH findings (auth verify unimplementable as originally written since orvex-studio-lib/auth is Go and studio-api is TS; direct-publish-to-spine was a dual-write, now fixed to require studio-api's own Postgres outbox+relay) — both marked "fixed-in-draft."
- Build defects recorded but NOT fixed (repo code, read-only clone, "recorded for the repo owner"): missing lockfile breaks `npm ci` in the Dockerfile; `"lint": "tsc --noEmit"` violates CS §4; naming drift (`orvex-studio-control` should be `orvex-studio-console` in `src/index.ts`, README, configmap, deployment).
- The reference product it strangles — `orvex-prompt-studio-poc` — is itself described as "a shipped, live product": Phase 1 closed 15/15 milestones, 83/83 stories (2026-07-02), 736 tests green. This is the source being extracted, not orvex-studio-api's own delivered state.
- Health/readiness: audit required splitting the scaffold's single always-200 `/healthz` into distinct liveness/readiness probes — recorded as fixed-in-draft (design), not yet confirmed built.

## 6. Gaps & tensions

- No Decision Records page or ADRs exist despite 5 CS §9-triggering decisions identified (A-AUTH, `studio.*` event taxonomy, A-DATA pgvector→Turbopuffer split, A-CELL, D-S17) — audit explicitly declines to invent ADR numbers, deferring to "Studio Act-1."
- Principal model (D-S17 vs org-keyed-from-the-start) was reversed **twice** in this doc's own history; audit calls it "textbook ADR... reversed twice" and flags residual cross-doc incoherence with the billing PRD and studio-ui.
- Go/TypeScript seam is a structural tension recurring twice: shared auth verify library (orvex-studio-lib/auth) and shared typed contract clients are both Go-authored while studio-api is the one TS/Hono satellite — no resolved mechanism for either.
- Engine wiki quotas: DocmostPort writes can hit a typed 402 (`QUOTA_EXCEEDED`) once engine-enforced; every write path (Curator apply, capture, demo seed) must handle it — demo-seed interaction is still an open question (OQ-SA11, though marked resolved/closed per D-S23 in the PRD).
- PRD flags its own residual contradiction: "NEW CONTRADICTION flagged for Daniel" language appears in the change log before being closed by D-S17 — history left in place rather than scrubbed, per doc convention.
- Kafka/outbox sequencing named as a schedule risk, not an architecture risk, now that the design fix (own Postgres outbox+relay) is specified — but the engine's transactional-outbox relay is a hard launch prerequisite for wiki-sourced events, and its delivery timing outside this doc's control.
