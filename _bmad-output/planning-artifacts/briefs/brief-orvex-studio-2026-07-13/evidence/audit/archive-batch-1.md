# OPS archive audit — batch 1 (slice [29,58))

Sorted by slug ascending, indices 29-57.

| # | slug | title | classification |
|---|------|-------|----------------|
| 29 | AFGfODrpNF | Orchestrator Prompt — Delivery (Studio POC) | process noise — safely archived |
| 30 | AGHd9poFiW | Project Guidance: orvex-prompt-studio-poc | process noise — safely archived |
| 31 | AjZax93KN1 | Ingest Digest — 7-Marketplace Fit-Test | superseded-with-successor |
| 32 | ApOYJwtWnK | What We Will Not Build | superseded-with-successor |
| 33 | AyuKIfebxZ | Schema Fit-Test — 7 Marketplaces (Rigorous Report) | superseded-with-successor |
| 34 | BE2UiDyiuq | Sources — r34929c9d | process noise — safely archived |
| 35 | BEFuQFJJ9Q | Build — craft2 | process noise — safely archived |
| 36 | BPZKB5FGtS | Architecture: orvex-prompt-studio-poc | process noise — safely archived |
| 37 | BzQOCzZHoK | Tests & Results — Empirical Proof | process noise — safely archived |
| 38 | C7cAYETVoa | orvex-studio-memory — Knowledge & Memory | superseded-with-successor |
| 39 | C9ufBCuXsy | Design System — Orvex AI Studio | superseded-with-successor |
| 40 | CLPseCXJ0G | Services | process noise — safely archived |
| 41 | CLWCHCD9b3 | Technical Research: Prior Art & Landscape | superseded-with-successor |
| 42 | D1kbHAqvBN | Design & Experience | superseded-with-successor |
| 43 | DDYdpqRfzD | How Prompt Studio works: skill-agnostic in, agent-agnostic out | superseded-with-successor |
| 44 | DRP67l1a6q | Improve with AI — Scenario & Spec | superseded-with-successor |
| 45 | DRilyaXcs6 | Rationale & Model Journey — r34929c9d | superseded-with-successor |
| 46 | DfuPwiRg1U | Seeding & Backing Up a Dev Environment — Runbook | process noise — safely archived |
| 47 | DzildKswk3 | The Librarian — Comprehensive Feature Brief | superseded-with-successor |
| 48 | Ep145q0k4B | Per-Source Ingest Digests | process noise — safely archived |
| 49 | EwL9n2cWbZ | Routes & Endpoints | process noise — safely archived |
| 50 | F2ZCmMwoCb | Trigger Map: Target Groups & Personas — orvex-prompt-studio-poc | superseded-with-successor |
| 51 | FAgOW3FVRe | Prototype Component Inventory | process noise — safely archived |
| 52 | FFEW7pvlO7 | UX Scenarios — Index & Coverage (Orvex AI Studio) | superseded-with-successor |
| 53 | FTvQLOYrVH | Product Brief: The Librarian | superseded-with-successor |
| 54 | FigQsGN2dT | The Data Model | superseded-with-successor |
| 55 | G1D1aTINlk | HANDOVER — state and next steps | process noise — safely archived |
| 56 | G2GbLiYE3J | Orvex for Developers — the Deferred Product Line | superseded-with-successor |
| 57 | GXIk9t3cOe | Foundations & Engine | superseded-with-successor |

## Notes on the superseded-with-successor calls

- **AjZax93KN1 / AyuKIfebxZ / DRilyaXcs6** (schema fit-test family): detailed persona+workflow+rule/cascade
  schema derivation and marketplace-import gap analysis for the skill/prompt data model. Deep and rigorous,
  but the brief's Prompt Composer / marketplace-skill-import description sits at a much higher altitude and
  this is exactly the kind of import-schema research the current `craft2` / composer architecture already
  absorbed (per `G2GbLiYE3J`'s reference to "the proven 4-kind, 20-block deterministic skill model"). No
  orphaned decision found — the RULE-noun / applyTo-glob gap reads like a closed, absorbed finding, not a
  live open question.
- **ApOYJwtWnK** ("What We Will Not Build"): near-total overlap with the brief's Scope §Out. One line not
  echoed verbatim in the brief — "Kanban management board (tiny 'My skills' list only in Phase 1)" — is too
  minor/UI-specific to flag as a gap.
- **C7cAYETVoa** (Memory service): matches the brief's Memory description (erasure-first, <500ms, own
  cluster) closely; brief's "Memory" section is a faithful restatement.
- **C9ufBCuXsy / D1kbHAqvBN** (Design System): C9ufBCuXsy's `orvex-ds.css` adoption is itself flagged inside
  D1kbHAqvBN as retired in favor of the `orvex-studio-gallery` canonical visual design — an explicit
  in-archive supersession, so a live successor is named.
- **DzildKswk3 / FTvQLOYrVH** (Librarian briefs): both are earlier/parallel drafts of the Librarian concept;
  the brief explicitly cites the ratified successor `fr7YaPq8Tl` ("Product Brief: The Librarian") and says
  its 11 decisions "stand unmodified."
- **F2ZCmMwoCb** (Priya/Sam/Lena/Tomás flywheel personas): superseded by the brief's persona ruling (Priya
  primary, Laura as launch wedge, ~8 persona versions) — the flywheel's creator/improver/shaper roles are not
  restated, but nothing here reads as an orphaned decision the brief needs; it's evolutionary persona
  refinement, not a scope ruling.
- **FigQsGN2dT** (old 4-table playbooks/fields/rules/personalizations schema): plainly superseded by the
  much later persona+workflow+cascade schema documented in the fit-test family above.
- **G2GbLiYE3J** (deferred developer product): explicitly named in the brief's Scope §Out ("the developer
  product (deferred, funded by Phases 1–3)").

## CANDIDATE-GAPs

None found in this slice. Every product-shaped page in [29,58) either restates ground already covered by
the brief or names/implies an explicit live successor already cited by the brief or by a sibling archive
page. The schema/model-derivation cluster (AjZax93KN1, AyuKIfebxZ, DRilyaXcs6, FigQsGN2dT) is thorough and
rigorous but sits below the brief's altitude and reads as absorbed research, not an orphaned ruling.
