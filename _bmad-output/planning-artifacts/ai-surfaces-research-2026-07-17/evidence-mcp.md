# Evidence Map — orvex-studio-mcp tool surface (HEAD)

**Repo**: `/home/daniel/repos/orvex-studio-mcp`
**HEAD**: `4f81b483d73aa2fdeabdcc4778cb4173eab8d95a` (`4f81b48 docs(wds): design-log — comprehensive wiki + ticket completion sweep`)
**package.json**: `name: orvex-studio-mcp`, `version: 0.1.0`

## 1. Top-line counts

| Bucket | Count | File / mechanism |
|---|---|---|
| Total registered MCP tool names at HEAD | **52** | see breakdown below |
| Hero (always-advertised) tools | 13 | `src/server/tool-catalog.ts::HERO_TOOL_NAMES` (hard ceiling — adding one requires an ADR to retire another) |
| REAL (live upstream, non-scaffold) tools | **21** | 13 wiki/knowledge/ai/meta core group + 8 `studio_*`/`marketplace_search`/`skill_get`/`wiki_comment_post` (conditional on `STUDIO_BACKEND_BASE_URL`) |
| Scaffold `NOT_AVAILABLE_YET` stubs (registered, wired to nothing) | 30 | `registerScaffoldStubs` (`src/server/tools.ts:1179,1238-1920`) |
| Confirmation-gated but substrate-absent (real governance, fake backend) | 1 | `marketplace_publish` (`src/server/tools.ts:2337`) |
| Deep-Research interop aliases (zero-logic, not hero, not in any category) | 2 | `search`→`knowledge_search`, `fetch`→`wiki_get` |

Registration call sites (`server.registerTool(`):
- `src/server/tools.ts` — 12 explicit named calls (whoami, ai_ask, knowledge_search, knowledge_related, wiki_get, `search` alias, `fetch` alias, wiki_get_neighborhood, wiki_get_tree, wiki_get_changes, get_capabilities, list_tools) + 1 loop-registered batch of 30 scaffold stubs (`registerScaffoldStub`, called once per def in `registerScaffoldStubs`) + `wiki_save` (registerWriteTools, unconditional) + `marketplace_publish` = **44 registrations from this file**.
- `src/server/studio-tools.ts` — 8 explicit calls, **conditionally registered** only when `STUDIO_BACKEND_BASE_URL` is set (`src/server/index.ts:142-144`).

Total distinct tool names = 44 + 8 = 52.

## 2. The Hero-13 (`src/server/tool-catalog.ts:39-55`)

Hard ceiling — `standalone-boot.test.ts` asserts the default `tools/list` equals this array exactly. Adding a 14th requires an ADR to retire one.

| # | Tool | Status |
|---|---|---|
| 1 | `whoami` | REAL |
| 2 | `list_tools` | REAL (meta) |
| 3 | `wiki_get` | REAL |
| 4 | `wiki_save` | REAL |
| 5 | `knowledge_search` | REAL |
| 6 | `ai_ask` | REAL |
| 7 | `memory_recall` | SCAFFOLD → `NOT_AVAILABLE_YET` (ENG-2471) |
| 8 | `staging_propose` | SCAFFOLD → `NOT_AVAILABLE_YET` (Linear 0/37, id `9dd16c33`) |
| 9 | `workgraph_prime` | SCAFFOLD → `NOT_AVAILABLE_YET` (Linear 0/36, id `e22b6e30`) |
| 10 | `workgraph_ready` | SCAFFOLD → `NOT_AVAILABLE_YET` |
| 11 | `workgraph_claim` | SCAFFOLD → `NOT_AVAILABLE_YET` |
| 12 | `workgraph_save` | SCAFFOLD → `NOT_AVAILABLE_YET` |
| 13 | `workgraph_handoff` | SCAFFOLD → `NOT_AVAILABLE_YET` |

**7 of the 13 hero seats are forward-contract stubs that always return `NOT_AVAILABLE_YET`.** Only 6 heroes are live: whoami, list_tools, wiki_get, wiki_save, knowledge_search, ai_ask.

## 3. Full tool table (all 52)

### 3a. Core wiki/knowledge/ai/meta group — REAL, unconditional (`src/server/tools.ts`)

