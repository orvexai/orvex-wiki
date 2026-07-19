---
title: "Librarian + Portal Scale Audit — today's agent→wiki write path in code"
status: research-digest
created: 2026-07-10
scope: read-only code audit
feeds: PRD Orvex Studio — Agent Staging Area
---

# Librarian + Portal Scale Audit

**Question under audit:** does today's agent→wiki write path (the "librarian interface" + portal) scale — canonically, a single chat session that updates 100 documents — and should the proposed staging area live *inside* the wiki's draft system or *outside* the wiki store?

**Bottom line (up front):**
1. **The "librarian" is a prompt, not a service.** It is the `doc-librarian` (Marian) Claude skill, which dispatches to `doc-amend` / `doc-ratify` / `doc-drift`, all of which shell out to `docmost-cli`. There is no compiled librarian anywhere in the service tier.
2. **The functioning agent write path today is one page at a time, straight into the live engine.** Two surfaces exist — `docmost-cli → docmost` (used by the skills) and the Studio MCP `save_page`/`edit` tools → docmost — and both hit the engine's per-page REST endpoints directly. The intended `orvex-wiki-api` write-chokepoint facade is a 501 scaffold, so there is no seam between agents and the live wiki today.
3. **There is no atomic multi-page write primitive, and a draft is already a full-cost page row.** 100 docs = 100 independent REST writes, each writing a full-content history snapshot into an unbounded table and fanning out ~5–7 async jobs (see `engine-scale-mechanics.md`). A "draft" status buys retrieval quarantine only, not storage separation (see `draft-status-prosemirror.md`).
4. **Staging-like and memory-like features are named in the canon but mostly unbuilt.** `Curator` and `Card-Contract-v1` are real domain code in `orvex-studio-api` but wire to 501 upstreams; `engineGate` does not exist in code; the one genuinely-built substrate is a Postgres-backed **Memory** store in `orvex-studio-api`.

This report covers the librarian locus, the write path(s), the Curator/Memory code reality, the MCP surface, and service maturity **in full**, then synthesises the **100-doc scenario** and the **inside-vs-outside** decision seed, citing the four sibling reports rather than duplicating them:
- `engine-scale-mechanics.md` — engine write path, history mechanics, debounced Yjs persist, no batch content primitive, throttle gaps.
- `cli-write-path-roundtrips.md` — `docmost-cli` per-page round-trip counts + CAS.
- `cli-content-json-blocks-ai.md` — `--content-json`, the 28 block types, `ai` commands.
- `draft-status-prosemirror.md` — 6-value status enum, ratify token, spec gate, drafts-are-full-rows, ProseMirror verdict.

---

## Repo maturity (honest)

| Repo | Maturity | Evidence |
|---|---|---|
| `docmost` | **Mature** — the live engine (NestJS/Kysely/Hocuspocus/TipTap) | 12.9k code files; full page/collab/search stack |
| `docmost-cli` | **Mature** — the sanctioned Go write path | 696 Go files; `cmd/page/{create,update,patch,edit}.go` |
| `orvex-studio-mcp` | **Partial-real** — MCP transport + wiki tools wired to docmost today | `src/server/tools.ts` (save_page/edit implemented) |
| `orvex-studio-api` | **Scaffold-plus** — most routes 501; Memory + Curator/Cards partially real | `project-context.md:94` "Every route handler is currently a 501"; but see §Memory/§Curator |
| `orvex-studio-ai` | **Scaffold** — "501 observable stubs" | `README.md:27`, `project-context.md:94` |
| `orvex-studio-knowledge` | **Scaffold** — "compiling skeleton", "typed 501 stubs" | `README.md:27,46` |
| `orvex-studio-ui` | **Scaffold** — "surfaces are design targets, not claimed-built" | `README.md:59` |
| `orvex-wiki-api` | **Scaffold** — `/v1/* → 501`, "verb grammar lands in Phase 1" | `README.md:28`, `project-context.md:147` |
| `idpapps-portals` | **Not an app** — GitOps/ArgoCD deploy manifests only | `apps/*/app.yaml`, `applications/eu-central-1/*.yaml`; 0 code files |
| `orvex-prompt-studio` | **Near-skeleton** — `api/` has no `.go`, `web/` bare Vite | `api/{go.mod,Dockerfile}` only; `web/src/{App,main}.tsx` |

