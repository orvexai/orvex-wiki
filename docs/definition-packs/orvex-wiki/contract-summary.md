---
ticket: ENG-2103
slug: orvex-wiki-contract-summary
space: orvexwiki
doc_type: contract-summary
status: draft
---

# Contract summary — orvex-wiki engine surface

## M8 surface

The frozen M8 skeleton is eight operations. The local OpenAPI source also
contains the separately delivered registry cell-move extension; it is not
counted as one of the eight M8 operations.

| Operation | Route | Current local state |
| --- | --- | --- |
| `orvexApplyOps` | `POST /api/orvex/pages/{pageId}/apply-ops` | real atomic CAS write |
| `orvexGetQuota` | `GET /api/orvex/quota` | real usage-vs-cap read |
| `orvexSessionExchange` | `POST /api/orvex/session/exchange` | real identity exchange |
| `orvexSourceOffer` | `GET /api/orvex/source` | real, loud 500 when unconfigured |
| `orvexTenantMoveQuiesce` | `POST /api/orvex/tenant-move/quiesce` | typed 501 |
| `orvexTenantMoveExport` | `POST /api/orvex/tenant-move/export` | typed 501 |
| `orvexTenantMoveImport` | `POST /api/orvex/tenant-move/import` | typed 501 |
| `orvexTenantMoveActivate` | `POST /api/orvex/tenant-move/activate` | typed 501 |

The local extension `orvexTenantCellMove` is a real registry relocation route.
The marker gate requires every typed 501 to have exactly one
`ORVEX_NOT_IMPLEMENTED` marker and requires the real-operation set to match the
OpenAPI classification.

## Event contract

The event path is `orvex_outbox` in Postgres, written in the mutation
transaction, then drained directly to Kafka `studio-spine`. Event names and
CloudEvent payloads come from the contracts catalog; the engine does not create
a second event taxonomy. The outbox id is the deduplication key and the relay
preserves ordering for the per-cell topic contract.

## Boundary rules

- `@orvex/dfm` is imported only by this AGPL engine.
- `orvex-studio-lib/pkg/dfm` or a network call to `orvex-wiki-api` is the only
  closed-satellite path to DfM behavior.
- API clients must be generated beside Go stubs from the tagged contracts
  artifact under ADR-0035. This repository does not claim that external tag or
  generated package exists until contracts CI verifies it.
- Quota rejection is the frozen `402 QUOTA_EXCEEDED` envelope; entitlement
  values remain billing-owned and the cheap-resource fail-open rule is
  ADR-gated.

## Verification state

The local OpenAPI and marker gate are checked by
`scripts/eng-2103-pack-check.sh`. The contracts repository tag, fixture
round-trip, generated client package, and wiki-draft status are external
evidence and remain **BLOCKED** until supplied by their owners.
