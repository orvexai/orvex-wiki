# Dolt / DoltHub — Data Pull Requests ("Git for Data")

Researched 2026-07-10.

## What it is

Dolt is an open-source, MySQL-compatible SQL database with Git-style version control built in: fork, clone, branch, merge, push, pull, diff, and commit operate on *table rows*, not files. DoltgreSQL ("Doltgres") is a Postgres-flavored sibling, now in Beta ("ready for production use cases" per DoltHub's own docs). DoltHub is the hosted collaboration platform (GitHub-equivalent) for publishing and reviewing Dolt databases, including web-based data Pull Requests. Hosted Dolt is a managed database-as-a-service offering (Dolt without self-hosting the server). DoltLab is a self-hosted DoltHub alternative.
Source: https://github.com/dolthub/dolt , https://www.dolthub.com/

## Behind it & traction

Built by DoltHub, Inc., founded 2018 in Santa Monica, CA by Tim Sehn (CEO), Aaron Son, and Brian Hendriks (ex-Amazon/A9 team, also built Ancestry.com's "Liquidata" predecessor). Crunchbase records ~$21M raised across 2 rounds since a Nov 2019 round; a further $16M raise was reported as in progress per SEC filings (marketing/secondary-source claim, not independently confirmed here — treat as unconfirmed). GitHub repo (dolthub/dolt): 23,821 stars, 827 forks, 589 open issues, created 2019-07-24, actively pushed to as of 2026-07-09 (commit within the last day) — evidence of continued active development, not just marketing.
Sources: https://www.crunchbase.com/organization/liquidata , https://github.com/dolthub/dolt (via GitHub API), https://www.dolthub.com/team

## Architecture & data model

Core data structure is the "Prolly Tree" (probabilistic B-tree / content-defined-chunked tree) — tables, schemas, and indexes are all Prolly Trees, giving Dolt Git-like content-addressed, immutable, structurally-shared history at database scale ("scales to millions of versions, branches, and rows" per DoltHub's own blog claim — no independent third-party benchmark found). Version control is exposed both as CLI (Git-identical verbs: `init`, `clone`, `branch`, `merge`, `push`, `pull`, `commit`, `diff`) and as pure SQL: system tables for reads (`dolt_log`, `dolt_diff_*`, `dolt_history_*`, `dolt_branches`, `dolt_status`, `dolt_conflicts_<table>`) and stored procedures for writes (`dolt_commit`, `dolt_merge`, `dolt_checkout`). Historical state is queryable via `AS OF` SQL syntax. Runs embedded (in-process, single-writer, e.g. a local file-backed engine) or as a standalone `dolt sql-server` (multi-writer, MySQL wire protocol).
Sources: https://www.dolthub.com/blog/2025-05-16-millions-of-versions/ , https://www.dolthub.com/docs/sql-reference/version-control/ , https://github.com/dolthub/dolt

## API & integration surface (MCP? SDK? CLI? chat-platform plugins?)

- **CLI**: 30+ Git-mirrored subcommands (`dolt init/clone/branch/merge/push/pull/commit/diff/sql-server`, etc.).
- **SQL**: any MySQL client / driver works unmodified (Dolt) or any Postgres client (Doltgres, Beta); version-control ops are plain SQL procedure calls, so any existing SQL SDK in any language is automatically an integration surface — no bespoke client library required.
- **MCP**: an official `dolthub/dolt-mcp` server exists, supporting stdio mode (for Claude Desktop-style clients) and HTTP mode (REST-style MCP tool calls), configurable for either `dolt` (MySQL dialect) or `doltgres` (Postgres dialect) backends, packaged as a Docker image.
- **Web UI**: DoltHub / Hosted Dolt / Dolt Workbench provide browser-based PR review, including diff preview and (currently table-granularity "ours"/"theirs") conflict resolution.
- No chat-platform (Slack/Teams) plugin was found in this research pass.
Sources: https://github.com/dolthub/dolt-mcp , https://hub.docker.com/r/dolthub/dolt-mcp , https://github.com/dolthub/dolt

## Staging & review workflow

- **Propose → review → apply/reject**: standard Git PR model transplanted to data — a contributor branches, edits rows via SQL, commits, pushes, opens a PR on DoltHub/Hosted Dolt; a reviewer inspects a row/cell-level diff and merges (or rejects) the branch.
- **Change granularity**: conflict/diff granularity is the **cell** (row × column), the finest published granularity — "if two operations modify the same row, column pair to be different values, a conflict is detected." Dolt separately tracks **schema conflicts** (column/index/FK/constraint definition changes) from **data conflicts**, with rule-based auto-merge for compatible schema changes (e.g., identical column added on both sides merges silently; divergent types conflict).
- **Batch review at scale (e.g. 100 changes in one session)**: no specific evidence found of a purpose-built "batch-approve N changes in one session" reviewer UX; Dolt's model is oriented around one branch/commit/PR encompassing arbitrarily many row-level changes, which a reviewer approves/rejects as a unit (or per-table for conflicts) — not evidence of a fine-grained "approve 73 of 100, reject 27" flow.
- **Conflict handling vs. live content**: conflicts are materialized as rows in `dolt_conflicts_<table>` system tables (base/ours/theirs columns) rather than inline `<<<<<<<` markers; resolution is either (a) automated strategy `--ours`/`--theirs` per table, or (b) manual: update the row content directly then delete its conflicts-table entry. DoltHub blog posts from 2025 describe adding **web-based conflict preview** (see pending conflicts before merging) and **web-based conflict resolution** — both recent (mid-to-late 2025) additions, described by DoltHub itself as still maturing ("we're planning a more sophisticated UI that lets you resolve conflicts row-by-row or cell-by-cell, similar to GitHub's").
- **Reviewer UX + automation**: no evidence found of an AI/LLM-based automated reviewer or auto-approve rule engine built into Dolt/DoltHub itself. Automation exists only insofar as any external agent can issue SQL/CLI commands (including an AI agent driving the MCP server) — i.e., Orvex would have to build the "librarian" reviewer logic on top; Dolt supplies the substrate (branches, diffs, conflict tables), not the review policy engine.
Sources: https://www.dolthub.com/docs/concepts/dolt/git/conflicts , https://www.dolthub.com/blog/2025-09-02-resolving-conflicts-on-the-web/ , https://www.dolthub.com/blog/2025-06-25-preview-merge-conflicts/ , https://www.dolthub.com/docs/sql-reference/version-control/merges/

## Scale & operational evidence

- DoltHub's own blog claims Dolt "scales to millions of versions, branches, and rows" via the Prolly Tree structure — a first-party performance claim, not independently benchmarked in sources found here.
- Concrete non-Dolt-authored production evidence found: **Beads** (steveyegge/gastownhall's AI-coding-agent memory/task tool — the direct prior art for Orvex's own memory track) migrated fully off a SQLite+Git hybrid onto Dolt in ~early 2026, citing that this let them "scale far beyond what was possible with Beads's original backend." Beads runs Dolt in two modes: **embedded** (in-process, single-writer, file-locked, data in `.beads/embeddeddolt/`, zero server infra — the default/recommended mode) and **server** (standalone `dolt sql-server`, multi-writer, required for multi-agent/orchestrator/federated deployments, port 3307/3308). Beads uses Dolt's native branches (independent of git branches) for multi-agent handoff, `dolt_remotes` (DoltHub, S3, GCS, git-SSH, or local filesystem) for sync via a dedicated `refs/dolt/data` ref, and peer-to-peer "federation" (AES-256-encrypted creds, no central hub) across independent workspaces. Every `bd` write auto-commits to Dolt by default, which Beads' own docs flag as a real overhead concern under concurrent/batch load ("database is read only" errors observed under aggressive auto-commit in server mode; mitigated via `--dolt-auto-commit off` for batch operations).
- No explicit third-party throughput/latency benchmarks, and no documented ceiling on concurrent writers or PR size, were found.
Sources: https://github.com/steveyegge/beads/blob/main/docs/DOLT.md , https://www.dolthub.com/blog/2026-01-22-agentic-memory/ , https://www.dolthub.com/blog/2025-05-16-millions-of-versions/

## Pricing & positioning

- **DoltHub Pro** (hosted collaboration/PR platform): public repos free; private-repo data storage free up to 100 MB, then $5/month flat up to 5 GB, then $1/GB/month above 5 GB.
- **Hosted Dolt** (managed `dolt sql-server` DBaaS): hourly billing based on provisioned instance + disk size; entry instances start around $438/month (per third-party aggregator; not independently re-verified against the live pricing page, which returned only a client-rendered shell during this research pass — flagged as **unconfirmed, verify against https://hosted.doltdb.com/pricing directly**).
- Positioning: "Git for data" / "the world's first and only version-controlled SQL database" — targets teams that need collaborative, auditable, branchable structured data (reference/config data, ML feature/label sets, agent memory) rather than raw file version control.
Sources: https://www.dolthub.com/blog/2026-04-24-announcing-dolthub-pro-for-5-dollars-per-month/ , https://hosted.doltdb.com/pricing (unconfirmed detail), https://toolradar.com/tools/dolt

## STEAL — 3-5 concrete ideas for Orvex

1. **Cell/field-level diff & conflict granularity, not document-level.** Dolt's core insight — track conflicts at (row, column) not (file) — maps directly onto the staging track's need to review a proposed edit to one section/field of a wiki doc without treating the whole document as the unit of conflict. Orvex's staging schema should key proposed changes by (document_id, section_id/field) the way Dolt keys by (row, column).
2. **Separate "schema conflict" vs "data conflict" as first-class categories.** Orvex's librarian will hit an analogous split: structural proposals (new section, renamed heading, changed taxonomy) vs. content proposals (edited prose within an existing structure). Modeling these as two conflict classes with different auto-merge rules (structural changes auto-merge when compatible, content changes always route to review) is a directly reusable pattern.
3. **Branch-per-agent-session, not per-document.** Beads' pattern (each agent/session gets its own Dolt branch; `bd_...` hash-based IDs prevent merge collisions across concurrent agents) is a strong fit for "a single chat session proposing updates to 100 documents": stage the whole session's proposals as one branch/commit, review it as one unit, merge or reject wholesale — rather than 100 independent staged-change rows with no session grouping.
4. **`AS OF` time-travel queries for the wiki itself**, exposed the same way Dolt exposes `dolt_diff_*` / `dolt_history_*` system tables — gives "what did this page say when the agent read it" auditability for free if the staging/librarian substrate is SQL-shaped.
5. **MCP server as the exposure layer, not a bespoke API.** Dolt shipped an official MCP server (stdio + HTTP, Docker-packaged) rather than requiring a custom SDK — validates Orvex's own MCP-first exposure of the staging/librarian and cross-agent-memory tools; agents can drive branch/diff/merge primitives with plain MCP tool calls.

## AVOID / where Orvex differs

- **Dolt supplies no reviewer/policy layer.** No evidence of an AI-driven auto-approve or auto-reject reviewer built into Dolt or DoltHub — the entire "librarian agent" concept (per-customer-tweakable review/merge/beautify prompt) is something Orvex must build from scratch on top of Dolt's primitives; don't expect to buy this off the shelf.
- **Conflict-resolution web UX is still immature** (DoltHub's own words: "planning a more sophisticated UI... row-by-row or cell-by-cell") and the current default resolution strategies are coarse (`--ours`/`--theirs` per table). A 100-document, single-session batch review is a UX scale Dolt's own tooling has not visibly been proven at — this is a genuine gap, not a solved problem to copy.
- **Auto-commit-per-write overhead is a documented real cost** (Beads hit "database is read only" errors under concurrent auto-commit load and had to add an explicit batch/no-auto-commit mode). If Orvex adopts Dolt/a Dolt-like model for staging 100 proposed changes in one session, plan for batched/deferred commits from day one rather than commit-per-proposed-edit.
- **Single-writer embedded mode is the "recommended" default** in the most concrete real-world deployment found (Beads) — multi-writer requires standing up a separate `dolt sql-server` process. Orvex's staging store needs true multi-tenant, multi-agent concurrent writers as a baseline requirement, so plan for server-mode (or an equivalent) from the start, not the embedded/single-writer happy path Dolt's own ecosystem defaults to.
- **DoltgreSQL (Postgres-compatible) is only Beta** — if Orvex's stack is Postgres-first, note that the more mature Dolt project itself is MySQL-wire-compatible, not Postgres; adopting Dolt proper means introducing a MySQL-protocol component into an otherwise Postgres-based platform, a real architectural mismatch worth flagging explicitly rather than glossing over.
- **Funding/scale claims are thin.** DoltHub is a small (~$21M raised, unconfirmed further $16M raise in progress) independent company; treat DoltHub's own "scales to millions of versions/rows" claim as marketing until Orvex runs its own load test — no independent third-party benchmark was found in this pass.

## Sources

- https://github.com/dolthub/dolt
- https://www.dolthub.com/
- https://www.dolthub.com/team
- https://www.crunchbase.com/organization/liquidata
- https://www.dolthub.com/blog/2025-05-16-millions-of-versions/
- https://www.dolthub.com/docs/sql-reference/version-control/
- https://www.dolthub.com/docs/concepts/dolt/git/conflicts
- https://www.dolthub.com/docs/sql-reference/version-control/merges/
- https://www.dolthub.com/blog/2025-09-02-resolving-conflicts-on-the-web/
- https://www.dolthub.com/blog/2025-06-25-preview-merge-conflicts/
- https://github.com/dolthub/dolt-mcp
- https://hub.docker.com/r/dolthub/dolt-mcp
- https://github.com/steveyegge/beads/blob/main/docs/DOLT.md
- https://www.dolthub.com/blog/2026-01-22-agentic-memory/
- https://www.dolthub.com/blog/2026-04-24-announcing-dolthub-pro-for-5-dollars-per-month/
- https://hosted.doltdb.com/pricing
- https://toolradar.com/tools/dolt
- https://github.com/dolthub/doltgresql
