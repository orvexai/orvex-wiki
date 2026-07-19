# orvexstudiocontracts — Evidence Digest

## 1. Mandate

`orvex-studio-contracts` is a pure-artifact, Apache-2.0, no-runtime repo that is the single pinned seam for the whole Orvex Studio family: every OpenAPI surface, CloudEvent type, SSE wire behavior, error/exit-code vocabulary, source-adapter registry, shared identity schema, and golden fixture that crosses a repo boundary is **authored by hand here** (never generated from the AGPL engine) and every satellite conforms to it. The direction of conformance is fixed one-way for licensing reasons: engine is AGPL, satellites are closed, so contract artifacts must never be engine-derived. "Nothing here runs; everything here is the agreement."

## 2. Inventory

- PRD: orvex-studio-contracts (draft)
- Architecture: orvex-studio-contracts (canonical, ratified 2026-07-06 batch approval; tightened per SE-Arch review 2026-07-05)
- Architecture Audit — SE-Arch review (2026-07-05) (canonical)

## 3. Decided vs draft

**Canonical/locked:**
- Apache-2.0, contract-first, authored-never-generated, both sides conform (carried from platform decisions 2026-07-03).
- D-ASK: cited-ask/RAG loop lives in `ai.yaml` (orvex-studio-ai), not wiki-api; wiki-api has no `ask` verb.
- D-CAP: AI spend-cap **value** owned by billing (system of record, D-S7); ai reads + enforces via LiteLLM `max_budget`; console displays. "Interim until billing exists" posture retired.
- D-S7/FR-C24: billing is plans/entitlements SoR; Free/£7 Personal plan quotas locked; Teams/Enterprise quota values deferred (OQ-C9).
- D-S11: Linear removed product-wide — no `linear.*` namespace; legacy `linear_*` blocks round-trip as opaque-preserve, never dropped. DfM catalog now 21 embed types (down from 29).
- D-P6: Kafka-first — transactional outbox → Redis→Kafka bridge is a named launch prerequisite; not yet built.
- D-CON-1..8 (versioning/semver, codegen split, DfM corpus ownership, batch fan-out rule) are settled ADR-style decisions in the architecture.
- D-S6: `orvex-studio-control` renamed `orvex-studio-console`.

**Still draft / open:**
- OQ-C1: repo ownership/maintainer model unresolved — no owner assigned.
- **OPEN DECISION #1 (HIGH)**: contracts change-authority is explicitly unresolved — family canon P3 ("no human ratify step") directly contradicts Coding Standards §9 (mandatory ADR + human doc-ratify per contracts change). Flagged for ADR-0001, not resolved.
- OPEN DECISION #2: wiki-api host routing mechanism (Cloudflare Worker vs Traefik edge) — flat-vs-per-cell topology itself was resolved (flat public host + internal per-cell origin), but the mechanism is open.
- OPEN DECISION #3: fate of the Phase-0 wiki-api transparent-proxy `ask`/K5 surface at `ai.yaml` cutover (retire immediately vs short coexist window).
- OQ-C2 (FR-30 allow-list content, stale divergence ledger), OQ-C3 (repo visibility, public vs private), OQ-C5 (MCP 73-tool catalog pinned here or not), OQ-C6/7/8 (clerk.* scope, role enum, JWKS-mirror freeze owner) all open, several externally gated (`x-status: draft`).

## 4. API/contract surface

Six OpenAPI 3.1 seam-server files planned: engine-primitives, knowledge (query+projection), identity, wiki-api (verb grammar `search/get/save/edit/list`, write-receipt `{url,id,version,persisted}`, CAS `ifVersion`), ai (cited-ask/RAG + K5 answer schema `{answer,citations,confidence,unanswered,gapNote,followups}` + spend-cap read/enforce), billing (plans/entitlements SoR). Plus: CloudEvents 1.0 catalog (`wiki.*`, `clerk.*`, `billing.entitlement.changed`, identity lifecycle; thin/rich profiles), full SSE wire contract (extracted from shipped engine controller — cursor v1/v2, `/events/head`, heartbeat/backoff constants, 7-day resume floor), frozen ~58-code errorCode + CLI 0–9 exit-code vocabulary, source-adapter registry, shared principal/token-scope/role/token-claims JSON Schemas, golden markdown/text_repr + DfM round-trip fixtures (21-embed catalog), FR-30 divergence-gate config, AGPL-import guard config.

