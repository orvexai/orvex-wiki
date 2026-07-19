# Orvex Studio Delivery/Build-Plan — Consolidation Map

**Purpose:** one map so no reader is ever confused about *which page is the plan* and *which pages are the machinery that plan invokes*. Every delivery/build-plan page in the Studio wiki is placed into exactly one layer, with a single disposition and a named successor/target.

---

## 1. The single source of truth

**The one authoritative delivery plan is `5eFdxN3edd` — "Delivery Program — Robust Tested Deployment (Phases 0–3)."**

Everything else is either (a) a *phase or machinery page this plan invokes*, or (b) a *superseded / historical artifact* that predates it. There is exactly one plan of record; there are no rival top-level programmes.

**Canonical reading order (top → bottom):**

```
PROGRAM  →  5eFdxN3edd  (the 4-phase plan of record)
              │
   PHASES  ───┼── yXUWpQpRjx   Phase 1 · Definition Factory
              ├── Ng66su4dVG   Phase 2 · Isolated Builds   ← parallel-build-plan folds in here
              └── ErYdXzIj6g   Phase 2.5 · Product Acceptance
              (Phase 3 cutover prompt = not yet authored)
              │
MACHINERY  ───┼── gkkUDzn277   Delivery Orchestrator (Act-3 loop) — invoked by every phase
              ├── UKanXYLCQD   Foundation Orchestrator (per-repo M1–M8 substrate)
              ├── 9VUHxAcoXw   Issue Authoring Prompt
              ├── GG6RzEvtWh   Milestone Dashboard — Template
              └── KNZMCOKAV8   Delivery Prompts (landing/index)
```

Read `5eFdxN3edd` first to understand the shape of the program; drop into a phase prompt to run that phase; the phase prompts *cite* the machinery pages rather than restating them.

---

## 2. The layer model — "the PLAN" vs "the MACHINERY"

The whole confusion in this cluster comes from machinery pages (orchestrator prompts) reading like top-level programmes because they carry their own PO-stops and run-to-Done loops. Separate them cleanly:

### Layer A — THE PLAN (altitude: program)
- **`5eFdxN3edd`** is the plan. It defines *what phases exist, in what order, with what gates*: Phase 0 Stabilize → Phase 1 Definition Factory → Phase 2 Isolated Builds → Phase 2.5 Product Acceptance → Phase 3 cutover.
- The three **phase prompts** (`yXUWpQpRjx`, `Ng66su4dVG`, `ErYdXzIj6g`) are *chapters of the plan* — each nests under `5eFdxN3edd` and hands off to the next by a contract/gate. They are still "plan," just phase-scoped.

### Layer B — THE MACHINERY (altitude: reusable engine)
- Orchestrator prompts and templates that the plan/phases *invoke but do not own*: `gkkUDzn277` (Act-3 Delivery loop), `UKanXYLCQD` (Foundation substrate), `9VUHxAcoXw` (Issue Authoring), `GG6RzEvtWh` (dashboard template), `KNZMCOKAV8` (prompt index).
- These are shared, phase-agnostic engines. They must never be read as competing plans. **Fix: each machinery page gets a one-line "Role: MACHINERY invoked by the Delivery Program `5eFdxN3edd`; not a standalone programme" banner + forward link.**

### Layer C — HISTORICAL / SUPERSEDED (altitude: artifact)
- Point-in-time records that predate or are overtaken by the current plan: `cLWfnuXCWb` (old flat M0–M14 roadmap), `7K0lWqrgMJ` (dated prompt drift-correction), `cjv9Q4RuyI` (dated Foundation rollup snapshot).

**One-sentence rule for readers:** *If a page tells you the order of the phases, it is the plan (`5eFdxN3edd`). If it tells you how to run a loop, it is machinery. If it is dated, it is history.*

---

## 3. Per-page dispositions

