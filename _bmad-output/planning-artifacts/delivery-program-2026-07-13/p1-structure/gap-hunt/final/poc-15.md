## 🎯 Story

As a **visitor**, I want **the public marketing/landing page's full content — hero + glass skill showcase, a 5-step 'How it works' row, a trio 'Why Orvex' value grid, a marketplace preview strip, a cross-AI moat reveal, and a dark closer+footer** so that **I understand the product and convert before I ever sign in** (sibling of FR-UI3).

**Definition of Done:** ONE named test `TestMarketingPageRendersAllContentSections` — a component-integration test asserting `/` (anon) renders, in order: the hero (headline + lead + twin CTAs 'Start free'/'Browse the marketplace' + a live skill showcase card with NO capture-percentage meter), a 5-step how-it-works row, a trio value-prop grid, a marketplace preview grid of real featured skills, a cross-AI reveal row (ChatGPT/Claude/Gemini/Grok), and a dark closer CTA + footer — verified through rendered DOM, never a bare routing stub. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given anon `/`, When it loads, Then a hero renders with headline + lead copy + 'Start free' (signup) and 'Browse the marketplace' (wall-free discover) CTAs. *Assertion: both CTAs present and routed.* [Source: POC design-artifacts/D-Design-System/screens/01-marketing.md Region B]
- [ ] **AC2** — Given the hero, When the skill showcase renders, Then it shows a real featured skill card with the honest 'well fitted · see original' residual — NEVER a 'NN% captured' meter. *Assertion: no capture-percentage string in DOM.* [Source: POC 01-marketing.md Region C + Reconciliation 'The % captured swap']
- [ ] **AC3** — Given the page, When scrolled, Then a 5-tile 'How it works' row renders (Find/Read/Make it yours/Use it anywhere/It gets to know you), each with an icon, title, and one-line body. *Assertion: 5 tiles render with distinct copy.* [Source: POC 01-marketing.md Region D]
- [ ] **AC4** — Given the page, When scrolled, Then a 3-tile 'Why Orvex' value grid renders (Your memory — private-to-you copy only, never 'shared across your team'; Company knowledge; Skills marketplace). *Assertion: 3 tiles render; the Memory tile copy asserts privacy, never sharing.* [Source: POC 01-marketing.md Region E + Reconciliation privacy-copy fix]
- [ ] **AC5** — Given the page, When scrolled, Then a marketplace preview grid renders 4 real featured skill cards with a 'See all skills →' link to Discover. *Assertion: 4 real cards + working link.* [Source: POC 01-marketing.md Region F]
- [ ] **AC6** — Given the page, When scrolled, Then a cross-AI reveal row renders the 4 supported assistants (ChatGPT/Claude/Gemini/Grok) with no fabricated metric. *Assertion: 4 glyphs render.* [Source: POC 01-marketing.md Region G]
- [ ] **AC7 (negative)** — Given a signed-in session, When `/` is hit, Then this marketing content is NEVER shown (client-redirects to `/app` per E2-S3) — the marketing content only renders anon. *Assertion: signed-in `/` never mounts this content.* [Source: POC 01-marketing.md 'WDS spec alignment'; sibling E2-S3 AC2]

## 🔨 Tasks

- [ ] RED: `TestMarketingPageRendersAllContentSections` (AC1/AC3/AC4/AC5/AC6).
- [ ] GREEN: hero + showcase card with the swapped honest residual (AC1/AC2); how-it-works row (AC3); trio value grid with corrected private-Memory copy (AC4); marketplace preview grid (AC5); cross-AI reveal (AC6); anon-only gating verified against E2-S3's redirect (AC7).

## 🧠 Context

The POC's `marketing.jsx` is a full classic landing page (hero/steps/trio/preview/cross-AI/closer); the only in-program story touching `/` (E2-S3 'Front door + routing map') treats the marketing page as an opaque routing target ('the public marketing page renders') and carries zero ACs for its content. Nothing else in the ui/api/knowledge programs builds this content — it is pure front-door copy/composition, not covered by the Task Box (E2-S2) or Discover (E4-S1). React-front presentation layer (CS §6). Seam: BFF featured-skills fixture. Sibling: E2-S3 (front-door routing hosts this content at anon `/`); E4-S1 (marketplace preview reuses its Skill card).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. design-artifacts/D-Design-System/screens/01-marketing.md Regions B–H. E2-S3's AC1 stops at 'the public marketing page renders' with no AC for hero/steps/trio/preview/cross-AI content.

## 🧪 Testing

`TestMarketingPageRendersAllContentSections` (component-integration) + unit tests on each content block. CS §5 mocking: BFF featured-skills fixture; never mock own composition.

## 📏 Guidance

CS `6aMAzsYeQb` §6 shallow view · §11 honest (no capture-%) · §3 naming; SE-Arch `8sYi523i4t` honesty lens (no dishonest completeness meter; Memory-privacy copy correctness).

## 🔗 References

PRD `xsRMrju3D1` (FR-UI3) · POC design-artifacts/D-Design-System/screens/01-marketing.md.

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2109** (Definition Pack — the contract TAG is the dispatch gate).
- [ ] Sibling: E2-S3 (front-door routing hosts this content at anon `/`); E4-S1 (marketplace preview reuses its Skill card).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
