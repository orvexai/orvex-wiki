# Recheck: orvexwiki space vs brief

Checked: INDEX.md + every page in the orvexwiki mirror (Free-at-Scale, PRD:
orvex-wiki, Start Here, Program Study, Architecture, Split Plan, Separation,
Decision Records, ADRs, Foundation Handoff, Docmost/Engine reference pages).
This space is scoped (per its own Start Here / D-S2 mandate) to wiki-and-engine
canon only — product/persona/pricing canon proper lives in `orvexstudioarch`,
so most of the space is engineering detail already out of the brief's intended
altitude (contracts, seams, gates, RLS, migrations, etc.) and correctly not
recapped here.

## Candidate gap

- **Page:** Free-at-Scale — Wiki Economics & Scale Mechanics (`W613jcEl3k`)
  **Missed concept:** the free-tier AI packaging mechanic is a **one-time
  lifetime trial, not a recurring allowance** — a distinct pricing/packaging
  idea from the brief's "marginal-AI-cost" framing.
  **Quote:** "**AI is a one-time taster, not a recurring line (Free only).**
  Free tier = **10 lifetime AI actions per workspace**, then paywalled... AI
  leaves the recurring cost curve, so the model gets *cheaper*, not more
  generous, with scale."
  **Why it matters:** the brief's Scope section covers the free-tier cost
  doctrine (cheap models, free embeddings, marginal-cost boundary) but never
  states the *mechanic* by which AI specifically is metered on Free — a
  one-time lifetime counter with no reset, converting to paywall permanently
  rather than a recurring monthly cap. This is a product-facing packaging
  decision (what the user experiences hitting the wall) that a PRD-writer
  would need and that isn't in the brief's tier description or its Open/Scope
  Out lists — plausibly intentional exclusion (wiki-specific, engine-level
  quota mechanics) but not explicitly excluded either, so flagged rather than
  assumed.

No other product-level concepts, user-facing behaviors, persona insights, or
scope rulings were found uncovered — the remainder of the space (architecture,
ADRs, split/disposition plans, docmost internals, decision records) is
engineering detail at or below the altitude the brief already treats.
