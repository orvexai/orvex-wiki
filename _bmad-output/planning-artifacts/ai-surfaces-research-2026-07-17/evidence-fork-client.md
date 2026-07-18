# Evidence Map: Orvex fork CLIENT/EDITOR functionality vs upstream Docmost

**Repo**: `/home/daniel/repos/docmost`
**Diff base**: `a689cca7` (upstream Docmost snapshot the fork squashed onto — see `feeb47e3 feat(orvex): squash orvex fork onto upstream docmost@a689cca7`) → `HEAD`, scoped to `apps/client`.
**Scale**: `286 files changed, 27984 insertions(+), 2850 deletions(-)` in `apps/client` alone (88 commits touch the dir).
**Method**: `git diff --stat a689cca7...HEAD -- apps/client`, then targeted `git diff`/`cat` on the highest-signal files.

Every row below states: what it does, evidence paths, and a parity call — **engine-client** (must be re-implemented/ported into the thin AGPL `orvex-wiki` client), **satellite/API** (belongs behind wiki-api/MCP/CLI instead, client is just a consumer), or **DROP** (Linear — explicitly out of scope per program decision).

---

## 1. TipTap editor extensions / nodes registered (schema-level)

Source of truth: `apps/client/src/features/editor/extensions/extensions.ts` diff.

| Extension / Node | What it does | Evidence | Parity call |
|---|---|---|---|
| `Chart` (+ `ChartView`) | New TipTap node type rendering bar/line/pie/scatter charts (Recharts) from a JSON `data` attr; slash-command "Chart"; AI-generation target (`DG2-001`, tool `emit_chart` family) | `extensions.ts` (`Chart.configure({ view: ChartView })`), `apps/client/src/features/editor/components/chart/chart-view.tsx`, slash entry in `menu-items.ts` | **engine-client** — generic data-viz node, not Linear-specific, keep in engine schema |
| `FreshnessRibbon` (+ `FreshnessRibbonView`) | Read-only atom badge showing page freshness (fresh/stale/draft/archived) with icon+date, fetched live via `getPageFreshness()` | `extensions.ts`, `apps/client/src/features/editor/components/orvex-visuals/freshness-ribbon-view.tsx`, `.../orvex-visuals-service.ts` | **engine-client** node + **satellite/API** data source (page-visuals endpoint, CONTRACTS.md §2.10) |
| `Changelog` (+ `ChangelogView`) | Read-only atom rendering a Mantine `Timeline` of page history + `verified_against` stamp; explicitly NOT hand/AI-editable (closes a "P4 leak" — AI cannot rewrite its own audit trail) | `extensions.ts`, `apps/client/src/features/editor/components/orvex-visuals/changelog-view.tsx` | **engine-client** node + **satellite/API** (page_history projection) |
| `AiAuthored` mark | Presence-only inline mark that tints AI-edited text regions (`.ai-authored-wash` CSS class); must be in schema so it survives Yjs sync/reload | `extensions.ts` (comment: "matches the server-side tiptapExtensions registration"), `apps/client/src/ee/page-provenance/styles/provenance.module.css` | **engine-client** (schema + CSS) — this is the mark, not the provenance query |
| `UniqueID.configure({ types: [...] })` massively expanded | Upstream only stamped `heading/paragraph/transclusionSource`; fork stamps IDs on ~30 node types (lists, tables, media atoms, diagram atoms, callouts, columns, `freshnessRibbon`, `changelog`, `linearEmbed`, `linearGraph`) — needed for anchor-linking, AI targeting, and drift/diff tooling to address any block | `extensions.ts` diff | **engine-client** (schema-level, non-Linear entries) |
| `getOrvexExtensions({ enableLinear, orvexDashboardView })` from `@orvex/editor-ext` | External package supplying the Orvex-specific node set (dashboard, and — when Linear enabled — Linear nodes); static `mainExtensions` always includes it with `enableLinear: false` so clipboard paste-rules never fire without Linear configured | `extensions.ts` | mixed — dashboard: **engine-client**; Linear paste-rules/nodes: **DROP** |
| `OrvexDashboardView` node | Renders an "AI build-swarm" flight-director dashboard (waves/milestones/burn/forecast/lanes/blockers/kanban) inline in a page; slash command "Orvex Dashboard" | `apps/client/src/features/editor/extensions/orvex-dashboard-view.tsx`, `apps/client/src/features/orvex-dashboard/OrvexDashboard.tsx` (1551 lines!), `.../orvex-dashboard.css` (869 lines), `.../sample-data.ts` (894 lines), `.../types.ts` | **satellite/API** for data (`useOrvexDashboardQuery`/`useCreateOrvexDashboardMutation` from `@orvex/client`) + **engine-client** node registration only — this is really a satellite feature (build-orchestration reporting), the engine should only host the NodeView shell |
| `getOrvexLinearExtensions(enabled)` — `LinearEmbedView`, `LinearGraphView`, `LinearMentionPill` | Gated Linear node set: only registered into the editor's extension list when `workspace.settings?.linear?.enabled === true` | `extensions.ts` (`export function getOrvexLinearExtensions`) | **DROP** (Linear integration dropped entirely per program decision — strip this whole gated path, not just the settings page) |

