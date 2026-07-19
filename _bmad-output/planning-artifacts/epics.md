---
project: Orvex Studio (16-service family; run from orvex-wiki)
generated: 2026-07-14
stepsCompleted: [discovery-wiki-first, decompose-all-services, coverage-verify, code-audit, filed-in-linear]
inputDocuments:
  - wiki: every service PRD + Architecture (per-space, read live 2026-07-14; see breakdown/*/plan.json "sources")
  - wiki: Product Brief rgBOQh31p3 · Program plan 5eFdxN3edd · P1 prompt yXUWpQpRjx · Issue guide 9VUHxAcoXw
  - local: briefs/brief-orvex-studio-2026-07-13/evidence/* (current-state-map, per-space digests)
---

# Epics & Stories — Orvex Studio Phase 1/2 (authoritative pointer)

The PO ruled (2026-07-14) that Linear carries **no epic issues — projects + milestones only**.
The epic/story breakdown therefore lives as:

- **Linear (system of record for tracking):** initiative "Orvex Studio" → 16 service projects
  → per-service build milestones `B<n> — <feature area>` (133) → 575 story issues, each
  blocked-by its service's Definition Pack (ENG-2091..2110; contract TAG = dispatch gate).
  Hub tail: "P2 — Isolated Builds" gate, "P2.5 — Product Acceptance E2E", M11/M13/M14.
- **Full machine-readable breakdown (this repo):**
  `delivery-program-2026-07-13/p1-structure/breakdown/<service>/{plan.json, audit.json, bodies/*.md}`
  — plan.json holds the epic→story tree + FR coverage map (independently verified);
  audit.json + the story bodies carry the per-story code-audit state
  (178 present / 208 partial / 189 absent @ origin default branches, 2026-07-14).
- **Human-browsable map:** claude.ai/code/artifact/65bf8419-abb5-4bab-8857-42a3dbeced41
- **Filing receipts / resumable scripts:** `delivery-program-2026-07-13/p1-structure/`
  (linear-p1-structure.md, file-p1-structure.py, file-corpus.py, ledger*.json).

Coverage contract: every FR/NFR id in every service's PRD (orvex-wiki's fine-grained FRs live
in the folded Core Wiki Engine PRD `aleSxNZCb1`) is covered by ≥1 story; cross-service brief
features are distributed per the concept-to-service map, never 1:1.
