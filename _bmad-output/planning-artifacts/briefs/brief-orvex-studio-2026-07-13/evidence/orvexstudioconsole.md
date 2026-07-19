# orvexstudioconsole — Digest

## 1. Mandate

`orvex-studio-console` (renamed from `orvex-studio-control`, 2026-07-05) is the Orvex Studio family's **operator admin console and observability front end** — one Go BFF + embedded React/shadcn SPA, serving human operators only (Clerk admin-org, plus break-glass). It has two halves: **Observability** (single pane over Loki/Mimir/Tempo + Temporal workflow visibility, correlated via the contracts `obs/CONVENTIONS.md` label vocabulary) and **Admin** (cross-satellite operations — tenants/tokens via identity, reindex via knowledge, workflow retry/cancel/signal via workflows' authorizing proxy, entitlements/quota via billing+engine — all through the owning satellite's own admin API). Console "composes and renders; it owns no domain state and makes no domain decisions" — stateless BFF, Redis only, zero blast radius on tenant-serving paths (G4).

## 2. Inventory

- Architecture: orvex-studio-console (canonical) — `L1NVnmRgpy`
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical) — `XNatvIB169`
- PRD: orvex-studio-console (canonical) — `kldiZu93EC`
- ZZ-TEMP-CONVERT-console-arch-DELETE (archived, superseded draft twin of the arch page) — `I0ifbcSaTZ`

Only 4 pages total — a small, tight space. No ADR pages exist yet despite several decisions meeting CS §9 triggers (named as a gap, see §6).

## 3. Decided vs draft

**Locked/canonical:**
- D-CT1 stack: Go BFF + React/shadcn-ui SPA (USER 2026-07-03).
- D-CT2: two-halves charter, compose-not-own.
- D-CT4/A-STATE: stateless BFF, Redis only, no Postgres/Mongo (saved-views deferred, OQ-CT2).
- D-CT5: BFF API is repo-private, never a contracts artifact.
- D-CT6: credential separation — operator-token pass-through everywhere; standing creds only for LGTM (read-only).
- **D-CTRL**: Temporal access by REMOVAL not confinement — console holds NO direct Temporal credential; all reads+writes go through a **thin authorizing proxy in orvex-studio-workflows** (named but un-chartered workflows backlog item). Called "the sharpest decision in the doc" by SE-Arch.
- D-CAP / OQ-CT8 (re-pointed 2026-07-05, C3 ruling): billing owns plan→entitlement→AI-spend-cap VALUE (SoR, D-P3); ai reads+enforces via LiteLLM `max_budget`; console only displays/fronts-the-set.
- D-OBS-UI / OQ-CT1 (PO 2026-07-08, license-corrected 2026-07-09 per ENG-1613 Run-11): Grafana's Apache-2.0 `@grafana/ui` + `@grafana/scenes` supply the pane SHELL only; trace waterfall + TraceQL/LogQL result panes are ORIGINAL console code because Grafana's trace-viewer is AGPL-only and ships zero trace components in `@grafana/ui`. No Grafana server embedded (NFR-CT4 intact). Tied to engine tracing ADR-0016.
- OQ-CT5/OQ-CT6: resolved alongside D-CTRL (workflow proxy mechanism; audit stream = durable ackable Kafka topic on `studio-spine`, D-P6).
- SE-Arch review verdict: **needs-tightening**, ratified 2026-07-06 batch approval — all findings either fixed-in-draft or flagged for human reconciliation.

