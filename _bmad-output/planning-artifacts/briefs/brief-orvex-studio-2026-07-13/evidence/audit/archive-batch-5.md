# OPS Archive Audit — Batch 5 (slice [145, 174), sorted by slug)

Audited against `brief.md` (Product Brief: Orvex Studio, 2026-07-13).

| # | slug | title | classification |
|---|------|-------|----------------|
| 145 | jp8rEo0ED9 | Build Log — Stage 1 | process-noise |
| 146 | jpQdkE6J1O | AI Design Process | process-noise (fetched — body empty) |
| 147 | k92vkaGZLP | Build Log — r34929c9d | process-noise |
| 148 | kZtwOq4UJV | Build Log — r7bbc5ac9 | process-noise |
| 149 | klYZDJsSQr | Source-Neutral Skill Model | **CANDIDATE-GAP** |
| 150 | lCGVn3XvH8 | Phased Plan (P0 → P∞) | superseded-with-successor (audience/wedge re-ruled in brief; phase-gate discipline lives on in the Research Phase's exit criteria) |
| 151 | lsx7hVVV7q | Ingest Digest — Cascade, Add-ons and Overlay | process-noise |
| 152 | m2F8tasLCE | Blue Ocean Strategy Canvas — Orvex AI | superseded-with-successor (moat/positioning restated in brief's Problem + north-star) |
| 153 | m93DraUfSE | Memory & The Librarian — how they work | superseded-with-successor (reframe fully carried into brief's knowledge-loop + Librarian sections) |
| 154 | mYFtkVJxkk | Development Guide | process-noise |
| 155 | mZpdeXsms9 | MA1 — Onboarding & Memory (gate report) | process-noise |
| 156 | mb1Hn5ZGiP | Brainstorming — Initial Ideation | process-noise |
| 157 | n5WAqVxCgy | Social Features — Selected Features & Roadmap | **CANDIDATE-GAP** |
| 158 | nlGjdgMZYV | orvex-studio-core — Core Product API | superseded-with-successor (superseded by the current 16-service split described in the brief's delivery doctrine) |
| 159 | o5vH9O6xZc | Bare Test Page No Content | process-noise |
| 160 | oK7XRmPsn2 | Strategy & GTM — Hub | superseded-with-successor (pricing/wedge/positioning conclusions restated in brief Scope + audience ruling) |
| 161 | olRa0nwI89 | Ingest Digest — ChatGPT and Claude Responses | process-noise |
| 162 | pYnqge4a9r | Skill marketplaces we can standardize on (importable + open-licensed) | **CANDIDATE-GAP** (paired with 149) |
| 163 | pZwAf2vhXF | Memory, Reimagined | superseded-with-successor (hub page; content lives in psnxt8NlAL below, itself covered) |
| 164 | psnxt8NlAL | Design Brief — Memory, Reimagined | superseded-with-successor (living-portrait reframe fully present in brief's Memory description) |
| 165 | pt4OKaKQZr | Glossary — Domain Model | superseded-with-successor (Item/Section/Skill/Prompt vocabulary presumed carried in current Vision/CS as naming authority; brief uses the same vocabulary without redefining it) |
| 166 | qPhaIGcAAg | Orvex Prompt Studio — POC (Demo) | superseded-with-successor (this *is* the "Phase-1 monolith" the brief cites as shipped proof) |
| 167 | qTF4fTd1Wb | PRD: Orvex AI Studio — Phase 2 — Addendum | **CANDIDATE-GAP** |
| 168 | qmjV5Z5A01 | Engine Spike — emergent / free-form-wiki adaptation | superseded-with-successor (spike verdict feeds directly into the ratified Librarian brief's "structure learned not templated" decision, cited unmodified in brief.md) |
| 169 | qyZS8osfJE | MA3 — Skill Viewer & Builder (gate report) | process-noise |
| 170 | rX5EZLwzdm | Thesis & Lead Bets | superseded-with-successor (four bets restated as north-star / problem / moat language in brief) |
| 171 | rb6XvzAbCo | Technical Appendix | process-noise / superseded (pure engineering DDL for the retired craft2 experiment model, no product decision) |
| 172 | roYdpcvyee | Ingest Digest — Grok Response (schema) | process-noise |
| 173 | sSlV9zkXEA | Schema | process-noise (companion technical schema to Technical Appendix / craft2 experiment) |

**gap_count: 3** (klYZDJsSQr + pYnqge4a9r treated as one combined finding on skill-import sourcing; n5WAqVxCgy; qTF4fTd1Wb)

---

## CANDIDATE-GAP detail

### 1. Skill-import sourcing & licensing pipeline (klYZDJsSQr + pYnqge4a9r)

**What it is:** Two companion pages define how the community marketplace gets *seeded*: a
two-gate standard ("(1) machine-importable via git/API, (2) permissively licensed —
MIT/Apache-2.0/BSD/CC0 — so an open-source Orvex can redistribute") and a concrete shortlist
of sources cleared to import (anthropics/skills, claude-plugins-official, awesome-copilot,
awesome-cursorrules, BMAD-METHOD, etc.), explicitly ruling out GPT Store, Gemini Gems, and MCP
registries as not importable.

**Key line (pYnqge4a9r):**
> "We only standardize on skill sources that pass two gates: (1) the skills are
> machine-importable... and (2) the license lets an open-source product redistribute them...
> because Orvex itself will be open-source, we can only ingest content under a permissive
> licence."

**Why the brief may need it:** `brief.md` names "a marketplace skill" repeatedly as a core
ingredient of the Prompt Composer and mentions "community marketplace trust badges" as
explicitly Out-of-scope — but it never addresses *how the marketplace's initial skill catalogue
gets seeded* or the open-source-redistribution licensing constraint that gates it. Since Orvex's
AGPL/open-core posture is independently flagged as a live P2 research question in the brief
("AGPL/legal posture + Stripe severance"), this import-licensing gate is directly relevant
groundwork that risks being silently dropped rather than folded into that research item.

---

### 2. Marketplace social mechanics — creator profiles, forking, reviews (n5WAqVxCgy)

**What it is:** A features/roadmap analysis of the marketplace's social layer, confirming what
was already shipped in the POC (stars, saves, gated reviews, comments, suggestion/PR-style
edits, fork+lineage, claim via GitHub OAuth) and recommending the highest-leverage next moves:
creator profiles, surfacing existing signals, and a following graph — deliberately avoiding
likes/downvotes/open comment walls.

**Key line:**
> "The leverage isn't *adding* basic features — it's **creator profiles, surfacing the signals
> we already collect, and a following graph**... forking-with-attribution is the single
> highest-value mechanic; creator profiles are the keystone of reputation."

**Why the brief may need it:** `brief.md`'s Scope explicitly rules out only "community
marketplace trust badges" as Out — it says nothing about the broader shipped social/attribution
mechanics (forking with lineage, gated reviews, creator profiles) that this doc says are
*already built* and load-bearing for marketplace trust. If the umbrella brief's marketplace
concept silently drops these already-working, well-evidenced mechanics rather than folding them
into the Prompt Composer / marketplace scope, real shipped value could be lost or rebuilt from
scratch unnecessarily.

---

### 3. Persona demo-data graduation model (qTF4fTd1Wb)

**What it is:** A research digest (named-pattern survey across Notion, Airtable, Linear,
Monday.com, Mixpanel, Stripe, Salesforce, ERPNext, Claude.ai) resolving concrete UX/data-model
choices for persona demo-data onboarding: template-clone vs AI-generated seeding, `is_demo`
flagged-rows vs separate demo tenant, and three graduation models (clear-all, parallel-mode
switch, organic replacement) with named pitfalls (Odoo's "no easy way to delete sample data once
mixed in").

**Key line:**
> "Flagged rows (`is_demo` per record → selective clear, but every query must respect the flag)
> vs separate demo tenant/space (clean blast radius, trivially droppable, but graduation can't
> keep anything). Odoo's 'no easy way to delete sample data once mixed in' = cautionary tale for
> flag-less seeding."

**Why the brief may need it:** `brief.md`'s Scope explicitly commits to "persona demo-data
onboarding with ~8 persona versions (teachers first, per the wedge ruling)" as in-scope for this
program — but the brief never states which data-isolation/graduation model was chosen (flagged
rows vs separate tenant) or which seeding mechanic (template vs AI-generated vs hybrid). Given
the brief's own audience ruling supersedes the demo-data persona board (doctor/lawyer → teacher),
this research is the load-bearing prior art for the follow-on PRD work and risks being lost if
not explicitly pointed to.
