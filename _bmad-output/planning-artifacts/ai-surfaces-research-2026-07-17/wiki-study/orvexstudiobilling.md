# Space study: orvexstudiobilling

Source: `/home/daniel/repos/orvex-studio/.cache/docs/orvexstudiobilling/` (local read-only mirror, synced 2026-07-17). 8 pages, all read.

## 1. Per-page table

| slug | title | status | one-line substance |
|---|---|---|---|
| `o2ZqSrZjE6` | Architecture: orvex-studio-billing | canonical | Three-binary Go service (api/webhook/metering) over Postgres+Redis; append-only entitlements, polymorphic user-OR-org tenant, per-cell + one global Stripe with a thin global forwarder + home-cell sole verifier, cap push to ai + wiki quota values pulled by the engine; SE-Arch-tightened 2026-07-05. |
| `ukKiIMWYRg` | Architecture Audit — SE-Arch review (2026-07-05) | canonical | Evidence record for the tightening: verdict "needs-tightening" (design sound, drift downstream in code/deploy/README/decision-log); 12 findings, all fixed-in-draft or open-decision, none wont-fix. |
| `LLjofewAZs` | Build prompt — billing | canonical (draft-metadata, never agent-ratified) | Per-agent build prompt (2026-07-15): billing is MATURE-DEPLOYED (16 real packages, 14 real handlers, 4 Healthy ArgoCD apps, ~8,374 test LOC) despite README/PRD saying "scaffold"; census of 36 `[billing]` stories ENG-2371–2406; names 6 must-resolves (MR-BD-1..6) no build agent may decide. |
| `4zOSYmRSLX` | Contract Summary — orvex-studio-billing | canonical (draft-metadata) | Observed-vs-proposed contract surface at orvex-studio-contracts v0.1.3: only `getEntitlement` is frozen (x-status:active); 6 other ops draft; 14 served paths uncontracted; 1 event schema (`billing.entitlement.changed`, draft); field-name drift `plan` vs `planId` between two schemas. |
| `LnLqFdVJgT` | PRD-delta — orvex-studio-billing (Wave 3) | canonical (draft-metadata) | Reconciles the 2026-07-13 product-brief supersessions (free-tier cost doctrine, no-card trial) against canonical PRD/arch + the deployed artifact; names 6 must-resolves; artifact findings show service is mature (14/20 real handlers) but contract-vs-server drift is large. |
| `Blcvui4UIn` | PRD: orvex-studio-billing | canonical | The full functional PRD (FR-B1–B28, NFR-B1–B8): plan catalog, entitlement record + one check primitive, Stripe lifecycle, trial state machine, cap-policy registry incl. wiki quotas, metering, GDPR, auth/admin/workflow seams, persistence, rollout, decisions D-B1–D-B13. |
| `D2U0IUQ6p0` | Service Done Definition — billing | canonical (draft-metadata) | Full service-level Done checklist (not a wave slice): API surface, events, entitlement/quota, 14 cell-lint rules, observability/SLOs, degradation posture, test tiers, runbook, family-E2E — almost entirely unticked; mechanical totality check for omission-proofing. |
| `GgOHp6sd0x` | Test plan — billing | canonical (draft-metadata) | CS §5 dependency-category assignments (Postgres=Row2, Redis/Kafka/ai/identity/workflows=Row3, **Stripe=Row4 true-external**, replay-only); 5 test tiers; discloses one known-red cross-repo test (`TestContractPlanEnum_LiveSchemaRead`, harness bug not drift). |

All 8 pages covered — no page skipped.

## 2. Deeper summaries — load-bearing pages

### Architecture (`o2ZqSrZjE6`) — canonical, SE-Arch-tightened