---

## 2. Linear-specific embed/node types — DROP

Linear integration is explicitly out of scope for the redesigned program (dropped entirely per instructions). Enumerated here so nothing is silently ported.

| Item | What it does | Evidence |
|---|---|---|
| `linearEmbed` node (kind dispatcher) | Single TipTap node with a `kind` attr (`issue`, `project`, `project-dashboard`, `view`, `cycle`, `roadmap`) dispatching to per-kind React components (`LinearIssueCard`, `LinearProjectCard`, `LinearProjectDashboard`, `LinearViewList`, `LinearCycleCard`, `LinearRoadmapCard`) imported from `@orvex/client` | `apps/client/src/features/editor/extensions/linear-embed-view.tsx` |
| `linearGraph` node | Standalone analytics-chart node (burndown, status distribution, throughput, lead-time histogram, cycle progress, project health matrix) with a `Configure`/`Refresh` toolbar, PATCH/refresh mutations against `/api/integrations/linear/graph/:graphId`; tracks graph references via `getLinearService().addGraphReference/removeGraphReference` | `apps/client/src/features/editor/extensions/linear-graph-view.tsx` (334 lines) |
| `LinearMentionPill` | Inline mention chip for Linear issues/users | referenced in `extensions.ts` import from `@orvex/client` |
| Linear slash-menu items | `registerOrvexLinearItems()` registry populates a third slash-menu group (`basic → ai → linear`) shown only when Linear integration enabled | `apps/client/src/features/editor/components/slash-menu/menu-items.ts` |
| `orvex-linear-settings.tsx` | Workspace admin settings page for connecting/configuring Linear OAuth | `apps/client/src/pages/settings/orvex/orvex-linear-settings.tsx` (46 lines) |
| `IWorkspaceLinearSettings` | `workspace.settings.linear.enabled` flag gating all of the above client-side | `apps/client/src/features/workspace/types/workspace.types.ts` |

**Action**: none of this should be ported. Confirm `linear` settings route, sidebar item (`orvex-settings-sidebar-items.ts` → "Linear" nav entry, admin-only), and the `getOrvexLinearExtensions` gate are all excluded from the redesign's extension surface and slash-menu.

---

## 3. Provenance / status / lifecycle UI (page chrome)

