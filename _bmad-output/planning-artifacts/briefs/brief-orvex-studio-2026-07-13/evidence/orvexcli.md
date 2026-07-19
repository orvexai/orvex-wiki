## 1. Mandate

orvex-cli is the platform's multi-service agent-facing command-line client — a Go/cobra binary (`orvex`, plus `orvex-full`) that exposes wiki, search, ai, auth, and admin as peer service namespaces (wiki is "one namespace among peers," not the product). It is the successor to `docmost-cli` but is explicitly **not a fork**: per D-S21 (AMENDED) the `github.com/orvexai/orvex-cli` repo starts empty and every capability is rewritten from scratch as deliberate commits against the microservice architecture, with `docmost-cli` kept untouched as the "behavioural reference/spec" (output contract, exit codes, command semantics, contract tests). Routing is domain-pure: wiki verbs → orvex-wiki-api, search/knowledge/SSE → knowledge, ask/chat → ai, auth → identity; the engine's raw API is never contacted. Linear is entirely absent (D-S11).

## 2. Inventory

- Architecture: orvex-cli (canonical) — pf10XC2Qjz
- Architecture Audit — SE-Arch review (2026-07-05) (canonical) — EJ9WgVAuls
- Orvex CLI — Audit Findings & Rebirth Plan (draft) — PACF13d3I3
- PRD: orvex-cli (draft) — R4AOVBLST7

## 3. Decided vs draft

**Canonical / locked:**
- Architecture page and its SE-Arch audit are both `status: canonical`, ratified 2026-07-06 (batch approval).
- D-S21 AMENDED: from-scratch empty-repo rewrite (overrides an earlier rename-in-place plan).
- D-S16: domain-pure routing, no engine-direct calls; D-S11: Linear removed product-wide, not deferred.
- SE-Arch verdict: pre-tightening "contradicts-canon" on host-routing form (F-A) — tightened draft now **adopts canon's flat service hosts** (`wiki-api.orvex.{tld}`, `auth.orvex.{tld}`, `events.orvex.{tld}`; only the wiki tenant host is cell-segmented). Canon (86CiGucQwU) outranks this space per authority order.
- F-B/F-C/F-F/F-G (421 cell-mismatch handling, cursor cell-qualification, idempotency keys, correlation-ID propagation) are "fixed-in-draft" in the architecture page.
- Security/Zero-Trust and Cost/Resource-Governance lenses: CONFORMS, no findings.

**Still draft / open:**
- PRD (R4AOVBLST7) and the audit/rebirth plan (PACF13d3I3) are both `status: draft`.
- 9 open questions (OQ-CLI1–9) remain unresolved, notably: ai host + public knowledge query host unpinned (OQ-CLI2), wiki-api host form flat vs `api.wiki.orvex.{tld}` (OQ-CLI2b), ifVersion CAS representation (OQ-CLI4), audit sink ownership/tamper-evidence (OQ-CLI3), ADR registry/Decision-Records parent for orvexcli itself TBD pending Studio Act-1 (OQ-CLI9), freshness SLO numeric unpinned (OQ-CLI7).
- Five seam decisions are flagged as ADR-triggering (CS section-9) but have **no filed ADR-NNNN yet** — they live only as D-S rulings + prose Trade-offs (F-D, "fixed-in-draft" only in the sense of being enumerated, not resolved).

## 4. API/contract surface

- Per-service typed clients are **codegenned from the orvex-studio-contracts tag**, never a served descriptor — explicitly deletes the reference's 1.84 MB / ~280-method served-descriptor client and its live-curl codegen (the "exact anti-pattern the contracts doctrine forbids").
- One service-aware transport (`internal/transport`) resolves base URL per service, applies per-service envelope decode: `{data}` on the wiki-api byte-compatible `/api/orvex/*` facade; bare receipts `{url,id,version,persisted}` on `/v1`; typed shapes on knowledge/ai.
- CloudEvent-shaped SSE stream from the knowledge events host: unprefixed event names (`page.content_updated`, `permission.changed`, etc.), `applied_events` exactly-once dedup, control frames (`stream.gap/backpressure/terminated`), 1 MiB frame cap, <45s heartbeat.
- Frozen 0–9 exit codes + a large `errorCode` string vocabulary (shared client artifact across namespaces) — "extended, never renumbered."
- Idempotency-Key on replayable writes; CAS `ifVersion` → 409 `VERSION_MISMATCH`.
- Maturity: contract-shaped and detailed at the design level, but the openapi specs themselves (wiki-api.yaml, knowledge/ai/identity) are referenced, not shown here as delivered — the CLI's own repo has zero code, so no client has actually been generated yet.

## 5. Delivery state

- **Build-state is a bare scaffold.** Per the SE-Arch audit: `git ls-files` on `github.com/orvexai/orvex-cli` returns exactly two files — `CLAUDE.md` (pointer to family Coding Standards) and `README.md` (declares from-scratch rewrite intent). "No go.mod, cmd/, internal/, tests, CI, Dockerfile, or goreleaser." Single commit `a996980`.
- "There is ZERO implementation drift to audit; this review targets the DESIGN only."
- The prior `docmost-cli` (the behavioural reference, NOT this repo) is described as mature/v1.4.2/Homebrew-distributed with real defects catalogued (D1–D13: no offline markdown→PM path, baked-Excalidraw data loss, dropped `page.status_changed` event, org-mismatch breaking release chain, keychain rename orphaning tokens, cursor-monotonicity coupling, stale test, dead code, triplicated canonicalizer, unbounded caches, aspirational tamper-evidence, coarse permission pruning).
- A 10-phase build plan (C0–C9) is defined but per the scaffold statement, none of it has started in the new repo.
- Honest-stubs pattern (`REQUIRES_FULL_BINARY`) is a carried design commitment, not yet implemented.

## 6. Gaps & tensions

- Direct contradiction (F-A, HIGH) between the PRD/Architecture drafts (cell-segmented host convention `{service}.{cell}.orvex.tld`) and family canon 86CiGucQwU (flat service hosts) — resolved in the tightened architecture page in favor of canon, but the PRD (R4AOVBLST7) still shows the pre-fix cell-segmented convention in its Constraints section, i.e. the PRD and Architecture pages are now internally inconsistent with each other pending a PRD sync.
- No ADR-NNNN filed for any of 5 costly-to-reverse seam decisions (rewrite-from-scratch, host convention, pkg/dfm/AGPL boundary, contracts-tag codegen, hard-delete tombstones) — blocked on a Studio-wide ADR registry that doesn't exist yet (OQ-CLI9).
- ai host and public knowledge query host still unpinned in canon (OQ-CLI2), which blocks routing decisions this CLI depends on.
- Audit sink ownership and tamper-evidence policy unresolved (OQ-CLI3).
- ifVersion CAS wire representation (timestamp vs monotonic int/etag, body vs header) unpinned — blocks the C3 write-repoint phase (OQ-CLI4).
- Golden-fixture corpus for pkg/dfm parity is flagged "inadequate" (only 6 core-GFM pairs; no embed/opaque-node/table-cell-mark/mermaid fixtures) — an explicit contracts prerequisite for wiki-api Phase-1 exit.
- `image_from_prompt` cross-service call path (wiki→ai orchestration) undefined (OQ-CLI5).
