---
ticket: ENG-2103
slug: orvex-wiki-test-plan
space: orvexwiki
doc_type: test-plan
status: draft
---

# Test plan — orvex-wiki Wave 3

Every tier has a named owner, a test boundary, and a binary gate. Tests use
real implementations at local seams and fixtures at network seams.

| Tier | Owner | Required coverage | Binary gate |
| --- | --- | --- | --- |
| Unit | Engine module owner | quota verdict, CAS/version math, DfM transforms, CloudEvent envelope, source-offer validation | Vitest/Jest unit suite is green; no own-package mocks |
| Store | Engine store owner | outbox atomicity, page metadata and quota counter reads, migration behavior | Postgres testcontainers; rollback proves no orphan event row |
| Contract | Contracts owner | OpenAPI operation set, CloudEvent catalog, quota errors, DfM golden fixtures, generated clients | Contracts CI round-trip is green on the verified tag; `orvex-marker-check.sh` passes |
| Crew-slot | Delivery orchestrator | module-off vanilla boot, module-on route availability, AGPL import guard, allow-list drift | Dedicated crew slot runs the repo gate and records its commit SHA |
| Family E2E | Family E2E owner | identity exchange, wiki-api composition, quota propagation, outbox-to-spine delivery, tenant isolation, source offer | Fresh tenant and real identity-minted token; any red surface freezes implicated merges |
| Thin UI | UI crew owner | AI affordances only read satellite SSE; no server AI logic; light/dark themes and keyboard paths | Vitest + Playwright + axe; human says “looks good AND works” in both themes |

## Named scenarios

- `orvexApplyOps`: valid batch commits, stale `ifVersion` returns 409, quota
  rejection returns 402, and a partial batch leaves no write or event.
- `orvexGetQuota`: warm counter, cold truth query, unreadable counter as
  explicit unknown, and no fabricated zero.
- `orvexSessionExchange`: inactive token, unprovisioned principal, disabled
  user, and successful tenant-scoped session mint.
- `orvexSourceOffer`: exact configured `{sha, sourceRepo}` and loud 500 when
  either build value is absent.
- Tenant-move steps: missing idempotency key and malformed manifest fail before
  the typed 501 sentinel.
- Event path: same-transaction mutation rollback removes the outbox row;
  successful relay publishes the catalog CloudEvent and marks the row relayed.
- AGPL boundary: static import guard rejects a closed satellite import and the
  pack contains no satellite client import of `@orvex/dfm`.

## Test data and ownership

The contracts owner supplies committed golden fixtures and the tag SHA. The
engine owner supplies real response fixtures for external dependencies. The
family E2E owner supplies a fresh tenant and identity token. No test may turn a
501, unknown reading, or missing source offer into a plausible success.
