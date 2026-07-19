# Recheck: orvexstudiolib space vs brief-orvex-studio-2026-07-13

Read in full: INDEX.md, `0NPvDR3C0m` (Architecture: orvex-studio-lib), `JxnqaaYx3j`
(Architecture Audit — SE-Arch review), `fG2jKeRGiu` (PRD: orvex-studio-lib). This
space is almost entirely engineering (auth verifier, cell contract, event envelopes,
DfM serializer, codegen, Temporal split) — out of scope per the brief's engineering-
minutiae exclusion. One item surfaces a product-level packaging detail the brief
does not carry at the same specificity.

- **Page:** PRD: orvex-studio-lib (`fG2jKeRGiu`), §F4b `pkg/billingclient` (FR-L29)
  **Missed concept:** a concrete plan/tier naming and an explicitly **hidden**
  Enterprise tier — i.e., Enterprise exists as a plan from day one but is not
  surfaced to users.
  **Quote:** "resolve a tenant/org's active plan (Free / £7 Personal / Teams-teaser
  / **hidden Enterprise**), its entitlement values (the locked Free caps + the
  F-QUOTA quota values the engine enforces, the AI spend cap ai reads)..."
  **Why it matters:** the brief's Scope section discusses a "four-tier strawman
  (free / consumer-paid £5–7 / teams / enterprise)" as still **Open — queued for
  PRDs, pending blessing**, and separately says "enterprise follows" the
  consumer/business surfaces without commenting on visibility. This lib PRD already
  encodes a firm packaging decision — Enterprise is modeled as a real, hidden
  (not-yet-marketed) plan, and the consumer paid tier is a fixed "£7" point plus a
  "Teams-teaser" plan label — none of which the brief's Open/Scope language
  consciously flags as already-decided-elsewhere. This is a packaging/pricing
  product concept, not engineering minutiae, and the brief's "pending blessing"
  framing may understate how far downstream code has already committed to it.

No other product-level concepts, user-facing behaviors, personas, or scope rulings
were found in this space; the remainder (auth ceiling, cell contract, DfM
clean-room serializer, Kafka/event envelope, Temporal split, codegen pinning) is
engineering detail below the brief's altitude and was intentionally not repeated
per the task instructions.