| Tool | Hero? | Category | Description (one-line) | readOnly/destructive/idempotent |
|---|---|---|---|---|
| `whoami` | hero | — | Identity + writable spaces: `{workspace_id, workspace_name, default_space_id, spaces[{id,name,can_edit}], token_scope}` | ro / non-destr / idempotent |
| `ai_ask` | hero | — | Cited RAG answer over the tenant wiki; K5 shape `{answer, citations[], confidence, unanswered, gapNote, followups[]}`; never fetches a body; fails loud `AI_UNCONFIGURED` if no provider | ro / non-destr / idempotent |
| `knowledge_search` | on-demand alias exists as `search` | `knowledge` | Hybrid keyword+vector search across corpora, ACL∩scope-narrowed; returns `{id,title,space,url,excerpt,score}` only, never bodies | ro / non-destr / idempotent |
| `knowledge_related` | on-demand | `knowledge` | "More like this" via embedding similarity (not link graph) | ro / non-destr / idempotent |
| `wiki_get` | hero | — | Token-efficient read ladder: `outline` (headings+block_ids+token_estimate) → `section` (one block) → `full` (auto-degrades to outline over `token_budget` unless `force_full`) | ro / non-destr / idempotent |
| `search` | hidden alias, not hero, no category | — | Deep-Research interop shim → `knowledge_search` (zero-logic, identical schema) | ro |
| `fetch` | hidden alias, not hero, no category | — | Deep-Research interop shim → `wiki_get` (zero-logic, identical schema) | ro |
| `wiki_get_neighborhood` | on-demand | `wiki` | Structural navigation (parent/children/siblings) | ro |
| `wiki_get_tree` | on-demand | `wiki` | Paginated space/page tree for orientation | ro |
| `wiki_get_changes` | on-demand | `wiki` | Incremental changes since timestamp T | ro |
| `get_capabilities` | on-demand | `meta` | Self-onboarding: DfM grammar + verb reference + write-posture summary (e.g. "off (WRITES_ENABLED=false — soft off)") | ro |
| `list_tools` | hero | — | Reveals a gated on-demand category for the rest of the session; reviewer category (`staging_review`) reveals ONLY under reviewer creds | ro |
| `wiki_save` | hero | — | The single upsert verb — merged create/update/upsert (whole-doc `content`) + surgical block-patch (`blocks`: `string_patch`\|`block_patch`\|`batch`). REAL, wired to wiki-api `/v1`. Registered **unconditionally** (`registerWriteTools` call at `tools.ts:1188` is not gated); the READ_ONLY/WRITES_ENABLED ceiling is enforced **inside the handler**, not at registration. | non-ro / non-destr(annotation) / idempotent |
| `marketplace_publish` | on-demand | `marketplace` | Publish a prompt pack — destructive-class, real elicitation/confirm_token gate wired ahead of substrate; a confirmed publish still returns `NOT_AVAILABLE_YET` (marketplace substrate not live) | non-ro / destructive |

### 3b. Scaffold stubs — 30 tools, ALL return `NOT_AVAILABLE_YET` (never a fabricated 200)

Registered via `registerScaffoldStub`/`registerScaffoldStubs` (`src/server/tools.ts:1179, 1238-1920`), each carrying a `[SCAFFOLD]` description naming the exact tracking substrate.

| Substrate | Tracking ref | Tools (30 total) |
|---|---|---|
| memory (ENG-2471, unstarted) | ENG-2471 | `memory_recall` (hero), `memory_propose` |
| staging (Linear 0/37, id `9dd16c33`) | 9dd16c33 | `staging_propose` (hero), `staging_changeset_submit`, `staging_changeset_status`, `staging_list_mine`, `staging_withdraw`, `staging_review_queue`†, `staging_review_decide`†, `staging_review_apply`† |
| workgraph (Linear 0/36, id `e22b6e30`) | e22b6e30 | `workgraph_prime`(hero), `workgraph_ready`(hero), `workgraph_claim`(hero), `workgraph_save`(hero), `workgraph_handoff`(hero), `workgraph_relate`, `workgraph_remember`, `workgraph_recall`, `workgraph_forget`, `workgraph_search`, `workgraph_batch`, `workgraph_grant`, `workgraph_gate_check`, `workgraph_template_apply` |
| wiki-api attachments not yet served (R-SEAM-8a) | — | `wiki_attachment_get`, `wiki_attachment_save` |
| ai client has no model-list endpoint (R-SEAM-9c) | — | `ai_models` |
| no billing/entitlements read model pinned (R-SEAM-9c) | — | `billing_plan`, `billing_usage` |
| audit-service scope-model extension not landed (R-SEAM-9a) | — | `audit_query` |

