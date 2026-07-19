# Recheck: orvexstudioai space vs brief-orvex-studio-2026-07-13

Scope note: this space is almost entirely the service PRD + Architecture + SE-Arch audit for
`orvex-studio-ai` — engineering/program detail already covered by the prior sweep. The items
below are the few spots where a PRODUCT-level fact (pricing/packaging mechanic, user-facing
behavior, or a claim that conflicts with the brief) surfaces inside that engineering material
and is neither restated nor consciously excluded by the brief.

## Candidate gaps

- **Page:** PRD: orvex-studio-ai (`pbKI3BpQmY`), FR-AI12/FR-AI13/D-AI11/D-S7.
  **Missed concept:** the Free tier's actual packaging mechanic is a **10-lifetime-AI-action
  count trial**, not an ongoing free allowance — "Free = a 10-lifetime-AI-action allowance (a
  count-based trial enforced by a pre-flight `ai:calls:{tenant}` Redis counter, hard-stop at 10
  → 402)."
  **Quote:** "Free vs £7 Personal enforcement follows the entitlement (D-S7): Free = a
  10-lifetime-AI-action allowance (a count-based trial enforced by a pre-flight
  `ai:calls:{tenant}` Redis counter, hard-stop at 10 → 402)."
  **Why it matters:** the brief's Scope section states pricing as "free-forever individuals ·
  AI tier £5–7 · teams paying" and its free-tier cost doctrine talks about the free tier being
  "as powerful and amazing as possible at ~zero marginal AI cost" with no mention that AI usage
  on the free tier is capped at a **lifetime count of 10 actions** rather than a recurring
  allowance. That's a materially different packaging shape (one-time trial vs. free-forever
  AI use) that a reader of the brief would not infer, and it directly affects the "free-forever"
  framing and the persona-value promise (Priya/Laura getting value "in under 90 seconds" — but
  ongoing AI use past 10 actions requires payment). This is a packaging/positioning fact, not
  engineering minutiae, and the brief neither states nor consciously excludes it.

- **Page:** PRD: orvex-studio-ai (`pbKI3BpQmY`), FR-AI16.
  **Missed concept:** image generation is excluded from the free trial entirely — it is a
  paid-tier-only feature.
  **Quote:** "**Image generation is a paid-tier entitlement** (billing-gated) — excluded from
  the Free 10-action trial (FR-AI12)."
  **Why it matters:** this is a concrete free/paid feature boundary (not just a cost-dimension
  the brief discusses in the abstract "free-tier cost doctrine" — it's a specific ruling that
  a feature category is paid-only regardless of the ~zero-marginal-cost test). The brief's
  Scope/Open section defers "which cheap-model/free-embedding capabilities clear the ~zero-cost
  bar for free" to PRD time, but this PRD has already made a concrete ruling on one such
  capability (images) that the brief doesn't surface or flag as decided-elsewhere.

- **Page:** PRD: orvex-studio-ai (`pbKI3BpQmY`), FR-AI11.
  **Missed concept:** per-user/per-space Memory recall is **opt-in per workspace, default OFF**
  (a GDPR gate) — when disabled, recall returns empty and writes to memory are rejected.
  **Quote:** "opt-in per workspace (GDPR gate — default off; disabled ⇒ recall returns empty,
  writes rejected)."
  **Why it matters:** the brief's north-star pitch is built entirely on Memory working
  ambiently and near-effortlessly ("maintained almost entirely without user effort"), and its
  private-memory discussion covers per-item privacy flags but not that the entire Memory
  feature can be workspace-disabled by default. If this default-off gate applies broadly (not
  just to some enterprise/GDPR workspace class), it's a user-facing behavior with product
  framing implications the brief doesn't address or consciously scope out.

## Not flagged (already covered or consciously out)

- Draft-quarantine semantics for citations, cited-ask grounding/honesty rules, and the
  Librarian/beads/staging architecture are engineering-level realizations of concepts the brief
  already states at the right altitude.
- Everything else in the Architecture and SE-Arch audit pages (metering layering, outbox,
  Kafka topology, ADR governance, break-glass, cell-contract health echo, etc.) is
  program/engineering detail below the brief's altitude — not flagged per task instructions.