| Feature | What it does | Evidence | Parity call |
|---|---|---|---|
| **AI-provenance badge** (`PageProvenanceBadge`) | Byline badge showing `ai_produced` (grape/robot icon) / `ai_edited` (violet/sparkles) / `human_verified` (teal/filled-shield) state; dropdown "verify" action for humans (calls `useVerifyProvenanceMutation`); deliberately visually distinct from the separate QMS `PageVerificationBadge` (blue rosette/shield) so the two badges don't read as the same thing | `apps/client/src/ee/page-provenance/components/page-provenance-badge.tsx`, `.../provenance-status.ts`, `.../queries/page-provenance-query.ts`, `.../services/page-provenance-service.ts` | **engine-client** UI + **satellite/API** (`provenanceStatus`/`provenanceChangedAt` fields, verify endpoint) |
| **Page status control** (`PageStatusControl`) | Byline dropdown for the page lifecycle state machine: `draft → canonical → deprecated → superseded → archived`; renders per-status colored badge+icon (`STATUS_META`), opens `SupersedePageModal`/`ArchivePageModal`; when status is `superseded` the only exit offered is "Un-supersede" (prevents dangling two-canonicals state) | `apps/client/src/features/page/components/page-status-control.tsx`, `.../page-status-control.utils.ts`, `.../supersede-page-modal.tsx`, `.../supersede-page-modal.utils.ts`, `.../archive-page-modal.tsx`, `.../archive-page-modal.utils.ts` + specs (`__tests__/page-status-control.spec.tsx`, `supersede-page-modal.spec.tsx`, `archive-page-modal.spec.tsx`) | **engine-client** UI + **satellite/API** (status/docType/archiveReason/supersededBy/supersedes fields — see `page.types.ts` `ALL_PAGE_STATUSES` below) |
| **Superseded/archived banner** (`SupersededBanner`) | Full-width `Alert` shown atop a superseded or archived page: "This page is archived…" + server-authored reason text, plus conditional Unarchive / Un-supersede action buttons, plus (for superseded) a link list of what it was superseded by / what it supersedes | `apps/client/src/features/page/components/superseded-banner.tsx`, `.../superseded-banner.utils.ts` + `__tests__/superseded-banner.spec.tsx` (295 lines) | **engine-client** UI + **satellite/API** |
| **"Show superseded & archived" tree toggle** | Sidebar tree atom (`showSupersededAtom`) that, when on, passes the full `ALL_PAGE_STATUSES` list into the sidebar query so otherwise-excluded rows appear; superseded/archived rows render dimmed + badged (`LIFECYCLE_DIM_STATUSES`), with inline Archive/Unarchive/Supersede/Un-supersede actions in the tree context menu | `apps/client/src/features/page/atoms/show-superseded-atom.ts` (120 lines), `apps/client/src/features/page/tree/components/space-tree.tsx` (+218/-lines), `.../tree/utils/utils.ts` (`canArchive`, `canUnarchive`) + `utils.spec.ts` (298 lines) | **engine-client** UI + **satellite/API** |
| **Page lifecycle data model** | `IPage.status`, `docType`, `supersededBy`, `supersedes[]`, `archiveReason`, `redirectFrom[]`, `lastReviewedAt`, `provenanceStatus`, `provenanceChangedAt`; `ALL_PAGE_STATUSES` const (`draft/canonical/deprecated/superseded/archived`); `SidebarPagesParams.status` passthrough; `IPageLifecycleRef` minimal-ref shape returned by supersede/unsupersede endpoints (`{id, slugId, field, value}` envelopes, not full IPage rows) | `apps/client/src/features/page/types/page.types.ts` diff (full block above) | **satellite/API** contract; client types mirror it |
| **Page lifecycle mutations/queries** | `useSetPageStatusMutation`, `useUnsupersedePageMutation`, cache-invalidation helpers for the lifecycle refs | `apps/client/src/features/page/queries/page-query.ts` (+262 lines) + `__tests__/page-query.spec.ts` (425 lines), `apps/client/src/features/page/services/page-service.ts` (+68) + `__tests__/page-service.lifecycle.spec.ts` (143 lines) | **satellite/API** |
| **Transclusion conflict modal** | New modal + hook surfacing conflicts when a transcluded block's source has diverged | `apps/client/src/features/page/components/transclusion-conflict-modal.tsx`, `.../hooks/use-transclusion-conflict.ts` | **engine-client** (transclusion is core editor feature, not Linear) |