**Still open/draft-shaped:**
- OQ-CT2 (saved-views datastore), OQ-CT3 (RBAC model, gates Phase 3), OQ-CT4 (per-cell vs global deploy — **collides with cell-contract rule 14**, global singleton allowlist doesn't include console; needs an ADR), OQ-CT7 (alerting/paging ownership), OQ-CT9 (identity operator-lifecycle admin surface — FR-CT7 write half blocked).
- Canon-roster contradiction (F3): family canon lists console Data = "Postgres, Redis"; arch says Redis-only/stateless. Flagged for human reconciliation, not self-resolved (authority order puts canon above space).
- No ADRs filed yet for D-CTRL, A-FRONTEND/D-CT1 (go:embed, family's first non-pure-Go build), D-CT5, A-BREAKGLASS, or OQ-CT4 resolution — all meet CS §9 triggers per the SE-Arch review; Studio ADR sequence starts at 0001, parent page TBD ("Studio Act-1").
- Repo drift (F6): the actual git clone still carries stale naming (`orvex-studio-control`, `cmd/control`) and an out-of-scope `FR-CT20–23/D-CT7` "Studio-admin peer-domains" scope + a canon-contradicting "Redis→Kafka bridge" claim — wiki-first governs, canon+wiki say that scope is OUT; repo is the stale side, read-only, not touched by this task.

## 4. API/contract surface

Console's BFF API is **explicitly repo-private (D-CT5)** — NOT authored in `orvex-studio-contracts`, not offered to any consumer beyond its own SPA. No OpenAPI/swagger artifact is described for it. Routes enumerated in arch §3:
`/api/obs/{logs|metrics|traces|alerts}` (guardrailed LGTM proxy) · `/api/workflows[/:id]` (read, via workflows proxy) · `/api/workflows/:id/{retry|cancel|signal}` (Phase 3, via proxy) · `/api/admin/{tenants|tokens|health|ai-usage|entitlements|quota|reindex|audit}` · `/api/breakglass/*` · `/healthz` (echoes `CELL_ID`+`CLUSTER_NAME`, unauthenticated exception). Everything under `/api` passes `lib/auth` + cell-guard middleware.

Console is purely a **consumer** of contracts: the `obs/CONVENTIONS.md` label vocabulary (FR-C18) for correlation, and every satellite's own contracts-authored admin API contract (identity, knowledge, billing, ai, workflows-proxy). No CloudEvents are published by console itself — it only emits synchronous audit records to the family audit stream (Kafka topic on `studio-spine`, substrate decided but not yet built).

Maturity: **design-only, zero implementation.** The repo is an empty scaffold (CLAUDE.md + 3 planning artifacts, no go.mod/CI/cell-lint).

## 5. Delivery state

- **Build state: empty scaffold.** `git ls-files` = 4 files (CLAUDE.md + architecture/prd/decision-log). No `go.mod`, `internal/`, `cmd/console`, Dockerfile, CI, cell-lint workflow, or `CELL_ID`. Explicitly disclosed, not fake-done (SE-Arch F5).
- SE-Arch audit is a **design audit**, not an implementation-drift audit (build-state = N/A for tier/impl conformance).
- Cell-contract onboarding: console sits **outside** the day-1 required-status ruleset until the bootstrap Issue lands cell-lint, `CELL_ID`, `/healthz` assertions, and the tenant-move typed stub (rule 10).
- Named CI gates the bootstrap Issue must land: AGPL-import guard, A-BREAKGLASS dependency-direction test, `lib/auth` conformance suite, LGTM-credential-confinement build-tag/lint gate, cell-lint + tenant-move stub.
- Rollout is phased and explicitly gated on cross-repo dependencies that do not yet exist: **Phase 1** (pane, no mutations) ships once identity's verifier is live; Temporal visibility panel waits on the workflows authorizing proxy. **Phase 2** (admin reads) — audit-trail pane gated on the Kafka `studio-spine` build-out. **Phase 3** (admin writes) gated on OQ-CT3 (RBAC) + authorizing proxy live + durable audit stream live. **Phase 4** (break-glass) gated on identity's OQ-I5.
- No "not implemented"/501 markers beyond the tenant-move stub description (a 5-line 501 stub required by cell-contract rule 10, not yet built).

## 6. Gaps & tensions

- **Cross-repo dependency not yet chartered:** the workflows authorizing proxy is "a named workflows backlog item" that FR-CT3/FR-CT10 (Temporal visibility + writes) depend on entirely — it does not exist yet, and is owned by a different space (orvex-studio-workflows), not console.
- **Cell-contract rule 14 conflict (OQ-CT4, unresolved):** console is not on the global-singleton allowlist `{registry, Temporal, edge, Stripe front-door, Clerk, CDN}`, yet NFR-CT6 ("one pane for eu1 AND us1") pulls toward a global instance. Must be reconciled with an ADR before a second cell exists.
- **Canon contradiction (F3):** family canon's service roster lists console Data as "Postgres, Redis"; the arch is Redis-only/stateless. Unreconciled — flagged, canon not edited by this task (ratify-gated, human-only).
- **Repo/wiki divergence (F6):** the actual git clone still uses the old `orvex-studio-control`/`cmd/control` naming and carries an out-of-charter `FR-CT20–23/D-CT7` "Studio-admin peer-domains" scope plus a canon-contradicting "Redis→Kafka bridge" claim not present in the wiki or canon — wiki-first governs; repo is stale and unsynced.
- **No ADRs filed** despite 5 decisions meeting CS §9 mandatory-ADR triggers (D-CTRL, A-FRONTEND/D-CT1, D-CT5, A-BREAKGLASS, OQ-CT4 resolution) — Studio ADR numbering/parent page is itself TBD ("Studio Act-1").
- **Family audit stream substrate decided but not built:** Kafka topic on `studio-spine` is the decided substrate for FR-CT14's audit-or-fail clause, but until built, console's own audit rides best-effort structured logs into Loki (read-audit only, cannot carry a mutation) — this blocks all Phase-3 writes.
- **Break-glass has a structural coverage gap:** with both IdPs down, break-glass cannot reach any other satellite (e.g., the workflows FR-W5 grace-cancel signal) — accepted gap unless identity's OQ-I5 grows offline emergency tokens.
- **Concentrated-privilege risk acknowledged but not mitigated by RBAC yet:** until OQ-CT3 resolves, all operators are family-global admins — one compromised console session reaches every satellite's admin plane plus all logs.
