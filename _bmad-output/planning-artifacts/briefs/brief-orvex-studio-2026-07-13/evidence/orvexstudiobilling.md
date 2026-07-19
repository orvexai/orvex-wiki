# orvexstudiobilling — Digest

## 1. Mandate

`orvex-studio-billing` is the **plan→entitlement→cap system-of-record for the whole Orvex platform**: a Go service (three binaries — `api`, `webhook`, `metering`) owning the Stripe integration, the plan catalog, the entitlement record (polymorphic user|org tenant), the trial state machine, the plan→cap-and-quota policy (AI spend caps for `ai` AND wiki quotas for the wiki engine — siblings in one catalog), and the append-only usage journal. It exercises a pre-authorized handoff clause from the `ai` and `control` PRDs ("when a dedicated entitlements service exists, system-of-record moves there"), closing their OQ-AI8/OQ-CT8. It is never on any hot path — enforcement stays with `ai` (LiteLLM `max_budget`) and the wiki engine (Redis write-chokepoint counters); billing only decides and serves/pushes the values. Serves both peer products (Studio and orvex-wiki) as first-class consumers from day one.

## 2. Inventory

- Architecture: orvex-studio-billing (canonical)
- Architecture Audit — SE-Arch review (2026-07-05) (canonical)
- PRD: orvex-studio-billing (draft)

