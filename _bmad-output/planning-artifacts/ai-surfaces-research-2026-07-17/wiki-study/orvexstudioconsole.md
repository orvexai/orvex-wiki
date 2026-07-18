# Wiki study: space `orvexstudioconsole` (11 pages, all read)

Source: `/home/daniel/repos/orvex-studio/.cache/docs/orvexstudioconsole/` — synced 2026-07-17.
Console = the family's admin console + observability BFF (Go) + React/shadcn SPA. This space is one
of 8+ satellite spaces feeding the AI-surfaces (MCP/wiki-api/CLI) re-baseline; console itself is a
**consumer** of wiki-api/engine/knowledge/identity/billing/ai/workflows, not a producer of any
contract those three surfaces would call — but it is a heavy signal source on contract discipline,
tiering, ADR practice, and "deployed ≠ done" doctrine that should inform the redo.

## 1. Per-page table

| slug | title | status | one-line substance |
|---|---|---|---|
| L1NVnmRgpy | Architecture: orvex-studio-console | canonical | Go BFF + React/shadcn SPA; two halves (LGTM observability pane + cross-satellite admin); stateless/Redis-only; BFF is a privilege boundary; no direct Temporal cred (proxy only); tightened 2026-07-05 per SE-Arch audit; several ADRs still unfiled; rule-14 cell-contract conflict open (OQ-CT4) |
| XNatvIB169 | Architecture Audit — SE-Arch review (2026-07-05) | canonical | 8 findings (F1–F8) against the arch page, all fixed-in-draft or flagged for human reconciliation; verdict "needs-tightening", none fatal; build state at the time was an empty scaffold |
| Ii9q9kBNms | Architecture: User-Behavior Analytics (Console) | draft | New product-analytics pane; store DECIDED = PostHog Cloud EU (managed processor, Frankfurt); two ingestion paths (server-side CloudEvent→PostHog bridge + client-side posthog-js in frontends incl. AGPL engine); heavy privacy/consent/k-anonymity design; several open ADRs/OQs; all dashboards pre-launch illustrative |
| 1YS71L9neD | Contract Summary — orvex-studio-console (Wave 3 Definition Pack) | canonical | Console publishes ZERO OpenAPI (D-CT5, repo-private BFF API); consumes workflows-proxy which IS pinned+frozen at v0.1.3 (5 ops); admin-plane contracts it fronts (identity/billing/ai/knowledge) are present but still x-status:draft; console's ONE produced CloudEvent (`console.audit.record`) is non-taxonomy and self-inconsistent with its own gen/ constant (MR-C3, sharpest finding) |
| OkqxIlMGlD | Per-agent Build Prompt — orvex-studio-console (Wave 3 Definition Pack) | canonical | Build-agent instructions for a MATURE-DEPLOYED service (not scaffold); 6 named "traps" (Hollow-Healthy no /readyz, 0-stubs≠works, green≠works, workflows-proxy IS chartered not un-chartered, audit type unfrozen, cmd/server vs cmd/console naming drift); 36 stories ENG-2579..2614 census; 9 MR items agents may not decide |
| U0M9YqGPdb | SDD — orvex-studio-console (Wave 3 Definition Pack) | canonical | The total service-level Done list; mechanical totality check (10 internal/ pkgs, 8 web/src dirs, all present); full 26-route API surface with ticked/unticked done-boxes; 14 cell-contract rules assessed (2 evidenced, 2 N/A, 10 owed); anti-fake-done clause naming Hollow-Healthy as the #1 vector for this service |
| AwD2Fn7rIt | Test Plan — orvex-studio-console (Wave 3 Definition Pack) | canonical | 5 test tiers + UI "looks good AND works" bar; CS §5 dependency-category assignment table (Row1/3/4) fixed per dependency; 120 Go test funcs / 14 vitest specs / 74.3% coverage measured; Tier 3 contract tests SATISFIABLE now for workflows-proxy, BLOCKED for draft admin-plane ops and the unfrozen audit type; UI "looks good" dimension is 1-2/6 wired (no Playwright/axe/visual/dual-theme/design-token) |
| EJ5L3wIepg | PRD-delta — orvex-studio-console (Wave 3 Definition Pack) | canonical | Reconciles the umbrella brief against canon AND the deployed artifact (deployed-artifact-wins doctrine); corrects the canon's stale "un-chartered" claim about workflows-proxy (FR-CN-D3); records 5 artifact-findings incl. an audit read-model divergence from canon and the unfrozen non-taxonomy CloudEvent type; 9 MUST-RESOLVE items surfaced, none decided by the pack |
| kldiZu93EC | PRD: orvex-studio-console | canonical | Founding charter (renamed from orvex-studio-control 2026-07-05); F1 observability read plane + F2 admin ops (compose-never-own); RBAC floor closed at 2 roles (R26c); audit ownership moved OUT to a dedicated orvex-studio-audit service (R25/ADR-0037); billing owns entitlement/cap value (D-P3/C3 re-point), console only displays/fronts |
| TYWAtnvliD | PRD Addendum — User-Behavior Analytics | draft | FR-CT-UBA-1..12 requirement set for the PostHog pane; audience broadens to product+marketing+sales staff (still internal-only, non-tenant-facing); session replay + web/marketing analytics added; k-anonymity floor RATIFIED at k=5 (R26e); many OQ-UBA-* items still open |
| I0ifbcSaTZ | ZZ-TEMP-CONVERT-console-arch-DELETE | archived | Superseded/archived prior draft revision of the architecture page (pre-tightening state, "draft" status carried over); safe to ignore — the canonical L1NVnmRgpy supersedes it |