**⚠️ Notable REMOVAL, not addition**: upstream Docmost's EE "page-level access/permissions" feature (`general-access-select`, `page-permission-tab`, `publish-tab`, `page-share-modal`, etc. — from upstream commit `59e94556 feat(ee): page-level access/permissions (#1971)`) was **entirely deleted** by the fork (13 files, 1438 lines removed, whole `apps/client/src/ee/page-permission/` directory gone). `share-modal.tsx` was left with a small controlled-vs-uncontrolled Switch state fix but the rest of that EE surface has no fork replacement found in this diff. **Flag for the parity tracker**: confirm intentionally dropped vs. needs to be re-added somewhere (satellite?), since this is upstream functionality the fork removed rather than something net-new to map.

---

## 4. AI-facing UI in the client

### 4.1 AI chat (full-page + sidebar) — `apps/client/src/ee/ai-chat/`

Largest single surface in the diff — effectively a whole chat product bolted onto the wiki.

| Component | What it does | Evidence |
|---|---|---|
| `AiCanvasPane` | New split-pane "canvas" view alongside chat (439 lines, new file) | `components/ai-canvas-pane.tsx` + `styles/ai-canvas-pane.module.css` (303 lines) |
| `BranchSwitcher` / `branch-nav.ts` | Conversation branching UI — switch between alternate AI response branches | `components/branch-switcher.tsx` (169 lines), `utils/branch-nav.ts`, `__tests__/branch-nav.spec.ts` (101 lines), `__tests__/epic-9-cross-story.spec.tsx` / `epic-9-undo-window.spec.tsx` in the editor dir (these reference "Epic 9" branch/undo semantics) |
| `AiStatusBanner` | Status/health banner for the AI chat surface | `components/ai-status-banner.tsx` (77 lines) |
| `ChatModelPicker` / `use-model-pricing.ts` / `model-options.ts` | Model selection + live per-model $/token pricing display | `components/chat-model-picker.tsx`, `hooks/use-model-pricing.ts` (95 lines), `utils/model-options.ts` |
| `ChatScopeSwitcher` | Scope selector (page vs space vs workspace context for the AI chat) | `components/chat-scope-switcher.tsx` |
| `ChatSessionCost` | Running cost display for a chat session | `components/chat-session-cost.tsx` |
| `ChatTuningPopover` | Temperature/params tuning UI | `components/chat-tuning-popover.tsx` (98 lines) |
| **Citations**: `CitationCard`, `CitationSourceList`, `citation-url.ts`, `citation-metadata.ts` | RAG-style citation cards with title/snippet/"Open page" link, localized, tested (`__tests__/citation-url.spec.ts`, `citation-metadata.spec.ts`) | `components/citation-card.tsx`, `components/citation-source-list.tsx`, `utils/citation-url.ts`, `utils/citation-metadata.ts`, `styles/citation.module.css` (216 lines) |
| **Tool-result previews** (6 files) | Rich per-tool-type render of AI tool-call results inside chat: `emit-generative-preview`, `emit-media-preview`, `emit-ref-preview` (handles `emit_subpages/emit_transclusion/emit_embed/emit_status/emit_linear_graph`), `emit-structure-preview`, `emit-text-format-preview`, `insert-update-preview` | `components/tool-previews/*.tsx` (~130 lines each) |
| `ChatToolResult` | Generic tool-call result renderer, heavily expanded (+286 lines) | `components/chat-tool-result.tsx` |
| `chat-message.tsx` | Massively expanded (+724 lines) — presumably now renders streaming markdown, tool calls, citations, branch nav, mermaid, etc. inline | `components/chat-message.tsx` |
| `mermaid-loader.ts` | Lazy mermaid renderer specifically for AI-chat-embedded diagrams | `lib/mermaid-loader.ts` |
| `chat-sanitizer.ts` | Sanitizes AI-generated HTML/markdown before render | `lib/chat-sanitizer.ts` |
| `chat-export.ts` | Export a chat transcript, tested (`__tests__/chat-export.spec.ts`, 188 lines) | `utils/chat-export.ts` |
| `use-ai-chat-title-socket.ts` | WebSocket hook for live chat-title updates | `hooks/use-ai-chat-title-socket.ts` |
| `use-chat-composer-settings.ts` | Persisted composer preferences | `hooks/use-chat-composer-settings.ts` |
| `use-selected-block.ts` | Lets chat reference/act on a currently-selected editor block | `hooks/use-selected-block.ts` (90 lines) |

