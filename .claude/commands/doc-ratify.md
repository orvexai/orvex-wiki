---
description: Promote pending wiki drafts (and draft drift-revisions) to canonical via explicit human confirmation — one plain-English question per decision. AI never self-promotes.
argument-hint: "[optional: a page slug or topic; omit to review all pending drafts]"
---

You are ratifying living-wiki drafts to canonical: **$ARGUMENTS**

Promotion to canonical is a HUMAN act (P6) — you facilitate, you never self-certify.

1. **Pre-flight:** `docmost-cli auth status --output json` (exit non-zero → ask the user to authenticate, then stop). Then `docmost-cli cache sync --space {docmost_space}`.
2. **Ratify:** invoke `skill:doc-ratify`. It surfaces pending drafts (scoped to `$ARGUMENTS` if given, else all), runs the one-question-at-a-time ratification voice (with the delight-review for root / section landings), and on the human's explicit confirmation promotes via `docmost-cli page update <slug> --status canonical --ratify-token <token>` (the server rejects service-account / self promotions; note there is **no `--space`** on `page update`).
3. **Report** what was promoted (url/slug each) and what remains pending.

Never promote without an explicit per-page human "yes". Branch on exit code + `errorCode`, never on stderr text.
