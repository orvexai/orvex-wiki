---
description: Find and read a Linear issue (or issues) — cache-first via the tracking adapter, never a direct API read.
argument-hint: <issue id (ENG-42) or search terms>
---

You are finding/reading Linear issue(s) for: **$ARGUMENTS**

Reads come from the **local cache** (bmad-linear is CLI-over-MCP with a cache; never hit the Linear API directly for routine reads).

1. **Freshness gate:** `_bmad/lnr/tools/linear-sync.sh check`; if it reports absent or stale (> 30 min), run `_bmad/lnr/tools/linear-sync.sh sync` and wait.
2. If `$ARGUMENTS` looks like an identifier (e.g. `ENG-42`), use the adapter `get_issue`: read `.cache/linear/issues/<ID>.yaml` from the cache (title, status, milestone, cycle, parent, description, comments). If the file is missing (created since last sync), run `_bmad/lnr/tools/linear-sync.sh issue <id>` then re-read.
3. Otherwise treat `$ARGUMENTS` as search terms: use the adapter `list_issues` — read `.cache/linear/work-status.yaml` and filter issues by milestone/cycle/status. 
4. Present results in a compact table (id, title, status, milestone) — not raw YAML. If nothing matches, say so and suggest `/lnr-sprint`.

Go through `skill:lnr-tracking-adapter`; honour `skill:lnr-session-policy` (cache-only reads). Active only when `tracking_system=linear`.