**Parity call**: this whole surface is **satellite/API** — it is a full RAG chat product, not a wiki-editor primitive. It should map to orvex-studio-mcp / a dedicated chat service behind wiki-api, not live inside the thin engine client. If any piece of UI (chat panel shell) is kept in-engine, all data/streaming/model-routing logic must be satellite-side.

### 4.2 Inline AI (`/ai` slash command + selection actions)

| Component | What it does | Evidence | Parity call |
|---|---|---|---|
| `InlineAiPrompt` | Modal replacing a "legacy `window.prompt()` hack" for the `/ai` slash command: streams a generation, shows partial text live, offers Insert/Save-to-draft/Discard — result is never auto-inserted | `apps/client/src/ee/ai-inline/inline-ai-prompt.tsx` (414 lines) | **engine-client** UI + **satellite/API** stream |
| `use-ai-draft.ts` / `draft-cache.ts` / `ai-draft-query.ts` | Per-page AI "draft slot" — save/resume a generated draft distinct from the live document; range-clamping (`clampDraftRange`) and mermaid-block stripping (`stripMermaidBlocks`) utilities; tested (`__tests__/use-ai-draft.spec.ts`, 271 lines) | `apps/client/src/ee/ai-inline/{use-ai-draft.ts, draft-cache.ts, ai-draft-query.ts}` | **satellite/API** (draft persistence) |
| `AiDraftPanel` | Panel UI showing/resuming a saved draft | `apps/client/src/ee/ai-inline/ai-draft-panel.tsx` (176 lines) | **engine-client** |
| `AiPalette` (Mod+J) | Mantine Spotlight-based command palette: captures selection-or-block context, validates prompt length, shows recent prompts (localStorage LRU, workspace-scoped), dispatches into `useAiBubbleAction().runAction(editor, 'custom', ...)` | `apps/client/src/features/editor/components/ai-palette/{ai-palette.tsx, constants.ts, select-context.ts}` + `ai-palette.spec.tsx` (253 lines) | **engine-client** UI + **satellite/API** (`@orvex/client` AI action runner) |
| Bubble-menu AI actions + **translate submenu** | Selection bubble menu expanded (+260 lines) with an AI action set and a dedicated `TranslatePickerMenu`: 12 curated `Intl.DisplayNames` languages + "Custom…" free-form modal, persists last-used language per workspace | `apps/client/src/features/editor/components/bubble-menu/{bubble-menu.tsx, translate-picker-menu.tsx (236 lines)}` + `bubble-menu.spec.tsx` (185 lines) | **engine-client** UI + **satellite/API** (translation call) |
| AI slash-menu registry | `registerOrvexAiItems()` — host component registers a dynamic "ai" slash-menu group when generative AI is enabled | `apps/client/src/features/editor/components/slash-menu/menu-items.ts` | **engine-client** |

### 4.3 AI settings & governance surfaces

