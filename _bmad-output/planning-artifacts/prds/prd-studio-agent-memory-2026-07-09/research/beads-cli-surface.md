# `bd` CLI Command Surface Audit (beads @ `/home/daniel/repos/beads`)

**Method note:** Command inventory was cross-checked three ways: (1) the generated index at `docs/CLI_REFERENCE.md` (last touched by commit `8c00cefd` on 2026-07-09, the *same* commit that last touched `cmd/bd/*.go` — the doc is current, not stale); (2) a direct grep of every `Use:` string across `cmd/bd/*.go` (excluding `*_test.go`); (3) a grep of every `rootCmd.AddCommand(...)` call site in `cmd/bd/main.go`'s `init()`-pattern registration (each file registers itself). All three sources agree. Root command itself is defined in `cmd/bd/main.go:679` (`var rootCmd = &cobra.Command{Use: "bd", ...}`), with global persistent flags registered in `main.go:584-624`.

**Global flags (apply to virtually every command, incl. `--json`):**
`--actor`, `--db`, `-C/--directory`, `--dolt-auto-commit`, `--global`, `--ignore-schema-skew`, `--json`, `--profile`, `-q/--quiet`, `--readonly`, `--sandbox`, `-v/--verbose`. **`--json` is a root `PersistentFlag`, so it is inherited by every command and subcommand in the tree** — this is the uniform "agent mode" switch rather than a per-command opt-in. A hidden `--format json` alias also maps to it (`main.go:595`, desire-path fix for GH#2612).

---

## Work Item CRUD

Core lifecycle operations on individual issues ("beads").

- **`bd create`** / **`bd create-form`** (`cmd/bd/create.go`, `create_form.go`) — create an issue, or batch-create from a markdown file (`-f`) or a dependency-graph JSON plan (`--graph`). Distinctive flags: `--deps 'type:id'` (e.g. `discovered-from:bd-20,blocks:bd-15`), `--ephemeral`/`--wisp-type` (TTL-compaction), `--waits-for`/`--waits-for-gate` (fan-out gate creation), `--no-history` (skip Dolt history for permanent low-churn beads), `--silent` (ID-only output for scripting), `--validate` (enforce required sections by type). Alias: `bd new`.
- **`bd q [title]`** (`cmd/bd/quick.go`) — "quick capture": creates an issue and prints **only the issue ID**, explicitly for scripting/agent piping (`ISSUE=$(bd q "...")`).
- **`bd update`** (`cmd/bd/update.go`) — bulk field update; if no ID given, updates the *last-touched* issue. Distinctive: `--claim` (atomic claim primitive, see Agent Session Rituals).
- **`bd edit`** (`cmd/bd/edit.go`) — opens `$EDITOR` on a specific field (description/title/design/notes/acceptance).
- **`bd delete`** (`cmd/bd/delete.go`) — destructive, irreversible; `--cascade` vs default-fail-on-dependents vs `--force` (orphan dependents); batch via `--from-file`.
- **`bd close`** (`cmd/bd/close.go`) — alias `done`. Distinctive: `--claim-next` (auto-claim next highest-priority ready issue after closing — chains agent work loops), `--continue`/`--no-auto` (auto-advance to next molecule step), `--suggest-next`. Has three **hidden** convention aliases for `--reason`: `--resolution` (Jira convention), `-m/--message` (git convention), `--comment` — deliberate agent/tool ergonomics.
- **`bd reopen`**, **`bd unclaim`** (`reopen.go`, `unclaim.go`) — reopen closed issues; release a claim (clear assignee, reset to open) for crash recovery.
- **`bd assign`**, **`bd priority`**, **`bd note`**, **`bd tag`** (`assign.go`, `priority.go`, `note.go`, `tag.go`) — one-line shorthands for `bd update --assignee/--priority/--append-notes/--add-label`.
- **`bd comment`** / **`bd comments [add]`** (`comment.go`, `comments.go`) — shorthand vs. full subcommand form; supports `--stdin`/`--file`.
- **`bd label`** (`label.go`): `add`, `remove`, `list`, `list-all`, `propagate` (push a label from parent to all children — e.g. `branch:` labels across an epic).
- **`bd todo`** (`todo.go`): `add`, `done`, `list` — a lightweight task-type convenience wrapper.
- **`bd show`** (`show.go`, `show_display.go`, `show_format.go`, `show_refs.go`, `show_thread.go`) — alias `view`. Distinctive: `--as-of <commit>` (time-travel via Dolt), `--current` (in-progress/hooked/last-touched issue), `--refs` (reverse lookup of who cites this issue), `--thread` (render full mail/message conversation — see Messaging), `-w/--watch`.
- **`bd list`** (`list.go` + `list_*.go`) — the primary query surface; huge filter set (date ranges, label glob/regex, metadata field filters, `--format digraph|dot|<go-template>`). `--pretty`/`--tree` (default tree view), `--ready` (same semantics as `bd ready`).
- **`bd search`**, **`bd query`** (`search.go`, `query.go`) — `search` is text/ID search; `query` is a small boolean query language (`status=open AND priority<=2 AND updated>7d`, `--parse-only` for AST debugging).
- **`bd count`**, **`bd diff`**, **`bd history`** (`count.go`, `diff.go`, `history.go`) — count with `--by-status/--by-priority/--by-type/--by-assignee/--by-label` grouping; diff between two Dolt refs/branches; per-issue Dolt commit history.
- **`bd defer`** / **`bd undefer`** (`defer.go`, `undefer.go`) — put an issue "on ice" (hidden from `bd ready`, still visible in `bd list`) with `--until` scheduling, vs. dependency-`blocked`; see Agent Session Rituals for the semantic distinction.
- **`bd duplicate`** / **`bd duplicates`** / **`bd find-duplicates`** (`duplicate.go`, `duplicates.go`, `find_duplicates.go`) — `duplicate --of` marks+closes one issue as a dup; `duplicates` finds exact content-hash matches with `--auto-merge`; `find-duplicates` (alias `find-dups`) uses mechanical Jaccard similarity or `--method ai` (LLM semantic compare, needs `ANTHROPIC_API_KEY`).
- **`bd supersede`** (`cmd/bd/duplicate.go:29`) — `bd supersede <id> --with <new>`, closes an issue with a "superseded by" pointer (design docs/specs/ADRs).
- **`bd rename`** / **`bd rename-prefix`** (`rename.go`, `rename_prefix.go`) — rename a single issue ID with reference rewriting everywhere; rename the *entire database's* ID prefix (max 8 chars, `--repair` to consolidate multi-prefix corruption).
- **`bd state`** / **`bd set-state`** (`state.go`) — a generic `<dimension>:<value>` label convention (e.g. `patrol:active`, `health:healthy`) with an event-bead audit trail; `state list` shows all dimensions on an issue.
- **`bd link`** (`link.go`) — shorthand for `bd dep add` with a default `blocks` type.

---

## Dependency Graph & Structure

- **`bd dep`** (`cmd/bd/dep.go`) — `add` (also accepts `--file <jsonl>` for bulk wiring, `--no-cycle-check` for speed), `list` (`--direction up|down`, batch multi-ID), `tree` (`--direction down|up|both`, `--format mermaid`), `cycles`, `remove` (alias `rm`). `dep relate` / `dep unrelate` are implemented in **`cmd/bd/relate.go`** and mounted onto `depCmd` (the help text's `bd relate ...` shorthand examples are *not* an actual separate top-level command — confirmed by source: `depCmd.AddCommand(relateCmd)`).
- **`bd graph`** (`cmd/bd/graph.go`, `graph_apply.go`, `graph_export.go`, `graph_visual.go`) — visualize dependency DAGs: default terminal DAG, `--box`, `--compact`, `--dot` (Graphviz), `--html` (self-contained D3.js); `graph check` validates cycles/orphans/integrity (exit 1 on problems).
- **`bd epic`** (`cmd/bd/epic.go`) — `status` (completion %, `--eligible-only`), `close-eligible` (auto-close epics whose children are all done).
- **`bd children`** (`cmd/bd/children.go`) — convenience alias for `bd list --parent <id> --status all`; `--pretty` tree.
- **`bd blocked`** (`cmd/bd/ready.go:336`) — issues with unresolved dependency blockers; `--parent` scopes to an epic subtree. (Lives in `ready.go` — `blocked` and `ready` are two faces of the same blocker-aware engine.)
- **`bd orphans`** (`cmd/bd/orphans.go`) — issues referenced in git *commit messages* but still open/in-progress (work done but not formally closed); `--fix` closes them with confirmation.

---

## Agent Session Rituals

This is the densest cluster of AI-agent-specific design in the CLI — atomic claim/lease primitives, async coordination gates, and structured multi-agent dispatch.

- **`bd ready`** (`cmd/bd/ready.go`) — **the core "what should I work on" call.** Returns open issues with no active blockers (excludes in-progress/blocked/deferred/hooked), via a dedicated `GetReadyWork` API (same semantics as `bd list --ready`). Distinctive flags: **`--claim`** (atomically claims the first matching ready issue — sets assignee+in_progress in one call, avoiding claim races between concurrent agents), `--mol <id>` (ready steps within one molecule), `--gated` (delegates to `bd mol ready --gated`, molecules unblocked by a just-closed gate), `--explain` (dependency-aware reasoning for why something is/isn't ready), `--sort priority|hybrid|oldest`.
- **`bd heartbeat`** (alias `bd hb`) (`cmd/bd/heartbeat.go`) — refreshes the lease on an in-progress claim (`lease_expires_at` pushed forward). Only the current owner may heartbeat.
- **`bd reclaim`** (`cmd/bd/reclaim.go`) — the reaper half of the lease protocol: reverts in-progress issues whose lease has gone stale (dead worker) back to `open`/ready, recording a recovery event. `--older-than` sets the grace window (default: 2× lease TTL); meant to run from a supervisor on a timer.
- **`bd update --claim`** / **`bd close --claim-next`** — same atomic-claim idea woven into the general update/close paths, so an agent loop can chain "finish this → claim next" in one call.
- **`bd defer`** / **`bd undefer`** (`defer.go`, `undefer.go`) — deliberate "not now" postponement, distinct from dependency-blocked: no blocker exists, the agent/human is choosing to skip it; hidden from `bd ready` but visible in `bd list`. `--until` supports relative/natural-language scheduling (`+1h`, `tomorrow`, `next monday`).
- **`bd gate`** (`cmd/bd/gate.go`, `gate_discover.go`) — **async wait-condition primitive that blocks a workflow step until resolved.** Gate types: `human` (manual `bd gate resolve`), `timer` (auto-expire), `gh:run`/`gh:pr` (poll GitHub Actions/PR state via `gh` CLI), `bead` (cross-rig: waits for a bead in another beads repo to close, `await_id` format `<rig>:<bead-id>`). Subcommands: `create` (`--blocks`, `--timeout`, `--await-id`), `list` (`--all`), `check` (`--type`, `--escalate`, `--dry-run` — the evaluator that actually closes resolved gates / escalates failed ones), `resolve`, `show`, `add-waiter` (registers a worker address to be woken on gate close — used by `bd close --phase-complete` per the doc text), `discover` (heuristically matches open `gh:run` gates to actual GitHub run IDs by branch/SHA/time-proximity).
- **`bd merge-slot`** (`cmd/bd/merge_slot.go`) — an exclusive-access mutex bead (`<prefix>-merge-slot`) so multiple agents don't race to resolve merge conflicts ("monkey knife fights"). `create`, `check`, `acquire` (`--wait` to queue), `release`.
- **`bd human`** (`cmd/bd/human.go`) — the escalation valve: agents label issues `human`, then `human list` surfaces them, `human respond <id> -r "..."` answers+closes, `human dismiss` closes without answering, `human stats` gives pending/responded/dismissed counts. Note this command's own `--help` text says "*bd has 70+ commands — many for AI agents*", showing the maintainers consciously separate the human-facing subset from the agent-facing majority.
- **`bd batch`** (`cmd/bd/batch.go`) — runs a small DSL of write ops (`close`, `update`, `create`, `dep add/remove`) from stdin/file inside **one Dolt transaction and one commit**, explicitly built to stop write-amplification from scripts that loop-invoke `bd` many times (notably bad on btrfs+compression backends).
- **`bd swarm`** (`cmd/bd/swarm.go`) — coordinates **parallel multi-agent work on an epic**. `create` (wraps an epic in a swarm molecule, optional `--coordinator` address, auto-wraps a bare issue into a single-child epic), `list`, `status` (computed live from bead state: Completed/Active/Ready/Blocked buckets, not stored separately), `validate` (checks dependency direction, orphans, cycles, disconnected subgraphs; reports "ready fronts"/parallelism estimates before you commit agents to it).
- **`bd mol current`** / **`mol progress`** / **`mol ready --gated`** / **`mol last-activity`** / **`mol stale`** (`mol_current.go`, `mol_progress.go`, `mol_ready_gated.go`, `mol_last_activity.go`, `mol_stale.go`) — molecule-workflow situational awareness for an agent resuming mid-workflow: "where am I", indexed progress counters (scales to millions of steps), gate-resume discovery, staleness/stuck detection. (Full molecule mechanics under Workflows/Molecules below.)
- **`bd prime`** (`cmd/bd/prime.go`, `prime_divergence.go`) — outputs AI-optimized workflow context; **auto-detects MCP-server mode (≈50 tokens) vs. CLI mode (≈1-2k tokens)**. Designed to be wired into Claude Code/Gemini CLI/Codex `SessionStart` hooks so agents don't forget the `bd` workflow after context compaction. `--hook-json` wraps output in the SessionStart envelope; `--memories-only` for compact hook injection; `--max-memories`/`--max-memory-chars` cap what gets injected (hosts truncate silently otherwise); `.beads/PRIME.md` can override the whole output; `agent.profile` config controls git/commit-authority wording (`conservative|minimal|team-maintainer`).
- **`bd onboard`** (`cmd/bd/onboard.go`) — the *minimal* counterpart to `prime`: a ~10-line snippet for `AGENTS.md` that just points at `bd prime` (keeps the agent-instructions file lean; `bd init --agents-profile=full` embeds the complete reference instead).
- **`bd doctor --agent`** (`cmd/bd/doctor.go`, `doctor_agent.go`) — a distinct *output mode*, not a separate command: instead of pass/fail text, each finding carries observed state / expected state / explanation / exact remediation commands / source files / severity (`blocking|degraded|advisory`) — explicitly "ZFC-compliant: Go observes and reports, the agent decides and acts." Combine with `--json` for structured agent consumption.
- **`bd audit`** (`cmd/bd/audit.go`) — append-only interaction log at `.beads/interactions.jsonl`, for "why did the agent do that?" auditing *and* SFT/RL dataset generation. `record` (`--kind llm_call|tool_call|label`, `--prompt`, `--response`, `--tool-name`, `--exit-code`, or `--stdin` a JSON `audit.Entry`), `label` (append a label entry referencing a prior interaction, e.g. good/bad).

---

## Memory / Context

- **`bd remember` / `bd recall` / `bd forget` / `bd memories`** (`cmd/bd/memory.go`) — a persistent key→content store that survives sessions *and account rotations*, auto-injected by `bd prime`. `remember "<content>" [--key k]` (bare-key argument that already exists is transparently treated as a recall, not a re-store); `recall <key>`; `forget <key>`; `memories [search]` lists/searches all. Memories are excluded from `bd export` by default (may hold sensitive agent context) — need `--include-memories`/`--all`.
- **`bd context`** (`cmd/bd/context_cmd.go`, `context.go`, `context_proxied_server.go`) — shows effective backend identity/repo/sync config; reads config files directly, **does not require the DB to be open** (useful for diagnosing a degraded state).
- **`bd where`** (`cmd/bd/where.go`) — shows the active `.beads` database location including redirect resolution.
- **`bd kv`** (`cmd/bd/kv.go`) — freeform `get`/`set`/`clear`/`list` key-value store for flags/env-like persisted values.
- **`bd info`** (`cmd/bd/info.go`) — DB path/stats/schema (`--schema`), `--whats-new` (agent-relevant recent-version changes), `--thanks` (contributor page).

---

## Sync & Storage

There is **no single unified `bd sync` command.** "Sync" instead appears as a verb-suffix pattern across independent subsystems, plus the `sync.remote` / `sync.branch` config keys that `bd bootstrap` auto-detects:

- **Dolt version control** — `bd dolt` (`cmd/bd/dolt.go`): server lifecycle `start`/`stop`/`status`; **`push`/`pull`** (Dolt-remote sync, `--force`, `--remote <name>`, needs `DOLT_REMOTE_USER`/`DOLT_REMOTE_PASSWORD` for Hosted Dolt); `commit` (flush the working set, primarily for `dolt.auto-commit=batch` mode); `remote add|list|remove`; `set`/`show`/`test` (config: database/host/port/user/data-dir); `clean-databases` (drop stale `testdb_*`/`beads_test*`/etc. from a shared server); `killall` (kill orphan dolt sql-server processes not owned by this repo's PID file).
- **`bd vc`** (`cmd/bd/vc.go`) — git-like porcelain over the same Dolt backend: `commit -m`, `merge <branch> --strategy ours|theirs`, `status`. `bd branch`, `bd history`, `bd diff` are also called out as quick-access equivalents.
- **`bd branch`** (`cmd/bd/branch.go`) — list or create Dolt branches directly.
- **`bd backup`** (`cmd/bd/backup.go`, `backup_dolt.go`, `backup_restore.go`) — a **full Dolt-native database backup** (tables + branches + commit history + working set), explicitly distinct from `bd export`'s JSONL issue-record dump. `init <path>` (alias `add`; local dir or DoltHub URL), `sync` (push to configured destination), `restore [path]` (`--force` to overwrite), `status`, `remove` (alias `rm`).
- **`bd export`** / **`bd import`** (`cmd/bd/export.go`, `export_auto.go`, `export_obsidian.go`, `import.go`, `import_path.go`, `import_shared.go`) — JSONL issue interchange (not a backup). Export: `--all` (incl. infra/templates/gates/memories), `--include-memories`, `--scrub` (drop test/pollution rows), `--exclude-owner`. Import: upsert semantics keyed on `updated_at` recency (`stale_skipped_ids`/`tie_kept_local_ids` reported), `--allow-stale` to force-restore an older snapshot, `--dedup`, reads `-` for stdin. Memory records (`"_type":"memory"`) round-trip automatically as `bd remember` entries.
- **`bd compact`** (`cmd/bd/compact_dolt.go`) — squash Dolt commits *older than N days* while cherry-picking recent ones back on top (`--days`, `--force`); reduces auto-commit history bloat without losing recent time-travel. (Note: semantic issue-content compaction is a *different* command, `bd admin compact` — see Hygiene & Health.)
- **`bd flatten`** (`cmd/bd/flatten.go`) — the "nuclear option": squash *all* Dolt history into one commit (irreversible).
- **`bd gc`** (`cmd/bd/gc.go`) — full lifecycle GC in three phases: decay (delete old closed issues, `--older-than`), compact (→ `bd compact`), Dolt GC; any phase skippable (`--skip-decay`, `--skip-dolt`).
- **`bd worktree`** (`cmd/bd/worktree.go`, `worktree_cmd.go`) — `create`/`list`/`remove`/`info`; git worktrees auto-share the main repo's beads DB via git common-dir discovery (no redirect file needed) — built for running multiple parallel agents in sibling worktrees.
- **`bd federation`** (`cmd/bd/federation.go`/`federation_nocgo.go`) — peer-to-peer multi-workspace sync (`add-peer`, `sync --peer`, `status --peer`, `remove-peer`, `list-peers`); **requires CGO** — the no-CGO build variant prints a build-config error instead (these two files are mutually exclusive via Go build tags, so only one is ever compiled in).
- **`bd repo`** (`cmd/bd/repo.go`) — multi-repo *hydration* (not the same as federation): `add`/`list`/`remove`/`sync` additional repos' JSONL into one unified DB, with mtime caching to skip unchanged repos.
- **`bd migrate sync <branch>`** (`cmd/bd/migrate.go:732`) — a third, unrelated meaning of "sync": configures the `sync.branch` config key so issue commits land on a dedicated branch instead of `main`, for multi-clone setups.

**No daemon/server/proxy user command exists as such** beyond `bd dolt start/stop/status` (the Dolt sql-server lifecycle) — but there are two **hidden, internal plumbing commands** that function as daemon/proxy machinery: `bd db-proxy-child` (`cmd/bd/db_proxy_child.go`, `Hidden: true`) — the long-lived per-workspace TCP proxy fronting a Dolt server, spawned by the parent `bd` process via fork+exec for `--proxied-server` mode; and `bd send-metrics` (`cmd/bd/send_metrics.go`, `Hidden: true`) — internal metrics flush subcommand. Neither is meant to be invoked directly. A separate **MCP server integration** exists outside this CLI entirely, at `integrations/beads-mcp` (a Python package `beads_mcp`), presumably wrapping `bd` for MCP tool-calling — it is not part of the `cmd/bd` Cobra tree.

---

## Hygiene & Health

- **`bd doctor`** (`cmd/bd/doctor.go` + `doctor_agent.go`, `doctor_artifacts.go`, `doctor_conventions.go`, `doctor_fix.go`, `doctor_gastown_guard.go`, `doctor_health.go`, `doctor_pollution.go`, `doctor_validate.go`) — "**start here**" per its own Short text. Checks schema/migration state, ID scheme, CLI/plugin currency, permissions, cycles, git hooks, `.gitignore` freshness. Modes: `--perf` (timed operations + CPU profile for bug reports), `--check=artifacts|conventions|pollution|validate` (focused checks, `--clean`/`--fix`), `--deep` (full graph integrity: parent consistency, dep integrity, epic completeness, agent-bead integrity, mail-thread integrity, molecule integrity), `--server` (Dolt server-mode connectivity/version/schema/pool health), `--migration=pre|post` (machine-parseable pre/post migration validation), `--agent` (see Agent Session Rituals), `--fix`/`--fix-child-parent`/`--dry-run`/`-i` (interactive per-fix confirm). Warnings suppressible per-check via `doctor.suppress.<slug>` config.
- **`bd lint`** (`cmd/bd/lint.go`) — checks issues for missing required sections by type (bug needs Steps-to-Reproduce+Acceptance-Criteria, task/feature need Acceptance Criteria, epic needs Success Criteria); `--type`, `--status`.
- **`bd stale`** (`cmd/bd/stale.go`) — issues not updated in `--days` (default 30): abandoned in-progress work, forgotten open issues.
- **`bd recompute-blocked`** (`cmd/bd/recompute_blocked.go`) — unconditionally repairs the denormalized `is_blocked` flag that `bd ready` trusts; needed when a scoped post-pull recompute was skipped (failed merge, hand-resolved conflict). Idempotent, works in embedded *and* server mode (unlike `bd doctor`, server-mode only).
- **`bd config drift`** / **`bd config apply`** (`config_drift.go`, `config_apply.go`) — read-only "is my environment consistent with config?" (hooks/remote/server checks, exit 1 on drift) vs. the idempotent fixer for the same three checks.
- **`bd ping`** (`cmd/bd/ping.go`) — trivial connectivity check with timing, exit 0/1.
- **`bd preflight`** (`cmd/bd/preflight.go`) — contributor pre-PR checklist (tests run, lint, gofmt, JSONL pollution, nix vendorHash, version mismatch); `--check --fix`.
- **`bd prune`** / **`bd purge`** (`prune.go`, `purge.go`) — permanently delete closed **non-ephemeral** beads (`prune`, requires `--older-than` or `--pattern` as a safety gate, skips pinned/open/referenced-by-open beads unless `--ignore-references`) vs. closed **ephemeral** beads/wisps (`purge`). Both recommend a follow-up `bd flatten` to actually reclaim disk.
- **`bd admin cleanup`** / **`bd admin compact`** (`cmd/bd/admin.go`, `compact.go`) — `cleanup` deletes closed issues outright (`--cascade`, `--ephemeral`, `--older-than`); `compact` is **semantic** issue compaction (AI- or agent-summarized closed-issue content shrink, tiered, `--analyze`/`--apply` agent-driven workflow that avoids needing an API key, plus a legacy `--auto` AI mode and a `--dolt` GC sub-mode). `bd restore <id> [--apply]` (`restore.go`) recovers the pre-compaction original content from the archived snapshot (or best-effort from Dolt history).
- **`bd admin reset`** (`cmd/bd/reset.go`, mounted onto `adminCmd`) — nukes `.beads/` + hooks + sync worktrees; dry-run by default, `--force` required to execute.

---

## Messaging

- **`bd mail`** (`cmd/bd/mail.go`) — **delegates**, does not implement mail itself. Looks up `BEADS_MAIL_DELEGATE`/`BD_MAIL_DELEGATE` env var or `mail.delegate` config (typically `"gt mail"`) and forwards all subcommands/args verbatim. This confirms `bd` assumes an external multi-agent orchestrator (referred to internally as "Gastown"/`GT_ROOT`, see `doctor_gastown_guard.go` and comments like `gastownhall/beads#4566`) owns actual agent-to-agent mail.
- **`bd show --thread`** (`cmd/bd/show_thread.go`) — renders a full conversation thread for a message-type issue (finds replies via reply-to linkage).
- **`bd comment` / `bd comments add`** — see Work Item CRUD; comments are the substrate messages/threads are built from.
- **`bd human respond`** — see Agent Session Rituals; the human→agent reply channel.

---

## Workflows / Molecules

The "chemistry" metaphor system for templated, spawnable, multi-step agent work: **Formula (recipe) → cook → Proto (template epic, solid) → pour (persistent) or wisp (ephemeral) → Mol (real issues) → squash (digest) or burn (discard)**; **distill** runs the extraction in reverse (ad-hoc epic → reusable formula).

- **`bd formula`** (`cmd/bd/formula.go`, `formula_schema.go`) — TOML/JSON workflow definitions with variables, steps, composition (`extends`). `list` (`--type workflow|expansion|aspect|convoy`), `show <name>`, `convert` (JSON→TOML, `--delete`/`--stdout`), `schema [primitive]` (alias `primitives`; introspects every exported Go struct in `internal/formula/types.go` via `go:generate` — structural reference, not proof of wiring). 4-tier search path: project `.beads/formulas/` → repo-local → `~/.beads/formulas/` → `$GT_ROOT/.beads/formulas/`.
- **`bd cook <formula-file>`** (`cmd/bd/cook.go`) — compiles a formula into a resolved proto. `--mode compile` (default: keeps `{{var}}` placeholders, for modeling/estimation) vs `--mode runtime`/`--var` (fully substituted, for final validation); `--persist` writes it as a DB proto bead (legacy — most flows cook inline/ephemeral).
- **`bd mol`** (`cmd/bd/mol.go` + `mol_bond.go`, `mol_burn.go`, `mol_distill.go`, `mol_show.go`, `mol_squash.go`, `mol_seed.go`, plus the ritual ones listed above). Alias: `bd protomolecule`.
  - **`mol pour <proto-id>`** — proto → *persistent* mol (`cmd/bd/pour.go`; note the file's own header comment calls it "a top-level command" but it is actually mounted via `molCmd.AddCommand(pourCmd)` — a stale comment, not a real top-level `bd pour`). `--attach`/`--attach-type` bonds additional protos on spawn.
  - **`mol wisp [proto-id]`** (`cmd/bd/wisp.go`, mounted under `molCmd`) — proto → *ephemeral* mol (not git-synced). Bare form creates; `create`, `list`, `gc` (`--age`, `--closed --force`, `--exclude-type`) subcommands manage them.
  - **`mol bond <A> <B>`** — polymorphic combine (formula+formula, formula+mol, proto+proto, proto+mol, mol+mol); `--type sequential|parallel|conditional`; `--pour`/`--ephemeral` force phase; `--ref '<name>-{{var}}'` for readable dynamic child IDs ("Christmas Ornament pattern"). Hidden alias: `bd mol fart`.
  - **`mol squash`** — condenses a molecule's ephemeral children into one digest issue, promoting/deleting the wisps; `--summary` lets the *calling agent* supply an AI-generated summary rather than bd generating one itself ("keeps bd a pure tool").
  - **`mol burn`** — deletes a molecule with no digest (abandoned/crashed/test runs); batchable.
  - **`mol distill <epic-id> [formula-name]`** — reverse-engineers a formula from an existing ad-hoc epic.
  - **`mol seed <formula-name>`** — verifies a formula is loadable without spawning anything (health check before dispatch).
- **`bd swarm`** — see Agent Session Rituals (multi-agent parallel-epic orchestration; tightly coupled to `bd mol` and `bd gate`).
- **`bd ship <capability>`** (`cmd/bd/ship.go`) — publishes a capability label (`provides:<capability>`) once an `export:<capability>`-labeled issue is closed, so other projects can `bd dep add <issue> external:<project>:<capability>` — cross-project dependency resolution.

---

## Integrations / Import-Export

Six external trackers share one push/pull/status/sync shape (`cmd/bd/sync_push_pull.go` provides the common `push [bead-ids...]` / `pull [refs...]` wiring reused by each):

- **`bd jira`** (`jira.go`) — `pull`, `push`, `status`, `sync` (`--pull`/`--push`/bidirectional, `--prefer-local`/`--prefer-jira`, `jira.push_prefix` to scope which local prefixes push out).
- **`bd linear`** (`linear.go`) — adds `teams` (list team UUIDs); rich config surface (priority/state/label-type/relation maps, hash-ID mode); OAuth client-credentials support for CI workers (`LINEAR_OAUTH_CLIENT_ID/SECRET`, precedence OAuth > API key > config); `--pull-if-stale --threshold` (staleness-gated pull with a 5-min anti-loop debounce); `--milestones` (reconstruct Linear milestones as local epic parents).
- **`bd github`** (`github.go`) — adds `repos` (list accessible repos); GitHub Enterprise via `github.url`.
- **`bd gitlab`** (`gitlab.go`) — adds `projects`; supports group-level sync (`gitlab.group_id`, `--project`).
- **`bd ado`** (`ado.go`, Azure DevOps) — adds `projects`; WIQL-backed filters (`--area-path`, `--iteration-path`, `--types`, `--states`), `--bootstrap-match` heuristic first-sync matching, `--reconcile` (rescans for remote deletions).
- **`bd notion`** (`notion.go`) — adds `connect` (attach to existing DB/data source) and `init` (create a dedicated Notion DB) instead of `teams`/`repos`/`projects`.
- **`bd import`** / **`bd export`** — see Sync & Storage (these are the interchange layer these integrations build on top of, conceptually).
- **`bd repo`** — see Sync & Storage (multi-repo hydration, distinct from federation).
- **`bd federation`** — see Sync & Storage (CGO-gated peer sync).
- **`bd migrate`** (`cmd/bd/migrate.go`, `migrate_hooks.go`, `migrate_issues.go`) — `hooks` (plan/apply git-hook migration to marker-managed format), `issues` (move issues between repos with `--include none|upstream|downstream|closure` dependency preservation; also reachable as a hidden deprecated top-level alias `bd migrate-issues`), `schema` (idempotent, mostly a no-op since migrations auto-run on store open — exists for explicit CI/observability), `sync <branch>`. Bare `bd migrate` checks/updates DB metadata version; remote-backed DBs refuse in-place migration unless `--force` (single-designated-migrator confirmation) or `BD_ALLOW_REMOTE_MIGRATE=1`.
- **`bd migrate-personal`** (`cmd/bd/migrate_personal.go`) — one-time move of a contributor's personally-created issues from the project DB into their personal planning repo (`~/.beads-planning`).

---

## Admin / Infra

- **`bd init`** (`cmd/bd/init.go` + `init_agent.go`, `init_contributor.go`, `init_git_hooks.go`, `init_guard.go`, `init_proxied_server.go`, `init_safety.go`, `init_stealth.go`, `init_team.go`, `init_templates.go`) — creates `.beads/` + Dolt DB. Notable flags: `--stealth` (per-repo `.git/info/exclude` so beads files never get committed — "invisible" personal usage), `--server`/`--shared-server`/`--proxied-server` (three different multi-process topologies, the latter still `[EXPERIMENTAL]` with a dozen `--proxied-server-*` sub-flags), `--reinit-local`/`--discard-remote`/`--destroy-token=DESTROY-<prefix>` (see `bd init-safety` below), `--from-jsonl`, `--role maintainer|contributor`, `--agents-profile minimal|full`.
- **`bd init-safety`** (`cmd/bd/init_safety_help.go`) — not an action, a **reference document command**: explains the destroy-token contract and exit codes (10/11/12) for `bd init`'s data-safety guards, with a pointer to `docs/RECOVERY.md`.
- **`bd bootstrap`** (`cmd/bd/bootstrap.go`) — the *non-destructive* counterpart to `init --force`; auto-detects the right action (clone from `sync.remote`, clone from git-embedded Dolt refs, restore from `.beads/backup/`, import from `.beads/issues.jsonl`, or fresh-create) — the recommended fresh-clone/recovery entry point.
- **`bd setup [recipe]`** (`cmd/bd/setup.go`) — writes AI-editor integration files; built-in recipes: cursor, claude, copilot, gemini, aider, factory, codex, mux, opencode, junie, windsurf, cody, kilocode; `--add <name> <path>` for custom recipes; `--check`/`--remove`; `--stealth` (claude/gemini variants).
- **`bd config`** (`cmd/bd/config.go`, `config_apply.go`, `config_drift.go`, `config_show.go`, `config_side_effects.go`) — `get`/`set`/`set-many`/`unset`/`list`/`show` (`--source` filter: env/config.yaml/default/metadata/database/git)/`validate`/`apply`/`drift`. `set`/`set-many` gate secret keys behind `--force-git-tracked` to avoid leaking tokens into git-tracked config.
- **`bd dolt`** — see Sync & Storage.
- **`bd worktree`**, **`bd hooks`**, **`bd upgrade`** — see Sync & Storage / Hygiene (worktree), and: `bd hooks install/list/run/uninstall` (`cmd/bd/hooks.go`) installs pre-commit/post-merge/pre-push/post-checkout/prepare-commit-msg shims (`--beads` vs `--shared` vs default `.git/hooks/`, marker-section coexistence with pre-existing hooks); `bd upgrade status/review/ack` (`cmd/bd/upgrade.go`) tracks version bumps and shows changelogs since the operator's last-seen version.
- **`bd sql <query>`** (`cmd/bd/sql.go`) — raw SQL escape hatch (`--csv`), explicitly documented as bypassing the storage layer.
- **`bd rules`** (`cmd/bd/rules.go`) — `audit` (Jaccard-similarity contradiction/merge-opportunity scan over `.claude/rules/`) and `compact` (`--auto`/`--group`) — a small CLAUDE.md/rules-file hygiene tool, itself agent-oriented tooling for managing *other* AI tool configuration.
- **`bd admin`** — see Hygiene & Health.
- **`bd metrics`** (`cmd/bd/metrics.go`) — anonymous usage telemetry toggle: `on`/`off`/`example` (shows real payload samples); explicitly states no issue content/paths/identity are ever collected.
- **`bd completion`** / **`bd help`** — Cobra-framework-provided (bash/fish/powershell/zsh completion scripts; `help --all`/`--list`/`--doc`/`--docs-root` is in fact how `docs/CLI_REFERENCE.md` itself gets generated).
- **`bd version`** (`cmd/bd/version.go`) — also reachable as root `-V/--version`. Current: `1.1.0`.
- Hidden internal plumbing (not part of the public surface, listed for completeness of the audit): **`bd codex-hook <event>`** (`cmd/bd/codex_hook.go`, `Hidden: true`) — Codex CLI lifecycle hook (SessionStart/PreCompact/PostCompact/UserPromptSubmit) that shells back out to `bd prime` to inject context, mirroring what Claude Code's hook does natively; **`bd db-proxy-child`** and **`bd send-metrics`** — see Sync & Storage / Admin above.

---

## What was checked and *not found*

- No `bd sync`, `bd daemon`, `bd serve`, `bd web`, `bd tui`, `bd browse`, `bd agent`, or `bd sling` command exists anywhere in `cmd/bd`. ("sling" and agent-orchestration concepts like `StatusHooked` appear only as forward-references to an external orchestrator layer that `bd mail` delegates to.)
- No `--force-self-*` flag exists (checked per the prompt's example list) — likely a hypothetical example rather than a real flag; the genuinely distinctive flags I did verify in source include `--claim` (ready/update), `--deps discovered-from:...` (create), and `--stealth` (init/setup/prime).
- `bd template` is **not** a command — `cmd/bd/template.go` is pure internal library code (variable-substitution / subgraph-cloning helpers used by `mol bond/pour/wisp/distill`), no `Use:` field, no registration.
- "decision" is not a command — it's an issue-`--type` alias (`dec`/`adr` → `decision`) usable on `bd create -t decision` / `bd list -t decision`.
- "watch" and "activity" are not commands — `--watch`/`-w` is a flag on `bd list`/`bd show`/`bd ready`(via `--pretty` implication); "activity" is a data section inside `bd status`'s output (git activity in the last 24h), not its own verb.
- `bd relate`/`bd unrelate` and `bd pour` are **not real top-level invocations** despite what their own `Long:` help text examples imply — source confirms they're mounted under `bd dep` and `bd mol` respectively (documented correctly in `CLI_REFERENCE.md`; only the inline example strings in the Go source are shorthand-misleading).

---

## Totals

- **113 top-level, user-visible commands** (confirmed identical between `docs/CLI_REFERENCE.md`'s TOC and source). This reconciles exactly against the source registration count: 116 raw `rootCmd.AddCommand(...)` call sites → 115 unique (one pair, `federation.go`/`federation_nocgo.go`, is a mutually-exclusive CGO/no-CGO build-tag duplicate of the same `bd federation` command) → minus 4 `Hidden: true` internal commands (`codex-hook`, `db-proxy-child`, `send-metrics`, and a deprecated `migrate-issues` alias) → 111 explicit visible + 2 Cobra-framework-auto-added (`help`, `completion`) = **113**.
- **153 second-level subcommands** (`#### bd ...`) + **6 third-level grandchild subcommands** (`bd dolt remote add/list/remove`, `bd mol wisp create/gc/list`) → **272 total distinct invocable command paths** in the documented surface.
- `--json` is available on essentially the entire tree via the root persistent flag, making it the CLI's universal "agent mode" toggle rather than a per-command feature.

---

## Shortlist: 10 commands most clearly designed *for* AI agents

1. **`bd ready --claim`** — one atomic call that answers "what's next" *and* claims it, closing the race window between concurrent agents picking the same issue.
2. **`bd prime`** — session-start context injection purpose-built for LLM hook systems (Claude Code/Codex/Gemini `SessionStart`), with token-budget-aware truncation (`--max-memories`, `--max-memory-chars`) because hook hosts silently truncate oversized output.
3. **`bd heartbeat`** — a lease-renewal primitive that only makes sense for a long-running autonomous worker, not a human typing commands.
4. **`bd reclaim`** — the automatic "dead worker" detector/reaper that makes the whole claim/heartbeat lease model self-healing without human intervention.
5. **`bd gate`** — an async cross-process/cross-agent/cross-repo wait-condition primitive (human/timer/GitHub-run/GitHub-PR/cross-rig-bead), the coordination backbone for multi-agent workflow orchestration.
6. **`bd batch`** — exists purely to fix the write-amplification pathology of scripted/agentic loops that invoke `bd` hundreds of times; a human would never need it.
7. **`bd doctor --agent`** — restructures diagnostics into observed/expected/explanation/remediation-command/severity tuples explicitly described as "ZFC-compliant: Go observes and reports, the agent decides and acts."
8. **`bd remember` / `bd recall`** — cross-session, cross-context-compaction, cross-account-rotation memory — solving a failure mode (LLM context loss) that has no human analogue.
9. **`bd audit`** — appends structured `llm_call`/`tool_call` interaction records specifically for building SFT/RL training datasets from agent behavior — a data-pipeline command, not a UX feature.
10. **`bd mol` / `bd cook` / `bd wisp`** (the molecule system) — lets an agent programmatically spawn a variable-substituted, dependency-wired multi-step work template (`{{var}}` placeholders, `--dry-run` preview, ephemeral "wisp" phase with auto-GC) entirely from the command line, without any human authoring each child issue by hand.

*(Honorable mentions just outside the top 10: `bd merge-slot` — a mutex specifically to stop concurrent agents from conflict-storming a shared merge queue; `bd human` — the deliberate agent→human escalation valve; `bd swarm` — multi-agent parallel-epic dispatch computed live from bead state.)*