The "portal" as a built chat surface does not exist in code: `idpapps-portals` is deploy manifests, and the UI (`orvex-studio-ui`) is an explicit scaffold. So there is no portal artifact to scale-test — the real, exercised agent write path is the CLI/MCP → engine path below.

---

## 1. Librarian TODAY — a skill/prompt, not a service

**Locus verdict: the librarian is `doc-librarian` (Marian), a Claude Code skill.** A `grep -ri librarian` across every service repo (`.go`/`.ts`, excluding skills/_bmad/node_modules) returns **no domain implementation** — only:
- `orvex-studio-mcp/src/server/studio-tools.ts:297-324` — a thin `studio_librarian_session` MCP tool that GETs `/api/librarian/session` and returns "this session's librarian (Marian) session state" (`studio-wrapper.ts:199-204`). Session-state passthrough, not librarian logic.
- `docmost-cli/cmd/page/scaffold.go:117` — a comment noting templates are "loaded by the doc-librarian skill."

The librarian's behaviour lives entirely in prompts:
- `/home/daniel/repos/orvex-wiki/.claude/skills/doc-librarian/SKILL.md:1-12` — "Marian, the Manual Librarian … curator and dispatcher of the project's single living manual … dispatches to `doc-amend` / `doc-ratify` / `doc-drift`." It is explicitly "a curator and a dispatcher, not a bulk author."
- The same file states the write contract: **"The `docmost-cli` CLI is the only sanctioned interface to the manual. Never call Docmost HTTP directly; never edit the local cache."** (`doc-librarian/SKILL.md`, Conventions section.)
- Sibling authoring skills: `doc-amend`, `doc-ratify`, `doc-drift`, `doc-consolidate`, `doc-migrate` under the same `.claude/skills/` tree; shared authoring data under `_bmad/doc/data/` (`manual-ia.md`, `manual-outline.schema.yaml`, `rich-page-authoring.md`, `decision-order.md`, `docmost-cli-reference.md`, `doc-type-templates/`). These `_bmad/doc/data/` bundles are **replicated per consuming repo** (copies found under `orvex-studio-ai`, `orvex-studio-ui`, `orvex-studio-linear`, `houston`).

**The librarian flow is human-gated by design** — central to the scale concern. The skills assume a human in the loop: `doc-amend` asks "one plain-English question at a time" on a fuzzy find-before-create candidate; `doc-ratify` "never self-promotes … one plain-English question per decision" with a "human delight-review" for section landings. This is a curation cadence, not a bulk pipeline.

### Per-customer configurability — TOML overrides today, prompt-studio aspirational
The librarian prompt is tweakable via a **file-based override chain**, resolved on skill activation (`doc-librarian/SKILL.md`, On Activation): base `customize.toml` → team `_bmad/custom/{skill}.toml` → user `_bmad/custom/{skill}.user.toml` (scalars override, tables deep-merge, keyed arrays replace-or-append). That is the only "per-customer librarian config" that exists today, and it is per-repo TOML, not a product surface.

`orvex-prompt-studio` (the intended per-customer prompt manager) is a **near-skeleton**: `api/` contains only `go.mod` + `Dockerfile` (no `.go`), `web/` is a bare Vite app (`src/App.tsx`, `src/main.tsx`), plus a `.cache/docs/` of pulled wiki pages. It is **not wired to manage the librarian prompts**. Per-customer librarian configuration as a product is therefore **aspirational**.

