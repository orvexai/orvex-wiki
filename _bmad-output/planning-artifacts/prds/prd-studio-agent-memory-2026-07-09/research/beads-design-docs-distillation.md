# Beads Repo — Design/Research Corpus Distillation

Read-only pass over `/home/daniel/repos/beads`. No files modified. All paths below are absolute.

---

## 1. Design docs inventory (`docs/design/`)

| File | Distillation |
|---|---|
| `/home/daniel/repos/beads/docs/design/dolt-concurrency.md` | **Implemented** (2026-02-22, live 2026-02-24). Retires the branch-per-worker Dolt concurrency model — it "worked" (50 concurrent writers, 250 commits, 100% success in tests) but the wins were **illusory**: workers couldn't see each other's beads until merge, breaking cross-agent coordination. Replaces it with "all-on-main + explicit SQL transaction wrapping `CALL DOLT_COMMIT`" per direct guidance from Tim Sehn (Dolt co-founder): *"far simpler to use one branch... hundreds of transactions per second on a single branch."* Documents Dolt's two concurrency layers (MVCC SQL transactions with cell-level 3-way merge; a serialized commit-graph layer) and a 3-phase migration plan (add transaction discipline → remove branch-per-worker in the orchestrator → retire branch infra). Explicitly scoped to **server mode only**; embedded mode is single-writer and unaffected. |
| `/home/daniel/repos/beads/docs/design/kv-store.md` | **Draft**, pending Dolt team review (2026-01-21). Design for `bd kv set/get/delete/list` — a lightweight, unversioned-feeling key-value store (`kv` Dolt table: key/value/set_at/set_by) for feature flags and agent-memory-style metadata, deliberately kept separate from both the `config` table (internal settings) and issues (too heavyweight, wrong lifecycle). Syncs via `.beads/kv.jsonl` export/import with last-write-wins on `set_at`. Explicitly credits community PR #1164 as inspiration. |
| `/home/daniel/repos/beads/docs/design/otel/otel-architecture.md` | Full OpenTelemetry architecture: backend-agnostic OTLP emission (VictoriaMetrics is just the dev default), best-effort/never-fatal telemetry init, and a maturity roadmap (Tier 1–3) showing large gaps — **`internal/doltserver/` has zero OTel instrumentation** (server crashes/restarts are silent), and the `bd.db.lock_wait_ms` histogram is registered but its `.Record()` is never called anywhere in the code. Notable for an **"Appendix: Source Reference Audit"** that pins every claim to an exact file:line against a specific commit (`main@371df32b`) — a deliberate anti-drift mechanism. |
| `/home/daniel/repos/beads/docs/design/otel/otel-data-model.md` | Companion schema doc (**"Last reviewed: 2026-05-08"**) enumerating every span/metric/attribute Beads emits (`bd.command.*`, `storage.*`, `dolt.*`, `hook.exec`, `anthropic.messages.new`), with the same file:line audit-table discipline as the architecture doc. |

---

## 2. ADR log (`docs/adr/`)

Only two ADRs exist.

**ADR-0001 — Multi-Remote Approach** (`/home/daniel/repos/beads/docs/adr/0001-multi-remote-approach.md`, Accepted 2026-04-07)
- **Decision**: phased rollout. Phase 1 ("tracer bullet"): expose Dolt's native multi-remote via a `--remote` flag on `bd dolt push` (push-only mirrors, manual `bd dolt remote add`, ambient env-var credentials, no config changes). Phase 2 (not yet built): config-driven `federation.additional-remotes` list plus a new `SyncOrchestrator` component for sequential ordered pushes (primary first, then mirrors) with partial-failure-as-warning semantics.
- **Rationale**: backup redundancy (DoltHub + Azure/S3/GCS/local simultaneously), data sovereignty routing, incremental risk (validate before investing in orchestration).
- **Rejected alternatives**: (B) remote-list-with-roles — rejected as a breaking config migration with unclear authority; (D) push-hook/middleware — rejected because fire-and-forget is wrong for data replication and it's a layering violation.
- **Design principle carried through**: the primary remote is **always** pull-authoritative; mirrors are push-only, and failover to a mirror is a manual, explicit, auditable operator action — never automatic.
- Driven by a spike (bd-qky) and a council review that returned 49 findings with a "Request Changes" verdict before this phased shape was accepted.

