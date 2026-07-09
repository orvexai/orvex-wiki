---
description: Capture a decision, insight, or piece of knowledge from this conversation into the living wiki as durable canon (never dated scratch). Routes through doc-amend (find-before-create, amend-in-place, draft).
argument-hint: <what to capture — e.g. "our decision to use Postgres over Mongo">
---

You are capturing durable knowledge from this conversation into the project's living Docmost wiki: **$ARGUMENTS**

This is durable canon (P2), **not** ephemeral scratch. Do NOT spawn a dated file or a `-v2`.

1. **Extract** from the conversation context the unit to capture, and classify its `doc_type` from `{project-root}/_bmad/doc/data/taxonomy.md`. Common cases:
   - a **decision** → `adr` — structure it Context → Decision → Rationale → Options considered (pros/cons each) → Consequences (both positive and negative) → Status (proposed|accepted) + Date. (`adr` is one of the three dated/append types.)
   - a durable **explanation / how-to / concept / finding** → the matching living doc-type (`glossary`, `runbook`, `technical-spec`, `research`, `user-guide`, …), update-in-place.
2. **Pre-flight:** `docmost-cli auth status --output json` (exit non-zero → ask the user to authenticate, then stop).
3. **Route** via `skill:doc-amend`: it find-before-creates across drafts AND canonical, ASKs one plain-English question on a fuzzy match, and AMENDs the existing node in place (current-state-only, P4) or CREATEs at `--status draft` (NEVER `--status canonical` — AI never self-promotes; promotion is `/doc-ratify`).
4. **Surface** the resulting url/slug and that it lands as DRAFT pending human ratification. If `docmost-cli` is unavailable, WARN and name the unsynced local draft; do not silently keep it local-authoritative.
