# Linear Ticket Census — AI-Facing Surfaces (orvex-wiki-api / orvex-studio-mcp / orvex-cli) + orvex-wiki Engine Reference

**Source:** LOCAL CACHE ONLY — `/home/daniel/repos/orvex-wiki/.cache/linear/`
- `initiative.json` (synced 2026-07-16T11:36:00Z) — project-of-record for all 1024 cached ENG issues (used to resolve project membership; individual issue yamls carry no `project` field)
- `issues/*.yaml` (1006 files) — title/status/milestone/description per issue
- `work-status.yaml` / `milestone-map.md` — milestone-name decode, but ONLY for the `orvex-wiki` project's 9 "Legs" milestones (28 issues); all other projects' milestones are UUID-only in cache, labelled `MS-<uuid8>` below
- No network calls were made. `initiative.json` lists 1024 issues total but only 1006 have a cached per-issue yaml; 1 gap found in the 4 projects below (ENG-1512, Orvex CLI, Done, no yaml file cached — title/milestone unknown from local cache).

**Program context this census is read against** (per orchestrator brief + memory):
- Track 1 = feature parity with the docmost fork/docmost-cli; Track 2 = fresh AI-first redesign of API/MCP/CLI, each on its own /v1-cut, microservice-first surface.
- Linear integration is **dropped entirely** from the product (strip from plans) — this repo's own Linear cache is tooling, not a product feature.
- `orvex-studio-mcp` is **live on dev** at `mcp.orvex.dev` with a certified 19-tool surface (amazing-MCP mandate; memory: `amazing-mcp-delivered-live`, `certified-is-not-current`). R21: streaming is folded into the 19-tool design verbs, not separate tools.
- Current branch here (`fix/internal-export-title-space`) just shipped `feat(internal-api): return title + space slug + slug_id on /internal/pages/{id}/export` (commit b2f60c22) — engine-side, TypeScript, not the Go wiki-api.

---

## 1. Project Totals

| Project (Linear) | Maps to | Done | In Progress | Todo | Backlog | Canceled | Duplicate | Total |
|---|---|---|---|---|---|---|---|---|
| Orvex Wiki API | `orvex-wiki-api` (Go /v1 composition tier) | 19 | 1 | 36 | 1 | 0 | 0 | 57 |
| Orvex Studio MCP | `orvex-studio-mcp` (intent-verb MCP server) | 11 | 0 | 32 | 0 | 0 | 0 | 43 |
| Orvex CLI | `orvex-cli` (successor to docmost-cli) | 19 | 0 | 37 | 0 | 1 | 0 | 57 (+1 uncached: ENG-1512, Done) |
| Orvex Wiki | engine reference (`~/repos/orvex-wiki`, thin AGPL fork) | 71 | 1 | 41 | 0 | 1 | 1 | 115 |
| **Sum (4 projects)** | | **120** | **2** | **146** | **1** | **2** | **1** | **272** |

Note: 13 other cached projects exist in the same initiative (`Orvex Studio AI` 73, `Orvex Studio UI` 67, `Orvex Studio API` 66, `Orvex Studio Knowledge` 63, `Orvex Studio Identity` 58, `Orvex Studio Console` 57, `Orvex Studio Contracts` 56, `Orvex Studio Billing` 52, `Orvex Studio Lib` 50, `Orvex Studio Workflows` 47, `Orvex Studio Extension` 47, `Orvex Studio — Delivery Gates` 42, `Orvex Studio Staging` 37, `Orvex Studio Workgraph` 36) — out of scope for this census per the brief, listed here only for total-population sanity (1024 initiative issues vs 1006 cached yaml files vs the 272 in the 4 projects below).

---

## 2. Orvex Wiki API (`Orvex Wiki API` project — Go /v1 composition tier)

19 Done / 1 In Progress / 36 Todo / 1 Backlog = 57.

**MS-bcb756e3** (`bcb756e3-0003-4491-aa08-80b54b200d0f`) — 17 issues

