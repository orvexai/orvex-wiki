# orvexstudioarch — Discovery Digest

## 1. Mandate

`orvexstudioarch` is the **family canon root** for Orvex Studio: the shared, cross-service architecture, principles, ADRs, delivery program, and doc-governance rules that every satellite service and the AGPL wiki engine must conform to. Per-service PRDs/architecture live in each service's own space — this space holds only what is cross-cutting ("There is no single Studio PRD"). Core framing (from *Orvex Studio — Architecture & Principles*, canonical): "Orvex is a family of small, closed Go services around a thin open-source wiki engine (orvex-wiki, a Docmost fork, AGPL), integrated through a Kafka event spine and a pinned contract seam." Ten numbered Principles (primitives-stay-in/brains-move-out, events-as-integration-surface via CloudEvents on Kafka broker `studio-spine`, contract-first single seam in `orvex-studio-contracts`, one IdP-agnostic auth spine, one datastore doctrine, one Temporal home, workload-shape-by-role, fail-closed, multi-publisher/consumer, closed-code-never-imports-AGPL) anchor everything else.

## 2. Inventory

- Orvex Studio — Architecture & Principles (canonical) — family canon root
- Decision Records — Orvex Studio (canonical) — parent of 32 ADRs (ADR-0001…0032, all canonical except ADR-0032 draft/proposed)
- Decision Records [older] (superseded)
- Delivery Overview — Orvex Studio (canonical) — live Linear-driven dashboard
- Milestone Dashboard — Template (canonical)
- 14 Milestone pages M0–M14 (all **draft**, except none canonical) — M0 Contracts Seam Frozen, M1 Shared Lib Spine, M2 Identity GA, M3 Workflows Control Plane, M4 Billing SoR, M5 Knowledge Backbone, M6 Engine Event Spine, M7 Wiki API Composition Tier, M8 AI Brain, M9 MCP Gateway Repoint, M10 Studio BFF, M11 Studio SPA, M12 Platform CLI, M13 Console & Observability, M14 Launch
- Delivery Prompts (canonical) — parent of Issue Authoring Prompt (canonical), Orchestrator Prompt — Delivery (canonical), Orchestrator Prompt — Foundation (canonical)
- Deployment Status — What's Live Today (eu1) (**superseded**) — but content still the most concrete build-state snapshot available
- Doc Governance — Drift & Spec-Gate (canonical)
- Drift correction — Delivery Orchestrator prompt, Linear ground truth (2026-07-09) (canonical, self-flagged as containing stale superseded sub-sections)
- Index — Orvex Platform Canon (**draft**) — space map + family roster
- Architecture Audit — Family Rollup (2026-07-05) (canonical)
- Build Log — Studio Split Delivery (archived)
- Coding Standards (canonical) — binding CS 0–13
- Fork Change → Ticket Ledger (draft)
- Multi-Region Cells, Failover & the Day-1 Cell Contract (canonical)
- Questions for Daniel — Studio Reframe Autonomous Run (archived)
- SE Architect — Review Agent (canonical)
- URL, Environment & Multi-Region Scheme (canonical)
- PRD: Agent Staging Area — staged agent writes + the Librarian (**superseded**), with Architecture Spine: orvex-studio-staging (superseded) and PRD Addendum (superseded)
- PRD: Workgraph — cross-agent coordination service (**superseded**), with Architecture Spine: orvex-studio-workgraph (superseded) and PRD Addendum (superseded)
- Studio Family Foundation Rollup (2026-07-06) (draft)
- Crew Environments — Per-Developer Stacks (draft)
- ZZZ Publish Path Test (delete me) (archived — junk)

## 3. Decided vs draft

**Canonical / locked:**
- The 10 architecture Principles and "Standalone deployment" ruling (Ruling 5: no absent-satellite degradation path).
- 31 of 32 ADRs are canonical (tenancy polymorphism, wiki URL scheme, frozen 402 QUOTA_EXCEEDED contract, CloudEvent envelope + `studio.*` taxonomy, dual-IdP auth exchange, Turbopuffer as knowledge store, identity-owned tenancy DB, distributed tracing, MCP cell-discovery routing, wiki-api caller-token pass-through, DeprovisionWorkflow ownership, Agent Staging Area / Workgraph supersession decisions, `studio.staging.*`/`studio.workgraph.*` event subdomains, MCP identity edge-verifier cutover, cell-routing claim vocabulary).
- Doc Governance (drift + spec-gate ownership) is canonical, ratified 2026-07-08.
- Architecture Audit Family Rollup is canonical (ratified 2026-07-06): "Zero passed clean... Three contradict canon (orvex-cli, orvex-studio-mcp, orvex-studio-lib)... Twenty-one HIGH findings."
- Linear scope of record is locked: Initiative "Orvex Studio" (UUID `ddeb5b07-...`), exactly 15 member projects, initiative-scoped sync — "the old project/allowlist model... was retired 2026-07-09."

**Still draft / in flux:**
- ADR-0032 (in-fork /mcp decommission) is draft/proposed, not yet ratified.
- All 14 Milestone (M0–M14) pages are status: draft — the delivery roadmap itself is not yet canonical page-by-page even though the Delivery Overview parent is canonical.
- Index — Orvex Platform Canon is draft (a map page, low risk).
- Both major service PRDs found in this space (Agent Staging Area, Workgraph) are **superseded** here — they moved out to become ADR-0024/0025-governed decisions and now live as full services with their own canon elsewhere; this space just carries historical/decision residue.
- Studio Family Foundation Rollup is draft, and self-corrects itself inline (an "Operator correction" noting the original synthesis undercounted foundationed repos: "Net: 11 repos foundationed, not 10").
- Fork Change → Ticket Ledger and Crew Environments are draft, working documents.