| Page | Title | Layer / Class | Disposition | Successor / Target |
|---|---|---|---|---|
| **5eFdxN3edd** | Delivery Program — Robust Tested Deployment (Phases 0–3) | A · PLAN (current-authoritative) | **KEEP** — the single source of truth | — (is the target) |
| **yXUWpQpRjx** | Orchestrator Prompt — Phase 1: Definition Factory | A · PLAN (phase) | **KEEP** | nests under `5eFdxN3edd`; hands to `Ng66su4dVG` |
| **Ng66su4dVG** | Orchestrator Prompt — Phase 2: Isolated Builds | A · PLAN (phase) | **KEEP** + absorb parallel-build-plan | under `5eFdxN3edd`; receives `parallel-build-plan.md` staffing overlay |
| **ErYdXzIj6g** | Orchestrator Prompt — Phase 2.5: Product Acceptance | A · PLAN (phase) | **KEEP** | under `5eFdxN3edd`; gated on Phase-2 exit |
| **gkkUDzn277** | Orchestrator Prompt — Delivery (Act-3) | B · MACHINERY | **ADD-CROSSREF** | add "MACHINERY of `5eFdxN3edd`; invoked by all 3 phase prompts" banner |
| **UKanXYLCQD** | Orchestrator Prompt — Foundation | B · MACHINERY | **ADD-CROSSREF** | add forward link to `5eFdxN3edd` (per-repo substrate, not a rival programme); TBDs reconcile w/ parallel-build-plan |
| **9VUHxAcoXw** | Issue Authoring Prompt | B · MACHINERY | **KEEP** (cited machinery) | referenced by `5eFdxN3edd`, `KNZMCOKAV8`, phase prompts |
| **GG6RzEvtWh** | Milestone Dashboard — Template | B · MACHINERY | **KEEP** + refresh stale "TBD/none" body | template feeding dashboards; not a plan |
| **KNZMCOKAV8** | Delivery Prompts (landing) | B · MACHINERY (index) | **ADD-CROSSREF** | add Delivery Program `5eFdxN3edd` + Foundation `UKanXYLCQD` + P1/P2/P2.5 prompts to the index |
| **cLWfnuXCWb** | Delivery Overview — Orvex Studio | C · SUPERSEDED (stale roadmap) | **FOLD-INTO-OTHER** then **SUPERSEDE-TO-ARCHIVE** | fold live dashboard machinery (Linear embeds, dashboard index, Frontier block) into `5eFdxN3edd`; supersede the flat M0–M14 roadmap → archive, successor `5eFdxN3edd` |
| **7K0lWqrgMJ** | Drift correction — Delivery Orchestrator prompt | C · HISTORICAL (one-off note) | **SUPERSEDE-TO-ARCHIVE** | corrections already landed on `gkkUDzn277`; archive as provenance, successor `gkkUDzn277` |
| **cjv9Q4RuyI** | Studio Family Foundation Rollup (2026-07-06) | C · HISTORICAL (dated snapshot) | **MARK-HISTORICAL** | stamp "dated snapshot, overtaken by 2026-07-13 census"; producer `UKanXYLCQD`; do not treat "next actions" as live backlog |

---

## 4. The new parallel-build-plan's home

`parallel-build-plan.md` (local, 2026-07-13) is **not a new plan** — it is a *team-allocation / staffing overlay for Phase 2*. Its core claim ("the contract tag is the one unlock") is already **Rule 1 (contract-first dispatch)** inside `Ng66su4dVG`. If it lands as a sibling page, it becomes a third thing that looks like a rival plan. It must not.

**Recommended home:**
1. **Primary:** fold it into **`Ng66su4dVG` (Phase 2: Isolated Builds)** as a new **"Capacity & Team Allocation"** section. Its genuinely-new content is the staffing model — Phase A Platform critical path, 8 domain teams (Identity&Workflows, Knowledge&AI, Product BFF&Billing, Wiki engine, Agent surfaces, Staging&Workgraph, Human surfaces), the standing Integration team, and the load-balancing/greenfield-vs-verify-harden staffing note. That is a Phase-2 capacity overlay, exactly where `Ng66su4dVG` already has a Capacity section.
2. **Secondary:** add a **one-line pointer from the program plan `5eFdxN3edd`** ("Phase-2 team allocation: see the Capacity & Team Allocation section of `Ng66su4dVG`") so program readers can find it, without duplicating it.
3. **Do NOT** place it in `KNZMCOKAV8`, `gkkUDzn277`, or `UKanXYLCQD`, and do NOT publish it as a standalone sibling plan.

Result: one plan (`5eFdxN3edd`), one Phase-2 prompt that owns the allocation (`Ng66su4dVG`), zero rival build plans.

---

## 5. SAFE FOLDS (do now) vs SUPERSESSIONS (need PO confirm)

