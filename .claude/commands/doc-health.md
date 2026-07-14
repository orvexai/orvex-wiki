---
description: Quick health snapshot of the project's living wiki — pending drafts, duplicate clusters, staleness/drift, and broken links. Read-only.
argument-hint: "[optional space slug; defaults to docmost_space]"
---

You are reporting the health of the project's living Docmost wiki. **Read-only** — do not author or mutate anything.

1. **Pre-flight:** `docmost-cli auth status --output json` (exit non-zero → ask the user to authenticate, then stop). Then `docmost-cli cache sync --space {docmost_space}`.
2. **Gather** (each `--output json`; branch on exit code + `errorCode`, never stderr text):
   - pending drafts awaiting ratification: `docmost-cli page list --filter 'status == "draft"' --space {docmost_space} --output json`
   - duplicate clusters (anti-sprawl, Goal 1): `docmost-cli verify duplicates --space {docmost_space} --output json`
   - stale canon: `docmost-cli verify staleness --older-than 180d --status canonical --output json`
   - aggregate health: `docmost-cli verify space --space {docmost_space} --output json`
3. **Summarize** concisely: number of drafts (with slugs to `/doc-ratify`), any duplicate clusters (candidates for `skill:doc-consolidate`), stale canonical pages (candidates for `skill:doc-drift`), and link/health issues. Recommend the next action — don't perform it.
