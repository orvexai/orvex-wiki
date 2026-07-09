---
description: Create a Linear issue — find-before-create (warn on a likely duplicate), then create via the tracking adapter.
argument-hint: <issue title> [in milestone <name>] [parent ENG-10]
---

You are creating a Linear issue: **$ARGUMENTS**

Writes are **live** (real-time) via the adapter; reads are cache-first. Imported pattern: **find-before-create.**

1. **Freshness gate:** `_bmad/lnr/tools/linear-sync.sh check` (+ `sync` if stale).
2. **FIND-BEFORE-CREATE:** scan the cache (`.cache/linear/work-status.yaml`) for an existing issue with a same/near title in the same milestone. If a strong candidate exists, ASK one plain-English question (existing id + title vs. the new one) — reuse or create new? Wait for the reply. (`linearis` has no native dup-guard; this is the skill-level guard until `linear-cli` ships `issue create --dedupe` — see `docs/linear-cli/DESIGN.md` §6.1.)
3. Parse `$ARGUMENTS` into title + optional project-milestone (the issue's milestone) + optional parent (for a sub-issue). Resolve `team_key` / `linear_project` from `_bmad/custom/` config + `linear-mapping-template.yaml`; map the status via `status_map`.
4. Create via the adapter `create_issue`: `linearis issues create "<title>" --team <key> --project "<proj>" [--parent <parent-id>] [--status "<state>"]`. Assign the issue to its project-milestone (transport: verify the linearis/Linear flag; project-milestone assignment may require the Linear UI or a future linear-cli verb). Capture the returned `identifier`; refresh `_bmad/lnr/tools/linear-sync.sh issue <id>` (writes `.cache/linear/issues/<ID>.yaml`).
5. Surface the new identifier + url. On non-zero, **halt loud** (Linear is canonical; a partial write is worse than a halt).

Via `skill:lnr-tracking-adapter`; honour `skill:lnr-session-policy`. `tracking_system=linear` only.
