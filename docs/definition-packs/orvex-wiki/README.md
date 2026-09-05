---
ticket: ENG-2103
service: orvex-wiki
space: orvexwiki
status: draft
---

# ENG-2103 — orvex-wiki Service Definition Pack

This directory is the repository-side mirror of the five pack artifacts. It is
deliberately still a **draft**: wiki draft status, the contracts-repository tag,
contracts CI, source-offer ownership, and adversarial review are external gates
and are not inferred from local files.

| Artifact | Slug | Local mirror |
| --- | --- | --- |
| PRD delta | `orvex-wiki-prd-delta` | [prd-delta.md](prd-delta.md) |
| Contract summary | `orvex-wiki-contract-summary` | [contract-summary.md](contract-summary.md) |
| Test plan | `orvex-wiki-test-plan` | [test-plan.md](test-plan.md) |
| Service Done Definition | `orvex-wiki-sdd` | [sdd.md](sdd.md) |
| Build prompt | `orvex-wiki-build-prompt` | [build-prompt.md](build-prompt.md) |

Run the repo-local gate with:

```sh
scripts/eng-2103-pack-check.sh
```

Run the certification gate only after the delivery orchestrator supplies the
external evidence:

```sh
scripts/eng-2103-pack-check.sh --certify
```

The certification command intentionally fails until a reviewer other than the
author records `PACK-REVIEW: PASS`, the contracts tag and CI result are
verified, all five wiki pages report `status=draft`, and the source-offer
endpoint decision is ratified by its owner. A claimed tag or review is not
treated as evidence.

The local contract currently has eight M8 operations plus the already-shipped
registry cell-move extension. The extension is recorded separately in the
contract summary so the M8 count is not silently changed.
