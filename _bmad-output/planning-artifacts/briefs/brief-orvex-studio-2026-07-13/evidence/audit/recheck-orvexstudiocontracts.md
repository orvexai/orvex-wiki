# Recheck: orvexstudiocontracts vs brief-orvex-studio-2026-07-13

Scope: product-level concepts only (feature/user-facing behavior/pricing-packaging/persona/scope
ruling). Engineering detail (seams, gates, tiers-as-code) explicitly excluded per instructions.
Pages read: `o2waDNw3ix` (Architecture, incl. Tightened revision + OPEN DECISIONS), `nngOgO0CGO`
(SE-Arch audit), `jwF4VLHfNs` (PRD, FR-C1–C24, §7 Rollout, §8 OQs, §9 Decisions) — full text, all
three pages in the space per INDEX.md.

## Candidate gaps

- **Page:** `jwF4VLHfNs` (PRD: orvex-studio-contracts), FR-C24 / §4 F1
  **Missed concept:** the Free plan carries a **"10-action lifetime AI trial (Free only)"** —
  a one-time, non-renewing AI allowance distinct from the £7 Personal plan's ongoing spend-cap.
  **Quote:** "**Free:** 200 pages · 1 GiB aggregate · 10 MB/file · 2,000 files · 25 members ·
  history `min(10 versions, 180 d)` · a **10-action lifetime AI trial** (Free only)."
  **Why it matters:** the brief's free-tier doctrine is stated purely as a *cost* rule ("no
  frontier models anywhere in free... very cheap models for basic tasks, free/near-free
  embeddings") with no mention of a lifetime-capped trial mechanic. A trial of finite, non-renewing
  AI actions is a different packaging shape than "cheap-models-forever" and could imply the trial
  taps a costlier (frontier) model tier once, which the brief's cost doctrine seems to rule out
  entirely. This is a genuine packaging detail neither included nor consciously excluded (Scope Out
  doesn't mention it) — worth a ruling on whether the trial exists, and if so, whether it uses
  frontier or cheap models.

- **Page:** `jwF4VLHfNs`, FR-C24 (plan schema quota values)
  **Missed concept:** locked, user-facing quota numbers already frozen in schema for Free and £7
  Personal — page/storage/file/member caps and version-history retention windows.
  **Quote:** "**£7 Personal (£70/yr):** 20,000 pages · 50 GiB aggregate · 50 MB/file · 20,000 files
  · 25 members · history `min(100 versions, 730 d)` · AI capped by the billing-owned **spend cap**
  (not a lifetime trial)."
  **Why it matters:** the brief treats pricing/packaging as still open ("the exact £ price point ...
  pending blessing", Scope §Open) and describes tiers only qualitatively (free-forever · £5–7 AI
  tier · teams paying). But contracts has already frozen concrete, user-visible limits (25-member
  cap even on Free, version-history depth, per-file size ceilings) as schema. These are product-facing
  promises/constraints a non-technical user will hit directly (e.g., "why can't I invite a 26th
  teammate on the free plan") that the brief doesn't restate or flag as pre-decided — worth
  reconciling so the PRD doesn't re-litigate numbers contracts has already pinned.

No other product-level material found: the remaining content (SSE wire mechanics, OpenAPI seam
layout, AGPL clean-room rules, event catalog, gates/versioning, the T1–T7 tightening and OPEN
DECISIONS list, the audit's 13 findings) is architecture/engineering-governance detail with no
independent product/persona/feature content beyond what feeds the two items above.