**ADR-0002 — `bd init` safety invariants** (`/home/daniel/repos/beads/docs/adr/0002-init-safety-invariants.md`, Accepted 2026-04-24)
- **Decision**: five invariants for `bd init`: (1) single-source identity resolution — refuse when local data and remote Dolt history are both plausible candidates and no flag names a winner; (2) `--force`/`--reinit-local` is scope-bound to *local* data safety only, never remote divergence, unless `--discard-remote` is also passed; (3) every remote-touching flag routes through one executable chokepoint (`CheckRemoteSafety`) with a mandatory guard-matrix test; (4) **error-text-no-echo** — no error output may contain a complete copy-pasteable destructive command; (5) race-safety — re-verify remote state between confirm and execute.
- **Rationale**: `bd init --force` in a repo whose origin already had `refs/dolt/data` silently produced an orphan Dolt history that failed to push, and git-log archaeology found **eight prior commits** that each patched one narrow surface of this same failure class without ever encoding the underlying invariant — the `--force` flag lived in global scope and every future guard silently inherited it as a bypass.
- **The triggering incident**: an AI agent copy-pasted the tool's own suggested `bd init --force --destroy-token=<hash>` one-liner straight from an error message and destroyed 247 issues (commit `58f5989bf`). ADR text: *"The agent's behavior was rational for the error it read; the text was the bug."*
- New stable, grep-safe exit codes: `10 ExitRemoteDivergenceRefused`, `11 ExitLocalExistsRefused`, `12 ExitDestroyTokenMissing`.
- **Rejected alternatives**: symmetric `--take-local`/`--take-remote` flags (rejected — hides a real asymmetry in blast radius); typed remote-URL confirmation instead of destroy-token (rejected — surface bloat, a token convention already existed); folding `bd bootstrap` into `bd init --adopt-remote` (rejected — breaks existing muscle memory for no benefit).

---

## 3. Benchmark numbers (`/home/daniel/repos/beads/BENCHMARKS.md`)

**Dataset sizes**: `large.db` = 10,000 issues (16.6 MB), `xlarge.db` = 20,000 issues (generated on demand), cached at `/tmp/beads-bench-cache/`.

**Typical results (M2 Pro)**:

| Operation | Time | Memory | Notes |
|---|---|---|---|
| GetReadyWork (10K) | 30ms | 16.8MB | Filters ~200 open issues |
| Search (10K, no filter) | 12.5ms | 6.3MB | Returns all open issues |
| Cycle Detection (5000 linear) | 70ms | 15KB | Detects transitive deps |
| Create Issue (10K db) | 2.5ms | 8.9KB | Insert into index |
| Update Issue (10K db) | 18ms | 17KB | Status change |
| Large Description (100KB) | 3.3ms | 874KB | String handling overhead |
| Bulk Close (100 issues) | 1.9s | 1.2MB | 100 sequential writes |
| Sync Merge (20 ops) | 29ms | 198KB | Create 10 + update 10 |

**Regression-tracking before/after set** (May 2026 Dolt hot-path optimization pass, measured `-benchtime=1x -benchmem -count=1` on the same host):

| PR / change | Before | After | Time gain | Alloc gain |
|---|---|---|---|---|
| #3967 label/type search (5K) | 134.8 ms | 51.8 ms | 61.6% | −0.1% |
| #3967 invalid partial-ID fallback | 124.3 ms | 22.5 ms | 81.9% | 43.6% |
| #3966 dependency cycle check (diamond DAG) | 80.0 ms | 25.8 ms | 67.7% | 1.4% |
| #3968 limited ready work (large blocked graph) | 1677.4 ms | 341.7 ms | 79.6% | 85.4% |
| #4001 deferred-parent exclusion (5K) | 3257.3 ms | 130.8 ms | 96.0% | 83.1% |
| #4002 active blocked-dependency scan | 44.3 ms | 36.2 ms | 18.1% | 96.0% |
| #4003 primary-issue-first lookup | 9.0 ms | 6.4 ms | 28.7% | 10.7% |

**Comparisons/targets**: performance issues are said to manifest only at 10K+ scale, hence benchmark sizing; targets in `/home/daniel/repos/beads/docs/PERFORMANCE_TESTING.md` are GetReadyWork < 50ms and SearchIssues < 100ms on a 20K DB, CreateIssue < 10ms. Additional production-shaped scripts exist (`scripts/repro-dolt-prod-timeouts`, `scripts/bench-ready-indexes`) for CLI-timeout and index experiments against a live Dolt DSN.

---

## 4. Collision math summary (`/home/daniel/repos/beads/docs/COLLISION_MATH.md`)

- **Alphabet**: lowercase alphanumeric `[a-z0-9]` = 36 characters (chosen over hex-16 because 4-char alphanumeric ≈ 6-char hex capacity, and it's more readable/typeable).
- **Birthday-paradox formula**: `P(collision) ≈ 1 − e^(−n²/2N)`, where `n` = issue count, `N` = `36^length`.
- **ID space size by length**: 3-char = 46,656; 4-char ≈ 1.7M; 5-char ≈ 60M; 6-char ≈ 2.2B; 7-char ≈ 78B; 8-char ≈ 2.8T.
- **Representative collision probabilities**: at 500 issues, 4-char ≈ 7.17%, 5-char ≈ 0.21%; at 5,000 issues, 4-char ≈ 99.94% (essentially guaranteed), 5-char ≈ 18.68%, 6-char ≈ 0.57%; at 10,000 issues, 5-char ≈ 56.26%, 6-char ≈ 2.27%, 7-char ≈ 0.06%.
- **Adaptive growth thresholds** (default max-collision-probability = 25%, configurable via `bd config set max_collision_prob`): 0–500 issues → 4 chars; 501–1,500 → 5 chars; 1,501–5,000 → 5 chars (18.68% at the top of that band); 5,001–15,000 → 6 chars; 15,001+ continues scaling. Alternate presets: **Conservative** (10% threshold: 4-char to 200, 5-char to 1,000, 6-char to 5,000) and **Aggressive** (50% threshold: 4-char to 500, 5-char to 2,000, 6-char to 10,000).
- **Collision resolution**: on an actual hash collision, retry same length with a new nonce (10 attempts), then length+1 (10 attempts), then length+2 (10 attempts) — 30 total attempts before hard failure.
- Cross-referenced by and consistent with `/home/daniel/repos/beads/docs/ADAPTIVE_IDS.md`, which adds the operational config surface (`min_hash_length` default 4, `max_hash_length` default 8) and notes the mechanism is ~10ns/call for the probability calc, ~300ns for ID generation — i.e., essentially free — and that it coexists with an alternative sequential-counter ID mode (`issue_id_mode=counter`) for teams that prefer human-readable numbering over collision-free hashes.

---

## 5. External writing (`ARTICLES.md`, `NEWSLETTER.md`)

`/home/daniel/repos/beads/ARTICLES.md` catalogs Steve Yegge's own Medium series (*Introducing Beads*, *The Beads Revolution* — built in 6 days using Claude, *Beads Blows Up*, *Beads Best Practices*, *Beads for Blobfish*, *The Future of Coding Agents*, *Welcome to Gas Town*) plus six community pieces (an nvim plugin, a Better Stack guide, several posts by "Paddo" tying Beads to Anthropic's agent-memory work and to "Gas Town"). The file explicitly warns that "the development pace of Beads is very fast and it's easy for offsite content to become outdated."

