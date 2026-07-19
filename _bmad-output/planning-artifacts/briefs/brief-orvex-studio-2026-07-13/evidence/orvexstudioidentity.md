# orvexstudioidentity — Digest

## 1. Mandate

orvex-studio-identity is the common authentication spine for the entire Orvex Studio family and the orvex-wiki engine — one SSO surface over **two first-class tenant IdPs (Clerk and Keycloak)**, verified everywhere through this service. It presents an IdP-agnostic principal `{idp, subject, tenant, org_or_realm, roles, token_scope}` to every satellite, brokers/scopes MCP/agent tokens, mints the exchange tokens the wiki engine consumes to create a session (FR-15), and serves the studio-side provision/deprovision contract driven by orvex-studio-workflows. It also co-locates with and owns the **global control plane's org→cell registry** — the platform's only global component — routing both the wiki's tenant-hostname scheme and Studio's single-URL edge geo-router. Public at auth.orvex.ai.

## 2. Inventory

- Anti-Sybil / Free-Tier Abuse — Options & Recommendation (draft)
- Architecture: orvex-studio-identity (canonical)
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical)
- PRD: orvex-studio-identity (draft)

## 3. Decided vs draft

**Canonical / locked:**
- Auth = Clerk + Keycloak dual-IdP, one IdP-agnostic principal (D-IDENT-6).
- Polymorphic tenancy (D-S17, REPLACES "orgs-from-the-start"): personal users are **user-keyed tenants, NO Clerk org**; Teams = Clerk org, minted at a "personal→Teams upgrade pass" (joint identity+billing workstream, re-keys tenant in place).
- Native engine email/password login **removed fully, hosted and standalone, no break-glass** (D-S3); "identity GA is a hard launch prerequisite" — gates the engine's native-login removal (WS-8 before WS-6).
- Break-glass is an identity-side offline-sealed admin credential, scoped to the **console admin plane only** — wiki/Studio have no break-glass.
- Persistence: Postgres (RLS + JSONB append tables) + Redis; **Mongo struck entirely (D-S12)**.
- Kafka-first lifecycle events via **transactional outbox + relay direct-to-Kafka**; Redis→Kafka bridge **retired** (D-S13).
- Hostname canon `{tenant}.{cell}.wiki.orvex.ai` (D-S5); org→cell registry is a two-schema-isolated-store design (PII-free routing core, KV-mirrored + in-jurisdiction sensitive shard) — registry is routing-only, **not** an entitlement authority (billing = SoR, D-P3).
- Billing/entitlements explicitly out of scope — orvex-studio-billing owns plans/quotas/AI-cap; identity supplies only the polymorphic tenant key.
- Architecture doc + its SE-Arch audit are both **status=canonical, ratified 2026-07-06 batch approval**.

**Still draft / open:**
- Whole PRD is `status: draft` despite being packed with locked decisions — never promoted.
- Anti-Sybil page is explicitly "options for decision, not a locked choice" — flagship recommendation (bind AI-trial ledger to a verified principal, not tenant) is not yet ratified.
- OQ-I2 (Clerk token primitive: machine vs M2M), OQ-I6 (Keycloak tenant unit: realm vs group) — both flagged security-load-bearing, unresolved, block A-TOKEN freeze.
- OQ-I5 (break-glass credential form), OQ-I7 (registry read-path cache TTL, gates 2nd cell).
- ADRs registered as required (A-CELL-REGISTRY, A-TOKEN/A-VERIFY, A-SESSION) but **none authored yet** — A-CELL-REGISTRY explicitly deferred to the family space (orvexstudioarch) as a human action.

## 4. API/contract surface

