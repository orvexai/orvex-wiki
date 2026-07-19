# OPS Archive Audit — Batch 2 (slice [58, 87))

Audited against `brief.md` (Product Brief: Orvex Studio, 2026-07-13).

| # | slug | title | classification |
|---|------|-------|-----------------|
| 58 | HD9ky5WSVU | Pivot — Staging Area (the radical rebuild) | superseded-with-successor |
| 59 | HRofbzwwa9 | Library Schema (PostgreSQL) — Entities, Blocks & Attribution | superseded-with-successor |
| 60 | Hqflejyft9 | Research — Landing Page & Onboarding Tour: Winning Attention Within Seconds | superseded-with-successor |
| 61 | IFgO7DoGMa | BUILD-PLAN — Memory, Reimagined: the Living Portrait (memory screen only) | superseded-with-successor |
| 62 | J2n3SeVFB5 | Memory Editor — Scenario & Spec | superseded-with-successor |
| 63 | JCkeerxYhb | Trigger Map: Feature-Impact Analysis — orvex-prompt-studio-poc | process noise — safely archived |
| 64 | JDvrKcC0Gp | Ingest Digest — Prior Art and Landscape | CANDIDATE-GAP |
| 65 | JT1ZpgGTFx | Unified Skill Data Model — Build Spec | superseded-with-successor |
| 66 | JrzfaT2dre | Orvex AI Studio Phase 2 — Docmost Team Requirements | superseded-with-successor |
| 67 | JxBsy5ThTt | Skill Rendering & Import Quality — Process Runbook | process noise — safely archived |
| 68 | K1h0IbSxyK | Roles & Portals | superseded-with-successor |
| 69 | KF2n9jN9BM | AI Playbooks — Run r2b6fa190 | process noise — safely archived |
| 70 | KeREQUiGjA | First-Run + Home / App-Shell — Scenario & Spec | superseded-with-successor |
| 71 | KhVZKcsmYq | orvex-studio-ai — AI / Jobs & Shared-Knowledge | superseded-with-successor |
| 72 | LmSbw8iCyW | orvex-studio-contracts — Contracts & CI | superseded-with-successor |
| 73 | MEcmPZvEdV | Card Contract — The Librarian (contract_version: 1, FROZEN) | superseded-with-successor |
| 74 | N3IPMiOWix | Marketing / Sales Landing + Sign-Up — Scenario & Spec | superseded-with-successor |
| 75 | NOiHLttXt4 | MC3 — Demo Hardening & Whole-PRD Dress Rehearsal | process noise — safely archived |
| 76 | Nu970wBBTm | MB5 — GitHub Import, Stars, Claim & Sync: real external Skills | CANDIDATE-GAP |
| 77 | OaBqmwsW6H | System Architecture Diagram | superseded-with-successor |
| 78 | OtOQ1WxxCA | Reference | superseded-with-successor |
| 79 | P2mbhAv7SI | Memory, Reimagined — UX Design (level-up addendum) | CANDIDATE-GAP |
| 80 | P9M4KO7MJX | orvex-studio-transport — Transport / MCP | superseded-with-successor |
| 81 | PAaZG0WpDN | Ingest Digest — Library Schema and Glossary | superseded-with-successor |
| 82 | PefPaoTXwr | Add-ons & Layers — SQL Schema | superseded-with-successor |
| 83 | PuZLHOWOT9 | Orchestration Plan — Validating Orvex's v1 Model & Harvesting Phase-2 | superseded-with-successor |
| 84 | Q1Gy4MpjjM | The Model — Building Blocks (TBT) | superseded-with-successor |
| 85 | Q8dy3WZZyw | Model Run — r7bbc5ac9 · Skillcraft | process noise — safely archived |
| 86 | QOrMhXrjes | Orvex AI Studio Phase 2 — MCP Team Requirements | superseded-with-successor |

## CANDIDATE-GAP detail

### 64 — JDvrKcC0Gp — Ingest Digest: Prior Art and Landscape