`/home/daniel/repos/beads/NEWSLETTER.md` currently holds a single dated entry — **v0.62.0, "Standalone & The Road to 1.0"** (2026-03-21). Key claims: this release is where beads became fully decoupled from Gas Town (removed GUPP references, polecat/crew/overseer terminology, HOP schema fields, the agent-as-bead subsystem, patrol-molecule references, hardcoded `~/gt/` paths); embedded Dolt was "the last major gate before v1.0.0," with 73 DoltHub-contributed commits landing that release; a new `issueops` package now shares transaction logic between server and embedded backends; and `BD_ACTOR` was deprecated in favor of `BEADS_ACTOR` (flagged as the release's one breaking change).

---

## 6. Proposal: pull-config wedge (`/home/daniel/repos/beads/PROPOSAL-pull-config-wedge.md`)

**Problem**: `bd dolt pull` permanently fails with `cannot merge with uncommitted changes` in server mode once a user has ever run `bd remember` (persistent-memory storage). Root cause is two independently-correct prior fixes colliding: (1) `bd remember` stores memories as `kv.memory.<slug>` rows in the **synced** `config` table; (2) `Commit()` was deliberately changed (GH#2455) to exclude `config` from `DOLT_COMMIT -Am` after an earlier bug where it swept in concurrent `issue_prefix` writes; (3) but the pre-pull auto-commit step (GH#2474, in both `pullFromRemote` and federation's `PullFrom`) calls that same `Commit()`, so memory rows never get committed and permanently leave `config` dirty — and `DOLT_MERGE` refuses to start on any dirty working set.

**Proposal**: swap the two pre-pull call sites to use the existing `CommitWithConfig` (already used by `bd dolt commit`) instead of `Commit`, so `config` is included in the pre-pull commit without reintroducing the original `issue_prefix` race (the pre-pull commit is an explicit, single-clone operation, not a concurrent auto-commit). Empirically validated end-to-end on a live production DB (Wyvern) with no source change — manually committing `config` broke the wedge and pulls succeeded repeatably afterward. Includes an optional hardening follow-up (teach `TryAutoResolveMergeConflicts` to auto-resolve convergent `config`/`kv.memory.*` conflicts, matching existing `metadata`-table handling) and explicitly rejects moving memories to a `dolt_ignore`'d table (would silently stop them from syncing, which defeats their purpose).

---

## 7. Federation & multi-repo model

Two genuinely different systems share the word "federation"/"multi-repo" in this codebase — worth keeping distinct:

### 7a. Federation — cross-workspace/cross-org peer sync
Source: `/home/daniel/repos/beads/docs/FEDERATION.md`, `/home/daniel/repos/beads/FEDERATION-SETUP.md` (a 3-line stub that now just points at `docs/FEDERATION.md`, kept only for stable inbound links).

- **What federates**: independent Beads workspaces/teams/orgs ("towns"), each with its own Dolt database.
- **How**: pure Dolt remotes (`bd federation add-peer <name> <endpoint>`, supporting `dolthub://`, `gs://`, `s3://`, `file://`, `https://`, `ssh://`, and git-SSH-shorthand endpoints), not a custom protocol. `bd federation sync` does fetch → status → merge → conflict-resolve → push per peer; `bd federation status` checks ahead/behind/reachability without transferring data. Conflict strategy defaults to pause-and-report; `--strategy theirs|ours` forces resolution.
- **Topologies supported**: hub-spoke, mesh, hierarchical (documented patterns, not enforced by code).
- **Data sovereignty**: four tiers (T1 unrestricted → T4 anonymous) settable per federation config, for GDPR/regional-compliance routing.
- **Credentials**: peer credentials are AES-256-encrypted at rest, used automatically during sync.
- **Provenance**: every issue tracks `SourceSystem` so cross-org attribution/trust chains are preserved.
- **Server-mode topology**: two ports — 3306 (MySQL protocol, multi-writer SQL) and 8080 (remotesapi, peer push/pull).
- **Maturity**: peer CRUD, bidirectional `sync`, and `status` are implemented and documented as working. `bd federation push <peer>` / `pull <peer>` (single-direction) have backing infrastructure but are **not yet exposed as commands** — explicitly called out as a documented gap. Requires the Dolt backend (the only backend now); connectivity is validated lazily on first push/pull, not at `add-peer` time.

### 7b. Multi-remote (ADR-0001) — backup/DR for the *primary* remote
Distinct from peer federation: this is about the single `federation.remote` primary sync target optionally fanning a push out to backup mirrors (Azure/S3/GCS/local) for disaster recovery, not about collaborating with other orgs. See ADR log above — Phase 1 (manual `--remote` flag) is what's shipped; Phase 2 (config-managed `additional-remotes` + `SyncOrchestrator`) is designed but not built.

### 7c. Multi-repo / routing — same-user, same-team, local repo selection
Source: `/home/daniel/repos/beads/docs/MULTI_REPO_AGENTS.md`, `/home/daniel/repos/beads/docs/ROUTING.md`, `/home/daniel/repos/beads/docs/REPO_CONTEXT.md`, `/home/daniel/repos/beads/docs/CONTRIBUTOR_NAMESPACE_ISOLATION.md`.

This solves a different problem: an OSS contributor's personal planning issues (`bd create "fix tests before lunch"`) leaking into upstream PR diffs when they use `bd` on the project's own self-hosted `.beads/` — a "recursion problem unique to self-hosting projects." `CONTRIBUTOR_NAMESPACE_ISOLATION.md` walks four solution candidates (contributor-prefix namespacing, separate `BEADS_DIR` database, issue-visibility flags, and **auto-routing by detected role** — the one adopted) and settles on: detect maintainer (SSH push access) vs contributor (HTTPS fork) via `git config beads.role` or push-URL inspection, then route new issues to `.` (maintainer) or `~/.beads-planning` (contributor) automatically. `bd init --contributor` sets up both `routing.mode=auto` and the matching `repos.additional` hydration entry in one step, since routed issues are otherwise invisible to `bd list` without hydration. `discovered-from` dependencies inherit the parent's `source_repo`; `--repo` always overrides auto-routing explicitly. `REPO_CONTEXT.md` documents the low-level plumbing this all sits on — a `RepoContext` API (`GitCmd()` vs `GitCmdCWD()`) that correctly resolves which physical repo git commands should run in across three orthogonal complications (BEADS_DIR redirect, git worktrees, and CWD-vs-.beads-location mismatch), with security mitigations (disables git hooks/templates on `GitCmd()` to avoid executing an untrusted repo's hook scripts) and a path-boundary check against system directories.

**One temporal wrinkle worth flagging**: `CONTRIBUTOR_NAMESPACE_ISOLATION.md` (dated 2025-12-30) explicitly documents actual routing in `bd create` as **not yet implemented** at time of writing (`cmd/bd/create.go:181` — "TODO(bd-6x6g): Switch to target repo for multi-repo support... For now, we just log the target repo in debug mode"). `ROUTING.md`/`MULTI_REPO_AGENTS.md` (undated, but reference a `routing.*` config-key rename that the isolation doc's own troubleshooting section says landed in v0.48.0 — i.e., later) describe routing as fully functional. Read together, this looks like a closed gap rather than a live discrepancy, but it's a good example of design docs describing a target state ahead of the code, later caught up by shipped work.

---

## 8. Project charter boundaries (`/home/daniel/repos/beads/docs/PROJECT_CHARTER.md`)

Explicit statement: *"Beads is a focused issue tracker for AI-supervised development. It should stay small enough to remain reliable, understandable, and composable."* Four hard fences:

1. **Orchestration boundary** — Beads must never encode orchestration-layer concepts (agent routing, task-assignment strategy, model choice, retries, scheduling, workflow semantics) in core, even though systems like "Gastown, Gas City, schedulers, swarms, release coordinators" build on top of it. When orchestration needs extra per-issue data, **metadata first**, before new fields/commands.
2. **Storage boundary** — Beads is not allowed to become a storage engine; Dolt owns storage/versioning/sync/merge/concurrency/crash-safety, and this is **mechanically enforced**, not just aspirational: a `depguard` rule in `.golangci.yml` denies `github.com/dolthub/` imports outside `internal/storage/` and `internal/doltserver/`, with a documented, narrow exception list (proxied-server surface, DoltHub's `eventkit` telemetry client).
3. **Schema boundary** — the DB schema is "considered stable"; new needs should default to issue metadata (JSON) unless the field has broad, durable meaning across all of Beads and migration cost is justified.
4. **Integration boundary** — tracker integrations (GitHub/GitLab/Jira/Linear/ADO) are adoption bridges that map external data into Beads concepts; they must not replicate tracker UIs, notification systems, credential vaults, webhook gateways, or cross-tracker automation (detailed further in `/home/daniel/repos/beads/docs/INTEGRATION_CHARTER.md`).

**Review posture** is notably non-reflexive: maintainers are told to identify the contributor value first and prefer *absorb, transform, simplify, or reroute* (to metadata/integration/plugin/external tool) over rejecting boundary-crossing PRs outright, while preserving attribution.

---

## 9. Philosophy & mechanism docs — durable lessons (skimmed per instructions)

- **UI Philosophy** (`/home/daniel/repos/beads/docs/UI_PHILOSOPHY.md`): Tufte-inspired "maximize data-ink ratio" — color only navigation landmarks, scan targets, and semantic state (Pass/Warn/Fail/Accent/Muted/Command tokens), never decoratively; all colors are Lipgloss `AdaptiveColor` pairs (light/dark) from the Ayu theme, centralized in `internal/ui/styles.go`.
- **Testing Philosophy** (`/home/daniel/repos/beads/docs/TESTING_PHILOSOPHY.md`): explicit test pyramid (80% unit/<5s, 15% integration/<30s, 5% E2E). Durable rule of thumb: target a 0.5:1–1.5:1 test-to-code ratio (beads sits at 0.85:1, called "healthy"); 2:1+ is flagged as "over-engineered, maintenance burden." Explicit anti-patterns: trivial-assertion tests, duplicate error-path testing instead of table-driven tests, un-mocked I/O-heavy unit tests, testing implementation instead of behavior, missing boundary tests.
- **Error Handling** (`/home/daniel/repos/beads/docs/ERROR_HANDLING.md`, "Last reviewed: 2026-07-07"): codifies exactly three patterns — (A) `return HandleError(...)` through `RunE` for fatal errors (never raw `os.Exit` inside a handler, because that skips deferred cleanup *and* the per-command metrics-flush event); (B) `Warning:`-prefixed warn-and-continue for optional/auxiliary operations; (C) silent `_ = op()` for best-effort cleanup. Draws a sharp, reusable distinction between **configuration metadata** (must be Pattern A/fatal — e.g. `issue_prefix`, `sync.branch`) and **tracking metadata** (Pattern B/warn — e.g. `bd_version`, `repo_id`, `last_import_hash`), because the two look superficially identical but have opposite failure-mode requirements.
- **Adaptive IDs** (`/home/daniel/repos/beads/docs/ADAPTIVE_IDS.md`) — covered in §4 above.
- **Exclusive Lock Protocol** (`/home/daniel/repos/beads/docs/EXCLUSIVE_LOCK.md`): a cooperative, non-cryptographic `.beads/.exclusive-lock` JSON file (holder/pid/hostname/started_at/version) that lets an external tool (CI, a deterministic executor) tell the Dolt server to skip a database entirely. Explicitly **not** mutual exclusion between multiple external tools, not ACID, not a security mechanism. Stale-lock detection is deliberately conservative: only removes a lock when it can prove the PID is dead on a *matching hostname* (ESRCH); an EPERM (can't signal) or a different-hostname lock is always treated as valid, since the server has no way to verify a remote process.
- **Observability** (`/home/daniel/repos/beads/docs/OBSERVABILITY.md`): telemetry is opt-in and zero-overhead when unset (no-op providers, no allocation on hot paths) — one env var (`BD_OTEL_METRICS_URL`) is enough to activate it end to end.
- **Performance Testing** (`/home/daniel/repos/beads/docs/PERFORMANCE_TESTING.md`): `bd doctor --perf` is the *user-facing* diagnostic surface, generating a shareable `.prof` file for bug reports — a deliberate bridge between internal benchmarking and external bug triage.

---

## 10. Staged-for-removal — what's being abandoned and why (`/home/daniel/repos/beads/docs/staged-for-removal/`)

`/home/daniel/repos/beads/docs/staged-for-removal/MANIFEST.md` documents an actual **doc lifecycle policy**: docs get staged (moved, not deleted) when they fail an "active-doc evidence bar," get a documented rescue path (which canonical doc should absorb any still-true paragraphs), and — if nobody rescues anything within a window — get deleted. All 11 entries were staged 2026-05-08, re-reviewed 2026-07-07 with **zero rescue activity**, and are scheduled for deletion **2026-09-09**.

| Staged doc | Why staged |
|---|---|
| `DOLT-BACKEND.md` | Duplicate of `docs/DOLT.md`; contains unsupported/stale env-var names (e.g. `BEADS_DOLT_SERVER_PASS`). |
| `README_TESTING.md` | Overlaps `TESTING.md`/`TESTING_PHILOSOPHY.md`; describes a `go test -short`/`-tags=integration` workflow that isn't the current canonical agent workflow. |
| `RELEASING.md` (docs copy) | Duplicates the root `RELEASING.md`, which is the maintained copy; had drifted. |
| `GETTING_STARTED_ANALYSIS.md` | One-shot, dated (2026-04-05) audit report, not living guidance. |
| `audit-sync-mode-complexity.md` | Same pattern — point-in-time architecture audit, no freshness mechanism. |
| `pr-752-chaos-testing-review.md` | Tied to one historical PR, not standing testing policy. |
| `dev-notes/ERROR_HANDLING_AUDIT.md`, `MAIN_TEST_CLEANUP_PLAN.md`, `MAIN_TEST_REFACTOR_NOTES.md`, `MANUAL_GITHUB_GIT_REMOTE_TEST.md`, `TEST_SUITE_AUDIT.md` | Historical, resolved, or file/line-specific audit snapshots — stale by construction. |

Notable content still visible in the staged copies (all read/skimmed):
- **`DOLT-BACKEND.md`**: still-useful operational detail not yet ported to `DOLT.md` — a macOS "why not `brew services start dolt`" gotcha (Homebrew's formula runs `dolt sql-server` *without* `--config`, so config-file edits silently have no effect; fix is a hand-written LaunchAgent).
- **`audit-sync-mode-complexity.md`** (2026-03-04): finds the old multi-mode sync architecture (git-portable / belt-and-suspenders / dolt-native) had already collapsed to a single hardcoded mode, but the `SyncMode` type/validation/config scaffolding (~80 lines + ~100 lines of tests) survived as **dead weight for a mode enum with exactly one legal value** — flags federation peer system, conflict/field-merge strategies, sovereignty tiers, and the tracker `SyncEngine` as clean/appropriately-complex by contrast (no action recommended).
- **`GETTING_STARTED_ANALYSIS.md`** (2026-04-05): quantifies getting-started docs as **~3x longer than necessary** — of ~1,600 lines across README/QUICKSTART/INSTALLING/SETUP, roughly 28% is workarounds for fixable tool UX bugs (PATH issues, CGO/ICU build pain, Windows Controlled-Folder-Access hangs that should error instead of hanging forever, a locked-database error that should name the holding PID, a stale circuit-breaker state file that should self-clear). Core thesis: *"fix the tool, delete the docs."*
- **`pr-752-chaos-testing-review.md`**: a deliberated "is this testing investment worth the ongoing tax?" review (not a reflexive merge/reject) for a chaos-testing PR that already found two real migration bugs (021/022 column-clobbering) — resolved as "merge with modifications" (no hard CI coverage gate; chaos tests gated to release branches only) once the team judged Beads had crossed from "prototype" into "dogfooded, corruption-is-expensive" territory.
- **`dev-notes/MAIN_TEST_REFACTOR_NOTES.md`**: documents a **failed** refactor attempt — converting `main_test.go`'s legacy auto-flush tests to share one DB (the pattern that gave 10x/4x/3x speedups elsewhere) caused real deadlocks (`sql.DB.Close()` blocking against a concurrent `flushToJSONL()`) because those tests manipulate package-level globals (`isDirty`, `flushTimer`, `store`, `storeMutex`) — the shared-DB pattern does not generalize to tests exercising global mutable state, only to pure-CRUD command tests.

---

## 11. Changelog cadence, eras, and breaking transitions (`/home/daniel/repos/beads/CHANGELOG.md`, 336KB)

**Cadence**: 117 `## ` headers total = 1 `[Unreleased]` + **113 tagged releases** + 3 trailing meta-sections (`Version History`, `Upgrade Guide`, `Future Releases`). First dated release: **0.9.0 — 2025-10-12** ("Pre-release polish and collision resolution"; `0.1.0` "Initial Development" predates any date). Latest tagged release: **1.1.0 — 2026-07-04**, with an active `[Unreleased]` section beyond it. That's **113 releases in ~9 months**, heavily bursty rather than evenly spaced — e.g. five patch releases (0.55.0–0.55.4) all landed **2026-02-20**, and 0.9.9/0.9.10/0.9.11/0.10.0 all landed within a 3-day window in October 2025. This cadence is itself characteristic of the project's own thesis (an AI-agent-supervised tool, iterated on largely by agents).

**Major eras, in order**:

1. **SQLite era / JSONL-as-source-of-truth** (v0.1.0–~v0.50): SQLite is the storage backend; JSONL (`issues.jsonl`) is explicitly the git-tracked *source of truth*, SQLite an ephemeral cache rebuilt from it.
2. **Daemon era** (introduced v0.9.8, "Daemon mode, git sync, compaction"; later made per-project, then had a **BREAKING** removal of global-daemon-socket fallback around v0.20/0.21) — a long-lived background-service architecture that was ultimately abandoned entirely.
3. **Wisps / molecules / chemistry metaphor** (~Dec 2025, v0.33–v0.36): ephemeral "wisp" issues (renamed from "ephemeral" — a **breaking JSON field rename**, `ephemeral`→`wisp`), `bd pour`/`bd wisp create`/`bd mol squash`/`bd mol bond`, a full "solid→liquid→vapor" phase metaphor, plus a declarative Formula system (`bd cook`) and Gate coordination primitives.
4. **Messaging** (v~0.36–0.37, `bd-kwro` epic): first-class `message` issue type, `sender`/`replies_to`/`relates_to`/`duplicate_of`/`superseded_by` fields, and `bd mail send/inbox/read/ack/reply` commands — **then reversed** shortly after (see §12).
5. **The Dolt migration** (began v0.55.0, Feb 2026; SQLite backend **fully removed** at **v0.58.0** "the SQLite storage layer and all migration infrastructure have been removed. Dolt is the only backend"; embedded-Dolt-by-default and stated-complete at **v1.0.0**, 2026-04-02: *"The Dolt migration that began in v0.55.0 is complete: embedded Dolt is the default on all platforms, server lifecycle management is no longer required."*).
6. **Daemon removal, in full** — layered across several releases: infra pruning starts v0.50-ish, `bd daemon` fully removed and beads becomes "purely CLI-driven" at **v0.51.0** (`internal/rpc/` deleted, ~19,663 lines), final reference cleanup at **v0.60.0** (2026-03-12).
7. **Standalone-ification from Gas Town** (**v0.62.0**, 2026-03-21): systematic removal of GUPP references, polecat/crew/overseer terminology, HOP schema fields, the agent-as-bead subsystem, hardcoded `~/gt/` paths — framed as prerequisite for a credible 1.0.
8. **Multi-clone / schema-migration safety hardening** (**v1.1.0-rc.1 → rc.2 → 1.1.0**, June–July 2026): the newest era — a state-aware "remote-migrate gate," per-migration content-hash skew detection in `bd doctor`, deterministic (rather than random-`UUID()`) primary keys for `dependencies`/`events`/`comments`/snapshot tables specifically to make independently-migrated clones merge-compatible, and an automatic loss-free fast-forward for the provably-safe case (landed in `[Unreleased]`, current HEAD).

**Breaking-change grep hits** (`grep -n -i BREAKING CHANGELOG.md`), the significant ones beyond routine phrasing:
- `beads.OpenBestAvailable` signature change (drops the `Unlocker` return value — embedded-mode flock removed from the SDK surface).
- `bd repo add` losing its optional alias argument (multi-repo config moved to YAML).
- JSON field `ephemeral` → `wisp` (breaking for API consumers).
- Graph-link fields (`relates_to`, `replies_to`, `duplicate_of`, `superseded_by`) marked experimental/subject-to-change.
- 4-char minimum prefix requirement dropped (previously broke hyphenated prefixes like `document-intelligence-0sa`).
- Subprocess stdin inheritance breaking the MCP JSON-RPC protocol (fixed, but was shipped broken first).
- Exact-error-message-parsing scripts warned they may break.
- Global daemon socket fallback removed (v0.20/0.21 era) — each project must run its own local daemon.
- `BD_ACTOR` → `BEADS_ACTOR` primary-var swap (v0.62.0, old var kept as deprecated fallback).

---

## 12. Lessons the authors learned the hard way

1. **JSONL-as-source-of-truth was fully reversed.** Early Beads: *"Switched to JSONL as source of truth (from binary SQLite)... SQLite database now acts as ephemeral cache"* (`CHANGELOG.md`, v0.1.0-era). By v1.0.5 this is explicitly inverted: *"Dolt is the primary datastore. `.beads/issues.jsonl` is now treated as an optional export... It is not the canonical git-tracked source of truth, not cross-machine sync, and not a full database backup"* (`/home/daniel/repos/beads/CHANGELOG.md`). Auto-export/auto-git-add flipped from implicit-default to opt-in in the same release once the rationale for the old default no longer held.

2. **The daemon was built, then torn out wholesale.** Introduced v0.9.8 ("Daemon mode... auto-sync"), later given a **BREAKING** removal of global-socket fallback (~v0.20), then fully removed as an architecture at v0.51.0 (`internal/rpc/` deleted, ~19,663 lines) with "final cleanup" passes recurring through v0.57.0 and v0.60.0 (`CHANGELOG.md`). The tool is now explicitly, permanently CLI-driven.

3. **A branch-per-worker Dolt concurrency model was built, benchmarked as a success, and abandoned anyway.** It hit 50 concurrent writers / 250 commits / 100% success in tests, but the win was judged "illusory" because it broke cross-agent bead visibility until merge — replaced by all-on-main plus explicit transaction discipline on direct advice from Dolt's co-founder (`/home/daniel/repos/beads/docs/design/dolt-concurrency.md`).

4. **`bd mail` was added as a first-class feature, then deliberately deleted for scope-boundary reasons**, not because it didn't work: *"Removed `bd mail` commands - Mail is orchestration, not data plane... follows the principle that beads is a data store, not a workflow engine"* (`CHANGELOG.md`). The underlying data model (`type=message`, `Sender`, `replies_to`) was kept; only the CLI surface was cut — a direct, later-codified instance of the `PROJECT_CHARTER.md` orchestration boundary. Notably, `/home/daniel/repos/beads/docs/messaging.md` (a **live**, non-staged doc) still documents `bd mail send/inbox/read/reply` as currently working — i.e. the removal outran the docs, and this particular drift was never caught by the staged-for-removal process because that process only watches docs someone explicitly flagged.

5. **The SQLite→Dolt backend swap was not a clean cutover — it took ~3 release-months and several "final cleanup" passes to actually finish.** Migration "began" at v0.55.0, SQLite was declared fully removed at v0.58.0, and cleanup of leftover 3-way-merge/tombstone/JSONL-sync-branch code (~11,000 lines in one pass alone) continued through v0.60.0, with v1.0.0 (2026-04-02) the first release to call the migration "complete."

6. **Multi-clone independent schema migration silently forked histories beyond repair.** Two clones sharing a Dolt remote that each ran a locally-triggered migration across a primary-key-reshaping boundary produced Dolt's hard refusal `cannot merge because table X has different primary keys in its common ancestor` — un-recoverable by the normal pull path. Fixing this properly took three releases (1.1.0-rc.1, rc.2, 1.1.0): a remote-migrate gate, per-migration content-hash skew detection surfaced in `bd doctor`, and finally a smart auto-fast-forward for the provably-safe case (`/home/daniel/repos/beads/CHANGELOG.md`).

7. **Random `UUID()`-default primary keys were themselves a cross-clone merge hazard**, independent of #6 — two clones creating "the same" dependency/event/comment/snapshot row minted different random IDs for it, so merges either duplicated rows or refused outright. Fixed by switching to content-derived deterministic IDs (`internal/storage/depid`, `internal/storage/rowid`) so independently-created identical rows converge to identical primary keys (`/home/daniel/repos/beads/CHANGELOG.md`, bd-6dnrw series).

8. **An AI agent destroyed 247 issues by faithfully following the tool's own error message.** `bd init`'s error text suggested a one-line destructive recovery command; the agent copy-pasted it verbatim. Root-caused not as an agent bug but as a **tool bug**: *"The agent's behavior was rational for the error it read; the text was the bug."* Became ADR-0002's Invariant 4 — no `bd` error text may ever contain a complete, copy-pasteable destructive invocation again (`/home/daniel/repos/beads/docs/adr/0002-init-safety-invariants.md`).

9. **The same init-safety failure class was patched eight separate times without anyone naming the underlying invariant** — each commit fixed one data source (local JSONL, local DB file, shared-server project_id, remote Dolt ref) in isolation, and `--force` kept silently inheriting bypass power over every new guard because it was declared in global scope. Only after the 247-issue incident did the team write down the actual invariant and build one executable chokepoint (`CheckRemoteSafety`) instead of another point patch (`/home/daniel/repos/beads/docs/adr/0002-init-safety-invariants.md`).

10. **Beads was originally deeply, structurally coupled to Gas Town**, and un-coupling it was real, late, and necessary work — not incidental cleanup — gating the 1.0 release: GUPP references, polecat/crew/overseer terminology, HOP schema fields, an entire agent-as-bead subsystem, and hardcoded `~/gt/` paths all had to be surgically removed at v0.62.0 before the team considered a standalone 1.0 credible (`/home/daniel/repos/beads/NEWSLETTER.md`). The lesson was then made structural, not just cultural: `PROJECT_CHARTER.md`'s orchestration/storage boundaries are now enforced by a `golangci-lint` `depguard` rule, not just a convention.

11. **A "shared test DB" performance pattern that worked great for pure-CRUD tests actively caused deadlocks when applied to tests touching global mutable state.** Refactoring `create_test.go`/`dep_test.go`/etc. to one shared DB gave 3–10x speedups; attempting the identical pattern on `main_test.go`'s auto-flush tests (which manipulate package globals like `isDirty`/`flushTimer`/`storeMutex`) produced real `sql.DB.Close()` deadlocks against concurrent `flushToJSONL()` calls — documented as a **failed** refactor, not merely a slower one (`/home/daniel/repos/beads/docs/staged-for-removal/dev-notes/MAIN_TEST_REFACTOR_NOTES.md`).

12. **A "sync mode" abstraction outlived its own necessity by multiple releases.** After the Dolt-native cutover, `SyncMode` had exactly one legal value (`dolt-native`), yet its type, validator, config plumbing, and ~100 lines of tests survived three separate cleanup passes as dead weight before finally being flagged for removal — evidence that migration-era abstractions need an explicit deletion pass, not just a "stop adding to it" policy (`/home/daniel/repos/beads/docs/staged-for-removal/audit-sync-mode-complexity.md`).

13. **The getting-started docs grew to ~3x their necessary size by documenting around fixable tool bugs instead of fixing them** — PATH issues, CGO/ICU build pain, a Windows install that hung indefinitely instead of erroring, a raw SQLite lock error instead of naming the offending PID, a stale circuit-breaker file requiring manual deletion. Explicit conclusion: *"fix the tool, delete the docs"* (`/home/daniel/repos/beads/docs/staged-for-removal/GETTING_STARTED_ANALYSIS.md`).

14. **Naming/metaphor decisions made mid-flight forced a breaking API change.** The `ephemeral` boolean field was renamed to `wisp` to fit a "Steam Engine" metaphor (solid/liquid/vapor) adopted after the field already shipped — a deliberate, acknowledged breaking JSON-API change for cosmetic/conceptual consistency, not a bug fix (`/home/daniel/repos/beads/CHANGELOG.md`, v0.33.1).

15. **The project's own anti-drift mechanisms (staged-for-removal, "Last reviewed" headers, file:line source-audits in the OTel design docs) don't catch everything.** `docs/messaging.md` — a live, canonical doc, not a staged one — still describes `bd mail` commands as functional months after they were removed (see lesson 4). The lesson isn't "the tooling failed" so much as "doc freshness requires an enumerated, swept process (like the staged-for-removal manifest's scheduled re-review), not just good intentions on individual docs" — and even a mature project with that process running finds gaps outside its own watch-list.
