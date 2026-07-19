# Beads (bd) — Deep Repo Audit

**Purpose:** research backbone for the Orvex Studio hosted cross-agent memory/coordination service PRD (`prd-studio-agent-memory-2026-07-09`). Orvex will EMBED the ideas in its own Go/Postgres/Kafka/MCP stack; it will NOT ship or wrap the beads CLI.

**Audited:** 2026-07-10, repo at `/home/daniel/repos/beads`, branch `main`, latest tag `v1.1.0` (released 2026-07-04). All file citations are repo-relative.

---

## 0. Executive summary

Beads is Steve Yegge's "distributed graph issue tracker for AI agents" (`README.md:3`) — in practice a **persistent, dependency-aware task memory** that replaces markdown TODO lists for coding agents. It is MIT-licensed, very actively developed (v0.x → v1.1.0; 4,600+ PRs/issues referenced in the changelog), and since ~v0.50 is built entirely on **Dolt** (a version-controlled MySQL-compatible database) as the single storage backend, with git remotes doubling as Dolt remotes via `refs/dolt/data`.

The parts most valuable to Orvex are not the storage plumbing (which is deeply shaped by "local-first CLI on a laptop" constraints we don't have) but:

1. **The data model** — one `issues` table generalized into a memory substrate: work items, messages, decisions, gates, events, and ephemeral "wisps" are all beads with 19 typed edges between them (`internal/types/types.go`).
2. **The agent rituals** — `bd prime` (session-start context injection), `bd remember` (persistent KV memories), `bd ready` (unblocked-work detection), atomic `--claim` with lease/heartbeat/reclaim, `discovered-from` links, and the "landing the plane" session-close protocol.
3. **The compaction story** — LLM-powered "semantic memory decay" of closed issues (Claude Haiku, `internal/compact/haiku.go`) plus TTL-tiered ephemeral data.
4. **The hard lessons** — cell-level merge silently losing concurrent writes (fixed with a synthetic `row_lock` column, migration 0054), distributed schema migration pain (the entire v1.1.0 release theme), and the JSONL-as-source-of-truth reversal.

For a hosted multi-tenant Postgres service, Dolt/git/JSONL sync is exactly the layer to drop; the graph model, ready-work computation, lease mechanics, prime/remember rituals, and compaction tiers are the layer to keep.

---

## 1. Identity & maturity

### 1.1 What it is (in its own words)

- "Distributed graph issue tracker for AI agents, powered by Dolt" (`README.md:3`).
- "Beads provides a persistent, structured memory for coding agents. It replaces messy markdown plans with a dependency-aware graph, allowing agents to handle long-horizon tasks without losing context" (`README.md:15`).
- `docs/FAQ.md` positions it against GitHub Issues: typed dependencies with semantics, deterministic offline `bd ready` (~10ms), offline-first branch-scoped task memory, AI-resolvable conflicts/duplicate merge, version-controlled SQL, agent-native `--json` + MCP. "Think of it as Taskwarrior meets git."

### 1.2 Authorship, naming, ecosystem

- Go module `github.com/steveyegge/beads`; GitHub org migrated to `gastownhall/beads` (`README.md` badges). Distribution: brew, npm (`@beads/bd`), PyPI (`beads-mcp` MCP server), winget, AUR, Nix (`npm-package/`, `winget/`, `flake.nix`).
- Beads is explicitly a **dependency of a larger orchestrator** ("Gas Town"/"Gas City", CLI `gt`): the docs reference `gt dolt start`, `gt mail`, `gt sling`, "polecats" (worker agents), "rigs", "towns", "convoys", "crews" (`docs/DOLT.md`, `docs/messaging.md`, `.beads/formulas/beads-release.formula.toml`). Beads = data plane; orchestrator = control plane (`docs/messaging.md:9-11`). Several schema concepts (rig/agent columns, swarm molecules, gates) exist to serve that orchestrator — the same layering Orvex Studio will have between the memory service and its own orchestration.
- Anonymous opt-out telemetry of command names only (`AGENT_INSTRUCTIONS.md §Telemetry`), OTel metrics/traces throughout (`go.mod`).

### 1.3 Version & cadence

- Current: **v1.1.0 (2026-07-04)**, preceded by v1.0.0…v1.0.5 and a long v0.x line (tags back through v0.20 era; `git tag`). CHANGELOG.md is 336 KB — near-daily releases during 2025-2026.
- Commit velocity is extreme (PR numbers past #4689 as of audit date; multiple merges/day).
- The v1.1.0 theme is telling: "a safe schema-migration and upgrade path… repairs the v52/v53 drift classes that broke real-world rc.1/rc.2 upgrades" (`CHANGELOG.md:37-45`). Distributed schema migration of a synced Dolt DB requires "exactly one designated clone" to migrate (`README.md:97-101`) and has repeatedly bricked user databases (#4502, #4555, #4566). **Lesson for Orvex: hosted Postgres with ordinary online migrations eliminates this entire failure class.**

### 1.4 Licensing verdict

| Artifact | License | Source |
|---|---|---|
| beads itself (all Go code, docs, prompts, templates) | **MIT** — "Copyright (c) 2025 Beads Contributors" | `LICENSE` |
| Dolt, go-mysql-server, dolthub/driver (runtime deps) | Apache-2.0 | `THIRD_PARTY_LICENSES` |

Implications for Orvex:

- **(a) Reimplementing concepts** (schemas, dependency semantics, ready-work algorithm, prompting rituals, command vocabulary): unrestricted. Ideas/APIs/concepts are not protected by either license; no obligation attaches. Recommended primary mode.
- **(b) Copying code fragments or prompt text**: permitted by MIT; must retain the MIT copyright + permission notice for the copied portions (e.g., a NOTICE/third-party-licenses entry in the consuming repo). No copyleft, no source-disclosure obligation — compatible with Orvex's closed-source satellites.
- **(c) Embedding packages** (e.g., importing the public `beads` Go package, `beads.go`): MIT terms as above; if Dolt were embedded it adds Apache-2.0 obligations (license copy, NOTICE preservation, patent-retaliation clause — still closed-source-friendly). Since Orvex targets Postgres, Dolt embedding is moot.
- Only trademark-ish caution: don't market the Orvex service as "Beads".

---

## 2. Architecture

### 2.1 Storage backends — Dolt-only today

The two-layer model (`docs/ARCHITECTURE.md`): Cobra CLI (`cmd/bd/`, all commands support `--json`) → Dolt database → Dolt/git remote.

- **SQLite is legacy/removed**: docs retain migration paths from pre-0.50 SQLite/JSONL installs (`docs/DOLT.md:47-56`; `scripts/migrate-jsonl-to-dolt.sh`; `bd migrate --to-dolt` itself removed in v0.58.0). The `UnderlyingDB()` custom-table extension pattern is explicitly "SQLite-only", superseded by `bd query`/`--json` (`docs/ADVANCED.md:287-300`).
- **Four Dolt deployment shapes** (`README.md §Storage Modes`, `docs/DOLT.md`, `docs/ARCHITECTURE.md`):
  1. **Embedded** (default): in-process Dolt engine via `internal/storage/embeddeddolt/`, data in `.beads/embeddeddolt/`, single-writer enforced by file lock; zero ops.
  2. **Server**: external `dolt sql-server` (port 3307), multi-writer, data in `.beads/dolt/`; config via flags/env (`BEADS_DOLT_SERVER_*`) or Unix socket for sandboxed environments.
  3. **Shared server**: one Dolt server at `~/.beads/shared-server/` (port 3308) serving all projects, database-per-prefix isolation, identity check refuses prefix collisions (`docs/DOLT.md §Shared Server Mode`).
  4. **Proxied sidecar** (newest): bd spawns and manages its own `dolt sql-server` subprocess under `.beads/proxieddb/` with GC, retries, configurable port/idle-timeout/indefinite uptime (`cmd/bd/proxied_server.go`; commits #4676-#4689 — active work as of audit week).
- Every write auto-commits to Dolt history in embedded mode (one Dolt commit per write command); auto-commit is OFF in server mode because "firing DOLT_COMMIT after every write under concurrent load causes 'database is read only' errors" (`docs/DOLT.md:455-462`).

### 2.2 The cgo/nocgo split

`beads.go` + `beads_cgo.go` + `beads_nocgo.go` (repo root) define the public Go extension API:

- `beads_cgo.go` (build tag `cgo`): `OpenBestAvailable` opens embedded Dolt in-process (embedded Dolt **requires CGO**), else server mode from `metadata.json`.
- `beads_nocgo.go` (build tag `!cgo`): only server mode; embedded returns error "embedded Dolt requires CGO; use server mode (bd init --server)".
- Additional build-tag discipline: `gms_pure_go` tag required for all builds/tests; ICU regex path is a separate opt-in (`AGENTS.md §Testing Commands`, `.buildflags`).
- Public API surface intentionally tiny: Storage/Transaction interfaces, core types re-exports, `Open`/`OpenFromConfig`/`FindDatabasePath` (`beads.go`). Extensions are otherwise steered to CLI `--json` or raw SQL (`bd query`).

### 2.3 Daemon / server processes

There is no long-lived bd daemon in the current architecture (a legacy `bd daemon start --local` existed for git-free mode, `README.md:240`; the RPC protocol layer `internal/rpc/protocol.go` remains for server mode). Long-running processes today are Dolt sql-servers (external, shared, or the proxied sidecar). PID/port/log files under `.beads/` (`dolt-server.pid`, `dolt-server.port`, `server.log`).

### 2.4 Git integration & sync model

- **Dolt is the source of truth; git is transport.** Dolt history lives under `refs/dolt/data` on the *same* git remote as the code — invisible to normal git branches, safe with protected branches (`docs/SYNC_CONCEPTS.md`, `docs/PROTECTED_BRANCHES.md`). `bd init` auto-wires `git remote origin` as Dolt remote `sync.remote`; `bd dolt push`/`bd dolt pull` sync; fresh clones run `bd bootstrap` which probes origin for `refs/dolt/data` and clones the database.
- Other Dolt remote transports: DoltHub, S3, GCS, local filesystem (`docs/DOLT.md §Dolt Remotes`).
- **`.beads/issues.jsonl` is a passive export, not the sync protocol** — "JSONL import is upsert-only; it cannot infer that records absent from an export were deleted" (`docs/SYNC_CONCEPTS.md:29-33`). This is a reversal of beads' original JSONL-in-git design; git hooks now only refresh the export (pre-commit, when `export.auto=true`) and fall back to JSONL import solely for legacy no-remote projects (post-merge/post-checkout).
- Git hooks are embedded in the bd binary (`bd hooks install`); `.beads/hooks/` also hosts **beads event hooks** (`on_create`/`on_update`/`on_close`, JSON on stdin) for orchestrator integration (`docs/messaging.md §Beads Event Hooks`) — beads' outbound eventing primitive, the analog of Orvex's Kafka spine.
- **Git-free operation** is first-class: `BEADS_DIR` + `bd init --stealth` (config `no-git-ops: true`) run everything with zero git calls — for non-git VCS, monorepos, CI, eval sandboxes (`README.md §Git-Free Usage`).
- Roles: `bd init --contributor` routes planning issues to a separate personal repo (`~/.beads-planning`) so forks don't leak issues into PRs; maintainer auto-detected from SSH/credentialed URLs (`README.md:81-84`).

### 2.5 Offline & merge semantics

- Hash IDs make concurrent creation collision-free; updates converge via Dolt **cell-level 3-way merge**; `bd vc conflicts`/`bd vc resolve` for the rare residue (`docs/ADVANCED.md §Handling Merge Conflicts`).
- Merge/dedup logic on import: same ID + same content hash → skip; same ID + different hash → update; unknown → create (`docs/ARCHITECTURE.md:121-136`). Every issue carries a SHA-256 `content_hash` over its substantive fields (`internal/types/types.go:124-177`).
- **Critical caveat found in migration 0054** (`internal/storage/schema/migrations/0054_add_lease_columns.up.sql`): "Dolt has no real row locking and merges concurrent writes cell-by-cell, so a heartbeat (touching heartbeat_at) and a close (touching status) would otherwise silently cell-merge instead of conflicting." Beads forces every mutating path to rewrite a synthetic `row_lock BIGINT` cell so concurrent writers produce a 1213/1205 serialization conflict that `withRetryTx` replays — "the difference between exactly-once and a lost close." **Cell-level merge, the headline Dolt feature, is actively dangerous for mutable coordination state and had to be defeated per-row.** In Postgres this problem does not exist (real row locks, `SELECT … FOR UPDATE`).

### 2.6 ID scheme

- **Hash IDs**: `prefix-<hex>`, SHA-256 over (title, description, created-at RFC3339Nano, workspace ID); caller takes first N chars with **progressive lengthening on collision** (6→7→8 in `internal/types/id_generator.go`; adaptive sizing by DB size documented in `docs/ADAPTIVE_IDS.md` / `docs/COLLISION_MATH.md`; older docs cite 4-char starts). ~97% stay at the base length.
- **Hierarchical child IDs**: `parent.N` (`bd-a3f8.1.1`), max depth 3 ("prevents over-decomposition"), unlimited breadth (tested to 347 children), allocated via a `child_counters` reservation table (`internal/types/id_generator.go:43-127`, migration 0008).
- **Namespace inserts** for instantiated workflows: `bd-mol-xxx` (poured molecules), `bd-wisp-xxx` (ephemeral wisps) (`internal/types/types.go:1467-1473`).
- Prefix is per-project (max 8 chars, lowercase); `bd rename-prefix` mass-rewrites IDs *and* all textual references (`docs/ADVANCED.md §Renaming Prefix`). Multi-repo routing can override prefix per issue (`SourceRepo`/`IDPrefix`/`PrefixOverride` internal fields).

### 2.7 Compaction / memory decay

Two distinct mechanisms:

1. **Semantic compaction of closed issues** (`bd compact`, `internal/compact/`): AI summarization via **Anthropic API, Claude Haiku** (`internal/compact/haiku.go`; key from `ANTHROPIC_API_KEY` or `ai.api_key` config). Tier-1 prompt compresses description/design/acceptance/notes into "**Summary** (2-3 sentences) / **Key Decisions** (bullets) / **Resolution** (one sentence)" — the exact prompt template is at `haiku.go:264-291`. Retries with exponential backoff; per-call audit log entries (`internal/audit`); OTel token/latency metrics. Issues carry `compaction_level`, `compacted_at`, `compacted_at_commit`, `original_size`; snapshots preserved in `issue_snapshots`/`compaction_snapshots` tables (migrations 0009-0010) so compaction is reversible via Dolt history. A tier-2 exists in `cmd/bd/compact_tier2_embedded_test.go` (deeper decay).
2. **TTL-based wisp GC**: ephemeral wisps classified by `wisp_type` with TTL tiers — heartbeat/ping 6h; patrol/gc_report 24h; recovery/error/escalation 7d (`internal/types/types.go:674-701`). `bd mol wisp gc`, `bd purge` (ephemeral), `bd prune` (closed non-ephemeral, with **reference-aware protection**: skips closed beads whose ID is cited in any open bead's text, `README.md:159-182`).

### 2.8 Import/export & interop

- `bd export` / `bd import` — JSONL of the issues table (with labels/dependencies/comments inlined); used for migration, viewers, interchange, backup-lite. Explicitly NOT a database backup (no Dolt branches/history/non-issue tables) — `bd backup init/sync/restore` does full Dolt backups to filesystem/DoltHub (`README.md §Backup & Migration`).
- External tracker adapters live in `internal/`: GitHub, GitLab, Jira, Linear, Notion, Azure DevOps (`internal/github`, `internal/gitlab`, `internal/jira`, `internal/linear`, `internal/notion`, `internal/ado`; config namespaces in `docs/CONFIG.md`). Issues carry `external_ref` (e.g. `gh-9`) and `source_system`; tracker-specific fields round-trip via namespaced `metadata` JSON (`docs/METADATA.md §Tracker Round-Trip`).
- Federation (peer-to-peer workspace sync) — see §7 and agent-C distillation below.

---

## 3. Data model (complete)

Source of truth: `internal/types/types.go` (1,484 lines) + migrations `internal/storage/schema/migrations/` (54 numbered migrations, 106 files).

### 3.1 Tables

From migrations 0001-0054: `issues`, `dependencies`, `labels`, `comments`, `events`, `config` (KV incl. memories), `metadata`, `child_counters`, `issue_snapshots`, `compaction_snapshots`, `repo_mtimes`, `routes` (multi-repo routing), `issue_counter`, `interactions`, `federation_peers`, `ready_issues` (view), `blocked_issues` (view), `blocked_issues_cache` (materialized), `wisps` + `wisp_labels`/`wisp_dependencies`/`wisp_events` (**dolt_ignore'd — never versioned or synced**, migrations 0019-0022), `custom_status`/`custom_type` tables, `local_metadata` (clone-local state), `schema_migrations`.

Key storage decisions visible in migrations: UUID primary keys w/ deterministic dependency IDs (0037, 0050); `is_blocked` materialization on issues (0046-0047); LONGTEXT for large content (0049); composite `(status, updated_at)` + `defer_until` + lease indexes (0052, 0054); orchestrator "HOP" columns added then **dropped** (0038) — schema-bloat course-correction.

### 3.2 Issue (bead) fields — grouped as in code

- **Identity**: `id`; internal `content_hash` (SHA-256, drives dedup/merge).
- **Content**: `title` (≤500 chars, required), `description`, `design`, `acceptance_criteria`, `notes`, `spec_id` (link to spec artifact).
- **Workflow**: `status`, `priority` (int 0-4, 0=critical — P0 valid, hence no omitempty), `issue_type`.
- **Assignment**: `assignee` (doubles as lease owner), `owner` (human, "CV attribution", git email), `estimated_minutes`.
- **Timestamps/audit**: `created_at`, `created_by`, `updated_at`, `started_at`, `closed_at`, `close_reason`, `closed_by_session` (Claude Code session id!).
- **Leasing** (migration 0054): `lease_expires_at`, `heartbeat_at` (+ internal `row_lock`).
- **Scheduling**: `due_at`, `defer_until` (hidden from `bd ready` until then).
- **External**: `external_ref`, `source_system`.
- **Extension**: `metadata` — arbitrary JSON, validated well-formed; THE sanctioned extension point (see §3.7).
- **Compaction**: `compaction_level`, `compacted_at`, `compacted_at_commit`, `original_size`.
- **Multi-repo routing (unsynced)**: `source_repo`, `id_prefix`, `prefix_override`.
- **Relational (hydrated)**: `labels[]`, `dependencies[]`, `comments[]`.
- **Messaging**: `sender`, `ephemeral` (not synced), `no_history` (wisps table but not GC-eligible; mutually exclusive with ephemeral), `wisp_type`.
- **Context markers**: `pinned` (persistent context, not work), `is_template` (read-only template molecule).
- **Molecule lineage**: `bonded_from[]` `{source_id, bond_type: sequential|parallel|conditional|root, bond_point}`.
- **Gate fields** (async coordination): `await_type` (`gh:run`, `gh:pr`, `timer`, `human`, `mail`), `await_id`, `timeout`, `waiters[]` (mail addresses notified when the gate clears).
- **Formula provenance**: `source_formula`, `source_location` (e.g. `steps[0]`).
- **Coordination typing**: `mol_type` (`swarm|patrol|work`), `work_type` (`mutex` default | `open_competition` — "many submit, buyer picks", Decision 006).
- **Operational events as beads**: `event_kind` (namespaced, e.g. `patrol.muted`, `agent.started`), `actor`, `target`, `payload` (JSON).

### 3.3 Status & priority

- Built-in statuses: `open`, `in_progress`, `blocked`, `deferred` ("on ice"), `closed`, `pinned`, `hooked` ("actively claimed by a worker"). `closed_at` iff closed is a validated invariant. A `tombstone` status exists in export schema for soft-delete with `deleted_at/by`, `delete_reason`, `original_type` (`docs/ARCHITECTURE.md:275-283`).
- **Custom statuses** (≤50) with behavior **categories**: `active` (in ready + list), `wip` (not ready, in list), `done`, `frozen` (`types.go:380-522`) — a clean pattern for letting tenants extend workflow without breaking ready-work semantics. Built-ins map: open→active; in_progress/blocked/hooked→wip; closed→done; deferred/pinned→frozen.
- Priority: fixed int 0-4 (0 critical, 1 high, 2 default, 3 low, 4 backlog).

### 3.4 Issue types

Built-in work types: `bug`, `feature`, `task` (default), `epic`, `chore`, `decision` (ADR-style, with required Decision/Rationale/Alternatives sections), `message`, `spike`, `story`, `milestone`; built-in internal: `molecule`, `gate`, `event`. Aliases normalize (`enhancement`→feature, `adr`→decision…). Custom types via `types.custom` config. Notably, a batch of orchestrator types (convoy, merge-request, slot, agent, role, rig) were **removed from core** and demoted to custom types — repeated evidence of schema-boundary discipline (`types.go:549-557`). Per-type `RequiredSections()` power `bd lint`/`--validate` (e.g. bug → "## Steps to Reproduce").

### 3.5 Dependency types — the full edge taxonomy (19 built-ins)

`internal/types/types.go:784-818`; direction is `issue_id` → `depends_on_id` ("X depends on Y" = `bd dep add X Y`).

| Group | Type | Semantics |
|---|---|---|
| **Workflow (affect `bd ready`)** | `blocks` | Y must close before X is ready |
| | `parent-child` | hierarchy; children blocked if parent blocked (structural, not a "hard blocker" badge) |
| | `conditional-blocks` | X runs only if Y **fails** — failure inferred from close-reason keywords (failed/rejected/wontfix/cancelled/timeout/… `types.go:913-943`) |
| | `waits-for` | fan-out gate: X waits for Y's (dynamic) children; metadata gate=`all-children` (default) or `any-children` |
| **Association** | `related` | soft link |
| | `discovered-from` | filed while working on parent — THE agent work-discovery edge |
| **Graph links** | `replies-to` | conversation threading (thread_id groups a conversation; BFS renders threads) |
| | `relates-to` | bidirectional see-also (via `bd relate`) |
| | `duplicates` | dup marker; duplicate auto-closed (`bd duplicate X --of Y`) |
| | `supersedes` | version chains; old auto-closed (`bd supersede old --with new`) |
| **Entity/HOP** | `authored-by`, `assigned-to`, `approved-by`, `attests` | agents/humans as first-class graph nodes; `attests` carries skill/level/evidence metadata (skill attestation, `types.go:897-911`) |
| **Cross-project** | `tracks` | convoy → issue, non-blocking |
| **Reference** | `until` | active until target closes (e.g. muted-until) |
| | `caused-by` | audit trail causality |
| | `validates` | approval/validation |
| **Delegation** | `delegated-from` | delegation chains; completion cascades up |

Custom edge types are allowed (any string ≤50 chars); commands that care restrict to well-known ones. Edges carry `created_at/by`, JSON `metadata`, `thread_id`. Messaging/link fields that used to be issue columns (replies_to, relates_to, duplicate_of, superseded_by) were consolidated INTO the dependencies table ("Decision 004, Edge Schema Consolidation", `types.go:88-89`) — one edge store, not N nullable columns.

### 3.6 Ready-work, blocking, epics

- **Ready** = status in active category, not in `blocked_issues_cache`, `defer_until` passed, not ephemeral (unless included), not excluded types (gate/molecule/etc.). Sort policies: `hybrid` (default; <48h-old issues by priority, older by age), `priority` (autonomous/CI), `oldest` (starvation-proof backlog) (`types.go:1305-1330`).
- **Blocked cache**: materialized `blocked_issues_cache` rebuilt transactionally on dependency/status change via recursive CTE (depth-capped 50); `bd ready` went 752ms → 29ms on a 10K-issue DB (25x), rebuild <50ms (`docs/INTERNALS.md §Blocked Issues Cache`). Newer: `is_blocked` column materialization (migration 0046) and paged ready counts (#4679).
- `bd ready --explain` returns machine-readable reasons ready/blocked + **cycle detection** (`ReadyExplanation`, `types.go:1027-1157`).
- **Epics**: `parent-child` + `epic_status` roll-ups (total/closed children, `eligible_for_close`); epics do NOT auto-close when the last child closes — deliberate ("close-eligible" surfaced instead, `docs/MOLECULES.md:118-120`).

### 3.7 Metadata extension contract

`metadata` JSON is the sanctioned extension point; schema changes are charter-guarded (`docs/METADATA.md`, `docs/PROJECT_CHARTER.md#schema-boundary`). Reserved prefixes `bd:` and `_`. The flagship convention: **execution hints** — `execution_agent_type`, `execution_suggested_model`, `execution_reasoning_effort` (low/medium/high/xhigh canonical scale), `execution_mode` (local/delegated/staged), `execution_parallel_group`. Rules: hints are portable capability *tiers* (consumers map to nearest native model/effort, never drop); **orchestrators must read them BEFORE spawning subagents** (model/effort fixed at launch); they refused to add a `bd plan --json` helper to keep the surface minimal (gh-3541). Queries support `--meta key=value` filtering and key-existence (`IssueFilter.MetadataFields/HasMetadataKey`).

### 3.8 Multi-agent concurrency: claim → lease → heartbeat → reclaim

- `bd update <id> --claim`: **atomic** assignee-set + status→`in_progress` (fails if already claimed).
- Migration 0054 ("Gas Station v1.1"): claims get a **lease** — `lease_expires_at` (staleness instant) + `heartbeat_at` (liveness proof); `assignee` doubles as lease owner. A reaper command (`bd reclaim`) reverts stale-leased issues to ready and logs `lease_reclaimed` events with the previous owner (`types.go:1015-1018,1332-1339`) — dead-worker recovery so a crashed agent can't strand work in `in_progress` forever.
- The `hooked` status + `work_type: mutex|open_competition` extend this into assignment models (exclusive vs. many-submit-one-wins).
- Wisps mirror lease columns purely so shared claim/heartbeat SQL binds (never reclaimed).

### 3.9 Comments, events, audit

- `comments`: id/issue_id/author/text/created_at (int64→string ID compat shim retained).
- `events`: full audit trail per issue — created/updated/status_changed/commented/closed/reopened/dependency_added/removed/label_added/removed/compacted/lease_reclaimed, with actor + old/new values.
- Separately, **operational events can be beads themselves** (type `event`, `event_kind`/`actor`/`target`/`payload`) — the audit stream and the work graph share one substrate.

---

## 4. Complete CLI surface

*(Compiled by the CLI-surface sweep; see §4.x below.)*

<!-- SECTION-4-AGENT-A -->

---

## 5. Agent-facing layer (most critical)

*(Compiled by the agent-layer sweep; §5.x below. Key first-hand additions from this audit: )*

- `bd remember "<insight>"` stores memories as **KV rows in the synced config table** (`kv.memory.<slug>` keys, `cmd/bd/memory.go`, `internal/storage/kvkeys`): auto-slugged keys (first ~8 words, ≤60 chars), `--key` for stable names, `bd memories [search]` (substring over key+value), `bd recall <key>`, `bd forget <key>`. Two notable UX guards encode real agent failure modes: a bare token matching a command name is refused ("looks like a command, not something to remember", GH#4401), and bare-slug content is treated as an intended *read* (recall) rather than storing a junk memory — "remember X reads as a getter in English, so agents routinely type `bd remember some-key` meaning 'do you remember X?'" (`memory.go:149-177`). Memories are project-scoped, shared across all agents via Dolt sync, and plain text — **no embeddings, no vector search; recall is exact-key or substring, injection is wholesale at prime time.**
- `bd prime` injects memories with **context-budget caps**: `--max-memories N` / `--max-memory-chars` (config `prime.max-memories`/`prime.max-memory-chars`), applied at whole-memory boundaries, plus a truncation directive telling the agent to read the full persisted hook output if its host truncated the preview (`cmd/bd/prime.go:111-120,346`). Built for exactly the chat-host constraint Orvex has.

<!-- SECTION-5-AGENT-B -->

---

## 6. Research & rationale (design docs, benchmarks, changelog archaeology)

<!-- SECTION-6-AGENT-C -->

---

## 7. Dolt specifically

### 7.1 Exact role today

- **Dolt is the only storage backend** — not optional, not federation-only. Embedded (CGO, in-process) is the default; server/shared/proxied modes exist for multi-writer (`docs/DOLT.md`, §2.1 above). SQLite is a legacy migration source only.
- What beads gets from Dolt: (1) automatic per-write commit history = free audit/time-travel (`bd vc log/diff`, `dolt blame`); (2) native push/pull sync incl. via plain git remotes (`refs/dolt/data`); (3) cell-level 3-way merge for offline/concurrent edits; (4) branching (used lightly; `bd branch`, sync-branch mode for protected branches); (5) MySQL-compatible SQL (`bd query`, `bd sql`).
- Federation (`docs/FEDERATION.md`, `internal/storage/federation.go`, `federation_peers` table): peer-to-peer sync between independent workspaces ("towns") via `bd federation add-peer/sync/status`, AES-256-encrypted stored credentials, built on the same Dolt remote machinery.

### 7.2 Costs beads pays for Dolt (evidence in-repo)

1. **No row locking → lost-update hazard**: the `row_lock` synthetic-conflict hack (migration 0054, §2.5) to make heartbeat-vs-close concurrent writes conflict instead of silently cell-merging.
2. **Distributed schema migration is the #1 breakage source**: v1.1.0's entire theme; "exactly one designated clone" migration rule; remote-migrate gate with `BD_ALLOW_REMOTE_MIGRATE`/`BD_SMART_GATE`; repair-in-runner because "a failing migration can never be fixed forward by a later migration file"; bricked-DB recovery gates (#4502/#4555/#4566/#4567, `CHANGELOG.md`).
3. **CGO requirement** for embedded mode (build/distribution complexity: goreleaser matrix, AV false positives on Windows, 50MB binary — the checked-in `bd` binary is 50.5MB).
4. **Operational sprawl**: PID/port/lock files, circuit breakers for downed servers (`internal/storage/dolt/circuit.go`), split-brain guidance when two servers own one DB name (`docs/DOLT.md §Standalone-to-managed-city handoff`), auto-commit disabled under concurrency.
5. Working-set/migration deadlocks (dirty working set blocks migration; recovery command itself hit the same guard — #4566).

### 7.3 Scale posture

- In-repo evidence targets **10K-100K issues per workspace**: blocked-cache numbers at 10K (§3.6), "future optimizations if >100K" (`docs/INTERNALS.md:320-325`), collision math sized for small hex IDs, performance-testing docs. This is a per-project/laptop envelope, not a multi-tenant SaaS envelope — consistent with our separate Dolt-at-scale research track.

### 7.4 Verdict for Orvex

Dolt is beads' answer to "distributed, offline, git-adjacent, zero-server" — constraints Orvex's hosted service does not have. Orvex gets Dolt's actual benefits cheaper on Postgres: audit/time-travel via an event/audit table (or temporal tables) on the Kafka spine; concurrency via real transactions/row locks; no distributed schema migration. The only genuinely Dolt-native capability without a direct Postgres analog is decentralized peer federation with cell-level merge — not a v1 requirement for a centralized multi-tenant service.

---

## 8. Port map for Orvex Studio

**Legend:** KEEP = reimplement the concept ~as-is on our stack · ADAPT = keep the intent, redesign the mechanism for hosted/multi-tenant/chat-first · DROP = do not build · DEFER = revisit post-v1.

| Beads concept | Verdict | Orvex form |
|---|---|---|
| Issue graph as memory substrate (one `issues` table, typed edges) | KEEP | memory items in Postgres; start with 4 edge types (`blocks`, `related`, `parent-child`, `discovered-from`) of beads' 19 — the only ones its own agent rituals lean on |
| `bd ready` (unblocked-work computation) | KEEP | server-side ready query per workspace (denormalized blocked flag + recompute job — beads' own `is_blocked`/`recompute-blocked` lesson) |
| Atomic claim + lease/heartbeat/reclaim | KEEP | claim/heartbeat/reclaim MCP tools + CLI verbs; lease TTL + reaper job — the multi-agent concurrency core |
| `bd prime` session-start context injection | ADAPT | a `prime` MCP tool + server `instructions` string, compact (~50–200 tok) vs full mode; chat portals get it via system-prompt packs since they have no hooks |
| `bd remember`/`recall` persistent memories | KEEP | per-workspace KV memories with injection caps (max-memories/max-chars — hosts truncate silently) |
| Session-close protocol ("landing the plane") | ADAPT | prompt-pack checklist gated on the agent's own completion language ("before saying done…") + a close-with-claim-next chaining tool |
| Host hooks (SessionStart/PreCompact/PostCompact) | REDESIGN | ChatGPT-style portals have no hook system: rely on MCP `instructions`, tool-description engineering, and portal-side prompt injection |
| MCP context-budget levers (lazy `discover_tools`, `brief=true`, result-compaction threshold) | KEEP | core MCP design from day one — beads measured 10–50k tokens for eager schemas vs ~500 bytes lazy |
| LLM compaction of closed items (30d Haiku summarize; 90d tier-2) | KEEP | scheduled compaction with restore-from-history; tenant-tunable windows |
| Adaptive hash IDs (4→8 chars by collision probability) | KEEP | same math, per-workspace prefix |
| `bd batch` (N ops, one transaction) | KEEP | batch write endpoint — beads built it purely to stop agent-loop write amplification |
| Comments/notes as durable handoff ("so nobody reads the transcript") | KEEP | comment + append-note tools with the compaction-survival note template (COMPLETED/IN PROGRESS/NEXT/KEY DECISION/BLOCKER) |
| `bd audit` interactions log | KEEP | server-side audit events on the studio spine (CloudEvents give us this ~free) |
| `bd doctor --agent` (observed/expected/remediation tuples) | ADAPT | diagnostics endpoint returning structured findings |
| Dolt storage, git remotes, JSONL export/sync | DROP | Postgres + audit/event history (§7.4); export via API |
| Federation / multi-remote DR | DROP (v1) | cross-workspace sharing via ACLs later; no peer-to-peer sync in a centralized SaaS |
| Daemon / db-proxy / server lifecycle | DROP | we ARE the server |
| Molecules/formulas/wisps, gates, swarm, merge-slot, mail | DEFER | orchestration-layer per beads' own PROJECT_CHARTER boundary; revisit only with a concrete Studio workflow driver |

**Recommended v1 subset:** items + 4 edge types; ready/claim/heartbeat/reclaim; remember/recall with injection caps; prime (compact+full); comments/notes; close+claim-next; batch; stats/blocked; tier-1 compaction; adaptive IDs; audit events. MCP first, CLI parity second — both as new sections of the existing Studio MCP server and CLI.

**Top risks:**
1. **No hooks on chat platforms** — beads' context-recovery story rides SessionStart/PreCompact hooks; portals must reproduce it with prompts alone (MCP `instructions` + a cheap `prime` tool the portal system prompt mandates at session start).
2. **Prompt-adherence decay** — "landing the plane" only works if the model actually runs it; measure close-rate/claim-staleness per tenant and tune the prompt pack (the per-customer tweakable analog of `.beads/PRIME.md`).
3. **Concurrency** — beads abandoned branch-per-worker for all-on-main + transaction discipline on the Dolt founder's advice; we start there (Postgres row locks) and never introduce per-agent branches.
4. **Scope creep into orchestration** — beads deleted `bd mail` for this exact reason; our charter: memory/coordination data plane only, workflow engines live elsewhere in Studio.

**Open questions for the PRD:** tenancy grain (workspace vs project); retention/decay defaults per plan tier; whether a `published`-style intermediate visibility applies to memories; quota model (items? edges? injected tokens?); relationship to the existing `ai_memories` (orvex-studio-ai) and Memory FormSpec (orvex-studio-api) — supersede vs delegate (see wiki-canon-map.md).