† `staging_review_*` = reviewer-cred-scoped (`REVIEWER_CATEGORY = "staging_review"`), never advertised in a default session, revealed only via `list_tools("staging_review")` under `staging:review` token scope or `reviewer` role (`tool-catalog.ts:97-109, 202-217`). Non-reviewer call → `FORBIDDEN`; reviewer call → `NOT_AVAILABLE_YET` (still scaffold).

Governance notes visible even inside the stubs: `workgraph_grant` returns `NOT_AVAILABLE_YET` for `agent_enabled` tenants but a structural `SHARING_CONSOLE_ONLY` for `console_only` tenants; `memory_propose` enforces the `staged`/`direct` tenant knob (over-broad mode → `FORBIDDEN`, never silently narrowed); READ_ONLY ceiling still short-circuits every write-shaped stub ahead of the `NOT_AVAILABLE_YET`.

### 3c. Studio-api-fronted long tail — 8 tools, REAL, CONDITIONAL on `STUDIO_BACKEND_BASE_URL`

`src/server/studio-tools.ts`, registered only when `process.env.STUDIO_BACKEND_BASE_URL` is set (`src/server/index.ts:142-144`).

| Tool | Backend | Write? | Notes |
|---|---|---|---|
| `marketplace_search` | knowledge-direct (KNOWLEDGE_BASE_URL) | ro | R-SEAM-3: kept as a separate tool, NOT folded into `knowledge_search`. **Known mismatch (R21 finding #6, LOW, deferred)**: gated on `STUDIO_BACKEND_BASE_URL` as a proxy, not its real dependency (`KNOWLEDGE_BASE_URL`) — see `index.ts:130-141` comment |
| `skill_get` | knowledge-direct | ro | Read-one counterpart to `marketplace_search` |
| `studio_memory_get` | orvex-studio-api | ro | User-managed Memory product read (delegated principal) |
| `studio_memory_save` | orvex-studio-api | write | `checkWriteAllowed` gate; read-only sessions 403 |
| `studio_library_list` | orvex-studio-api | ro | |
| `studio_library_save` | orvex-studio-api | write | non-idempotent annotation |
| `studio_librarian_session` | orvex-studio-api | ro | Interact with "Marian" librarian session |
| `wiki_comment_post` | orvex-studio-api `/v1/social` | write | R-SEAM-1 re-home: kept in `wiki_` namespace (sanctioned §1 exception) though backend is studio-api, not wiki-api |

## 4. Progressive disclosure / categories (`src/server/tool-catalog.ts`)

Default `tools/list` = hero-13 only. `list_tools(category)` reveals a named category for the rest of the session. `HIDDEN_CATEGORIES` (advertised in the `list_tools` input enum): `wiki, knowledge, meta, audit, staging, workgraph, memory, ai, billing, studio, marketplace`. The reviewer category `staging_review` is deliberately **excluded** from that list — never documented to a non-reviewer session.

`src/server/tool-visibility.ts` replaces the SDK's default `tools/list` handler (no supported SDK extension point exists) via a reach-through capture of the low-level `_requestHandlers` map — documented as fragile-but-tested (`standalone-boot.test.ts` fails loud on an SDK internal-shape change). Pagination: `TOOLS_PAGE_SIZE = 13` (must be ≥ hero count so the hero set never fragments across pages); `cursor`/`nextCursor` contract engages once a revealed set exceeds 13.

## 5. The read ladder (`wiki_get`, `src/server/tools.ts:819-937`)

Three rungs, one verb, `mode` discriminant:

| Mode | Behavior |
|---|---|
| `outline` (default) | Headings + `block_id`s + per-block `token_estimate`; cheapest rung. `response_format`: concise (default, drops per-block depth) \| detailed. |
| `section` | One block as DfM via `blockId` (must call `outline` first for block ids); requires `blockId` or `MISSING_BLOCK_ID`. Includes `fidelity` scan (`scanFidelity`). |
| `full` | Whole doc as DfM. **Auto-degrades to outline** when `estTokens > token_budget` (default 1000, max 16000) unless `force_full:true` — returns a visible `degraded:true` + `degraded_reason` banner, never a silent truncation. |

Token estimate for auto-degrade: `Math.ceil((page.content?.length ?? 0) / 4)` (char/4 heuristic, `tools.ts:881`).

`fetch` alias forwards to the identical handler/schema (Deep-Research interop, zero-logic).

## 6. Write governance — 4 layers + a hard ceiling (`src/server/governance.ts`)

Posture: **writes ON by default** (R-WDS-3 supersedes a former off-by-default posture).

| Layer | Mechanism | Enforcement point |
|---|---|---|
| Ceiling | `READ_ONLY=true` env — hard override, wins over everything (**precedence: READ_ONLY > WRITES_ENABLED**). Suppresses write-verb *registration* is the documented intent, but `wiki_save` is registered unconditionally (hero-13 must be exercisable even under READ_ONLY) — enforcement is therefore the handler-level `readOnlyCeiling()` check at `tools.ts:2001`, "the sole enforcement point, not defence-in-depth" per the inline comment. | `governance.ts:46-48`, `tools.ts:2001` |
| Layer 1 | Master posture `WRITES_ENABLED` (default true; `=false` is a soft off, distinct from the ceiling). `writeSurfaceEnabled() = !readOnly && writesEnabled`. | `governance.ts:36-58` |
| Layer 2 | `dry_run:true` — preview receipt, zero upstream writes. | `governWrite`, `tools.ts:2045-2054` |
| Layer 3 | Space allow-list `WRITE_ALLOWED_SPACES` (comma-separated, `*` = all). Deny-by-default: empty ⇒ nothing writable even with writes on. For update/upsert/block-edit with no explicit `spaceId`, one pre-read resolves the page's space under a restrictive allow-list (skipped when `*`). | `checkSpaceAllowed`, `governance.ts:69-90` |
| Layer 4 | Per-request `confirm_token` for a destructive whole-doc `replace` overwrite (must match `WRITE_CONFIRM_TOKEN` env when configured). Append/prepend and every block edit are never destructive. §5 elicitation primitive (host-UI dialog) is the primary confirmation hook when the client supports it; `confirm_token` is the transport-agnostic fallback. A decline → typed `WRITE_CONFIRM_DECLINED` (no write). | `checkConfirmToken`, `governance.ts:97-125`; elicitation seam `src/server/elicitation.ts` |
| Audit | Stderr JSON line on every mutation attempt (allowed/denied/dry-run) — never stdout (the stdio transport channel), never token material. | `auditWrite`, `governance.ts:127-150` |

Publish-path gate (separate from the 4 layers, R-SEAM-8c/ENG-2875): `status:'published'` is refused (`NEEDS_HUMAN_PUBLISH`) under a `ratify_required` tenant unless a human-supplied `ratify_token` is relayed **verbatim** (never minted by the MCP); a `scoped_key` tenant may publish directly. This runs *before* the confirmation prompt (R21 finding #5 — never elicit a human for a write governance is going to refuse anyway).

`wiki_save` verified-write contract: CAS `ifVersion` required for update/upsert/block edits; stale version → `409 VERSION_MISMATCH`, no partial write; returns a **verified diff-receipt** `{url, id, version, persisted}` via read-after-write (`contentPersisted`, `tools.ts:191-199`); abort-safety distinguishes `aborted-clean` vs `aborted-uncertain` (`ABORTED` vs `ABORTED_UNCERTAIN_STATE`).

## 7. Trust metadata (`src/server/common.ts:149-166`)

Every envelope carries `trust: {provenance, retrieved_at?, freshness?, source_url?, updated_at?, can_edit?}`. Field set is **payload-class-dependent** (`PayloadClass = "read"|"answer"|"list"|"receipt"`):
- `read`/`list` include `retrieved_at`; `receipt` omits both `retrieved_at` and `freshness` (just-written state).
- `freshness` = `fresh` if `updatedAt` within 24h, else `stale`, else `unknown` (`freshnessOf`).
- `can_edit` derived from `token_scope.includes("wiki:write")` per-call, not cached.

Fidelity metadata (`FidelityMeta`): `{lossless, sentinels[], downgraded_nodes[]}`, computed by a **zero-call inline regex scan** (`scanFidelity`, `tools.ts:131-151`) over DfM for `<!-- unsupported: … -->` sentinels and `:::directive` opaque blocks — no `/v1/convert/fidelity` API round trip on every read.

Uniform envelope is **plain text primary, `structuredContent` mirror secondary** (`renderEnvelopeText`/`envelope()`, `common.ts:196-310`) — deliberately not JSON-as-primary-channel.

## 8. Locators (`src/server/common.ts:432-448`)

`LocatorSchema` = union of a bare smart-locator string (id\|slug\|url\|title\|path\|natural-language) OR an object `{id?, slugId?, url?, title?, spaceId?}`. **No pre-resolve hop** — the MCP passes the most-specific string straight through to wiki-api's `/v1` `{loc}` segment, which resolves by dialect server-side (`Locator{Kind:"auto"}`).

## 9. Streaming / progress relay — two distinct mechanisms, one dormant, one exercised only under `progressToken`

| Class | Mechanism | File | Live status |
|---|---|---|---|
| **ask-class** (`ai_ask`) | `relayAskStream` drains an `AsyncIterable<AskFrame>` from `ai`'s SSE grammar, emitting one `notifications/progress` per content/citation frame when a `progressToken` is present. | `src/server/tools.ts:201-299` | **DORMANT/latent.** `ai`'s proven `/v1/ask` is buffered-JSON-only (T1); its one proven SSE grammar (`/v1/chat`) carries no K5 verdict frame. The live path is `isAskStream(outcome)` false → buffered K5 object returned directly, **zero notifications sent**. The streaming branch is fully wired code that has never executed against real `ai` traffic — armed "the moment ai returns `text/event-stream`". If it ever drained to end-of-stream with no terminal `error` frame, it would **fail loud** with `AI_UPSTREAM_TRUNCATED` rather than fabricate a K5 verdict (invariant: never fabricate success). |
| **edit-class** (`wiki_save` block edits) | `withStageProgress` — a **separate, local, non-SSE** emitter (`converting`→`writing`→`verifying` labels) over ordinary awaited pipeline steps against wiki-api; explicitly NOT the SSE frame parser (design-it-twice rejected force-fitting network-frame vocabulary onto local control flow). | `src/transport/stage-progress.ts` | **Real, exercised whenever a caller supplies `_meta.progressToken`.** Strict no-op otherwise (`AC2`). Stage set is write-shape-specific: `converting` only emitted for `block_patch` or a batch op carrying DfM content; a pure `string_patch` or structural-only batch never claims a conversion stage it doesn't run. |

`src/transport/sse-frame-parser.ts` (116 lines, not read in full) is the actual SSE-decoding primitive `ai.ts`'s `streamAsk` uses — separate from both relay mechanisms above.

## 10. Auth / trust boundary

- **Single auth-seam type**: `Principal` (`src/auth/types.ts`) — IdP-agnostic (`idp: "clerk"|"keycloak"`), `subject`, `tenant`, `org_or_realm`, `roles[]`, `token_scope[]`, optional `cell`/`cell_epoch` (cell-routing claims, ADR-0030). The legacy Studio-session `SessionTokenClaims`/`SessionManager` flow was **deleted** (R1/ENG-1405) — no scoped-key exchange, the caller's identity-minted bearer forwards **verbatim** (FR-M12).
- **Deny-by-default scope gate** (`src/auth/scope-gate.ts`): pure, no-I/O `assertTokenScope(principal, required, errorCode)` — the single verdict function both `denyIfMissingScope`/`requireScope` (reads) and `checkWriteAllowed` (writes) delegate to. Codes: `SCOPE_DENIED` (read) / `FORBIDDEN` (write). `intersectScope(gate, tokenScope)` is the "never wider than the token" primitive — effective authorization is always `gate ∩ token_scope`.
- `ai_ask` explicitly deny-gates on `wiki:read` before any upstream call (`denyIfMissingScope`, `tools.ts:651`).
- Identity verification files present but not deep-read this pass: `src/auth/identity-verifier.ts` (527 lines — JWKS/issuer verification), `src/auth/http-introspector.ts` (137 lines — `POST /v1/introspect`), `src/auth/context.ts` (67 lines — session-context store bridging transport↔tools), `src/events/revocation-consumer.ts` (317 lines — Kafka-driven mid-session token revocation).

## 11. Upstreams (three, config-seamed — `src/config/config.ts`)

Per `config.ts` header comment (arch §A-UPSTREAM, D-M2/D-M7): **exactly three** upstreams, each a configured URL, never hardcoded:

| Upstream | Env var | Purpose | Empty behavior |
|---|---|---|---|
| wiki-api | `WIKI_API_BASE_URL` | The single WIKI upstream — reads/writes AND search/related route through it, never MCP-direct-to-engine (no-fallbacks doctrine). Legacy engine-URL fallback **removed** (R0/ENG-1404). | `WIKI_UPSTREAM_UNCONFIGURED` |
| ai | `AI_BASE_URL` | `ai_ask`/chat/inline/generate — owns the full cited-ask loop. | `AI_UNCONFIGURED` |
| knowledge | `KNOWLEDGE_BASE_URL` | Hybrid search/related — reached **direct** from the MCP for `knowledge_search`/`knowledge_related` (D-M8/ENG-2460), explicitly NOT through a wiki-api `/v1/search` facade. | `KNOWLEDGE_UNCONFIGURED` |
| identity (verification only) | `ORVEX_IDENTITY_URL` (falls back to legacy `STUDIO_API`) | JWKS/issuer registry, `POST /v1/introspect`, revocation broadcast. MCP **never** calls the mint endpoint (`POST /v1/tokens`) — "minting by proxy" is explicitly forbidden (FR-M11). | n/a (verification degrades) |
| studio-api (product tools only) | `STUDIO_BACKEND_BASE_URL` | Gates registration of the 8 `studio_*`/marketplace/comment tools. | tools not registered at all |

The MCP holds **no knowledge base URL fallback and no engine base URL** — knowledge is reached only through wiki-api (facade path, unused per D-M8) or direct (live path), never a third way.

## 12. Legacy / zero-legacy posture

- `SessionTokenClaims`, `Resolve*`/`CachedSession` shapes, and `SessionManager` were **deleted** (R1/ENG-1405 AC3) — no scoped Docmost-key exchange remains.
- No `DocmostWrapper`, no session-exchange, no `/api/pages/*`, no hand-authored spec (`tools.ts:1-17` header) — every wiki verb routes through the contract-pinned `/v1` clients (`src/contracts/wiki-api.d.ts`, generated via `scripts/gen-client.ts`).
- `test/ci/zero-legacy.test.ts` exists as a standing CI gate for this posture (not read in full this pass, but its presence + naming confirms an enforced invariant, not just a comment).
- Two known intentional divergences from "clean by design": `marketplace_search`/`skill_get` gated on `STUDIO_BACKEND_BASE_URL` as a registration *proxy* for their real dependency `KNOWLEDGE_BASE_URL` (R21 finding #6, LOW, deferred — `index.ts:130-141`), and `wiki_comment_post` living in the `wiki_` namespace while fronting studio-api `/v1/social` (a "sanctioned §1 exception", R-SEAM-1).

## 13. Test surface (signal of what's exercised, not independently re-verified this pass)

`test/` (43 files) includes dedicated coverage for: enforcement, tool-catalog/visibility (`scaffold-stubs.test.ts`, `envelope-conformance.test.ts`), streaming wiring for BOTH classes (`mcp-streaming-edit-class-tool-wiring.test.ts`, `mcp-streaming-ask-tool-wiring.test.ts`), transport interruption classification, governance (`governance.test.ts`), scope-gate/auth (5 files), cell routing + discovery, a `ci/zero-legacy.test.ts` and `ci/conformance-gate.test.ts`, a 3-repo e2e (`e2e/three-repo.e2e.test.ts`), and a "golden tape" KPI accounting test (`kpi/golden-tape.test.ts`, `kpi/tape-accounting.ts`) — suggesting the ≤2-calls/≤~1k-tokens KPI claim in the server instructions is machine-checked, not aspirational-only. Not executed in this pass — file presence and naming only.

## 14. Bottom line — what's REAL at HEAD

- **52 tool names registered**; **13 hero-advertised by default**.
- **21 tools are REAL** (backed by a live upstream call path): the 6 live heroes (whoami, list_tools, wiki_get/fetch, wiki_save, knowledge_search/search, ai_ask) + 7 on-demand REAL wiki/knowledge/meta verbs (wiki_get_neighborhood, wiki_get_tree, wiki_get_changes, knowledge_related, get_capabilities) + 8 conditionally-registered studio-api tools.
- **30 tools are permanently-stubbed scaffolding** returning `NOT_AVAILABLE_YET`, including **7 of the 13 hero seats** (memory_recall, staging_propose, workgraph_prime/ready/claim/save/handoff) — the hero surface an agent sees by default is ~54% forward-contract stub by count.
- **1 tool** (`marketplace_publish`) has real governance/confirmation wiring against a substrate that doesn't exist yet.
- **Write path is genuinely live**: `wiki_save` is unconditionally registered, hits real wiki-api `/v1`, and enforces a real 4-layer gate + hard READ_ONLY ceiling + publish-path/ratify gate, all with a verified read-after-write receipt — this is not scaffold.
- **Streaming is one real, one dormant**: edit-class stage-progress is live whenever a caller passes a `progressToken`; ask-class SSE relay is fully coded but never traversed against real traffic (buffered path is what actually runs).