### Curator / Card-Contract / engineGate — canon vs code
The wiki canon describes a staging-like "Curator / Card Contract v1 / engineGate()" owned by `orvex-studio-api`. Code reality:
- **Curator — real domain skeleton, stubbed upstream.** `orvex-studio-api/src/curator/classifyOnSave.ts` implements classify-on-save (ENG-1527, `src/types/domain.ts:8-9`), with a full test suite (`test/curator-degrade-unclassified.test.ts`, `curator-idempotent-golden.test.ts`, `curator-cap-keyed-on-principal.test.ts`, `curator-no-direct-llm.test.ts`) and an honest `unclassified` degrade. **But** it depends on `AiClient.curatorClassify()`, which throws `NotImplementedError` (`src/clients/ai.ts:22-24`) and is meant to call `orvex-studio-ai`'s `/v1/curator/classify` (`ai.ts:39`) — a 501 stub. So the classify decision path exists and is tested; the actual LLM classification is not built.
- **Card-Contract-v1 — real.** `orvex-studio-api/src/cards/card.ts:3-62` — the versioned card envelope (ENG-1528) plus `toCard()` renderer. Built as a contract.
- **engineGate — does NOT exist in code.** `grep -ri 'engineGate|engine_gate'` across `orvex-studio-{api,ai,knowledge}` returns nothing. The canon term has no code referent.
- **studio-api → wiki write is stubbed.** `src/clients/wikiApi.ts:5` describes the client "for Curator-apply, capture, and Demo World seeding … points at [orvex-wiki-api]" — which is the 501 scaffold. So studio-api cannot yet apply anything to the wiki.

### Memory — the one genuinely-built substrate (and it's in `-api`, not `-ai`)
- **`orvex-studio-api` Memory is real.** Route `/v1/memory` (`src/server.ts:119-120`) mounts `memoryRoutes` (`src/routes/memory.ts:39-91`) with **working** `POST /` (create with 3-state Open/Private/Shared-private privacy validation) and `GET /` (listByTenant, own/shared scope). Backed by a **real Postgres store**: `createPostgresMemoryRepository(databaseUrl)` (`src/server.ts:53-55`), `PostgresMemoryRepository` with a `memory` table DDL (`src/store/postgres/repository.ts:111-120`, tenant-partitioned `memory_tenant_idx`). Falls back to `NotImplementedMemoryRepository` (503) with no DB. This is the closest thing to a cross-agent memory substrate that is actually built — though retrieval-by-embedding composes the not-yet-implemented `AiClient`.
- **`orvex-studio-ai` memories is planned, not built.** The only reference is a topology comment listing intended tables `ai_drafts, ai_memories, ai_prompts, tenant_ai_config` (`internal/store/postgres/postgres.go:5`); no `ai_memories` DDL/migration exists. **This corrects the canon note** — the built memory store is in `orvex-studio-api`, and `orvex-studio-ai`'s `ai_memories` is a planned table only.

---

## 2. Current agent write path(s) end-to-end

There are two surfaces; both write **one page per call, directly into the live engine**, with the same 2-round-trip cost and CAS model. There is **no async staging seam** between an agent and the canonical store today.

### Path A — `docmost-cli → docmost` (the sanctioned skill path)
- `updateOnePage` is documented as "cache lookup → content merge → API → cache write → audit" (`docmost-cli/cmd/page/update.go:975-976`).
- **Cost per page: ~2 HTTP round-trips** — a `/pages/info` freshness probe + the `/pages/update` write; 3 with embed markers (see `cli-write-path-roundtrips.md`, `patch.go:945,1175`). `--if-version` does **not** let a caller skip the pre-read.
- **CAS:** default sends the cached `updatedAt` as `ifVersion` (`update.go:209-217`); the server arbitrates and returns CONFLICT (non-zero exit) on a mismatch. `--no-cas` opts out (skills must never pass it, `update.go:220-222`).
- **Dup-guard:** find-before-create is a **skill-level** behaviour (`doc-amend`), assisted by `ai ask` (RAG) / semantic search (`cli-content-json-blocks-ai.md`); the exit-8 DUPLICATE_CANDIDATE guard lives on the create path.
- **Audit:** every write logs via `audit.LogWithFields` (`update.go:471,928` …) — a local dual-write, not an extra server round-trip.
- **Bulk exists but is a sequential loop, not a batch.** `page update --filter` iterates matched pages "sequentially (never concurrently — AR7)" (`update.go:910-921`), rate-limited to 10/s (`update.go:414`); each iteration is a full single-page write. Bulk **canonical promotion is blocked** — `--ratify-acknowledged` can't be passed in `--filter` mode (`update.go:319-326`).
- **ProseMirror:** `--content-json` accepts a full PM document (`update.go:440`), validated client-side as syntax-only (`cli-content-json-blocks-ai.md`).

