# Evidence map — `orvex-cli` command surface at HEAD

Repo: `/home/daniel/repos/orvex-cli`
HEAD: `48329b7` — "fix(cli): wire search through authTransport() — wiki-api's /v1/search is ACL'd (fix13 follow-up)"
Module: `github.com/orvexai/orvex-cli`, go 1.26.0
Total commits: 38. `go build ./...` clean. `go test ./...` all green (cmd, internal/auth, internal/cache, internal/client, internal/content, internal/daemon, internal/gate, internal/ipc, internal/issuebundle, internal/mirror, internal/output, internal/screenshot). ~9,060 lines of `_test.go` across the tree — this is a genuinely test-heavy codebase, not a demo.

**README.md is stale and undersells HEAD**: it still says "A compiling skeleton — every command is a typed stub that resolves and names the service it routes to" — true of an early commit, false of HEAD, where roughly half the surface (all of `wiki page/nav/gov/history/mirror/comment/label/attach`, `search keyword/semantic/hybrid`, `ai ask/cost/image`, `auth login/logout/whoami/status/use/list-profiles`, `migrate scan/apply/verify`, `wiki issue create`) dispatches real HTTP calls through a real Transport, not a stub. Treat the README as historical, not current-state (per the "certified ≠ current" standing lesson).

---

## 1. Top-level command tree (`cmd/root.go`)

One cobra root `orvex`, single `PersistentPreRunE` that resolves `config.Config`, builds the `output.Renderer`, and warns once on any deprecated `DOCMOST_*` env alias. Persistent flags: `--output/-o`, `--profile`, `--fields`, `--id-only`, `--compact`, `--no-daemon`, `--timeout` (default 30s).

Service namespaces: `wiki`, `search`, `ai`, `auth`, `admin`, `migrate`.
Client-local groups: `daemon`, `cache`, `config`, `doctor`, `audit`, `instructions`, `version`.
Hidden: `__daemon` (systemd ExecStart twin of `daemon run`). Cobra auto-registers `completion`/`help`. `legacy.go` adds hidden back-compat aliases (not enumerated here — see `cmd/legacy.go`).