**What it is:** A technical-research digest (Squads A/B/C) surveying 18 competing prompt-management
tools for prior art on how they render an assembled/composed prompt.

**Key line:**
> "ZERO of 18 surveyed prompt-mgmt tools ship a UI that visualizes an assembled prompt with
> per-piece attribution back to the layer that contributed it — the closest primitives
> (Langfuse Composability, PromptLayer Snippets, Helicone Partials, Latitude PromptL) are all
> one-level string-substitution that renders to a flat string and stops; so Orvex's
> cascade-anatomy-with-attribution is a genuinely empty competitive slot."

**Why the brief may need it:** The brief's Prompt Composer section (§ "Consumption — the Prompt
Composer") describes composing marketplace skill + tweaks + Memory + wiki into a prompt, and
separately rules the prompt editor a "flagship quality bar," but never states this specific
competitive-whitespace claim — that showing per-source attribution inside the assembled prompt
(which layer/skill/memory contributed which part) is a differentiator nothing else in the market
does. This is a positioning/UX claim, not just an implementation detail, and it has no obvious
live successor page in the audited slice or in the brief's Prompt Composer framing. Worth folding
into the Composer's design principles or PRD so the "most amazing prompt editor" claim carries
this concrete, evidenced differentiator rather than staying implicit.

### 76 — Nu970wBBTm — MB5: GitHub Import, Stars, Claim & Sync: real external Skills

**What it is:** A shipped Phase-1 milestone (M11/15, closed) specifying a source-flexible importer
that pulls external skills (e.g. from "awesome-prompts" on GitHub) into the marketplace, vets them
(safety + file scan), shows live synced GitHub star counts, and lets a user claim a skill via
GitHub OAuth.

**Key line:**
> "Live import from awesome-prompts maps external formats onto the Skill model and indexes for
> search at scale (100K load-test latency within search NFR)... a user can claim a Skill via live
> GitHub OAuth."

**Why the brief may need it:** The brief's Scope section explicitly names "chat-history import" as
the one import feature in scope, and describes the Prompt Composer as consuming "a marketplace
skill" as a given input — but never says where marketplace skills themselves come from. This
shipped Phase-1 feature (bulk-importing and vetting external skill content from GitHub, with
star-sync and claim flows) is a real, delivered capability with no mention in the brief and no
visible successor page in this slice. Since the brief's Prompt Composer depends on a populated
marketplace, the mechanism that populates/refreshes it (GitHub import + claim + vetting) looks
like scope the umbrella brief may have silently dropped rather than deliberately retired.

### 79 — P2mbhAv7SI — Memory, Reimagined — UX Design (level-up addendum)

**What it is:** A PO-directed, binding v2 addendum to the Memory ("Living Portrait") UX design,
replacing a single static prose column with a structured, navigable, "living" memory surface:
typed memory items (prose/chip-set/key-value/list/table) organized into browsable Areas with a
persistent navigator and search, plus animated "life" (new items glow/settle, memories fly in from
chat).

**Key line:**
> "v1 rendered 'you' as a single warm prose column. It reads nicely with 10 memories and collapses
> with 100 — thin... and static... The fix is three structural moves: Structure — a navigable home
> of Areas with progressive disclosure, a persistent navigator, and search. Holds 1000 memories,
> still calm. Atoms — the unit is a typed memory item... Life — recent items glow and settle in,
> counts tick, memories fly from the chat onto the page."

**Why the brief may need it:** The brief calls Memory "the most amazing, easy-to-use memory
system in the world for non-technical people" and treats it as core (RAM layer of the three-layer
context system), but says nothing about how a large, growing memory store stays browsable/legible
at scale — this addendum is the concrete UX answer (typed atoms + Areas + navigator) to exactly the
scaling problem ("collapses with 100 memories") the brief's ambition implies. It reads as a
still-binding design ruling (PO-authored, explicitly supersedes v1) with no successor page visible
in this slice, and is different in kind from the already-covered Librarian/curation-ritual content
— it is about how the Memory surface itself scales and stays readable, which the brief is silent
on.
