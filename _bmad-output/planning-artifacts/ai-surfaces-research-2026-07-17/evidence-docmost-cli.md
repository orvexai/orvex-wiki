# docmost-cli — Full Command Surface & Machinery Evidence Map

Sources:
- Repo: `/home/daniel/repos/docmost-cli` (walked `cmd/` cobra tree, 371 `.go` files under `cmd/`)
- Curated reference: `/home/daniel/repos/orvex-wiki/_bmad/doc/data/docmost-cli-reference.md` (613 lines, self-declared "source of truth: `docmost-cli instructions --agent`")
- Registration root: `cmd/root.go` (`NewRootCmd`, 386 lines)

This is the PARITY BASELINE the successor `orvex-cli` must meet (Track 1). It does NOT include a Linear-integration recommendation — per program context, Linear is dropped entirely from the successor; `cmd/linear/`, `cmd/issue/`, and the `page block linear_*` embeds are enumerated here purely as surface that existed in docmost-cli, not as a target.

---

## 1. Full verb tree

Top-level commands registered in `cmd/root.go:NewRootCmd()` (`root.AddCommand(...)`):

```
docmost-cli
├── completion            bash|zsh|fish|powershell          (cmd/completion.go)
├── instructions          [embeds [type]]                    (cmd/instructions.go) — bypass_auth
├── version                                                  (cmd/version.go) — bypass_auth
├── __daemon                                                 (cmd/daemon.go:24, hidden internal entrypoint)
├── daemon                run|status|stop|start|restart      (cmd/daemon.go, cmd/daemon_install.go: install)
├── doctor                                                    (cmd/doctor.go)
├── pb <type> <slug>      hidden top-level alias for `page block <type>` (cmd/page/block/block.go NewPbCmd)
├── ai                    ask|generate(image)|reembed|cost|avail (cmd/ai/*)
├── apikey                force-grant {add|remove|list}       (cmd/apikey/*)
├── attachment             get|list|orphans|rm|search|upload|upload-url (cmd/attachment/*)
├── link <slug|--space>   symlink canonical mirror into repo  (cmd/link/link.go, docs.go, materialize.go, space.go)
├── unlink                                                    (cmd/link/unlink.go)
├── audit                 log|summary                         (cmd/audit/*)
├── config                edit|get|set|show|unset              (cmd/config/*)
├── issue                 create|get|list|search|comments|reopen  (cmd/issue/*) — Linear-integration surface
├── auth                  login|logout|status|whoami|use|list-profiles (cmd/auth/*)
├── cache                 check|clear|diff|info|sync|mirror{add,list,rm,status} (cmd/cache/*)
├── code                  graph                                (cmd/code/*)
├── comment                add|edit|get|list|resolve|rm         (cmd/comment/*)
├── label                 list|pages <name>                    (cmd/label/*)
├── linear                view{list|get}                       (cmd/linear/*) — Linear-integration surface
├── migrate                scan <dir>|apply <manifest>|verify <manifest> (cmd/migrate/*)
├── page                  (see §1a below — largest subtree)     (cmd/page/*)
├── search <query>        [--cached]                            (cmd/search/*)
├── space                 create|delete|get|list|update|permissions|confirm-gate{get,set}|member{add,list,rm,update} (cmd/space/*)
├── spec                  gate check <story-id>                 (cmd/specgate/*)
├── screenshot             manifest|refresh <manifest>|shot <route> (cmd/screenshot/*)
├── user                  get|invite|activate|deactivate|delete|list|me|search (cmd/user/*)
├── verify                lint|links|orphans|render|space|duplicates|staleness|drift|ia-conformance (cmd/verify/*)
└── workspace              info|integrations{linear}|invitations{list,resend,revoke}|settings|confirm-gate{get,set} (cmd/workspace/*)
```

### 1a. `page` subtree (largest single command group — `cmd/page/*`, ~85 files)