## 2. Deeper summaries — load-bearing pages

### PRD: orvex-studio-console (kldiZu93EC) — canonical, founding charter
- Console = ops pane over LGTM (Loki/Mimir/Tempo) + Temporal visibility, PLUS cross-satellite admin
  (org/tenant, tokens, reindex, workflow retry/cancel/signal, audit browse). Human operators only
  (Clerk admin-org); explicitly NOT a programmatic/agent-facing API — "agents and scripts use the
  satellites' own contracts-authored APIs."
- Console composes and renders; owns NO domain state/decision (D-CT2). BFF creep (implementing a
  mutation IN console instead of delegating) is the named standing failure mode (G4/blast-radius).
- RBAC floor CLOSED (R26c, 2026-07-16): 2 roles — READ-ONLY (default, all reads) and
  OPERATOR/ADMIN (all F2 mutations, gated behind fresh introspection + typed confirmation). Finer
  per-tenant/per-satellite scoping remains OQ-CT3 (not gating).
- Entitlement/cap ownership: billing is the plan→entitlement→AI-spend-cap SoR (D-P3, the 2026-07-05
  C3 ruling superseded ai as owner); ai reads+enforces via LiteLLM `max_budget`; console only
  displays + fronts the SET surface at billing.
- Audit: console EMITS admin-action audit events onto the family Kafka spine (studio-spine) and
  reads back via a **dedicated orvex-studio-audit service**'s query API (R25/ADR-0037, ENG-2815/16)
  — console owns NO audit storage/WORM table/read-model itself. This directly matches the user's
  MEMORY note "audit-service PRD canonical."
- Credential separation (D-CT6/FR-CT16): operator-token pass-through on every satellite admin call;
  no elevated/standing credential on a mutation path (the wiki-api FR-A16 lesson explicitly cited).
  Standing creds exist ONLY for backends that can't verify identity tokens (LGTM) — Temporal has
  NO credential at all (routed via the workflows authorizing proxy, D-CTRL).
- Rollout: Phase 1 (read-only pane) → Phase 2 (admin reads) → Phase 3 (admin writes, gated on RBAC
  + audit-durability + authorizing-proxy) → Phase 4 (break-glass).

