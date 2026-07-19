# Publish receipts — Phase prompts (2026-07-13)

PO-directed publish of the three finished phase prompts to `orvexstudioarch` (parent `KNZMCOKAV8`), landed as `draft`.

| Title | Slug | URL | Integrity |
|---|---|---|---|
| Orchestrator Prompt — Phase 1: Definition Factory | `yXUWpQpRjx` | https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/orchestrator-prompt-phase-1-definition-factory-yXUWpQpRjx | MATCH |
| Orchestrator Prompt — Phase 2: Isolated Builds & Continuous Proving | `Ng66su4dVG` | https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/orchestrator-prompt-phase-2-isolated-builds-continuous-proving-Ng66su4dVG | MATCH |
| Orchestrator Prompt — Phase 2.5: Product Acceptance E2E | `ErYdXzIj6g` | https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/orchestrator-prompt-phase-2-5-product-acceptance-e2e-ErYdXzIj6g | MATCH |

## Notes

- All three `page create` calls exited 0.
- `p2` and `p25` creates each returned a `DUPLICATE_CANDIDATE`-style heads-up warning (title-overlap against the other phase-prompt pages just created in this same batch) alongside a valid create receipt — per instructions this is treated as fine, not a failure, since a receipt was still returned.
- Integrity check method: fetched each page back via `docmost-cli page get <slug> --no-daemon --output json`, then compared normalized full text (lowercase, stripped of all non-alphanumeric characters) between the fetched `content` field and the source `.md` file.
- First pass showed apparent diffs (~77% similarity) on `p2`/`p25` only. Root cause: the source markdown uses `[[slugId]]` wiki-link syntax for cross-references (e.g. `[[gkkUDzn277]]`, `[[5eFdxN3edd]]`), which docmost-cli correctly rewrites into internal `{dfm:<base64-json-mention>}` tokens on create — an expected, lossless transformation, not corruption. `p1` has no such wiki-links, hence its exact match on the first pass.
- Re-ran the comparison with the fetched `{dfm:...}` mention tokens decoded back to their `[[slugId]]` canonical form before normalizing — all three pages report **MATCH** (exact normalized-text equality against source).