```
page
├── get <slug>                    (cmd/page/get.go)
├── list                          (cmd/page/list.go)
├── create <title>                (cmd/page/create.go)
├── update [<slug>]               (cmd/page/update.go)
├── upsert <slug-or-title>        (cmd/page/upsert.go)
├── edit <slug>                   (cmd/page/edit.go)
├── patch [<slug>]                (cmd/page/patch.go)
├── replace <find> <replace>      (cmd/page/replace.go)
├── delete [<slug> | -]           (cmd/page/delete.go)
├── duplicate <slug>              (cmd/page/duplicate.go)
├── move [slug]                   (cmd/page/move.go)
├── purge <slug>                  (cmd/page/purge.go)
├── restore <slug>                (cmd/page/restore.go)
├── restore-content <slug>        (cmd/page/restore_content.go)
├── revert <slug>                 (cmd/page/revert.go)
├── ratify <slug>                 (cmd/page/ratify.go)
├── supersede <slug>               (cmd/page/supersede.go)
├── scaffold <title>              (cmd/page/scaffold.go)
├── diff <slug>                   (cmd/page/diff.go)
├── history <slug>                (cmd/page/history.go)
├── version <history-id>          (cmd/page/version.go)
├── tree                          list; apply <file>          (cmd/page/tree.go)
├── watch <slug>                  (cmd/page/watch.go)
├── backlinks <slug>              (cmd/page/backlinks.go)
├── breadcrumbs <slug>            (cmd/page/breadcrumbs.go)
├── mentions                      (cmd/page/mentions.go)
├── permissions <slug>            (cmd/page/permissions.go)
├── resolve-slug <slugId>         (cmd/page/resolve_slug.go)
├── transclusion-impact <slug>    (cmd/page/transclusion_impact.go)
├── label       add <slug> <label...> | list <slug> | rm <slug> <label> (cmd/page/label/*)
├── mirror      pull <dir> | push <dir> | watch <dir>          (cmd/page/mirror/*)
├── block (alias `pb`)   ~28 embed subtypes (see §5)           (cmd/page/block/*)
```

---

## 2. Machine-output contract

### 2.1 Format resolution (`cmd/root.go` `ResolveDefaultOutput`, `PersistentPreRunE`)
Precedence: `--output`/`-o` or `--json` flag explicit > `DOCMOST_FORCE_TTY=1` env (pins "human") > `config set default_output <val>` > TTY auto-detect (`stdout is TTY` → `human`; non-TTY/piped → `json`) > `human` fallback.
- `--output human|json|yaml` (also `template` referenced in curated reference).
- `--json` is documented as shorthand for `--output json`.
- Token-minimizer flags (root-persistent, work with any Render call): `--fields a,b,c`, `--id-only`, `--compact` (strips list envelope chrome, one JSON object per line).
- Pipe-friendly guarantee: progress → stderr, data → stdout always.
- JSON encoding: `SetEscapeHTML=false` — `<`, `>`, `&` preserved verbatim.
- `--timeout` (root persistent, default 30s, also `DOCMOST_TIMEOUT` env accepting a Go duration or bare integer seconds) — per-request HTTP timeout for API verbs; some commands (`verify render`, `page block image_from_prompt`) redefine `--timeout` with a command-specific meaning.

### 2.2 Exit code table (`internal/errors/errors.go`)
```
0  ExitSuccess
1  ExitRuntime
2  ExitUsage
3  ExitCacheStale
4  ExitAmbiguous            (ambiguous title match / not-found — branch on errorCode, not the number)
5  ExitForbidden
6  ExitUnreachable
7  ExitVerificationFailed   (VERIFICATION_FAILED, CACHE_DRIFT, DRIFT_DETECTED, IA_NONCONFORMANT all share this bucket)
8  ExitDuplicateCandidate   (NEW living-wiki bucket — create-time duplicate guard) — "frozen — extend, never renumber" per CONTRACTS §0.4
9  ExitGateUnsatisfied      (NEW living-wiki bucket — wiki-first spec gate)
```
Rule embedded in the code comments: callers must branch on the `error_code` STRING, never the exit number alone, because several distinct error codes share one exit bucket.