| Page/Component | What it does | Evidence | Parity call |
|---|---|---|---|
| `orvex-ai-settings.tsx` (workspace, admin) | Workspace-level AI settings: generative/mcp/chat toggles, memory enable, chat-history TTL, throttle/cost-cap knobs | `apps/client/src/pages/settings/orvex/orvex-ai-settings.tsx` (147 lines); backing types in `workspace.types.ts` (`IWorkspaceAiSettings.memory/chatHistoryTtlDays/throttle`, `IWorkspaceAiMemorySettings`, `IWorkspaceAiThrottleSettings`) | **satellite/API** for settings storage, **engine-client** or satellite UI (admin console candidate) |
| `AiMemorySettings` | Per-workspace + per-user "AI memory" inspector: memories grouped by scope (user/space), edit/delete, inline add form; admin-only enable switch, optimistic mutations w/ rollback | `apps/client/src/ee/ai-settings/components/ai-memory-settings.tsx` (603 lines), `queries/ai-memory-query.ts` (232 lines) | **satellite/API** |
| `AiPromptLibrary` | Saved reusable prompts, personal vs workspace-shared, admin-gated sharing | `apps/client/src/ee/ai-settings/components/ai-prompt-library.tsx` (521 lines), `queries/ai-prompt-query.ts` (236 lines) | **satellite/API** |
| `account-ai.tsx` | Per-user settings page mounting `AiMemorySettings` + `AiPromptLibrary` under the user-scope settings route (since the workspace-scope AI page is admin-gated) | `apps/client/src/pages/settings/account/account-ai.tsx` | **engine-client** (thin settings route) |
| `AiUsageDashboard` | Cost-transparency surface: month spend vs. configured cap, progress bar, soft/hard-cap state, chat/message counts; all via `GET /api/ai/usage` | `apps/client/src/ee/ai-usage/ai-usage-dashboard.tsx` (298 lines), `ai-usage-query.ts` | **satellite/API** |
| `mcp-settings.tsx`, `enable-ai-search.tsx`, `enable-generative-ai.tsx`, `ai-settings.tsx` (old `ee/ai/pages`) **removed** | Upstream/earlier EE AI-settings surface fully replaced by the new `orvex-ai-settings.tsx` + sub-pages above | `git diff --diff-filter=D` shows these deleted (156/71/53/85 lines removed) | superseded — informational only |
| `orvex-mcp-settings.tsx` | Workspace MCP-server enable/config page (canonical `settings.mcp.enabled`, replacing a legacy `settings.ai.mcp` path per code comment) | `apps/client/src/pages/settings/orvex/orvex-mcp-settings.tsx` (153 lines) | **satellite/API**-backed settings, thin client page |
| `orvex-api-docs-settings.tsx` | In-app API docs / API-key management settings surface | `apps/client/src/pages/settings/orvex/orvex-api-docs-settings.tsx` (227 lines) | **engine-client** (or CLI/portal candidate) |

### 4.4 AI-authored diagram/visual pipelines

| Feature | What it does | Evidence | Parity call |
|---|---|---|---|
| Draw.io AI integration | `drawio-view.tsx` comment: "Orvex AI's regex converter (`emit_drawio`): the mxfile XML is base64-…" — AI tool output is converted and rendered live; also carries Mermaid source seed for AI-generated diagrams pending a real save (+311 lines in view, new `__tests__/drawio-menu.spec.tsx` 431 lines) | `apps/client/src/features/editor/components/drawio/drawio-view.tsx`, `drawio-menu.tsx`, `__tests__/drawio-menu.spec.tsx` | **engine-client** (rendering) + **satellite/API** (the `emit_drawio` AI tool itself) |
| Excalidraw bake pipeline | `bakeExcalidrawScene()` — single-source-of-truth export of an Excalidraw scene to a theme-adaptive SVG attachment, shared by the node-view editor and the insert modal (bug note: a prior theme-adaptive fix "lived in two near-identical copies and drifted"); `ExcalidrawBakePage` — a **headless route** (`/excalidraw-bake`?) driven by a server-side Playwright worker to rasterize scenes/Mermaid DSL to SVG via Redis-backed payload tokens or inline base64 | `apps/client/src/features/editor/components/excalidraw/excalidraw-utils.ts` (83 lines), `excalidraw-view.tsx` (+349/-…), `excalidraw-menu.tsx` (+103), `__tests__/excalidraw-view.spec.tsx` (379 lines); `apps/client/src/pages/excalidraw-bake/excalidraw-bake-page.tsx` (247 lines, headless, no auth) | **engine-client** (bake utils + view) + **satellite** (the Playwright bake worker + `/api/bake/payload/:token` endpoint are server-side, likely belongs to a rendering microservice, not the thin engine) |
| `mermaid-config.ts` | New shared Mermaid theme/config module (119 lines) — likely used by both the editor's live Mermaid node and the AI-chat mermaid loader | `apps/client/src/features/editor/components/mermaid-config.ts` | **engine-client** |
| `AiAuthored`/provenance wash CSS | See §3 — visually marks AI-touched regions in the live document, tied into diagram bake and text alike | `apps/client/src/ee/page-provenance/styles/provenance.module.css` | **engine-client** |