## 4. API/contract surface

- Contracts are explicitly NOT authored here: "Cross-repo agreements — OpenAPI, the CloudEvent catalog (thin/rich envelope profiles), the SSE wire contract, the source-adapter contract, the principal/token-scope/role schemas — are authored in orvex-studio-contracts (Apache-2.0), never generated from AGPL code." This space only carries the ADRs that gate/shape that seam.
- ADR-0007 fixes the CloudEvent envelope for `studio-spine`; ADR-0010 fixes the `studio.*` type taxonomy; ADR-0026/0027 extend it with `studio.staging.*` and `studio.workgraph.*` subdomains.
- ADR-0003/ADR-0028 freeze the cross-service 402 QUOTA_EXCEEDED error contract and its vocabulary extension for staging/workgraph.
- ADR-0008 governs contracts change-authority: "fully automated: agents author and evolve the contracts and the engine allow-list, and CI drift-gates plus the AGPL import-guard are the only police — there is no human ratify step."
- ADR-0021 (wiki-api caller-token pass-through), ADR-0009 (auth exchange→session mint contract), ADR-0013/ADR-0020/ADR-0029 (MCP gateway consumption, cell-discovery routing, identity edge-verifier cutover) are the maturest contract-adjacent decisions — all canonical.
- Per the Deployment Status page (superseded but factual): `orvex-studio-mcp` "calls the engine's `/api/orvex/*` directly today; the repoint to `wiki-api` waits on identity-minted tokens" — i.e. the real contract seam is not yet load-bearing in production traffic.
- ADR-0032 (draft) would retire the in-fork `/mcp` transport entirely once REST-gap parity is reached — contract surface still moving.

## 5. Delivery state

- Deployment Status (superseded, 2026-07-12 sync) is the clearest BUILT-vs-planned signal: **"Only two services carry real code; the rest are scaffolds."** orvex-wiki itself: "LIVE but vanilla — Docmost v0.95.0, single-workspace, no `orvex/` code, emits zero events." orvex-studio-mcp: real code, ~19/73 tools. orvex-studio-workflows: real code, tested Clerk provision/deprovision bridge. wiki-api: "Phase-0 byte-compatible proxy... composition logic is still a scaffold." identity/ai/billing/knowledge/console: scaffold, `healthz`+501 handlers, placeholder images. `orvex-cli`: empty repo. Turbopuffer: provisioned, index not built.
- Architecture Audit Rollup (canonical): 14 services reviewed, zero clean, 21 HIGH findings, "day-1 cell contract is unhonored in ~13 of 14 services," and prior to the audit "no service has filed a single ADR" (since remedied — 32 ADRs now exist).
- Studio Family Foundation Rollup (draft): per-repo M1–M8 foundation-stage table; most repos "done" across stages with scattered "part" (partial) cells; a cross-cutting blocker is called out: the shared `orvex-studio-lib/pkg/auth.MultiIssuerVerifier.Verify` is "still... a deny-by-default stub" even though identity's own dual-IdP verifier is real and tested ("M7: REAL dual-IdP verifier (crown jewel)... `go test ./internal/token/...` green"). All foundation work was "committed LOCALLY on each repo's branch; nothing is pushed" as of that rollup.
- Delivery Overview flags a live tooling gap, not a product gap: an initiative-scoped Linear status-rollup chart "could not be authored — docmost-cli page block linear_graph returns a server-side HTTP 500 on ANY --filter," filed as a platform blocker.
- Milestone gate discipline is explicit and strict: "Every milestone has a closing-gate issue... Red = not done; there is no human override of a red gate."

## 6. Gaps & tensions

- **Spec-gate dropped**: Doc Governance page states spec-gate "DROPPED for now; it ships with Linear... no ratify-gate write refusal fires today" — a known governance hole, rebuildable via "text-only story-id matching," not yet done.
- **Exact wave composition TBD**: Delivery Overview roadmap table only shows Wave 0–A entries with "Exact wave composition: TBD — set during the Studio Act-1 run" — the full dependency-wave plan is incomplete on the canonical page itself.
- **Linear Initiative field TBD**: Delivery Overview says "Initiative: TBD — set during the Studio Act-1 run" even though a later page (drift-correction) locks the initiative UUID — mild staleness/contradiction between pages, self-flagged.
- **Self-superseding provenance pages**: The 2026-07-09 drift-correction page states its own "Correction 1" and "Correction 2" are now "stale narrative, retained as-written for the historical record, not current fact" — readers must chase forward to `gkkUDzn277` for ground truth; a live footgun for any digest that stops at this page.
- **PRD churn**: Both non-trivial product PRDs found here (Agent Staging Area, Workgraph) are superseded-in-place by ADRs (0024/0025) that promoted them into full services — this space is now a historical waypoint, not where their canon lives; a naive read would treat them as live.
- **Auth-verifier gap**: shared `MultiIssuerVerifier.Verify` deny-by-default stub is called out as the one concrete cross-cutting code gap blocking M7 completion across multiple Go services.
- **Junk page**: "ZZZ Publish Path Test (delete me)" still present, archived but unswept.