### 2.3 Error envelope (`CLIError` struct, `internal/errors/errors.go:359`)
```go
type CLIError struct {
    ErrorCode string  `json:"error_code"`
    Message   string  `json:"message"`
    Hint      string  `json:"hint,omitempty"`
    Matches   []Match `json:"matches,omitempty"`   // {slug, title} — for TITLE_AMBIGUOUS etc.
    RequestID string  `json:"request_id,omitempty"`
}
```
Plus unexported/internal-only fields (json:"-"): `RetryAfterSecs`, `ServerUpdatedAt`, `CachedAt`, `ExitCode`.

### 2.4 Enumerated `error_code` values (partial — `AllErrorCodes()` exposes the full declaration-order list; ~55 distinct codes found in `internal/errors/errors.go`), grouped:
- **Cache/staleness**: `CACHE_STALE`, `CACHE_DRIFT`
- **Lookup**: `TITLE_AMBIGUOUS`, `PAGE_NOT_FOUND`, `SPACE_NOT_FOUND`, `USER_NOT_FOUND`, `COMMENT_NOT_FOUND`
- **Auth/network**: `FORBIDDEN`, `SERVER_UNREACHABLE`, `NETWORK_UNREACHABLE`, `AUTH_MISSING`, `AUTH_INVALID`, `RATE_LIMITED`
- **Input validation**: `INVALID_ARGS`, `INVALID_FILTER`, `INVALID_INSTANCE_URL`
- **Page state**: `PAGE_NOT_TRASHED`, `PAGE_TRASHED`, `DUPLICATE_TITLE`, `CONFLICT`
- **Verification**: `VERIFICATION_FAILED`, `DRIFT_DETECTED`, `IA_NONCONFORMANT`
- **Living-wiki create/ratify gates** (CONTRACTS §0.4): `DUPLICATE_CANDIDATE` (exit 8), `GATE_UNSATISFIED` (exit 9), `FORCE_TOKEN_REQUIRED`, `BANNED_SLUG_SUFFIX`, `DATE_SLUG_NOT_ALLOWED`, `RATIFY_ACK_REQUIRED`, `RATIFY_REASON_REQUIRED`, `RATIFY_FORCE_NOT_ALLOWED`, `DELETE_FORCE_NOT_ALLOWED`, `SUPERSEDE_FORCE_NOT_ALLOWED`, `CONFIRM_TOKEN_REQUIRED`, `FORCE_REASON_REQUIRED`, `SPACE_DELETE_FORCE_NOT_ALLOWED`, `SPACE_ROLE_CHANGE_FORCE_NOT_ALLOWED`, `SPACE_MEMBER_REMOVE_FORCE_NOT_ALLOWED`, `ARCHIVE_REASON_REQUIRED`
- **Embed-safety**: `EMBED_DEGRADATION`, `MARK_SYNTAX_CORRUPTION` (name inferred from comment context)
- **Other**: `SPACE_SLUG_TAKEN`, `FILE_EXISTS`, `DOWNLOAD_TRUNCATED`, `HASH_MISMATCH`, `SEARCH_MODE_UNAVAILABLE`, `USER_NOT_MEMBER`, `USER_ALREADY_MEMBER`, `INVITE_ALREADY_PENDING`, `SPACE_MEMBER_EXISTS`, `WAIT_TIMEOUT`, `COMMENT_CONFLICT`, `SCREENSHOT_FAILED`, `LOCK_HELD`, `PARTIAL_FAILURE`, `AUDIT_LOG_MISSING`, `DOC_TYPE_NOT_ALLOWED`, `LINEAR_NOT_CONNECTED`, `DAEMON_NOT_RUNNING`, `RUNTIME_ERROR`

Note: each `*_FORCE_NOT_ALLOWED` code explicitly documents it "mirrors the server's ... 403 refusal" — i.e. the CLI both pre-validates locally AND the server independently re-validates; the CLI cannot force a bypass unilaterally.

