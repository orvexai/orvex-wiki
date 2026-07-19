# ENG-2036 — Billing/AI canon amendments (PO 2026-07-13 pricing supersessions)

**Executed:** 2026-07-13
**Source ruling:** Product Brief: Orvex Studio (`rgBOQh31p3`) — two supersessions ruled 2026-07-13.
**Method:** both target pages were **DRAFT**, so amended **in place**, section-scoped, current-state-only, with `--if-version` CAS. No page status was changed. No CANONICAL page was in scope, so no revision files were written.

## Rulings applied

1. **Free-tier 10-lifetime-action AI trial -> SUPERSEDED** by the free-tier cost doctrine: the ~zero-cost AI set (very cheap models for basic tasks + free/near-free embeddings, every low-cost quick win) is **free forever**; **no frontier models in Free**; **no lifetime action count**. The free/paid boundary is marginal AI cost, not AI-vs-no-AI. The **frontier-taster mechanic is reopened** for redesign (likely the standard free month) — queued for PRD.
2. **Card-required 7-day trial -> SUPERSEDED**: **no card required**; the trial is **the standard free month** (a no-card, time-boxed month of full GBP7 Personal entitlements) that **downgrades to Free at month-end** (graceful downgrade, nothing deleted, over-quota ladder applies). No Stripe subscription exists during the trial (billing-managed temporary entitlement; billing's own one-month timer drives trial-end).

GBP7 / GBP70 / GBP-only / hidden-Enterprise / Free caps (200 pages, 1 GiB, 2,000 files, 25 members) remain adopted as locked and were not changed.

## Pages touched

### billing PRD — `Blcvui4UIn` (space `orvexstudiobilling`), status **draft** (unchanged)
Amended in place via ProseMirror-JSON surgery (page has 2 tables; text-node-only edits; table count verified unchanged 2->2). Passages amended:
- **In-short** — trial clause rewritten to the no-card standard free month that downgrades to Free.
- **FR-B7** — Free "user-action cap" line: 10 lifetime actions replaced with "no action count — Free is gated to the ~zero-cost AI set (cheap models + free/near-free embeddings), free forever, no frontier models".
- **FR-B8** (Checkout) — no card required for the free-month trial; card collected only on active GBP7 subscribe.
- **FR-B10** — `customer.subscription.trial_will_end`: NOT subscribed; trial-end nudge driven by billing's one-month timer, not a Stripe event.
- **FR-B13** — retitled "The standard free month as a temporary entitlement"; no card at start; month-end downgrade to Free.
- **FR-B14** — 7-day/day-7 expiry timer -> one-month/month-end.
- **FR-B16** — retroactive backfill is now a direct grant of the standard free month (no card-capture offer step).
- **OQ-B11** (table cell) — reflects the no-card standard free-month trial.
- **D-B7** — updated to the current decision: card-free standard free month, in-house/card-less, no Stripe subscription during trial.
- **D-B13** (new decision) — records the free-tier AI cost doctrine (supersedes the Free 10-lifetime-action trial).
- **Change log — 2026-07-13** (new).

### ai PRD — `pbKI3BpQmY` (space `orvexstudioai`), status **draft** (unchanged)
Amended in place via ProseMirror-JSON surgery (page has 2 tables; table count verified unchanged 2->2). Passages amended:
- **G1** — user-action-cap parenthetical: Free = the ~zero-cost AI set, no frontier, no action count.
- **FR-AI12** — Free enforcement rewritten: no 10-lifetime-action allowance; Free = the ~zero-cost capability set free forever, enforced by a pre-flight model-class allowlist keyed on billing's entitlement (frontier denied 402/paid-only; zero-cost calls pass uncounted). The `ai:calls:{tenant}` lifetime counter is retired.
- **FR-AI13** — gate shape is a model-class allowlist, not a lifetime action count; fail-closed (frontier denied on failure).
- **FR-AI16** — image generation is paid-only, excluded from Free (was "Free 10-action trial").
- **FR-AI23** — Redis list: retired the Free-trial `ai:calls:{tenant}` counter; Free enforcement rides the entitlement cache (model-class allowlist state, no lifetime counter).
- **NFR-AI4** — black-box test now proves a Free-tier tenant is denied frontier models (402/paid-only) while zero-cost models pass.
- **Rollout step 1** — Free model-class allowlist replaces the Free 10-action counter.
- **Dependency (billing) row** — Free = the ~zero-cost AI set.
- **OQ-AI2** (table cell) — Free = the ~zero-cost AI set, no frontier.
- **D-AI11** — Free line updated to the ~zero-cost doctrine (frontier-taster reopened).
- **D-AI12** (new decision) — records the free-tier AI cost doctrine (supersedes the Free 10-lifetime-action split; enforcement flips to the model-class allowlist).
- **Change log — 2026-07-13** (new).

## Verification
- Both pages: server-side ProseMirror re-fetched after write; full text byte-identical to intended; bold/code/italic mark inventories match exactly; table node count unchanged (2->2) on both.
- The ai write returned an `EMBED_DEGRADATION` guard warning caused by lossless run-coalescing (server merges adjacent same-mark text runs). Re-fetched server PM confirmed the content persisted faithfully (no text/mark loss) — a false-positive; a coalesced re-send was unnecessary/byte-identical.
- Statuses confirmed still draft on both pages (no status change performed).
- Durable resolution comments filed on both pages referencing ENG-2036.

## Not in scope of this task (remaining ENG-2036 DoD)
- Update the billing/ai entitlement + cap contracts shapes to match (Definition Factory contracts pack).
- Human ratification of both draft revisions (draft -> canonical) — this task never promotes status; ratification is human-gated.
