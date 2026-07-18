# Evidence Map — orvex-wiki-api /v1 surface at HEAD

Repo: `/home/daniel/repos/orvex-wiki-api`
HEAD commit: `b651e89 feat(v1): expose amazing-MCP whole-doc/string-replace/{loc}-batch/changes/spaces verbs (#41)`

This is a pure code-read evidence map (no live probing). All claims cite file:line. Per
memory `certified-is-not-current`, treat this as "what the code at HEAD does", not "what is
deployed/live" — that requires a separate deployed-artifact check.

---

## 1. Process topology — TWO route tables, one binary

There are **two composition points** and they are NOT the same mux at runtime:

1. **`cmd/wikiapi/router.go`** (`newRouter`) — the REAL production entrypoint (`main` wires
   this). Builds one outer `http.ServeMux`.
2. **`internal/server/server.go`** (`Server.Handler()`) — the "target composition router".
   Only its **`/v1/` subtree** is mounted onto the outer mux by `router.go`
   (`mux.Handle("/v1/", s.Handler())`, router.go:59). Handler()'s OWN registration of
   `/api/*` legacy routes and the `/api/` proxy is **dead code from production's point of
   view** — router.go documents this explicitly (router.go:44-56) and duplicates the
   registration itself via `s.RegisterLegacyMcpRoutes(mux)` (router.go:77) and its own
   `linearrelay` mount (router.go:66) and its own `/api/` proxy (router.go:112).

So: reading only `internal/server/server.go`'s `Handler()` route table would OVER-report
what's reachable in prod for `/api/*` paths — those are re-registered on the outer mux by
`router.go` directly. The `/v1/*` route table is identical either way because it's mounted
unmodified via subtree matching (Go 1.22 `"/v1/"` pattern forwards without stripping,
router.go:53-56).

### Outer mux (`cmd/wikiapi/router.go`, production) route table

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET/HEAD | `/healthz` | local closure | Local-only, never calls engine. `{status,service,cell,upstream_configured}` |
| * | `/v1/` (subtree) | `server.New(cfg).Handler()` | Forwards unmodified — see §2 |
| POST | `/api/integrations/linear/issues` | `linearrelay.FromConfig(cfg)` | Linear issue-filing relay — see §7 |
| POST | `/api/ai/search` | `s.RegisterLegacyMcpRoutes` → `legacyAiSearch` | byte-compat legacy route, wins over `/api/ai` fan-out below by specificity |
| GET | `/api/pages/{pageId}/blocks/outline` | legacy → `legacyPageOutline` | |
| POST | `/api/orvex/ai/related` | legacy → `legacyAiRelated` | |
| GET | `/api/pages/changes-since` | legacy → `legacyPagesChangesSince` | |
| POST | `/api/pages/create` | legacy → `legacyPagesCreate` | |
| POST | `/api/pages/info` | legacy → `legacyPagesInfo` | |
| PATCH | `/api/pages/{pageId}/blocks/patch-string` | legacy → `legacyPageBlocksPatchString` | |
| POST | `/api/pages/update` | legacy → `legacyPagesUpdate` | |
| POST | `/api/pages/delete` | legacy → `legacyPagesDelete` | |
| * | `/api/ai`, `/api/ai/` | `gateway.Fanout.AI()` | reverse-proxy to `AI_URL`, bearer-gated (see §8) |
| * | `/mcp`, `/mcp/` | `gateway.Fanout.MCP()` | reverse-proxy to `MCP_URL`, bearer-gated |
| * | `/api/` (catch-all) | `proxy.NewReverseProxy(cfg.EngineURL)` | transparent byte-compat reverse proxy to engine |
| * | `/` (catch-all) | local closure | JSON 404 `{"detail":"not found"}` |

Source: `cmd/wikiapi/router.go:1-128`.

---

## 2. `/v1/*` route table (`internal/server/server.go: Handler()`, lines 185-406)