---

## 3. Safety machinery

### 3.1 CAS (compare-and-swap) — `--if-version`
- Implemented via a unified "three-baseline CAS model" (`internal/cas`, referenced as **ENG-920 B1**) and per-verb adapter `classifyWrite()` in `cmd/page/cas_gate.go`.
- Three baselines: `lastSynced` (cache body verb started from), `desired` (body about to be written), `live` (fresh pre-write server read).
- **INV4 hard constraint** (repeated verbatim in comments): the `ifVersion` sent to the server is ALWAYS `baseline` (the original cached `updated_at`) — NEVER the adopted live-probe value, even when the classifier detects a "benign" version bump.
- Classifier outcomes: `WriteActionSkip` (idempotent re-run → no-op success receipt), `WriteActionConflict` (genuine foreign edit / ABA problem → surfaces `CONFLICT`), `WriteActionProceed` (safe — fresh cache or benign bake bump).
- Degrades gracefully: if no live body or no baseline available, classification is skipped and the server-side 409 CAS path is the sole arbiter (no extra round-trip forced).
- Applies to `page update`, `page edit`, `page patch`, `page replace`, and all `page block <type>` write ops (`--if-version` flag documented as a "universal flag" for block subcommands in `cmd/page/block/block.go`).

### 3.2 Duplicate-guard on create (`internal/duplicate`, `cmd/page/create.go`)
- `duplicate.ValidateTitleSlug(title, docType)` runs at create time.
- On a duplicate signal: exit code 8 (`DUPLICATE_CANDIDATE`).
- Override: `--force-new-acknowledged` (requires `--reason`, min-length enforced) — "Knowingly create a new page despite a duplicate signal ... Caller-attributed; logged as a FORCED_NEW override. No human token needed."
- Shared `--reason` flag also used for `--status archived` transitions (`ARCHIVE_REASON_REQUIRED`).

### 3.3 Ratify-token gate (`page ratify`, `cmd/page/ratify.go`)
- `docmost-cli page ratify <slug>` — "Promote a page to canonical, obtaining human approval via the device-authorization flow."
- `--reason` flag: "optional reason recorded alongside the ratification (only used if a self-asserted ack path is taken instead of the token flow)."
- Server-minted `RATIFY_TOKEN`/`CONFIRM_TOKEN` model: draft→canonical needs a human-minted token (`CONFIRM_TOKEN_REQUIRED`) unless a forced self-ratify bypass is both requested (`--force-self-ratify`) AND the workspace has opted in server-side (`POST /api/orvex/settings/ratify-gate {allowForcedSelfRatify:true}`) — confirmed via memory: API-key callers use `--force-self-ratify`, not `--ratify-acknowledged`.
- Companion codes: `RATIFY_ACK_REQUIRED`, `RATIFY_REASON_REQUIRED` (forward-compat), `RATIFY_FORCE_NOT_ALLOWED` (mirrors server 403).
- Parallel confirm-gate machinery exists for delete (`DELETE_FORCE_NOT_ALLOWED`, `--force-delete`), supersede (`SUPERSEDE_FORCE_NOT_ALLOWED`, `--force-supersede`), space delete (`SPACE_DELETE_FORCE_NOT_ALLOWED`), space member role change (`SPACE_ROLE_CHANGE_FORCE_NOT_ALLOWED`) and space member remove (`SPACE_MEMBER_REMOVE_FORCE_NOT_ALLOWED`) — each is a workspace-config opt-in via `POST /api/orvex/settings/confirm-gate {allowForced<Op>:true}`, not a role escalation. Workspace-level toggle surface: `workspace confirm-gate get|set`, `space confirm-gate get|set` (`cmd/workspace/confirmgate.go`, `cmd/space/confirmgate.go`).
- `--force-reason-required`: any forced confirm-gate bypass requires `--reason` ≥20 chars, enforced both locally (fail-fast) and server-side (belt-and-suspenders, `FORCE_REASON_REQUIRED`).

