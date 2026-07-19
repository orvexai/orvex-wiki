I have comprehensive evidence across all 8 points. Here is the audit.

---

# Orvex/Docmost Fork Audit — Draft-Status System & ProseMirror Capability

Repo: `/home/daniel/repos/docmost`. All paths absolute.

## TOPIC A — DRAFT / STATUS SYSTEM

### 1. Schema: table, columns, status enum
**There is no `orvex_page_meta` table.** The metadata is **8 columns added directly to the core `pages` table.**

Migration `/home/daniel/repos/docmost/apps/server/src/database/migrations/20260514T120000-orvex-page-metadata.ts`:
- `status` varchar `NOT NULL DEFAULT 'draft'` — L7-9
- `doc_type` varchar — L14
- `owner_id` uuid FK users.id — L19-21
- `last_reviewed_at` timestamptz — L26
- `supersedes` jsonb — L31
- `superseded_by` varchar — L36
- `redirect_from` jsonb — L41
- `_unknown_frontmatter` jsonb — L46
- Partial indices `idx_pages_status`, `idx_pages_doc_type`, `idx_pages_owner_id`, `idx_pages_supersedes` (GIN), `idx_pages_superseded_by`, `idx_pages_redirect_from` (GIN) — L50-90

Sibling migrations add related columns to `pages`: `20260604T080513-orvex-page-archive-reason.ts` (archive_reason), `20260519T120000-orvex-verification-columns.ts` (spec_confirmed), `20260531T120000-orvex-provenance-columns.ts`.

**Status enum has SIX values** (task assumed four) — `/home/daniel/repos/docmost/packages/orvex-extensions/src/page-metadata/orvex-page-metadata.types.ts:1-19`:
`DRAFT='draft'`, `PUBLISHED='published'`, `CANONICAL='canonical'`, `DEPRECATED='deprecated'`, `SUPERSEDED='superseded'`, `ARCHIVED='archived'`.
The enum comment (L3-14) is load-bearing: **`published` is agent-settable WITHOUT a RATIFY_TOKEN** ("an agent writes a page, promotes it to 'published' so it is immediately findable via ask/search, without needing a human to ratify"). `draft` is quarantined from retrieval; `canonical` needs the ratify gate.

DTO: `/home/daniel/repos/docmost/packages/orvex-extensions/src/page-metadata/orvex-page-metadata.dto.ts`. No separate entity/repo — it rides the Kysely `pages` type.

