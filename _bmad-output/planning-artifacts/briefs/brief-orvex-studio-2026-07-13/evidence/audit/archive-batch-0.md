# OPS Archive Audit — Batch 0 (slugs sorted ascending, items [0,29))

Audited against `brief.md` (Product Brief: Orvex Studio, 2026-07-13).

| # | slug | title | classification |
|---|------|-------|----------------|
| 0 | 06Qf9DI3XY | Source Tree & Build System | process-noise |
| 1 | 15kAeEJBUf | orvex-studio-identity — Identity | superseded-with-successor (identity service canon, M9 closed) |
| 2 | 1BxDC4NwF8 | Storyboard — Orvex AI Studio: the 6-beat journey | superseded-with-successor (estate-agent narrative superseded by teacher-wedge ruling + Prompt Composer legibility bar) |
| 3 | 1XjirJsYjM | Data & Results — r34929c9d | process-noise |
| 4 | 27zfbMzkV9 | orvex-studio-web — UI / BFF | process-noise |
| 5 | 2HmR5OvjEP | PRD: orvex-prompt-studio-poc | superseded-with-successor (explicitly points to `PRD: Orvex — AI Knowledge & Prompt Manager`, S5r6j9Nban) |
| 6 | 2Jy9KQQN5p | Sources — r7bbc5ac9 | process-noise |
| 7 | 2KIcZG25kq | Model Derivation — Run blocktree (Typed Block Tree) | process-noise |
| 8 | 2L8YqtJ01k | MB1 — Export & Share: take a Skill anywhere | superseded-with-successor (cross-AI export folded into "composed into a prompt that works in any AI") |
| 9 | 2mAgXg9XEN | ADR-0003: The Skill Composition & Slot Model (Definitive) | superseded-with-successor (superseded by qPhaIGcAAg, canonical) |
| 10 | 2u4eSCvgeE | The REST API | process-noise |
| 11 | 3RKKioGvr9 | W5.c Live-Confirm Hand-Off — The Librarian | process-noise (gate handoff) |
| 12 | 3YfyRiq80m | ADR-0002: Composition by combination + AI render at build time | superseded-with-successor (skill-composition model superseded by ADR-0003 and current Prompt Composer design) |
| 13 | 3o4Otgdo4G | Rationale & Model Journey — r7bbc5ac9 | process-noise |
| 14 | 3tFjAG3GV9 | Product Ideas, Pricing & Decisions — Session Capture | superseded-with-successor (live twin at `nmIMlwFvHM` in current `orvexstudio` space, verified — same pricing table + feature-idea table) |
| 15 | 4FZPZnPhUG | Build Log — How This Run Was Produced | process-noise |
| 16 | 5C28VkHPIz | Workflow — Import & Normalization (per source) | process-noise |
| 17 | 5F9oRMvxJ4 | MB7 — Your Wiki: capture pages into your private Docmost space | superseded-with-successor (per-user wiki capture folded into current wiki-api / Librarian capture design) |
| 18 | 5LT8G9oFGA | Epics & Stories — The Librarian | process-noise |
| 19 | 5XuOmqkHyv | Ingest Digest — ADRs and Engineering Standards | process-noise |
| 20 | 5w6cniZVmA | M0 — Foundation: frozen contract, paved deploy, render+stream spikes | process-noise |
| 21 | 6D6KIq7jvL | Product | superseded-with-successor (pure index page pointing at PRD/Brief/Vision, all superseded in turn by current canon) |
| 22 | 71o7AMcrmE | Where content lives: Git, Postgres, and the publish bridges | process-noise |
| 23 | 7k78cteiH8 | System, Data & Infrastructure | process-noise |
| 24 | 7rpa8zncz6 | orvex-studio-control-plane — Control Plane | process-noise |
| 25 | 8kmKi4sYnZ | Vision — Knowledge & Prompt Management for AI (for everyone) | superseded-with-successor (superseded by CSqjqciAX9, the canonical Vision cited in the brief) |
| 26 | 8ojSFaGMn6 | MB2 — Improve with AI & capture-back: fix a Skill and learn from it | superseded-with-successor (Improve-with-AI + capture-back folded into current Prompt Composer / Librarian curation loop) |
| 27 | 9zbGknV9mu | How It Works — r34929c9d | superseded-with-successor (Recipe/Blank/Attachment model superseded by the typed-block Skill model, ADR-0003 → current canon) |
| 28 | ADCDZhdD7z | Design System | superseded-with-successor (token system for the marketplace/compiler product framing; current design canon covers Studio's UI) |

## Candidate gaps

None found in this slice (0 of 29). Every product-shaped title either (a) resolves to a live canonical successor already cited by or consistent with the brief (Vision `CSqjqciAX9`, PRD `S5r6j9Nban`, ADR-0003, the current Prompt Composer / Librarian design, identity service canon), or (b) is process/execution noise (gate reports, build logs, milestone DoD trackers, data/model-derivation runs) with no product-decision content.

One item worth a light cross-check rather than a gap: `3tFjAG3GV9` ("Product Ideas, Pricing & Decisions — Session Capture") carries two feature ideas — **Personal-data guard** (flag PII/SEND before it reaches the AI, enforced rather than advisory) and **AI-privacy setup** (ensure the connected AI is configured not to train on your chats) — that are present verbatim in its live successor `nmIMlwFvHM` (current `orvexstudio` space) but are NOT mentioned anywhere in `brief.md`. Because a live, current-canon successor exists and carries them forward, this does not qualify as an archive orphan under this audit's rule — it is at most a brief-vs-current-canon completeness question, out of scope for this batch. Flagging for visibility only, not counted in `gap_count`.