### 3.4 Server-side audit dual-write (`internal/audit/audit.go`, `internal/audit/dualwrite.go`)
- Local tamper-evident JSONL log (`audit.LogPath()`, `Log`/`LogWithFields`) always written first via an async worker queue (`logQueue.worker`).
- `InitServerAudit(instanceURL, token, enabled)` wired in `root.go PersistentPreRunE` AFTER auth resolves.
- Toggle: `--no-server-audit` (root persistent flag) or `DOCMOST_CLI_NO_SERVER_AUDIT=1` env — disables the server dual-write only; local log is unaffected.
- `fireDualWrite` runs as a tracked goroutine (`dualWriteWg`, `WaitDualWrites()`/`WaitDualWritesTimeout()`); result is appended as a second JSONL line with `_dual_write` (`"ok"`/failure) and `_dual_write_id` fields — i.e. the local log is amended post-hoc with the server-write outcome rather than blocking the local write.
- One retry on HTTP 429 (`doServerWrite`).
- Curated reference explicitly instructs: skills "should leave [`--no-server-audit`] off so audit rows land in both the local JSONL log and the Docmost `audit` table."
- Read surface: `audit log`, `audit summary` (`cmd/audit/*`).

---

## 4. Verify suite (`docmost-cli verify`, `cmd/verify/*`)

Parent is `bypass_auth: true`; individual subcommands resolve their own auth as needed (lint is fully offline).

| Subcommand | File | Purpose | Exit bucket |
|---|---|---|---|
| `lint [<file>...]` | lint.go | offline content lint | usage/general |
| `links <slug>` | links.go | link-integrity check | — |
| `orphans` | orphans.go | pages with no inbound links | — |
| `render <slug>` | render.go | own `--timeout` semantics (command-specific) | — |
| `space` | space.go, space_render.go | space-level render/health check | — |
| `duplicates` | duplicates.go, duplicates_server.go | duplicate-content detection (client + server-assisted variants) | — |
| `staleness` | staleness.go | `last_reviewed_at`-based staleness check | — |
| `drift` | drift.go | detects `DRIFT_DETECTED` | 7 (ExitVerificationFailed) |
| `ia-conformance` | ia_conformance.go | detects `IA_NONCONFORMANT` (manual-outline conformance) | 7 (ExitVerificationFailed) |

`VERIFICATION_FAILED` and `CACHE_DRIFT` also route to exit 7, so all four verify-family failure codes (`VERIFICATION_FAILED`, `CACHE_DRIFT`, `DRIFT_DETECTED`, `IA_NONCONFORMANT`) share one exit bucket by design — callers must branch on `error_code`.

---

## 5. `page block` embed catalog (28 subtypes, `cmd/page/block/*`)

Registered via `block.AddBlockCmd(factory)` pattern (each factory called twice: once for `page block <type>`, once for the hidden `pb <type>` top-level alias). Universal flags on every block subcommand (`cmd/page/block/block.go` doc comment):
```
--op append|prepend|replace-at|insert-at   (default: append)
--if-version <version>                     CAS guard
--dry-run                                  validate + print PM-JSON, no API call
--output / --json                          inherits global format flags
```
Discoverable programmatically via `docmost-cli instructions embeds [type] [--json]`.

Embed types found:
`attachment`, `audio`, `callout`, `chart`, `columns`, `details`, `diagram` (mermaid-flavored; supports `classDef ...:::name` styling), `drawio`, `embed`, `excalidraw` (scene-based, per memory: prefers `--scene` + generator over `--diagram`), `image_from_prompt`, `linear_entity`/`linear_cycle`/`linear_roadmap`/`linear_mention`, `linear_graph`, `linear_issue`, `linear_view`, `math_block`, `math_inline`, `mermaid`, `orvex_dashboard`, `pdf`, `rm` (remove a block), `status`, `subpages`, `table`, `task_list`, `transclusion`, `video`.