Exit codes are FROZEN 0–9 (`internal/output/exit.go`): `0 OK · 1 generic · 2 INVALID_ARGS · 3 auth · 4 NOT_FOUND/TITLE_AMBIGUOUS · 5 VERSION_MISMATCH · 6 unreachable · 7 RATE_LIMITED/QUOTA_EXCEEDED · 8 DUPLICATE_CANDIDATE · 9 GATE_UNSATISFIED`. Error vocabulary (`internal/output/errors.go`) is a shared, extend-never-rename string set across every namespace — deliberately has **no `LINEAR_NOT_CONNECTED`** (Linear is fully absent from this binary, matching the program's drop-Linear decision).

---

## 2. Upstream services and how commands route to them

`internal/config/config.go` defines exactly 5 routable `ServiceID`s (`AllServices()`):

| ServiceID | Env override | Purpose |
|---|---|---|
| `wiki-api` | `ORVEX_WIKI_API_URL` | orvex-wiki-api — every wiki verb (D-S16) |
| `knowledge` | `ORVEX_KNOWLEDGE_URL` | orvex-studio-knowledge — search/related/duplicates query API |
| `events` | `ORVEX_EVENTS_URL` | knowledge SSE fan-out (cache freshness) |
| `ai` | `ORVEX_AI_URL` | orvex-studio-ai — ask/chat/inline/image/cost |
| `identity` | `ORVEX_IDENTITY_URL` | orvex-studio-identity — login/whoami/token mint |

Plus `ORVEX_URL` gateway shorthand (derives all 5 hosts by the family url-scheme canon) and `ORVEX_DISCOVERY_URL` for the cell-421 re-resolve fallback. `DOCMOST_URL`/`DOCMOST_API_TOKEN` are read as deprecated aliases (warn-once, one cutover window — FR-CLI18). **No `ORVEX_BILLING_URL`** — billing is explicitly Stripe-webhook-only with no CLI read surface (`cmd/admin.go` comment); entitlement state is read from a knowledge-side projection instead.

Client is a single shared `Transport` (`internal/client/transport.go`) with per-service typed clients built on top (`internal/client/clients.go`): `WikiClient`, `KnowledgeClient`, `AIClient`, `IssueClient`, `IdentityClient`. `internal/client/cell421.go` implements a 421 (`CELL_MISMATCH`) misdirected-request re-resolve + single retransmit against the cell-discovery contract (orvex-studio-contracts v0.1.3, ENG-1971) — a real resiliency feature, not routing boilerplate.

---

## 3. `wiki` namespace — the deep one (`cmd/wiki.go`, `cmd/wiki_verbs.go`, `cmd/wikiissue.go`)

Comment in `wiki.go`: "Every wiki-shaped verb routes to orvex-wiki-api (D-S16) — including the surfaces that were engine-direct in the reference (history/diff/version, import/export, binary attachments, drift, audit, comments). **The engine's raw API is never contacted.**" Content conversion (get/update/mirror) is in-process via `pkg/dfm` (`internal/content`) — no `/convert` network hop on those paths.

### `wiki page` — real, fully wired
`get, list, create, update, patch, upsert, delete, replace, edit, scaffold, trash, purge, move, restore, duplicate` — all 15 verbs have real `RunE` handlers in `cmd/wiki.go` / `cmd/wiki_verbs.go` that build a `WikiClient` via `authTransport()` and issue an HTTP call. `get` decodes content via `decodePageDfM` (server pre-renders content to DfM string server-side — confirmed live, no raw-PM read primitive exists); `--prosemirror` emits the raw record. Writes reject non-`json`/`dfm` `--format` locally (`LOSSY_WRITE_FORMAT_REJECTED`, zero requests sent) and `update` runs a local `MARK_SYNTAX_CORRUPTION` collision check before ever calling the server (ENG-1562).

### `wiki nav` — real: `tree, outline, breadcrumbs, backlinks, recent, resolve-slug, watchers, permissions, transclusion`
### `wiki governance` — real: `supersede, status, verify, label`
### `wiki history` — real: `list, diff, revert, version`
### `wiki mirror` — real: `pull, push` (offline DfM↔PM via `internal/content`/`internal/mirror`); `watch` is a routing-only stub (`leaf(...)`)
### `wiki migrate` (facade group, distinct from top-level `migrate`) — real: `import, export, verify, apply` (archive verbs)
### `wiki verify` — mostly stubs: `lint, links, orphans, space, duplicates, staleness, ia-conformance` are all `leaf()` (routing-only, `NOT_IMPLEMENTED`); `render` is `fullLeaf` (gated behind `orvex-full` build, then still a stub); `drift` is the one real handler (`newVerifyDriftCmd()`)
### `wiki spec gate check` — stub (`leaf`)
### `wiki whoami` — real. New primitive (fix11, 2026-07-13): calls wiki-api's `GET /v1/whoami` to surface `workspace_id`/`workspace_name`/`default_space_id`. Added specifically because a fresh tenant previously had **no way** to learn its auto-provisioned space id short of a privileged DB SELECT. Deliberately NOT auto-injected into `page create --space-id` (no-fallbacks doctrine — caller must name the space explicitly).
### `wiki space` — **entirely fails-closed locally, by design**. `get/list/create/update/delete` all return a typed `NOT_IMPLEMENTED` with **zero network calls**, because orvex-wiki-api implements no spaces resource at all (see §4 below — confirmed against the wiki-api source). This was previously a live bug (every call 405'd and got mis-bucketed as `SERVICE_UNREACHABLE`); the 2026-07-13 fixer pass converted it to an honest local stub rather than "inventing" a route.
### `wiki comment / label / attach` — real handlers, calling `WikiClient.{Get,List,Create,Update,Delete}Comment/Label/Attachment` → `/v1/comments`, `/v1/labels`, `/v1/attachments` paths.
### `wiki diagram` — real handler (`wikiDiagramCmd`, excalidraw scene read path).
### `wiki issue create` — real, and architecturally notable (ENG-1484): assembles a local bundle (build/platform/git context + redacted config snapshot + recent local error.log tail) and POSTs it through the **wiki-api support-issue relay** using only the caller's SSO session bearer. **No Linear key, no provider key, ever reachable from this binary** (D-S11/D-S24) — the relay holds the single platform Linear key server-side. Supports `--dry-run` (zero session required), `--edit` ($EDITOR, terminal-only), `--body-file`, piped stdin.
### `wiki code graph <path>` — real when built as `orvex-full` (Tree-Sitter dep-graph, ENG-1960 D2); in the default binary it returns `REQUIRES_FULL_BINARY` before ever reaching the builder.
### `wiki screenshot` — separate command (`cmd/screenshot.go`), gated the same `orvex-full`/chromium way.

### ⚠ Finding: several "real" wiki-api client methods likely target routes the server does not expose
Cross-checked against `/home/daniel/repos/orvex-wiki-api`'s actual route table (`internal/server/server.go`, confirmed live in source):

```
GET  /v1/search                         (requireScope)
GET  /v1/list/{resource}
GET  /v1/whoami
GET  /v1/changes
GET  /v1/capabilities
GET  /v1/instructions
POST /v1/convert/*
POST /v1/import
POST /v1/audit
GET  /v1/settings/ratify-gate
GET  /v1/{resource}/{locator}[/outline|/blocks/{id}|/tree|/backlinks|/breadcrumbs|/drift|/links|/lint|/orphans|/render]
POST /v1/{resource}                     (Save)
PUT  /v1/{resource}/{locator}           (Update)
PATCH /v1/{resource}/{locator}/blocks   (Edit)
POST /v1/{resource}/{locator}/blocks:batch
POST /v1/{resource}/{locator}/spec-gate/check
POST /v1/pages/{pageId}/blocks/batch, GET /v1/pages/{pageId}/blocks/{blockId}[/excalidraw-scene]
GET  /v1/pages/blocks/schema
POST /v1/pages/bulk
```

Every `{resource}`-templated route runs a **single shared `requireWiki` gate** (`internal/verbs/verbs.go`, confirmed: `requireWiki` is called before every verb — Get/List/Save/Update/Edit/etc.) that accepts **only the literal resource type `"wiki"`** — this is exactly the D-S11 constraint `cmd/wiki.go`'s own comment cites as the reason `wiki space` is stubbed out locally. There is **no `/v1/pages/{locator}`, `/v1/spaces`, `/v1/comments`, `/v1/labels`, or `/v1/attachments` route registered anywhere** in the server's mux.

But `internal/client/clients.go` in orvex-cli builds requests against exactly those non-existent shapes:
- `UpdatePage`/`PatchPage` → `PUT`/`PATCH /v1/pages/{locator}` (not `/v1/wiki/{locator}`)
- `UpsertPage` → `PUT /v1/pages/upsert`
- `DeletePage` → `POST /v1/pages/bulk`
- `ListSpaces/GetSpace/CreateSpace/UpdateSpace/DeleteSpace` → `/v1/spaces...` (the CLI command layer already stubs these out locally per §above, so this dead client code is currently unreachable from any command — but it still exists and is exported)
- `GetComment/ListComments/CreateComment/UpdateComment/DeleteComment` → `/v1/comments...`
- `GetLabel/ListLabels/CreateLabel/UpdateLabel/DeleteLabel` → `/v1/labels...`
- `GetAttachment/ListAttachments/UploadAttachment/DeleteAttachment` → `/v1/attachments...`
- `SupersedePage/GetGovernanceStatus/SetGovernanceStatus/VerifyGovernance/AttachGovernanceLabel` → paths not matching the `{resource}` grammar either (need direct verification, not confirmed present in wiki-api's route table above)

**This means `wiki comment *`, `wiki label *`, `wiki attach *`, and possibly `wiki governance *`/`wiki history *`/`wiki migrate *` (archive verbs) are wired end-to-end in the CLI's Go code (compiles, has unit tests) but very likely 404/405 against the real orvex-wiki-api server today** — the same class of defect the `wiki space` fix already found and converted to an honest local stub for spaces specifically, but evidently not swept across the rest of the resource-shaped verb groups. This is the single most important maturity caveat in this repo: **CLI-side code completeness ≠ live end-to-end correctness**, and the last fix-pass only closed the gap it happened to be looking at.

(Caveat on this finding: I did not fetch orvex-wiki-api's OpenAPI/route table beyond `grep`-ing `server.go`'s handler registrations — it is possible some of these are served by the reverse-proxy fallback to the legacy engine (`mux.Handle("/api/", proxy.NewReverseProxy(cfg.EngineURL))`) or another registration path I didn't fully enumerate. But the ones under `/v1/pages/*`, `/v1/spaces/*`, `/v1/comments/*`, `/v1/labels/*`, `/v1/attachments/*` do not match either the `/v1/{resource}` mux pattern or the explicit `/v1/pages/{pageId}/...` literal routes that DO exist, so they should 404 on Go 1.22 ServeMux.)

---

## 4. `search` namespace (`cmd/search.go`)

`keyword <q>`, `semantic <q>`, `hybrid <q>` are **real** — as of commit `48329b7` (fix13 + fix13-follow-up, both same day 2026-07-13-adjacent) they route through **wiki-api's `GET /v1/search`** (a real, ACL'd, `requireScope`-gated route confirmed in the table above), authenticated via `authTransport()` (the same persisted-login-store bearer every `wiki` verb uses). Prior to that fix they called `orvex-studio-knowledge` directly with **no auth at all** — an explicitly disclosed prior defect, now fixed.

`--cached` flag on all three: falls back to a local SQLite FTS5 cache (`internal/cache`) if the live leg is unreachable; `NopStore` under `--no-daemon` (zero side effects).

`related <locator>`, `duplicates <locator>`, `attachment-search <query>` remain **stubs** (`leaf(...)`, routing-only) that target `knowledge` directly — the code comment admits these "still target orvex-studio-knowledge directly and inherit that same unrouted-host gap" (knowledge's own query API has no public DNS host by design, cluster-local only) — "a disclosed residual, not fixed by this pass."

---

## 5. `ai` namespace (`cmd/ai.go`)

Real: `ask <question>` (cited-ask loop, `POST /v1/ask` on `ai`), `cost` (`GET /v1/cost`), `image <prompt>` (`POST /v1/image`). All three are thin routers — one client call, envelope rendered unchanged, "no citation re-shaping, no confidence computation, no fabrication."

Stubs: `chat`, `inline <prompt>`, `models` — routing-only (`leaf`), pending their own tickets.

Bare `ai` (no subcommand) shows help rather than erroring — deliberate UX fix noted in the code comment.

---

## 6. `auth` namespace — real OIDC + profile model (`cmd/auth.go`)

Routes to `orvex-studio-identity`. All 6 subcommands are real, not stubs:

- **`login`** — real OIDC RP authorize→callback round trip (`internal/auth/oidc.go`), opens a browser via OS-specific opener, persists the credential to the active profile's `auth.Store`. **Headless path**: `--token <bearer>` adopts an already-minted bearer directly, zero network, zero browser — the documented agent-facing login path. `canShowBrowser()` fails FAST with a typed, actionable error (`errNoDisplay`) when `DISPLAY`/`WAYLAND_DISPLAY` are unset on Linux, instead of the pre-fix behavior of silently hanging for the full 2-minute timeout waiting on a redirect that could never arrive (a real fixed bug, documented in the source).
- **`logout`** — clears persisted credential, idempotent, no network call.
- **`whoami`** — calls identity's real `GET /v1/whoami` with the resolved bearer (profile store wins over env `ORVEX_TOKEN`/`DOCMOST_API_TOKEN`); typed `AUTH_REQUIRED` with no credential.
- **`status`** — local-only, decodes the stored token's subject claim (best-effort JWT decode, `""` for opaque tokens — never fabricated).
- **`use <profile>` / `list-profiles`** — client-local profile registry (Manager/KeyringStore/FileStore stack, `internal/auth`), OS keyring-backed with a bounded (3s) keyring-hang-fixed probe.

`authTransport()` (used by every wiki/search/ai/migrate/issue command) resolves: explicit `cfg.Token` (`ORVEX_TOKEN`/`DOCMOST_API_TOKEN`, the CI/service-account escape hatch) always wins and short-circuits store resolution entirely; otherwise falls back to the active profile's persisted store. `doctor`'s endpoint probe deliberately stays unauthenticated (liveness only, not an auth check).

Client ID registered against identity: `orvex-cli` (constant `oidcClientID`).

---

## 7. `admin` namespace (`cmd/admin.go`) — 100% stub, mixed routing declared but unimplemented

Every leaf is `leaf(...)` (routing-only `NOT_IMPLEMENTED`):
- `workspace {info, members, invites, integrations}` → `wiki-api`
- `workspace entitlements` → `knowledge` (reads a projection fed by a `billing.entitlement.changed` event — billing itself is Stripe-webhook-only, deliberately has no CLI read surface)
- `events {settings, connections, log}` → `knowledge`
- `user` → `identity`
- `reindex`, `reembed` → `knowledge`

Nothing here dispatches yet. The comment block documents the routing DECISION (finding F-E) even though the handlers don't exist.

---

## 8. `migrate` (top-level, distinct from `wiki migrate`) — real (`cmd/migrate.go`)

`scan <dir>` — deterministic markdown-tree inventory (embed-type detection via regex, zero network, zero side effects) — real, in-process, no client dependency.
`apply <dir>` — real: scans, converts each file via `content.MarkdownToPM` in-process, `POST`s each via `WikiClient.SavePage` (`/v1/wiki` — matches the real `{resource}` grammar, so this one is likely to actually work against wiki-api), writes a manifest (`.orvex-migrate-manifest.json`) mapping source paths to server-assigned locators.
`verify <dir>` — real: re-reads the manifest, re-fetches each page via `GetPageV1` (`/v1/wiki/{locator}` — also matches the real grammar), computes a node/mark-type fidelity histogram both sides and diffs them; on any mismatch returns a typed `GATE_UNSATISFIED` (exit 9) naming every mismatched file, never a partial/best-effort success.

This is the CLI's most-real bulk-import path, and unlike the `wiki comment/label/attach` groups above, its two live-server calls (`SavePage`→`/v1/wiki`, `GetPageV1`→`/v1/wiki/{locator}`) both match wiki-api's confirmed `{resource}` grammar with `resource="wiki"` — so this path is plausibly actually functional end-to-end, unlike several of the `wiki` namespace's CRUD sub-resource groups.

---

## 9. Client-local groups

| Group | Real | Stub |
|---|---|---|
| `daemon` | `run` (foreground SSE reconcile + IPC server), `__daemon` (hidden systemd twin, proven identical run-loop by `TestHiddenDaemonSharesRunLoop`) | `status, start, stop, install, uninstall, logs` |
| `cache` | `path`, `link <space> <locator> <path>` (register mirror-file for permission-loss pruning) | `sync, status, clear` |
| `config` | (not read in detail — has `endpoints` presumably real given `doctor` shares the resolver) | `set <key> <value>`, `migrate` (docmost-cli config → `~/.config/orvex`) |
| `doctor` | Real — probes every one of the 5 `AllServices()` endpoints over the shared Transport (`client.ProbeAll`), reports `{cell, cluster, variant, version, endpoints[]}`; typed `SERVICE_UNREACHABLE` (exit 6) only for a *configured* service that failed its probe (an unconfigured service is reported honestly without affecting exit code) | — |
| `audit` | — | `record` (routed to wiki-api), `log` (local-only) — both stubs |
| `instructions` | Real (`internal/output`'s `ErrorCodeRegistry()` self-discovery, golden-tested against `cmd/testdata/instructions_registry.golden`) | — |
| `version` | Real | — |

`internal/gate` runs an M12 E2E "closing-gate" harness against golden stdout/stderr fixtures for real invocations (`version`, unknown-command, `wiki page get` missing-arg, `wiki issue create` with no session) — this is a genuine acceptance-test layer, not just unit tests.

---

## 10. Auth model summary

- **Bearer-forwarding, zero-trust** (NFR-CLI4): the CLI holds no service credential of its own. `Token` is the caller's identity-minted bearer, forwarded verbatim to every edge.
- Two acquisition paths: interactive OIDC RP browser flow (`auth login`), or headless `--token <bearer>` adoption (or `ORVEX_TOKEN`/`DOCMOST_API_TOKEN` env, which always wins over the stored profile).
- Persistence: OS keyring first, encrypted-file fallback (`internal/auth` Manager/KeyringStore/FileStore, ENG-1516/ENG-1956).
- Multi-profile support (`auth use`, `list-profiles`) — named profile/endpoint sets, each with its own store.
- No Linear API key anywhere in this binary, by design (D-S11/D-S24) — `wiki issue create` relays through wiki-api's server-held platform key instead of ever holding one client-side.

---

## 11. Output contract

- `--output/-o` (`json|yaml|human`, default: auto — json when piped, human on a TTY)
- `--fields`, `--id-only`, `--compact` — token minimizers for agent callers
- `--no-daemon` — bypass local cache daemon, hit the service directly
- Frozen exit-code range 0–9 verified against a "docmost-cli contract-test corpus" oracle (`NFR-CLI1`); anchors pinned: `TITLE_AMBIGUOUS→4, VERSION_MISMATCH→5, DUPLICATE_CANDIDATE→8, GATE_UNSATISFIED→9`
- `internal/output/errors.go`'s `Error` envelope: `{error_code, message, hint?, matches?, request_id?, next?}` — `next` gives a literal runnable recovery command at high-friction buckets (e.g. `AUTH_REQUIRED` → `orvex auth login`)
- `ErrorCodeRegistry()` exposes the frozen code vocabulary in declaration order via `orvex instructions`, golden-tested — a genuine machine-discoverable contract, not just documentation

---

## 12. Comparison against docmost-cli (the behavioural reference / predecessor)

`/home/daniel/repos/docmost-cli` command dirs include things **absent** from orvex-cli's binary: `linear/`, `apikey/`, `workspace/` (as a first-class top-level group, not folded into `admin`), `user/`, `code/`, `screenshot/`, `comment/`, `label/`, `attachment/`, `link/`, `specgate/`, `migrate/`. Also has `internal/deviceauth` (a device-code auth flow) and `internal/linear`, `internal/linearview`, `internal/roles`, `internal/duplicate`, `internal/ratelimit`, `internal/expr`, `internal/batch`, `internal/bakeattrs`, `internal/forcegate`, `internal/lokiquery` — a materially larger internal surface (single-tenant/engine-direct era feature depth: rate-limiting, batch ops, force-gates, Loki log querying, role modeling, duplicate detection).

Net read: orvex-cli has **deliberately dropped** Linear (program mandate) and apikey management (SSO-only now), and has **restructured** workspace/comment/label/attachment/screenshot/code into the `wiki`/`admin` service-namespace shape rather than dropping them (they exist as subcommands, several apparently pointed at routes the new wiki-api doesn't serve — see §3 finding). It has **not yet reached feature parity** on: rate-limit awareness, batch operations, duplicate detection (client-side, beyond the stubbed `search duplicates`), device-code auth, Loki-backed log querying, and role administration — none of these have any equivalent surface in orvex-cli today.

---

## 13. Honest maturity verdict

**What's real and end-to-end plausible:**
- `auth login/logout/whoami/status/use/list-profiles` — genuinely built, tested, has a documented real bug-fix history (headless hang fix, keyring-hang fix)
- `wiki page {get,list,create,update,patch,upsert,delete,replace,edit,scaffold,trash,purge,move,restore,duplicate}` — real handlers; `get`/writes match wiki-api's confirmed `/v1/{resource}` and `/v1/wiki/{locator}` grammar for the core CRUD paths
- `wiki nav *`, `wiki governance *`, `wiki history *` — real handlers (server-side route match not independently re-verified for every one beyond the `{resource}` templated set)
- `wiki whoami` — real, fixes a genuine prior blind spot (space-id discovery)
- `wiki issue create` — real, architecturally sound (server-held Linear key, zero-trust bearer only)
- `search keyword/semantic/hybrid` — real and recently fixed to be properly authenticated/ACL'd
- `ai ask/cost/image` — real
- `migrate scan/apply/verify` (top-level) — real, and its two live calls match the confirmed server grammar
- `doctor` — real, useful, honest about configured-vs-unconfigured
- Exit-code/error-code contract — real, golden-tested, self-discoverable

**What's stub-only (routing wired, handler absent, returns typed `NOT_IMPLEMENTED`, zero network):**
- Entire `admin` namespace (workspace/events/user/reindex/reembed)
- `wiki verify {lint,links,orphans,space,duplicates,staleness,ia-conformance}` (except `drift`, which is real) and `wiki verify render` (full-binary-gated stub)
- `wiki spec gate check`
- `wiki space {get,list,create,update,delete}` — explicitly, permanently stubbed because the server has no spaces resource at all (a real cross-service product gap, correctly not papered over)
- `search related/duplicates/attachment-search`
- `ai chat/inline/models`
- Most of `daemon` (all but `run`/`__daemon`) and most of `cache` (all but `path`/`link`)
- `audit record/log`

**What's wired in Go but very likely broken against the live server today (needs verification against a running wiki-api, not just code-reading):**
- `wiki comment *`, `wiki label *`, `wiki attach *` — client methods target `/v1/comments`, `/v1/labels`, `/v1/attachments`, none of which appear in wiki-api's registered route table (§3). These have real Go handlers, compile, and pass unit tests (which necessarily mock the transport), but the confirmed server-side `requireWiki` gate + literal-`"wiki"`-only resource grammar means these almost certainly 404/405 in production exactly like `wiki space` did before it was caught and stubbed.
- `wiki migrate {import,export,verify,apply}` (the facade group under `wiki migrate`, distinct from top-level `migrate`) — targets `ArchiveRequest`-shaped calls whose exact routes were not independently re-verified against the server table above and should be checked before being presented as parity-complete.

**Bottom line for the parity-mapping program**: orvex-cli at HEAD is a real, actively-fixed, well-tested codebase — not a facade — but its own commit history shows a pattern (the `wiki space` 405-mis-bucketed-as-`SERVICE_UNREACHABLE` incident, the `search` unauthenticated-knowledge-call incident) of client-side code being written against an assumed server contract that wiki-api didn't actually implement, discovered only when someone checked live. The comment/label/attachment groups look like unswept instances of that exact same pattern and should be treated as unverified, not delivered, until checked against a running wiki-api instance.