All routes below are registered on `Server`'s own mux and reached via the outer mux's
`/v1/` subtree mount. Column "Gate" = `requireScope` wrapping; a no-op passthrough unless
`cfg.IdentityVerifyEnabled=true` (Phase-0 default is **false** — see §4).

### Health
| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/healthz` | none | Echoes `cell`+`cluster` (this is a SEPARATE handler from the outer mux's own `/healthz` — never reached in prod because the outer `/healthz` wins at the top level) |
| GET | `/health` | none | Deep health: `upstreams.{engine,knowledge}` booleans + `facade_sli` (per-verb p95 snapshot, `verbs.Dispatcher.SLISnapshot()`) |

### Read ladder (over `{resource, locator}`)
| Method | Path | Handler | Gate |
|---|---|---|---|
| GET | `/v1/search` | `v1Search` → `verbs.Search` → `knowledge.Search` | `read:page` |
| GET | `/v1/list/{resource}` | `v1List` → `verbs.List` (cursor-paginated) | `read:page` |
| GET | `/v1/whoami` | `v1Whoami` → `engine.GetWorkspaceInfo` + `verbs.Spaces` | `read:page` |
| GET | `/v1/changes` | `v1Changes` → `verbs.Changes` (since/space/limit) | `read:page` |
| GET | `/v1/openapi.json` | `v1OpenAPI` (write-contract descriptor, NOT full spec) | none |
| GET | `/v1/capabilities` | `v1Capabilities` (public onboarding artifact) | none — PUBLIC by design |
| GET | `/v1/instructions` | `v1Instructions` (public authoring guide) | none — PUBLIC |
| GET | `/v1/{resource}/{locator}` | `v1Get` → `verbs.Get` | `read:page` |
| GET | `/v1/{resource}/{locator}/outline` | `v1Outline` → `verbs.Outline` | `read:page` |
| GET | `/v1/{resource}/{locator}/blocks/{blockID}` | `v1Blocks` → `verbs.Blocks` | `read:page` |
| GET | `/v1/{resource}/{locator}/blocks/{blockID}/excalidraw-scene` | `v1ExcalidrawSceneByLocator` | `read:page` |
| GET | `/v1/{resource}/{locator}/tree` | `v1Nav` (navKind="tree") | `read:page` |
| GET | `/v1/{resource}/{locator}/backlinks` | `v1Nav` (navKind="backlinks") | `read:page` |
| GET | `/v1/{resource}/{locator}/breadcrumbs` | `v1Nav` (navKind="breadcrumbs") | `read:page` |
| GET | `/v1/{resource}/{locator}/drift` | `v1DriftStatus` → `drift.GetDrift` | `read:page` |
| GET | `/v1/{resource}/{locator}/links` | `v1ContentHealthLinks` | `read:page` |
| GET | `/v1/{resource}/{locator}/lint` | `v1ContentHealthLint` | `read:page` |
| GET | `/v1/{resource}/{locator}/orphans` | `v1ContentHealthOrphans` | `read:page` |
| GET | `/v1/{resource}/{locator}/render` | `v1ContentHealthRender` | `read:page` |
| GET | `/v1/settings/ratify-gate` | `v1RatifyGate` — **STUB** (`stub()` helper, 501) | `read:page` |
| GET | `/v1/convert/fidelity` | `v1ConvertFidelity` (GET branch, `?pageId=`) | `read:page` |
| GET | `/v1/pages/{pageId}/blocks/{blockId}` | `v1PageBlocksRead` | `read:page` |
| GET | `/v1/pages/{pageId}/blocks/{blockId}/excalidraw-scene` | `v1ExcalidrawScene` | **UNGATED** (no `requireScope` wrap — server.go:353) |
| GET | `/v1/pages/blocks/schema` | `v1PageBlocksSchema` (block-type catalog) | **UNGATED** (server.go:360) |

### Write chokepoint
| Method | Path | Handler | Gate |
|---|---|---|---|
| POST | `/v1/{resource}` | `v1Save` → `verbs.Save` → blockpatch chokepoint | `write:page` |
| PATCH | `/v1/{resource}/{locator}/blocks` | `v1Edit` → `verbs.Edit`, CAS via `If-Match` | `write:page` |
| PUT | `/v1/{resource}/{locator}` | `v1Update` (amazing-MCP whole-doc update) → `verbs.Update` | `write:page` |
| POST | `/v1/{resource}/{locator}/blocks:batch` | `v1WikiBlocksBatch` (amazing-MCP {loc}-addressed atomic batch) | `write:page` |
| POST | `/v1/{resource}/{locator}/drift` | `v1DriftVerify` → `drift.VerifyPage` | `write:page` |
| POST | `/v1/{resource}/{locator}/spec-gate/check` | `v1SpecGate` — **STUB** (`stub()` helper) | `read:page` (sic — a POST route gated as read) |
| POST | `/v1/convert/to-prosemirror` | `v1ConvertToProseMirror` (real, in-process via `orvex-studio-lib/pkg/dfm`) | `write:page` |
| POST | `/v1/convert/to-dfm` | `v1ConvertToDfm` (real) | `write:page` |
| POST | `/v1/convert/fidelity` | `v1ConvertFidelity` (POST branch, real) | `write:page` |
| POST | `/v1/import` | `v1Import` (multipart upload → `doimport.Import` → `engine.AcceptImport`) | `write:page` |
| POST | `/v1/audit` | `v1Audit` (real; own bespoke bearer verification via `auditVerifier`, NOT `requireScope`) | own gate, see §5 |
| POST | `/v1/pages/{pageId}/blocks/batch` | `v1PageBlocksBatch` → `applyBlocksBatch` (atomic ops[] batch, page-id addressed) | `write:page` |
| POST | `/v1/pages/bulk` | `v1PagesBulk` → `bulkops.ApplyBulk` (move/archive/delete/relabel fan-out) | `write:page` |
| POST | `/v1/convert/dfm-to-json` | `v1Convert` — **STUB** (legacy pre-freeze draft path) | none |
| POST | `/v1/convert/json-to-dfm` | `v1Convert` — **STUB** | none |
| POST | `/v1/convert/fidelity-check` | `v1Convert` — **STUB** | none |

### Internal (Trigger-only)
| Method | Path | Handler | Notes |
|---|---|---|---|
| POST | `/internal/events/evict` | `internalEvict` | Consumes `wiki.page.*` CloudEvent; always ACKs 202; NetworkPolicy-restricted at deploy layer, not app-layer auth |

**STUB inventory** (typed 501, `X-Stub` header, `gen.CodeNotImplemented`): `v1Convert` (3
legacy draft paths), `v1RatifyGate`, `v1SpecGate`. Everything else in the table above is a
REAL handler driving a real domain/engine call (per the file's own comments, cross-checked
against handler bodies).

---

## 3. amazing-MCP verbs (the newest layer, commit #41 "b651e89")

Per the commit subject and `wikiv1_handler.go`'s doc comments, this HEAD adds 5 new pieces
on top of the pre-existing read/write ladder:

1. **`PUT /v1/{resource}/{locator}`** — whole-doc replace/append/prepend under integer CAS
   (`v1Update`, wikiv1_handler.go:35-64). Backs `save_page` update+upsert. `ifVersion`
   travels via `If-Match` header (wins) or body `ifVersion` int64. Calls
   `verbs.Dispatcher.Update` → `blockpatch.ApplyWholeDoc` → engine `apply-doc` primitive
   (`clients.go:389`, `POST {engine}/api/orvex/pages/{pageID}/apply-doc`).
2. **`POST /v1/{resource}/{locator}/blocks:batch`** — {loc}-addressed atomic N-op batch
   (`v1WikiBlocksBatch`, wikiv1_handler.go:75-86). Resolves locator→pageId via
   `verbs.Dispatcher.ResolveLocator`, then delegates to the SAME `applyBlocksBatch`
   chokepoint the page-id route (`v1PageBlocksBatch`) uses — one shared implementation, no
   fork.
3. **String-replace / patch-string** — NOT a native `/v1` route; it's the legacy
   byte-compat `PATCH /api/pages/{pageId}/blocks/patch-string`
   (`legacy_mcp_write_routes.go:233-263`) that composes `pageblocks.PatchString` (whole-doc
   or blockId-scoped, marks-preserving) over content fetched via `engine.GetPage`, then
   persists via `engine.UpdatePage(..., operation:"replace", ...)`.
4. **`GET /v1/changes?since=&space=&limit=`** — incremental changes feed, LIST mode only,
   `since` REQUIRED (400 `VALIDATION_ERROR` if missing) — `v1Changes` →
   `verbs.Dispatcher.Changes` → engine's ACL-scoped recent-pages primitive (no new engine
   endpoint).
5. **`GET /v1/whoami` → `spaces[]`** — the writable-spaces ∩ token-ACL list
   (`{id,name,can_edit}`), non-fatal-degrading addition to whoami via
   `verbs.Dispatcher.Spaces` (`whoami_handler.go:35-48`).

All five reuse existing engine primitives / the existing block-patch chokepoint — no new
"second write path" was introduced (explicit design constraint stated repeatedly in
comments, e.g. pageblocks_handler.go:53-59).

**Streaming**: no HTTP streaming/SSE verb exists on `/v1/*` in this repo. Per memory
`R21 MCP streaming folded into 19-tool surface`, streaming is understood as a requirement
folded into the MCP server's own design verbs, not a separate wiki-api endpoint — consistent
with what's actually in this repo (no `text/event-stream`, no chunked-response verb code
found under `internal/server` or `internal/verbs`).

---

## 4. Auth model

- **Token pass-through, not mint** (FR-A16): wiki-api forwards the caller's raw
  `Authorization` header verbatim to engine/knowledge/AI/MCP — it holds no elevated service
  credential (`bearer(r)` helper, server.go:411; doc comments throughout).
- **Identity-verified edge gate** (`requireScope`, server.go:453-475), config flag
  `IDENTITY_VERIFY_ENABLED` (default **false**):
  - OFF (Phase-0 default): `requireScope` is a pure passthrough; auth is delegated entirely
    to the upstream engine's own 401.
  - ON: caller's bearer is verified via `s.callerVerifier.VerifyCaller` (port
    `CallerVerifier`, `caller_verifier.go`), then `auth.RequireScope(principal, "read:page"
    | "write:page")` (reused from `orvex-studio-lib/pkg/auth`, never a bespoke scope
    algorithm) — 401 on unverified, 403 on insufficient scope, and the wrapped handler is
    **never invoked** on failure (zero-forward).
  - **Production default `callerVerifier` is `notImplementedCallerVerifier`** — it
    unconditionally returns `ErrCallerUnverified` (caller_verifier.go:43-47). So **turning
    on `IDENTITY_VERIFY_ENABLED` today, without wiring `WithCallerVerifier`, would 401 every
    single `/v1/*` request** covered by `requireScope`. A real
    `NewLibCallerVerifier(*auth.MultiIssuerVerifier)` adapter exists but is not called from
    `New()` — issuer/JWKS config is not yet provisioned per the doc comment.
- **`/v1/audit`** has its OWN separate identity port (`AuditCallerVerifier`,
  `audit_verifier.go`), independent of `requireScope`/`IdentityVerifyEnabled` — always
  enforced (not gated by the config flag). Production default `notImplementedAuditVerifier`
  likewise rejects every token 401 (audit_verifier.go:49-53) — i.e. **`/v1/audit` is
  effectively unusable at HEAD** until a real API-key verifier is wired.
- **Two routes are explicitly ungated** even conceptually (no `requireScope` wrap at all):
  `GET /v1/pages/{pageId}/blocks/{blockId}/excalidraw-scene` and
  `GET /v1/pages/blocks/schema` (server.go:353, :360) — auth for these relies solely on the
  downstream engine call's own CASL check inside `excalidraw.RecoverScene`/registry lookup.
- **`/v1/capabilities` and `/v1/instructions`** are deliberately PUBLIC — no bearer/principal
  check by design (AC5 per doc comment).
- **`/api/ai` and `/mcp` fan-out legs** (`internal/gateway`) use a THIRD, distinct posture:
  presence-only bearer check (`hasBearer`, gateway.go — any non-empty `Authorization` header
  passes; validity is the satellite's job). A bearer-less request gets a typed
  `501 AUTH_TRANSLATION_PENDING` (`gen.CodeAuthTranslationPending`) rather than being
  silently forwarded unauthenticated — cookie→bearer session-exchange translation is a
  documented `TODO(ENG-2054)`, not yet implemented.
- **Linear relay** (`internal/linearrelay`) requires scope `linear:issue:file`
  (`RequiredScope`, handler.go:19) verified via a `Verifier` interface
  (`*auth.MultiIssuerVerifier` in prod).

---

## 5. Error envelope(s) — THREE distinct wire shapes coexist

1. **Native `/v1/*` envelope**: `gen.APIError{code, message, deep_link?, _note?, type?}`
   (gen/errors.go:118-131), written via `writeJSON`. `_note` typically carries
   `"request_id=<id>"` for correlated tracing on audit/drift/blocks-batch/bulk routes.
2. **Docmost-compat envelope** (legacy `/api/*` byte-compat routes only):
   `{data, success, status}` on success (`docmostEnvelope`, legacy_mcp_routes.go:55-63);
   `{message: <gen.APIError>, error: <code>, statusCode}` on error
   (`writeLegacyError`, legacy_mcp_routes.go:70-72) — deliberately mirrors the engine's own
   `TransformHttpResponseInterceptor` shape so orvex-studio-mcp's unmodified
   `DocmostWrapper` client can still decode it.
3. **Byte-identical engine passthrough** for the generic `/api/*` reverse proxy and the
   `/api/ai`, `/mcp` fan-out legs — whatever shape the upstream returns, untouched.

Two shared classification functions feed envelope #1 (and get reused, wrapped, by #2):
- `classifyReadLadderError` (server.go:657-682) — read-side typed-error→HTTP mapping.
- `classifyWriteContractError` (server.go:764-812) — write-side, includes CAS 409
  (`VERSION_MISMATCH`), 402 `QUOTA_EXCEEDED` (verbatim relay + Studio deep-link via
  `quotaErr.DeepLink()`), 501 `not_implemented`.
- A THIRD, block-batch-specific mapper `writePageBlocksError` (pageblocks_handler.go:408-436)
  and a FOURTH, drift-specific `writeDriftError` (server.go:976-992) exist as separate
  functions with overlapping but not identical switch arms (e.g. drift adds
  `RATIFY_REQUIRED` 409; page-blocks adds `STRING_NOT_FOUND`/`MISSING_REF_BLOCK_ID` handling
  via `pageblocks.Err*`).
- The frozen error vocabulary lives in `gen/errors.go` (~35 `ErrorCode` constants) — marked
  as codegen'd FROM `orvex-studio-contracts` (`openapi/wiki-api.yaml`) but currently
  **hand-authored** pending a real generator (gen/doc.go:11-16 — explicit admission).

---

## 6. Pagination

- **Cursor-based**, exposed on: `GET /v1/list/{resource}` (`?cursor=`, engine's
  sidebar-pages primitive), `GET /v1/{resource}/{locator}/tree|backlinks|breadcrumbs` (via
  `v1Nav`'s shared `cursor`/`direction` params), and the legacy `GET
  /api/pages/changes-since` (`?limit=`, bounded to `[1,200]`, default 50 —
  `changesSinceLimit`, legacy_mcp_routes.go:265-289).
- `GET /v1/changes` uses a `since` timestamp + `limit` int (not a cursor token) — a
  time-anchored feed, not offset/cursor pagination (`v1Changes`, wikiv1_handler.go:94-109).
- No page-number pagination anywhere in this repo's `/v1` surface.

---

## 7. Versioning / CAS / receipts

- **Integer CAS** (`meta.version`) is the write-contract's concurrency primitive throughout:
  - `PATCH /v1/{resource}/{locator}/blocks` — `If-Match` header (server.go:714).
  - `PUT /v1/{resource}/{locator}` — `If-Match` header wins over body `ifVersion` int64
    (wikiv1_handler.go:47-53).
  - `POST /v1/pages/{pageId}/blocks/batch` and its `{loc}` sibling — body `ifVersion` int64
    (`pageBlocksBatchRequest.IfVersion`, pageblocks_handler.go:26).
  - A stale base → `409 VERSION_MISMATCH` (`gen.CodeVersionMismatch`) via
    `classifyWriteContractError`, never a partial write (explicit doc-comment guarantee
    across every write handler).
- **Legacy `/api/pages/update` and the patch-string route do NOT trust a caller-supplied
  `ifVersion` at all** — they instead fetch the engine's own current `updatedAt` via
  `realCASToken`/`GetPage` and use THAT as the real CAS anchor
  (legacy_mcp_write_routes.go:119-149, :197-214) — the caller's `ifVersion` int is only
  echoed back (`ifVersion + 1`) in the response shape, not actually used for CAS. This is a
  documented, deliberate divergence from the native `/v1` CAS contract, scoped only to the
  byte-compat legacy legs.
- **Receipts**: `gen.WriteReceipt` returned by `Save`/`Edit`/`Update` (verbs.go) — carries
  the settled integer `meta_version` + `updated_at` so a caller can CAS its next write
  without a re-read (wikiv1_handler.go:33-34 doc comment). `v1PageBlocksBatch`/
  `v1WikiBlocksBatch` return `pageBlocksBatchResponse{clients.ApplyOpsSettled, Handles}` —
  the engine's own settled state relayed unchanged, PLUS typed opaque-block handles built
  during dispatch validation for any registry-owned opaque block type touched
  (pageblocks_handler.go:31-40).
- **`GET /v1/openapi.json`** is NOT a full OpenAPI document — it's a hand-rolled
  "write-contract descriptor" enumerating only the 2 write routes' field contract + the
  full write-error-code set (`v1OpenAPI`, server.go:1102-1115), explicitly marked as "a
  registry-generated conformance artifact, NOT the codegen source" (server.go comment,
  matches gen/doc.go's admission that real codegen from `orvex-studio-contracts` hasn't
  landed).

---

## 8. Generated client artifacts / `gen/` package

`gen/` is NOT machine-generated at HEAD — it is **hand-authored Go source marked as the
target of a future codegen step**:

| File | Contents |
|---|---|
| `gen/doc.go` | Package doc admitting: authoritative source is `orvex-studio-contracts`'s `openapi/wiki-api.yaml`; committed here so the repo builds offline; drift caught by a contracts drift-gate (FR-C16a), not yet by real codegen |
| `gen/verbs.go` | Request/response types for the verb grammar (`ReadInfo`, `Outline`, `BlockContent`, `WriteReceipt`, `ListResult`, `Locator`, `Resource`, `BulkOp`, `ItemResult`, etc.) |
| `gen/errors.go` | `ErrorCode` enum (~35 constants) + `APIError` envelope struct |
| `gen/events.go` | CloudEvent type constants the evict consumer filters on |
| `gen/governance.go` | Drift/spec-gate result shapes (`DriftListResult`, etc.) |
| `gen/contenthealth.go` | Content-health verdict shapes (links/lint/orphans/render) |
| `gen/bulk.go` | Bulk-op request/response shapes |

There is **no `openapi/` directory, no `.yaml`/`.json` OpenAPI spec file, and no codegen
script** anywhere in this repo (`find . -iname '*openapi*'` at HEAD returns only
`scripts/contract-gates/openapi-drift.sh`, a drift-CHECK script, not a generator). The
actual OpenAPI source of truth lives in a **sibling repo**, `orvex-studio-contracts`
(referenced but not present here) — this repo only consumes it by convention/discipline,
not by an actual `go generate` pipeline that exists today.

---

## 9. What proxies to engine `/internal` vs `/api` vs knowledge vs AI

- **No `/internal/*` engine calls exist in this repo.** `grep` for `/internal` paths in
  `internal/clients/*.go` found none — every engine call goes through `/api/*` or
  `/api/orvex/*` engine routes (confirmed exhaustively, see table below). (Note: an
  `/internal/pages/{id}/export` engine-side route referenced in recent commit history
  belongs to the **separate `orvex-wiki` engine repo**, not this API repo — no wiki-api code
  calls it.)
- **Engine primitives actually called** (`internal/clients/clients.go`, all via
  `e.BaseURL + "/api/..."`):

| wiki-api client method | Engine HTTP call |
|---|---|
| `ApplyOps` | `POST /api/orvex/pages/{pageID}/apply-ops` |
| `ApplyWholeDoc` (via `Update`) | `POST /api/orvex/pages/{pageID}/apply-doc` |
| `AcceptImport` | `POST /api/pages/import-accept` |
| `GetPage` | `POST /api/pages/info` |
| `GetWorkspaceInfo` | `POST /api/workspace/info` |
| (space list, via `Spaces`) | `POST /api/spaces/` |
| `CreatePage` | `POST /api/pages/create` |
| `UpdatePage` | `POST /api/pages/update` |
| `MovePage` | `POST /api/pages/move` |
| `DeletePage` | `POST /api/pages/delete` |
| `AddPageLabels` | `POST /api/pages/labels/add` |
| `ListRecentPages` | `POST /api/pages/recent` |
| (list, via `List` verb) | `POST /api/pages/sidebar-pages` |
| `GetBacklinks` | `POST /api/pages/backlinks` |
| (breadcrumbs, via `Nav`) | `POST /api/pages/breadcrumbs` |
| `enginestore` drift client | `GET/POST /api/orvex/page-meta/{pageID}/verify-context`, `/stamp`, `GET /api/orvex/page-meta/stamps` |
| `enginestore` audit forward | `POST /api/orvex/audit` |
| `enginestore` attachment client | `POST /api/files/info`, `GET /api/files/{id}/{name}` |
| Session exchange (`clients/session_exchange.go`) | `POST /api/orvex/session/exchange` (opt-in via `ENGINE_SESSION_EXCHANGE_ENABLED`) |

- **Knowledge**: `internal/clients.Knowledge.Search` (clients.go:1675) — used exclusively by
  `verbs.Dispatcher.Search`, which is what backs both `GET /v1/search` and the legacy
  `POST /api/ai/search`. Base URL: `KnowledgeURL` config (`ORVEX_KNOWLEDGE_URL`, fallback
  `KNOWLEDGE_URL`). A code comment (clients.go:1668) notes the underlying knowledge route
  is itself evolving ("a GET /v1/search route that never existed on..." — worth a follow-up
  read of `orvex-studio-knowledge` if precise verb semantics are needed there).
- **AI** (`AI_URL`): wiki-api is documented as a CONSUMER, never called BY ai
  (`config.go` comment: "ai is a CONSUMER of wiki-api, not called (D-A12)") — the only
  wiki-api-side AI code is the `/api/ai` reverse-proxy fan-out leg (`internal/gateway`),
  which forwards bearer-carrying requests to `AI_URL` verbatim; no in-process AI logic
  exists in this repo.
- **MCP** (`MCP_URL`): symmetric fan-out leg, `/mcp` and `/mcp/` → reverse proxy to
  `orvex-studio-mcp`. No in-process MCP protocol logic in this repo — wiki-api is a
  transport leg for it, not an implementer.
- **The Phase-0 byte-compatible strangler facade** (`internal/proxy`, `proxy.go`, 122
  lines) is the ONE shared reverse-proxy implementation used by: the generic `/api/*`
  catch-all, and both `gateway.Fanout` legs (AI/MCP) — "one proxy to reason about, not a
  third divergent copy" (gateway.go doc comment).

---

## 10. Locators / resource grammar

- `gen.Locator{Kind, Value}` — `locOf(r)` always builds `Kind:"auto"` from the raw
  `{locator}` path segment (server.go:1137-1139); dialect detection (id/url/slug/title/nl)
  is delegated entirely to the resolver inside `verbs.Dispatcher` — no per-route dialect
  logic in the handler tier.
- **D-S11 wiki-only grammar gate**: every verb rejects any `resource_type` other than
  `"wiki"` (explicitly including `"linear"`) with `400 UNSUPPORTED_RESOURCE_TYPE`
  (`gen.CodeUnsupportedResourceType`, verbs.go, enforced via `verbs.ErrUnsupportedResource`
  checked first in every dispatcher method per repeated doc comments). This is a HARD gate,
  not a soft default — confirms Linear is architecturally excluded from the `/v1` resource
  grammar even though a Linear relay endpoint still exists as a separate, narrow write leg
  (§7 below).

---

## 11. Linear — present at HEAD, contradicts the "dropped entirely" program directive

Despite the stated program directive that Linear integration is dropped entirely, **HEAD
still ships a live Linear relay**:

- `POST /api/integrations/linear/issues` (`internal/linearrelay`, 186+ lines) — the ENG-1483
  platform-key Linear issue-filing relay. Registered on the outer mux (router.go:66) AND
  again inside `Handler()` (server.go:383) — the "ONLY write endpoint this leg adds"
  (router.go:63 comment). Verifies caller SSO session, enforces `linear:issue:file` scope,
  resolves destination project/team server-side, writes via a GraphQL port. Does NOT expose
  view/graph/roadmap/oauth/search/bulk (explicitly excluded per router.go:64-65 comment).
- Every OTHER Linear surface is deliberately absent/rejected: `/v1` resource grammar 400s on
  `resource_type=linear` (§10); `POST /v1/pages/bulk` rejects any Linear-specific bulk verb
  with `400 UNSUPPORTED_BULK_OP` (bulk_handler.go:23-26); the block-registry dispatch gate
  in `applyBlocksBatch` unconditionally rejects 8 named `linear_*` block types with
  `400 UNKNOWN_BLOCK_TYPE`, zero engine calls (`droppedLinearBlockTypes`,
  pageblocks_handler.go:220-224).
- **This is a discrepancy worth flagging to the orchestrator**: either the "Linear dropped
  entirely" directive postdates this code and the relay is pending removal, or the relay is
  understood as an exception (a narrow "file a support ticket" leg, not the excluded
  view/graph/roadmap/sync surface). The code's own comments frame it as deliberately scoped
  OUT of "the excluded product's" surface, i.e. NOT the same thing as the dropped Linear
  sync/tracking integration — but it is still Linear-shaped code present at HEAD.

---

## 12. Notable honesty/gaps at HEAD (self-reported by the code's own comments)

- `notImplementedCallerVerifier` and `notImplementedAuditVerifier` are the PRODUCTION
  DEFAULTS — both fail-closed-401 unconditionally. `IDENTITY_VERIFY_ENABLED=true` today
  would 401 everything on the gated ladder; `/v1/audit` 401s unconditionally regardless of
  the flag, always.
- `GET /api/ai`/`/mcp` fan-out: cookie→bearer session-exchange translation is an open
  `TODO(ENG-2054)` — any caller without an `Authorization` bearer gets `501
  AUTH_TRANSLATION_PENDING`, never silently forwarded.
- 3 `/v1/convert/*` legacy draft paths, `GET /v1/settings/ratify-gate`, and
  `POST .../spec-gate/check` are typed 501 stubs (`stub()` helper) — routes exist, logic
  does not.
- `gen/` is hand-authored, not actually codegen'd (no generator, no spec file present in
  this repo) — `openapi.json` served is a partial write-contract descriptor, not the real
  spec.
- Legacy `/api/pages/update` and patch-string routes silently discard the caller's
  `ifVersion` for CAS purposes and substitute the engine's own live `updatedAt` — a
  deliberate but easy-to-miss divergence from the native `/v1` CAS contract.