### 4.5 AI in search

| Feature | What it does | Evidence | Parity call |
|---|---|---|---|
| `search-spotlight-attachment-result.spec.tsx` (new, 153 lines) + `search-spotlight.tsx` (+8) | Search spotlight gains attachment-result rendering (files/images returned by search, not just pages) | `apps/client/src/features/search/components/{search-spotlight.tsx, __tests__/search-spotlight-attachment-result.spec.tsx}` | **satellite/API** (search backend) + **engine-client** (result row UI) |
| `ai-search-result.tsx` (+11) | Existing AI semantic-search result row, tweaked | `apps/client/src/ee/ai/components/ai-search-result.tsx` | **engine-client** |
| `ai-menu.tsx` (editor bubble AI menu, +26/-) | Editor-embedded AI action menu (predates the new palette, still present/expanded) | `apps/client/src/ee/ai/components/editor/ai-menu/ai-menu.tsx` | **engine-client** |

---

## 5. Auth / device / clerk surfaces (client-facing, not strictly "editor" but AI-facing infra)

| Feature | What it does | Evidence | Parity call |
|---|---|---|---|
| Clerk login (`/clerk` route) | POC Clerk `<SignIn/>` + org switcher; exchanges Clerk session for a Docmost authToken cookie via `POST /api/clerk/exchange`; each Clerk Organization maps 1:1 to a workspace | `apps/client/src/pages/auth/clerk-login.tsx` (89 lines), `apps/client/src/features/clerk/clerk-app-provider.tsx` (+19) | **satellite/API** (auth), thin client route |
| Device approval page | New OAuth device-authorization-grant approval UI (`IconDeviceLaptop`, code entry, approve/deny) — almost certainly backs CLI/MCP device login (`orvex-cli`/MCP client auth) | `apps/client/src/pages/device/device-approval-page.tsx` (328 lines), `apps/client/src/features/device-auth/{services/device-auth-service.ts (45), types/device-auth.types.ts (34)}` | **satellite/API**, client is a thin approval UI — directly relevant to orvex-cli device-login flow |
| `api-key/utils/mcp-enabled.ts` | Marks/derives whether an API key is MCP-enabled; surfaced in key-created/revoke modals | `apps/client/src/ee/api-key/utils/mcp-enabled.ts` (25 lines) + `__tests__/mcp-enabled.spec.ts` (63 lines) | **satellite/API** |

---

## 6. Audit / events UI (workspace admin)

