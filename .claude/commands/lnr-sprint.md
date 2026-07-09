---
description: Show the current cycle and milestone status from the Linear cache — a compact board view. Read-only.
argument-hint: "[optional: milestone name, cycle, or status to filter]"
---

You are reporting cycle/milestone status from the Linear cache. **Read-only, cache-first.**

1. **Freshness gate:** `_bmad/lnr/tools/linear-sync.sh check`; sync if absent or stale.
2. Read `.cache/linear/work-status.yaml` from the repo-local cache (gitignored). For the milestone -> issues overview, `.cache/linear/milestone-map.md` is the rendered companion.
3. Present issues grouped by project-milestone (and, where relevant, by cycle), each with id + title + status. If `$ARGUMENTS` names a milestone, a cycle, or a status, filter to it.
4. Summarize: the current/next cycle (number + window) and counts by status (Backlog / Todo / In Progress / Done), and flag any issue with no milestone. Recommend the next action (e.g. `/lnr-status` to move one) — don't perform it.

Via `skill:lnr-tracking-adapter` (`list_issues`); honour `skill:lnr-session-policy`. `tracking_system=linear` only.