### Architecture: orvex-studio-console (L1NVnmRgpy) — canonical
- Single Go binary: BFF (fans out to LGTM + workflows-proxy + satellite admin APIs) + embedded
  React/shadcn SPA (go:embed, one origin, strict CSP, no Node runtime in prod).
- A-EDGE: the BFF is a hard privilege boundary because LGTM cannot verify identity-minted tokens.
  Deny-by-default `lib/auth` router; RequireFresh on every mutation; LGTM creds are read-only and
  package-confined (enforced by a bespoke build-tag/lint gate).
- D-CTRL: Temporal handled by REMOVAL not confinement — console holds zero Temporal credentials;
  all reads/writes go through a thin authorizing proxy in orvex-studio-workflows.
- A-STATE: stateless, Redis-only; no Postgres/Mongo. Canon contradicts this (lists "Postgres,
  Redis") — flagged as an unresolved canon-vs-space contradiction, human-reconciliation only.
- Cell-contract §3a: console is NOT on the rule-14 global-singleton allowlist, yet NFR-CT6 wants one
  pane spanning multiple cells — an open, ADR-mandatory conflict (OQ-CT4).
- Six-tier CS §6 internal/ model laid out explicitly (handler/workflow/domain/store/event/ports).
- Multiple ADRs named as owed but never filed (D-CTRL, A-FRONTEND/D-CT1 go:embed, D-CT5 BFF-private,
  A-BREAKGLASS, OQ-CT4 resolution) — general lesson: architecture decisions accumulate un-filed ADR
  debt even in a canonical, ratified page.

### Contract Summary (1YS71L9neD) — canonical, ENG-2106
- Console AUTHORS zero OpenAPI (D-CT5) — its BFF↔SPA API is deliberately repo-private, never a
  contracts artifact. Relevant precedent for the AI-surfaces redo: a BFF-shaped service can
  legitimately have NO contracts-authored surface at all, as long as everything it CONSUMES is
  cited at a named ref/tag.
- Its one CONSUMED, pinned contract (workflows-proxy, 5 ops, frozen at tag v0.1.3) is fully wired
  end-to-end across 3 repos (contract → console client → workflows server → deployed Service).
- Its admin-plane consumed contracts (identity/billing/ai/knowledge) are present at the latest
  released tag but still `x-status:draft` — i.e. released-but-unfrozen, a distinct honesty
  category from "not yet published."
- Its one PRODUCED CloudEvent type (`console.audit.record`) is non-taxonomy (violates ADR-0010
  `studio.*` grammar) AND the codebase disagrees with itself (a conformant constant exists in
  gen/events.go but is unused by the actual producer) — flagged MR-C3, the pack's sharpest finding.
  ADR-0037 stands up the audit-service consumer of this event but does NOT itself freeze the type.

### PRD-delta / SDD / Build Prompt / Test Plan (Wave 3 Definition Pack, all canonical, ENG-2106, 2026-07-15)
These four form one coherent "deployed-artifact-wins" reconciliation pass, methodologically
important beyond console itself:
- **Reconciliation base = the live deployed artifact, not canon or the ticket** — measured this
  session, with exact git refs/commands. Canon UNDERSTATES maturity (README said "scaffold"; repo
  is fully built+deployed, 0 stub routes, 26 real routes, 74.3% coverage) AND OVERSTATES one seam's
  openness (canon called workflows-proxy "un-chartered"; it's pinned+built+wired — FR-CN-D3).
- **Hollow-Healthy** is named the #1 fake-done vector for THIS service: `/healthz` echoes cell
  identity and consults NO backend; there is no `/readyz`; ArgoCD "Healthy" therefore proves only
  that the pod serves the mux, nothing about LGTM/proxy/sibling reachability.
- **"0 stub routes" ≠ "works"**: a guardedRoute legally returns 401/502 (deny-by-default / sibling
  down) — that's a passing test, not evidence of a real end-to-end round-trip. Only a human-observed
  probe with a real operator token counts as delivered (Phase-1 done bar).
- **CS §5 dependency-category table** (Test Plan §2) is presented as FIXED, not negotiable, per
  dependency — a reusable pattern: Row 1 in-process (never mock own packages, ❌#4), Row 3
  remote-but-owned (port + golden-fixture/replayed-real-response fake), Row 4 true-external (replay
  a committed real response, hand-authoring is a defect). LGTM, though family-operated infra, is
  classified Row 3 but held to Row-4-grade fidelity (its response shapes are external
  Grafana/Prometheus contracts).
- **9 MUST-RESOLVE (MR) items**, explicitly not decidable by any build agent — architecture-level
  open questions surfaced and left open rather than silently resolved. This "surface a contest, do
  not quietly pick a side" discipline (echoed in the user's MEMORY "Full autonomy — judgment calls"
  and "Orchestrator prompt-fix hazards" notes) is a repeatable governance pattern worth carrying into
  the AI-surfaces redo's own PRD/architecture authoring.
- UI "looks good AND works" bar: explicitly partial (1-2 of 6 automated checks) even for a mature,
  deployed, green-CI service — a concrete instance of the user's MEMORY "Delivered = looks good AND
  works" doctrine.

### Architecture: User-Behavior Analytics (Ii9q9kBNms, draft) + PRD Addendum (TYWAtnvliD, draft)
- New pane, NOT the observability pane — answers "how are users behaving / what is GTM doing."
  Audience broadens beyond product to growth/marketing/sales, still internal-staff-only via Clerk
  admin-org (never tenant-facing — hard non-goal boundary preserved).
- Store DECIDED: PostHog Cloud EU (Frankfurt, eu-central-1 — exact regional match to Orvex's cell),
  an external managed DATA PROCESSOR under signed DPA (Orvex = controller). Self-hosting PostHog was
  rejected as a real option (Helm/K8s self-host sunset May 2023; hobby Docker-Compose deploy is
  unsupported at Orvex's scale).
- Two separated ingestion paths into ONE PostHog project: (a) server-side CloudEvent→PostHog bridge
  (a NEW spine consumer, pseudonymises to a per-tenant-salted distinct_id, ID-only properties,
  consent-gated, fail-closed) and (b) client-side posthog-js SDK embedded in frontends — INCLUDING
  the AGPL orvex-wiki React client — for session replay + web analytics. Embedding a new MIT
  dependency in the AGPL engine client is flagged as its own ADR-worthy decision (like ADR-0017
  @clerk/react precedent).
- Session replay is the most privacy-sensitive surface: consent-FIRST (no recording before consent),
  content DOM block-listed by default (not just input-masked) — the wiki editor/prose body is
  configured as an rrweb block-selector region by default.
- k-anonymity floor RATIFIED at k=5 (R26e, 2026-07-16) for any rendered cohort cell, enforced either
  BFF-side (query outcome) or IaC-pinned at the PostHog project level (embed outcome).
- Bridge ownership (OQ-UBA-1b) is explicitly undecided: a small dedicated bridge service vs a
  knowledge-owned module — console is explicitly NEVER the bridge (would violate its stateless,
  never-a-spine-publisher-for-another-domain charter).
- Entirely pre-launch: every chart in the arch page is labelled illustrative/synthetic sample data.

## 3. Bindings on the AI-surfaces redo (MCP / wiki-api / CLI)

These are the commitments in this space that constrain or inform the MCP/API/CLI PRD-architecture
redo. Console is a CONSUMER of wiki-api/engine surfaces, not a peer AI-facing surface, but several
family-wide patterns and explicit prohibitions bind directly:

- **Layering discipline, directly on-point for wiki-api/MCP**: FR-CT16/D-CT6 state the rule the
  user's MEMORY "New vision — no legacy/shortcuts" already captures — "no elevated credential on a
  user-driven mutation path... composition adds a gate, never removes one." Any admin/operator call
  console makes into engine/wiki-api must pass the OPERATOR'S OWN token through, never a service
  credential with elevated scope. This is the wiki-api FR-A16 lesson, explicitly cited as
  precedent — the AI-surfaces redo should hold the same line for MCP/CLI calling into wiki-api.
- **Console is explicitly NOT the agent/programmatic surface.** PRD §1: "Programmatic/agent admin
  is NOT served here: agents and scripts use the satellites' own contracts-authored APIs." Console's
  BFF is repo-private (D-CT5) and will never appear as an MCP tool or CLI target — the AI-surfaces
  redo should not expect or design around any console-authored contract.
- **wiki-api / engine consumption**: console's F-QUOTA usage read-back (pages/bytes/files/members)
  comes from "the engine's F-QUOTA counters" and the engine's admin surfaces "as they gain
  identity-token auth" — implies wiki-api/engine is expected to expose identity-token-authenticated
  admin+quota surfaces that console fronts. If the AI-surfaces redo changes wiki-api's admin/quota
  shape, console's FR-CT12b pane is a downstream consumer to account for.
- **Contract discipline pattern to reuse**: the OBSERVED/PROPOSED split and the "consumer-pin
  summary vs producer-freeze" framing (Contract Summary doc) is a clean template for documenting
  what MCP/wiki-api/CLI consume vs produce, and at what tag/x-status. The MR-C3 finding (a service
  disagreeing with its own generated constant, non-taxonomy CloudEvent type) is a concrete
  cautionary case for CloudEvent-type discipline the AI-surfaces redo should watch for in its own
  event emissions.
- **Observability vocabulary (FR-C18 obs/CONVENTIONS.md)**: console keys all cross-signal
  correlation on this contracts-authored attribute vocabulary (service, tenant, cell, trace_id,
  workflow_id) and "hard-codes no satellite-specific label names." Any new MCP tool or wiki-api /v1
  endpoint should conform its OTel attributes to this same vocabulary so it surfaces correctly on
  console's health board and correlation pivots (FR-CT2, FR-CT4's per-satellite SLI table already
  names mcp: "per-tool latency/error, shim-overhead, golden-tape KPI" and wiki-api: "facade-overhead
  SLI" — FR-A19 — as expected SLIs console renders).
- **message-tracing-across-outbox gap (FR-CN-D2)**: named explicitly as a family-wide gap "console
  is the surface where it is SEEN" — when a message crosses an outbox→Kafka→consumer hop, trace
  context is dropped. This directly matches the user's MEMORY "Observability architecture" note
  ("message-tracing-across-outbox is the gap"). Relevant if MCP/wiki-api emit CloudEvents via
  outbox — trace continuity across that hop is a known unsolved seam, not console's to fix, but the
  AI-surfaces redo's own event emitters inherit the same gap.
- **CS §5 dependency-category discipline + Row-3/Row-4 fidelity rule** ("faked from committed
  fixtures / replayed real responses, never a hand-rolled guess") is directly reusable for how the
  MCP/wiki-api/CLI test plans should classify and fake their own upstream dependencies.
- **No fabricated staleness/openness claims** — the FR-CN-D3 "canon said un-chartered, it's actually
  pinned+built+wired" correction, and the MR-list "surface a contest, do not decide it" discipline,
  are governance patterns the AI-surfaces redo's own PRD/architecture authoring should follow:
  measure against the live deployed artifact, cite exact refs/commands, and route genuinely open
  architectural questions to an explicit MR/OQ list rather than silently picking a side.
- **RBAC floor precedent (R26c)**: a two-role (READ-ONLY / OPERATOR-ADMIN) floor, with fresh
  introspection + typed confirmation gating every mutation, is the closed family pattern for
  operator-facing admin surfaces — relevant if MCP/CLI ever expose admin-plane verbs, though today
  they explicitly do not (agents use satellites' own APIs, not console's).

## 4. Staleness flags

Claims in this space contradicted by newer pages, or by the known 2026-07-16/17 live state (MCP
live-green 19 tools on dev; wiki-api /v1 cutover done; streaming folded into existing tools per R21;
audit-service PRD canonical):

- **I0ifbcSaTZ (ZZ-TEMP-CONVERT-console-arch-DELETE)** is an archived, superseded pre-tightening
  draft of the architecture page — content is stale by construction (predates the 2026-07-05
  SE-Arch tightening); safe to ignore, canonical L1NVnmRgpy supersedes it. It still states "no audit
  Trigger — the family audit stream is not console-hosted" and "un-chartered" for workflows-proxy —
  both later corrected/superseded elsewhere in this space.
- **L1NVnmRgpy §1/§4 ("no audit-stream subscriber", "Omit... Triggers — no audit Trigger")** is
  flagged STALE by the PRD-delta (EJ5L3wIepg, ARTIFACT-FINDING 2 / MR-C-STALE-2): the DEPLOYED
  ARTIFACT actually runs a Knative Trigger push-consumer (`console-audit-trigger`) feeding an
  in-process audit read-model — a real architecture delta the canonical arch page has not caught up
  to. Human reconciliation owed, not yet done as of this sync.
- **L1NVnmRgpy §5/§7 call the workflows-proxy "a named but un-chartered workflows backlog item"** —
  explicitly stale per FR-CN-D3 (PRD-delta) and the Build Prompt's trap #4: the seam is pinned at
  contracts tag v0.1.3, consumed, served (a real 998-line proxy shipped ENG-2009), and wired live
  since 2026-07-12 (commit e4b7753). This is the single most concrete "canon/architecture text vs
  deployed reality" gap found in the space — a strong instance of the user's MEMORY "Certified ≠
  current" lesson.
- **Family canon (CxjFpIVUZY) lists console's Data as "Postgres, Redis"** — contradicted by both the
  arch (A-STATE, Redis-only) and the deployed artifact (deploy manifests carry only redis-claim.yaml,
  no Postgres/Mongo). Flagged repeatedly (SE-Arch F3, MR-C6) as a human-owed canon-row fix; still
  unresolved as of the pack's 2026-07-15 authoring and not corrected in this synced mirror.
- **README "Status: scaffold"** for the console repo is stated as flatly false/stale — the repo is
  fully built and deployed (36 stories all in Todo/blockedBy state notwithstanding — most of them
  are VERIFY+harden on already-shipped code, not from-zero build work). This is a caution that repo
  self-description (README, ticket bodies) systematically understates maturity in this program, per
  the PRD-delta's "binding lesson 4."
- **Audit ownership is mid-migration, not fully cut over**: PRD/arch here already point at the
  dedicated orvex-studio-audit service (R25/ADR-0037, matching the user's MEMORY "audit-service PRD
  canonical") as the eventual sink/read-API, but the SDD/Test-Plan/Build-Prompt (2026-07-15) still
  describe the CURRENT deployed producer as emitting a non-taxonomy, self-inconsistent
  `console.audit.record` type (MR-C3) into an in-process, non-durable browse buffer — i.e. the
  audit-service PRD is canonical in name/decision but NOT yet wired into console's actual producer/
  consumer as of this sync. Do not read "ADR-0037 ratified" as "console's audit path is migrated."
- **No direct contradiction found with the 2026-07-16/17 MCP-live-green-19-tools / wiki-api-v1-cutover
  / R21-streaming-folded-in facts** — this space does not make claims about MCP tool count, wiki-api
  versioning, or streaming architecture at all (console only names mcp/wiki-api as SLI sources on its
  health board, FR-CT4/FR-M18/FR-A19), so there is nothing here to reconcile against those facts;
  flagging their absence rather than a contradiction.