### Path B — Studio MCP `save_page` / `edit` → docmost (wired to the engine today)
- The MCP's single wiki upstream **wraps `DocmostWrapper` against `DOCMOST_BASE_URL` today** — the intended `orvex-wiki-api` facade is not yet the target (`orvex-studio-mcp/src/upstreams/wiki-api.ts:13`; `src/config/config.ts:13-15` — `WIKI_API_BASE_URL` "falls back to `DOCMOST_BASE_URL` during R0"). So MCP writes land on the same engine endpoints as the CLI.
- **`save_page`** (hero tool, `tools.ts:1067`): create → `POST /api/pages/create` + readback = **2 calls**; update → `POST /api/pages/update` + readback = **2 calls**; upsert by slugId → `POST /api/pages/upsert` + readback = **2 calls** (`tools.ts:1051-1307`). Same CAS `ifVersion` receipts.
- **`edit`** (hero tool, `tools.ts:1406`) exposes block-level ops: `string_patch` (`PATCH /pages/{id}/blocks/patch-string`), `block_patch` (`PATCH /pages/{id}/blocks/{blockId}`), **`batch` (`POST /pages/{id}/blocks/batch {ops[], ifVersion}` — atomic)**, `insert_block` (`tools.ts:1385-1388`). Important nuance: **`batch` is atomic *within one page*** — multiple block edits to a single page commit together. There is still **no cross-page batch**.

**Net:** whether via CLI or MCP, an agent updating N pages issues ~2N round-trips to the live engine, N independent writes, no cross-page transaction, partial-failure by design.

---

## 3. Engine mechanics that hurt at scale (see `engine-scale-mechanics.md`)

Summarised from the sibling report (citations there):
- **Full-content `page_history` row per REST content save, non-diff-gated** (`page.service.ts:770-782`) into an **unbounded, never-pruned** table (no retention/cleanup exists). 100 updates ⇒ ≥100 full-doc snapshots; the debounced Yjs path can add ~100 more (diff-gated).
- **No atomic multi-page content primitive.** The only bulk endpoint (`POST /api/pages/bulk`) supports `['status','move','metadata','delete']` — **no content op** — and executes `Promise.all` of N independent ops (`bulk-page.dto.ts:26`, `bulk-page.controller.ts:133`).
- **Debounced ydoc→DB persist (10s/45s, `unloadImmediately:false`)** — REST writes mutate the live CRDT, so they are *safe* (no divergence), but `page.content` can be **stale up to 45s** after a write, and 100 concurrently-opened ydocs sit in Hocuspocus memory awaiting a flush burst.
- **Synchronous tsvector reindex** per `pages` row update (rides the debounced content write).
- **~5–7 async jobs + an extra DB read + a Redis XADD per save** → ~500–700 background jobs for 100 docs; AI-embed jobs are non-coalescing.
- **No throttle on `/update`** — only destructive ops are rate-limited; a 100-doc burst is unbounded at the engine edge.

---

## 4. ProseMirror capability (see `draft-status-prosemirror.md` + `cli-content-json-blocks-ai.md`)

- **The write API accepts full ProseMirror JSON** (`format:'json'`, trusted/no-conversion) or lossless DfM; **markdown/html are rejected on write** (`LOSSY_WRITE_FORMAT_REJECTED`, `page.service.ts:2017-2035`).
- **Rich schema (~40 TipTap extensions)** — `collaboration.util.ts:63-172`: callout, columns/column, custom tables, details/toggle, math (inline/block), code, drawio/excalidraw/chart, embed(iframe), image/video/audio/pdf, mention, status, Linear/dashboard atoms, transclusion, plus an `AiAuthored` provenance mark.
- **28-type structured block-op catalog** (`orvex/page-blocks/`, `GET /api/schemas/blocks`) mirrored by the CLI's `page block` verbs and the MCP `edit insert_block` op.
- **Normalisation caveats:** unknown node types are **silently stripped** (`jsonToNode`→`stripUnknownNodes`); **adjacent same-mark text runs coalesce** on the Yjs seam. Agents must author by *semantic marks*, and verify writes by full-text + effective-marks equality, not run-by-run node identity.
- **Verdict:** a programmatic librarian **can** produce genuinely rich, beautiful pages via the API today — best done as a **post-pass that emits `format:'json'` or DfM** against the registered schema, avoiding markdown (lossy) and brittle run-splitting.

