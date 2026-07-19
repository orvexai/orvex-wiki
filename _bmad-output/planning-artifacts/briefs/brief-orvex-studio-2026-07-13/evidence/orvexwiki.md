# orvexwiki space digest

## 1. Mandate

`orvexwiki` is the canonical home for **orvex-wiki**, the **Core Wiki Engine** — an AGPL fork of vanilla Docmost v0.95.0. Post-split it is deliberately **thin**: it keeps only irreducible primitives (block-ID write chokepoint / `apply-ops`, ACL, page lifecycle, export, Yjs/Hocuspocus collab, exchange-token session-mint consume, AGPL-clean api-key, transactional outbox, `orvex_page_meta`, the shared `@orvex/dfm` serializer, and quota enforcement), while composition/verb-grammar/cited-ask lives in orvex-wiki-api, retrieval in orvex-studio-knowledge, AI in orvex-studio-ai, auth/tokens in orvex-studio-identity, billing in orvex-studio-billing. It is explicitly a **first-class standalone product**, not Studio-coupled — designed to run against its own knowledge/ai/mcp/identity/console/billing instances. Under the 2026-07-05 doc-consolidation mandate (D-S2) this space holds only wiki-and-engine docs; cross-service platform canon lives in `orvexstudioarch`.

## 2. Inventory

- Architecture: orvex-wiki (canonical)
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical)
- Decision Records (archived)
- Decision Records — orvex-wiki (engine) (canonical)
  - ADR-0001: Transactional outbox to Kafka direct — no Redis bridge (canonical page / ADR itself "Proposed — pending human doc-ratify")
  - ADR-0002: Native login removed — identity-only auth (canonical page / ADR "Proposed")
  - ADR-0003: Quota counters fail-open for cheap resources on Redis loss (canonical page / ADR "Proposed")
  - ADR-0004: Billing→engine entitlement read — push-evict + pull-on-miss (canonical page / ADR "Proposed")
  - ADR-0005: Minimal standalone wiki — engine + identity mandatory (canonical page / ADR "Proposed")
- Docmost (Open Source) — Project Overview (draft), plus 9 child reference pages (API & Real-time Transports, Architecture Overview, Client — React SPA, Data Model & Migrations, Deployment & Operations, Development Guide, Editor Extensions & Formula Engine, Enterprise Edition & Licensing, Glossary, Integrations & External Services, Repository & Source Tree, Server — NestJS Backend) — all draft
- Engine Reference (docmost internals) (draft) + children: Collaborative Editor, Data Model, Development Guide (orvex-wiki engine), Enterprise Edition → Satellite & Entitlement Map, Server Internals — all draft
- Foundation Run Handoff — orvex-wiki (2026-07-06) (canonical)
- Free-at-Scale — Wiki Economics & Scale Mechanics (draft)
- Orvex Wiki Program — Authoritative Study & Fold-In Plan (draft, "pending Daniel's ratification")
- PRD: orvex-wiki (draft)
- Separation & Upstream-Mergeability (draft)
- Split Plan — Engine ↔ Satellites (Disposition) (draft)
- Start Here — Orvex Wiki Canon (draft)

## 3. Decided vs draft

**Canonical / locked:**
- Architecture: orvex-wiki page is marked canonical (though its own text says "tightened per SE-Arch review... ratify+supersede is a human action" — internally inconsistent framing).
- 5 ADRs exist as canonical pages, but each ADR body itself is still labeled "Status: Proposed — pending human doc-ratify" — i.e. the wrapper is canonical, the decision content is not yet ratified.
- Foundation Run Handoff (2026-07-06) is canonical — records what was actually built.
- D-S1 (Docmost v0.95.0 re-port base, not a rebase of 0.80.1), D-S2 (space consolidation), D-S3 (native login removed, no break-glass), D-S4 (AGPL client keeps thin-UI AI affordances), D-S5/D-S27 (tenant hostname ordering, D-S27 amends D-S5 to `{tenant}.wiki.{cell}.orvex.ai`), D-S12 (no Mongo), D-S13 (Kafka joins with outbox build), D-S17 (polymorphic user-or-org tenancy) — treated as locked rulings referenced across pages.

**Still draft / pending:**
- The PRD, the Architecture page's own caveat, the Program Study & Fold-In Plan ("DRAFT pending Daniel's ratification"), Split Plan, Separation & Upstream-Mergeability, Start Here, and essentially all Docmost/engine reference documentation.
- Multiple TBD/open items registered verbatim in the Foundation Handoff (see §5/§6).

## 4. API/contract surface

