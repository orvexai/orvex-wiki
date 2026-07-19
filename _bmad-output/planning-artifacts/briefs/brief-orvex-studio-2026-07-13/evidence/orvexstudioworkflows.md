# orvexstudioworkflows — evidence digest

## 1. Mandate

orvex-studio-workflows is the Orvex Studio family's **single Temporal control plane** (D-WF-1): "**all** durable workflows live here, and every satellite stays workflow-free by exposing idempotent step-APIs that central activities call." Every domain instantiates the same reusable four-role template — **ingest** → **dispatch** → **workflow** → **activity** (the only IO). One domain, **clerk-lifecycle** (tenant provision/deprovision/reconcile via Clerk webhooks), is live in production; knowledge-rebuild, ai-tool-loop, and personal→Teams org-conversion are planned extensions of the same template, not new machinery.

## 2. Inventory

- Architecture: orvex-studio-workflows (canonical) — ratified 2026-07-06, batch approval
- Architecture Audit — SE-Arch review (2026-07-05) (canonical)
- PRD: orvex-studio-workflows (draft)
- ZZ table round-trip test delete after (archived) — test artifact, not content

## 3. Decided vs draft

**Canonical/locked:**
- D-WF-1 (USER, 2026-07-03): all Temporal workflows live centrally; no satellite workers.
- Shared Temporal cluster + per-app logical namespace; per-org `TemporalControlPlaneClaim` disabled/broken, "do not re-open."
- NO-KEDA: Knative KPA for HTTP surfaces, fixed-replica Deployments for workers.
- Retry taxonomy: AUTHORITATIVE (unbounded, `MaximumAttempts:0`) vs BEST-EFFORT (3 attempts) — corrects the as-built 10-attempt cap, called out as ship-first in the hardening wave.
- D-S13 Kafka-first spine + outbox-direct relay (Redis→Kafka bridge retired) — launch prerequisite, not deferred.
- D-S17 polymorphic user|org tenancy — solo user = user-keyed tenant, NO Clerk org; org provisioning is Teams-only; personal→Teams upgrade pass is a named workstream.
- D-S12 Mongo struck; D-S11 Linear removed product-wide (no linear-resync domain anywhere).
- FR-W18 Free-plan entitlement provisioning folded into lifecycle domain (billing = SoR, AUTHORITATIVE step).
- Cell posture: global-Temporal singleton is a **sanctioned exception** (cell rule 14 whitelist), not an omission.

