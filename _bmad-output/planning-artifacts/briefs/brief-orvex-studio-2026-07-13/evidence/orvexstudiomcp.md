# orvexstudiomcp — Evidence Digest

## 1. Mandate

orvex-studio-mcp is the family's **thin, stateless TypeScript MCP protocol gateway** — translating MCP (Streamable-HTTP `/mcp` + stdio) onto the wiki's verb grammar via a typed client codegen'd from contracts. It is **already built and deployed on dev** (`dev-mcp.studio.orvex.ai`). Post-split it has exactly three upstreams: **orvex-wiki-api** (wiki verbs), **orvex-studio-ai** (ask/chat/inline/generate — owns the full cited-ask loop), and **orvex-studio-identity** (token verification, dual-IdP). It holds no DB, runs no worker, mints no tokens, and does no business logic (retrieval/ranking/citation/serialization/ACL) — "protocol translation and nothing else." This revision is a **repoint**, not a build.

## 2. Inventory

- ADR 0001 — MCP /v1 client regeneration + ask→ai upstream (contracts-pinned) (draft)
- Architecture: orvex-studio-mcp (post-split) (canonical)
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical, evidence record)
- Docmost Server Requirements for the Orvex Studio MCP (draft)
- Orvex Studio MCP — Brainstorm Canon (draft)
- Orvex Studio MCP — Deploy & Secret-Wiring Runbook (act-as-user model) (draft)
- Orvex Studio MCP — Three-Repo System Runbook (draft)
- PRD: orvex-studio-mcp (post-split repoint) (canonical)
- Studio ↔ MCP Contract (draft)
- Thin Orvex Studio MCP — Build Plan (draft)
- Wiki & Knowledge-Base MCP Servers — Technical Research (draft)

## 3. Decided vs draft

**Canonical / locked:**
- Architecture + PRD pages are canonical, ratified 2026-07-06 (batch approval), reconciled against family canon `CxjFpIVUZY`, `JGAUQRsw2g`, `86CiGucQwU`.
- D-M1 (stays TypeScript — the family's one deliberate TS satellite), D-M2 (wiki verbs only via wiki-api, no MCP-direct engine), D-M7 (`ask` final upstream is **ai**, resolving OQ-M7), D-S13 (revocation transport = identity's transactional-outbox relay, no Redis→Kafka bridge — corrects a prior draft error), D-S11 (Linear removed, not dormant — `resource_type` stripped from tool schemas).
- **OD-6 RESOLVED by ADR-0013** (2026-07-08, PO ruling): revocation subscriber is a raw in-process Kafka consumer — an explicit, canon-tier-sanctioned exception to canon Principle 2 (which mandates Knative Trigger).
- **OD-7 RESOLVED (PO ruling 9, 2026-07-08):** reconciled in favor of canon roster `CxjFpIVUZY` — MCP reaches knowledge **directly** for search/RAG (not only via wiki-api), plus ai's ask loop, per PRD §D-M8/ENG-1403.

**Still draft / open (OD-2 through OD-5):**
- OD-2 — flat-host (`mcp.orvex.ai`) vs per-cell routing for `/mcp`: no Cloudflare-Worker-style cell-proxy equivalent described (SPA has one via JWT `cell` claim; MCP does not). **Open.**
- OD-3 — TS verifier-binding packaging (in-repo vs published) + audience model (OQ-M2); must land in contracts before conformance vectors mean anything.
- OD-4 — `studio_*` seam home (OQ-M1): pin/re-home/cut before R2 (NFR-C4 makes it cutover-blocking).
- OD-5 — `ask` final upstream resolved to ai, but sequencing queues behind ai shipping.
- Four proposed ADRs (0001–0004) not yet filed as a Decision Records page: revocation subscription mechanism (family tier), identity-as-sole-authority, three-upstream repoint, MCP internal tier model.

## 4. API/contract surface