(Linear-family embeds — 6 of the 28 — are Linear-integration surface, out of scope for the successor per program context.)

---

## 6. Spec gate (`docmost-cli spec gate`, `cmd/specgate/*`)

- `spec gate check <story-id>` (`cmd/specgate/gate.go`).
- Failure code: `GATE_UNSATISFIED` → exit 9 (`ExitGateUnsatisfied`), a dedicated NEW bucket per CONTRACTS §0.4 alongside the duplicate-guard's exit 8 — both frozen, "extend never renumber."
- This is the wiki-first enforcement point referenced by the `doc-spec-gate` skill (loaded skill listing): "at create-story time records the intent node ...; at dev-story time is a read-only token check that HALTs only on a genuine miss when wiki_first_enforcement is block."

---

## 7. `migrate` (bulk markdown import pipeline, `cmd/migrate/*`)

| Subcommand | Signature | Purpose |
|---|---|---|
| `scan <dir>` | migrate/scan.go | scan a local directory tree, produce a manifest |
| `apply <manifest.yaml>` | migrate/apply.go | apply the manifest — bulk create/update pages |
| `verify <manifest.yaml>` | migrate/verify.go | verify the manifest's outcomes post-apply |

---

## 8. `ai` (ask/image/cost/reembed, `cmd/ai/*`)

