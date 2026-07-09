---
description: Move a Linear issue to a new workflow state via the tracking adapter (live write).
argument-hint: <issue id> <target status>
---

You are updating a Linear issue's status: **$ARGUMENTS**

**Live write** via the adapter; then refresh the cache.

1. Parse `$ARGUMENTS` into `<issue id>` + `<target status>`. Map the BMAD status to the Linear state name via `status_map` in `_bmad/custom/linear-mapping-template.yaml` (the state name must match the team's workflow exactly).
2. Update via the adapter `update_status`: `linearis issues update <id> --status "<state>"`, then `_bmad/lnr/tools/linear-sync.sh issue <id>` to refresh the cache (`.cache/linear/issues/<ID>.yaml`).
3. Confirm the new state back to the user (id, old → new). On non-zero, **halt loud** and name the issue + the raw error.

Via `skill:lnr-tracking-adapter`; honour `skill:lnr-session-policy`. `tracking_system=linear` only.
