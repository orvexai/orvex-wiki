# Space study: orvexstudioidentity

Space purpose: orvex-studio-identity — the family's dual-IdP (Clerk + Keycloak) auth spine, token
authority, and owner of the global org/tenant→cell routing registry. Per the delivery-plan spine
this is the **furthest-along satellite** (MATURE-DEPLOYED, 42-47 real routes) but with a live,
unowned deprovision gap. All 10 pages read.

## 1. Per-page table

| slug | title | status | one-line substance |
| --- | --- | --- | --- |
| CYHyoUd7J1 | Anti-Sybil / Free-Tier Abuse — Options & Recommendation | draft | Research spike: layered defense-in-depth against mass free-tenant minting + AI-trial reset; flagship recommendation = bind the 10-action AI trial to a `verified_principal`, not the tenant; anchor-strength choice left open for PO |
| dQUjrSXhdp | Architecture: orvex-studio-identity | canonical (ratified 2026-07-06) | The service architecture: dual-IdP resolver, JWKS+introspection verify, frozen-at-mint tokens, FR-15 exchange seam, studio-mirror lifecycle, global tenant→cell registry (2 schema-isolated stores), Postgres+Redis, Knative always-warm topology |
| YuY9XWpKPS | Architecture Audit — SE-Arch review (2026-07-05) | canonical (ratified 2026-07-06) | Adversarial Well-Architected review of the arch draft against a SCAFFOLD build-state; 10 findings (F1–F10), most fixed-in-draft, F1/F2/F7/F9/F10 left as open decisions/repo hazards |
| 2CEeUYe7LL | Build Prompt — orvex-studio-identity (ENG-2101) | draft, never ratified | Per-agent build prompt: repo is now MATURE-DEPLOYED (24,308 LOC, 47 routes, only 3 stubs), 8 must-resolves (MR-I1..I8) block specific stories, seam map, tier placement, Done gate |
| k3J1v8ovfG | Contract Summary — orvex-studio-identity | draft, never ratified | Contract vs code gap: `openapi/identity.yaml` is a 10-op draft skeleton (v0.0.1-draft) vs 47 served routes; event-type drift (2 of 4 emitted types mismatch); zero fixtures/identity |
| ntuw6s4E5P | PRD-delta — orvex-studio-identity | canonical | Reconciles brief/map against the DEPLOYED artifact (not the draft PRD); records 7 artifact-driven findings and formalizes MR-I1..MR-I8 as surfaced-not-decided seams |
| cnhla0qRRF | PRD: orvex-studio-identity | **superseded** | The original comprehensive PRD (FR-I1–I20, NFR-I1–I7, F6 memory-security fold-in); goals G1-G5, dependencies, decisions D-IDENT-1..6, OQ-I1..I7; superseded by later artifacts (PRD-delta + SDD) |
| mZdESLTkvP | SDD — orvex-studio-identity | draft, never ratified | The total service-level Done list; full API surface (2a), events (2b), cell-lint 14 rules (2d), observability, test tiers, anti-fake-done clause; records MR-I1 as RESOLVED by ADR-0036 (workflows owns Clerk lifecycle) |
| KxfO1u4PYU | Temporary User-Granted Support Access — Feature Spec | draft (lands per PO ruling R24) | Cross-service feature spec: identity mints time-boxed support-access grants (72h default/168h ceiling, fixed scope, never transitive); console assumes sessions; ui controls grant/revoke; all audit flows to the dedicated audit+compliance service (R25/ADR-0037) |
| QJ4phlmRcl | Test Plan — orvex-studio-identity | canonical | CS §5 category assignments fixed per dependency; identity is the family's ONLY Row-4 (true-external IdP) service; 5 test tiers; readiness is the hollow-healthy trap (no /readyz, no /livez) |

## 2. Deeper summaries — load-bearing pages

### Architecture: orvex-studio-identity (dQUjrSXhdp) — canonical

- Stateless Go service (Knative, always-warm), one image `ARG CMD`; per-cell `authd`/`lifecycled`
  (canon names — repo actually ships `server`/`deprovisioner`/`reconciler`/`sealtool`, a recorded drift).
- **A-IDP**: dual-IdP resolver (`ClerkResolver`/`KeycloakOidcResolver`), selected per tenant from the
  registry, keyed by token `iss`; normalizes to IdP-agnostic principal `{idp, subject, tenant,
  org_or_realm, roles, token_scope, exp}`. `orvex-studio-lib/auth` embeds the same verifier for
  every satellite.