| Feature | What it does | Evidence | Parity call |
|---|---|---|---|
| `orvex-events-settings.tsx` + 3 tabs | New workspace admin page: **Log tab** (filterable event-type table, payload modal), **Connections tab** (outbound webhook/Kafka-consumer connections), **Settings tab** (event feature config) | `apps/client/src/ee/events/pages/orvex-events-settings.tsx` (83), `components/{events-log-tab.tsx (199), events-connections-tab.tsx (141), events-settings-tab.tsx (139), event-payload-modal.tsx (41)}`, `api/events-admin.api.ts` (71), `queries/{use-events-connections.ts, use-events-settings.ts}` | **satellite/API** — this is the client surface for the Kafka CloudEvents outbox; belongs to the events/audit microservice, engine hosts only the settings-nav shell |
| `audit-event-labels.ts` | Human-readable label map for audit event types, incl. the new `PAGE_HISTORY_RESTORED` event (see `IPageInput.restoreFromHistoryId`) | `apps/client/src/ee/audit/lib/audit-event-labels.ts` (78 lines) | **satellite/API** |

---

## 7. Misc editor/UI polish worth flagging

| Item | What it does | Evidence | Parity call |
|---|---|---|---|
| `SubpagesCardView` | New "card grid" display mode for the `subpages` block — status-rolled-up grid with status badges (canonical=green/draft=gray), server pre-filters out superseded/archived/deprecated | `apps/client/src/features/editor/components/subpages/subpages-card-view.tsx` (116 lines) | **engine-client** UI + **satellite/API** filter |
| `resizable-wrapper.tsx` (+10) | Shared resize-handle wrapper reused across media/diagram nodeviews | `apps/client/src/features/editor/components/common/resizable-wrapper.tsx` | **engine-client** |
| History-restore hook (+49) | `use-history-restore.tsx` now stamps `restoreFromHistoryId` (feeds the `PAGE_HISTORY_RESTORED` audit event, see §6) | `apps/client/src/features/page-history/hooks/use-history-restore.tsx` | **engine-client** + **satellite/API** (audit) |
| `theme.ts` (+106/-) | Substantial Mantine theme rework — new brand tokens presumably backing the provenance/status/dashboard color systems above | `apps/client/src/theme.ts` | **engine-client** |
| `vite.config.ts` (+15/-) | Build config changes — check for new externalized packages (`@orvex/client`, `@orvex/editor-ext`) that must exist as installable packages in the new repo split | `apps/client/vite.config.ts` | infra — verify package boundaries for the split program |
| `package.json` (+68/-) | New deps: likely `@excalidraw/excalidraw`, `recharts`, `@clerk/react`, `dompurify`, `alfaaz` (word count), `@orvex/client`, `@orvex/editor-ext`, mermaid tooling. **Recommend a follow-up `git diff` on this file specifically** to build the exact dependency-parity list | `apps/client/package.json` | infra |
| `orvex.json` locale file (new, 59 lines) + `translation.json` (+124/-) | Dedicated Orvex-namespace i18n strings, separate from upstream's `translation.json` | `apps/client/public/locales/en-US/{orvex.json, translation.json}` | **engine-client** |

---

## Summary counts

- **88 commits**, **286 files**, **+27,984 / -2,850** lines in `apps/client` since the upstream squash point.
- **New TipTap node types**: `chart`, `freshnessRibbon`, `changelog`, `linearEmbed`, `linearGraph`, `orvexDashboard` (+ the `AiAuthored` mark) — 6 nodes + 1 mark, none upstream.
- **Whole new product surfaces**: AI chat (canvas/branching/citations/tool-previews — largest single block), AI memory, AI prompt library, AI usage/cost dashboard, events/audit admin UI, device-auth approval flow, Clerk auth POC, Orvex build-swarm dashboard.
- **Page-lifecycle state machine** (draft/canonical/deprecated/superseded/archived) with full UI (badge, dropdown, modals, tree dimming/toggle, banners) — net-new, not in upstream.
- **AI provenance tracking** (ai_produced/ai_edited/human_verified) with its own distinct badge — net-new.
- **Linear integration** (2 node types, settings page, slash items, mention pills) — **DROP**, confirmed gated behind `workspace.settings.linear.enabled`.
- **One upstream EE feature fully removed**: page-level access/permissions (`ee/page-permission/*`, 13 files / 1438 lines) — flag for parity-tracker review (intentional cut vs. needs a replacement).
