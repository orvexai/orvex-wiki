# TRACK 1 — Authoritative Feature-Parity Matrix

**Orvex Wiki split program.** Every capability of (A) the Docmost fork server, (B) the Docmost fork client/editor, and (C) `docmost-cli`, mapped to its target home under the thin-engine + closed-satellites doctrine, with current coverage at HEAD, the Linear ticket(s) covering it, and a verdict. This table drives the PRD redo.

Synthesized 2026-07-17 from the 16 evidence-fleet files (fork-server, fork-client, docmost-cli, engine, wiki-api, mcp, orvex-cli, contracts, canon-{engine,wikiapi,mcp,cli}, linear, decisions, web-{mcp,api,cli}). Every row cites a repo path/route/slug or a ticket ID.

---

## 0. Reading rules — the four traps this matrix is written against

1. **"Done in code" ≠ "works end-to-end."** The program's own 7-surface E2E re-baseline is **1 PASS (api) / 5 FAIL / 1 BLOCKED** as of 2026-07-15 (`pVDJS0woHl` §0.2). Engine surfaces passing ≠ product done. Where a capability is "done" it means the target-home code is real and wired at HEAD (code-verified), which for several items is explicitly *deploy-pending* (amazing-MCP commit `91b3b115`: "live end-to-end is deploy-pending").

2. **Certified ≠ current.** Several wiki PRD/SDD pages carry `status: canonical` while their own body says "DRAFT, never ratified" (`pVDJS0woHl`, `RPduIa4x9Y`, the 5 orvex-cli Wave-3 pages, `ZGjLctEnGH`). Coverage below is judged against **code at HEAD**, not doc status.

3. **The 4 censused Linear projects are not the whole map.** `evidence-linear.md` censused only **Orvex Wiki (engine) / Orvex Wiki API / Orvex Studio MCP / Orvex CLI**. The satellite projects that OWN the AI/knowledge/identity/console homes — **Orvex Studio AI (73), Knowledge (63), Identity (58), Console (57), Billing (52)** — were NOT censused. So "NO TICKET in the 4 projects" in §C below means *no ticket in the in-scope four*; the work may be ticketed in a satellite project. Every such row is flagged `[satellite-project — not censused]`.

4. **Two OBE clusters per service.** Each of the three AI-facing services has an *early* Done batch (ENG-13xx–19xx) that actually shipped the capability, and a *later* Todo "Wave-3 factory" batch (ENG-24xx–25xx) that re-proposes the same work from scratch. The Done batch is the real coverage citation; the Todo batch is flagged OBE in §(b).