- **A-VERIFY**: local JWKS + Redis-cached introspection (TTL 30-60s), hard-bounded fail-closed grace;
  high-privilege ops require FRESH no-grace introspection; push-revocation channel via event-spine.
- **A-TOKEN**: MCP/agent tokens FROZEN AT MINT, per-IdP; scope derived server-side only, never
  client-supplied; enforced in shared `orvex-studio-lib/auth` (deny-by-default) so no satellite is a
  weak ceiling.
- **A-SESSION (FR-15 seam)**: identity verifies IdP → mints short-lived exchange token → engine
  consumes → engine sets its own cookie. Engine native login (password/setup) removed FULLY, hosted
  AND standalone (D-S3); identity GA is a hard launch prerequisite (no fallback issuer).
- **A-LIFECYCLE**: identity is the studio-side mirror (NOT an engine proxy) of provision/deprovision;
  auth = workload identity (mTLS/SPIFFE), never a static bearer; delete is two-phase (soft-disable →
  gated hard purge).
- **A-BREAKGLASS**: IdP-independent offline-sealed emergency admin credential, console-admin-plane
  only — not an engine login (D-S3 has zero exception).
- **A-DATA**: Postgres (RLS) + Redis; NO Mongo (D-S12). Polymorphic tenant is THE model (D-S17): a
  personal tenant = user-keyed (no Clerk org), Teams = org-tenant, reached via a personal→Teams
  upgrade pass (identity+billing joint workstream).
- **A-CELL-REGISTRY**: identity owns the platform's ONLY global component — the `tenant→cell`
  routing registry (routing authority, NOT entitlement authority; billing owns
  plans/entitlements/quotas/AI-cap, D-P3). Two schema-isolated stores: PII-free routing core
  (replicable, KV-mirrored) + in-jurisdiction sensitive shard. Serves BOTH products: wiki hostname
  scheme `{tenant}.{cell}.wiki.orvex.ai` and Studio's edge geo-router behind orvex.ai.
- API surface includes `/v1/introspect`, `/v1/tokens`, `/v1/exchange` (FR-15), `/v1/whoami` (CLI
  auth), device-grant, Clerk provision/deprovision, OIDC-RP, SCIM 2.0, `/livez`/`/readyz` split
  (readyz round-trips Postgres/Redis/JWKS; `/healthz` demoted to CLI-doctor alias only).
- Kafka-first: transactional outbox + relay publishes DIRECT to Kafka; Redis→Kafka bridge RETIRED (D-S13).
- Open decisions carried honestly: OQ-I2 (Clerk token primitive), OQ-I6 (Keycloak tenant unit=realm
  vs group), OQ-I5 (break-glass credential form), OQ-I7 (registry cache policy, gates 2nd cell),
  deprovisioner ownership (F2), ENGINE_URL peer-call seam, plus repo-side hazards F1/F7/F8/F10.
- ADR triggers registered (not yet authored): A-CELL-REGISTRY → orvexstudioarch (family-space, human
  action); A-TOKEN/A-VERIFY and A-SESSION → service-space ADRs.

### Architecture Audit — SE-Arch review (YuY9XWpKPS) — canonical

- Verified build-state at audit time: SCAFFOLD with real deploy plumbing (2 binaries, 501 stubs).
- Verdict: needs-tightening. F1 (dev clobbers ENGINE_URL to PROD, HIGH) later fixed in repo commit
  c2e3a70. F3/F4/F5/F6/F8 fixed-in-draft (folded into arch page above). F2 (deprovisioner ownership),
  F7, F9, F10 remain open-decision/repo-side.
- Compliant positives: no Mongo, no Temporal worker, ExternalSecrets-only, distroless-nonroot,
  opaque non-parsed CELL_ID, Kafka-class broker shipped correctly.

### Build Prompt (2CEeUYe7LL) / Contract Summary (k3J1v8ovfG) / PRD-delta (ntuw6s4E5P) / SDD
(mZdESLTkvP) / Test Plan (QJ4phlmRcl) — the Definition-Factory Wave-3 pack, all dated 2026-07-15/16,
draft/never-ratified except SDD-adjacent canonical pages — collectively the most current
ground-truth on the LIVE deployed service (dev bdb91ca):

