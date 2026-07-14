---
description: Route a content unit or local artifact into the project's living wiki — find-before-create, ask-when-ambiguous, amend the affected sections in place at draft. The standard wiki write path.
argument-hint: <file path or topic to route into the manual>
---

You are routing content into the project's living Docmost wiki: **$ARGUMENTS**

The manual node is authoritative; a local file is a transient working draft.

1. **Pre-flight:** `docmost-cli auth status --output json` (exit non-zero → ask the user to authenticate, then stop). Then `docmost-cli cache sync --space {docmost_space}`.
2. **Amend:** invoke `skill:doc-amend` with the content unit (resolve `$ARGUMENTS` to a file path or an in-context unit) and its `doc_type` from `taxonomy.md`. doc-amend will: READ the living node (status-filtered) → FIND-BEFORE-CREATE across drafts AND canonical → ASK one plain-English question on a fuzzy match → AMEND only the affected sections in place (current-state-only, P4; never rewrite the protected story / tldr / "how this manual works" zones) → else CREATE at `--status draft` (NEVER `--status canonical`).
3. **Surface** url/slug; note it lands as DRAFT pending human ratification (`/doc-ratify`).

Walk `{project-root}/_bmad/doc/data/decision-order.md` for any non-obvious routing. `docmost-cli` only; branch on exit code + `errorCode`, never on stderr text.
