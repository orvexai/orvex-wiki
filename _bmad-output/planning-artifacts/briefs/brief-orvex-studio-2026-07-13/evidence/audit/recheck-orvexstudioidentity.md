# Recheck: orvexstudioidentity vs brief-orvex-studio-2026-07-13

Checked INDEX.md + all 4 pages (PRD `cnhla0qRRF`, Anti-Sybil options `CYHyoUd7J1`, Architecture `dQUjrSXhdp`, Architecture Audit `YuY9XWpKPS`), excluding already-extracted service mandate/contracts/delivery-state material. Looking only for product-level concepts/features/pricing/persona/scope not in the brief and not consciously excluded.

## Candidate gaps

- **Page:** PRD: orvex-studio-identity (`cnhla0qRRF`), §"In short" / Threat model context
  **Missed concept:** Concrete free-tier packaging numbers are already decided in canon but absent from the brief: **200 pages / 1 GiB / 2,000 files / 25 members per tenant**, plus a **10-lifetime-AI-actions** trial for free users (quoted from `CYHyoUd7J1` §1, which the PRD's tenant model underpins).
  **Key line:** "Product surface (free tier). 200 pages / 1 GiB / 2,000 files / 25 members per tenant, plus a **10-LIFETIME-AI-ACTIONS** trial."
  **Why it matters:** The brief's Scope section discusses the free-tier *cost doctrine* (no frontier models, cheap models only) but never states the actual free-tier limits or that the AI allowance is a one-time lifetime trial rather than an ongoing quota — a materially different product promise than "free-forever individuals" implies, and worth at least a conscious scope note.

- **Page:** Anti-Sybil / Free-Tier Abuse — Options & Recommendation (`CYHyoUd7J1`), §1 Threat model / §3 Recommended layered stack
  **Missed concept:** Signup-time friction options under active consideration — verified email as a **hard precondition for tenant creation**, risk-triggered step-up (SMS OTP, card-on-file, KYC) gating AI-trial activation — are not mentioned anywhere in the brief, yet they bear directly on the brief's persona claim that Priya gets value "in under 90 seconds without signup."
  **Key line:** "Make a VERIFIED email a hard precondition for TENANT creation — not merely IdP user existence" and "gate the expensive resource, not the account... hold the two farmed grants — AI-trial activation and cell provisioning — until risk clears."
  **Why it matters:** If any verified-email/step-up gate lands on the free personal path, it directly qualifies or contradicts the brief's frictionless-onboarding claim; the brief neither states nor consciously scopes out this tension, so onboarding UX and the persona promise could diverge from what's already being designed.

- **Page:** PRD: orvex-studio-identity (`cnhla0qRRF`), G3 / D-IDENT-1 / D-S17
  **Missed concept:** The **personal→Teams upgrade** is a user-facing product journey (a free/individual user converting to a paid Teams tenant carries their data + entitlements forward, with an explicit rule that new teammates do NOT retroactively see pre-upgrade private content) — not just an internal re-keying detail.
  **Key line:** "the personal→Teams upgrade access transition is explicit... new team members do NOT retroactively gain pre-upgrade private content unless intended."
  **Why it matters:** This is a concrete, user-visible privacy/UX guarantee for the "three-surface arc" (consumer → business/teams) the brief describes only as an entitlements/UI difference — the brief never mentions the upgrade journey or its privacy guarantee as a product behavior.

NO GAPS beyond the three above — the remaining content (dual-IdP verification mechanics, token minting internals, cell-registry architecture, break-glass credential design, health-probe/ADR/deploy findings) is engineering/program detail already out of scope per the sweep's own instruction.