- Repo reality (measured, not asserted): 17 internal packages, 4 cmd binaries (`server`,
  `deprovisioner`, `reconciler`, `sealtool` — 2 more than the arch's canonical 2-binary topology),
  47 served routes, only 3 are 501 stubs (`jwksInvalidate`, `listTokens`, `deprovision`).
  `server.go`'s own doc-comment ("most routes still stubs") is STALE — believe the code.
- **The contract is a 10-op draft skeleton (`openapi/identity.yaml` v0.0.1-draft, x-status:draft)
  vs 47 real routes** — freezing the current tag would freeze ~10 of 47 routes (MR-I2). Event-type
  drift: repo emits `identity.cell.assigned` (uncontracted) and `identity.provisioning.completed`
  vs contract's `.done`. Zero `fixtures/identity`, zero `sources/identity` entry — no sibling can
  fake identity from committed fixtures yet.
- **MR-I1 — Clerk deprovision is a two-sided, UNOWNED gap; end-to-end deprovision is a TOTAL NO-OP**
  on dev: identity's own route is a 501 stub; `cmd/deprovisioner` consumes an event
  (`wiki.user.deprovision.requested`) that NOTHING in the fleet publishes; workflows'
  `CallWikiDeprovision` targets a dead engine route. **RESOLVED 2026-07-15 by ADR-0036** (PO ruling,
  po-decisions/2026-07-15.md): orvex-studio-workflows OWNS the full Clerk/tenant lifecycle
  (provision+purge+all); identity keeps sole Clerk creds + the tenant→cell registry and must land
  the REAL deprovision callee (replacing the 501), driven by workflows via ADR-0034 scoped
  credential lanes (no shared static bearer).
- Full 8 must-resolves: MR-I1 (deprovision, resolved via ADR-0036), MR-I2 (contract freeze — open),
  MR-I3 (OQ-I2 Clerk token primitive), MR-I4 (OQ-I6 Keycloak tenant unit), MR-I5 (anti-Sybil
  anchor), MR-I6 (OQ-I7 registry cache policy, gates 2nd cell), MR-I7 (OQ-I5 break-glass form),
  MR-I8 (`POST /v1/registry/move` served UNAUTHENTICATED today — live security gap).
- Readiness is the hollow-healthy trap for THIS service: `/readyz`/`/livez` DO NOT EXIST; both k8s
  probes hit a static-200 `/healthz`. ArgoCD Healthy only proves the pod serves the mux.
- 46 Linear build-stories already filed (ENG-2407..2448 + 2704/2705/2745/2785), all Todo,
  dispatch-blocked until the contract tag exists; grouped into 10 milestones.
- CS ❌ rows assessed for this repo (thin handlers, only `internal/store/postgres` touches pgx, only
  `internal/event` touches Kafka, never mock own packages, frozen-at-mint claims, payload-derived
  timestamps, never unilaterally raise a ratified constraint).
- Identity is the family's ONLY Row-4 (true-external IdP) test dependency — Clerk/Keycloak responses
  must be REPLAYED from committed real responses, never hand-authored (test plan §2).
- ADR-0037 (ratified 2026-07-16) names the shared `orvex-studio-audit` WORM sink as the family audit
  stream's decided owner; identity's audit is authorized to re-point there but has not yet.

### Temporary User-Granted Support Access — Feature Spec (KxfO1u4PYU) — draft, per PO ruling R24

- Cross-service (identity/console/ui) support-access grant mechanism. identity owns mint,
  auto-expiry, dual revoke; console owns assume/act-as-user surface; ui owns owner-side control.
- Defaults (PO-ruled, not implementer-negotiable): TTL 72h default / 168h hard ceiling; scope fixed
  `workspace:read + act-as-user` (never billing/secrets mutation, never client-widenable); owner
  notified on EVERY session start; grants NEVER transitive; instant dual revoke, re-verified per
  action (not cached from assume-time).
- **Every action under a grant is audited by the dedicated audit+compliance service** (ENG-2815/2816,
  ADR-0037) per PO ruling R25 — never by identity/console/ui themselves.
- Several wire-shape fields explicitly marked TBD (identity's own build-time call): grant object
  shape, delegated support-session token shape (principalType discriminator + grantId), CloudEvent
  taxonomy name (working draft `identity.support_grant.transitioned`, not frozen).
- Threat notes: named residual risk (legitimately-scoped-but-intent-violating support access) is
  explicitly out of scope; notification is emission-only, not delivery-guaranteed (gap named).

### PRD: orvex-studio-identity (cnhla0qRRF) — status=SUPERSEDED

- Original comprehensive PRD (FR-I1–I20, NFR-I1–I7, plus F6 memory-security fold-in FR-S1–S6).
- Still holds the canonical decision log D-IDENT-1..6 and OQ-I1..I7 that later pages (Architecture,
  PRD-delta, SDD) reference/refine, but the page's own status is now superseded — the PRD-delta and
  SDD are the current reconciliation layer on top of it, not a full replacement of its content.

## 3. Bindings on the AI-surfaces redo (MCP / API / CLI)

These are the identity-space commitments that constrain the MCP/API/CLI PRD-architecture redo:

- **Every satellite verifies via `orvex-studio-lib/auth`** — the shared Go verifier identity DEFINES
  (deny-by-default, JWKS-cache + bounded introspection). MCP and API (both Go, per the family
  topology) MUST consume this shared verifier, never hand-roll token verification. TS satellites use
  the ADR-0035 typed TS client instead — confirm which of mcp/api/cli are Go vs TS at build time (the
  PRD-delta flags `orvex-studio-lib` as understated-critical and possibly still a scaffold; VERIFY
  before assuming it's shipped).
- **Token minting/scoping (A-TOKEN)**: MCP/agent tokens are frozen-at-mint, per-IdP, scope derived
  SERVER-SIDE only from authoritative sources — no client (including MCP or CLI) may supply or expand
  scope. `POST /v1/tokens` treats BOTH front ends as untrusted (CSRF/origin binding required). Any
  MCP/API design that mints or renders scope client-side violates this ceiling.
- **CLI seam is explicitly identity-owned (F7/FR-I20)**: `GET /v1/whoami` (replaces engine
  `POST /api/users/me`), a device-authorization/token-grant mint flow for `orvex auth login`, and a
  health/doctor probe. The CLI redo should target these identity endpoints directly, not the engine.
  Note: `/v1/whoami` and device-auth exist server-side per the route inventory, but list confirms
  device-auth mint (FR-I20b) is still a later-wave/unticked item (ENG-2434) — verify current state
  before assuming it's live.
- **High-privilege ops require fresh, no-grace introspection** (FR-I3c) — any MCP/API verb that does
  mint/provision/deprovision/admin/cross-tenant actions must NOT rely on cached introspection.
- **Tenancy is polymorphic (D-S17)**: personal = user-keyed tenant (no Clerk org); Teams = org-tenant.
  MCP/API/CLI request routing, quota checks, and any "org" assumption in existing surface designs
  must handle the user-keyed case with `org_or_realm` empty/optional — do not assume every tenant has
  an org.
- **Cell-contract conformance (14 rules, `JGAUQRsw2g`)** is binding on every satellite including the
  AI surfaces: `CELL_ID` required in prod (fail-boot), distinct `CLUSTER_NAME`, both echoed on health
  endpoints, cell-guard/421 middleware on every route, `Idempotency-Key` on `/internal/*` +
  webhook forwards, `orvexcell` envelope stamping with fail-closed mismatch handling, intra-cell
  peer calls on cluster-local Service DNS (not public hosts) — this bears directly on how MCP/API
  reach identity and each other.
- **Contract-freeze discipline (MR-I2, ADR-0008 change-authority)**: identity's OpenAPI is a 10-op
  draft skeleton vs 47 real routes, with zero `fixtures/identity`. Any MCP/API/CLI redo that assumes
  a "pinned identity contract" is assuming something not yet true — the freeze (which routes, at what
  version) is contracts-repo work, not decided by this space. Do not treat "the tag exists" as "the
  surface is frozen."
- **Governance/ADR triggers**: any change to an auth flow (dual-IdP exchange, SCIM, token
  minting/scoping, tenant→cell registry) or any cross-service contract change in
  `orvex-studio-contracts` is a MANDATORY ADR trigger (SE-Arch). The AI-surfaces redo touching
  identity's contract surface must expect to author or block on ADRs, not silently reshape.
  ADR-0034 governs build-agent credential lanes (deny-by-default, scoped, short-TTL) — distinct from
  identity's own product token authority; don't conflate.
- **Observability**: OTel/Prometheus → LGTM consumed by orvex-studio-console (NOT Grafana directly);
  audit stream target is now the dedicated `orvex-studio-audit` WORM sink (ADR-0037) — any AI-surface
  audit design should target that sink, not invent its own.
- **Support-access grants (R24/R25)**: if the AI surfaces (console, MCP admin tooling) ever need
  "act on behalf of a user" capability, the pattern is already ruled: identity mints, scope fixed
  and non-widenable, never transitive, per-action liveness re-check, audited externally. Reuse this
  pattern rather than inventing a parallel one.
- **Anti-Sybil / quota enforcement (open, MR-I5)**: if MCP/API expose AI-action metering, the
  anchor for the 10-lifetime-AI-action trial is UNRULED (email-only vs email+phone) — do not assume
  a specific anchor when designing quota-check verbs; the mechanism (principal-scoped ledger) is
  buildable but the default is a PO call still pending.

## 4. Staleness flags

- **Two SE-Arch findings are self-flagged stale IN THE OTHER DIRECTION** (audit understates current
  maturity): F1 (dev ENGINE_URL clobber) — commits `e26fecd`/`bdb91ca` target it; the Build Prompt
  says "re-verify with `kubectl kustomize` before reporting it open," i.e. treat as likely fixed, not
  confirmed-fixed. F10 (config ignores CLERK_JWKS_URL) — confirmed STALE, `config.go` now reads both
  keys.
- **MR-I1 (Clerk deprovision no-op) is marked RESOLVED in the SDD via ADR-0036** (PO ruling
  2026-07-15): workflows owns full Clerk lifecycle; identity must land the real deprovision callee.
  This is a decision, not yet necessarily a shipped implementation — the SDD's Done-list boxes for
  the deprovision route/runbook/E2E are still unticked as of page-sync time (2026-07-15/16). Treat
  "decided" ≠ "built" — verify current deprovision-route state against live code before any AI-surface
  design assumes deprovision works end-to-end.
  - Note: given user-supplied context that R21/streaming and MCP-live-19-tools are dated 2026-07-16
    and this identity pack is dated 2026-07-15/16, MR-I1's resolution is the freshest data point in
    this space but likely still predates the very latest MCP/API cutover state — cross-check against
    mcp-research-corpus's findings for the current MCP/API surface, since those evolved independently
    and faster (per the "Amazing MCP delivered live" memory).
- **The PRD `cnhla0qRRF` is explicitly status=superseded** — do not cite it as the authoritative FR
  source without cross-checking the PRD-delta (`ntuw6s4E5P`) and SDD (`mZdESLTkvP`), which are the
  current reconciliation layer and take precedence per their own "live code wins" doctrine.
- **The Architecture page's 2-binary topology (`authd`/`lifecycled`) is confirmed stale against the
  repo**, which ships 4 real binaries (`server`, `deprovisioner`, `reconciler`, `sealtool`) — recorded
  as F8/open-decision, not yet reconciled into a re-ratified arch page as of last sync.
- **Contract-exists ≠ contract-frozen**: identity is present in every `orvex-studio-contracts` tag
  (v0.1.0–v0.1.3) but as a 10-op draft skeleton — "the contract exists" is technically true and
  actively misleading (MR-I2, unresolved as of sync). Any downstream claim that identity's API is
  "frozen" or "contracted" should be treated as false until MR-I2 resolves.
- **`POST /v1/registry/move` is a live, unauthenticated security gap (MR-I8)** on the global tenant→
  cell write path — unresolved as of sync; flag if any AI-surface design touches tenant-move.
  Also note: this global registry (A-CELL-REGISTRY) is the routing authority the wiki-api /v1
  cutover and MCP tooling ultimately depend on for cell resolution — its auth gap is upstream risk
  for the whole family, not identity-local.
- **Readiness (`/readyz`/`/livez`) still does not exist** as of the SDD/test-plan sync (2026-07-15) —
  ArgoCD/Healthy signals for identity should not be trusted as evidence of dependency health; this is
  consistent with the "Signals are not observation" memory and applies with equal force to any
  AI-surface health check that treats identity's Healthy status as sufficient.
- **Anti-Sybil spike (`CYHyoUd7J1`) remains an unratified DRAFT options doc** — its "flagship"
  recommendation (bind AI-trial to `verified_principal`) is a recommendation, not a locked decision;
  the anchor strength (email-only vs email+phone) is explicitly left to the PO (MR-I5, still open).
