# Recheck: orvexstudiobilling vs brief-orvex-studio-2026-07-13

Checked: INDEX.md, `Architecture: orvex-studio-billing` (o2ZqSrZjE6), `Architecture Audit — SE-Arch review` (ukKiIMWYRg), `PRD: orvex-studio-billing` (Blcvui4UIn). Prior sweep already covered service mandate/contracts/delivery state — not repeated here. Candidates below are product-level concepts, user-facing behavior, pricing/packaging, or persona/scope rulings the brief neither states nor consciously excludes.

- **Page:** PRD: orvex-studio-billing (Blcvui4UIn), FR-B13/B16/FR-B8
  **Missed concept:** The 7-day trial is a concrete, decided user-facing flow — **card-required at trial start**, granted once per verified email, and a **retroactive one-time trial offer to every pre-existing account on launch day** ("every account predating the paywall is offered the same 7-day trial").
  **Quote:** "Card-required 7-day trial as a temporary entitlement (D-S23): the trial grants 7 days of full £7 Personal entitlements... A card IS required at trial start."
  **Why it matters:** This is a first-run/monetization user experience with direct product and trust implications (card-required for a free trial is a real friction decision for a "friendliness is a hard requirement" consumer product) — the brief's Scope/Success Criteria sections say nothing about a trial mechanism at all, and it isn't in the conscious Scope-Out list either.

- **Page:** PRD: orvex-studio-billing (Blcvui4UIn), FR-B1
  **Missed concept:** The Teams tier already has a concrete named feature bundle beyond "teams paying": centralised Curator role management, official company prompts, shared company Memory, moderated & approved changes, Professional UX.
  **Quote:** "`teams` (display-only teaser: centralised Curator role management, official company prompts, shared company Memory, moderated & approved changes, Professional UX — no price, no purchase path)"
  **Why it matters:** This is packaging/persona-relevant detail for the "business/teams product... how it makes money" arc the brief gestures at but leaves undefined; the brief's Open/Scope sections discuss tier *pricing* composition but not what Teams actually contains.

- **Page:** PRD: orvex-studio-billing (Blcvui4UIn), FR-B17a / D-S7
  **Missed concept:** Concrete, LOCKED free-tier and £7-tier wiki usage limits (pages/storage/files/members/history) that are genuine user-facing product limits, not engineering minutiae: Free = 200 pages / 1 GiB / 10 MB-file / 2,000 files / 25 members / history min(10,180d); Personal (£7) = 20,000 pages / 50 GiB / 50 MB-file / 20,000 files / 25 members / min(100,730d).
  **Quote:** "Free values are LOCKED... £7 Personal is now LOCKED (D-S7, closing OQ-B10): 20,000 pages / 50 GiB aggregate / 50 MB per file..."
  **Why it matters:** The brief's free-tier doctrine ("as powerful and amazing as possible... every low-cost quick win included free") is stated as an AI-cost principle only — it never mentions that the free tier is otherwise capacity-limited (pages/storage/members), which is core to what a non-technical user will actually experience as "free."

- **Page:** PRD: orvex-studio-billing (Blcvui4UIn), G5 / FR-B11 / D-S23
  **Missed concept:** An explicit product guarantee — "lapse never deletes": downgrade, trial expiry, cancellation, and dunning exhaustion lock AI features only; all content remains manually usable/exportable, nothing is ever auto-deleted.
  **Quote:** "Lapse never deletes (FR-66/68): downgrade, trial expiry, cancellation, and dunning exhaustion lock AI features only; all content remains manually usable."
  **Why it matters:** This is a trust-building, user-facing commitment squarely in the spirit of the brief's "trust is the point" framing (outbound sync, private memories) but is a distinct promise the brief never states — a natural persona/trust talking point that's currently missing.

- **Page:** PRD: orvex-studio-billing (Blcvui4UIn), FR-B2/B3 and D-S7
  **Missed concept:** Pricing is already decided at a specific point, not merely a range: £7/month, £70/year (2 months free), GBP-only at launch — whereas the brief presents "£5–7" as still an open range pending blessing.
  **Quote:** "`personal` (the only purchasable plan: monthly **£7**, annual **£70** — 2 months free)" / "Free/£7/Teams/Enterprise pricing decision" (governing authority cited as already locked, D-S7).
  **Why it matters:** The brief's Open section frames "the exact £ price point" as still queued for PRD-time decision, but the billing PRD already treats £7/£70/GBP-only as LOCKED — a scope-ruling discrepancy the brief should either adopt or consciously flag as superseding.

Gap count: 5