### 2. Status on write / create default
- **Default = `draft`** via DB column default; the create insert object sets NO status field — `/home/daniel/repos/docmost/apps/server/src/core/page/services/page.service.ts:250-272` (`insertablePage` has no `status`).
- **canonical-on-create is forbidden**: `validateCreatePath` throws `CANONICAL_ON_CREATE_FORBIDDEN` — `page.service.ts:192-211` (guard L198-204).
- Orvex block (status/doc_type/…) applied atomically in the create tx via `applyMetadata` — `page.service.ts:283-294`.
- Transition chokepoint is `applyMetadata` — `/home/daniel/repos/docmost/apps/server/src/orvex/page-metadata/orvex-page-metadata.service.ts:266`. Every write path funnels here (REST `/status`, MCP `set_page_status`, markdown/frontmatter import) — L330-345, L495-525.
- An agent can freely set `status: 'published'` on create or update (only `canonical` is gated; see #3).

### 3. RATIFY-TOKEN guard (draft→canonical)
Minted/verified by `/home/daniel/repos/docmost/apps/server/src/orvex/page-metadata/ratify-token.service.ts` — `issue()` L87-112, `verify()` L119-171. HMAC-SHA256 keyed with `APP_SECRET`, domain tag `orvex.ratify.v1` (L34), **page+workspace scoped**, 30-min TTL (L31).

**Mint endpoint is human-only**: `POST /api/orvex/pages/ratify-token` — `/home/daniel/repos/docmost/apps/server/src/orvex/page-metadata/orvex-page-metadata.controller.ts:171-197`; `isHuman = authMethod !== 'api_key'` (L48); throws `ForbiddenException` if caller is a service account (L181-182). An agent (api_key) can therefore **never mint or self-mint** a token.

Promotion guard in `applyMetadata` — `orvex-page-metadata.service.ts:360-411`:
- `isPromotionToCanonical` = target canonical & current ≠ canonical (L360-362).
- Human sessions (`actor.isHuman`, default true) promote **directly, no token** (L370).
- Non-human: if per-workspace `ratifyGateRequired` (default ON, L374) → must present a valid `ratifyToken` (verified L383), **OR** `forceSelfRatify:true` which requires workspace `settings.ratifyGate.allowForcedSelfRatify === true` (`isForcedSelfRatifyAllowed`, L149-154, **default false/fail-closed**) **plus** a `forceReason` ≥20 chars (L396-402); else 403 (L407).

**Can an agent self-promote?** Only via `forceSelfRatify` and only after a workspace admin enables `allowForcedSelfRatify` (`POST /api/orvex/settings/ratify-gate`), with a 20-char reason, and it emits an extra `RATIFY_FORCED_SELF_RATIFY` audit event (L364-367, L589-592). Otherwise no.

### 4. SPEC GATE — what it enforces on writes
`/home/daniel/repos/docmost/apps/server/src/orvex/spec-gate/spec-gate.service.ts` is a **read-only probe** (`POST /api/orvex/spec-gate/check`, controller L80), not a write-blocker. `check()` (L92-228) mints a `SPEC_CONFIRM_TOKEN` only when a linked intent page: (a) is doc_type `technical-spec`/`prd` (`INTENT_DOC_TYPES` L26-29); (b) clears substance floors `MIN_BODY_CHARS=280` **and** `MIN_SECTION_COUNT=2` (L38-39, `assessSubstance` L344-364) — anti-stub; (c) has `spec_confirmed=true` (L158).

The only server-side **write** coupling is the `spec_confirmed` write-guard in `applyMetadata` — `orvex-page-metadata.service.ts:413-432`: a non-human caller **cannot** set `spec_confirmed=true` (`SPEC_CONFIRM_HUMAN_REQUIRED`), so the gate is not self-satisfiable by an agent.

**No literal server-side `wiki_first_enforcement` block/warn setting exists.** The block-vs-warn enforcement is a **client/skill policy** (the `doc-spec-gate` skill reads `wiki_first_enforcement` and HALTs at dev-story time on a token miss). The server only provides the probe + the human-only `spec_confirmed` guard. (Grep for `wiki_first`/`wikiFirst` across `apps/` + `packages/` returns only comments/doc-type sets, no enforcement toggle.)

### 5. Staging inside vs outside the wiki — is a draft a full-cost row?
**Status is columns ON `pages`, not a joined side-table** (migration `alterTable('pages')`). Therefore **a draft is a first-class, full-cost `pages` row**:
- Indexed: `idx_pages_status` + all metadata indices (migration L50-90).
- Searchable: it has `textContent` + `content` columns and is queried like any page (spec-gate scans `pages` directly — `spec-gate.service.ts:245-277`); it appears in the space tree (`page.service.ts:2131-2148`, only `superseded`/`archived` are tree-excluded by default, drafts are shown).
- History-tracked: normal Docmost page-history applies.
- The **only** thing draft buys you is retrieval quarantine: drafts are excluded from AI search/ask by default — `/home/daniel/repos/docmost/apps/server/src/orvex/ai/ai-search.controller.ts:299` and `ai-ask.controller.ts:69` (opt-in `includeOwnDrafts`). That quarantine is a query filter, **not** a storage separation.

Implication for a "staging area": a draft already costs everything a canonical page costs (row, indexes, history, slug, tree slot). It is NOT a cheap out-of-band staging buffer.

## TOPIC B — PROSEMIRROR / TIPTAP CAPABILITY

### 6. Registered node/mark types + the 28-type instructions-embed set
**Canonical server-side schema** = `tiptapExtensions` in `/home/daniel/repos/docmost/apps/server/src/collaboration/collaboration.util.ts:63-172`. Registered (L70-171): StarterKit (paragraph, bullet/ordered/task lists, listItem, blockquote, hr, hardBreak, bold/italic/strike/code marks — codeBlock/link/heading/trailingNode disabled and replaced), **Heading**, UniqueID, Comment, TextAlign, Indent, TaskList/TaskItem, **LinkExtension**, Superscript, SubScript, **Highlight**, Typography, TrailingNode, TextStyle, Color, **MathInline, MathBlock**, **Details/DetailsContent/DetailsSummary** (toggle), **CustomTable/TableCell/TableRow/TableHeader**, Youtube, **TiptapImage, TiptapVideo, TiptapAudio, TiptapPdf**, **Callout**, **Chart**, **Attachment**, **CustomCodeBlock**, **Drawio, Excalidraw**, **Embed** (iframe), **Mention**, **Subpages**, **Columns/Column**, **Status**, **LinearEmbed/LinearGraph/LinearMention/OrvexDashboard**, TransclusionSource/TransclusionReference, FreshnessRibbon, Changelog, and the **AiAuthored** inline mark (AI-provenance) — L171. Client extension sources live in `/home/daniel/repos/docmost/packages/editor-ext/src/lib/` (index at `packages/editor-ext/src/index.ts`) plus Orvex-custom nodes in `packages/orvex-editor-ext/`.

**The ~28-type "instructions-embed" set** is the **page-blocks block-op registry** (a structured high-level authoring API, distinct from raw PM nodes): `/home/daniel/repos/docmost/apps/server/src/orvex/page-blocks/` — `registerBlockSchema`/`registerBlockHandler` in `schemas.controller.ts` (public catalog `GET /api/schemas/blocks`, L31-51) and `handlers/*.ts`. **Exactly 28 registered schemas**: attachment, audio, callout, chart, columns, details, drawio, embed, excalidraw, image_from_prompt, linear_cycle, linear_graph, linear_issue, linear_mention, linear_roadmap, linear_view, math_block, math_inline, mermaid, orvex_dashboard, pdf, status, subpages, table, task_list, tldr, transclusion, video. One-to-one DTOs in `page-blocks/dto/*.dto.ts`; handlers register at module load (e.g. `handlers/diagrams.ts:115` mermaid, `handlers/tabular.ts:332-334` table/task_list/chart, `handlers/media.ts:404-408` video/audio/pdf/attachment/image_from_prompt).
- Nuance worth flagging: **`mermaid` exists as a block-op handler + DTO but is NOT a distinct node in the `tiptapExtensions` PM schema** (no `Mermaid` in collaboration.util.ts). Diagrams in the PM schema are `drawio`/`excalidraw`/`chart`. So mermaid authoring goes through the block-op API, not a raw PM mermaid node.

### 7. Does the server accept full ProseMirror JSON?
**Yes.** Create/update/upsert DTOs take `content?: string | object` with `format` ∈ `{'json','dfm'}` — `/home/daniel/repos/docmost/apps/server/src/core/page/dto/create-page.dto.ts:31,91-99`; `update-page.dto.ts:51,67-71`; `upsert-page.dto.ts:58-72`.
- `json` = **raw ProseMirror JSON object, trusted, no conversion** (create-page.dto.ts:22-24).
- `dfm` = lossless Docmost-flavoured markdown, block-ID-native.
- **`markdown`/`html` are REJECTED on write** — `LOSSY_WRITE_FORMAT_REJECTED`, `/home/daniel/repos/docmost/apps/server/src/core/page/services/page.service.ts:2017-2035` (they drop diagram/callout/column/mention block-ids). Plain markdown import is a separate path: `POST /api/import`.

Conversion path:
- dfm→json: `dfmToJson` + `reattachOpaqueRefs` — `page.service.ts:221-225` (create), `752-754` (update).
- json validate/normalize: `parseProsemirrorContent` — `page.service.ts:2000-2081` → `jsonToNode`/`getSchema` — `collaboration.util.ts:248-269`.
- block-id stamp: `addUniqueIdsToDoc` — `page.service.ts:2073`.
- json→ydoc: `createYdocFromJson` → `TiptapTransformer.toYdoc` — `/home/daniel/repos/docmost/apps/server/src/common/helpers/prosemirror/utils.ts:157-170`; called at `page.service.ts:244`.
- json→text: `jsonToText`/`generateText` — `collaboration.util.ts:189-191`.
- read json→dfm/markdown: `pmToDfm` via `applyContentFormat` — `collaboration.util.ts:207-224,347-349`.

### 8. Server-side normalization / coalescing — does exact JSON round-trip?
**No, exact run-by-run JSON is not guaranteed; semantic content is.** Two mutations:
1. **Unknown node types are silently STRIPPED/unwrapped.** `jsonToNode` catches `Unknown node type` and calls `stripUnknownNodes` (logs a warning, keeps children) — `collaboration.util.ts:248-316`. The registered schema (#6) is the hard gate: submit a node not in `tiptapExtensions` and it is dropped.
2. **Adjacent same-mark text runs coalesce** on the Yjs seam. The REST replace path itself stores the parsed JSON largely verbatim (only block-ids stamped — `page.service.ts:2072-2080`, no `Node.toJSON()` re-serialization), BUT the persisted `ydoc` is built via `TiptapTransformer.toYdoc` (`utils.ts:159`) where marks become Yjs `XmlText` format-ranges; when the collab editor rehydrates JSON from the ydoc, adjacent text nodes carrying identical marks merge into one. The append/prepend merge path round-trips through `prosemirrorDoc.toJSON()` immediately (`page.service.ts:1375`), coalescing on write. This matches the known behavior: verify a write by full-text + effective-marks equality, **not** run-by-run node identity.

---

## VERDICT
**(a) Can a programmatic agent produce genuinely rich/beautiful pages via the API today?** Yes — the write API accepts full ProseMirror JSON (`format:'json'`) or lossless DfM against a rich ~40-extension schema (callout, columns, tables, details/toggle, math, code, drawio/excalidraw/chart, embed, image/video/audio/pdf, mention, Linear/dashboard atoms) plus a 28-type structured block-op catalog; the hard constraints are: node types must be in the registered schema (unknowns are stripped), markdown/html are rejected on write (use json/dfm), and exact adjacent-same-mark text runs coalesce so agents must author by semantic marks, not brittle run splitting.

**(b) Is a draft page already a first-class, full-cost page row?** Yes — `status` and all lifecycle metadata are columns on the core `pages` table (no side-table), so every draft is a fully indexed, searchable, slug-holding, history-tracked `pages` row; "draft" only adds a default retrieval-quarantine query filter, not any storage-level staging separation.