- Three binaries: `cmd/api` (always-warm, plan/checkout/entitlement/admin/step surfaces), `cmd/webhook` (public, plain always-on Deployment — never Knative — sole Stripe verifier per cell), `cmd/metering` (Knative scale-to-zero, Trigger-fed usage journaling).
- A-ENT: append-only `entitlement_versions` + `current_entitlements` projection; polymorphic `principal_type` (user|org) is load-bearing from t0 — free = Clerk personal account (NO org), Teams = Clerk org; personal→Teams upgrade is a named identity+billing joint workstream.
- A-HOOK: webhook pipeline is verify-signature → journal raw (Postgres JSONB, **no Mongo**, D-S12) → idempotency ledger → re-fetch authoritative object from Stripe → one-txn state-machine apply → propagate. Out-of-order-proof by design.
- A-CELL-ROUTING: one global Stripe account, per-cell billing; a **global-tier thin stateless forwarder** at the single public URL `billing.orvex.ai` holds no webhook secret and does no verification — forwards raw body + `Stripe-Signature` header untouched to the tenant's home cell, whose `webhook` binary is the sole verifier.
- A-PRICE: Prices referenced only by versioned `lookup_key`s (never raw `price_...` ids); tax-inclusive, GBP-only at launch.
- A-CHECK: the entitlement-check primitive `GET /v1/entitlements/{principal_type}/{principal_id}` — Postgres→Redis (event-evicted)→`orvex-studio-lib/entitlements` client for Go satellites / a contracts-conforming TS client for the AGPL wiki engine (license boundary cuts both ways — engine cannot import the closed Go lib). Fail-consistent: last-known-good bounded, **never-seen principal ⇒ Free** (fail-closed for paid features).
- A-CAP: cap_policies ride plan-versions — `ai_monthly_budget`, a **separate sibling** `embedding_monthly_budget` (never nested), plus the **wiki quota siblings** (`wiki_max_pages`, `wiki_storage_bytes_aggregate`, `wiki_max_file_bytes`, `wiki_max_files`, `wiki_max_members`, `wiki_history_retention`). Billing is **pull-only** for wiki quotas: the orvex-wiki **engine** reads them via the check primitive and enforces as its own F-QUOTA (FR-W10–W15) at its own write chokepoints — no push analogous to ai's cap endpoint. `billing.entitlement.changed` evicts caches on both products, dissolving the paywall <60s (wiki: engine cache-evict → Socket.IO invalidate; Studio: BFF SSE).
- A-TRIAL / A-METER / A-AUTH / A-GDPR sections define the trial saga (owned centrally in orvex-studio-workflows/Temporal, billing exposes idempotent step APIs only), metering-is-finance-never-enforcement, three auth route classes (bearer / WorkloadIdentityOnly-step / signature-verified-webhook), and GDPR purge with a finance pseudonymization carve-out.
- §3 API surface is contracts-owned; the two-segment polymorphic entitlement/billing-state/usage route shape is the corrected canonical shape (single-segment was scaffold drift).
- Explicitly calls out (§5 risks) that upstream Docmost/AGPL engine still carries real Stripe billing logic (`STRIPE_SEATS_SYNC` → `BILLING_QUEUE`) that MUST be severed — the engine enforces entitlements but never calls Stripe; billing is the only Stripe-touching service.
- §6 cell-contract compliance: rule #4 (`/healthz` echoes CELL_ID+CLUSTER_NAME), #3 (421 cell-guard), #6 (`orvexcell` fail-closed), #10 (tenant-move typed step class + `TENANT_MOVE.md` store inventory, non-retrofittable), #11 (Idempotency-Key), #13 (opaque CellID).
- §9 open decisions: family-wide Mongo canon conflict (CS text still names Mongo vs Principle 5/D-S12 Postgres-only — billing follows D-S12 pending reconcile); £7 Personal wiki quota values pending canon freeze at write time (later closed by D-S7, confirmed in the PRD).

### Architecture Audit — SE-Arch review 2026-07-05 (`ukKiIMWYRg`)

