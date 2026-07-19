# ADR ratification receipts — 2026-07-13 (PO Daniel "ratify all" pass, ADR leg)

Space: `orvexstudioarch`

All three ADRs below were (1) patched to flip masthead `Status: Proposed` → `Status: Accepted`, and (2) promoted `draft` → `canonical` via `--force-self-ratify`, carrying the PO clause in `--reason`. Every edit was verified by a fresh re-fetch before promotion, and final status was re-verified after promotion.

## ADR-0033 — Work-claim arbiter for the delivery orchestrator

- Slug: `yNFx3YyNap`
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/adr-0033-work-claim-arbiter-for-the-delivery-orchestrator-linear-st-yNFx3YyNap
- Masthead: table-based (`| **Status** | Proposed · pending PO doc-ratify |`) → required ProseMirror-JSON surgery (patch would have hit `EMBED_DEGRADATION` on the table). Edited the single table-cell text node `"Proposed · pending PO doc-ratify"` → `"Accepted"`. Table-node count verified unchanged (1 → 1) before write.
  - `page update --content-json` at `--if-version 2026-07-13T12:34:27.998Z` → outcome `updated`, new version `2026-07-13T12:53:22.198Z`
  - Verified live: `| **Status** | Accepted |`
- Promotion: `page update --status canonical --force-self-ratify --if-version 2026-07-13T12:53:22.198Z`
  - Reason: "PO Daniel ratified verbally in session ('ratify all', 2026-07-13): ADR-0033 Work-claim arbiter for the delivery orchestrator, adversarially reviewed, fixes applied"
  - Outcome: `updated`, new version `2026-07-13T12:53:42.127Z`
- Final verified status: **canonical**

## ADR-0034 — Credential lanes for agent execution

- Slug: `12aDkq4iOd`
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/adr-0034-credential-lanes-for-agent-execution-deny-by-default-per-l-12aDkq4iOd
- Masthead: table-based (`| **Status** | Proposed |`) → required ProseMirror-JSON surgery. Note: the page body also contains an unrelated prose sentence ending "...this Proposed ADR travels." — surgery targeted the exact text node equal to `"Proposed"` only (masthead cell), leaving the prose sentence's longer text node untouched. Table-node count verified unchanged (1 → 1).
  - `page update --content-json` at `--if-version 2026-07-13T12:32:17.489Z` → outcome `updated`, new version `2026-07-13T12:53:29.076Z`
  - Verified live: `| **Status** | Accepted |`
- Promotion: `page update --status canonical --force-self-ratify --if-version 2026-07-13T12:53:29.076Z`
  - Reason: "PO Daniel ratified verbally in session ('ratify all', 2026-07-13): ADR-0034 Credential lanes for agent execution, adversarially reviewed, fixes applied"
  - Outcome: `updated`, new version `2026-07-13T12:53:47.2Z`
- Final verified status: **canonical**

## ADR-0035 — Go↔TypeScript contract/client bridge

- Slug: `QbEBPuKcGR`
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/adr-0035-go-typescript-contract-client-bridge-per-repo-codegen-from-QbEBPuKcGR
- Masthead: bullet-list format (`- **Status:** Proposed · Date: ...`), no table — plain markdown `page patch` sufficed (no EMBED_DEGRADATION).
  - `page patch --find "**Status:** Proposed" --replace "**Status:** Accepted"` at `--if-version 2026-07-13T12:27:38.123Z` → outcome `patched`, matches_replaced 1, new version reflected at next read (`2026-07-13T12:52:36.574Z`)
  - Verified live: `- **Status:** Accepted · Date: 2026-07-13 · Deciders: Daniel (PO)`
- Promotion: `page update --status canonical --force-self-ratify --if-version 2026-07-13T12:52:36.574Z`
  - Reason: "PO Daniel ratified verbally in session ('ratify all', 2026-07-13): ADR-0035 Go-TypeScript contract/client bridge, adversarially reviewed, fixes applied"
  - Outcome: `updated`, new version `2026-07-13T12:53:47.809Z`
- Final verified status: **canonical**

## Summary

| ADR | Slug | Masthead fix method | Final status |
|---|---|---|---|
| ADR-0033 | yNFx3YyNap | PM-JSON surgery (table) | canonical |
| ADR-0034 | 12aDkq4iOd | PM-JSON surgery (table) | canonical |
| ADR-0035 | QbEBPuKcGR | markdown `page patch` (bullet list) | canonical |

No conflicts (exit 7) encountered; no retries needed. All `--if-version` values were sourced from a fresh live read immediately prior to the write they guarded.