---

## 5. Draft / status system (see `draft-status-prosemirror.md`)

- **Status is 8 columns ON the `pages` table**, not a side-table (`migrations/20260514T120000-orvex-page-metadata.ts:5-47`: `status` NOT NULL DEFAULT `'draft'`, `doc_type`, `owner_id`, `last_reviewed_at`, `supersedes` jsonb, `superseded_by`, `redirect_from` jsonb, `_unknown_frontmatter`), with partial/GIN indices (L50-90).
- **Six status values** (not four): `draft`, `published`, `canonical`, `deprecated`, `superseded`, `archived`. Load-bearing nuance: **`published` is agent-settable WITHOUT a ratify token** — an agent can write and publish so a page is immediately findable, while `canonical` requires the human ratify gate and `draft` is retrieval-quarantined.
- **Ratify gate:** `RATIFY_TOKEN` is HMAC-SHA256, server-minted, page+workspace-scoped, 30-min TTL; **mint is human-only** (api_key callers get 403), so an agent can never self-mint. The only agent self-promotion is `forceSelfRatify` **after** a workspace admin enables `allowForcedSelfRatify` (default fail-closed) with a 20-char reason (emits a distinct audit event).
- **Spec gate** is a read-only probe that mints a `SPEC_CONFIRM_TOKEN`; the block-vs-warn `wiki_first_enforcement` decision is a **client/skill policy**, not a server toggle. `spec_confirmed=true` is human-only to set.
- **Crucial for staging:** a draft is a **first-class, full-cost `pages` row** — indexed, searchable, slug-holding, history-tracked. "Draft" adds only a retrieval-quarantine query filter, not storage separation.

---

## 6. The 100-doc single-chat scenario, walked concretely

An agent session asked to update 100 documents, on today's path (CLI or MCP → engine):

1. **~200 HTTP round-trips.** ~2 per page (freshness probe + write); embed-bearing pages add a third (`cli-write-path-roundtrips.md`). No batch endpoint collapses these.
2. **≥100 full-content history rows, forever.** Each content write snapshots the pre-image, non-diff-gated, into an unbounded table with no retention (`engine-scale-mechanics.md`, `page.service.ts:770-782`). The debounced Yjs path can double this.
3. **~500–700 background jobs.** Per-save fan-out of ~5–7 queued jobs + a Redis XADD, non-coalescing embeds (`engine-scale-mechanics.md`). Pressures BullMQ/Redis/AI queue.
4. **Read-after-write staleness up to 45s.** The ydoc is authoritative; `page.content` lags the debounced flush — a librarian post-pass that re-reads a just-written page may see stale content, and 100 open ydocs pile up in Hocuspocus memory (`engine-scale-mechanics.md`).
5. **No cross-page atomicity; partial failure is the default.** Any of the 100 writes can CONFLICT (CAS) or 5xx independently; there is no transaction to roll the batch back (`engine-scale-mechanics.md`, `bulk-page.controller.ts:133`). Recovery is per-page and manual.
6. **No engine backpressure.** `/update` is unthrottled; a runaway burst is bounded only by the CLI's optional client-side 10/s limiter (single-invocation bulk mode), which does not apply to 100 separate tool calls in a chat.
7. **Human-gate collision.** The librarian skills are built around one-question-at-a-time confirmation and human ratify/delight-review — 100 docs in one session either stalls on gating or bypasses the very curation the librarian exists to provide.
8. **Context-window burn.** ~200 tool round-trips, each returning a receipt (and often a readback), consume a large share of the chat's context before any curation reasoning — the round-trip tax is paid in tokens as well as latency.
9. **Review/audit burden.** 100 writes × audit entries + ≥100 history rows + ~600 jobs produce a large, un-batched change surface for a human to later review or ratify.