Authored in orvex-studio-contracts; identity conforms. Surface (mostly design-stage, not yet implemented):
- `POST /v1/introspect`, `POST /v1/tokens` (mint/list/delete), `POST /v1/exchange` (FR-15), `GET /v1/whoami` (CLI auth surface, replaces engine `/api/users/me`), device-authorization/token-grant flow.
- `POST /api/clerk/provision` / `deprovision` (studio mirror, `{scope,id,mode}` disable|delete — deliberately a **different shape** than the engine's own `/api/clerk/provision`/`deprovision` `{clerkOrgId,...}` mode deactivate|delete; identity does not front engine provisioning).
- OIDC RP (`/auth/oidc/*`, `/sso/oidc/*`) + SCIM 2.0 (`/scim/v2/*`), relocated from the docmost fork, severing `@docmost/*` imports (D-P9, AGPL relicensing basis).
- Health split: `GET /livez` (always-200) vs `GET /readyz` (real Postgres/Redis/JWKS round-trip) — `/healthz` demoted to a CLI-doctor alias only, must not gate readiness.
- Maturity: **scaffold-only in the actual repo** — `cmd/server/main.go` has `GET /healthz` + **501 stubs** for `/oidc/*`, `/scim/*`, `/clerk/*`; `cmd/deprovisioner/main.go` is a Knative worker that hand-parses CloudEvent headers, logs TODO, returns 202. No `internal/<domain>` tiers exist yet.

## 5. Delivery state

- **Verified build-state (audit, 2026-07-05): "SCAFFOLD with real deploy plumbing."** go.mod has zero pinned deps; only `internal/config/config.go` exists domain-wise. Deploy is real and live: kustomize base+staging, Crossplane Postgres+Redis claims (no Mongo), ExternalSecrets, Knative Broker+Trigger (Kafka-class), Tekton CI, distroless-nonroot Dockerfile.
- Honesty compliant per house standard: 501 stubs say "not implemented — TODO," README says "Status: scaffold," deprovisioner logs TODO + returns 202 — **no fake-done surfaces** found.
- SE-Arch audit verdict: **"needs-tightening."** Findings folded into arch doc: F5 (registry two-store split) fixed-in-draft, F4 (livez/readyz split) fixed-in-draft, F3 (CELL_ID required + CLUSTER_NAME echo) fixed-in-draft, F6 (ADR-trigger register) fixed-in-draft (register only, authoring still pending).
- **F1 (HIGH, confirmed live bug):** dev/staging kustomize clobbers `ENGINE_URL` back to the PRODUCTION docmost engine — the root `replacements` transformer runs after the staging patch. Marked "fixed" via commit `c2e3a70`, re-verified 2026-07-06.
- Open design-not-built items tracked for "Act-1 build": cell-guard/421 middleware, `Idempotency-Key` on internal routes, typed tenant-move step-API + `TENANT_MOVE.md`, transactional outbox+relay, CloudEvents `orvexcell` envelope, NetworkPolicy/mTLS on the destructive `/api/clerk/*` path.
- F8: topology mismatch — arch specifies Knative Service min-scale≥1 (`authd`/`lifecycled`), scaffold ships plain apps/v1 Deployment (`server`/`deprovisioner`) — recorded as unreconciled.
- F2 (open): deprovisioner currently consumes the deprovision CloudEvent directly in identity, conflicting with D-WF-1's "all orchestration lives in orvex-studio-workflows" — flagged as a seam-ownership defect to reconcile before real handlers land.

## 6. Gaps & tensions

- PRD is still `draft` status despite carrying dozens of USER-locked decisions (D-IDENT-1..6, D-S3/5/12/13/17) — canon maturity and document status are out of sync.
- No ADR pages exist anywhere for auth-flow-changing decisions despite the SE-Arch mandatory trigger rule; A-CELL-REGISTRY's ADR is explicitly punted to the family space as a "human/family action," creating a canon gap outside this space's write scope.
- Deprovisioner ownership contradiction (F2): scaffold code embeds orchestration logic that architecture says belongs solely in orvex-studio-workflows ("no double ownership").
- ENGINE_URL peer-call seam unresolved: cell-contract wants cluster-local Service DNS for intra-cell calls, but the engine is "vanilla Docmost at a public myidp.cloud host today" — open tension flagged in both arch and audit.
- Config drift (F10, low sev): `config.go` reads an unsupplied `CLERK_PUBLISHABLE_KEY` and ignores the actually-delivered `CLERK_JWKS_URL`, even though the JWKS URL is load-bearing for verification.
- Anti-Sybil doc admits its own flagship fix is partial: "it only collapses the tenant dimension of the reset; a fresh principal still gets a fresh trial" — anchor strength (email-only vs email+phone) is an explicit unresolved PO decision with no default chosen.
- Security-load-bearing OQ-I2/OQ-I6 (Clerk token primitive, Keycloak tenant unit) remain open and gate the A-TOKEN design freeze — noted twice (PRD + arch) as unresolved.
