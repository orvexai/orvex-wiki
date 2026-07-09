---
description: Ask a question and get a cited answer grounded in the project's living wiki (RAG), instead of guessing or relying on possibly-stale local context.
argument-hint: <question about the project>
---

You are answering a factual question about the project from its living Docmost wiki: **$ARGUMENTS**

Prefer the wiki over guessing or stale local context — the wiki outranks local files.

1. **Pre-flight:** `docmost-cli auth status --output json` (exit non-zero → ask the user to authenticate, then stop).
2. **Ask:** `docmost-cli ai ask "$ARGUMENTS" --output json` — a citation-grounded answer over the whole workspace (it is workspace-scoped: **no `--space` flag**; draft/superseded/archived are quarantined, so every citation is currently-true canon).
3. **Present** the answer with its citations (page title + slug/url). If it returns no citations or exits 1 `SEARCH_MODE_UNAVAILABLE`, fall back to `docmost-cli search "$ARGUMENTS" --cached --content --space {docmost_space} --output json` + `docmost-cli page get <slug> --output json`, and **say** you fell back.

Never fabricate an answer the wiki doesn't support. Branch on exit code + `errorCode`, never on stderr text.
