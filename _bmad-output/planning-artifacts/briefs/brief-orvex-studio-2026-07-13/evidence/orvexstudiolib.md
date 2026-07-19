# orvexstudiolib — digest

## 1. Mandate

`orvex-studio-lib` is the shared Go library every Orvex Studio satellite imports so no satellite reimplements a security- or contract-critical seam: the dual-IdP auth verifier and deny-by-default scope enforcement (the family's security ceiling), CloudEvents envelope/type helpers, fail-closed typed clients for the engine/knowledge/billing/identity primitives, Temporal step-API server helpers (D-WF-1 split), Kafka-first observability/raw-topic plumbing, and a clean-room Go DfM↔ProseMirror serializer for the two non-AGPL Go consumers (orvex-wiki-api, the Orvex CLI). It is a pure library — no binaries, no Dockerfile, no deploy — shipped as versioned git tags; generated contract types come from orvex-studio-contracts codegen only.

## 2. Inventory

- Architecture: orvex-studio-lib (canonical)
- Architecture Audit — SE-Arch review (2026-07-05) (canonical, ratified 2026-07-06)
- PRD: orvex-studio-lib (draft)

## 3. Decided vs draft

**Decided / locked (USER-mandated, folded 2026-07-05):**
- Ten-package topology: `pkg/auth`, `pkg/events`, `pkg/engineclient`, `pkg/knowledgeclient`, `pkg/billingclient`, `pkg/identityclient`, `pkg/temporalutil`, `pkg/obs`, `pkg/kafkautil`, `pkg/dfm`.
- Cell apparatus (day-1, not retrofittable): claim wire-names `cell`/`cell_epoch` frozen in `pkg/auth`, cell-guard 421 middleware, `CELL_ID`/`CLUSTER_NAME` `/healthz` echo, `{domain}-events.{cell}` topic naming, `orvexcell` CloudEvents extension + fail-closed consume in `pkg/events` — all mandated by the SE-Arch audit (fixed-in-draft) per cell contract Rules 2/3/4/5/6.
- Kafka-first from launch: studio-spine is Kafka-backed day one, engine outbox→relay→Kafka is the sole event path (no Redis→Kafka bridge, no Redis Streams stage — corrects a prior misframing per canon P2).
- AGPL clean-room boundary for `pkg/dfm` (USER 2026-07-03): four-function surface `PMToDfM`/`DfMToPM`/`MarkdownToPM`/`MarkdownToDfM`, written only from documented schema + engine's block-schema catalog, never AGPL TS source; provenance-audit of the legacy docmost-cli serializer (FR-L27) must pass before pkg/dfm lands.
- D-WF-1: all Temporal central in orvex-studio-workflows; satellites only get step-API server helpers, never an in-satellite worker.
- OQ-L5 CLOSED (2026-07-05): `pkg/identityclient` lands in lib (provision/deprovision types kept distinct from engine's).
- Billing = plans/entitlements SoR; lib only reads fail-closed (`pkg/billingclient`).
- Linear removed platform-wide (D-S11): no Linear consumer/event/client in lib.
- CLI rebirth (D-S10): Orvex CLI built from scratch imports `pkg/dfm`; legacy docmost-cli serializer is retired, not "reborn."

**Still draft / open:**
- Whole PRD page is status `draft` (architecture + audit are canonical).
- OQ-L1 (JWKS/issuer-registry source — assumed identity mirror), OQ-L2 (single vs per-package Go module), OQ-L3 (codegen generator toolchain), OQ-L4 (high-privilege declaration mechanism), OQ-L6 (workload-identity mechanics), OQ-L7 (token audience model) — all gate specific FRs before pkg/auth v0.1 or first release.
- Studio ADR registry (parent page + `NNNN` numbering) is **TBD — set during the Studio Act-1 run**; blocks filing several inline decisions (A-VERIFY-IMPL, A-DEPS, A-DFM, A-CELL, A-VERSION, OQ-L5 closure) as discrete draft ADRs.
- Canon-page reconciliation open: canon roster says lib owns "cell claim/envelope helpers," cell contract §5 phrases it as living in contracts, CS §6 makes contracts schema-only. Working resolution: lib owns runtime Go helpers, contracts owns wire schema/fixtures/cell-lint — but the two canon pages themselves are not yet reconciled.

## 4. API/contract surface

- No HTTP API of its own — it is a client/helper library. Contract surface is entirely **consumed**, generated from orvex-studio-contracts codegen (event catalog constants + payload types, envelope profiles incl. `orvexcell` extension + cell-claim schema, engine/knowledge/identity/step-API shapes, scope schema, golden fixtures) committed under `gen/`-suffixed trees, pinned to a contracts release tag, CI regen-diff gated (hand-editing generated code is impossible to land).
- CloudEvents 1.0 envelope helpers (`pkg/events`): construct/parse/validate, structured + binary mode; stamps `orvexcell` extension; fails closed on cell mismatch.
- Typed fail-closed clients: `engineclient` (block chokepoint, ACL narrow, export, F-QUOTA quota-status + 402 `QUOTA_EXCEEDED` typed terminal/non-retryable), `knowledgeclient` (query/retrieve/related/duplicates, delta cursors), `billingclient` (entitlements read, fail-closed), `identityclient` (introspect/mint/lifecycle mirror).
- Maturity: **scaffold-level today** — `go.mod` is 52 bytes, zero deps, no `go.sum`; the contract types don't exist yet (codegen not live, OQ-L3 open); "placeholder event constants are live in the scaffold" and must be treated as unpinned until first codegen drop.
- Step-API server contract (`pkg/temporalutil`): idempotency-key replay middleware, typed retryable/terminal/success error envelope, constant-200/no-existence-oracle shape opt-in for destructive lifecycle endpoints — this is the internal contract satellites expose to central Temporal.

## 5. Delivery state

- **Repo build-state (per the SE-Arch audit, evidence-cited at commit `c1bd0dd`):** genuine scaffold — `go.mod` 52 bytes, zero external deps, no `go.sum`; seven packages are single `doc.go` charter stubs with `// TODO`; **no CI** (`.github/` absent); **no tests**. Correctly absent: `cmd/`, Dockerfile, deploy manifests.
- Absent-and-to-be-added: `pkg/dfm`, `pkg/billingclient`, `pkg/identityclient`, `pkg/auth/authtest`, the `gen/` trees, any lint/CI.
- Two scaffold charters are stated as stale and require correction: `pkg/temporalutil/doc.go` (in-satellite KEDA worker framing, superseded by D-WF-1 split) and `pkg/auth/doc.go` (single-issuer JWKS + informal header scheme, superseded by dual-IdP pipeline).
- The document is explicit that this is "design intent against a stub, not drift against shipped code" — i.e., the wiki documents an evolved 10-package design well ahead of any implementation.
- Rollout sequencing given: `pkg/auth` + `authtest` ship first (co-developed with identity), `pkg/identityclient` alongside; `pkg/obs`/`pkg/events`/`pkg/kafkautil` are launch-line (Kafka-first); `pkg/engineclient`/`pkg/knowledgeclient` grow method-by-method; `pkg/billingclient` lands when billing exposes its seam; `pkg/dfm` lands only after the FR-L27 provenance audit passes, implementation second, FR-L28 parity gate green third. `v0.x` → `v1.0.0` gated on live contracts codegen + two satellites conformance-green against deployed identity.
- No handoff/gate/checklist artifacts beyond the audit itself; no 501/not-implemented markers since there is no running service to probe.

## 6. Gaps & tensions

- **Overall audit verdict was `contradicts-canon`** solely on the cell dimension (Rules 2/3/6 + canon-roster role) plus a canon-P2 event-path misframing — all now fixed-in-draft, but this shows the wiki page itself needed a correction pass to reach canon compliance.
- Canon-page contradiction still open (unresolved as of this digest): cell contract §5 says the shared principal lib + envelope helper live in *contracts*; the canon roster says *lib*; CS §6 says contracts is schema-only. Lib's design "models the runtime helpers in lib regardless," but the two canon pages need a human reconciliation pass.
- Contracts-side wording mismatch flagged: contracts D-CON-2 says "codegen is a build step in each consumer" vs lib's stance that satellites never run codegen, only import lib's `gen/` — recorded as OQ-L3, unresolved.
- DfM parity gate corpus is explicitly called "inadequate" — only 6 core-GFM fixture pairs vs a stated need for all 21 engine embeds, opaque round-trips, table-cell marks, and mention syntax before wiki-api's Phase-1 exit.
- "Contamination laundering" risk named outright: the legacy docmost-cli serializer that `pkg/dfm` replaces has no CI guard against AGPL contamination today; the FR-L27 audit is a hard gate before `pkg/dfm` can land.
- ADR discipline gap: multiple decisions meet the mandatory-ADR trigger bar (A-VERIFY-IMPL, A-DEPS, A-DFM, A-CELL, A-VERSION, OQ-L5 closure) but cannot be filed as discrete draft ADRs because the Studio ADR registry doesn't exist yet (blocked pending Act-1 run).
- The PRD (draft) still carries the pre-tightening language for three canon surfaces (principal shape, envelope helper, Redis→Kafka framing) that the audit fixed only in the architecture page — the audit explicitly flags this PRD mirror as an outstanding follow-up, "outside this audit's write scope."
- D-WF-1 enforcement is convention + CI grep only, not a compiler wall — acknowledged risk that a satellite could still import the worker half.