**Still draft / open decisions (Studio Act-1, filed as ADRs, sequence starts 0001):**
- F-IDP: whether Clerk webhook ingestion + Clerk Management API contact should move to identity (Principle 4 conflict — "an active Clerk Management-API client holding a secret key in a non-identity service is not webhook verification").
- Cell-routing model (how tenant-lifecycle resolves target cell's wiki/studio/billing origin via identity registry).
- OQ-W3 residual: which of five `clerk.*` CE types become family-consumable spine catalog entries.
- OQ-W1/W2: rename migration timing, namespace consolidation.
- OQ-W6 org-conversion trigger source; OQ-W4 ai-tool-loop payload shape.
- PRD itself is still status: draft (despite being detailed and dated 2026-07-05 session).

## 4. API/contract surface

- No inbound HTTP "API" beyond `POST /webhooks/clerk` (Svix-verified). All other enqueues are **CloudEvents on the spine**, no start-workflow HTTP API by design (A-W10) — "this service's only authenticated inbound HTTP surface remains the Svix webhook."
- Step-API contract (A-W3) for satellites: idempotent, bounded/chunked-by-cursor, response-is-truth (no callbacks), typed errors, no satellite-side orchestration, internal-only (`/internal/v1/*`), declared retry class.
- Contracts dependency (`orvex-studio-contracts`) for CE types + step-API OpenAPI is **NOT-YET-BUILT**: "CloudEvent type constants live locally in `internal/events` with no `orvex-studio-contracts` dependency and no golden-fixture round-trip... the contract seam is asserted in prose, not enforced" (F-SEAM).
- Amendment: one additional read-only inbound surface permitted — an admin-authenticated Temporal-view endpoint for orvex-studio-console — "No write/signal/start surface, ever."
- Known dependency contracts named but not yet formalized: knowledge `/internal/v1/rebuild/{...}`, billing create-Free/revoke entitlement step-API (OQ-W10), ai tool-loop step-API (OQ-W4, blocked on ai PRD).

## 5. Delivery state

**Real/built** (per audit §"Build-state statement" and arch §7 honesty section):
- `go build ./... && go test ./...` green; clerk-lifecycle domain ships real code in production (provision, deprovision-with-grace, hourly reconcile).
- Svix-verified webhook, 1 MB cap, clients injected at composition root, NO-KEDA respected, workflow code determinism-clean.
- Observability real: OTLP → Tempo/Loki/Mimir + Temporal OTel interceptor.
- Update (2026-07-06, folded into audit): baseline CI now exists (`.github/workflows/ci.yml`, go vet/build/test -race) — "the first enforced merge gate." `workflow.GetVersion` IS used at two replay-sensitive branches (billing-free-entitlement, billing-revoke-on-purge).
- Update (2026-07-06): F-CELL items (a) and (b) BUILT — `CELL_ID`/`CLUSTER_NAME` in config, `/healthz` echoes both, `orvexcell` CloudEvent extension stamped on every publish (with test).

**NOT-YET-BUILT** (explicitly labeled to avoid fake-done per CS §11):
- No `WorkflowReplayer` harness over recorded histories (needs a real Temporal server to produce histories — tracked follow-up).
- `orvex-studio-contracts` dependency + golden-fixture round-trip absent (F-SEAM).
- Cell-routing item (c) — cell-routed activity targets via identity registry — remains open decision, not built.
- As-built defects still live at audit time: 10-attempt AUTHORITATIVE cap (silent-loss risk on 720h purge), dispatcher NACKs on already-started (redelivery loop, no DLQ), namespace-local `default` broker (not `studio-spine`), no DLQ/retry on Triggers, `OrgName` display-name payload violates ID-only Temporal-payload rule, ce-id is random UUID not derived from Svix message id (no Idempotency-Key layer), legacy `*.eu-central-1.myidp.cloud` hosts, dangling `httproute-ingress.yaml` reference, dead Temporal secret wiring / unused `CLERK_JWKS_URL`.
- Rename debt: repo renamed on GitHub but Go module path, on-disk dir, image paths, OpenBao secret paths all still say `orvex-workflows` — "works today only via GitHub redirects."

## 6. Gaps & tensions

- **PRD is draft, architecture is canonical** — unusual maturity mismatch; architecture is described as "unusually mature and self-aware," ahead of the PRD's formal ratification status.
- **No-public-host tension**: canon roster lists workflows as "(no public host)" yet a public Clerk webhook exists — "it disappears only if F-IDP moves Clerk ingestion to identity."
- **Cross-doc reconciliation still owed**: four sibling docs (knowledge arch A8, knowledge PRD FR-K24, knowledge PRD deps row, split page) still say "KEDA scaling (in orvex-studio-workflows)" — contradicts the ratified NO-KEDA decision here.
- **Identity A-DATA wording** ("dedup journal stays in orvex-studio-workflows") needs reconciling to "Temporal history + DLQ = the record" (A-W8) — not yet done at time of audit.
- **Ordering race (live, unresolved by broker)**: a late `organizationMembership.created` after `organization.deleted` can re-activate a deprovisioned principal — "per-type Triggers cannot prevent it"; fix (FR-W2 liveness guard) not yet shipped per audit.
- **Studio-side 404 carve-out** is explicitly a temporary hack ("Studio-app era only") that must die at the FR-W7 identity cutover — a load-bearing but temporary convention.
- Contracts catalog (OQ-C6) and this service's five-type enumeration are mutually blocking until resolved.
- AI domain stays "charter-level" — blocked entirely on an as-yet-unwritten orvex-studio-ai PRD (OQ-W4).