- No local OpenAPI spec of its own; the MCP **consumes** the `orvex-wiki-api` OpenAPI (`openapi/wiki-api.yaml`) via codegen. Currently generated from the **engine's live 322-path descriptor** (transitional; canon P3 forbids AGPL-derived codegen — demoted to internal at R2).
- Tool surface (shipped, ~19 tools): `whoami, ask, search, get_page, save_page, edit, get_neighborhood, get_space_tree, get_changes, related_pages, list_tools` + 6 `studio_*` tools (`marketplace_search, skill_get, memory_get/save, library_list/save, librarian_session, comment_post`) + static resource `orvex://authoring-guide`.
- CAS `ifVersion` → `409 VERSION_MISMATCH`; `402 QUOTA_EXCEEDED` passed through verbatim; RATIFY/CONFIRM tokens transported opaque, never minted/parsed.
- Contracts freeze (FR-C19) triggers **one deliberate regeneration** onto `/v1` — retiring the live-descriptor codegen flow; this is R2, not yet reached.
- Golden-tape KPI harness: ≤ 2 calls / ≤ ~1k tokens per common task (NFR-M6) — the regression/parity detector, currently run against **live dev Docmost backstage** (CS §5 wants committed fixtures — named tech debt).
- Decommission target: in-fork `packages/orvex-mcp` has **73 tools** (verified 2026-07-05) vs standalone gateway's **~19 live**; FR-C5 REST-gap ledger dispositions each as route-or-retire; in-fork `/mcp` deletes only at full parity.

## 5. Delivery state

- **Built and deployed on dev**, real code not scaffold: Phases 0–3 shipped, full GitOps (ArgoCD/Kustomize/Harbor/Tekton, ESO), vitest suite + golden-tape harness, hardened pod security posture.
- **Code is pre-repoint** (honesty ledger, explicit): single `DOCMOST_BASE_URL` upstream, Studio-BFF auth holding `MCP_SERVICE_TOKEN`, client codegen'd from engine's live AGPL descriptor — none of this is the target state yet.
- **No prod MCP exists.** Prod requires R1 (real tokens via identity) + R2 (frozen contract).
- **First true three-repo E2E has never run end-to-end** ("may require changes to all three repos") — this is the R1 gate (runbook `CIemV9m0eb`).
- Deploy runbook (`lRERyG7Zpj`) status as of writing: "code is built, reviewed, tested, committed, and pushed — but NOT deployed. The running crew services are older builds."
- Day-1 cell contract (`CELL_ID`, `/healthz` echo, `orvexcell` fail-closed check, cell-scoped topic) — **none honored in deployed manifests today**; named deploy delta, tolerable at single-cell but load-bearing before a second cell.
- Two live code defects flagged (read-only, not fixed here): stale README still lists `DOCMOST_SERVICE_TOKEN` as required (removed firehose key); `session.ts` cache-eviction key mismatch.
- `src/server/tools.ts` is 2827 lines — CS §8 smell, un-split; makes the "thin" claim currently unenforceable (target tier model proposed as ADR-0004, not filed).

## 6. Gaps & tensions

- **CS gives no tier model** for a TypeScript non-engine service — leaves the A-SHIM "there is no other layer" claim unverifiable until ADR-0004 files.
- **OD-2 flat-host vs per-cell routing** for `/mcp` is unresolved — no cell-proxy mechanism described, unlike the SPA's Worker-based equivalent.
- **`studio_*` seam (OD-4/OQ-M1)** is an unpinned surface contracts doesn't know about — cutover-blocking per NFR-C4, not yet resolved.
- **Revocation-consumer liveness is a fake-green risk**: `/health` is liveness-only; a dead/lagging Kafka consumer wouldn't show unhealthy without the proposed lag SLI.
- **`ask` repoint queues behind ai** shipping (D-M7/OD-5) — rides the byte-compatible facade meanwhile.
- Sequencing risk: MCP's own build scope is near-zero but it queues behind four other repos (wiki-api, identity, contracts, ai) for R0/R1/R2 exits.
- ADR-0001–0004 proposed but **not yet filed** as a Decision Records page in this space.
- Architecture Audit verdict: **"contradicts-canon"** on one load-bearing point at review time (now resolved via ADR-0013), plus the OD-7 roster divergence (now also resolved) — audit page itself flagged as high-quality/honest but shows canon drift is a recurring failure mode here.