- Verdict: **needs-tightening**, not contradicts-canon, not sound. Design keystones already canon-aligned; drift was entirely downstream (scaffold code, deploy manifests, README, both local planning docs, repo decision-log).
- 12 findings table, severities high(2)/medium(6)/low(4), all `fixed-in-draft` (some also `open-decision`), zero `wont-fix`.
- Explicitly flags the repo's own `.decision-log.md` as **stale and dangerous**: it told agents to "re-publish wiki from these local files," which would regress canon-aligned wiki content back to Mongo/personal-org/bridge design — a direct instance of the "certified ≠ current" trap, but pointing the other way (local files stale vs wiki current).

### Build prompt — billing (`LLjofewAZs`, 2026-07-15)

- Establishes: billing is **MATURE-DEPLOYED** (16/16 packages real code, 14 real handlers, 4 Healthy ArgoCD apps, ~8,374 test LOC) — the README ("scaffold") and PRD front-matter (`status: draft`) are stale; **live code wins**.
- The one real gap agents will miss: `internal/cache` is a scaffold (Get always misses, Set/Evict unimplemented) — the FR-B5 p95≤50ms SLO is UNMET even though the check *primitive* itself is real+tested.
- `gen/*.go` (catalog, spendcap_contract) are HAND-AUTHORED mirrors of contracts shapes not yet pinned upstream — not codegen. The ENG-2036 Free-tier-shape residual lives here; **owned by the Wave-1 CONTRACTS pack**, not by billing's build agents.
- Names 6 must-resolves (MR-BD-1..6, see Bindings section below) that block correct build of several epics; explicitly forbids "reasonably assuming" and picking the obvious option.
- Full CS-§4 (12 ❌ anti-patterns) walkthrough tuned to this repo; seam map (in-process / local-substitutable / network-seam / Row-4-external / deep-module); tier placement; pinned versions (Go 1.26, pgx/v5, shopspring/decimal, testcontainers).
- Temporal disambiguation: `internal/workflow` is IN-PROCESS request-scoped sequencing, NOT a Temporal worker — durable sagas live in orvex-studio-workflows (ENG-1585, already Done there).
- Deterministic Done gate + H1–H17 self-audit; explicitly refuses to mark H4 ("zero architecture decisions left") or H7 ("versions pinned") as clean YES, because MR-BD-1/2/3 remain genuinely unruled.

### Contract Summary (`4zOSYmRSLX`, 2026-07-15)

