---
description: Add a comment to a Linear issue via the tracking adapter (live write).
argument-hint: <issue id> <comment body>
---

You are commenting on a Linear issue: **$ARGUMENTS**

**Live write** via the adapter.

1. Parse `$ARGUMENTS` into `<issue id>` + `<body>` (markdown + literal newlines supported).
2. Add via the adapter `add_comment`: `linearis issues discuss <id> --body "<body>"`. (This same channel carries durable signals like `baseline_commit:` today and the future `agent-status:` marker — see the linear-cli async protocol in `docs/linear-cli/DESIGN.md` §6.2.)
3. Confirm the comment landed (id). On non-zero, **halt loud**. No cache refresh needed unless the issue detail must include it (optional `_bmad/lnr/tools/linear-sync.sh issue <id>` — refreshes `.cache/linear/issues/<ID>.yaml`).

Via `skill:lnr-tracking-adapter`; honour `skill:lnr-session-policy`. `tracking_system=linear` only.