Only 3 pages in the space; no ADR pages filed yet (Studio ADR registry doesn't exist yet — blocks filing).

## 3. Decided vs draft

**Canonical/locked (arch page, tightened per SE-Arch 2026-07-05 audit):**
- Postgres-only, no Mongo (D-S12) — raw webhook payloads, usage journal, decision audit all Postgres append tables.
- Polymorphic principal, tenant = user OR org (D-S17, REPLACES "orgs-from-the-start"): free/Personal = Clerk personal account (NO org); Teams/business = Clerk org. Alpha bills users only.
- Outbox-not-bridge (D-B10): engine transactional-outbox relay is a **launch prerequisite** for billing, not a fast-follow; "Redis→Kafka bridge" concept explicitly retired.
- Per-cell billing + one global Stripe (D-B12): global thin stateless forwarder (no webhook secret, no verification) forwards raw body + `Stripe-Signature` untouched to the tenant's home cell; home cell's `webhook` binary is sole verifier.
- Append-only, grandfatherable entitlement versions (A-ENT/D-B3/G4) — "the un-retrofittable property... lands in the first migration."
- Card-required 7-day trial (D-S23, REVERSES earlier card-less design); lapse = normal over-quota rules, nothing deleted; starter/demo content counts against quota.
- Two separate AI cap lines (D-S15): `ai_monthly_budget` (user-action) + `embedding_monthly_budget` (sibling, sized from page quota, content-hash skip) — NOT nested.
- Entitlement push dissolves paywall <60s in both products without reload (D-S20): wiki via cache-evict→Socket.IO, Studio via BFF SSE.
- Free wiki quota values LOCKED (provenance `H5NzkdsOzK`): 200 pages / 1 GiB / 10 MB-file / 2,000 files / 25 members / min(10,180d). £7 Personal values now LOCKED too (D-S7): 20,000 pages / 50 GiB / 50 MB-file / 20,000 files / 25 members / min(100,730d).
- Dunning: 14-day grace in `past_due` then auto-downgrade to Free (D-S19). Launch currency GBP-only (D-S19).

**Still draft / open:**
- Whole PRD is `status: draft` (vs. arch page `status: canonical`).
- OQ-B3 (cap-reached UX/reset semantics), OQ-B7 (trial dedupe strictness — literal-email-hash is only an ASSUMPTION), OQ-B8 (refund/dispute policy — manual is an ASSUMPTION), OQ-B9 (pricing-page ownership), OQ-B12 (dev/crew webhook delivery mechanism) — all open.
- Teams/Enterprise wiki quota values deferred entirely.
- Studio ADR Decision-Records parent page + numbering registry: TBD, blocks filing 5 named mandatory ADR triggers (Stripe true-external port, ai cap-endpoint delta, D-S12 store-engine decision, cross-cell webhook-forward, auth-flow touch).
- Family-wide Mongo reconcile: canon root says Postgres-only but CS §5/§6/§7/§10 still name MongoDB as a first-class tier — internal canon inconsistency, open, billing follows D-S12 pending reconcile.
- Personal→Teams upgrade pass (org mint + tenant re-key) named as a workstream but not designed.

## 4. API/contract surface

Authored in `orvex-studio-contracts` (arch: "billing conforms — CS §12 contract-shape is law").

- **Public/product:** `GET /v1/plans`, `POST /v1/plans/teams/interest`, `POST /v1/checkout`, `POST /v1/portal`, `GET /v1/entitlements/{principal_type}/{principal_id}` (the check primitive — two-segment polymorphic), `GET /v1/billing-state/{principal_type}/{principal_id}`, `GET /v1/usage/{principal_type}/{principal_id}`.
- **Admin (console-fronted):** `GET|PUT /admin/v1/plans/*`, `POST /admin/v1/entitlements/.../override`, `POST /admin/v1/trials/.../regrant`, `GET /admin/v1/interest-list`.
- **Stripe:** `POST /webhooks/stripe` — subscribed event set pinned in PRD FR-B10 (checkout.session.completed, customer.subscription.*, invoice.paid/payment_failed, dispute/refund, customer.updated/deleted, trial_will_end).
- **Internal (`WorkloadIdentityOnly`):** `POST /internal/v1/steps/{trial-start, trial-expire, backfill-batch, purge-stripe-linkage, reconcile-subscriptions, reconcile-caps, tenant-quiesce, tenant-export, tenant-import, tenant-activate}`; `GET /healthz` per binary.
- **Events published:** `billing.subscription.updated`, `billing.entitlement.changed`, `billing.trial.started`, `billing.trial.expired`, `billing.payment.failed`. **Consumed:** `ai.usage.recorded`, `ai.cap.reached`, `ai.cap.warning`, `studio.user.graduated`.
- **Cross-service contract delta owed to `ai`:** a workload-identity variant of `PUT /admin/v1/tenants/{tenant}/cap` — must land in contracts + an ADR before build.
- **Shared 402 `QUOTA_EXCEEDED` contract:** authored once in orvex-studio-contracts, shared verbatim between billing and the wiki engine's F-QUOTA.
- **Maturity:** wire shapes and event schemas are specified in prose but not yet filed as actual OpenAPI/CloudEvents artifacts in `orvex-studio-contracts` — that filing is PRD rollout step 1 ("Contracts first"), not yet executed. CI gates named (test-clock Stripe E2E, lookup-key↔mode check, webhook-set drift check, no-AGPL-import guard, cross-tenant isolation probe, entitlement-semantics conformance fixtures) but none exist yet — zero domain code in repo.

## 5. Delivery state

- **Repo is a scaffold only** (per SE-Arch audit, "Scaffold" build-state statement): `go.mod` has zero deps; no `internal/store`, `internal/event`, `internal/<domain>`, `internal/workflow`, `internal/cache`; all domain logic is **honest `501 not_implemented` / TODO stubs** — explicitly called out as "no fake-done in code." No tests, no CI test workflow.
- Deploy tree (Knative + Kafka-trigger + CNPG/Redis Crossplane claims, distroless Dockerfile) is "unusually complete for a scaffold" — ahead of the code.
- SE-Arch audit (2026-07-05, opus reviewer) verdict: **"needs-tightening"** (not contradicts-canon, not sound) — arch page itself judged sound on every keystone axis; drift is entirely downstream in scaffold code/deploy/README/decision-log.
- 12 findings logged, ALL dispositioned `fixed-in-draft` (in the arch page) or `open-decision` — none `wont-fix`, none silently dropped. Two high-severity: (1) Mongo apparatus still present in scaffold code/deploy despite Postgres-only canon; (2) tenancy literal drift (scaffold comments + local planning docs still say "org-keyed from t0, solo user = personal org" — superseded).
- Explicit warning: repo's own `_bmad-output/.decision-log.md` is stale and "dangerous" — it tells readers the wiki drafts predate this pass and need re-publishing FROM the local files, which would regress the canon-aligned wiki backward. Flagged for correction, not yet fixed (reviewer states it "cannot be fixed wiki-side").
- No ADR pages filed at all — mandatory triggers named but blocked on the (also missing) Studio ADR registry.
- Family canon note (from wiki digest context, not this space): "only orvex-studio-mcp and orvex-studio-workflows carry real code today" — billing is confirmed design-only across the whole platform.

## 6. Gaps & tensions

- **Mongo canon self-contradiction (family-wide):** canon root Principle 5 + D-S12 say Postgres-only, but CS §5/§6/§7/§10 name MongoDB as a first-class "event data" store tier — flagged as needing a family-wide reconcile that a billing-only fix cannot settle.
- **Cross-service contract not yet filed:** the `ai` cap-endpoint workload-identity delta is billing's "highest-blast-radius delta" and explicitly required to land in contracts + an ADR before build — not done.
- **Upstream AGPL entanglement (critic G-D/R14):** the wiki engine's AGPL core still contains real Stripe/billing logic (`STRIPE_SEATS_SYNC` → `BILLING_QUEUE`, migration `20250106T195516-billing.ts`) — must be severed to an event-only seam before this design is honestly implementable; tracked as a cross-service task, not yet executed.
- **ADR registry doesn't exist:** 5 mandatory ADR triggers (Stripe true-external port, ai cap delta, D-S12 store-engine decision, cross-cell webhook-forward, auth-flow touch) are named but cannot be filed until the Studio-wide ADR numbering registry is set up in the "Studio Act-1 run."
- **Teams/Enterprise wiki quotas entirely undefined** — deferred past Personal-tier freeze.
- **Personal→Teams upgrade path (org mint + re-key)** is named as a joint workstream with identity but has no design yet — a real migration-shaped gap.
- **Several open product/finance decisions carried as-is** (OQ-B3 cap-reached UX, OQ-B7 dedupe strictness, OQ-B8 dispute policy, OQ-B9 pricing-page ownership, OQ-B12 dev/crew webhook delivery) — correctly logged as decisions not defects, but still block pieces of build.
- **PRD itself is draft status** while the architecture page is canonical — the requirements document sitting underneath a "locked" design is not itself ratified.