| Issue | Title | State |
|---|---|---|
| ENG-1366 | Block-ID patch ops orchestration (create/patch/delete/batch/section) | Done |
| ENG-1367 | Response shaping + nav ergonomics (Redis content-handle) | Done |
| ENG-1368 | Studio verb grammar (get/search/list/save/edit) + bulk ops | Done |
| ENG-1370 | Programmatic page/history/export access surface (D-S16) | Done |
| ENG-1374 | Trustworthy write contract (typed errors + descriptor + CAS shaping) | Done |
| ENG-1461 | DfM fidelity/convert API (/v1/convert/*, check_dfm_fidelity) + import converters | Done |
| ENG-1462 | External-agent audit-write endpoint (WriteAuditDto) | Done |
| ENG-1463 | Amend doc-governance canon: spec-gate removed with Linear | Done |
| ENG-1464 | Drift-verify logic (verifyPage/getDrift/force-new-token) | Done |
| ENG-1465 | Per-type block handler registry (~25 types; Linear handlers dropped) | Done |
| ENG-1466 | Self-onboarding discovery front (capabilities/instructions) | Done |
| ENG-1467 | Server-side bulk page ops (non-Linear) | In Progress |
| ENG-1468 | Editable Excalidraw scene read endpoint (sidecar-fresh-or-rederive) | Done |
| ENG-1483 | Linear issue-create relay: platform-key filing, app-actor delegated to the SSO user | Done |
| ENG-1488 | Token pass-through to engine + knowledge (scope-intersection preserved) [NT-WIKIAPI-TOKEN-PASSTHROUGH] | Done |
| ENG-1582 | Docmost server 500s on milestone-filtered linear_graph embed writes (dashboards fall back to views-only) | Done |
| ENG-1969 | wiki-api Phase-1: mount the /v1 verb Dispatcher into the deployed cmd/wikiapi router (retire the Phase-0 501 facade) so /v1 serves real content | Done |

**(no milestone)** (`none`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-1628 | Contracts: expose page move + history-enumeration + user-data-export in the wiki-api verb grammar (ADR-0008) | Done |
| ENG-1934 | ENG-1367 follow-up — title/nl locator resolution (engine primitive or disambiguation-contract ruling) | Done |
| ENG-1959 | wiki-api content-health endpoints (links/lint/orphans/render) — backend for orvex-cli verify verbs (ENG-1556 AC3 carve-out) | Done |
| ENG-2082 | [DEFECT][P2] wiki-api KNOWLEDGE_URL (and AI_URL) point to NXDOMAIN hosts — GET /v1/search returns 502 UPSTREAM_UNAVAILABLE in prod | Backlog |
| ENG-2804 | [canon] PRD 8jAiCBifDW FR-A4 still claims engine title/NL resolver primitives that ENG-1934 ruled permanently nonexistent | Todo |

**MS-01de44e2** (`01de44e2-3ce1-4bbd-8ab3-df9581246c89`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2054 | [DEFECT][P1] Single-host ingress does not hide the split — /api/ai + /mcp served by monolith, satellites on separate subdomains | Todo |

**MS-0200c87a** (`0200c87a-439f-43d4-b470-1d0e76041fd6`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2104 | [FACTORY] orvex-wiki-api — Service Definition Pack (Wave 3 delta) | Todo |

**MS-80106e52** (`80106e52-1eec-4813-a922-bc7c4086138d`) — 6 issues

| Issue | Title | State |
|---|---|---|
| ENG-2511 | [wiki-api] Go service skeleton, six-tier layout, config (CELL_ID/CLUSTER_NAME/upstreams) + /healthz | Todo |
| ENG-2512 | [wiki-api] Byte-compatible /api/orvex/* reverse proxy (surface a) | Todo |
| ENG-2513 | [wiki-api] Draft /v1 verb-grammar surface scaffold served alongside (surface b) | Todo |
| ENG-2514 | [wiki-api] Edge token verify via lib/auth + token pass-through + K4 interim posture | Todo |
| ENG-2515 | [wiki-api] No-authorization-decision propagation (401/403/404 verbatim, no existence oracles) | Todo |
| ENG-2516 | [wiki-api] Blocking CI bootstrap gates: test/gofmt/lint + no-AGPL-import guard + parity job | Todo |

**MS-3df3f303** (`3df3f303-8b7c-45f6-b3cc-7e747fb9e4e8`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2517 | [wiki-api] pkg/dfm DfM->ProseMirror-JSON conversion (clean-room, from schema+catalog) | Todo |
| ENG-2518 | [wiki-api] pkg/dfm ProseMirror->DfM reverse conversion vs shipped read-path renderer | Todo |
| ENG-2519 | [wiki-api] Opaque-node typed handles + byte-identical reattach from ifVersion base | Todo |
| ENG-2520 | [wiki-api] In-process embedding + /v1/convert/* + fidelity-check endpoints | Todo |
| ENG-2521 | [wiki-api] Golden-corpus CI parity gate (Go round-trip vs engine catalog + fixtures) | Todo |

**MS-eae1c68d** (`eae1c68d-84e8-4617-8e51-3fff5fc744bc`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2522 | [wiki-api] Verb dispatch search/get/save/edit/list over {resource_type,locator} (no ask verb) | Todo |
| ENG-2523 | [wiki-api] Locator resolution composing engine resolvers (url/slug/title/NL) | Todo |
| ENG-2524 | [wiki-api] Read ladder info->outline(token_estimate)->blocks/:id?format=dfm + ranged reads | Todo |
| ENG-2525 | [wiki-api] Structural nav: space tree, backlinks, breadcrumbs | Todo |
| ENG-2526 | [wiki-api] search/related/duplicates knowledge fronting + typed-error degradation | Todo |

**MS-a2f4b9f0** (`a2f4b9f0-4328-4d1a-b6a4-60ea02f4bff9`) — 6 issues

| Issue | Title | State |
|---|---|---|
| ENG-2527 | [wiki-api] DfM->apply-ops translation + anchor/heading resolution, single atomic apply-ops call | Todo |
| ENG-2528 | [wiki-api] CAS ifVersion->409 VERSION_MISMATCH + verified read-after-write receipt (incl block-authoring) | Todo |
| ENG-2529 | [wiki-api] Human-gated transport: needs_human_*, RATIFY/CONFIRM verbatim + Studio deep-link | Todo |
| ENG-2530 | [wiki-api] ai-origin write path through standard chokepoint (delegated token, no privilege) | Todo |
| ENG-2531 | [wiki-api] QUOTA_EXCEEDED 402 verbatim propagation, batch fails whole, upgrade deep-link | Todo |
| ENG-2532 | [wiki-api] Generic orvex_dashboard milestone-scoped dashboard-graph block (no linear_*) | Todo |

**MS-c8a63b5e** (`c8a63b5e-8893-4d08-b2be-0b37f2dea3e5`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-2533 | [wiki-api] One shaping layer: field projection, concise\|detailed, cursor pagination | Todo |
| ENG-2534 | [wiki-api] Body-offload: resource_link handles + token estimates, ACL-enforced deref | Todo |
| ENG-2535 | [wiki-api] Contracts-authored descriptor conformance + served /v1/openapi.json drift-gate + fail-loud | Todo |

**MS-b8765e76** (`b8765e76-305d-4041-a607-2ed48fb1934c`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-2536 | [wiki-api] Living-wiki drift verification (verifyPage/getDrift/force-new-token) + real drift metric | Todo |
| ENG-2537 | [wiki-api] Wiki-first spec-gate {satisfied,token,reason} + confirm/ratify transport, de-Linearized | Todo |
| ENG-2538 | [wiki-api] External-agent audit-write endpoint -> engine WORM sink | Todo |

**MS-2fafcbb8** (`2fafcbb8-a33f-41a5-af3e-f79a1520243a`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2539 | [wiki-api] Event-evicted Redis artifact cache + evict consumer + cell-fail-closed guard | Todo |
| ENG-2540 | [wiki-api] Observability: OTel traces + Prometheus metrics + per-verb & facade-overhead SLIs | Todo |
| ENG-2541 | [wiki-api] Health vs liveness split + dependency round-trip health surface + CLUSTER_NAME echo | Todo |
| ENG-2542 | [wiki-api] Latency budgets & benchmarks (facade/bulk/warm-cache/rebuild) + non-SSE upstream deadline | Todo |
| ENG-2543 | [wiki-api] Redaction-below-relocation-line parity test + standalone degradation posture | Todo |

---

## 3. Orvex Studio MCP (`Orvex Studio MCP` project — intent-verb MCP server, live at mcp.orvex.dev)

11 Done / 32 Todo = 43.

**MS-49ff9628** (`49ff9628-79ce-45f6-b071-6f223c043c36`) — 11 issues

| Issue | Title | State |
|---|---|---|
| ENG-1361 | SSRF-guarded url-fetch tool (DNS-rebind TOCTOU close) | Done |
| ENG-1401 | Global MCP entry resolution leg | Done |
| ENG-1402 | Amend MCP PRD: token.revoked via identity outbox->Kafka (no bridge) | Done |
| ENG-1403 | Amend MCP PRD: MCP queries knowledge directly | Done |
| ENG-1404 | MCP R0: repoint tool bodies to REST upstreams | Done |
| ENG-1405 | MCP R1: identity-minted bearer auth cutover | Done |
| ENG-1406 | MCP R2: regenerate against /v1 pinned contracts | Done |
| ENG-1407 | MCP R3: decommission in-fork /mcp at REST-gap parity + polish | Done |
| ENG-1496 | MCP transport-shell relocation into orvex-studio-mcp (AGPL-clean standalone scaffold) | Done |
| ENG-1499 | MCP golden-tape eval harness (<=2 calls / <=~1k tokens KPI) | Done |
| ENG-1500 | MCP edge scope-gate (FR-M12): deny-by-default token_scope gate | Done |

**MS-9abc0f43** (`9abc0f43-4417-4eb0-beac-100f20020c8b`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2102 | [FACTORY] orvex-studio-mcp — Service Definition Pack (Wave 3 delta) | Todo |

**MS-04b7062c** (`04b7062c-8690-4aee-84ed-39faff585eaf`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2449 | [mcp] Streamable-HTTP + stdio server core with connect-time instructions & authoring-guide resource | Todo |
| ENG-2450 | [mcp] Curated hero surface (≤~13 eager tools) + list_tools(category?) progressive disclosure | Todo |
| ENG-2451 | [mcp] whoami: verified principal + capability probe in one round-trip | Todo |
| ENG-2452 | [mcp] DfM-only agent contract: reject raw markdown, opaque-node handle passthrough | Todo |
| ENG-2801 | [mcp] Split tools.ts along the ADR-0004 tiers (registry/dispatch vs envelope-shaping) + file the unfiled ADR-0004 | Todo |

**MS-3a37ae84** (`3a37ae84-f002-4f41-870a-02594ac79ce7`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2453 | [mcp] get_page read ladder (info→outline→blocks) + locator ergonomics | Todo |
| ENG-2454 | [mcp] save_page/edit write chokepoint: CAS ifVersion→409, verified receipt, 402 QUOTA verbatim | Todo |
| ENG-2455 | [mcp] get_changes pull-based on the caller's scoped token (no SSE, no admin token) | Todo |
| ENG-2456 | [mcp] get_space_tree & get_neighborhood navigation shim | Todo |

**MS-662d3150** (`662d3150-70c7-4ebd-9a0e-b5999ed5b9c5`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2457 | [mcp] R0 wiki-api base-URL repoint: env rename + purge stale legacy hosts | Todo |
| ENG-2458 | [mcp] Contracts-tag codegen: fail-loud typed client + one deliberate /v1 regeneration | Todo |
| ENG-2459 | [mcp] ask → orvex-studio-ai upstream: resolveAsk routing, K5 passthrough, no fallback | Todo |
| ENG-2460 | [mcp] search/related/neighborhood → orvex-studio-knowledge direct (D-M8) | Todo |

**MS-6cfd30f9** (`6cfd30f9-35c6-47ac-80f5-dfff38ddca2c`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2461 | [mcp] TS verifier binding: multi-issuer JWKS → claims/aud/frozen-claim → deny-by-default scope gate → principal | Todo |
| ENG-2462 | [mcp] Introspection cache + FR-C13 conformance vector suite as CI release gate | Todo |
| ENG-2463 | [mcp] Token pass-through: caller token verbatim on every upstream, no service credential | Todo |
| ENG-2464 | [mcp] Human-gated actions transport-only: needs_human_*, RATIFY/CONFIRM verbatim, never promote | Todo |
| ENG-2465 | [mcp] stdio auth-posture parity + resource standing audit gate | Todo |

**MS-1ac2df46** (`1ac2df46-4051-4b53-b76b-8dd0b8c23c0a`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2466 | [mcp] Stateless shim: no DB, bounded principal-independent caches, jti window retires at R1 | Todo |
| ENG-2467 | [mcp] Raw in-process Kafka revocation consumer → deny-list apply (ADR-0013) | Todo |
| ENG-2468 | [mcp] Day-1 cell contract: CELL_ID/CLUSTER_NAME, /healthz echo, orvexcell fail-closed, cell-scoped topic | Todo |
| ENG-2707 | [mcp] ADR-0020 cell-discovery routing — VERIFY + harden discover-once-pin / 308 / 421 self-heal / SOLO_CELL / fail-closed errors | Todo |

**MS-4ffbf1fc** (`4ffbf1fc-2ccb-4999-b6b6-b46f7d7df632`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2469 | [mcp] Six studio_* product tools with caller-token pass-through + fail-closed scope gate | Todo |
| ENG-2470 | [mcp] Re-home marketplace_search/skill_get onto knowledge (Decision 4 / C21) | Todo |
| ENG-2471 | [mcp] MCP memory-retrieval surface: memory read as a knowledge tool call (AD-5b, I-4) | Todo |
| ENG-2802 | [mcp] Wire `generate_image` MCP tool to the direct ai upstream (FR-M16/D-M7 — the ENG-2271 AC1 carve-out) | Todo |

**MS-87a24ed9** (`87a24ed9-afb0-4ff5-ac9f-608929823437`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2472 | [mcp] Golden-tape KPI eval harness (≤2 calls / ≤~1k tokens) with committed fixtures, CI release gate | Todo |
| ENG-2473 | [mcp] Operability: /health + /healthz, OTel/Prometheus SLIs, shim-overhead + revocation-lag SLI to LGTM | Todo |
| ENG-2474 | [mcp] AGPL-import guard in CI + typed-degradation posture (never fail open) | Todo |
| ENG-2475 | [mcp] Decommission embedded packages/orvex-mcp (73→parity) via FR-C5 ledger + ADR-0004 tier split | Todo |

**(no milestone)** (`none`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2800 | [canon] PRD k1sWjtJq3x FR-M19 doesn't carve out memory_get's read-leg-to-knowledge, contradicting its own Memory gap-closure fold-in — split the tool before the next decomposition reads it | Todo |

---

## 4. Orvex CLI (`Orvex CLI` project — successor to docmost-cli)

19 Done / 37 Todo / 1 Canceled = 57 cached (+ ENG-1512 Done, uncached yaml) = 58 per initiative.json.

**MS-aba6f039** (`aba6f039-55c6-49a2-b005-9f9f1e76e17e`) — 16 issues

| Issue | Title | State |
|---|---|---|
| ENG-1419 | orvex-cli from-scratch (wiki/search/ai/auth/admin namespaces) | Done |
| ENG-1425 | CLI discover->pin->421 transport leg | Done |
| ENG-1484 | orvex wiki issue: SSO-delegated Linear bug filing via the wiki-api relay (no local Linear key) | Done |
| ENG-1493 | orvex-cli — wiki namespace verb surface (page/space/comment/attachment/label CRUD + lifecycle + page block authoring + page mirror) | Canceled |
| ENG-1495 | orvex-cli — wiki namespace verb behaviour (page/space/comment/attachment/label CRUD + lifecycle + embed authoring + mirror) | Done |
| ENG-1513 | NT-CLI-DAEMON-CACHE — orvex-cli SQLite cache + SSE-fed daemon + fs mirror | Done |
| ENG-1515 | NT-CLI-META — orvex-cli instructions/doctor onboarding + hidden pb alias | Done |
| ENG-1516 | NT-CLI-AUTH-VERBS — orvex-cli auth profile mgmt (use/list-profiles/whoami) | Done |
| ENG-1519 | NT-CLI-SEARCH-VERBS — orvex-cli search verb (keyword/hybrid/semantic/--cached) | Done |
| ENG-1521 | NT-CLI-CONTRACT — orvex-cli byte-parity corpus + frozen exit/errorCode + output-envelope contract | Done |
| ENG-1554 | orvex-cli — admin namespace verb surface (user/workspace/audit/config) | Done |
| ENG-1556 | orvex-cli — verify/code content-health + drift gates + Tree-Sitter dep-graph | Done |
| ENG-1557 | orvex-cli — ai namespace verb surface (ask/cost/image generate/reembed) | Done |
| ENG-1560 | orvex-cli — migrate namespace: bulk markdown import (scan/apply/verify) | Done |
| ENG-1561 | orvex-cli — screenshot namespace: headless-Chromium capture (shot/manifest/refresh) | Done |
| ENG-1562 | orvex-cli — DfM mark-syntax de-dup + write-time collision tripwire (mark-fix port) | Done |

**(no milestone)** (`none`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-1607 | orvex-cli: add CI workflow to enforce §5c contract gates (import-graph, no-client, no-time/rand) | Done |
| ENG-1956 | orvex-cli auth — OIDC RP login + persistent auth.Store (keyring/encrypted-file) | Done |
| ENG-1960 | Tree-Sitter full-build dep-graph capability for code graph — design-first (ENG-1556 AC4-full carve-out); D1 = ADR-0031 | Done |
| ENG-1971 | orvex-cli Transport: implement the 421 Misdirected-Request cell re-resolve + single retransmit runtime (consumes ENG-1964 pinned envelope) | Done |
| ENG-2795 | [canon] Define FR-CLI21 (golden-corpus parity test) on PRD: orvex-cli | Todo |

**MS-ecf5b7e6** (`ecf5b7e6-d270-4bec-ba7c-d5a20a751ae2`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2105 | [FACTORY] orvex-cli — Service Definition Pack (Wave 3 delta) | Todo |

**MS-2abf3230** (`2abf3230-6cf5-4553-8abd-1b211ba12973`) — 10 issues

| Issue | Title | State |
|---|---|---|
| ENG-2544 | [cli] From-scratch repo scaffold + AGPL-import CI guard | Todo |
| ENG-2545 | [cli] Endpoint registry + Profile per-service hosts + ORVEX_URL/env model | Todo |
| ENG-2546 | [cli] Service-aware transport chokepoint: envelopes, retry, correlation ID, Idempotency-Key | Todo |
| ENG-2547 | [cli] Per-service typed clients codegen from contracts tag + drift CI gate | Todo |
| ENG-2548 | [cli] 421 cell-mismatch re-resolve path + tenant-to-cell registry read | Todo |
| ENG-2549 | [cli] Namespace-first cobra command tree + hidden back-compat aliases | Todo |
| ENG-2550 | [cli] Output contract: JSON-when-piped, --output/--fields, snake_case, SetEscapeHTML(false) | Todo |
| ENG-2551 | [cli] Frozen 0–9 exit codes + errorCode vocabulary shared client artifact | Todo |
| ENG-2552 | [cli] Two build variants (orvex / orvex-full) + honest REQUIRES_FULL_BINARY stubs | Todo |
| ENG-2553 | [cli] docmost-cli behaviour-parity harness as CI gate | Todo |

**MS-c4fd9aab** (`c4fd9aab-454e-425c-8181-0b14259af28e`) — 7 issues

| Issue | Title | State |
|---|---|---|
| ENG-2554 | [cli] Page CRUD + verb grammar with CAS ifVersion, DUPLICATE_CANDIDATE, QUOTA_EXCEEDED | Todo |
| ENG-2555 | [cli] Nav, watchers, permissions, transclusion & governance verbs | Todo |
| ENG-2556 | [cli] Block authoring: 21 retained block types + diagram + image_from_prompt | Todo |
| ENG-2557 | [cli] space / comment / label / attach + binary attachment I/O | Todo |
| ENG-2558 | [cli] history / diff / revert / version + drift + audit dual-write | Todo |
| ENG-2559 | [cli] migrate import / export / verify / apply | Todo |
| ENG-2560 | [cli] verify suite (lint/links/orphans/render/space/duplicates/staleness/drift/ia) + spec gate check | Todo |

**MS-8216083a** (`8216083a-ac1a-4dca-aa76-0221f6d9cf78`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2561 | [cli] screenshot (chromium) + code graph (treesitter) full-binary verbs | Todo |

**MS-22594f4f** (`22594f4f-1653-43cf-a592-1d9d7eefd2f2`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2562 | [cli] pkg/dfm in-process converters + opaque-node round-trip (linear opaque-preserve) | Todo |
| ENG-2563 | [cli] AGPL-provenance audit gate + clean-room pkg/dfm sourcing | Todo |
| ENG-2564 | [cli] Golden-corpus parity test + ENG-1327/1328/897/898/1261 defences | Todo |
| ENG-2565 | [cli] Compensating-machinery trim (sidecars / embed-degradation / canonicalizer collapse) | Todo |
| ENG-2566 | [cli] Offline authoring paths: mirror push/pull/watch + update --content markdown | Todo |

**MS-08d32b12** (`08d32b12-5e7b-4f39-85b0-ef1e037a9158`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-2567 | [cli] search namespace → knowledge (keyword/semantic/hybrid/related/duplicates/attachment) + --cached | Todo |
| ENG-2568 | [cli] ai namespace → ai (ask/chat/inline/image/models/cost) + BUDGET_EXCEEDED/MODEL_UNAVAILABLE | Todo |
| ENG-2569 | [cli] admin namespace routing (reindex/reembed/events/user/workspace) per finding F-E | Todo |

**MS-6efe2d46** (`6efe2d46-82c2-4bd2-932b-168a5d22a6a2`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2570 | [cli] Per-host daemon lifecycle + SQLite WAL cache + Unix-socket IPC | Todo |
| ENG-2571 | [cli] Cache-sync cursor-delta projection + hard-delete tombstones + content_pm | Todo |
| ENG-2572 | [cli] SSE consumer wire contract + monotonic epoch-ms cursor + page.status_changed fix | Todo |
| ENG-2573 | [cli] Cursor cell-qualification + events-host cold-start + ~6h reconcile + offline --cached | Todo |

**MS-79cf9edb** (`79cf9edb-5c55-49da-b82a-745ece36368e`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-2574 | [cli] auth namespace → identity: scoped-token mint, whoami/status from claims, profiles | Todo |
| ENG-2575 | [cli] lib/auth edge verification + api-key pass-through interim + zero-trust propagation | Todo |

**MS-5fa9edba** (`5fa9edba-9345-4d96-8311-6b3de9688c3e`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-2576 | [cli] docmost-cli shim + DOCMOST_* env aliases + config-dir first-run migration | Todo |
| ENG-2577 | [cli] Keychain/token read-through migration (no orphaned credentials) | Todo |
| ENG-2578 | [cli] Release chain under orvexai: 2-variant goreleaser, cosign, SLSA, module-owner=release-owner | Todo |

---

## 5. Orvex Wiki (engine reference project — `Orvex Wiki` in Linear, thin AGPL fork `~/repos/orvex-wiki`)

71 Done / 1 In Progress / 41 Todo / 1 Canceled / 1 Duplicate = 115.

**M8 Legs — AI (Engine)** (`a7d59c2f-55c2-4ada-80b0-a306b16730f8`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-1359 | Thin AI-chat client UI (client bundle) | Done |
| ENG-1395 | In-editor AI affordances (palette, bubble/inline/slash, translate) | Done |

**M13 Legs — Console (Engine)** (`cbbc1bce-f8e8-46a0-afe3-2be43347277d`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-1360 | /metrics Prometheus endpoint (registry in lib) | Done |
| ENG-1384 | Engine liveness/readiness/info probes | Done |
| ENG-1386 | Engine CI (CS §13 substrate) — pattern replicates per repo | Done |

**M6 — Engine Event Spine & Primitives** (`505b019c-c330-4490-ab34-076420fe0ae4`) — 43 issues

| Issue | Title | State |
|---|---|---|
| ENG-1369 | Page-history restore + audit + PAGE_HISTORY_RESTORED (thin UI) | Done |
| ENG-1371 | orvex_page_meta SIDE table + slug governance (+ version/content_hash move) | Done |
| ENG-1372 | Page move + restore-from-history correctness | Done |
| ENG-1373 | Per-page ACL + filterAccessiblePageIds (FR-13) + audit | Done |
| ENG-1376 | P7 subpage-cards + page-visuals server projections | Done |
| ENG-1380 | Clean-room AGPL api-key primitive + OrvexBearerAuthGuard + orvex audit | Done |
| ENG-1381 | Remove EE git submodule -> in-tree AGPL ee.module | Done |
| ENG-1382 | Entitlement enforcement at write chokepoint (F-QUOTA 402) | Done |
| ENG-1383 | Transactional outbox emit + realtime-invalidate primitive | Done |
| ENG-1385 | Space/workspace-scoped labels (+ dropped-index reconcile) | Done |
| ENG-1396 | In-process transactional audit sink (feeds outbox) | Done |
| ENG-1397 | Block-ID-native write chokepoint (apply-ops, backfill) | Done |
| ENG-1398 | Doc-workflow engine glue: slug-rewrite queue + SHA-256 | Done |
| ENG-1399 | Docmost branding removal -> Orvex Wiki | Done |
| ENG-1400 | Amend canon root: standalone = full self-hosted stack | Done |
| ENG-1411 | Slot-in module arch (OrvexRootModule) + migration provider | Done |
| ENG-1412 | GET /api/schemas/blocks block-schema catalog | Done |
| ENG-1413 | Page write CAS (ifVersion->409) + Redis idempotency store | Done |
| ENG-1432 | Workspace settings deep-merge + enforce-SSO hook | Done |
| ENG-1433 | S3 storage admin + SMTP mail admin + binary attachment path | Done |
| ENG-1434 | Superseded/archived status mutations + forced-supersede break-glass | Done |
| ENG-1436 | Workspace-scoped throttling (guard + 429 contract) | Done |
| ENG-1445 | Ratify/confirm token mint + HMAC enforcement | Done |
| ENG-1447 | AI-provenance stamp on REST + collab write path | Done |
| ENG-1449 | Verify @orvex/secret consumers at HEAD; port-minimal-or-delete | Done |
| ENG-1454 | Engine scope-carry-at-auth + CASL intersection enforcement | Done |
| ENG-1459 | QMS tables + editor-header verify badge (entitlement-flagged) | Done |
| ENG-1469 | Yjs persistence: page VIEW no longer bumps updatedAt (default:undefined phantom key) | Done |
| ENG-1470 | Transclusion write-block safeguard + FR-10 impact read | Done |
| ENG-1471 | Pages upsert + duplicate-title prevention + storm hardening | Done |
| ENG-1472 | Upstream-PR candidates + revert-to-upstream disposition | Canceled |
| ENG-1473 | User data export (GDPR) | Done |
| ENG-1489 | Native-login (Docmost password) removal leg — fail-closed under enforced SSO | Duplicate |
| ENG-1490 | Native-login (Docmost password) removal leg — fail-closed under enforced SSO | Done |
| ENG-1491 | NT-AGPL-SOURCE-OFFER — AGPL §13 source-offer + license-header + engine-only-import guard leg | Done |
| ENG-1492 | NT-LLMS-DISCOVERY — port orvex/llms token-scope-filtered discovery surface (F29) | Done |
| ENG-1596 | pageperms-engine — list-permissions + restriction-info reads + single-vs-batch principal DTO reconciliation | Done |
| ENG-1599 | Engine OTel tracing emission + W3C trace-context propagation (spans → LGTM/Tempo, FR-C18-conformant) | Done |
| ENG-1600 | Trace-context across the outbox→CloudEvent→Kafka seam (cross-service message tracing) | Done |
| ENG-1603 | Migrate ENG-1447 provenance trio (provenance_status/_changed_at/_changed_by_id) from pages -> orvex_page_meta once consumers repoint | Done |
| ENG-1604 | OrvexRootModule slot-in consolidation (ENG-1411 AC1/2/3/8 descope; AC6/7 → ENG-1649) | Done |
| ENG-1605 | Independent adversarial security review — AI-provenance human_verified non-forgeability (ENG-1447 review debt) | Done |
| ENG-1609 | Outbox lifecycle-emitter coverage: workspace/space/comment/attachment/member events (AC7 follow-up to ENG-1383) | Done |

**M6.C — Wiki Client Bundle** (`49eae9bd-9c5c-4aa3-a380-0ce8b4abbd99`) — 9 issues

| Issue | Title | State |
|---|---|---|
| ENG-1375 | Per-page permissions UI (client) | Done |
| ENG-1377 | P7 visual NodeViews (Chart/TLDR/Freshness/Changelog) | Done |
| ENG-1388 | Client shell + realtime + thin-UI wiring | Done |
| ENG-1391 | Client diagram-rendering fidelity (mermaid/excalidraw/drawio/figma) | Done |
| ENG-1408 | Multi-select + context-menu primitive (client) | Done |
| ENG-1435 | Orvex Mantine theme + i18n (client) | Done |
| ENG-1440 | Superseded lifecycle UI (modal/banner/toggle) | Done |
| ENG-1460 | AiAuthored mark/NodeView + provenance badge (client) | Done |
| ENG-1474 | 409 transclusion-conflict modal (client) | Done |

**M14 Legs — Launch (Engine)** (`fc49715e-1693-481b-a949-938fae47f41d`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-1378 | Web front-door cell-discovery redirect leg | Done |
| ENG-1389 | Engine deploy/GitOps/migrator infra | Done |

**M7 Legs — Wiki API (Engine)** (`e0142608-944c-4442-baf1-0a8a6df1c148`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-1379 | Drift stamped verified_* fields | Done |
| ENG-1390 | Engine internal markdownToHtml for import | Done |

**M2 Legs — Identity (Engine)** (`27e19937-e9a0-4e26-a4ad-9b66d4e73aa4`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-1387 | Thin Clerk login UI + workspace-settings lockout | Done |
| ENG-1409 | Engine FR-15 session-mint landing + enforce-SSO + revocation | Done |
| ENG-1410 | Thin SSO login-page UI leg | Done |

**M5 Legs — Knowledge (Engine)** (`0d8dd349-6243-4edf-bc29-432bfcbe383f`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-1437 | Tika admin config persistence + remove tsvector write | Done |
| ENG-1451 | Keep /search/suggest (ILIKE) + delete tsvector after seam | Done |

**M9 Legs — MCP (Engine)** (`826db46e-d971-4a4a-9bd4-e3cfb0964e68`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-1481 | MCP engine leg: delete in-fork /mcp transport + route at REST-gap parity | Done |

**(no milestone)** (`none`) — 6 issues

| Issue | Title | State |
|---|---|---|
| ENG-1601 | [PLATFORM] Traefik edge: OTel tracing + JSON access-log shipping → LGTM (100% of requests incl. every failure) | Done |
| ENG-1649 | patches-drift CI subsystem + frozen inline-edit allow-list — design-first (split from ENG-1604 AC6/AC7) | Done |
| ENG-1650 | OrvexLabelModule is orphaned — zero importers (dead/unwired follow-up, ref ENG-1385) | Done |
| ENG-1652 | Engine apply-ops HTTP write primitive (single-transact collab-safe ordered batch) | Done |
| ENG-1665 | Candidate future Orvex primitives — metrics/secret/clerk/studio/url-fetch/info/extensions-core (struck from ENG-1604 AC1, speculative pending PRD) | Done |
| ENG-1957 | Engine-side internal API for knowledge's ACL/export/resolve/ai-search seam (blocks ENG-1559) | Done |

**MS-29e9b259** (`29e9b259-9012-43f5-be7d-569b17a1354b`) — 6 issues

| Issue | Title | State |
|---|---|---|
| ENG-2039 | [DEFECT][P0] Engine dev-cell instability cluster — /api router wedges, health hangs, 127.0.0.1 bind, ee.module error, ReplicaSet churn | Todo |
| ENG-2041 | [DEFECT][P0] Engine DfM→PM update/block-patch path 502s on modify-existing writes | In Progress |
| ENG-2042 | [DEFECT][P1] Engine apply-ops content-replace hangs indefinitely (blocks wiki.page.content_updated) | Todo |
| ENG-2043 | [DEFECT][P1] Engine DfM ingestion drops ALL list-item text on create/update | Todo |
| ENG-2044 | [DEFECT][P2] DfM/markdown table cell truncated at unescaped pipe (both converters) | Todo |
| ENG-2053 | [DEFECT][P1] Quota 402 chokepoint inert on dev cell — modules off + billing unwired (unbounded writes) | Todo |

**MS-3361c2a5** (`3361c2a5-201a-4e96-a7bf-c65326e7e2a0`) — 1 issues

| Issue | Title | State |
|---|---|---|
| ENG-2103 | [FACTORY] orvex-wiki — Service Definition Pack (Wave 3 delta) | Todo |

**MS-c2ecce7c** (`c2ecce7c-45da-4576-815f-43784bb04d0c`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2476 | [wiki] Scaffold orvex/* module tree + single OrvexRootModule import + no-@docmost/no-ee import guards | Todo |
| ENG-2477 | [wiki] FR-30 divergence gate CI (weighted hot-file conflict-hunks) + 13-row allow-list ledger | Todo |
| ENG-2478 | [wiki] Overlay-rebase import runbook + 15-item correctness-hardening allow-list class | Todo |
| ENG-2479 | [wiki] Boot-migrate advisory lock + renamed-migration duplicate trap + db.d.ts verbatim + orvex_migrations ledger | Todo |

**MS-dcbbad4e** (`dcbbad4e-7ba8-427b-9571-d43fbd12efc8`) — 7 issues

| Issue | Title | State |
|---|---|---|
| ENG-2480 | [wiki] orvex_page_meta side table + move 18 product columns off upstream pages + rewrite read sites | Todo |
| ENG-2481 | [wiki] apply-ops write chokepoint (typed PM-JSON ops, CAS ifVersion→409, atomic-or-409) | Todo |
| ENG-2482 | [wiki] FR-13 ACL evaluation primitive + evalPage page-level fix + delta-pull-through-ACL | Todo |
| ENG-2483 | [wiki] Export primitive (markdown FR-18 + embed-resolved text_repr FR-38) + export-authz REM-1 IDOR + real audit-service | Todo |
| ENG-2484 | [wiki] Atomic AI-provenance stamp (aiAuthored mark + provenanceChangedById) in-tx on REST + collab via updatePageContent({markAiAuthored}) | Todo |
| ENG-2485 | [wiki] Transclusion-impact primitive + safeguard interceptor on destructive mutation of a transcluded source | Todo |
| ENG-2486 | [wiki] FR-40 page-lifecycle workflow (mark-superseded/archive/status-control + show-superseded tree filter + superseded banner + link-rewrite) riding the orvex_page_meta seam | Todo |

**MS-4ac17ee9** (`4ac17ee9-d0b1-41d2-8454-bc141029826e`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-2487 | [wiki] Extract @orvex/dfm standalone package + write-path imports + opaque-fence round-trip / DFM_OPAQUE_UNKNOWN_REF throw | Todo |
| ENG-2488 | [wiki] DfM import-boundary guard (AGPL TS in-engine only) + golden-fixture conformance vs Go twin | Todo |

**MS-a23b35e6** (`a23b35e6-3143-4435-98e9-5d3ab2eb682a`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2489 | [wiki] Entitlement-reader interface + billing cache (short-TTL, evict on billing.entitlement.changed) + interim hardcode-Free | Todo |
| ENG-2490 | [wiki] Redis fast-counter pre-flight O(1) quota check at page-create/attachment-upload/member-add over REST + collab paths | Todo |
| ENG-2491 | [wiki] 402 QUOTA_EXCEEDED verdict as domain fn + controller/collab marshal + deep-link/largest-files + members 110% JIT | Todo |
| ENG-2492 | [wiki] Counter reconciliation sweep (O(changed)) + fail-closed-storage/fail-open-cheap on Redis loss + warn-mode rollout | Todo |
| ENG-2493 | [wiki] History-retention prune cron (singleton) + quota-state query endpoint | Todo |

**MS-7332ed1c** (`7332ed1c-a197-424a-b412-e6c5dc22fd50`) — 4 issues

| Issue | Title | State |
|---|---|---|
| ENG-2494 | [wiki] Transactional outbox row in same DB tx as each mutation incl the collab onStoreDocument write path | Todo |
| ENG-2495 | [wiki] Worker-role relay drains outbox → Kafka CloudEvents (partitionkey=workspaceId) + own envelope builder on golden fixtures | Todo |
| ENG-2496 | [wiki] Cell-contract producer duties: orvexcell attr + {domain}-events.{cell} single-partition topics + correlation-id + relay liveness/lag heartbeat | Todo |
| ENG-2497 | [wiki] FR-37 distributed-cleanup contract: emit durable workspace.deleted/user.deleted outbox events on tenant/user removal (replaces cross-service FK cascades) | Todo |

**MS-c6366c6a** (`c6366c6a-4088-472b-8653-55ec48a15362`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-2498 | [wiki] Clean-room AGPL api-key rebuild under orvex/api-key + repoint jwt.strategy off ee/api-key | Todo |
| ENG-2499 | [wiki] Exchange-token session-mint consume (RS256/JWKS) → createSessionAndToken; native login removed fully | Todo |
| ENG-2500 | [wiki] AGPL §13 source-offer @Public {sha,sourceRepo} endpoint + git mirror + LICENSE-COMPLIANCE + reconcile conflicting endpoints | Todo |

**MS-7d14f40a** (`7d14f40a-014c-442f-8cbf-37f0d7e88a3e`) — 5 issues

| Issue | Title | State |
|---|---|---|
| ENG-2501 | [wiki] CLOUD-clean boot (no exit on absent ee.module) + hostname resolver label-0 tenant + soft label-2 cell assertion (solo no-op) | Todo |
| ENG-2502 | [wiki] Transaction-scoped fail-closed RLS (set_config txn-scoped) + cross-tenant CI probes (bytes=0) | Todo |
| ENG-2503 | [wiki] Polymorphic user-or-org tenant + personal→Teams upgrade-pass re-key + global-uniqueness delegation to registry | Todo |
| ENG-2504 | [wiki] Sever upstream Stripe seat-sync → emit billing.* event; retire in-engine billing migration; no Stripe secret | Todo |
| ENG-2505 | [wiki] FR-22 tenant suspension enforcement — live/push-invalidated block of all-but-read/export/auth surfaces, near-instant cell-wide (wires the unused tenant status) | Todo |

**MS-df04a8d7** (`df04a8d7-c41d-44d5-9453-5e28b232d792`) — 3 issues

| Issue | Title | State |
|---|---|---|
| ENG-2506 | [wiki] Collab Yjs/Hocuspocus server-schema node/mark registration (all additive nodes, minus Linear D-S11) + React client native ProseMirror | Todo |
| ENG-2507 | [wiki] Thin-UI AI/MCP/API/api-key affordances as SSE readers with zero server AI logic (D-S4 exception) | Todo |
| ENG-2508 | [wiki] Engine API internal-only / no /docs Swagger + product-family-agnostic configured endpoints + graceful degrade | Todo |

**MS-7ee70d81** (`7ee70d81-abd1-4e84-9000-541603f22249`) — 2 issues

| Issue | Title | State |
|---|---|---|
| ENG-2509 | [wiki] Cross-cell tenant-move typed step-API (quiesce/export/import/activate, Idempotency-Key, TenantMoveManifest) + coverage-checked TENANT_MOVE.md | Todo |
| ENG-2510 | [wiki] Per-role liveness (worker relay heartbeat, collab WS probe) + /api/health echoes CELL_ID+CLUSTER_NAME + file load-bearing ADR-NNNN drafts | Todo |
---

## 6. OBE (Overtaken By Events) Findings

Cross-referencing each project's Todo cluster against what memory + this repo's git log say is **already live/Done**, three near-identical "from scratch" clusters stand out. In all three, an EARLIER batch of tickets (`ENG-13xx`-`ENG-19xx`, all `Done`) already built and shipped the exact capability that a LATER batch of tickets (`ENG-24xx`-`ENG-25xx`, all `Todo`) proposes to build again. This is the single biggest structural finding of this census.

### 6.1 orvex-studio-mcp: Todo cluster re-proposes a server that is already live

- **Already Done** (milestone `49ff9628`, 11 issues, ENG-1361/1401-1407/1496/1499/1500): SSRF-guarded fetch tool, global MCP entry resolution, REST-upstream repoint (R0-R3), identity-minted bearer auth, /v1 pinned-contract regen, decommission of in-fork `/mcp`, standalone `orvex-studio-mcp` scaffold, golden-tape eval harness, edge scope-gate. Per memory `amazing-mcp-delivered-live`: MCP is BUILT + LIVE-green 19/19 on dev (`mcp.orvex.dev` @ 827f747), search->get_page chain closes on real evidence.
- **Todo cluster proposing the same server core again** (ENG-2449 through ENG-2475, ENG-2707, ENG-2800-2802 - 33 issues, all `Todo`): "Streamable-HTTP + stdio server core" (ENG-2449), "Curated hero surface (<=~13 eager tools) + list_tools" (ENG-2450), "whoami" (ENG-2451), "get_page read ladder" (ENG-2453), "save_page/edit write chokepoint" (ENG-2454), "get_changes pull-based" (ENG-2455), "TS verifier binding... scope gate -> principal" (ENG-2461), "Golden-tape KPI eval harness" (ENG-2472, near-duplicate title of already-Done ENG-1499), "Decommission embedded packages/orvex-mcp (73->parity)" (ENG-2475, contradicts the live 19-tool count in memory).
- **Read as:** either (a) these are a deliberate v2/redesign superseding the R0-R3 cutover - but nothing in the cached descriptions says so - or (b) a stale planning artifact duplicating work already shipped. Given memory's explicit "certified != current" and "MCP staleness failure 2026-07-16" lessons, **(b) is the more likely explanation and every ticket in this Todo cluster should be re-verified against the live `mcp.orvex.dev` deployment before being worked** - several may be closeable as OBE outright (e.g. ENG-2449 server core, ENG-2451 whoami, ENG-2453 get_page, ENG-2472 golden-tape harness look like restatements of already-Done ENG-1404-1407/1499).
- R21 (memory: streaming folded into the 19-tool surface, binding on amazing-MCP Layer 3) is not visible anywhere in this Todo cluster - ENG-2449's "Streamable-HTTP + stdio server core" is the closest match and should be checked for R21 conformance, not built as a bare transport ticket.

### 6.2 orvex-wiki-api: Todo cluster re-proposes a service that is already Done

- **Already Done** (milestone `bcb756e3`, 17 issues, ENG-1366-1969): block-ID patch ops, response shaping, "Studio verb grammar (get/search/list/save/edit) + bulk ops" (ENG-1368), "Trustworthy write contract" (ENG-1374), DfM convert API, drift-verify logic, per-type block handler registry, self-onboarding discovery front, token pass-through, and critically **ENG-1969: "wiki-api Phase-1: mount the /v1 verb Dispatcher into the deployed `cmd/wikiapi` router... so /v1 serves real content"** - i.e., the /v1 surface is already live, not a Phase-0 facade.
- **Todo cluster proposing the same service again** (ENG-2511 through ENG-2543 - 33 issues, all `Todo`): "Go service skeleton, six-tier layout... + /healthz" (ENG-2511), "Verb dispatch search/get/save/edit/list" (ENG-2522, near-duplicate of Done ENG-1368), "CAS ifVersion->409... verified read-after-write receipt" (ENG-2528, near-duplicate of Done ENG-1374), "Living-wiki drift verification (verifyPage/getDrift/force-new-token)" (ENG-2536, verbatim duplicate of Done ENG-1464), "External-agent audit-write endpoint -> engine WORM sink" (ENG-2538, near-duplicate of Done ENG-1462).
- Same call as 6.1: **this Todo cluster needs a reality check against the deployed `cmd/wikiapi` binary before being scheduled** - ENG-1969 already says /v1 serves real content, so ENG-2511's "service skeleton" and ENG-2513's "draft /v1 scaffold served alongside" read as stale if the router is already mounted.
- Bright spot: ENG-2532 ("Generic `orvex_dashboard`... no `linear_*`") and ENG-2537 ("spec-gate... de-Linearized") are correctly aligned with the drop-Linear mandate, not OBE - these are the intentional de-Linearization follow-through, distinct from the skeleton/dispatch duplication above.

### 6.3 orvex-cli: Todo cluster re-proposes a CLI that is already Done

- **Already Done** (milestone `aba6f039` + unmilestoned, ~21 issues, ENG-1419/1425/1495/1513-1521/1554-1962/1971): **ENG-1419 "orvex-cli from-scratch (wiki/search/ai/auth/admin namespaces)"** is Done, plus namespace verb surfaces for wiki (ENG-1495), admin (ENG-1554), ai (ENG-1557), migrate (ENG-1560), screenshot (ENG-1561), auth/OIDC (ENG-1956), daemon+SQLite cache (ENG-1513), byte-parity contract (ENG-1521), CI contract gates (ENG-1607), 421 cell-mismatch retransmit (ENG-1971).
- **Todo cluster proposing the same CLI again** (ENG-2544 through ENG-2578 - 35 issues, all `Todo`): **ENG-2544 "From-scratch repo scaffold + AGPL-import CI guard"** (near-verbatim duplicate framing of Done ENG-1419), "Namespace-first cobra command tree" (ENG-2549), "Page CRUD + verb grammar" (ENG-2554, duplicate of Done ENG-1495), "auth namespace -> identity... profiles" (ENG-2574, duplicate of Done ENG-1516/1956), "screenshot (chromium) + code graph (treesitter)" (ENG-2561, duplicate of Done ENG-1561/1960), "docmost-cli behaviour-parity harness as CI gate" (ENG-2553, duplicate of Done ENG-1521).
- Same call: this cluster should be triaged against whatever `orvex-cli` binary is actually shipping today before any of it is scheduled as net-new work.
- Note ENG-1493 "wiki namespace verb surface" is `Canceled` while its near-duplicate ENG-1495 "wiki namespace verb behaviour" is `Done` - that's an intentional supersession within the Done batch, not a new finding, but shows the same title-collision pattern recurs even inside "Done."

### 6.4 Dropped-Linear-integration remnants (built, contradicts current mandate)

Per the orchestrator brief, Linear integration is dropped entirely from the product. Two **Done** tickets built exactly that feature and now read as contradicting the current mandate - not "to build" OBE, but candidates for explicit deprecation/removal now that the policy has changed:

| Issue | Project | Title | State |
|---|---|---|---|
| ENG-1483 | Orvex Wiki API | Linear issue-create relay: platform-key filing, app-actor delegated to the SSO user | Done |
| ENG-1484 | Orvex CLI | orvex wiki issue: SSO-delegated Linear bug filing via the wiki-api relay (no local Linear key) | Done |

By contrast, these tickets are correctly ALIGNED with the drop-Linear mandate (not flagged):
- ENG-1463 (Wiki API, Done) - "Amend doc-governance canon: spec-gate removed with Linear"
- ENG-1465 (Wiki API, Done) - "Per-type block handler registry (~25 types; Linear handlers dropped)"
- ENG-1467 (Wiki API, In Progress) - "Server-side bulk page ops (non-Linear)"
- ENG-2532 (Wiki API, Todo) - "Generic orvex_dashboard... no linear_*"
- ENG-2537 (Wiki API, Todo) - "Wiki-first spec-gate... de-Linearized"
- ENG-2562 (CLI, Todo) - "pkg/dfm in-process converters + opaque-node round-trip (linear opaque-preserve)" - note the title still contains "linear opaque-preserve"; worth a human check on whether this refers to Linear-the-product or "linear" as in sequential/opaque-node handling - ambiguous from title alone, flagged not resolved.

### 6.5 Self-flagged canon-drift tickets (already surfaced by the tracker itself, not new findings)

The `[canon]` tagged tickets below are the tracker already calling out contract/PRD drift - cited here because they overlap this census's OBE theme (stale PRD claims vs. shipped reality) but are pre-existing, not discovered by this pass:
- ENG-2804 (Wiki API, Todo) - "PRD 8jAiCBifDW FR-A4 still claims engine title/NL resolver primitives that ENG-1934 ruled permanently nonexistent"
- ENG-2800 (MCP, Todo) - "PRD k1sWjtJq3x FR-M19 doesn't carve out memory_get's read-leg-to-knowledge..."
- ENG-2795 (CLI, Todo) - "Define FR-CLI21 (golden-corpus parity test) on PRD: orvex-cli"

### 6.6 Open defects worth flagging alongside the OBE clusters

- ENG-2054 (Wiki API, `Todo`, P1) - "Single-host ingress does not hide the split - /api/ai + /mcp served by monolith, satellites on separate subdomains" - directly relevant to the thin-engine/satellite split mandate; unresolved.
- ENG-2082 (Wiki API, `Backlog`, P2) - "wiki-api KNOWLEDGE_URL (and AI_URL) point to NXDOMAIN hosts - GET /v1/search returns 502 UPSTREAM_UNAVAILABLE in prod" - a live prod defect sitting in Backlog, not Todo; worth a priority check given it's a P2 prod 502.

---

## 7. Method Notes / Caveats

- Project membership for all 1006 cached issue yamls comes from `initiative.json`'s per-issue `project` field (synced 2026-07-16T11:36:00Z, `complete: true`, 1024 issues). Individual `issues/*.yaml` files carry NO `project` field - only `milestone` (a UUID), `status`, `title`, `kind`, `cycle`.
- Milestone **names** are only decoded for the 9 `orvex-wiki` "Legs" milestones (via `milestone-map.md` / `work-status.yaml`, synced 2026-07-09). For `Orvex Wiki API`, `Orvex Studio MCP`, and `Orvex CLI`, no local milestone-name cache exists - milestones are labelled `MS-<uuid8>` and ordered by their lowest-numbered issue, which reliably clusters same-batch work (visible in the tables above as tight `ENG-24xx`/`ENG-25xx` runs per milestone).
- `initiative.json` reports 1024 total issues; only 1006 have cached per-issue yaml (18-issue gap across the whole cache, not just these 4 projects). Within the 4 projects censused here, exactly 1 gap: ENG-1512 (Orvex CLI, Done) has no cached yaml, so its title/milestone are unknown locally.
- Status values used verbatim from cache: `Done`, `In Progress`, `Todo`, `Backlog`, `Canceled`, `Duplicate`. No `In Review` issues appeared in the 4 projects censused (1 exists initiative-wide, in another project).
- "OBE" calls in section 6 are pattern-matches on title/description text and milestone-cluster shape (Done batch with "from-scratch"/foundational titles immediately followed by a much larger Todo batch with near-identical titles) - this is evidence for a human/PO decision, not a definitive verdict; actual OBE status requires checking the live deployments (mcp.orvex.dev, the deployed cmd/wikiapi binary, whatever orvex-cli binary ships today) per memory's "certified is not current" doctrine, which this local-cache-only census cannot do.
