---
ticket: ENG-2103
slug: orvex-wiki-sdd
space: orvexwiki
doc_type: sdd
status: draft
---

# Service Done Definition — orvex-wiki

## 1. Live baseline

The starting point is the observed Phase-0 state: D1 engine stability, D16
thin-AGPL modules deployed, and quota enforcement armed. The evidence digest
records the current engine surfaces as real where code and runtime checks prove
them; it does not use the old “94% done” tracking optimism.

Locally, apply-ops, quota read, session exchange, source offer, and registry
cell move have implementation paths. The four bulk tenant-move steps remain
typed 501s. RLS and the physical page-meta column move remain open. The
program-level family E2E result is tracked separately from the engine route
baseline.

## 2. Everything eventually needed

### API surface

The eight M8 operations are the stable starting surface: atomic apply-ops,
quota read, session exchange, source offer, and four tenant-move steps. The
registry cell-move extension is tracked separately. Later waves add behavior
only through additive contract changes: page lifecycle/meta, export and audit,
ACL narrowing, DfM fidelity, cleanup events, tenant portability, and the
wiki-api composition surface. Wiki-shaped programmatic access is fronted by
`orvex-wiki-api`; the engine is not a public agent API.

### Events

Mutations write the transactional `orvex_outbox` Postgres table in the same
transaction as domain state. The relay drains it directly to Kafka
`studio-spine` as catalog CloudEvents. The producer path, event types, payload
schemas, idempotency key, ordering, retry behavior, and trace propagation must
be covered by the tagged contracts and family E2E. Consumers must be safe to
replay and must not read the engine database directly.

### Entitlement and quota

Write chokepoints enforce entitlement caps, with the verdict owned by the
quota domain module. The error contract is frozen at `402 QUOTA_EXCEEDED` and
is propagated unchanged through wiki-api and MCP. Entitlement values are
billing-owned. A-QUOTA's cheap-resource fail-open behavior, cache eviction,
and swap to billing system-of-record are ADR-gated; no plan number is invented
here.

### Cell-lint and tenancy

The service declares compliance with all 14 cell-lint rules, including
tenant-scoped state, cell identity and epoch, per-cell ordered event topics,
idempotent tenant moves, and no cross-service database reads. Personal and
organization tenants remain distinct shapes. RLS, ACL, source-cell fencing,
and destination activation each require an evidenceable test.

### Observability and SLOs

Health, relay liveness and lag, collab liveness, correlation IDs, structured
logs, and metrics are required. The relay must not report green when it cannot
publish or when lag is unknown. Numeric SLOs remain `TBD — defined by SE-Arch
review` unless the contracts and operations owners ratify them.

### Runbook and family E2E

The runbook covers modules-off rollback, source-offer configuration, identity
exchange failures, quota dependency loss, outbox lag/replay, cell move retry,
contract-tag rollback, and tenant isolation. Family E2E is the launch gate for
identity → wiki-api → engine → outbox → spine, with a fresh tenant and real
token.

## 3. Source-availability launch gate

The one canonical engine shape is `GET /api/orvex/source` with `{sha,
sourceRepo}` sourced from `ORVEX_GIT_SHA` and `ORVEX_SOURCE_REPO`. The
remaining conflict is the external repository URL/SHA authority. The
contracts owner and delivery orchestrator must record the reconciled URL in
the tagged contracts artifact before launch; this draft deliberately does not
choose between competing external values.

## 4. Forward compatibility

Later waves are additive under ADR-0008. A breaking operation, envelope
reshape, new spine topic schema, quota ceiling change, or external dependency
requires a new ADR and human ratification. Without that evidence, the change
is dispatch-blocked. The following invariants cannot be reshaped silently:

- the frozen M8 operation meanings and typed 501 behavior;
- the 13-row upstream stability class and its FR-30 gate;
- `402 QUOTA_EXCEEDED` and the billing-owned entitlement seam;
- transactional `orvex_outbox` directly to Kafka `studio-spine`;
- engine-only AGPL DfM import.

## 5. Done gate

Done requires the local pack checker, verified contracts tag and round-trip CI,
all five external wiki pages as drafts, a complete build-prompt self-audit,
SDD concept-map coverage, and `PACK-REVIEW: PASS` from a reviewer who is not
the author. A revise verdict cannot be overridden by the author.