**Conclusion:** the current path is a correctness-safe (CAS + live-CRDT) but **operationally linear, un-batched, human-gated, history-polluting** path. It is fine for a handful of curated amendments and hostile to a 100-doc burst. The failure is not a bug to fix in the engine; it is the absence of a **buffer between agent output and the canonical store**.

---

## 7. Inside-vs-outside the wiki — evidence seed (pros/cons, not a decision)

Daniel's lean (per `.memlog.md`) is a staging area **outside** the wiki store. The code evidence for and against reusing the wiki's own draft/status system:

**Evidence that pushes staging OUTSIDE the wiki store:**
- **A draft is already a full-cost page row** (§5) — reusing `status:'draft'` as the staging buffer means every scratch write still pays a slug, indices, tsvector reindex, and (critically) a **permanent history row** (§3). Staging-as-drafts pollutes canonical history exactly as the 100-doc scenario shows.
- **No atomic multi-page primitive** in the engine (§3) — a staging area that must accept "add 100 docs, then route" cannot get transactional semantics from the wiki; it would have to build them anyway.
- **Debounced persist + 45s staleness** (§3) make the live store a poor scratchpad for rapid agent iterate-then-route loops.
- **The intended seam is already meant to be external.** `orvex-wiki-api` was designed as the write chokepoint/facade (`orvex-studio-mcp/src/upstreams/wiki-api.ts:2-9`), and `orvex-studio-api` already owns a **real, tenant-partitioned Postgres store** (Memory, §1) and a Card-Contract envelope — i.e. the Studio tier already has the shape of an out-of-wiki store to extend for staging.
- **The librarian is a consumer, not the store** (§1) — it "consumes staging and decides routing" (`.memlog.md`); an external buffer matches the dispatcher role cleanly.

**Evidence that some wiki machinery is worth REUSING (not the store, the contracts):**
- **The status lifecycle already models the routing target** — `draft → published/canonical`, `supersedes`/`redirect_from`, the human-only ratify gate (§5). A staging area should *route into* these states, not reinvent them; the ratify gate in particular is the right canonical-promotion contract and is human-only by design.
- **The write API is already rich and safe** — `format:'json'`/DfM against a 40-extension schema with CAS receipts (§4) is exactly what the librarian's "apply from staging" step should call. Staging should hold agent intent and let the librarian emit these engine writes.
- **The block-op catalog + within-page atomic `batch`** (`edit`, §2) is the correct primitive for the librarian's per-page apply, even though cross-page batching must live in staging.

**Framing for the decision:** the store should sit **outside** (drafts are not a cheap buffer, and history pollution + no-atomicity are structural), while the **contracts** (status lifecycle, ratify gate, `format:'json'`/DfM writes, per-page block `batch`) should be **reused as the routing target** the librarian writes into. The open question the PRD must answer is whether the external store is a new capability on `orvex-studio-api` (reusing its Memory/Postgres + Card-Contract shape) or a fresh service — and how the librarian's per-customer prompt is hosted, given `orvex-prompt-studio` is today a skeleton.

---

## Appendix — Studio MCP tool surface (current)

Progressive disclosure (`src/server/tool-catalog.ts`): **11 hero tools** advertised by default, **8 studio tools** hidden until `list_tools('studio')`.

**Hero (wiki):** `whoami`, `ask` (RAG), `search`, `get_page`, `save_page` (write), `edit` (block write), `get_neighborhood`, `get_space_tree`, `get_changes`, `related_pages`, `list_tools` (`tool-catalog.ts:20-32`).

**Studio (hidden):** `studio_marketplace_search`, `studio_skill_get`, `studio_memory_get`, `studio_memory_save`, `studio_library_list`, `studio_library_save`, `studio_librarian_session`, `studio_comment_post` (`tool-catalog.ts:35-44`).

Wiki-write tools (`save_page`, `edit`) hit docmost directly today (§2). `studio_memory_*` map to the `orvex-studio-api` Memory store (§1). `studio_librarian_session` is a session-state fetch, not librarian logic.
