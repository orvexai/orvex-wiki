# Dolt at Scale & Beads Upstream Signal

Research for the Orvex Studio hosted cross-agent memory service (beads-inspired). Research conducted 2026-07-10. Every claim is cited inline to a primary source URL.

---

## Executive verdict (read this first)

**Dolt is a strong fit for a small/mid multi-tenant memory service and a poor fit as the *sole* store at very large tenant counts.** It reaches MySQL performance parity on single-node sysbench workloads, but it (a) **serializes all writes** through one primary, (b) **loads each database's full commit graph into memory at startup**, (c) **cannot shard** — one tenant's data must fit on one disk, and (d) generates heavy copy-on-write garbage that demands an ongoing decay/compact/GC lifecycle. Steve Yegge's own production system (Gastown, which *is* the beads/agent-memory stack) runs **one Dolt server per "town" hosting ~5 databases on an all-writes-to-main model** — it does *not* attempt one giant server with thousands of tenant databases, and it had to **abandon per-worker branching**. That proven pattern generalizes to a hosted service as *server-per-tenant-shard*, which is viable to ~1,000 tenants with real operational cost, and becomes a large fleet-management problem at ~100,000.

**Recommendation:** Adopt Dolt for the branch/merge-centric memory *core* now, prove it at the ~10-tenant tier using the Gastown-proven pattern (sharded Dolt servers, all-on-main, aggressive decay→compact→flatten→gc), and architect tenant-sharding plus a compaction cron from day one. Do **not** commit Dolt as the sole store for a 100k-tenant tier — reserve Dolt for the branch/merge feature and plan a Postgres (or, later, Doltgres) substrate for the high-tenant tier. Full reasoning in [§A11](#a11-verdict-can-dolt-back-this-service).

---

# TRACK A — Dolt at scale

## A1. What Dolt is, and its performance profile

Dolt is "Git for data": a from-scratch SQL database (MySQL wire-compatible) with Git-style versioning — commit, branch, merge, diff — as first-class operations, built on a content-addressed *prolly-tree* storage engine ([github.com/dolthub/dolt](https://github.com/dolthub/dolt)).

After five years of optimization Dolt now matches MySQL on single-node sysbench:
- **Dolt 2.0 (2026-05-11): 13% faster than MySQL on writes, 5% faster on reads, ~8% faster on average** across sysbench-style workloads ([Dolt 2.0 blog](https://www.dolthub.com/blog/2026-05-11-dolt-2-dot-0/)).
- The Dec 2025 parity post reported an overall read-write latency multiple of **0.99** vs MySQL, with wide spread by operation: Dolt is much faster on scans (covering index scan **0.3x**, index scan 0.66x, table scan 0.81x) but slower on point/OLTP reads (OLTP read-only **1.38x**, select-random-points **1.66x**, index-join 1.29x) ([Dolt is as Fast as MySQL](https://www.dolthub.com/blog/2025-12-04-dolt-is-as-fast-as-mysql/)).
- **On TPC-C, Dolt historically ran at roughly ~40% of MySQL throughput** (order of ~40 tps vs ~100 tps) — the transactional/contended-write picture is weaker than the sysbench headline ([Dolt benchmarks docs](https://docs.dolthub.com/sql-reference/benchmarks)).

**Takeaway:** single-connection latency parity is real; the caveats that matter for a memory service are all about *concurrency* and *versioned-storage overhead*, below.

## A2. The write model — writes are serialized (the core constraint)

Dolt's transaction model **serializes all writes.** From Dolt's own troubleshooting/scale guidance: "Dolt is not a high-throughput database for writes… the current transaction model serializes all writes… after a certain threshold of writer concurrency you'll observe increasing latency for write operations, which becomes worse as more writers pile up" ([Dolt troubleshooting docs](https://docs.dolthub.com/sql-reference/server/troubleshooting)). Concurrent modification of the working set has been a long-standing constraint (tracked in [dolthub/dolt#579](https://github.com/dolthub/dolt/issues/579)).

For horizontal scale, Dolt has "the same scaling profile as a traditional OLTP database": you scale **writes by getting a bigger primary**, and **reads by adding read replicas** — there is no write sharding ([How to Make Dolt Work at Scale](https://www.dolthub.com/blog/2024-10-21-dolt-at-scale/)).

**Implication for agent memory:** per-tenant write volume is small and bursty (fine), but if many tenants share one server, their writes contend on one serialized primary. This pushes the design toward *few tenants per server* / sharding.

## A3. Storage & commit-graph growth under frequent tiny writes (the agent-memory-specific risk)

This is the risk most specific to an agent-memory workload (many small, frequent writes):

- Dolt is **copy-on-write**: "Dolt makes a lot of disk garbage… all intermediate committed transaction state is preserved to disk." Each write can rewrite multiple prolly-tree chunks; uncommitted writes and deleted branches also create garbage ([Online GC blog](https://www.dolthub.com/blog/2023-01-25-online-gc/), [GC docs](https://docs.dolthub.com/sql-reference/server/garbage-collection)).
- **Every mutation creates a commit,** and "Dolt loads the commit graph into memory on startup," so **deep history raises memory requirements** ([Sizing Your Dolt Instance](https://www.dolthub.com/blog/2023-12-06-sizing-your-dolt-instance/)).
- Rough write-amplification rule of thumb: ~**1,000 updates ≈ 16MB** of version storage (~4KB × txns × index-updates × tree-depth, ~3.2x factor) ([Sizing blog](https://www.dolthub.com/blog/2023-12-06-sizing-your-dolt-instance/)).
- At heavy write volume the garbage is large: a 650GB Wikipedia import produced **~500GB of garbage per week** and a journal that grew to **271GB in 48 hours** before GC recovered ~260GB ([Dolt at Scale](https://www.dolthub.com/blog/2024-10-21-dolt-at-scale/)).

The critical framing comes from Dolt's founder, quoted inside Yegge's own storage design doc: **"Your Beads databases are small but your commit history is big"** ([Gastown Dolt storage design](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)). For agent memory the *rows* are tiny; the *commit history* from frequent tiny writes is the thing that bloats RAM and disk. This is why every serious deployment needs the decay/compact/GC lifecycle in [§A8](#a8-branchmerge-cost--the-all-on-main-reversal).

## A4. Sizing: RAM vs disk

- **Provision ~10–20% of the database's on-disk size as RAM** (a 100GB DB → 10–20GB RAM). A 665GB DB ran at ~36GB steady-state RAM (~10%) ([Sizing blog](https://www.dolthub.com/blog/2023-12-06-sizing-your-dolt-instance/), [Dolt at Scale](https://www.dolthub.com/blog/2024-10-21-dolt-at-scale/)).
- Production floors: **2GB RAM minimum**, 4GB for heavier workloads, 8GB common for production customers ([troubleshooting docs](https://docs.dolthub.com/sql-reference/server/troubleshooting)).
- **Helpful for agent memory:** a database with *deep history but a small current HEAD* needs *less* memory — e.g., a 104GB-on-disk DB with only ~10GB live at HEAD started in ~2GB ([Sizing blog](https://www.dolthub.com/blog/2023-12-06-sizing-your-dolt-instance/)). Agent-memory tenants (small live graph, lots of churn behind them, aggressively decayed) fit this favorable shape *if* history is compacted.

## A5. Garbage collection

- **Dolt 2.0 enables automatic GC by default** — "most users don't have to care about disk garbage" ([Dolt 2.0](https://www.dolthub.com/blog/2026-05-11-dolt-2-dot-0/)).
- **Generational GC** (oldgen/newgen) and **online GC** (no downtime) exist; auto-GC triggers when the journal exceeds **50MB** (default since Dolt 1.75.0) ([Online GC](https://www.dolthub.com/blog/2023-01-25-online-gc/), [Gastown design doc](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)).
- **Dolt 2.0 "Archives" format** uses dictionary compression to cut storage **30–50%**; adaptive encoding stores small TEXT/BLOB/JSON inline. Note: this same adaptive-encoding feature is implicated in a live beads corruption bug — see [§A10](#a10-known-failure-modes--war-stories) ([Dolt 2.0](https://www.dolthub.com/blog/2026-05-11-dolt-2-dot-0/)).
- Automated table statistics are restricted to tables **under ~1M rows** ([Dolt at Scale](https://www.dolthub.com/blog/2024-10-21-dolt-at-scale/)).

## A6. Scale ceiling: single-node, no sharding

- **Dolt cannot be distributed — all data and its full history must fit on one logical disk.** It is explicitly "not meant for big data" but for data humans interact with ([HN: Dolt is Git for Data](https://news.ycombinator.com/item?id=31847416)).
- Community-reported large repos land around **~300GB** with performance bottlenecks; DoltHub's own demo pushed a **665GB** Wikipedia DB on an M1 Mac at 40–50k page imports/day ([HN](https://news.ycombinator.com/item?id=22735014), [Dolt at Scale](https://www.dolthub.com/blog/2024-10-21-dolt-at-scale/)).

**Implication:** a *single tenant's* memory graph will never approach this ceiling, so per-tenant sizing is comfortable. The scaling problem is not one big DB — it is **many DBs / many servers**.

## A7. Multi-tenancy patterns on Dolt

Three candidate patterns, assessed against the evidence:

| Pattern | How | Fit |
|---|---|---|
| **DB-per-tenant on a shared sql-server** | one `dolt sql-server`, `USE tenant_db` | Works for a *handful* of DBs (Gastown runs 5 per server), but each DB loads its commit graph into memory at startup and needs its own GC/compaction — memory and ops cost grow with DB count. Untested at thousands. |
| **Branch-per-tenant in one DB** | one DB, a branch per tenant | **Discouraged by the evidence.** Branch/merge has real cost, `DOLT_REBASE` is unsafe under concurrent writes, and Gastown *removed* per-worker branching in favor of all-on-main (see [§A8](#a8-branchmerge-cost--the-all-on-main-reversal)). Also weak tenant isolation. |
| **Server-per-tenant (or per-tenant-shard)** | one Dolt process per tenant / small tenant group, orchestrated (k8s) | **The proven pattern.** Gastown = "one Dolt sql-server per town." Clean isolation, independent GC, independent backup/restore. Cost is fleet management + per-instance memory floor (~2GB) + Hosted-Dolt $ floor. |

Evidence that multiple DBs per server works but is kept small: Gastown runs **one Dolt sql-server per town on port 3307 hosting exactly five databases** (`hq`, `gastown`, `beads`, `wyvern`, `sky`), each reached via `USE <name>` ([Gastown design doc](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)). The beads FAQ confirms "one Dolt process [can] serve multiple projects simultaneously" and, for very large projects, recommends **splitting into multiple databases past ~100k issues** ([beads FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)). No published guidance exists for hundreds/thousands of databases on one server — treat that as unproven.

## A8. Branch/merge cost & the "all-on-main" reversal

The single most important operational lesson from Yegge's production stack:

- Gastown uses an **"all-on-main" strategy**: every agent writes directly to `main` inside `BEGIN` / `DOLT_COMMIT` / `COMMIT` blocks, "eliminating visibility gaps between workers and removing the need for per-worker branching." Older versions used git worktrees / per-worker branches; **that was removed** ([Gastown design doc](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md), [beads FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)).
- To keep commit history from bloating, Gastown runs a **6-stage lifecycle: CREATE → CLOSE → DECAY (delete rows 7–30 days after close) → COMPACT (rebase commits together) → FLATTEN (squash to a single commit) → `dolt gc`.** All compaction ops (`DOLT_RESET --soft`, `DOLT_REBASE()`, `dolt_gc()`) are safe on a running server ([Gastown design doc](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)).
- **Concurrency hazard:** "`DOLT_REBASE` is NOT safe with concurrent writes. If agents commit during rebase, Dolt detects the graph change and errors." Flatten-mode (`DOLT_RESET --soft`) is concurrent-safe ([Gastown design doc](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)).
- **Cross-machine sync via git-protocol remotes is slow:** a 71MB database takes ~90 seconds to push; larger ones take 20+ minutes, and **pushing requires exclusive access (a maintenance window)** ([Gastown design doc](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)).

**Implication:** the branch/merge feature that makes Dolt attractive for "staging-like" memory semantics is real but *expensive and fragile under concurrency*. Reserve branch/merge for deliberate staging/preview forks, not the hot write path; keep the hot path all-on-main with a compaction cron.

## A9. Hosted Dolt / DoltLab / Doltgres — maturity & pricing

- **Hosted Dolt** (managed cloud Dolt): deployments **start at $50/month**; you pick server + disk, they provision/run it, with UI for config/logs/health. Supports **read replicas** (checkbox + replica count) and takes **regular automatic backups**; because a Dolt DB contains full history, point-in-time restore = checkout at a past commit ([Hosted Dolt](https://hosted.doltdb.com/), [Hosted Dolt pricing](https://hosted.doltdb.com/pricing), [Backups docs](https://docs.dolthub.com/concepts/dolt/rdbms/backups)).
- **DoltLab** (self-hosted DoltHub): **free to download and self-manage** ([Is DoltLab right for you?](https://www.dolthub.com/blog/2022-05-25-is-doltlab-right-for-you/)).
- **Doltgres** (Postgres-wire-compatible sibling): **still pre-GA as of this research — 1.0 targeted for 2026-08-06** (~4 weeks out), beta since April 2025. Its 1.0 bar is only **"within 3x PostgreSQL latency"** on key sysbench measures — materially slower than the MySQL-flavored Dolt's parity. DoltHub's own advice: "for those not choosy about SQL dialect, choose Dolt — it's already feature complete and production quality, backing thousands of customer applications" ([Doltgres 1.0 Coming](https://www.dolthub.com/blog/2026-06-26-doltgres-1-0-coming-this-fall/), [Doltgres Beta Launch](https://www.dolthub.com/blog/2025-04-16-doltgres-goes-beta/), [State of Doltgres](https://www.dolthub.com/blog/2025-10-16-state-of-doltgres/)).
- **Dolt 2.0 also shipped beta vector support with version-controlled vectors** — relevant if the memory service wants embeddings/semantic recall in the same store ([Dolt 2.0](https://www.dolthub.com/blog/2026-05-11-dolt-2-dot-0/)).

## A10. Known failure modes & war stories

**From Dolt's own community / docs:**
- Not for high write concurrency; writes serialize and latency degrades as writers pile up ([troubleshooting docs](https://docs.dolthub.com/sql-reference/server/troubleshooting)).
- Cannot distribute; single-disk ceiling; heavy garbage requiring GC ([HN](https://news.ycombinator.com/item?id=22735014)).

**From live beads issues (July 2026, v1.x — the canary for "Dolt as agent memory in production"):** the recurring themes are **Dolt-backend data integrity and concurrency**, not query speed:
- [#4521](https://github.com/steveyegge/beads/issues) "Dolt journal corruption and stale DB locks on batch timeout"
- [#4590](https://github.com/steveyegge/beads/issues) "Schema migration corrupts long-text columns with unreadable adaptive-value encoding" (implicates the Dolt 2.0 adaptive-encoding feature from [§A5](#a5-garbage-collection))
- [#4572](https://github.com/steveyegge/beads/issues) v1.0.5 **withdrawn due to corruption** / schema compatibility
- [#4657](https://github.com/steveyegge/beads/issues) "`bd update --claim` is not a hard CAS under true sub-second concurrency" (claim/lease races between agents)
- [#4541](https://github.com/steveyegge/beads/issues) notes field silently replaces content, audit history lost
- [#4437](https://github.com/steveyegge/beads/issues) query-performance bottleneck in the graph command
- [#4547](https://github.com/steveyegge/beads/issues) users proposing **pluggable storage backends** (i.e. an escape hatch from Dolt)

Yegge himself concedes the merge story is hard: **"Beads is a pretty complex system and conflicts often happen during merges"** ([Beads Best Practices](https://steve-yegge.medium.com/beads-best-practices-2db636b9760c)).

**Net:** the failure modes to design against are journal corruption / stale locks under concurrent writes and batch timeouts, weak CAS for cross-agent claims, and migration/encoding corruption — all recoverable only from backups. A hosted service must own supervision, backup/restore, and a claim primitive stronger than beads' current one.

## A11. VERDICT — can Dolt back this service?

Tenant = one workspace's memory graph: small rows, frequent small writes, occasional branch/merge for staging semantics, heavy read at session start.

- **~10 tenants — YES, clean fit.** A few Hosted-Dolt instances (server-per-tenant or a handful of DBs per server), all-on-main hot path, branch/merge available for staging. Trivial memory/disk. Cost floor ~$50/mo per Hosted instance (or self-host). Ship it.
- **~1,000 tenants — VIABLE, operationally heavy.** You cannot host 1,000 live commit graphs on one server (each loads into RAM at startup and needs its own GC/compaction). The workable shape is a **tenant-sharded fleet** (generalize Gastown's server-per-town to ~20–50 tenants per Dolt server → ~20–50 servers), each running the **decay→compact→flatten→gc** cron so frequent tiny writes don't bloat history. Serialized writes are fine at this per-server tenant density. Cross-tenant queries are impossible (each DB isolated) — good for isolation, so plan a separate analytics path if you need global rollups.
- **~100,000 tenants — NO, not as the sole store.** No native sharding means orchestrating **thousands of Dolt processes / DBs**, each with commit-graph RAM, a GC/compaction cron, slow git-remote sync, per-server serialized-write caps, and backup/restore of thousands of prolly-tree stores. **Where it breaks first is operations + memory footprint of many live commit graphs (and durability/corruption recovery), not raw query latency.**

**Break-first ranking:** (1) fleet ops — many-DB memory + per-DB GC/compaction at 1k+; (2) durability — journal corruption + stale locks under concurrency (live in beads today); (3) cross-machine sync latency if the design pushes/pulls per session; (4) per-shard single-disk ceiling if any one tenant's history grows large.

**Pragmatic alternative:** Postgres as system-of-record for memory rows — native multi-tenancy (RLS / partitioning / schema-per-tenant) scales to 100k tenants on well-known playbooks — with **temporal/audit versioning** (history tables or a temporal extension) for who-changed-what-when. Reserve **Dolt only for the branch/merge feature** (staging/preview/what-if forks of a workspace's memory graph), not the whole store. Doltgres is a *future* bridge if Postgres-wire compatibility matters, but it's pre-GA (Aug 2026) and ~3x slower than Postgres — don't build the first release on it.

**Honest tradeoff:** choosing Postgres sacrifices Dolt's headline capability — cheap branching + automatic **cell-level 3-way merge** + first-class full history — which *is* the "staging-like semantics" the memory service wants. So the decision hinges on one product question: **is branch/merge of the memory graph the core differentiator, or a nice-to-have?**

**Recommendation line:** *Adopt Dolt (MySQL-flavored, 2.0) for the branch/merge-centric memory core; prove it at the ~10-tenant tier now with the Gastown-proven pattern (sharded servers, all-on-main, aggressive decay/compact/GC); architect tenant-sharding + a compaction cron from day one for the ~1,000 tier; and do NOT make Dolt the sole store at 100k tenants — reserve it for the branch/merge feature and back the high-tenant tier with Postgres (temporal versioning) or, later, Doltgres.*

---

# TRACK B — Beads upstream signal

## B1. Repo stats, license, activity (as of 2026-07-10)

- **~25.2k stars, ~1.7k forks**, primary language Go (95%), platforms macOS/Linux/Windows/FreeBSD ([github.com/steveyegge/beads](https://github.com/steveyegge/beads)).
- **License: MIT** — "Copyright (c) 2025 Beads Contributors" — permissive, no copyleft; clean for Orvex to fork/vendor/learn from ([beads LICENSE](https://github.com/steveyegge/beads/blob/main/LICENSE)).
- **Very active but young (~8 months old):** latest release **v1.1.0 (2026-07-04)**, **93 releases**, **~302 open issues**, **~122 open PRs**. Rapid release cadence with churn (a version was withdrawn for corruption — see [§A10](#a10-known-failure-modes--war-stories)).
- Self-description: **"distributed graph issue tracker for AI agents, powered by Dolt"** ([github.com/steveyegge/beads](https://github.com/steveyegge/beads)).

## B2. Architecture & the JSONL→Dolt migration (the key story for Orvex)

Beads **launched (Nov 2025) as JSONL-in-git** — "queries like a database but writes issues to git as JSONL lines… the best of both the database and version-control worlds." The original intro post **made no mention of Dolt** ([Introducing Beads](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)).

It has since **migrated to Dolt as the primary backend**, and `.beads/issues.jsonl` is now **export/interchange only — explicitly "not the source of truth or a full database backup"** ([beads README](https://github.com/steveyegge/beads/blob/main/README.md), [beads FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)). Two modes:
- **Embedded mode (default):** Dolt in-process at `.beads/embeddeddolt/`, **single-writer via file locking.**
- **Server mode:** connect to an external `dolt sql-server`, **multiple concurrent writers**; cross-machine sync via `bd dolt push/pull` against `refs/dolt/data`.

Multi-agent concurrency is handled by **hash-based IDs** (no ID collisions) plus **Dolt cell-level merge**; worktree-based sync was removed once Dolt owned versioning ([beads FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)).

**Why this matters for Orvex:** beads is a live, at-scale validation of exactly Daniel's proposed substrate — and its own evolution (JSONL → Dolt, embedded → server, per-worker-branch → all-on-main) is a ready-made map of what works. It's a hard-cut migration, not a fallback-laden one, which matches the house "no fallbacks" stance.

## B3. Claude Code plugin / MCP story

- Full **Claude Code plugin**: `/plugin install beads` (or `/plugin marketplace add ./beads`), which spawns a **`beads-mcp` MCP server** and registers **session hooks** via `plugin.json` ([beads PLUGIN.md](https://github.com/steveyegge/beads/blob/main/docs/PLUGIN.md), [Claude Code integration](https://gastownhall.github.io/beads/integrations/claude-code)).
- Slash commands: `/beads:ready`, `/beads:create`, `/beads:show`, `/beads:update`, `/beads:close`; also `bd setup claude` to install hooks/settings.
- MCP server env vars: `BEADS_PATH`, `BEADS_DB`, `BEADS_ACTOR`, `BEADS_NO_AUTO_FLUSH`, `BEADS_NO_AUTO_IMPORT`. **Requires `uv`/Python** on PATH (a common install failure point). Auto-approval is configurable server- or project-level ([beads PLUGIN.md](https://github.com/steveyegge/beads/blob/main/docs/PLUGIN.md)).

## B4. Yegge's canonical writing & design philosophy

- **[Introducing Beads](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)** (the "50 First Dates" / agent-amnesia thesis): agents lose context after ~10 min, forget task hierarchy, spawn hundreds of orphaned markdown plans, and **disavow discovered work** when low on tokens ("Those test failures are pre-existing and have nothing to do with my work here"). Fix: an addressable, dependency-aware issue graph as external memory. Design choices: four dependency types, first-class structured data over prose plans, "throwaway sessions" (one issue per session to cut token pressure).
- **[Beads Best Practices](https://steve-yegge.medium.com/beads-best-practices-2db636b9760c):** keep DBs **under ~500 issues** (`bd cleanup` regularly) because a **~25k-token agent file-read limit caps usable issues around 500** before agent tools fail; `bd doctor` daily; restart agents often. Multi-agent coordination is delegated to a *separate* tool, **MCP Agent Mail** (Jeffrey Emanuel) — beads is deliberately **just the execution/memory layer: no UI, no planning, no orchestration.**

Two candid self-assessments worth quoting to the PRD:
- **"Beads is a pretty complex system and conflicts often happen during merges."**
- **"a crummy architecture (by pre-AI standards) that _requires_ AI in order to work around all its edge cases where it breaks."**

## B5. Community criticism & limitations

- **Slowness / taste:** criticized as slow and "not written with the taste that top software developers would find acceptable" ([EdgarTools](https://www.edgartools.io/beads-and-the-future-of-programming/)).
- **Invasiveness:** "the more devastating criticism is about how invasive beads is — beads does a lot"; requires discipline to actually use the graph vs freestyle prompting; **overkill if you already have Linear/Jira** wired into your agents ([EdgarTools](https://www.edgartools.io/beads-and-the-future-of-programming/), [skeptical take](https://www.linkedin.com/posts/tdfirth_github-steveyeggebeads-beads-a-memory-activity-7383521024434397186--B4R)).
- **Scale-ceiling admissions:** ~500-issue soft cap per DB (token limit); split into multiple DBs past ~100k issues; merge conflicts common ([Best Practices](https://steve-yegge.medium.com/beads-best-practices-2db636b9760c), [FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)).
- **Simplification pressure:** the community **ported beads to Rust (@doodlestein)** explicitly to simplify the agentic workflow — a signal the Go/Dolt stack is seen as heavy ([Yegge on the Rust port](https://www.linkedin.com/posts/steveyegge_github-steveyeggebeads-beads-a-memory-activity-7418745364104622080-a4II)).
- **Storage lock-in concern:** open issue proposing **pluggable storage backends** shows some users want an alternative to Dolt ([#4547](https://github.com/steveyegge/beads/issues)).

## B6. Roadmap / adoption signals

- Explosive adoption (0 → ~25k stars in ~8 months) and a broad integration surface (Claude Code, GitHub Copilot CLI/VS Code MCP, Homebrew/npm/script installs). Strong mindshare, immature internals (frequent breaking 1.x releases, a withdrawn version).
- The **Gastown** project ([gastownhall/gastown](https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md)) is Yegge's larger multi-agent "town" framework in which beads is one of several Dolt databases — the clearest published blueprint for running beads-on-Dolt as a *managed multi-agent service* (server-per-town, all-on-main, decay/compact lifecycle). **This is the single most useful upstream artifact for the Orvex PRD.**

## B7. VERDICT — beads community signal

- **Validated direction, immature implementation.** Beads proves the market and the substrate (Dolt-backed agent memory) at ~25k-star scale, and its migration history (JSONL→Dolt, embedded→server, branch-per-worker→all-on-main) is a de-risking map for Orvex — but it ships frequent breaking releases, a withdrawn-for-corruption version, and Yegge's own "crummy architecture… requires AI to work around its edge cases."
- **The pain is exactly where Dolt-at-scale predicts:** merge conflicts, journal corruption + stale locks under concurrency, weak cross-agent CAS/claim, a ~500-issue soft cap per DB (token-driven), and "split into more DBs" past 100k — reinforcing the [Track A](#a11-verdict-can-dolt-back-this-service) recommendation to shard, compact aggressively, and provide a stronger claim/lease primitive than beads has today.
- **Licensing/reuse is clean (MIT)** — Orvex can study, fork, or vendor beads/Gostown patterns freely, and the deliberate scope (execution/memory layer only; coordination pushed to a separate messaging tool like MCP Agent Mail) is a useful boundary to copy or consciously reject.

---

## Sources

**Dolt — performance & benchmarks**
- https://www.dolthub.com/blog/2026-05-11-dolt-2-dot-0/
- https://www.dolthub.com/blog/2025-12-04-dolt-is-as-fast-as-mysql/
- https://docs.dolthub.com/sql-reference/benchmarks
- https://docs.dolthub.com/sql-reference/benchmarks/latency

**Dolt — scale, storage, GC, sizing, concurrency**
- https://www.dolthub.com/blog/2024-10-21-dolt-at-scale/
- https://www.dolthub.com/blog/2023-12-06-sizing-your-dolt-instance/
- https://www.dolthub.com/blog/2023-01-25-online-gc/
- https://docs.dolthub.com/sql-reference/server/garbage-collection
- https://docs.dolthub.com/sql-reference/server/troubleshooting
- https://github.com/dolthub/dolt/issues/579
- https://news.ycombinator.com/item?id=31847416
- https://news.ycombinator.com/item?id=22735014

**Dolt — hosting, backups, Doltgres**
- https://hosted.doltdb.com/ , https://hosted.doltdb.com/pricing
- https://docs.dolthub.com/concepts/dolt/rdbms/backups
- https://www.dolthub.com/blog/2022-05-25-is-doltlab-right-for-you/
- https://www.dolthub.com/blog/2026-06-26-doltgres-1-0-coming-this-fall/
- https://www.dolthub.com/blog/2025-04-16-doltgres-goes-beta/
- https://www.dolthub.com/blog/2025-10-16-state-of-doltgres/

**Beads & Gastown (the agent-memory-on-Dolt reference stack)**
- https://github.com/steveyegge/beads (README, LICENSE, FAQ, PLUGIN.md, issues)
- https://github.com/gastownhall/gastown/blob/main/docs/design/dolt-storage.md
- https://gastownhall.github.io/beads/integrations/claude-code
- https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a
- https://steve-yegge.medium.com/beads-best-practices-2db636b9760c
- https://www.edgartools.io/beads-and-the-future-of-programming/
- https://www.linkedin.com/posts/steveyegge_github-steveyeggebeads-beads-a-memory-activity-7418745364104622080-a4II
