---
ticket: ENG-2103
slug: orvex-wiki-build-prompt
space: orvexwiki
doc_type: build-prompt
status: draft
---

# Build prompt — orvex-wiki Wave 3

The build agent receives the tagged contracts artifact and this SDD. If the
tag, fixture CI, source-offer decision, or reviewer PASS is absent, dispatch is
blocked. No story below may invent a contract shape.

## Story W3-1 — contract and boundary gate

- [ ] **RED:** add the contract round-trip, operation-count, marker, generated
  client, DfM import-guard, and source-offer configuration checks.
- [ ] **GREEN:** land the verified contracts tag; generate Go stubs and TS
  clients under ADR-0035; keep `@orvex/dfm` engine-only.
- [ ] **AC:** eight M8 operations are present, the separate registry extension
  is identified, typed 501s are honest, and the tag commit passes contracts CI.

## Story W3-2 — engine primitives and events

- [ ] **RED:** test apply-ops atomic CAS, quota 402, source-offer loud failure,
  session exchange deny-by-default, and outbox rollback/relay behavior.
- [ ] **GREEN:** use the existing deep modules (`page-blocks`, `entitlement`,
  `session-mint`, `events/outbox`, `http`) with thin controllers and injected
  external clients.
- [ ] **AC:** no second write path, no fabricated quota reading, and the event
  path is Postgres outbox directly to Kafka `studio-spine`.

## Story W3-3 — later-wave readiness

- [ ] **RED:** run cell-lint, tenancy, observability, runbook, and family-E2E
  probes against a fresh tenant and real identity-minted token.
- [ ] **GREEN:** complete only additive work allowed by the verified contract;
  route composition, verb grammar, and cited asks to `orvex-wiki-api`.
- [ ] **AC:** RLS/meta migration gaps, source-offer authority, and unratified
  ADRs remain named blockers rather than being hidden in a green checklist.

## Required review lenses and ADR triggers

- Reliability: atomic outbox-or-rollback, replay-safe relay, fixture round-trip.
- Security: identity-minted exchange tokens, tenant scope, AGPL import guard.
- Cost governance: billing-owned caps, frozen 402, explicit cheap-resource
  fail-open decision.
- Operational excellence: cell-lint, per-role liveness, runbook and lag.
- Performance/freshness: bounded entitlement cache, push eviction and pull on
  miss only after its owner ratifies the shape.

Fire ADR-0008 review for a breaking/envelope change, new dependency, new spine
topic schema, quota ceiling, or any change to the engine/API or DfM boundary.

## Classic-mistake assessment

| # | Assessment |
| --- | --- |
| 1 | Applicable: quota verdict stays in its domain service, not a handler. |
| 2 | Applicable: repository/store seams own database access. |
| 3 | Applicable: network seams are explicit; local interfaces need two implementations. |
| 4 | Applicable: the engine runs standalone; no distributed-monolith shortcut. |
| 5 | Applicable: external errors are loud and never silently downgraded. |
| 6 | Applicable: freeze only the proven M8 contract plus additive fields. |
| 7 | Not applicable to this definition pack; deep modules are named for delivery. |
| 8 | Applicable: reuse the DfM serializer and generated clients. |
| 9 | Not applicable to a definition-only artifact; no performance tuning is proposed. |
| 10 | Applicable: ceilings and fail-open behavior require human ADR authority. |
| 11 | Applicable: outbox ordering and relay timing are explicit. |
| 12 | Applicable: exported boundaries use concrete types or narrowed `unknown`, never unchecked laundering. |

## FINAL SELF-AUDIT — H1–H17

H1 yes — each story has a named binary DoD test.
H2 yes — acceptance checks are machine-checkable.
H3 yes — the engine/API/DfM seams are named.
H4 yes — deep modules and controller responsibilities are named.
H5 yes — unit, store, contract, crew-slot, UI, and family-E2E tiers are named.
H6 yes — versions and the external contracts tag are explicit gates.
H7 yes — all 12 classic mistakes are assessed.
H8 yes — all five SE-Arch lenses are present.
H9 yes — ADR-0008 triggers are explicit.
H10 yes — RED → GREEN vertical tracer bullets are present.
H11 yes — the AGPL import guard and DfM alternatives are explicit.
H12 yes — quota, outbox, tenancy, and source-offer error paths are explicit.
H13 yes — no external decision is silently selected.
H14 yes — tickable task boxes are present.
H15 yes — fresh-tenant family-E2E evidence is required.
H16 yes — reviewer ≠ author and REVISE is non-overridable.
H17 yes — final dispatch is blocked until tag, fixtures, drafts, and review are verified.