| Subcommand | Signature | File |
|---|---|---|
| `ask <question>` | ai/ask.go | AI-assisted search/Q&A over the wiki |
| `image generate <prompt>` (parent `image`) | ai/image.go | AI image generation |
| `cost` | ai/cost.go | reports AI usage cost |
| `reembed` | ai/reembed.go | re-runs embeddings |
| `avail` | ai/avail.go | (availability probe — not wired as a cobra subcommand of `ai` in `ai.go`'s `AddCommand` list; file present but only `ask`, `image`, `reembed`, `cost` are registered in `NewAiCmd()`) |

---

## 9. `page mirror pull/push` (bidirectional filesystem sync, `cmd/page/mirror/*`)

| Subcommand | Signature | Notes |
|---|---|---|
| `pull <dir>` | mirror/pull.go | wiki → local filesystem (embeds + sidecar metadata) |
| `push <dir>` | mirror/push.go | local filesystem → wiki |
| `watch <dir>` | mirror/watch.go | continuous sync daemon-style watch |

Curated reference confirms the intended skill workflow is `page mirror pull` → edit locally → `page mirror push`, and that `content.SetMarkdownToPMEndpoint`/`SetMarkdownToPMToken` (wired in `root.go` before any `content.MarkdownToPM` call) back this markdown↔ProseMirror conversion for mirror push and `ai` commands alike.
State tracking file: `cmd/page/mirror/state.go` (per-file sync state, referenced by `slug_test.go`, `ws3_test.go`).

---

## 10. Daemon / cache model

### Daemon (`cmd/daemon.go`, `cmd/daemon_install.go`)
- `__daemon` — hidden internal entrypoint (`Use: "__daemon"`, line 24).
- `daemon run` — foreground run.
- `daemon status` / `daemon stop` / `daemon start` / `daemon restart`.
- `daemon install` — separate file, likely installs a system service/launchd/systemd unit.
- Root flag `--no-daemon` (persistent): "bypass local cache daemon and call Docmost API directly (falls back to a direct API call when the space is not cached, e.g. `page list`)."
- When daemon is running, cache auto-refreshes via Docmost's event stream (per curated reference); otherwise `cache sync` must be run explicitly.

### Cache (`cmd/cache/*`)
| Subcommand | Purpose |
|---|---|
| `cache sync [--space <slug>] [--since <RFC3339>]` | populate/refresh local SQLite cache — full, per-space, or incremental |
| `cache check` | cache health check |
| `cache clear` | wipe local cache |
| `cache diff <slug>` | diff cached vs live for one page |
| `cache info` | cache metadata/stats |
| `cache mirror add\|list\|rm\|status` | manage the filesystem-mirror registrations tracked by the cache layer (distinct from `page mirror`) |

Reads served from cache (per curated reference, corroborated by `internal/errors` `CACHE_STALE`/`CACHE_DRIFT` codes): `page get`, `page list`, `search --cached`, `verify duplicates`, `verify staleness`, `page backlinks`, `page breadcrumbs`.
Exit code 3 (`CACHE_STALE`) on a read command signals a stale/empty cache — remedy is `cache sync`.

---

## 11. Auth & profiles (`cmd/auth/*`)

`login`, `logout`, `status`, `whoami`, `use <profile>`, `list-profiles`. Env fallback: `DOCMOST_API_TOKEN` (headless/CI, auto-picked-up). Multi-tenant: `--profile <name>` (root persistent) or `DOCMOST_PROFILE` env. Resolution order in `PersistentPreRunE`: explicit `--profile` flag (must be non-empty, else `INVALID_ARGS`) → `DOCMOST_PROFILE` env → `auth.Resolve("")` default-profile lookup.

---

## 12. Other command groups (brief)

| Group | Subcommands | File |
|---|---|---|
| `apikey` | `force-grant {add, remove, list}` | cmd/apikey/forcegrant.go |
| `attachment` | `get <uuid>`, `list`, `orphans`, `rm <uuid>`, `search <query>`, `upload <slug> <file>`, `upload-url <slug>` | cmd/attachment/* |
| `comment` | `add <slug> --body`, `edit <uuid> --body`, `get <uuid>`, `list <slug>`, `resolve <uuid>`, `rm <uuid>` | cmd/comment/* |
| `label` | `list`, `pages <name>` (top-level); page-scoped variant at `page label {add,list,rm}` | cmd/label/*, cmd/page/label/* |
| `link` / `unlink` | `link [--space]`, `link status`, `link docs`, `unlink` | cmd/link/* |
| `screenshot` | `manifest`, `refresh <manifest>`, `shot <route>` | cmd/screenshot/* |
| `space` | `create <name>`, `delete <slug>`, `get <slug>`, `list`, `update <slug>`, `permissions <slug>`, `confirm-gate {get,set}`, `member {add,list,rm,update}` | cmd/space/* |
| `user` | `get`, `invite`, `activate`, `deactivate`, `delete`, `list`, `me`, `search` | cmd/user/* |
| `workspace` | `info`, `integrations` (incl. `linear`), `invitations {list,resend,revoke}`, `settings`, `confirm-gate {get,set}` | cmd/workspace/* |
| `code` | `graph` (tree-sitter based code graph; has stub + treesitter variants) | cmd/code/* |
| `search <query>` | `--cached`, `--content`, `--space`, `--mode keyword\|hybrid\|semantic` (live only) | cmd/search/* |
| `config` | `edit`, `get <key>`, `set <key> <value>`, `show`, `unset <key>` | cmd/config/* |
| `completion` | `bash`, `zsh`, `fish`, `powershell` | cmd/completion.go |
| `instructions` | root `instructions`, `instructions embeds [type] [--json]` — programmatic embed-catalog discovery + agent-rules doc, `bypass_auth: true` | cmd/instructions.go |
| `doctor` | environment/health diagnostic | cmd/doctor.go |

---

## 13. Test-file signal (breadth of behavioral contract coverage)

The `cmd/` tree carries ~150+ `_test.go` files, several named after specific tickets — strong evidence of hardened, regression-locked behavior the successor must not silently drop:
`eng612_live_fallback_test.go`, `eng906_acceptance_test.go`, `eng908_acceptance_test.go`, `eng909_acceptance_test.go` (mirror), `eng910_acceptance_test.go`, `eng912_acceptance_test.go` (verify), `eng913_acceptance_test.go` (link), `eng922_acceptance_test.go`, `eng926_acceptance_test.go`, `eng1323_content_json_create_test.go`, `eng1331_bulletlist_test.go`, `eng1487_splice_test.go`, `eng1645_table_embed_guard_test.go`, `eng1663_no_daemon_live_fallback_test.go`, `eng1664_space_scoping_test.go`, `eng2059_device_auth_test.go`, `eng2063_frontmatter_test.go`, plus root-level `binary_contract_test.go`, `json_contract_test.go`, `output_contract_test.go`, `timeout_test.go`, `help_consistency_test.go`, `help_footgun_test.go`, `space_flag_error_test.go`, `auth_json_contract_test.go`.

Notable named guards: `embed_guard.go`/`embed_guard_test.go` (`EMBED_DEGRADATION`), `cas_gate.go`/`cas_gate_test.go`, `create_dupguard_test.go`, `force_self_ratify_test.go`, `ratify_ack_test.go`, `resync_guard_test.go`, `update_ifversion_test.go`, `ws2_cas_test.go`, `ws4_edit_test.go`, `write_idempotency_test.go`, `writepaths_regression_test.go`.

---

## 14. Cross-check notes vs. curated reference (`_bmad/doc/data/docmost-cli-reference.md`)

- Confirms `page get` serves both markdown-body and full-JSON-record roles depending on `--output` — there is no separate `page info`.
- Confirms `--field <key>` (single-field extract) is mutually exclusive with `--output json`.
- Confirms `page resolve-slug` walks `redirect_from` chains then `superseded_by` chains.
- Confirms `--doc-type` and `--status` (default `draft`) are taxonomy-required on `page create`; `--owner-id` defaults to the authenticated user.
- Confirms `--has-permission <Action>:<Subject>` filter on `page list` for permission-scoped enumeration.
- States explicitly: "`docmost-cli` is the only sanctioned interface between a BMAD skill and the Docmost wiki. Skills never speak HTTP directly, never edit the SQLite cache, and never call the MCP surface." — i.e. under the OLD architecture, docmost-cli was the sole approved surface; the NEW program explicitly is building three parallel AI-facing surfaces (orvex-wiki-api, orvex-studio-mcp, orvex-cli), so this "only sanctioned interface" constraint is itself being superseded by Track 2's design, not carried forward verbatim.

---

## 15. Parity-baseline takeaways for `orvex-cli`

1. **Full verb-tree width**: 371 `.go` files in `cmd/`, ~30 top-level command groups, `page` alone with ~30 subcommands + 28 embed block-types + mirror + label sub-subtrees.
2. **Machine contract is a first-class, tested product surface** — dedicated `*_contract_test.go` files lock exit codes, JSON envelope shape, and `--output` auto-detection behavior. `orvex-cli` needs an equivalent frozen `error_code` enum + exit-bucket table (do not renumber existing buckets 0–9 if reused verbatim — but this can be redesigned since it's a fresh AI-first rebuild, not a byte-compatible fork).
3. **Three independent safety systems must each have a home**: CAS (`--if-version` + three-baseline classifier), duplicate-guard (`--force-new-acknowledged` + `--reason`), and confirm/ratify-token gates (workspace opt-in + server-side re-validation) — these are NOT decorative; they are audited (`audit dual-write`) and regression-tested per-ticket.
4. **Linear surface (`cmd/linear/`, `cmd/issue/`, 6 Linear page-block embeds, `workspace integrations linear`) is explicitly OUT of scope** for the successor per program directive — do not carry it into the parity map as a target, only as a "this existed, we are dropping it" line item.
5. **Daemon+cache is a distinct subsystem** (`__daemon`, `daemon {run,status,stop,start,restart,install}`, `cache {sync,check,clear,diff,info,mirror}`) with its own staleness contract (exit 3, `CACHE_STALE`/`CACHE_DRIFT`) — the successor's target-home mapping should decide whether this lives in orvex-cli itself or is fully delegated to orvex-wiki-api server-side caching, per the "no direct-to-engine, use wiki-api /v1" rule.
