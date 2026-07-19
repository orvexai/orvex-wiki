# OPS Archive Audit — Batch 3 (slice [87, 116))

Audited against `brief.md` (Product Brief: Orvex Studio, 2026-07-13).

| # | slug | title | classification |
|---|------|-------|----------------|
| 87 | QTXXaBTKxa | Technical Appendix | process-noise — DDL/schema appendix for the abandoned "AI Playbooks" spike, no product content |
| 88 | QeyS4DYUrR | Architecture & Engineering | superseded-with-successor (index page; children individually assessed below) |
| 89 | QhQLly37ud | Persona | superseded-with-successor (persona-schema survey folded into current Librarian/persona-model canon) |
| 90 | Rc8raiGfWg | Addendum — Phase 1 | superseded-with-successor (explicitly says Phase-∞ depth "preserved for reference," not live) |
| 91 | RpBg6Diub2 | Marketplace — Scenario & UX Spec | **CANDIDATE-GAP** |
| 92 | S2rB4jq6Fg | Ingest Digest — Vision and Reasoning | superseded-with-successor (early pivot reasoning, absorbed into current three-layer vision) |
| 93 | S5r6j9Nban | PRD: Orvex — AI Knowledge & Prompt Manager | superseded-with-successor (whole-product PRD superseded by current Vision + service PRDs) |
| 94 | SLTbsGhmiG | Experience Spec | superseded-with-successor (page itself states it's partially superseded by two later specs) |
| 95 | T0zq9bvrs9 | Market Research — Does Orvex Already Exist? | superseded-with-successor (dated competitive research, background evidence not a scope decision) |
| 96 | TMaaxw0kRZ | BUILD-PLAN — Memory Portrait | **CANDIDATE-GAP** |
| 97 | TURhpU808V | Workflow | superseded-with-successor (agent-workflow-schema survey, engineering research not product scope) |
| 98 | TeaMBF6Wz6 | W5.d Final Gate — The Librarian | process-noise — gate report |
| 99 | Ts48nnY0Xt | Persona — Import & Normalization (per source) | superseded-with-successor (import pipeline detail; chat-history import already covered in brief) |
| 100 | UF4Sa334xK | Master Design & Build Brief | superseded-with-successor (explicit successor: XeeA4XoUVw) |
| 101 | ULRhRXDSo1 | Spike — Nail the Data Model (Developer Brief) | superseded-with-successor (throwaway spike per its own text) |
| 102 | UsKnPgaZ7u | Epics: Orvex AI Studio | process-noise — delivery epics/story breakdown |
| 103 | V1WeQOMznz | The Librarian | superseded-with-successor (index stub; the live Librarian brief is `fr7YaPq8Tl`, cited in brief.md) |
| 104 | VKfwA7maQS | Open Questions, Non-Negotiables & Out-of-Scope | superseded-with-successor (old marketplace data-model non-negotiables; folded into family ADRs) |
| 105 | WA9A1sEol7 | Product Brief: Orvex Prompt Studio | superseded-with-successor (earlier product brief, directly superseded by the brief under audit) |
| 106 | WnbOq8eqRS | The Model — craft2 v3.2 | superseded-with-successor (skill-authoring block model; brief's "marketplace skill" concept assumes this substrate exists, doesn't need to restate it) |
| 107 | X0B8J3UPFv | Factors of Competition — How Orvex Compares | superseded-with-successor (explicit successor: t1lizeJLTy) |
| 108 | XERodsw9d6 | Add-ons, Layers & the Cascade | superseded-with-successor (marketplace base/add-on composition mechanics; product pivoted away from the marketplace-of-bases model this describes) |
| 109 | XeeA4XoUVw | Architecture: Orvex Prompt Studio — Microservice Platform | superseded-with-successor (old master architecture; current family ADRs / per-service architectures are the live successor per brief's "31/32 family ADRs canonical") |
| 110 | XgG8EywujM | Delivery Report — Skill-Studio Review-and-Fix (2026-07-03) | process-noise — delivery report |
| 111 | Xsnv5MxhKY | The UI | process-noise — static single-page "AI Playbooks" demo app, an early abandoned direction, no live product content |
| 112 | YYkJuKwYPq | Orvex AI Studio — Manual | superseded-with-successor (explicit successor: CxjFpIVUZY) |
| 113 | YkhyZG9UVG | Landing Page and Onboarding Tour Research | process-noise / fetch note — page body returned `null` (empty), title suggests onboarding research; nothing recoverable to assess |
| 114 | Z1zqCe15xr | Results | process-noise — index of parallel data-model derivation run outputs (experiment artifacts) |
| 115 | ZGY3xrUEdo | Persona Discovery — Laura Pendleton | superseded-with-successor (explicit successor: 5wfaUiGmKI; Laura is already the brief's canonical persona) |

## Detail: CANDIDATE-GAPs

### 91 — Marketplace — Scenario & UX Spec (RpBg6Diub2)

**What it is:** A Product-Owner-locked (2026-06-16/17) scenario & UX spec for the Orvex marketplace: publish/fork/claim/review flows, trust model, and data-integrity rules for the marketplace surface.

**Key lines:**
> "1. ALL REAL & LIVE — no mock/seeded/made-up data. Every visible number/signal is real. ⚠️ Overrides PRD FR-26's seeded-demo-counts plan"
> "2. Marketplace is FULLY LIVE — out of Tier-2. No read-only degrade net; publish/fork/claim/review are stage-critical and must each fail-soft within themselves"
> "3. Per-user usage tracking is REQUIRED (build item). 'Used by N' = distinct signed-in users; same event gates reviews to real users."
> "4. Private synthetic load-test DB allowed — benchmark-only, never shown as product content."

**Why the brief may need it:** brief.md's Prompt Composer section treats "a marketplace skill" as a given input ("Marketplace skill + plain-language tweaks + Memory + wiki knowledge…") but never restates or supersedes any marketplace *scope/trust* ruling — no mention of live-data-only, usage-tracking-for-trust, publish/fork/claim/review as stage-critical flows, or the fail-soft posture for marketplace actions. These are binding PO decisions with no visible successor citation anywhere in current canon reachable from the brief. If the marketplace ships as part of the Prompt Composer payoff, this UX/trust contract is exactly the kind of "how it actually behaves" ruling the brief is silent on.

### 96 — BUILD-PLAN — Memory Portrait: Rich · Organised · Structured · Beautiful · Living (TMaaxw0kRZ)

**What it is:** An architect's PO-facing build plan for the "Memory screen" — the Portrait/Areas home, a "nod stream," three on-ramps (manual/chat/doc), a privacy spine, typed atoms, "living motion," and a "therapist chat + split-view" interaction.

**Key line:**
> "Scope (hard): the memory screen only — the Portrait/Areas home, the nod stream, the three on-ramps (manual · chat · doc), the privacy spine, the typed atoms, the living motion, the therapist chat + split-view."

**Why the brief may need it:** brief.md names Memory as one of the three context stores ("curated facts — your RAM") and calls out the **Prompt Composer's** editing experience as a flagship quality bar ("[RULED 2026-07-13]"), but says nothing about the Memory *screen's own* UX ambition — a living, visually rich "portrait" experience with a narrating nod-stream and a conversational "therapist chat" on-ramp for building memory. Per this repo's own standing note ("Delivered = looks good AND works" — user-facing surfaces must look good, not just pass gates), if Memory is meant to ship with this same flagship-quality bar, the brief is currently silent on it and has no visible successor page carrying this UX ambition forward.
