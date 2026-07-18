# Evidence Map — Server-Side Functionality the Docmost Fork Added vs Upstream

**Repo:** `/home/daniel/repos/docmost` (branch `dev`) · **Merge-base:** `a689cca7` · **Scope:** `apps/server` only (client/CLI/editor-ext out of scope per task)

**Top-line diff:** `git diff --stat a689cca7...HEAD -- apps/server` → **716 files changed, 132612 insertions(+), 849 deletions(-)**. Fork-added surface = **~76 controllers** counted directly in this pass (75 under `apps/server/src/orvex/*` + 1 under `apps/server/src/ee/api-key`), matching the wiki's cited "77 fork-added controllers" (off-by-one is immaterial — likely a since-merged or since-split file).

---

## 0. Wiki source status — read this before trusting any single citation below

The task specified two wiki pages as the authoritative disposition sources. Both resolved, but **both are archived/deprecated**, and each carries an explicit successor pointer. I followed the chain to the live canonical documents and used *those* as the authoritative disposition source, cross-checked against code. Deltas between the archived pages and the current canon are called out inline.

| Requested slug | Title | Status | Redirect note found on the page |
| --- | --- | --- | --- |
| `jb65enpnNh` | Orvex Fork — Divergence Ledger (vs upstream Docmost) | **archived**, space `docmost` (retired) | "⛔ DEPRECATED (2026-07-05)... no successor — historical record... Decisions herein may be superseded — the authoritative decision log lives in the `orvexwiki` space (`moQ2sdJCKD`)." |
| `yUXTXMFTjT` | Architecture: Docmost Split — Satellite Processes (Phase 1) | **archived**, space `docmost` (retired) | "⛔ DEPRECATED (2026-07-05)... The canonical home for this content is now: the `rBSZqx4gXE` in the `orvexwiki` space." |
| `moQ2sdJCKD` (followed) | Decision Records | **archived**, space `orvexwiki` | "This content has moved into the platform facts... See the Orvex Platform Canon index in the Orvex Studio Architecture space." |
| `rBSZqx4gXE` (followed) | **Split Plan — Engine ↔ Satellites (Disposition)** | **draft**, space `orvexwiki` | Live operational-cut disposition. States it was "Salvaged from the deprecated docmost-space page `yUXTXMFTjT`... and updated to the 2026-07-05 locked rulings." Points to `qJojHbWJni` §6 for the exhaustive matrix. |
| `qJojHbWJni` (followed) | **Orvex Wiki Program — Authoritative Study & Fold-In Plan** | **draft**, space `orvexwiki` | The exhaustive per-capability feature-disposition matrix (§6, ~300 lines) used as the primary disposition source below. |

**Used as ground truth for this report:** `rBSZqx4gXE` (compact operational cut) + `qJojHbWJni` §6 (exhaustive matrix, sections 6.1–6.15). Per the memory note *"Certified ≠ current"* and *program instruction* "if a wiki read fails, note it and continue from code" — these reads did **not** fail, they redirected to fresher canon, which I followed rather than reporting stale/archived content as authoritative. Per the org-standing memory note **Linear integration is DROPPED entirely** — this matches the live canon's **D-S11** ruling exactly (see §9 below), so no conflict with the task brief.

---

## 1. Method

1. `git diff --stat a689cca7...HEAD -- apps/server` (top-line + per-directory).
2. Enumerated every `*.controller.ts` and `*.module.ts` under `apps/server/src/orvex/*` and `apps/server/src/ee/*`.
3. Fetched and read the wiki disposition chain (§0 above) in full.
4. Cross-checked each feature area's code evidence (paths, LOC via diff --stat, route decorators) against the wiki matrix's "today (fork location) → target" rows.
5. Linear-related features are marked **DROP** per D-S11 and per the standing org memory instruction.

---

## 2. Full controller inventory (apps/server/src/orvex + ee)

75 controllers under `apps/server/src/orvex/*`, grouped by directory (`find apps/server/src/orvex -name "*.controller.ts"`):

| Dir | # controllers | Files |
| --- | --- | --- |
| `ai/` | 18 | `ai-ask`, `ai-bulk-reembed`, `ai-chat`, `ai-chats`, `ai-draft`, `ai-health`, `ai-images`, `ai-inline`, `ai-memories`, `ai-prompts`, `ai-related`, `ai-search`, `ai-settings`, `ai-tools-retry`, `ai-usage`, `bake-payload`, `page-duplicate-check`, `page-duplicates` |
| `attachments/` | 2 | `orvex-attachments-admin`, `orvex-storage-admin` |
| `audit/` | 2 | `orvex-audit-read`, `orvex-audit-write` |
| `clerk/` | 4 | `clerk`, `clerk-deprovision`, `clerk-provision`, `clerk-settings` |
| `content-handle/` | 1 | `content-handle` |
| `drift/` | 1 | `orvex-drift` |
| `events/` | 2 | `orvex-events-admin`, `orvex-events` |
| `health/` | 1 | `orvex-health` |
| `info/` | 1 | `orvex-info` |
| `linear/` | 15 | `linear-bulk`, `linear-cycle`, `linear-graph`, `linear-image`, `linear-issue`, `linear-issue-write`, `linear-oauth`, `linear-project`, `linear-resync`, `linear-roadmap`, `linear-search`, `linear-settings`, `linear-view`, `linear-webhook`, `orvex-dashboard` |
| `llms/` | 1 | `orvex-llms` |
| `mail/` | 1 | `orvex-mail-admin` |
| `markdown/` | 1 | `markdown` |
| `mcp/` | 1 | `mcp` |
| `metrics/` | 1 | `metrics` |
| `oidc/` | 5 | `oidc-auth`, `oidc-provider`, `oidc-refresh-avatar`, `oidc-sso-bridge`, `sso-admin-stub` |
| `page-blocks/` | 3 | `page-blocks`, `page-diff`, `schemas` |
| `page-metadata/` | 4 | `confirm-gate-settings`, `orvex-device-auth`, `orvex-page-metadata`, `ratify-gate-settings` |
| `page-provenance/` | 1 | `orvex-page-provenance` |
| `page-visuals/` | 1 | `orvex-page-visuals` |
| `permissions/` | 1 | `orvex-permissions` |
| `scim/` | 2 | `scim-provider`, `scim-token` |
| `space/` | 1 | `space-confirm-gate` |
| `spec-gate/` | 1 | `spec-gate` |
| `studio/` | 1 | `studio` |
| `transclusion-safeguard/` | 1 | `orvex-transclusion-impact` |
| `url-fetch/` | 1 | `url-fetch` |
| `user-export/` | 1 | `orvex-user-export` |