- M8 delivered an **OpenAPI-contracted no-op skeleton**, "REIMPLEMENTED FROM SCRATCH": `contracts/openapi.yaml` (OpenAPI 3.1, redocly-clean), **8 operations**:
  - `orvexApplyOps` (FR-W1) — the single write primitive: block-ID-native write chokepoint, CAS `ifVersion` → 409, atomic-or-409, typed PM-JSON ops.
  - `orvexGetQuota` (FR-W15) — quota state query, entitlement-schema field parity.
  - `orvexSessionExchange` (FR-W6) — **noop-501** (explicit narrowing rationale: verifier core is real+tested, session wiring is a fold-in edit).
  - `orvexSourceOffer` (FR-W19) — REAL, loud-500 when unconfigured (AGPL §13 source-availability endpoint).
  - 4× `orvexTenantMove*` (A-MOVE) — day-1 typed contract, Idempotency-Key gated, **before the 501**.
- Real health surface + real produced-event names cited from the contracts catalog; 3 error envelopes modeled from live responses; wire-true `{data,success,status}` envelope documented.
- **No `/docs` endpoint** (D-S18, deliberate).
- Greppable `ORVEX_NOT_IMPLEMENTED: <operationId>` sentinels; `scripts/orvex-marker-check.sh` reconciles 7/7 vs contract.
- Explicit deviation recorded: the contract is **not yet mirrored into orvex-studio-contracts** (one-repo-per-run scope); "registration is paste-ready ask #5."
- Auth surface: engine verifies only identity-minted exchange tokens (RS256/JWKS via `ExchangeTokenVerifier`, jose 6.2.3, exact-pinned, no unsigned-claims path, no test-mode bypass) — never verifies Clerk/Keycloak directly (identity owns the dual-IdP spine).
- No CloudEvents terminology found in this space; outbox→Kafka direct is the event-emission path (ADR-0001), still "Proposed."

## 5. Delivery state

Foundation Run Handoff (2026-07-06, canonical) is the clearest built-vs-planned signal, milestones M1–M8 on branch `dev` (local only, **not pushed**):
- M1: zero-mock quarantine + import-boundary lint — proven, "delivery path carried ZERO fabricated data."
- M2: local prod-parity env (postgres:17, redis:8, MinIO); `/api/health` 200 db+redis up.
- M3: smoke tests (Tiers 1–4, FAIL-never-SKIP), Playwright honest-empty-state smoke, jest harness fixed (8 suites green, 16 upstream DI-scaffold specs excluded).
- M4: CI (11 gates → `ci-success`), branch protection applied on `main`, `make ci-local` all green.
- M5: observability baseline — honest scope stated: **"no app `/metrics` yet — real kube-state/cAdvisor signals only."** Manifests validated only, **NEVER applied** to a cluster.
- M6: audit only, no commit — orchestrator execution seat is **TBD**.
- M7: auth core reimplemented from scratch, 16 TDD tests passing.
- M8: OpenAPI skeleton (see §4) — adversarial verify found 5 issues, all fixed; final battery on fresh DB: e2e green, smoke green, dfm 23/23, marker 7/7, all CI gates green.
- Explicit statement: "wiki writes draft-only; zero Linear writes" — nothing applied to any cluster this run.

## 6. Gaps & tensions

- FR-W19 flags today's deployed engine has **no §13 source-availability mechanism**; fork carries **two conflicting endpoints** with inconsistent sha fallbacks and org/repo URLs (`orvexai/docmost` vs `orvex-ai/orvex`) — needs reconciliation, called "a cheap, do-it-now launch gate."
- Multiple TBD registers carried verbatim (not invented): orchestrator execution seat, Studio foundation sequencing, Studio ADR Decision-Records parent + fresh registry (blocks D-S13/D-S17/D-S3/frozen-402/A-QUOTA ADR filings), Studio build-agent credential model, CS multi-repo refresh mechanism.
- 6 "paste-ready platform/canon asks" outstanding, incl.: CS §13 wording is wrong (says "runner group `runner`", should be self-hosted label `runners`); cell-lint.yml has the same wrong `runs-on` blocks in 4 places; crew sibling-wiring convention needs a platform decision; tenant-wildcard gateway listener not yet added; OpenAPI contract not yet registered in orvex-studio-contracts; project-context.md's "Additive seam inventory" section is stale (describes a removed scaffold in present tense).
- Upstream test/lint debt explicitly recorded, not hidden: 16 never-green upstream jest specs, ~170 react-hooks v7 violations downgraded to WARN, one broken-upstream npm package bumped.
- Architecture page itself flags internal tension: marked canonical but text says "ratify+supersede is a human action," i.e. not actually ratified.
- All 5 ADRs sit in a canonical parent page while individually still "Proposed — pending human doc-ratify" — a status mismatch between container and content.
- Nearly the entire Docmost/engine reference sub-tree (12+ pages) remains draft with no indication of a ratification pass planned.