### SAFE FOLDS — non-destructive breadcrumbs, execute now (no page is retired)
These only *add* cross-refs / sections. Nothing is archived, nothing loses content.

- **S1** — Add "MACHINERY of `5eFdxN3edd`" banner + forward link to `gkkUDzn277`.
- **S2** — Add forward link from `UKanXYLCQD` to `5eFdxN3edd` (mark as per-repo substrate, not a rival programme).
- **S3** — Add Delivery Program + Foundation + P1/P2/P2.5 prompt links to the `KNZMCOKAV8` index.
- **S4** — Fold `parallel-build-plan.md` into `Ng66su4dVG` as the "Capacity & Team Allocation" section + add the one-line pointer from `5eFdxN3edd`.
- **S5** — Fold `cLWfnuXCWb`'s *reusable dashboard machinery* (Linear embeds, dashboard subpage index, Frontier block) into `5eFdxN3edd`. (The fold is safe; retiring the old roadmap is S-confirm below.)
- **S6** — Refresh the stale "TBD/none" milestone body on `GG6RzEvtWh` (content fix, not a retirement).

### SUPERSESSIONS — retire/archive a canonical page, **require PO confirm** (never auto-done)
Each of these archives a page that is (or was) canonical. Do not execute without explicit PO sign-off.

- **P1** — **`cLWfnuXCWb`** (canonical, ratified 2026-07-06): after the S5 machinery fold completes, supersede the flat M0–M14 roadmap → archive, successor `5eFdxN3edd`. *Archiving a canonical programme page — PO confirm required.*
- **P2** — **`7K0lWqrgMJ`**: supersede the dated drift-correction note → archive (corrections already inline on `gkkUDzn277`), successor `gkkUDzn277`. *PO confirm.*
- **P3** — **`cjv9Q4RuyI`**: mark historical / archive the dated Foundation rollup, successor = 2026-07-13 census. *Lighter weight (already clearly dated), but still a PO confirm to move it out of the live set.*

**Rule:** S1–S6 are reversible breadcrumbs — proceed. P1–P3 remove pages from the canonical live set — hold for PO.

---

## 6. Confusion risks resolved — the "two plans that looked like rivals" pairs

| # | The pair that read as rivals | Why it looked like two plans | How the map disambiguates |
|---|---|---|---|
| R1 | `cLWfnuXCWb` (flat M0–M14 roadmap) **vs** `5eFdxN3edd` (4-phase program) | Two different top-level roadmaps of the same delivery, different shapes, both look authoritative | `5eFdxN3edd` is the sole plan of record; `cLWfnuXCWb` is superseded — its dashboard machinery folds in (S5), its roadmap is archived (P1) |
| R2 | `gkkUDzn277` (Delivery Orchestrator) **vs** `5eFdxN3edd` (the program) | The Act-3 prompt carries its own PO-stop + run-to-Done loop and never mentions the program, so it reads as a rival top-level programme | Layer model: `gkkUDzn277` is MACHINERY *invoked by every phase* of `5eFdxN3edd`; banner + forward link added (S1) |
| R3 | `UKanXYLCQD` (Foundation M1–M8) **vs** `5eFdxN3edd`/phase prompts | Per-repo M1–M8 stages have no forward link, so they can be mistaken for program phases competing with P1/P2/P2.5 | Different altitude: per-repo *substrate*, not program phases; forward link added (S2) |
| R4 | `parallel-build-plan.md` (new) **vs** `5eFdxN3edd` **and** `Ng66su4dVG` | A fresh standalone "build plan" whose "tag = unlock" thesis is already Phase-2 Rule 1 — a would-be third plan | It is a Phase-2 staffing overlay, not a plan; folds into `Ng66su4dVG` Capacity section + pointer from the program (S4) |
| R5 | `KNZMCOKAV8` (Delivery Prompts landing) **vs** `cLWfnuXCWb` (Delivery Overview) | Two landing/index pages with overlapping link sets, both predating the current program | Both are pre-program indexes; `KNZMCOKAV8` stays as the machinery index but is updated to point at `5eFdxN3edd` + phases (S3); `cLWfnuXCWb`'s index role folds into the program (S5) then archives (P1) |
| R6 | `cjv9Q4RuyI` "next actions" read as a live backlog | A dated results snapshot whose ranked next-actions look like current work | Marked historical, superseded by the 2026-07-13 census (P3) — a record, not a backlog |