**Legend — Target:** `engine` = orvex-wiki AGPL engine · `wiki-api` = orvex-wiki-api Go /v1 composition tier · `knowledge` = orvex-studio-knowledge · `ai` = orvex-studio-ai · `identity` = orvex-studio-identity · `console` = orvex-studio-console · `audit` = orvex-studio-audit (Daniel's incoming design, R16/R25) · `client` = thin AGPL client bundle · `cli` = orvex-cli · `mcp` = orvex-studio-mcp · `DROP` = deleted, not carried.

**Legend — Coverage:** `done` = target-home code real+wired at HEAD · `partial` = some of it, with named gaps/stubs/bugs · `missing` = 0 code in target home (501/absent) · `broken` = code exists but calls a non-existent route / fails live · `dropped` = deliberately removed.

**Legend — Verdict:** `covered` · `parity-gap` · `dropped-by-decision` · (OBE is a *ticket* property, tracked in §b).

---

## A. SERVER-SIDE PARITY MATRIX (Docmost fork `apps/server`, 76 controllers)

### A.1 AI — ask / chat / image / inline / memories / bake

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Cited Ask loop (RAG Q&A + citations) | fork `orvex/ai/ai-ask.controller.ts`; MCP `ai_ask` REAL (`tools.ts`), cli `ai ask` REAL, wiki-api has **no ask verb** (D-A12) | ai | **done** — `ai_ask` live, 6/6 E2E conf 0.95 (`ZGjLctEnGH`) | ENG-2459 (mcp, Todo), ENG-1557 (cli, Done) | covered |
| AI chat product (canvas / branch / citations / 6 tool-previews / cost picker) | fork `orvex/ai/ai-chat`,`ai-chats`,`ai-draft`; client `ee/ai-chat` (largest client block, `chat-message.tsx` +724) | ai + thin client | **partial** — thin client shell shipped; ai-satellite chat backend not inventoried; cli/mcp `chat` are stubs | ENG-1359 (thin client, Done); ENG-2568 (cli chat/inline, Todo) | parity-gap |
| Inline AI edit (`/ai` / Cmd+J / bubble) | fork `orvex/ai/ai-inline`; client `InlineAiPrompt`,`AiPalette`,`TranslatePickerMenu` | ai logic + client UI | **partial** — client UI Done (ENG-1395); ai `inline` verb stub in cli/mcp | ENG-1395 (Done); ENG-2568 (cli, Todo) | parity-gap |
| AI image generation | fork `orvex/ai/ai-images`; cli `ai image` REAL; MCP `generate_image` scaffold | ai | **partial** — cli real; MCP scaffold `NOT_AVAILABLE_YET` | ENG-1557 (Done), ENG-2802 (mcp, Todo) | parity-gap |
| AI memories CRUD | fork `orvex/ai/ai-memories`; MCP `memory_recall`(hero)/`memory_propose` = SCAFFOLD; client `AiMemorySettings` (603 lines) | ai / memory | **missing** — ENG-2471 unstarted; hero `memory_recall` returns `NOT_AVAILABLE_YET` | ENG-2471 (mcp, Todo) | parity-gap |
| AI prompts library | fork `orvex/ai/ai-prompts`; client `AiPromptLibrary` (521 lines) | ai | **missing** — no satellite ticket in 4 projects | — `[satellite — not censused]` | parity-gap |
| AI settings + LiteLLM virtual-key provisioning | fork `orvex/ai/ai-settings`; client `orvex-ai-settings.tsx` | ai | **missing** | — `[satellite — not censused]` | parity-gap |
| AI usage / spend dashboard | fork `orvex/ai/ai-usage`; client `AiUsageDashboard` (298 lines) | ai | **missing** | — `[satellite — not censused]` | parity-gap |
| AI tools-retry | fork `orvex/ai/ai-tools-retry` | ai | **missing** | — `[satellite — not censused]` | parity-gap |
| Bake pipeline (mermaid→mxGraph/excalidraw render, Playwright worker) | fork `orvex/ai/bake-payload`; client `excalidraw-bake-page.tsx` (headless, no auth) | ai worker + client | **partial** — excalidraw scene READ done (wiki-api ENG-1468); server-side bake WORKER not homed | ENG-1468 (Done); ENG-1391 (client fidelity, Done) | parity-gap |
| AI health probe (budget/LiteLLM/Tika/MCP fan-in) | fork `orvex/health` imports `@orvex/ai` | ai | **missing** — engine keeps only its own liveness | — `[satellite — not censused]` | parity-gap |

### A.2 Search / knowledge / retrieval

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Semantic / hybrid search | fork `orvex/ai/ai-search`; MCP `knowledge_search` REAL (direct, D-M8); cli `search` fixed to route via wiki-api `/v1/search` (`48329b7`) | knowledge | **done** — live; real Kafka→indexer pipeline exercised in E2E | ENG-1519 (cli, Done), ENG-1403 (mcp knowledge-direct, Done), ENG-2460 (Todo) | covered |
| Related pages ("more like this") | fork `orvex/ai/ai-related`; MCP `knowledge_related` REAL; cli `search related` STUB | knowledge | **partial** — mcp real; cli stub (targets knowledge-direct, no public host) | ENG-2567 (cli, Todo) | parity-gap |
| Duplicate detection | fork `orvex/ai/page-duplicates`,`page-duplicate-check`; cli `search duplicates` STUB; `verify duplicates` | knowledge | **partial** — server exists in fork; cli stub | ENG-2567 (Todo) | parity-gap |
| Bulk re-embed admin | fork `orvex/ai/ai-bulk-reembed`; cli `admin reembed` STUB | knowledge | **missing** — cli admin 100% stub | ENG-2569 (cli, Todo) | parity-gap |
| SSE event stream / connection registry (~2.5k LOC) | fork `orvex/events`; cli `daemon` consumes | knowledge (data) + console (admin) | **partial** — cli `daemon run` real, `cache sync` stub | ENG-1513 (cli daemon, Done) | parity-gap |
| `llms.txt`/`llms-full.txt` projection + `page.md` | fork `orvex/llms`; engine `orvex-llms` controller REAL (gated) | knowledge (projection) + engine (page.md primitive) | **done** | ENG-1492 (Done) | covered |
| Tika extraction + attachment full-text search | fork `@orvex/attachments` Tika; ENG-1437 removes tsvector write | knowledge | **partial** — Tika admin done; search leg cli-stubbed | ENG-1437 (Done) | parity-gap |
| Always-fresh tar-builder bundle (FR-19) | fork export tar path | knowledge | **missing** | — `[satellite — not censused]` | parity-gap |
| Engine search-suggest (ILIKE mention picker) | ENG-1451 keep `/search/suggest`, delete tsvector | engine (kept) | **done** | ENG-1451 (Done) | covered |

### A.3 Embeds / blocks

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Block-schema catalog (`GET /api/schemas/blocks`) | engine ENG-1412; wiki-api `GET /v1/pages/blocks/schema` REAL (ungated) | engine (schema) + wiki-api (grammar) | **done** — note: `/v1/pages/blocks/schema` has zero `requireScope` wrap | ENG-1412 (Done) | covered |
| Per-type block handler registry (~25 types, Linear dropped) | fork `orvex/page-blocks/handlers/*`; wiki-api ENG-1465; cli 29→21 retained | wiki-api | **done** — registry real; `applyBlocksBatch` rejects 8 `linear_*` types (400) | ENG-1465 (Done), ENG-2556 (cli, Todo) | covered |
| Diagram block (mermaid / drawio / excalidraw) | fork `handlers/diagrams.ts` (446 LOC); client; cli `pb diagram` | wiki-api (grammar) + ai (bake) | **partial** — block grammar via wiki-api; bake worker unhomed; cli block authoring Todo | ENG-2556 (Todo) | parity-gap |
| Editable Excalidraw scene read | wiki-api ENG-1468; `/v1/.../excalidraw-scene` REAL | wiki-api | **done** — **but 2 excalidraw-scene routes are UNGATED** (`server.go:353`, auth relies on downstream engine) | ENG-1468 (Done) | covered |
| Tabular / structure / media / math / callout / external embed | fork `handlers/{tabular,structure,media,math-content,external-embed}.ts` | wiki-api | **partial** — registry done; cli block-authoring (21 types) still Todo | ENG-1465 (Done), ENG-2556 (Todo) | parity-gap |
| Linear embeds (6 node types) | fork `handlers/linear.ts` (646 LOC); client `linearEmbed`/`linearGraph`/mention | **DROP** | **dropped** — wiki-api 400s `linear_*`; cli/schema 29→21 | D-S11 | dropped-by-decision |
| Orvex Dashboard cockpit block | fork `handlers/orvex-dashboard.ts` (186 LOC); client `OrvexDashboard.tsx` (1551 lines) | **DROP** (D-S24); generic `orvex_dashboard` rebuild = ENG-2532 | **dropped** (Linear-coupled); generic milestone-graph = future work | ENG-2532 (Todo) | dropped-by-decision |

### A.4 Page metadata / lifecycle / supersession

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| **`orvex_page_meta` SIDE table (move 18 product cols off `pages`)** | fork `orvex/page-metadata`; **ENG-1371 marked Done BUT 18 cols still physically on upstream `pages`** (16 in `page.repo.ts baseFields`); ENG-2480 re-proposes the move | engine | **partial / not-actually-moved** — **G1 blocker**, biggest divergence-budget risk | ENG-1371 (Done, contested), ENG-2480 (Todo) | parity-gap |
| Page lifecycle state machine (draft/canonical/deprecated/superseded/archived) | fork page-metadata; client `PageStatusControl`/modals/banner/tree-toggle; cli `wiki governance status/supersede` | engine + client + wiki-api verb + cli | **partial** — engine mutations ENG-1434 Done, client UI ENG-1440 Done, cli gov real; **rides the un-moved side table** | ENG-1434, ENG-1440 (Done); ENG-2486 (Todo) | parity-gap |
| Confirm/ratify token mint + gate settings | fork `confirm-token`/`ratify-token`/`*-gate-settings`; ENG-1445 | engine (mint) | **done** — mint real; transport (wiki-api/mcp/cli) is a distinct partial (see A.7) | ENG-1445 (Done) | covered |
| Device-grant / device-auth flow (CLI/agent login) | fork `device-grant.service`,`orvex-device-auth` (630 LOC); client `device-approval-page.tsx` | engine (session landing) + client | **done** — ENG-2059 device-flow merged (`4908b4e0`); client approval page shipped | ENG-2059 (Done, engine) | covered |
| Frontmatter round-trip interceptor | fork `frontmatter.util.ts` | engine | **done** | ENG-2063 (cli frontmatter test) | covered |
| Atomic AI-provenance stamp (ai_produced/edited/human_verified) | fork `page-provenance`; ENG-1447 + ENG-1605 adversarial review; client `PageProvenanceBadge` | engine (write-path metadata) | **done** — REST + collab paths; column-move to side table ENG-1603 Done | ENG-1447, ENG-1603, ENG-1605, ENG-1460 (client) — all Done | covered |
| Slug-title validation + slug-rewrite job | fork; ENG-1398 (SHA-256) | engine | **done** | ENG-1398 (Done) | covered |
| Subpage-cards + page-visuals server projections | fork `page-visuals`; ENG-1376; client `SubpagesCardView`,`FreshnessRibbon`,`Changelog` | engine projection + client NodeViews | **done** — depends on side table landing | ENG-1376, ENG-1377 (Done) | covered |
| Page-history restore + `PAGE_HISTORY_RESTORED` audit | fork; ENG-1369; client `use-history-restore` | engine | **done** | ENG-1369 (Done) | covered |
| Bulk page ops (move/archive/delete/relabel) | fork `orvex/bulk-page`; wiki-api `POST /v1/pages/bulk` REAL | wiki-api | **partial** — ENG-1467 In Progress | ENG-1467 (In Progress) | parity-gap |

### A.5 Permissions / ACL

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| ACL evaluate FR-13 (`filterAccessiblePageIds`) | fork `permissions`; ENG-1373; internal-api `POST /internal/acl/filter` REAL | engine | **partial** — real, BUT `evalPage` returns space-level actions, **ignores page-level restriction** (ENG-2482) | ENG-1373 (Done), ENG-2482 (Todo) | parity-gap |
| Scoped-token intersection + CASL enforcement | fork; ENG-1454; per-page permission reads ENG-1596 | engine | **done** | ENG-1454, ENG-1596 (Done) | covered |
| Force-authz policy resolver | fork `authz/force-policy.resolver.ts` | engine | **done** | (part of ENG-1454) | covered |
| **Upstream EE page-level access/permissions feature** | **fork DELETED it** — `apps/client/src/ee/page-permission/*` 13 files/1438 lines removed; server `ee/page-permission` gone | ? (was upstream EE) | **removed by fork** — no replacement found; **decision needed: intentional cut vs re-add** | — none | dropped-by-decision *(flag for review)* |

### A.6 Audit

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| In-process transactional audit sink (feeds outbox) | fork `orvex/audit/orvex-audit-write`; ENG-1396 | engine (sink) | **done** | ENG-1396 (Done) | covered |
| External-agent audit-write endpoint | wiki-api `POST /v1/audit` (route exists); ENG-1462 | wiki-api | **partial / unusable** — production `notImplementedAuditVerifier` 401s **every** token regardless of flag (`audit_verifier.go:49`) | ENG-1462 (Done), ENG-2538 (Todo) | parity-gap |
| Audit read / query API | fork `orvex/audit/orvex-audit-read` | **audit** (R16/R25: `orvex-studio-audit` owns storage+query) | **reservation** — moves off these surfaces; emit-only | R16/R25 | dropped-by-decision |
| Audit dual-write (client) | docmost-cli `internal/audit/dualwrite.go`; orvex-cli `audit record/log` STUB | cli (emits) | **missing** — cli audit stubbed | ENG-2558 (Todo) | parity-gap |
| 22 Linear audit labels | fork `ee/audit` | **DROP** | **dropped** | D-S11 | dropped-by-decision |

### A.7 Spec-gate / drift (wiki-first governance)

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Wiki-first spec-gate | fork `spec-gate`; moved to wiki-api (D-S8); wiki-api `POST /v1/.../spec-gate/check` = 501 STUB; `specgate.Gate.Check` = `ErrNotImplemented`; cli `spec gate check` stub | wiki-api | **missing** — scaffolded, not wired | ENG-2537 (Todo), ENG-1463 (canon amend, Done) | parity-gap |
| Living-wiki drift verify | fork `drift`; wiki-api ENG-1464 (`verifyPage`/`getDrift` REAL); engine drift stamps ENG-1379; cli `wiki verify drift` REAL | wiki-api + engine stamps | **done** — drift real; ratify-gate transport 501 pending | ENG-1464, ENG-1379 (Done); ENG-2536 (Todo) | covered |
| **Human-gated transport (`needs_human_publish`/`needs_human_confirm` + verbatim RATIFY/CONFIRM)** | governance chain (decisions §3): engine mints (D-A8) → wiki-api transports → mcp/cli transport; MCP publish-gate REAL; wiki-api types exist but `specgate.Check` unwired | wiki-api + mcp + cli (transport) | **partial** — MCP publish/ratify gate live (`governance.ts`); wiki-api/cli transport scaffolded-not-wired | ENG-2529 (wiki-api), ENG-2464 (mcp), ENG-1405 (mcp, Done) | parity-gap |

### A.8 Quota (LAUNCH GATE M1)

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Quota enforcement at write chokepoint (402 QUOTA_EXCEEDED) | ENG-1382; `EntitlementService.assertWithinQuota` at 6 sites incl. collab path; 402 fires on prod | engine | **done** (enforcement) | ENG-1382 (Done); ENG-2490/2491 (Todo, re-propose) | covered |
| Quota READ endpoint (`GET /api/orvex/quota`) | engine `orvexGetQuota` = honest 501; wiki-api relays | engine + wiki-api | **missing** — enforcement shipped ahead of the usage-meter read | ENG-2493 (Todo, quota-state query) | parity-gap |
| Redis fast-counters + reconciliation + fail-open/closed tradeoff | ENG-1382 partial; A-QUOTA-HARDENING: **fail-open-on-Redis-loss lacks a filed ADR** despite meeting CS §9 triggers | engine | **partial** | ENG-2490/2492 (Todo) | parity-gap |
| Quota inert on dev cell (defect) | ENG-2053 — modules off + billing unwired → unbounded writes | engine | **defect (P1)** | ENG-2053 (Todo) | parity-gap |

### A.9 Share / import / export / comments / attachments

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Native share (upstream) | untouched by fork | engine | **done** (irreducible upstream core) | — | covered |
| Per-page export (markdown FR-18 + embed-resolved `text_repr` FR-38) | fork `llms` `page.md`; engine `GET /internal/pages/{id}/export` REAL, enriched to `{text_repr,title,space,slug_id}` (`b2f60c22`); ENG-1957 | engine primitive | **done** — **but contract-undocumented** (see drift §D) | ENG-1957 (Done); ENG-2483 (Todo, real audit-service binding) | covered |
| GDPR user-data export | fork `user-export` ENG-1473; **still selects `linearIntegrations` at `orvex-user-export.controller.ts:73`** | engine | **done** — needs Linear-row strip on removal | ENG-1473 (Done) | covered *(Linear cleanup owed)* |
| Bulk import/export markdown | wiki-api `POST /v1/import` REAL; cli `migrate scan/apply/verify` REAL (matches `{resource}=wiki` grammar) | wiki-api front | **done** | ENG-1560 (Done), ENG-1461 (Done); ENG-2559 (Todo) | covered |
| Space export (`/api/spaces/{id}/export`) | contracts draft; **wiki-api has no spaces resource** | wiki-api / engine | **missing** | — none | parity-gap |
| Comment CRUD + resolve/unresolve | fork resolve primitive + upstream core; cli `wiki comment` **calls `/v1/comments` — route does not exist** (`server.go`); MCP `wiki_comment_post` REAL (studio-api gated, R-SEAM-1) | engine primitive + wiki-api front | **broken** — cli 404s (same class as spaces bug); wiki-api has no `/v1/comments` | ENG-2557 (cli, Todo) | parity-gap |
| Comment/attachment/space/permission/workspace CloudEvents | contracts `events/catalog.yaml` 32 `wiki.*` types; ENG-1609 lifecycle-emitter coverage | engine outbox | **done** (schemas + emitters) | ENG-1609 (Done) | covered |
| Attachments admin + S3 storage admin | fork `attachments`; ENG-1433 | engine config | **done** | ENG-1433 (Done) | covered |
| Binary attachment up/download (agent-facing) | wiki-api front; cli `wiki attach` **calls `/v1/attachments` — route does not exist** | wiki-api | **broken** — cli 404s | ENG-2557 (Todo) | parity-gap |

### A.10 API keys / session / identity (OIDC / SCIM / Clerk)

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| API-key auth + CRUD (FR-11) | was EE-derived (`ee/api-key` 650 LOC); **now clean-room `core/api-key` (9 files), `ee/api-key` empty**; ENG-1380 | engine | **done** — licensing risk closed | ENG-1380 (Done); ENG-2498 (Todo, re-propose) | covered |
| Session-mint / exchange-token (FR-15, RS256/JWKS) | engine `core/session-mint` REAL; contract `orvexSessionExchange` still 501; wiki-api `session_exchange` opt-in; native login removed ENG-1490 | engine (identity landing) | **partial** — module real; `orvexSessionExchange` op still contract-501; full JWKS cutover Todo | ENG-1409, ENG-1490 (Done); ENG-2499 (Todo) | parity-gap |
| OIDC SSO stack (provider CRUD/PKCE/JIT/group-sync/avatar, 5 controllers) | fork `orvex/oidc`; DI-decoupled (`packages/orvex-oidc`) | identity | **missing-from-split** — still engine-resident, not lifted to identity | ENG-1409 (session landing, Done) | parity-gap |
| SCIM 2.0 Users+Groups | fork `orvex/scim` (10 files, 1470 ins) | identity | **missing-from-split** — retained in engine, untyped `any` bodies, not lifted | — `[identity — not censused]` | parity-gap |
| Clerk exchange→provision→deprovision (4 controllers, 4516 ins) | fork `orvex/clerk`; **BUT engine HEAD has 0 clerk files, NO deprovision route** (MR-W4, locally confirmed); ENG-1387 thin UI Done | identity | **partial / contested** — engine serves `POST /internal/principals/provision` but no clerk/* and no deprovision; lifecycle ownership unsettled | ENG-1387 (Done); MR-W4 unresolved | parity-gap |
| Clerk tenancy resolver (`domain.middleware`, symmetric secret) | fork ~40 lines, anti-pattern | engine (until retired by RS256/JWKS) | **partial** | ENG-2499 (Todo) | parity-gap |
| API-key management CLI (`docmost-cli apikey force-grant`) | dropped — SSO-only now | cli **DROP** | **dropped** | — | dropped-by-decision |

### A.11 MCP transport / url-fetch / studio verbs

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| In-fork `/mcp` Streamable-HTTP transport (73 tools) | fork `orvex/mcp`; **engine DELETED it** — gate `mcp-surface-shed-at-parity.spec.ts` proves zero transport | **DROP** (at satellite parity) | **done (shed)** — engine gate-enforced | ENG-1481 (Done) | covered |
| SSRF-guarded URL fetch | fork `url-fetch`; MCP ENG-1361 | mcp | **done** | ENG-1361 (Done) | covered |
| Studio verb grammar (get/search/list/save/edit) | fork `orvex/studio`; moved to wiki-api (D-S8); ENG-1368 | wiki-api | **done** — Linear adapter branch dropped | ENG-1368 (Done) | covered |

### A.12 Transclusion / labels / infra / content-handle

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| Transclusion-impact read (FR-10) + write-block safeguard | fork `transclusion-safeguard`; ENG-1470; client 409 conflict modal | engine | **done** | ENG-1470, ENG-1474 (Done); ENG-2485 (Todo) | covered |
| Space/workspace-scoped labels | fork `orvex/labels`; ENG-1385; cli `wiki label` **calls `/v1/labels` — 404** | engine + wiki-api front | **partial** — engine done; cli broken; wiki-api has no `/v1/labels` | ENG-1385 (Done); ENG-2557 (Todo) | parity-gap |
| §13 AGPL source-offer + info/capabilities | engine `orvex-source` REAL; ENG-1491; descriptor leaves to wiki-api (D-S18) | engine (§13) + wiki-api (descriptor) | **done** — but residual upstream `version.controller.ts` reconcile (ENG-2500) | ENG-1491, ENG-1466 (Done); ENG-2500 (Todo) | covered |
| `/metrics` Prometheus | engine ENG-1360 | engine + lib registry | **done** | ENG-1360 (Done) | covered |
| Health / liveness / readiness | engine ENG-1384; wiki-api `/health` REAL | engine + wiki-api | **done** | ENG-1384 (Done) | covered |
| Mail SMTP admin | fork `mail`; ENG-1433 | engine config | **done** | ENG-1433 (Done) | covered |
| Markdown↔DfM convert + fidelity | wiki-api `/v1/convert/*` REAL (in-process `pkg/dfm`); ENG-1461; `@orvex/dfm` package REAL | wiki-api + engine | **done** — 3 legacy `/v1/convert/*` paths remain 501 stubs | ENG-1461 (Done); ENG-2487 (Todo) | covered |
| Oversized-page content handle | fork `content-handle`; wiki-api ENG-1367 (Redis content-handle) | wiki-api | **partial** — in-memory store breaks multi-node; body-offload ENG-2534 Todo | ENG-1367 (Done); ENG-2534 (Todo) | parity-gap |

### A.13 Linear subsystem (27 controllers, 7846 ins) — full DROP (D-S11)

| Capability | Evidence | Target | Verdict |
|---|---|---|---|
| Linear OAuth / webhook / issue R/W / bulk / project / cycle / roadmap / view / graph / search / resync / image / settings + Story-10.1 dashboard + 6 DB tables | fork `orvex/linear/*`, `page-blocks/handlers/linear.ts`, `user-export.controller.ts:73` | **DROP** | dropped-by-decision |
| **⚠ Linear issue-file RELAY still live at HEAD** | wiki-api `POST /api/integrations/linear/issues` (`internal/linearrelay`, router.go:66) STILL SHIPS | **DROP (pending removal)** | dropped-by-decision *(misaligned — still present, see §b)* |

### A.14 Cross-cutting UNBUILT launch gates

| Gate | Evidence | Target | Coverage@HEAD | Ticket | Verdict |
|---|---|---|---|---|---|
| **Transaction-scoped fail-closed RLS (M3)** | `grep "ROW LEVEL SECURITY" apps/server` = **0** (locally confirmed twice); isolation is app-level `workspace_id` only, 278 raw-SQL sites | engine | **missing** | ENG-2502 (Todo) | parity-gap |
| Transactional outbox → Kafka (FR-17, M2) | ENG-1383; `OutboxWriter`+`OutboxRelay` REAL, **proven on prod** | engine | **done** | ENG-1383 (Done); ENG-2494 (Todo re-propose) | covered |
| Cross-cell tenant-move step-API (quiesce/export/import/activate) | engine 4× 501 (`orvex-tenant-move.controller.ts`); wiki-api `/v1/tenant-move/{step}` draft-stub | engine | **missing** | ENG-2509 (Todo) | parity-gap |
| Tenant suspension enforcement (FR-22) | unwired `tenant status` | engine | **missing** | ENG-2505 (Todo) | parity-gap |
| Sever upstream Stripe seat-sync from AGPL core (MR-W2, legal risk) | still routes via `workspace-invitation.service.ts` | engine → billing event | **missing** — blocks ENG-2504 | ENG-2504 (Todo) | parity-gap |

---

## B. CLIENT-SIDE PARITY MATRIX (Docmost fork `apps/client`, 286 files)

| Capability | Evidence | Target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|---|
| 5 non-Linear TipTap nodes (chart/freshnessRibbon/changelog/orvexDashboard) + `AiAuthored` mark; UniqueID stamping 3→~30 node types | client `extensions.ts` | engine-client | **done** for non-Linear | ENG-1377, ENG-1460 (Done) | covered |
| Linear nodes (linearEmbed/linearGraph/mention) + settings + slash items | client gated on `workspace.settings.linear.enabled` | **DROP** | **dropped** | D-S11 | dropped-by-decision |
| Page-lifecycle UI (status control / supersede+archive modals / superseded banner / tree dim+toggle) | client `PageStatusControl`,`SupersedePageModal`,`SupersededBanner`,`show-superseded-atom` | engine-client + wiki-api data | **done** | ENG-1440 (Done) | covered |
| AI-provenance badge (distinct from QMS verify badge) | client `PageProvenanceBadge`,`provenance-status.ts` | engine-client + engine data | **done** | ENG-1460 (Done) | covered |
| QMS verification badge + tables | ENG-1459 | engine (entitlement-flagged) | **done** | ENG-1459 (Done) | covered |
| AI chat surface (canvas / branch / citations / 6 tool-previews / cost) | client `ee/ai-chat` (largest block) | client thin UI + ai satellite | **partial** — thin UI shipped; ai chat backend unhomed | ENG-1359 (Done) | parity-gap |
| Inline AI (`/ai` prompt, `AiPalette` Mod+J, bubble AI, 12-lang translate) | client `ee/ai-inline`, `ai-palette`, `translate-picker-menu` | engine-client UI + ai stream | **partial** — UI done; ai inline backend stub | ENG-1395 (Done) | parity-gap |
| AI settings / memory / prompt-library / usage dashboards | client `orvex-ai-settings`,`AiMemorySettings`,`AiPromptLibrary`,`AiUsageDashboard` | satellite-backed + thin client | **missing** — ai/console backends | — `[satellite — not censused]` | parity-gap |
| AI-authored diagram pipelines (drawio `emit_drawio`, excalidraw bake) | client `drawio-view`, `bakeExcalidrawScene`, headless `/excalidraw-bake` Playwright route | engine-client + satellite worker | **partial** — client render fidelity Done; bake worker unhomed | ENG-1391 (Done) | parity-gap |
| Events / audit admin UI (log / connections / settings tabs) | client `ee/events/orvex-events-settings` | console (satellite) | **missing** — console backend not inventoried | — `[console — not censused]` | parity-gap |
| Device-auth approval page | client `device-approval-page.tsx` (328 lines) | engine-client | **done** | ENG-2059 (Done) | covered |
| Clerk login POC + org switcher | client `clerk-login.tsx` | identity thin + client | **partial** | ENG-1387 (Done) | parity-gap |
| Multi-select + context-menu primitive | ENG-1408 | engine-client | **done** | ENG-1408 (Done) | covered |
| Orvex Mantine theme + i18n (`orvex.json` locale) | ENG-1435 | engine-client | **done** | ENG-1435 (Done) | covered |
| Transclusion conflict modal (409) | client `transclusion-conflict-modal` | engine-client | **done** | ENG-1474 (Done) | covered |
| Per-page permissions UI | ENG-1375 | engine-client | **done** | ENG-1375 (Done) | covered |
| Client shell + realtime + thin-UI wiring; diagram fidelity | ENG-1388, ENG-1391 | engine-client | **done** | ENG-1388, ENG-1391 (Done) | covered |
| **Upstream EE page-level access/permissions UI** | **fork removed** 13 files/1438 lines | ? | **dropped-by-fork** *(review needed)* | — none | dropped-by-decision |

---

## C. `docmost-cli` → `orvex-cli` COMMAND PARITY (371 cmd files, ~30 groups)

| docmost-cli surface | orvex-cli target | Coverage@HEAD | Ticket(s) | Verdict |
|---|---|---|---|---|
| `page get/list/create/update/patch/upsert/delete/replace/edit/scaffold/trash/purge/move/restore/duplicate` (core CRUD) | cli `wiki page` (15 verbs) | **done** — real handlers; CAS `--if-version`, dup-guard exit 8, DfM in-process via `pkg/dfm`; write-format reject | ENG-1495 (Done); ENG-2554 (Todo) | covered |
| `page tree / backlinks / breadcrumbs / mentions / resolve-slug / permissions / transclusion-impact` | cli `wiki nav` | **done** | ENG-1495 (Done); ENG-2555 (Todo) | covered |
| `page ratify / supersede / restore-content / revert / history / diff / version` | cli `wiki governance` + `wiki history` | **done** (route-match not re-verified for every one) | ENG-1495 (Done); ENG-2558 (Todo) | covered |
| `page block` / `pb` (28 embed subtypes) | cli block authoring (21 non-Linear) | **partial** — `diagram` real; general block authoring Todo | ENG-2556 (Todo) | parity-gap |
| `page mirror pull/push/watch` | cli `wiki mirror` | **partial** — pull/push real (offline DfM↔PM); `watch` stub | ENG-2566 (Todo) | parity-gap |
| `search <query> --mode keyword/hybrid/semantic --cached` | cli `search` | **partial** — keyword/semantic/hybrid real (fixed to route via wiki-api `/v1/search`); related/duplicates/attachment-search stub | ENG-1519 (Done); ENG-2567 (Todo) | parity-gap |
| `ai ask/image/cost/reembed` | cli `ai` | **partial** — ask/cost/image real; chat/inline/models stub | ENG-1557 (Done); ENG-2568 (Todo) | parity-gap |
| `auth login/logout/status/whoami/use/list-profiles` | cli `auth` | **done** — real OIDC RP flow + headless `--token`; keyring/file store | ENG-1516, ENG-1956 (Done); ENG-2574 (Todo) | covered |
| `migrate scan/apply/verify` | cli `migrate` (top-level) | **done** — most-real bulk path; matches grammar | ENG-1560 (Done); ENG-2559 (Todo) | covered |
| `verify lint/links/orphans/render/space/duplicates/staleness/drift/ia-conformance` | cli `wiki verify` | **partial** — only `drift` real; rest stub; `render` full-binary stub | ENG-1556 (Done); ENG-2560 (Todo) | parity-gap |
| `spec gate check` | cli `wiki spec gate` | **missing** — stub (server-side 501 too) | ENG-2560 (Todo) | parity-gap |
| `space create/delete/get/list/update/permissions/confirm-gate/member` | cli `wiki space` | **missing (permanently stubbed)** — **wiki-api has NO spaces resource** (`{resource}=wiki` only); honest local `NOT_IMPLEMENTED` | — none (server gap) | parity-gap |
| `comment add/edit/get/list/resolve/rm` | cli `wiki comment` | **broken** — client calls `/v1/comments`, route absent → 404 | ENG-2557 (Todo) | parity-gap |
| `label list/pages` + `page label add/list/rm` | cli `wiki label` | **broken** — `/v1/labels` absent → 404 | ENG-2557 (Todo) | parity-gap |
| `attachment get/list/orphans/rm/search/upload/upload-url` | cli `wiki attach` | **broken** — `/v1/attachments` absent → 404 | ENG-2557 (Todo) | parity-gap |
| `user get/invite/activate/deactivate/delete/list/me/search` | cli `admin user` | **missing** — admin namespace 100% stub | ENG-2569 (Todo) | parity-gap |
| `workspace info/integrations/invitations/settings/confirm-gate` | cli `admin workspace` | **missing** — stub | ENG-2569 (Todo) | parity-gap |
| `audit log/summary` + dual-write | cli `audit record/log` | **missing** — stub; dual-write not wired | ENG-2558 (Todo) | parity-gap |
| `config edit/get/set/show/unset` | cli `config` | **partial** — `endpoints` real, `set`/`migrate` stub | — | covered |
| `daemon run/status/stop/start/restart/install` + `cache sync/check/clear/diff/info/mirror` | cli `daemon` + `cache` | **partial** — `daemon run`/`__daemon` real, `cache path`/`link` real; rest stub | ENG-1513 (Done); ENG-2570-2573 (Todo) | parity-gap |
| `doctor` | cli `doctor` | **done** | — | covered |
| `instructions` (+embeds catalog) | cli `instructions` | **done** — `ErrorCodeRegistry()` golden-tested | ENG-1515 (Done) | covered |
| `screenshot manifest/refresh/shot` | cli `wiki screenshot` | **partial** — full-binary (`orvex-full`) gated stub | ENG-1561 (Done); ENG-2561 (Todo) | parity-gap |
| `code graph` (tree-sitter) | cli `wiki code graph` | **partial** — full-binary gated (`REQUIRES_FULL_BINARY`) | ENG-1556, ENG-1960 (Done); ENG-2561 (Todo) | parity-gap |
| `link/unlink` (symlink canonical mirror) | *absent* | **missing** — no equivalent in orvex-cli | — none | parity-gap |
| Safety machinery: CAS 3-baseline classifier / dup-guard / ratify-confirm gates / audit dual-write | cli — CAS real, dup-guard exit 8, gate exit 9; audit dual-write stub; ratify/confirm transport partial | **partial** | ENG-1521 (Done) | parity-gap |
| `issue create` (SSO-relayed bug filing) | cli `wiki issue create` | **done BUT Linear** — relays via wiki-api server-held platform key; **now against drop-Linear mandate** | ENG-1484 (Done) | dropped-by-decision *(misaligned)* |
| `apikey force-grant` | *dropped (SSO-only)* | **dropped** | — | dropped-by-decision |
| `linear view` + `issue` Linear surface + 6 linear embeds | *dropped* | **dropped** | D-S11 | dropped-by-decision |
| Rate-limiting awareness / batch ops / device-code auth (client) / Loki log query / role administration | *absent* | **missing** — no equivalent (docmost-cli had `internal/{ratelimit,batch,deviceauth,lokiquery,roles}`) | — none | parity-gap |

---

## (a) TOP GAPS RANKED BY PRODUCT IMPACT FOR 10k-CUSTOMER EXPOSURE

1. **Transaction-scoped fail-closed RLS is 0% built (M3 launch gate).** `grep "ROW LEVEL SECURITY" apps/server` = 0 policies at HEAD (locally confirmed). Tenant isolation is app-level `workspace_id` filtering across 278 raw-SQL sites; PgBouncer transaction pooling means a session-`SET` would leak. At 10k tenants this is a cross-tenant data-disclosure catastrophe waiting for one missed filter. **Owner: engine. ENG-2502 (Todo).**

2. **`orvex_page_meta` side table was never physically created (G1).** 18 fork product columns still live on the upstream `pages` table (16 in `page.repo.ts baseFields`). Every lifecycle/provenance/supersession feature rides columns that block safe upstream rebase and are the single biggest divergence-budget risk. **Owner: engine. ENG-2480 (Todo)** — note ENG-1371 is marked Done but the move never happened.

3. **The wiki-api edge auth is a no-op and `/v1/audit` is unusable.** `requireScope` is a pure passthrough unless `IDENTITY_VERIFY_ENABLED=true`, and the production `notImplementedCallerVerifier`/`notImplementedAuditVerifier` **401 every request** — so turning identity-verify ON today breaks the whole gated ladder, and `/v1/audit` 401s unconditionally regardless of the flag. For 10k customers the composition tier's ACL story is delegated entirely to the engine's own 401; there is no working edge enforcement. **Owner: wiki-api + identity. ENG-2054 (Todo P1), ENG-2461-2463 (mcp), ENG-2514-2515 (Todo).**

4. **Quota READ + hardening incomplete; quota inert on dev.** Enforcement (402) is real on prod, but `GET /orvex/quota` is an honest 501 (no usage meter for billing/UX), the fail-open-on-Redis-loss tradeoff has no filed ADR (CS §9 triggers met), and quota is entirely inert on the dev cell (ENG-2053, modules-off + billing-unwired → unbounded writes). At 10k paying tenants, no usage read + a fail-open storage path = overage and cost leakage. **Owner: engine + billing. ENG-2493/2492/2053 (Todo).**

5. **wiki-api serves NO `/v1/comments`, `/v1/labels`, `/v1/attachments`, or spaces resource — and the CLI ships broken clients against all four.** `orvex-cli`'s `wiki comment/label/attach` and `wiki space` call routes that don't exist in `internal/server/server.go` (the exact defect class already caught once for `wiki space`). Comments/attachments/labels/space-management are table-stakes wiki features that are 404 or permanently-stubbed across the agent/CLI surface. **Owner: wiki-api (add resources) + cli. ENG-2557 (Todo); spaces has NO ticket.**

6. **The entire AI *product* surface (chat / memory / prompts / usage / settings) has no shipped satellite backend.** The largest fork client block (`ee/ai-chat`) and the full `ee/ai-settings` suite have only a thin UI (ENG-1359/1395 Done) — the `ai`/memory satellite backends are not inventoried, and MCP's `memory_*`/`staging_*`/`workgraph_*` (7 of 13 hero seats) are permanent `NOT_AVAILABLE_YET` scaffolds. The differentiated AI experience the fork built is not reachable end-to-end. **Owner: ai + mcp. ENG-2471 (memory), ENG-2568 (cli); most `[satellite — not censused]`.**

7. **Identity lift is incomplete: OIDC/SCIM still engine-resident, Clerk provisioning half-there, no deprovision route.** OIDC (5 controllers) and SCIM (10 files) have not moved to `identity`; the engine has **0 clerk files and no deprovision route** at HEAD (MR-W4) while a 4516-insertion Clerk subsystem exists in the fork. Provisioning/deprovisioning 10k orgs cleanly (GDPR erasure, org offboarding) is not solved. **Owner: identity. ENG-2499 (session cutover); OIDC/SCIM `[identity — not censused]`.**

8. **Cross-cell tenant-move + tenant-suspension are 501/unwired.** `orvexTenantMove{Quiesce,Export,Import,Activate}` all 501; FR-22 suspension wires nothing. For a 10k-tenant multi-cell topology, you cannot rebalance cells or suspend an abusive/non-paying tenant near-instantly. **Owner: engine. ENG-2509, ENG-2505 (Todo).**

9. **Live prod 502: wiki-api `KNOWLEDGE_URL`/`AI_URL` point at NXDOMAIN.** `GET /v1/search` returns 502 UPSTREAM_UNAVAILABLE in prod (ENG-2082) — sitting in **Backlog**, not Todo, despite being a P2 prod outage of the flagship search path. **Owner: wiki-api/infra. ENG-2082 (Backlog).**

10. **Spec-gate (wiki-first governance) is scaffolded-not-wired.** `specgate.Gate.Check` returns `ErrNotImplemented`; wiki-api `/v1/.../spec-gate/check` and cli `spec gate check` are 501/stub. The doc-governance value prop is not enforceable. **Owner: wiki-api. ENG-2537 (Todo).**

11. **Bake worker + diagram-render pipeline unhomed.** The Playwright excalidraw/mermaid bake worker (a previously-buggy subsystem, ENG-1351/ENG-2787) has no satellite home; diagrams render but AI-generated diagram baking is not end-to-end. **Owner: ai. `[satellite — not censused]`.**

12. **Contract drift with no CI signal.** `/internal/pages/{id}/export` (the knowledge-indexer seam this branch just enriched) has **zero** representation in `orvex-studio-contracts`; the `served-openapi-diff` gate that would catch it is `x-status: draft`/unwired; contracts tag `v0.1.3` still reflects the retired flat-verb grammar. Consumers codegen from stale contracts. **Owner: contracts. ENG-2535 (Todo).**

---

## (b) TICKETS THAT ARE OBE OR MISALIGNED

### OBE — Todo clusters that re-propose already-shipped Done work

| Cluster | Re-proposes (already Done) | Read |
|---|---|---|
| **MCP: ENG-2449-2475, 2707, 2801-2802 (33 Todo)** — "Streamable-HTTP server core" (2449), "hero surface + list_tools" (2450), "whoami" (2451), "get_page read ladder" (2453), "save_page/edit chokepoint" (2454), "TS verifier→scope gate" (2461), "golden-tape KPI harness" (2472), "decommission packages/orvex-mcp 73→parity" (2475) | ENG-1361/1401-1407/1496/1499/1500 (Done) — MCP live 19/19→hero-13 on `mcp.orvex.dev`, 6/6 E2E green 2026-07-17 | **Mostly OBE.** BUT the 2026-07-17 hero-13 WDS re-baseline (`ZGjLctEnGH`) is a genuine v2 — some (e.g. 2450 hero-13, 2801 tools.ts tier-split) are re-scoped, not pure dup. **Per-ticket reality-probe required** against dev HEAD `8076395` before scheduling. |
| **wiki-api: ENG-2511-2543 (33 Todo)** — "Go service skeleton + /healthz" (2511), "verb dispatch search/get/save/edit/list" (2522), "CAS ifVersion→409 receipt" (2528), "drift verification" (2536, verbatim dup of Done 1464), "external-agent audit-write" (2538, dup of Done 1462) | ENG-1366-1969 (Done), incl. **ENG-1969 mounted /v1 into `cmd/wikiapi`** — /v1 serves real content | **OBE.** ENG-1969 says /v1 is live, so 2511 "skeleton" / 2513 "draft /v1 scaffold" are stale. **Bright spots (NOT OBE):** ENG-2532 (generic `orvex_dashboard`, no linear_*), ENG-2537 (de-Linearized spec-gate) — intentional de-Linearization. |
| **CLI: ENG-2544-2578 (35 Todo)** — "from-scratch scaffold + AGPL guard" (2544, dup of Done 1419), "namespace cobra tree" (2549), "Page CRUD verb grammar" (2554, dup of Done 1495), "auth→identity profiles" (2574, dup of Done 1516/1956), "docmost-cli parity harness" (2553, dup of Done 1521) | ENG-1419/1425/1495/1513-1521/1554-1971 (Done) — real 17,913-LOC tested binary at HEAD | **OBE.** Caveat: the CLI is **CI-RED since 2026-07-13** (D-CLI1 false-green) and has the comment/label/attach 404 defect — so some 25xx tickets should be *re-scoped as fixes*, not net-new builds. |
| **Engine: ENG-2476-2510 (Wave-3 factory, ~35 Todo)** — mixed | ENG-1371/1373/1382/1383/1397/1652 (Done) partially re-proposed by ENG-2480 (side-table), 2481 (apply-ops), 2482 (ACL), 2490/2491 (quota), 2494 (outbox) | **MIXED — not blanket OBE.** ENG-2480 (side-table move) and ENG-2482 (evalPage fix) are *genuinely unfinished*. ENG-2502 (RLS), 2504 (Stripe sever), 2505 (suspension), 2509 (tenant-move) are *real net-new*. Triage per-ticket. |

### Misaligned — Done tickets now contradicting the drop-Linear mandate

| Ticket | Project | State | Misalignment |
|---|---|---|---|
| **ENG-1483** | Orvex Wiki API | Done | Built the Linear issue-create relay; **`POST /api/integrations/linear/issues` still ships at HEAD** (`router.go:66`). Now against policy — pending-removal candidate. |
| **ENG-1484** | Orvex CLI | Done | Built `orvex wiki issue create` SSO-relayed Linear filing. Same misalignment — the relay endpoint it targets is Linear-shaped. |
| **ENG-1465, 1467, 1463, 2532, 2537, 2562** | Wiki API | Done/InProg/Todo | *Correctly ALIGNED* (de-Linearized) — flagged only to distinguish them from the two above. ENG-2562's "linear opaque-preserve" refers to opaque-node handling, not Linear-the-product — verify wording. |

### Self-flagged canon-drift tickets (valid, pre-existing)

- ENG-2804 (Wiki API) — PRD FR-A4 claims engine title/NL resolver primitives ruled nonexistent (ENG-1934).
- ENG-2800 (MCP) — PRD FR-M19 doesn't carve out `memory_get`'s read-leg-to-knowledge.
- ENG-2795 (CLI) — define FR-CLI21 golden-corpus parity test.

### Open defects worth priority re-check

- **ENG-2054** (Wiki API, Todo, P1) — single-host ingress hides the split (`/api/ai`+`/mcp` served by monolith). Directly undercuts the thin-engine/satellite mandate.
- **ENG-2082** (Wiki API, **Backlog**, P2) — `KNOWLEDGE_URL`/`AI_URL` → NXDOMAIN, prod `/v1/search` 502. A live prod outage mis-prioritized as Backlog.
- ENG-2039-2053 (engine defect cluster) — dev-cell instability, DfM/PM 502s, apply-ops hang, list-item drop, quota inert. Real, filed, mostly Todo.

---

## (c) CAPABILITIES WITH NO TICKET (in the 4 censused projects)

> **Caveat:** the AI/knowledge/identity/console/billing satellites are *separate Linear projects not censused*. Items tagged `[satellite]` may be ticketed there. Only items tagged `[genuinely no ticket]` appear unhomed across the whole program on the evidence available.

**AI product surface (target: `ai` — `[satellite — not censused]`):**
- AI prompts library backend (fork `ai-prompts`; client `AiPromptLibrary`)
- AI settings + LiteLLM virtual-key provisioning (fork `ai-settings`)
- AI usage/spend dashboard backend (fork `ai-usage`)
- AI tools-retry (fork `ai-tools-retry`)
- AI health probe / budget fan-in (fork `health`→`@orvex/ai`)
- Bake render worker (fork `bake-payload` + client Playwright `/excalidraw-bake`)
- AI chat product backend (fork `ai-chat`/`ai-chats`/`ai-draft`) — only the thin client (ENG-1359) is ticketed here

**Knowledge (target: `knowledge` — `[satellite — not censused]`):**
- Always-fresh tar-builder bundle export (FR-19)

**Identity (target: `identity` — `[satellite — not censused]`):**
- OIDC SSO stack lift (fork `orvex/oidc`, 5 controllers)
- SCIM 2.0 Users+Groups lift (fork `orvex/scim`, 10 files)

**Console (target: `console` — `[satellite — not censused]`):**
- Events/audit admin UI backend (fork+client `ee/events`)

**Genuinely no ticket anywhere in evidence:**
- **`wiki-api` spaces resource** — CLI space CRUD + members + confirm-gate is permanently stubbed because wiki-api serves no spaces resource (`{resource}=wiki` only). No ticket adds one. **[genuinely no ticket]**
- **`wiki-api` comment / label / attachment `/v1` routes** — cli clients 404 against them; ENG-2557 tracks the *cli* side but no ticket adds the *server* routes. **[server side genuinely no ticket]**
- **Space export** (`/api/spaces/{id}/export`) programmatic surface. **[genuinely no ticket]**
- **CLI `link`/`unlink`** (symlink canonical mirror into repo) — no orvex-cli equivalent, no ticket. **[genuinely no ticket]**
- **CLI parity depth dropped from docmost-cli:** rate-limit awareness, batch ops, client-side device-code auth, Loki log query, role administration internals — no ticket; may be intentional non-goals but undocumented as such. **[genuinely no ticket]**
- **Upstream EE page-level access/permissions** (fork *deleted* 13 files/1438 lines, server + client) — no re-add ticket; needs an explicit intentional-cut-vs-restore decision. **[genuinely no ticket — decision needed]**
- **Linear relay removal** (ENG-1483/1484 built it; nothing tracks *removing* `POST /api/integrations/linear/issues` per the drop-Linear mandate). **[genuinely no ticket — removal owed]**
- **GDPR export Linear-row strip** (`orvex-user-export.controller.ts:73` `selectFrom('linearIntegrations')`) — cleanup owed on Linear removal, untracked. **[genuinely no ticket]**

---

## D. Contract / doc drift touching parity (from evidence-contracts + canon files)

| Drift | Evidence | Impact on parity truth |
|---|---|---|
| `/internal/pages/{id}/export` enrichment (this branch, `b2f60c22`) undocumented | 0 hits across `orvex-studio-contracts` | The addressable-search seam has no contract; `served-openapi-diff` gate is draft — no CI catches it |
| `orvexApplyOps` still marked `noop-501` in engine `contracts/openapi.yaml`+`delivery-checklist.md` | STALE since `7487fc9d`; apply-ops is REAL | Trust the code, not the checklist, for apply-ops status |
| wiki-api contract grammar re-ratified (`0e63018`, 2026-07-16) but not tagged | tag `v0.1.3` still flat-verb grammar | Tag-pinned consumers (mcp/cli codegen) are behind live grammar; MR-A1 narrowed but wiki pages don't reflect it |
| Version-semantics split | read/write `version` = timestamp string; block-patch `If-Match` = integer `meta_version` | A read version cannot feed a write CAS today; flagged in-contract, unresolved |
| 5 canonical/PRD pages self-declare DRAFT | canon-cli, canon-engine, canon-wikiapi, canon-mcp | Doc status unreliable; this matrix judges against code |

---

## E. One-paragraph verdict for the PRD redo

At HEAD, the **engine's atomic primitives are real and mostly done** (apply-ops/apply-doc/CAS, outbox proven on prod, quota enforcement, api-key clean-room, session-mint, provenance, export enrichment, MCP transport shed) — but the **three structural launch gates are unbuilt or half-built**: transaction-scoped RLS (0 policies), the `orvex_page_meta` side-table move (never done), and the quota read/hardening path. The **wiki-api /v1 grammar is live and broad** (search/get/save/edit/list, read ladder, nav, drift, import, whole-doc PUT, blocks:batch, changes) but its **edge auth is a no-op, `/v1/audit` is unusable, spec-gate is a stub, and it serves no comments/labels/attachments/spaces resource** — which cascades into **shipped-but-broken CLI verb groups** (the same 404 class already caught once for `space`). The **MCP write path is genuinely live** (hero-13, `wiki_save`, `knowledge_search`, `ai_ask`, 6/6 E2E) but **7 of 13 hero seats and the whole memory/staging/workgraph surface are permanent scaffolds**, and the **entire AI product backend (chat/memory/prompts/usage/settings) plus OIDC/SCIM/Clerk identity lift live in satellite projects that are neither shipped here nor censused**. Linear is correctly dropped everywhere except **two Done relays (ENG-1483/1484) and a still-live `POST /api/integrations/linear/issues` endpoint** that need explicit removal. The three ENG-24xx/25xx "from-scratch" Todo clusters are **largely OBE re-proposals of already-Done work** and must be reality-probed (not scheduled) before the PRD treats them as remaining scope. Net: the platform is **code-real on primitives, gate-blocked on isolation/quota, and feature-gapped on the AI product + identity satellites** — a 7-surface E2E of 1 PASS / 5 FAIL / 1 BLOCKED is the honest baseline the redo must plan against.