Plus `apps/server/src/ee/api-key/api-key.controller.ts` (1) — the still-EE-derived, unfinished-clean-room api-key controller (see §11).

**Note on ee/**: only `ee/api-key` and `ee/licence` exist server-side today (`find apps/server/src/ee -maxdepth 1 -type d`). All the other `ee/*` capabilities the wiki matrix references (ai-chat, ai-inline, ai-settings, ai-usage, billing, entitlement, mfa, page-permission, page-provenance, security, template, pdf-export, events) have **already been migrated server-side into `apps/server/src/orvex/*`** in this repo state (e.g. `orvex/page-provenance`, `orvex/permissions`, `orvex/events`, `orvex/ai`) — the wiki's `ee/*` citations for those describe an **older snapshot or the client-side counterpart** (`apps/client/src/ee/*`, out of scope here). Only api-key remains genuinely EE-derived server-side, matching the wiki's flagged high-licensing-risk finding.

---

## 3. Feature areas — disposition table (grouped, per task brief)

Legend for **Target**: `engine` = stays in orvex-wiki AGPL engine · `wiki-api` = orvex-wiki-api (Go) · `knowledge` = orvex-studio-knowledge · `ai` = orvex-studio-ai · `identity` = orvex-studio-identity · `billing` = orvex-studio-billing · `console` = orvex-studio-console · `contracts` = orvex-studio-contracts · `mcp` = orvex-studio-mcp · `client` = AGPL client bundle (thin UI) · `DROP` = deleted, not carried forward.

### 3.1 AI / ask / chat / image / inline-edit / bake-pipeline

| Capability | Evidence (path) | What it does | Target | Wave | Notes |
| --- | --- | --- | --- | --- | --- |
| AI chat (streaming, tool-calling, RAG) + chats CRUD + branching | `orvex/ai/ai-chat.controller.ts`, `ai-chats.controller.ts`, `ai-draft.controller.ts`; tables `ai_chats`/`ai_chat_messages`/`ai_drafts` | Full chat product surface | ai | 2 | Own DB tables move; upstream `ai_chats`/`ai_chat_messages` extended in place |
| Cited Ask (full ask loop) | `orvex/ai/ai-ask.controller.ts` | RAG-grounded Q&A with citations | ai | 2 | **D-A12: ai owns the full loop**, not wiki-api. wiki-api's `ask` verb and mcp's `ask` tool just delegate here |
| Inline AI edit (bubble/Cmd+J/`/ai`) | `orvex/ai/ai-inline.controller.ts` | In-editor AI rewrite/generate | ai (logic) / client (thin UI) | 2 | D-S4: SSE handlers are pure passthrough, no AI logic — thin UI stays client |
| AI image generation | `orvex/ai/ai-images.controller.ts` | Text-to-image for diagrams/illustrations | ai | 2 | |
| Memories CRUD | `orvex/ai/ai-memories.controller.ts` | Per-user/workspace AI memory store | ai | 2 | |
| Prompts library CRUD | `orvex/ai/ai-prompts.controller.ts` | Reusable prompt templates | ai | 2 | |
| AI settings + LiteLLM key provisioning | `orvex/ai/ai-settings.controller.ts` | Per-workspace encrypted virtual keys, spend caps | ai | 2 | Capped by billing-owned entitlement (D-S7); embedding spend is a separate nested budget (D-S15) |
| Usage/spend dashboard | `orvex/ai/ai-usage.controller.ts` | Token/cost tracking | ai | 2 | |
| Tools-retry | `orvex/ai/ai-tools-retry.controller.ts` | Retry failed tool calls in a chat | ai | 2 | |
| Bake pipeline (mermaid→mxGraph/Excalidraw render) | `orvex/ai/bake-payload.controller.ts` | Diagram-source → baked-image render worker (Playwright) | ai | 2 | **Whole pipeline → ai**, incl. render worker; page writes go back through the engine chokepoint |
| AI health probe (budget/LiteLLM/Tika/MCP fan-in) | `orvex/health/orvex-health.controller.ts` (imports `@orvex/ai`) | Aggregated AI-subsystem liveness | ai | 2 | Split out of engine's generic health; engine keeps only its own liveness probe |
| Related pages | `orvex/ai/ai-related.controller.ts` | Similarity-based page suggestions | knowledge | 1 | Ranking lives in knowledge (D-S14); ai consumes ranked results only |
| Semantic/hybrid search | `orvex/ai/ai-search.controller.ts` | Vector + keyword search | knowledge | 1 | Turbopuffer committed (D-S9), no tsvector fallback |
| Duplicate detection | `orvex/ai/page-duplicates.controller.ts`, `page-duplicate-check.controller.ts` | Near-duplicate page detection | knowledge | 1 | |
| Bulk re-embed admin | `orvex/ai/ai-bulk-reembed.controller.ts` | Re-run embeddings across corpus | knowledge (deleted from engine) | 1 | Engine `page_embeddings`/pipeline **deleted**; cross-DB FKs dropped |

**Directory size:** `orvex/ai/` = 62 files changed, **14,642 insertions** (largest single fork subsystem after page-blocks).

### 3.2 Search / knowledge / retrieval

| Capability | Evidence | What it does | Target | Wave | Notes |
| --- | --- | --- | --- | --- | --- |
| Engine search-suggest (ILIKE mentions/pickers) | engine `orvex/search` suggest path (referenced in wiki matrix §6.1) | Lightweight mention-picker autocomplete | **engine** (kept) | 0 | tsvector full-text **deleted** → knowledge; suggest stays |
| RAG retrieval core | `orvex/ai` retrieval (per matrix; embedding-backed) | `::halfvec(1536)` + HNSW pgvector retrieval | knowledge | 1 | Narrows through engine FR-13 ACL |
| Tika extraction + attachment search | `@orvex/attachments` Tika adapter, `attachments.text_content` | Full-text extraction from binary attachments | knowledge | 1 | Remove the tsvector write (contradicts D-S9) |
| SSE fan-out gateway + connection registry | `orvex/events/services/orvex-event-stream.service.ts`, `orvex-connection-registry.service.ts`, `orvex-event-retention.service.ts` (~2.5k LOC per matrix) | Real-time event stream to clients (Redis Streams-backed) | knowledge (data-plane) / console (admin) | 1/2 | Split: data-plane → knowledge, admin console → console (D-S6) |
| Always-fresh tar-builder (FR-19) | export tar path referenced from `orvex/llms` | Hard tenant-scoped, ACL-first bulk export bundle | knowledge | 1 | Fed by engine FR-18/FR-38 primitives |
| `llms.txt`/`llms-full.txt` sitemap projection | `orvex/llms/orvex-llms.controller.ts` (routes: `llms.txt`, `llms-full.txt`, `pages/:pageId/page.md`) | LLM-crawlable sitemap + full-corpus dump | knowledge (projection) / engine (page.md primitive) | 1 | `page.md` itself is an engine export primitive; the sitemap projection leaves |

**Directory size:** `orvex/events/` = 18 files, 3,160 insertions.

### 3.3 Embeds (diagrams / media / structure / tabular / math / external / Linear)

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Excalidraw scene util | `orvex/page-blocks/excalidraw-scene.util.ts` (81 LOC) | Bakes excalidraw scenes into pages | wiki-api (grammar) + ai (bake worker) | Composition in wiki-api; render worker in ai |
| Diagram block handler | `orvex/page-blocks/handlers/diagrams.ts` (446 LOC) | mermaid/drawio/excalidraw block CRUD | wiki-api | Block-grammar composition over the engine chokepoint |
| External embed handler | `orvex/page-blocks/handlers/external-embed.ts` (187 LOC) | Generic iframe/URL embed block | wiki-api | |
| Linear embed handler | `orvex/page-blocks/handlers/linear.ts` (646 LOC) | Linear issue/project/cycle/view embed blocks | **DROP** | D-S11 — delete wholesale with the 2 side-effect imports in `page-blocks.module.ts` |
| Math content handler | `orvex/page-blocks/handlers/math-content.ts` (381 LOC) | Math-block CRUD | wiki-api | |
| Media handler | `orvex/page-blocks/handlers/media.ts` (601 LOC) | Image/video/attachment block CRUD | wiki-api | |
| Orvex Dashboard handler | `orvex/page-blocks/handlers/orvex-dashboard.ts` (186 LOC) | Story-10.1 "flight director" cockpit block | **DROP** | D-S24 — 100% Linear-coupled; no shell kept. Rebuild from CloudEvents in console/ai if wanted later, not a carry |
| Structure block handler | `orvex/page-blocks/handlers/structure.ts` (355 LOC) | TOC/outline/section blocks | wiki-api | |
| Tabular block handler | `orvex/page-blocks/handlers/tabular.ts` (460 LOC) | Table block CRUD | wiki-api | |
| Block schema catalog | `orvex/page-blocks/schemas.controller.ts` (`GET /api/schemas/blocks`) | Machine-readable block-type schema | **engine** (schema) / wiki-api (grammar) | Engine owns the schema; wiki-api owns the write grammar over it |

**Directory size:** `orvex/page-blocks/` = 88 files, **16,686 insertions** (largest fork subsystem; `page-blocks.service.ts` alone = 2,101 LOC).

### 3.4 Page metadata / status / doc_type / lifecycle / supersession

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| `orvex_page_meta` lifecycle fields (status/doc_type/owner/last_reviewed/redirect/archive_reason/supersede) | `orvex/page-metadata/orvex-page-metadata.controller.ts` (430 LOC), `.service.ts` (**2,059 LOC**, 2,710-LOC spec) | Page status/doc_type/supersession CRUD | **engine** | **Unbuilt as designed**: 15 lifecycle cols + `version`+`content_hash`+`external_id` = 18 fork columns physically **on upstream `pages`**, 16 surfaced in `page.repo.ts baseFields`, ~10 raw read-sites. **G1 blocker** — must move to an indexed `orvex_page_meta` side table before further rebase safety |
| Confirm-token mint/enforce | `orvex/page-metadata/confirm-token.service.ts` (183 LOC) | Human-confirmation token for gated writes | engine | Reads/writes the lifecycle side-table |
| Ratify-token service + gate settings | `orvex/page-metadata/ratify-token.service.ts` (172 LOC), `ratify-gate-settings.controller.ts` (199 LOC) | draft→canonical promotion gate | engine | Matches this repo's own `docmost-cli ratify-token guard` memory note |
| Confirm-gate settings | `orvex/page-metadata/confirm-gate-settings.controller.ts` (251 LOC) | Per-space/workspace confirm-gate config | engine | |
| Device-grant / device auth | `orvex/page-metadata/device-grant.service.ts` (384 LOC), `orvex-device-auth.controller.ts` (630 LOC) | OAuth device-flow for CLI/agent auth | engine (session-mint landing) | Matches recent commit `4908b4e0 merge: daniel/eng-2059-device-flow` |
| Frontmatter round-trip | `orvex/page-metadata/markdown/frontmatter.util.ts` (64 LOC) | Global interceptor for markdown frontmatter | engine | Global NestJS interceptor |
| Space-scoped confirm gate | `orvex/space/space-confirm-gate.controller.ts` (236 LOC) | Space-level confirm-gate policy | engine | |
| Atomic provenance stamp | `orvex/page-provenance/orvex-page-provenance.controller.ts` (121 LOC), `.service.ts` (289 LOC), `provenance-content.util.ts` (393 LOC) | Write-path AI-authorship stamping + human-verify enforcement (FR-12) | engine | Triggered by the `aiAuthored` mark; **not** AI logic — write-path metadata primitive, stays engine |
| Slug-title validation + slug-rewrite job | referenced in matrix §6.1 (`orvex/page-metadata` + queue job) | Keeps slug in sync with title changes | engine | Orphan job, allow-listed |
| Bulk page ops | referenced in matrix (`orvex/bulk-page`) | Bulk move/delete/tag | wiki-api (front) over engine primitive | D-S16: agent-facing bulk ops route through wiki-api |
| Subpage-cards + page-visuals | `orvex/page-visuals/orvex-page-visuals.controller.ts` (264 LOC) | Freshness ribbon / changelog / subpage-card server projections | engine (projection) / client (NodeView) | Depends on the `orvex_page_meta` side table landing first |

**Directory sizes:** `orvex/page-metadata/` = 22 files, **10,557 insertions**; `orvex/page-provenance/` = 6 files, 1,128 insertions; `orvex/page-visuals/` = server controller only (client NodeViews out of scope).

### 3.5 Permissions / ACL / scoped tokens

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| ACL evaluate (`filterAccessiblePageIds`, accessible-space-IDs) | `orvex/permissions/orvex-permissions.controller.ts` (63 LOC), `.service.ts` (205 LOC) | FR-13 — every external retrieval narrows through this | **engine** | Noted defect: `evalPage` returns space-level actions, ignoring page-level restriction — fix before wider exposure |
| Scoped-token intersection + per-page permission ACL | referenced in matrix (`orvex/page-permissions`, scopes/read_only migration `20260626T120000`) | C3/C4 scoped API-key permission narrowing | engine | |
| Force-authz policy resolver | `orvex/authz/force-policy.resolver.ts` | Policy override/force-authorize path | engine | |

**Directory size:** `orvex/permissions/` = 5 files, 753 insertions.

### 3.6 Audit

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Audit write API (internal + external-agent) | `orvex/audit/orvex-audit-write.controller.ts` | Tamper-evident operation log write | engine (sink) / wiki-api (external-agent write endpoint) | In-process transactional sink stays engine (feeds outbox); external-agent write endpoint → wiki-api |
| Audit read/query API | `orvex/audit/orvex-audit-read.controller.ts` | Audit trail read/filter | console | Query/viewer/retention move to console |
| Audit event catalog + labels | matrix reference (`@orvex/extensions` audit-events, 22 Linear-flavoured labels in `ee/audit`) | AuditEvent/AuditResource vocabulary | contracts (catalog) / console (viewer) | **22 Linear audit labels are a hard DROP**, not externalize (D-S11) |

**Directory size:** `orvex/audit/` = 9 files, 1,716 insertions. Matches this repo's own `docmost-cli audit log/summary` CLI feature and the `--no-server-audit` flag seen in this session's tool output.

### 3.7 Spec-gate / drift (wiki-first governance)

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Wiki-first spec-gate + confirm token | `orvex/spec-gate/spec-gate.controller.ts` (123 LOC), `.service.ts` (438 LOC) | Blocks story dev-start until intent is grounded in the wiki | **wiki-api** | **D-S8** overrides the older ledger's "home = mcp". De-Linearize the work-item trigger — remove the `contentHasLinearIssue` PM-node scan at `:111,233,266`, keep text-only story-id matching |
| Living-wiki drift verify | `orvex/drift/orvex-drift.controller.ts` | Detects when a page has drifted from the code it documents | **wiki-api** | D-S8. Engine keeps only the stamped `verified_against`/`verified_at`/`spec_confirmed` fields on the page-meta side table; CLI/MCP expose the verb |

**Directory sizes:** `orvex/spec-gate/` = 5 files, 950 insertions; `orvex/drift/` = 8 files, 1,404 insertions. This directly matches this session's own project instructions in `CLAUDE.md` (`docmost-cli page get 6aMAzsYeQb`) and the standing memory note on the ratify-token guard.

### 3.8 Quota

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Quota enforcement (F-QUOTA: page/storage/file/member caps) | **NOT PRESENT** — no code found under `apps/server/src/orvex` implementing this; confirmed by wiki matrix as "NOT PRESENT (new)" | O(1) Redis fast-counters checked at both REST and collab write paths, 402 `QUOTA_EXCEEDED` | **engine** (enforce at chokepoint) | **Explicit M1 launch gate, unbuilt.** Must cover the collab/Yjs path too or it's bypassable. Cap values owned by billing (D-S7) |

### 3.9 Share

No fork-added dedicated "share" controller was found under `apps/server/src/orvex`; upstream Docmost's native share feature is untouched by the fork (confirmed by absence in both the controller inventory and the wiki matrix's engine-primitives row, which lists "share" only under §6.1's upstream-core catch-all). **Target: engine** (irreducible upstream core, unchanged).

### 3.10 Import / export

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Per-page export: markdown (FR-18) + embed-resolved `text_repr` (FR-38) | `orvex/llms/orvex-llms.controller.ts` route `pages/:pageId/page.md` + export path | Canonical markdown/text export primitive | **engine** | Golden-fixture tested against the contracts corpus |
| GDPR user data export | `orvex/user-export/orvex-user-export.controller.ts` (84 LOC) | Full personal-data export incl. AI chats, API keys, Linear integration record | engine | **Strip the `selectFrom('linearIntegrations')` row** on Linear removal (confirmed present in code: `orvex-user-export.controller.ts:73`) |
| Bulk import/export (markdown migration) | matrix reference — "former engine-direct residuals" | Bulk markdown import/export over the engine primitives | **wiki-api** (front) | D-S16 — engine keeps the primitive but stops being agent-facing directly; matches this session's own `docmost-cli migrate scan/apply/verify` CLI surface |
| Always-fresh tar bundle (FR-19) | see §3.2 | Hard tenant-scoped bulk export | knowledge | |

**Directory size:** `orvex/llms/` — small, part of the 3,160-insertion `events` count is separate; `user-export` = 84 LOC controller + module.

### 3.11 Comments

No fork-added comment controller exists; the fork adds only a **comment-resolve/unresolve** primitive (referenced in wiki matrix §6.1, "In-fork feature, no FR — allow-list"). Target: **engine** (primitive) with **D-S16**: programmatic (agent) access to comments routes through wiki-api, not engine-direct.

### 3.12 Attachments

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Attachments admin | `orvex/attachments/orvex-attachments-admin.controller.ts` | Admin CRUD/config over attachments | engine (config) | |
| Storage admin | `orvex/attachments/orvex-storage-admin.controller.ts` | S3 storage admin config surface | engine | UI is a thin console pane |
| Binary attachment up/download (agent-facing) | matrix reference — "former engine-direct residuals" | Programmatic attachment access | **wiki-api** (front) | D-S16 |
| Tika attachment search + bulk-reindex | see §3.2 | Full-text search over attachment content | knowledge | |

**Directory size:** `orvex/attachments/` = 3 files, 691 insertions.

### 3.13 Diagram (bake pipeline)

Covered under §3.1/§3.3. Evidence: `orvex/page-blocks/handlers/diagrams.ts` (446 LOC) for the block-CRUD half (→ wiki-api), `orvex/ai/bake-payload.controller.ts` + the mermaid→mxGraph converter (461 LOC per wiki matrix) + `ExcalidrawBakeProcessor` (Playwright-based) for the render-worker half (→ ai). Matches this repo's own memory note on **docmost diagram bake** (ENG-1351 collapse bug, ENG-2787 blank-XML bug) — confirms this is a live, previously-buggy subsystem, not vaporware.

### 3.14 API keys

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| API-key auth + CRUD (FR-11) | `apps/server/src/ee/api-key/api-key.controller.ts` (184 LOC), `.service.ts` (650 LOC), `.repo.ts` (266 LOC) — **still under `ee/`, live**; `packages/orvex-api-key` (referenced in matrix) is confirmed an **empty `export {}` placeholder** | API-key issuance/verification, SHA-256 hex hashing | **engine** | **High licensing risk — FR-11 unfinished.** Runtime-required by `jwt.strategy.ts:83`; every satellite auth path currently rides an EE-derived module. Needs a genuine clean-room rebuild under `orvex/api-key`, not a copy, before any satellite authenticates against it |
| Session-mint / scoped/exchange tokens (FR-15) | `token.service`, `SessionService`, `setAuthCookie` (matrix reference) | The only in-process auth landing | engine | **Native email/password login removed entirely (D-S3)** — no break-glass; this is why identity is pulled forward into launch Wave 1 despite matrix "wave 3" |

### 3.15 Webhooks

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Linear webhook ingest | `orvex/linear/linear-webhook.controller.ts` | Receives Linear webhook events, invalidates caches/view subscriptions | **DROP** | D-S11 |
| Linear OAuth connect/disconnect (app-client + webhook provisioning) | `orvex/linear/linear-oauth.controller.ts` | Linear OAuth handshake | **DROP** | D-S11 |

No non-Linear fork-added webhook surface was found server-side.

### 3.16 OIDC / SCIM / Clerk (identity — bonus area beyond the task's explicit list, but large enough to warrant its own section)

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| OIDC (provider CRUD, discovery, authorize/PKCE, callback+exchange, JIT, group-sync, avatar) | `orvex/oidc/oidc-provider.controller.ts`, `oidc-auth.controller.ts`, `oidc-refresh-avatar.controller.ts`, `oidc-sso-bridge.controller.ts`, `sso-admin-stub.controller.ts` (5 controllers, 8 files, 931 insertions) | Full OIDC SSO stack | **identity** | Already DI-decoupled (`packages/orvex-oidc`); lifts cleanly once its 6 host bindings become REST clients. Only session-mint landing stays engine |
| SCIM 2.0 Users+Groups | `orvex/scim/scim-provider.controller.ts` (178 LOC), `scim-token.controller.ts` (66 LOC), `.service.ts` (539+133 LOC) — 10 files, 1,470 insertions | Automated user/group provisioning | **identity** | **Retained**, not orphaned — writes via raw Kysely + untyped `any` bodies, needs DTO-ing |
| Clerk exchange→provision→deprovision | `orvex/clerk/clerk.controller.ts`, `clerk-provision.controller.ts`, `clerk-deprovision.controller.ts`, `clerk-settings.controller.ts` (4 controllers, 21 files, 4,516 insertions) | Clerk-backed tenancy: token exchange, org provision/deprovision, S2S impersonation | **identity** | **Entirely uncatalogued in the old ledger — the single biggest ledger gap**, per the wiki study. Ends in engine FR-15 session mint; duplicates OIDC JIT without its race safety |
| Clerk-driven tenancy resolver in `domain.middleware.ts` | matrix reference (`~40 lines, jwt.verify(APP_SECRET)`) | Symmetric-secret session verification, anti-pattern | **engine** (until retired) | Must be retired by the RS256/JWKS session-verification enabler (one of "the three enablers") |

### 3.17 MCP / URL-fetch / Studio verb grammar

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| `/mcp` Streamable-HTTP transport (in-process) | `orvex/mcp/mcp.controller.ts`, `.module.ts` (5 files, 696 insertions) | In-fork MCP tool gateway, **73 unique tools** verified by name-extraction across 19 tool files | **DROP the transport** at tool parity | The satellite `orvex-studio-mcp` gateway is at ~19/73 tools today (per this repo's own memory: "Amazing MCP delivered live... 19/19 on dev"). The in-fork transport deletes once the satellite reaches 73-tool parity — not yet |
| SSRF-guarded URL fetch | `orvex/url-fetch/url-fetch.controller.ts` (60 LOC), `.service.ts` (443 LOC) | Safe outbound URL fetch (mentions/embeds/link previews) | mcp | 5 files, 869 insertions |
| Studio verb grammar (get/search/list/save/edit/ask) | `orvex/studio/studio.controller.ts` (385 LOC), `.dto.ts` (175 LOC), `linear-studio.adapter.ts` (297 LOC — **DROP**) | Intent-verb composition grammar | **wiki-api** | Moved from mcp per **D-S8**; `ask` verb delegates to ai. **Remove the `resource_type='linear'` branch + LinearStudioAdapter** entirely (D-S11) |

**Directory size:** `orvex/studio/` = 6 files, 2,117 insertions (includes the 297-LOC Linear adapter to be dropped and a 770-LOC integration spec `r7-studio-verb-grammar.integration.spec.ts`).

### 3.18 Transclusion

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Transclusion-impact read (FR-10) | `orvex/transclusion-safeguard/orvex-transclusion-impact.controller.ts` | Reports which pages transclude a given block before a breaking edit | **engine** | Kept — FR-10 |
| Write-block safeguard interceptor | `orvex/transclusion-safeguard/orvex-transclusion-safeguard.service.ts` (204 LOC), `transclusion-safeguard.interceptor.ts` | Blocks destructive edits to actively-transcluded blocks | engine | Orphan (no FR) — allow-listed. Hard-imports `@orvex/extensions` types into 3 upstream DTOs (declaration-merge debt, flagged as tech debt) |

**Directory size:** `orvex/transclusion-safeguard/` = 6 files, 641 insertions.

### 3.19 Labels

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Space/workspace-scoped labels | `orvex/labels/orvex-label.module.ts` (3 files, 362 insertions); `labels.space_id` migration `20260514T130000` | Scoped label taxonomy beyond upstream global labels | **engine** | Additive orphan — reconcile the dropped `labels_workspace_id_type_name_unique` constraint against v0.95 labels |

### 3.20 Info / metrics / health / mail / markdown (infra primitives)

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| §13 AGPL source-availability info | `orvex/info/orvex-info.controller.ts` (routes: `capabilities`, `api`, root) | Source-offer + version/capabilities endpoint | engine (§13 info only) | **D-S18**: the OpenAPI/`/capabilities` descriptor itself leaves → wiki-api (engine API becomes internal-only, no `/docs`) |
| `/metrics` Prometheus endpoint | `orvex/metrics/metrics.controller.ts` | Scrape endpoint | engine (endpoint) / studio-lib (registry) | Registry (`OrvexMetricsService`) is satellite-heavy (ai/mcp/openbao) and splits to a shared studio-lib; only the bare endpoint stays engine-resident per service |
| Engine liveness/readiness | `orvex/health/orvex-health.controller.ts` | Health probe | engine (generic probe) | AI/budget/LiteLLM/Tika/MCP fan-in half leaves → ai (`OrvexHealthService` imports `@orvex/ai`) |
| Mail SMTP admin | `orvex/mail/orvex-mail-admin.controller.ts` | Mail transport config | engine | Config surface; UI is thin console pane |
| Markdown convert | `orvex/markdown/markdown.controller.ts` (part of `orvex/page-blocks` DfM fidelity per matrix) | Markdown↔DfM conversion, fidelity check | **wiki-api** | Engine keeps only the internal `markdownToHtml` used by import |

### 3.21 Content-handle

| Capability | Evidence | What it does | Target | Notes |
| --- | --- | --- | --- | --- |
| Oversized-page content handle | `orvex/content-handle/content-handle.controller.ts`, `.module.ts` | Handle-based access to pages too large for a single response | **wiki-api** | Current in-memory store (`content-handle.store.ts`) breaks multi-node — must become Redis-backed on the move |

### 3.22 Linear — the full removed subsystem (mark: DROP, D-S11)

Per **D-S11** ("Linear is removed for the foreseeable future — never folded in, not 'wave 4', not dormant") and the standing org instruction to strip Linear from all plans, the entire subsystem below is **DROP**, not externalized:

| Capability / artifact | Evidence | Notes |
| --- | --- | --- |
| Linear OAuth connect/disconnect, webhook ingest, app-client provisioning | `orvex/linear/linear-oauth.controller.ts`, `linear-webhook.controller.ts` | |
| Issue read/write/status, bulk multi-select + undo | `linear-issue.controller.ts`, `linear-issue-write.controller.ts`, `linear-bulk.controller.ts` | |
| Project/cycle/roadmap embeds | `linear-project.controller.ts`, `linear-cycle.controller.ts`, `linear-roadmap.controller.ts` | |
| View embeds + subscriptions/recompute | `linear-view.controller.ts` | |
| Graph/burndown + subscriptions/invalidation | `linear-graph.controller.ts` | |
| Keyword search | `linear-search.controller.ts` | |
| Workspace resync | `linear-resync.controller.ts` | |
| Image proxy | `linear-image.controller.ts` | |
| Settings | `linear-settings.controller.ts` | |
| Story-10.1 Orvex Dashboard cockpit | `linear/orvex-dashboard.controller.ts`, `page-blocks/handlers/orvex-dashboard.ts` (186 LOC) | **D-S24**: drops entirely, no shell kept |
| Linear page-block handler | `page-blocks/handlers/linear.ts` (646 LOC) | 2 side-effect imports in `page-blocks.module.ts` must be dropped in the same commit |
| Linear AI tools + host adapter | `orvex/ai` linear-search adapter, `orvex-ai-host-bridge.module.ts` | Cross-cuts the retained AI slice; remove tools + interface + adapter + binding only |
| Linear Studio verb-grammar branch | `orvex/studio/linear-studio.adapter.ts` (297 LOC) | Verb grammar itself survives for `resource_type='wiki'` |
| Linear entity in GDPR export | `orvex/user-export/orvex-user-export.controller.ts:73` — `selectFrom('linearIntegrations')` | Confirmed live in code this session |
| Shared touchpoints (server, must be surgically un-touched) | `workspace.service.ts`, `workspace.module.ts`, `workspace.listener.ts`, `user.service.ts`, `queue.constants.ts`, `throttle.module.ts`, `audit-events.ts`, `orvex-integrations.const.ts`, `core/orvex-tokens.ts`, `app.module.ts`, `db.d.ts`, `spec-gate.service.ts` (the `linearIssue` PM-node scan), `orvex-migration-provider.ts` | ~40 files; "plain deletion, not an FR-37 rewire" — no downstream consumer once the subsystem is gone |
| DB tables (6) | `linear_integrations`, `linear_entity_cache`, `linear_view_subscriptions`, `linear_graph_subscriptions`, `orvex_dashboard_subscriptions`, `orvex_agent_log_events` | No standard drop-migration path exists yet — an explicit drop migration is needed for already-deployed DBs |

**Directory size:** `orvex/linear/` = 27 files, **7,846 insertions** (server only; client-side `packages/orvex-linear` ~120 files/~30k LOC and `packages/orvex-client/src/linear` ~80 files are out of this report's server-only scope but confirm the same D-S11 disposition).

---

## 4. Quota / RLS / outbox — the three unbuilt launch gates

These are called out separately because they're **launch-blocking**, not merely un-homed, and no server code implements them today (confirmed absent from the controller/module inventory):

| Gate | Status | Target | Notes |
| --- | --- | --- | --- |
| F-QUOTA (page/storage/file/member caps) | **Unbuilt, 0 code** | engine (enforce at write chokepoint) | M1 gate. Must check the collab/Yjs path, not just REST |
| Transaction-scoped fail-closed RLS | **Unbuilt, 0 policies** — isolation today is app-level `workspace_id` filtering only, 278 raw-SQL sites | engine (infra primitive) | M3 gate. Must use a transaction-scoped GUC (`set_config(..., true)`) because PgBouncer runs transaction pooling — a session-level `SET` leaks |
| Transactional outbox (FR-17) | **Unbuilt** — actual bus is a lossy `EventEmitter2 → Redis XADD`; `page.content_updated` only fires as a side-effect of the AI embed worker | engine (outbox write + relay) | M2 gate. Relay publishes straight to Kafka (Redis→Kafka bridge retired per D-S13). Must land before the embed pipeline is deleted (coupled deletion risk) |

---

## 5. Not covered by the task's example list but found in code

- **Governance integration tests**: `orvex/governance/__tests__/integration/p2c-governance.integration.spec.ts` — no standalone controller, test-only artifact validating cross-module governance behavior.
- **Force-authz**: `orvex/authz/force-policy.resolver.ts` + `force-authz.module.ts` — policy-override resolver, engine-side.
- **Workspace DTO**: `orvex/workspace/orvex-update-workspace.dto.ts` (40 LOC) — additive DTO on the upstream workspace-update path.
- **Extensions/migrator**: `orvex/extensions/orvex-migrator.service.ts` — boot-time auto-migration runner (`OrvexMigrationProvider`), engine infra primitive.
- **ws.service.ts**: 12-line addition (`apps/server/src/ws/ws.service.ts`) — realtime-invalidate primitive (`emitInvalidate`/`emitWorkspace`) that the identity/knowledge satellites will wrap via a service-credential endpoint (one of "the three enablers" in the disposition doc).

---

## 6. Migrations

211 files touched under a migrations-adjacent comparison sweep; a direct name-pattern count shows **11 migrations timestamped `202606*`/`202607*`** (i.e., landed in this recent window) under `apps/server/src/database/migrations`. The wiki study calls out several specific migrations by name:

- `20260617T120000` — `ifVersion` CAS columns (`pages.version`/`content_hash`)
- `20260626T140000` — idempotency store keying (`pages.external_id`)
- `20260626T120000` — scoped-token permission scopes/read_only
- `20260514T130000` — space-scoped labels (`labels.space_id`)
- `20260518T130000`, `20260518T150000` — cascade-FK-covering + query-path indexes (flagged as good upstream-PR candidates)
- `20260511T000001-page-transclusions`, `20260511T000002-labels` — **renamed** upstream migrations, byte-identical (flagged as a fold-in landmine: Kysely tracks by filename, so the rename breaks upstream migration tracking on rebase)
- `20260629T120000-r5-pages-tsv-keyword-fastlane` — flagged as dead/no-op (the index already exists from upstream `20240324T086300`)

---

## 7. Summary disposition counts (per the live wiki canon, `rBSZqx4gXE` §"Disposition by destination")

| Destination | Fork controllers (wiki-cited) |
| --- | --- |
| orvex-wiki (AGPL engine, server) | ~25 (+QMS, +audit sink) |
| orvex-wiki-api (new Go tier) | grammar/composition, no 1:1 controller count (new tier) |
| orvex-studio-knowledge | 10 |
| orvex-studio-mcp | 2 (transport + url-fetch), grows to 73-tool parity |
| orvex-studio-ai | 13 |
| orvex-studio-identity | 10 (+MFA) |
| orvex-studio-billing | NEW (no fork code) |
| orvex-studio-console | NEW / re-homed |
| orvex-studio-contracts | NEW (shared DFM package + event catalog) |
| **Linear** | **14 → REMOVE** |

**Retained-functionality guarantee** (stated explicitly in canon): every capability the fork ships today is retained except Linear. The apparent "orphans" an older, now-superseded ledger flagged for deletion — drift, spec-gate, SCIM, transclusion-safeguard, generic audit, labels, url-fetch, studio verbs, llms — are **all retained and re-homed**, not dropped.

---

## 8. Ticket-tracking status (per canon, informational — Linear itself is dropped as a product feature, but the *program's own* ticket tracking historically used Linear before the org-wide Linear-drop instruction)

The wiki page records 109 of 122 planned split-migration stories as ticketed (ENG-1357..ENG-1467), 13 follow-ups outstanding, concentrated in orvex-studio-knowledge (6 of 7 stories un-ticketed) and orvex-wiki (5: transclusion-engine, transclusion-wiki-modal, upsert-engine, upstream-revert-engine, userexport-engine). This is included for completeness of the wiki source but is orthogonal to the server-code inventory above — per the current program instruction, Linear tracking itself is being dropped, so this ticket map should not be treated as a live coordination surface going forward.

---

## 9. Reconciliation with org-standing instructions

- **Linear DROP**: confirmed correct and consistent — the live wiki canon's own D-S11 ruling ("Linear is removed for the foreseeable future... never folded in") independently matches the task-level instruction to drop Linear from all plans. No conflict, no override needed.
- **Thin-engine + closed-satellites split**: confirmed as the live architecture (§6 disposition matrix, "the governing rule").
- **No-fallbacks / hard-cuts doctrine** (org memory): reflected in canon's explicit stance that quota/RLS/outbox are launch *gates*, not soft rollout items, and that a deferred RLS build must be an "explicit recorded decision... never silence."
