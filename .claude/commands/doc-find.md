---
description: Find what the project's living wiki already holds for a concept — the wiki-first read. Resolves the living manual node (status-filtered) before any local-file reasoning.
argument-hint: <concept or page title>
---

You are resolving what the project's living Docmost wiki holds for: **$ARGUMENTS**

The wiki is the PRIMARY source of truth and **OUTRANKS local files** (see `{project-root}/_bmad/doc/data/wiki-first-mandate.md`). Resolve the WIKI first; never conclude "no such doc exists" from the filesystem.

1. **Pre-flight:** `docmost-cli auth status --output json` (exit non-zero → tell the user to run `docmost-cli auth login --instance <docmost_url> --token <api-key>`, then stop). Then `docmost-cli cache sync --space {docmost_space}`.
2. **Resolve** via `skill:doc-read-first`, or directly: `docmost-cli search '"$ARGUMENTS"' --cached --content --space {docmost_space} --output json`, then `docmost-cli page get <slug> --output json` for each strong hit. Grounding reads exclude draft / superseded / archived.
3. **Report:** does a living page exist? Its status (draft|canonical), slug, url, and a one-line summary of its current content. If several candidates match, list them. If none, say so plainly (it does not exist **in the WIKI**) and offer `/doc-capture` or `/doc-amend` to create it.

Use `docmost-cli` only — never Docmost HTTP or the cache files directly. Branch on exit code + the `errorCode` field, never on stderr text.