**Maturity: scaffold, ~90% unbuilt** relative to design (self-declared, verified against clone at commit `9546ed5`). Real artifacts today: `cell-contract.md` (14 rules), `cell-lint.yml` (working CI, 4 jobs, but floating `@dev`), `openapi/wiki-api.yaml` (401 lines, coarse-but-real Phase-0 proxy — includes `POST /api/orvex/ai/ask` that per design should NOT be here), `openapi/engine-primitives.yaml` (titles-only stubs), `events/catalog.yaml` (6 draft types, stale — e.g. wrong `wiki.attachment.updated`), one event payload schema stub (missing required `version` field — a HIGH-severity gap since `version` is load-bearing for knowledge's watermark bound), 3 real component schemas (`org-move-manifest`, `k5-cited-answer`, `write-receipt`).

## 5. Delivery state

Nothing runs; this is a pure-artifact repo, so "delivery" = artifact completeness + gate presence, and both are largely absent:
- No self-validation CI exists (`validate.yaml` missing) though the architecture calls it "the only executable surface" — sequenced as a v0.1 blocking keystone.
- `SEAMS.md` (the declared health metric / NFR-C4 seam inventory) does not exist.
- `gates/agpl-import/` — the family's "day-one licence police" — is an empty README.
- No VERSION/CHANGELOG/git tag exists; consuming CI (`cell-lint.yml`) floats on `@dev`, violating the repo's own tag-pin rule.
- Authored-not-generated guard (PR provenance attestation, generator-signature lint) unbuilt.
- Rollout plan defines v0.1→v1.0 waves but v0.1 keystones (self-validation CI, SEAMS.md, AGPL guard, first tag `v0.1.0`) are all still pending.
- SE-Arch review verdict: **"needs-tightening"** — tightened via embed-safe splices, not rebuilt; audit targeted design only since nothing is implemented yet ("architected-not-built" honesty gap acknowledged explicitly, not papered over).

## 6. Gaps & tensions

- **HIGH, unresolved**: change-authority contradiction — canon says contracts governance is fully agent-automated with no human ratify step; Coding Standards §9/§12 mandate an ADR + human doc-ratify for every contracts change. Filed as ADR-0001 trigger, not settled.
- Missing `version` field in the one real event schema undermines the entire event-CAS/knowledge-watermark design if used as the drift-gate reference as-is (now fixed in the tightened design, not yet in the repo).
- Two pinned homes for the K5/ask surface (wiki-api's shipped proxy vs designed `ai.yaml` owner) — reconciled in design (single home = `ai.yaml`, wiki-api is a deprecated Phase-0 proxy) but the repo file itself still needs the phase-note/deprecation markers.
- Flat-vs-per-cell host contradiction between family URL canon and the shipped `wiki-api.yaml` `servers:` block — resolved in design, not yet in the repo.
- `cell-lint.yml`'s `peer-url-literals` job has a blind spot (only greps `*.go`/ConfigMap yaml, misses OpenAPI `servers:` blocks) — the very gate this repo ships to the family has a gap.
- Non-resolvable schema `$id`s (bare GitHub web paths, no ref) — will 404 on dereference.
- Repo's own `_bmad-output` PRD/architecture snapshots are stale (2026-07-03) vs the wiki's 2026-07-05 fold-in (billing seam, F-QUOTA, Linear-scrub, Kafka bridge, errors/ vocab, console rename) — wiki-page is authoritative but repo copy lags.
- Forward-authored catalog risk: the transactional-outbox→Kafka relay this catalog assumes doesn't exist yet; first real drift-gate run against it is the true verification moment.
- Chokepoint/bottleneck risk explicitly named: six+ repos block on this one repo's PR review SLA, and no maintainer/owner is yet assigned (OQ-C1).
