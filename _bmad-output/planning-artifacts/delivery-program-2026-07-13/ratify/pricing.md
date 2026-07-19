# Ratify receipt — pricing/AI PRD promotions (2026-07-13)

PO Daniel ratify-all pass. Both promotions executed via `docmost-cli page update --status canonical --force-self-ratify --if-version <fresh live updated_at>`, branching on exit code / `error_code` JSON field (not stderr text). Both calls returned exit 0, `"outcome":"updated"`. No CONFLICT (exit 7) encountered on either call, so no retry was needed.

## 1. Blcvui4UIn (orvexstudiobilling) — PRD: orvex-studio-billing

- **Slug:** `Blcvui4UIn`
- **Space:** `orvexstudiobilling`
- **Before status:** `draft` (live-read `updated_at`: `2026-07-13T12:03:56.138Z`, used as `--if-version`)
- **After status:** `canonical` (post-update `updated_at`: `2026-07-13T12:52:17.835Z`)
- **Outcome:** `updated`, exit code 0
- **Reason used (--reason):**
  > PO Daniel ratified verbally in session ('ratify all', 2026-07-13): billing PRD incl. PO pricing supersessions (cost doctrine + no-card free month)
- **Verification:** Re-fetched via `docmost-cli page get Blcvui4UIn --no-daemon --output json` — confirmed `status: canonical`, `updated_at: 2026-07-13T12:52:17.835Z`.
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudiobilling/p/prd-orvex-studio-billing-Blcvui4UIn

## 2. pbKI3BpQmY (orvexstudioai) — PRD: orvex-studio-ai

- **Slug:** `pbKI3BpQmY`
- **Space:** `orvexstudioai`
- **Before status:** `draft` (live-read `updated_at`: `2026-07-13T12:08:05.058Z`, used as `--if-version`)
- **After status:** `canonical` (post-update `updated_at`: `2026-07-13T12:52:23.248Z`)
- **Outcome:** `updated`, exit code 0
- **Reason used (--reason):**
  > PO Daniel ratified verbally in session ('ratify all', 2026-07-13): ai PRD incl. FR-AI12 model-class allowlist supersession
- **Verification:** Re-fetched via `docmost-cli page get pbKI3BpQmY --no-daemon --output json` — confirmed `status: canonical`, `updated_at: 2026-07-13T12:52:23.248Z`.
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudioai/p/prd-orvex-studio-ai-pbKI3BpQmY

## Summary

| Slug | Space | Before | After | Outcome | Conflict retry? |
|---|---|---|---|---|---|
| Blcvui4UIn | orvexstudiobilling | draft | canonical | updated | no |
| pbKI3BpQmY | orvexstudioai | draft | canonical | updated | no |

Both promotions are workspace-audited via `--force-self-ratify`, each carrying an item-specific PO clause referencing the 2026-07-13 verbal "ratify all" session.