- orvex-studio-contracts v0.1.3: billing IS present at a tag (4 files: openapi/billing.yaml, entitlements.schema.json, plan.schema.json, billing.entitlement.changed.json). HEAD adds 3 more (checkout/portal/session request schemas) unreleased.
- Of 7 OpenAPI ops, only `GET /v1/entitlements/{principal_type}/{principal_id}` (`getEntitlement`) is `x-status:active`/frozen — the one op **the whole family reads**. The other 6 (listPlans, postCheckout, postPortal, putEntitlement, provisionEntitlement, deprovisionEntitlement) are draft.
- Deployed service serves 18 distinct paths; only 4 match the contract, 3 contract ops are unserved, **14 served real/load-bearing paths are uncontracted** (subscribe, spend-caps get/set, both Stripe webhooks, metering sink) — this is billing's MR-BD-3.
- One event schema (`billing.entitlement.changed`, draft) — carries `tenantId` (the ONE frozen polymorphic user|org key across billing's whole surface, D-S17), `planId`, `planVersion`, `previousPlanId`, `changedAt`.
- Field-name drift: `entitlements.schema.json` exposes the plan enum at `properties.plan.enum`; `plan.schema.json` at `properties.planId.enum` — same 4 values, different key, breaks a cross-repo test.
- Zero billing fixtures exist in contracts today (`fixtures/` — Stripe Row-4 replay fixtures live only in the billing repo, `internal/stripe/testdata/*.json`); promotion into contracts is proposed (AC6), not done.
- ADR-0035 generated-client fan-out: TS clients for wiki engine / studio-api BFF / console; Go for ai / workflows / cli. The Go side is real today (`orvex-studio-lib` `billingclient`, v0.3.1). The TS side is the ADR-0035 generation target, not yet built per this pack.
- PROPOSED cross-service delta: billing owes `ai` a workload-identity `PUT` cap endpoint — a new seam requiring an ai-contract change + an ADR (ADR-0008 change-authority) BEFORE build.

### PRD-delta — Wave 3 (`LnLqFdVJgT`, 2026-07-15)

- Reconciles the 2026-07-13 product-brief RULED supersessions against canon + deployed code:
  - **FR-BD-D1**: the Free 10-lifetime-action AI trial is OVERRULED by the free-tier cost doctrine — Free AI is now ~zero-cost-forever (cheap models + free/near-free embeddings), NO frontier models, NOT a numeric counter. `gen/catalog.go` still encodes the superseded shape (10-lifetime-action, `DemoAIActions: 20`, `AIMonthlyBudgetGBP: 0`) — the CODE has not caught up to the RULED doctrine. The correct shape (model-class allowlist gate) is owned by the CONTRACTS pack, not authored here (MR-BD-1).
  - **FR-BD-D2**: card-required 7-day trial (old D-S23) is OVERRULED by a no-card standard free month that downgrades to Free at month-end (RULED 2026-07-13). Card-vs-no-card is decided; the residual application in code + two open sub-questions (frontier-taster redesign, which capabilities clear the zero-cost bar) remain open (MR-BD-2).
  - FR-BD-D3/D4/D5: locked GBP pricing, billing as SoR for wiki quotas too (engine-enforced), zero-cost-is-free pricing principle — no deltas to the model, just provenance/binding notes.
- Artifact findings: service is MATURE-DEPLOYED (measured, not asserted — refs pinned, byte-identical main/dev on code); 14/20 served paths real, 6 honest 501 stubs (never fake 200s); contract-vs-server drift is large (§3 Finding 3, feeding MR-BD-3); one RED cross-repo test is a harness bug not drift (§3 Finding 4).
- Six must-resolves (MR-BD-1..6) explicitly named as **not decided by this pack** — echoed in the SDD and build prompt.

### PRD: orvex-studio-billing (`Blcvui4UIn`, canonical, last updated 2026-07-13)

- Charter: the **plan→entitlement→cap system-of-record for the whole platform**, serving Studio AND orvex-wiki as peer tenants from day one. Executes a pre-authorized handoff clause from the ai and control PRDs (closes their OQ-AI8/OQ-CT8).
- G1 (one entitlement truth), G2 (money path proven via test-clock CI, red-blocking), G3 (**never on the hot path** — the binding constraint for everything downstream), G4 (grandfatherable from t0), G5 (lapse never deletes).
- Non-goals: enforcement on any hot path (stays with ai/engine), custom billing UI, auth authority, Teams/Enterprise purchase path this phase, usage-based pricing, running Temporal workers, non-Stripe payment rails.
- FR-B4/B5/B6: polymorphic entitlement record + the ONE check primitive (`GET /v1/entitlements/{principal_type}/{principal_id}`) with delegation rule (act-as-user resolves the acted-for principal's tenant, never the caller's own identity) — directly relevant to MCP/agentic act-as-user design.
- FR-B7: three-way propagation (canonical event + sync cap push to ai + Temporal reconcile); two separate AI cap lines (user-action vs embedding, D-S15); UI push dissolves paywall <60s on both products.
- FR-B10: concrete Stripe webhook event list, out-of-order-tolerant via authoritative re-fetch.
- FR-B13–B16: no-card standard free month trial (2026-07-13 PO ruling, supersedes card-required D-S23), retroactive backfill for pre-paywall accounts.
- FR-B17/B17a: cap-policy registry incl. **wiki quotas as versioned entitlements**, Free values LOCKED (canon `H5NzkdsOzK`: 200 pages/1 GiB/10 MB-file/2000 files/25 members/min(10,180d)); £7 Personal LOCKED (D-S7: 20,000 pages/50 GiB/50 MB-file/20,000 files/25 members/min(100,730d)). Enforcement is the **engine's** (write chokepoints incl. collab/Yjs path — the only leak-proof spot, wiki-api cannot enforce because content is creatable without it). Frozen 402 `QUOTA_EXCEEDED` contract, authored once in orvex-studio-contracts, propagated verbatim by wiki-api and CLI.
- FR-B26–B28: Postgres-only persistence (Mongo struck, D-S12), CloudEvents published/consumed list, SLIs.
- Rollout order: spine prerequisite (engine outbox relay) → contracts first → catalog/entitlement schema → check primitive + lib client (gates land BEFORE money moves) → money path → trial → cap handoff → console/hardening.
- Extensive decisions log D-B1–D-B13, with explicit REVERSED/SUPERSEDED markers tracking the polymorphic-tenancy reversal (D-B2/D-S17), the trial card-required→card-free flip-flop (D-B7, superseded twice), and the free-tier AI cost doctrine (D-B13, 2026-07-13, supersedes the lifetime-action trial).
- §6 dependency table names the exact cross-service seams billing needs from ai, identity, workflows, control, lib, contracts, Studio product, MCP, the wiki engine, and the global control-plane registry — a near-complete map of who consumes the entitlement primitive.

### Service Done Definition (`D2U0IUQ6p0`, 2026-07-15)

- The FULL eventual Done list (not a wave slice), almost entirely unticked. Mechanical totality check (walks `internal/`, `cmd/`, `gen/` on disk) to prevent H1–H17 self-audits from missing omissions.
- Census: 16 internal packages, 5 cmd binaries, all REAL code (contrast a sibling service, workgraph, which was 11/16 doc.go-only) — the ONE thin package is `internal/cache` (64 LOC, Get always misses, Set/Evict `ErrNotImplemented`) — this directly blocks the FR-B5 p95≤50ms warm-cache SLO despite the check primitive itself being real.
- 20 route registrations / 18 distinct paths: 14 real, 6 honest 501 stubs (never fake 200s, proven by `TestContractTrace`).
- Cell-lint 14-rule scorecard: only rule 4 evidenced; 9 not-yet; 4 N/A. Rule 10 (tenant-move typed contract + `TENANT_MOVE.md`) explicitly "NOT DEFERRABLE."
- Anti-fake-done clause explicitly rejects CI-green, ArgoCD-Healthy, and "stories closed" as evidence of Done — directly reinforces the family-wide "signals are not observation" lesson.

### Test plan — billing (`GgOHp6sd0x`, 2026-07-15)

- CS §5 category table is FIXED, not a build-agent choice: Postgres=Row2 (testcontainers), Redis/Kafka/ai/identity/workflows=Row3 (port + real-or-fixture-faked), **Stripe=Row4 true-external** (replay committed real payloads only — hand-authored is a defect). Billing's only Row-4 dependency is Stripe.
- 5 test tiers: unit → store (testcontainers Postgres, RLS fail-closed proven through a real non-superuser role) → contract (golden round-trip + Stripe fixture replay) → crew-slot (real money loop through a deployed pod, ignore ArgoCD Healthy as signal) → family-E2E (the M4 billing-SoR gate + test-clock money-path CI gate, red-blocking).
- Discloses one known RED cross-repo test on dual-checkout boxes (`TestContractPlanEnum_LiveSchemaRead`) as a harness field-name bug, not contract drift — an example of "state the caveat, don't hide the red."

## 3. Bindings on the AI-surfaces redo (MCP / wiki-api / CLI)

**Contracts / verbs**
- The ONE frozen contract op across the whole family is `GET /v1/entitlements/{principal_type}/{principal_id}` (getEntitlement, x-status:active). Any AI-surface design that reads entitlements/quotas/plan state MUST consume this exact shape via a generated client (ADR-0035: TS client for wiki-api/engine, Go for CLI-adjacent services) — never re-derive or hand-roll the response.
- The 402 `QUOTA_EXCEEDED` error frame is authored ONCE in orvex-studio-contracts and propagated **verbatim** by wiki-api and the CLI — the MCP/API/CLI redo must reuse this exact frame for any quota/entitlement-denial surface, not invent its own error shape.
- Only 1 of 7 billing OpenAPI ops is frozen; 6 are draft and 14 real served paths (subscribe, spend-caps, both Stripe webhooks, metering) are UNCONTRACTED (MR-BD-3). AI-surface work that needs billing data beyond `getEntitlement` is building against draft/uncontracted shapes — treat as unstable, do not assume frozen.

**Layering / enforcement locus (directly binds engine + wiki-api + MCP design)**
- Billing is **never on any hot path** — it DECIDES and SERVES/PUSHES values; it never enforces. Enforcement for AI spend is ai's LiteLLM `max_budget`; enforcement for wiki quotas is the **orvex-wiki engine's own write chokepoints** (page create, attachment upload, collab/Yjs persistence) via Redis fast counters — NOT wiki-api. This is a hard layering constraint: **wiki-api cannot be the wiki-quota enforcement point** because content is creatable without going through wiki-api (collab/Yjs path bypasses it). Any redo that tries to centralize quota enforcement in wiki-api or MCP contradicts this canon.
- MCP is explicitly named as a server-side gate consumer: "a Free token cannot invoke `submit_to_curator`" (FR-65/MR-3/4) — MCP tool tiering must resolve entitlements via the same check primitive, at the tool boundary, same semantics as BFF/ai/engine.
- Delegation/act-as-user rule (FR-B6): every entitlement check keys on the **acting delegated principal's tenant** — an MCP act-as-user call or an ai agentic hop resolves entitlements for the tenant of the user being acted for, **never the service's own identity or the token minter**. This is a direct, binding design constraint for any MCP act-as-user verb.

**Tenancy**
- `tenantId` (polymorphic user|org, D-S17) is the ONE frozen key across billing's OpenAPI + schemas + the changed-event. Any AI-surface resource addressing by tenant/principal must use this exact two-segment `{principal_type}/{principal_id}` shape, not a single-segment literal (the single-segment scaffold literal was explicitly flagged as drift to correct).

**Events / cache invalidation**
- `billing.entitlement.changed` (draft schema) is the canonical invalidation signal; consumers (engine, wiki-api, presumably MCP/API caches) must evict on receipt to hit the <60s paywall-dissolve SLO. Any AI-surface redo that caches entitlement/quota state needs an eviction listener on this event, event-driven not TTL-guessed.
- Fail-consistent semantics are **normative in orvex-studio-contracts** with conformance fixtures — any new consumer (CLI, MCP) implementing its own entitlement cache must conform to these fixtures: last-known-good bounded staleness, never-seen principal ⇒ Free (fail-closed for paid features, never fail-open).

**Quotas / caps relevant to wiki-api and MCP**
- Free wiki quotas (locked, canon `H5NzkdsOzK`): 200 pages / 1 GiB aggregate / 10 MB per file / 2,000 files / 25 members / history min(10,180d).
- £7 Personal wiki quotas (locked, D-S7): 20,000 pages / 50 GiB aggregate / 50 MB per file / 20,000 files / 25 members / history min(100,730d).
- Every cap value is human-ratified (CS ❌#10) — the AI-surface redo must never hardcode/raise a cap value; it consumes billing's served values only.

**Observability / governance**
- SLIs relevant if the AI surfaces sit downstream: flip-lag <60s, check-latency p95≤50ms service-side / ≤5ms satellite cache-hit, cache-hit ratio.
- Cell-contract rules bind any per-cell deployment of API/MCP satellites too: `/healthz` echoes CELL_ID+CLUSTER_NAME; 421 on cell-guard mismatch; `orvexcell` CloudEvent extension fail-closed; tenant-move typed step-API + store-inventory obligation (non-deferrable) if any AI-surface service holds cell-local tenant state.
- ADR-0008 is billing's cited change-authority for contract changes; ADR-0003 is the frozen 402 envelope authority — the AI-surfaces redo's own contract changes should follow the same ADR-trigger discipline (CS §9) rather than silently reshaping a frozen op.

## 4. Staleness flags

- **README / PRD-metadata self-report is stale within this space itself.** `orvex-studio-billing`'s own README says "Status: scaffold — PRD/architecture in progress" and even the canonical PRD's front-matter literal reads `status: draft` — both directly contradicted by the 2026-07-15 build prompt / PRD-delta / SDD / test-plan / contract-summary pages, which measure the service as MATURE-DEPLOYED (16/16 real packages, 14/20 real handlers, 4 Healthy ArgoCD apps). This is the space's own internal instance of "certified/self-report ≠ current" — trust the measured artifact pages over the README or metadata status field.
- **`gen/catalog.go` (code) still encodes a SUPERSEDED Free-tier AI shape** (10-lifetime-action trial, `DemoAIActions: 20`, `AIMonthlyBudgetGBP: 0`) that was explicitly RULED OUT by the 2026-07-13 product brief (free-tier cost doctrine: ~zero-cost-AI-forever, model-class allowlist gate, no frontier). The canonical PRD (`Blcvui4UIn`) DOES carry the corrected doctrine (D-B13, FR-BD/D-B7 amendments) but the deployed code has not caught up — MR-BD-1, explicitly unresolved as of 2026-07-15 (latest page in this space).
- **The old card-required 7-day trial (D-S23) is superseded twice over** — first the arch/PRD pages (2026-07-05) recorded D-S23 as reversing an earlier no-card position, then the 2026-07-13 PO ruling reversed it AGAIN back to a no-card standard free month. Any reasoning based on "card-required trial" from the 2026-07-05-dated architecture page body is stale; the PRD's D-B7 and change-log correctly show the final no-card state, but the arch page's own body text (o2ZqSrZjE6 §A-TRIAL) was written before the 2026-07-13 reversal and still describes the card-required version as current mechanism — read it as superseded by the PRD's later-dated ruling.
- **Repo's own `_bmad-output/.decision-log.md` is flagged CANON-INCORRECT** (per the SE-Arch audit, `ukKiIMWYRg` finding #6): it tells agents the wiki drafts "predate this pass and need re-publish from these files," which is false and would regress the wiki back to a Mongo/personal-org/webhook-bridge design already superseded in the wiki. Do not trust that local file if referenced elsewhere in the repo mirror.
- **Contract freeze is much narrower than "billing has a v0.1.3 tag" implies.** Only `getEntitlement` is frozen; 6 of 7 OpenAPI ops are draft, and the majority of billing's real deployed/load-bearing surface (subscribe, spend-caps, both webhooks, metering sink — 14 paths) is entirely uncontracted. Any downstream document (including AI-surface PRDs) that cites "billing's contract" as settled should be checked against this narrow-freeze reality, not assumed comprehensive.
- **No contradiction found with the task's stated 2026-07-16/17 live-state claims** (MCP live-green 19 tools, wiki-api /v1 cutover done, streaming folded into existing tools per R21, audit-service PRD canonical) — this space predates and does not reference those specifically; nothing here contradicts them. The one relevant adjacency: FR-B17a's frozen 402 `QUOTA_EXCEEDED` contract and the entitlement-check primitive are exactly the kind of contract the wiki-api /v1 cutover and any MCP quota-gated tools should already be consuming — worth cross-checking that the now-live wiki-api /v1 and MCP 19-tool surface actually call `GET /v1/entitlements/{principal_type}/{principal_id}` and propagate the frozen 402 frame verbatim, per this space's binding requirement, rather than a locally-reinvented equivalent.
- **£7 Personal wiki quota values**: this space's PRD marks them RESOLVED/LOCKED via D-S7 (20,000 pages/50 GiB/50 MB-file/20,000 files/25 members/min(100,730d)), but the underlying architecture page (o2ZqSrZjE6, written earlier in the same day 2026-07-05) still describes them as "PENDING CANON FREEZE" in its §2/§9 body text — the PRD (later revision) is authoritative; the arch page's open-decision language on this point is stale relative to the PRD's own change log.

