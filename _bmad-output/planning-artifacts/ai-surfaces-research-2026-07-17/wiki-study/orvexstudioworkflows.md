# Wiki study — space `orvexstudioworkflows`

Source: local read-only mirror `/home/daniel/repos/orvex-studio/.cache/docs/orvexstudioworkflows/`, synced 2026-07-17. 9 pages, all read (0 skipped).

## 1. Per-page table

| slug | title | status | one-line substance |
| --- | --- | --- | --- |
| JiIyp0RLLJ | Architecture: orvex-studio-workflows | canonical | The domain-template architecture (ingest→dispatch→workflow→activity) for the family's single Temporal control plane; SE-Arch-tightened 2026-07-05 with cell posture, ID-only payloads, CE idempotency, and an honest NOT-YET-BUILT CI section; 6 open decisions incl. Clerk ownership. |
| 7LGGFR5tGE | Architecture Audit — SE-Arch review (2026-07-05) | canonical | Child adversarial review of JiIyp0RLLJ; verdict needs-tightening→fixed-in-draft on 11 findings (F-CI, F-CELL, F-IDP, F-RETRY, F-DEDUP, F-PAYLOAD, F-BROKER, F-HOST, F-SEAM, F-HTTPROUTE, F-SECRETS), with 2026-07-06 code-verified updates noting some are now actually built (CI baseline, CELL_ID/healthz, orvexcell stamping). |
| HdRj1oIXYJ | Contract Summary: orvex-studio-workflows | canonical (body says draft) | Enumerates every cross-boundary shape (HTTP surfaces incl. the /v1/workflows proxy, 5 clerk.* CE types, step-API callees, generated-client posture per ADR-0035); explicit honesty header that almost nothing is frozen in orvex-studio-contracts yet (0 tags). |
| DxXIJWyzWb | PRD-delta (reconciled): orvex-studio-workflows | canonical (body says draft) | Reconciles brief/map/draft-PRD/deployed-code; measured gap table shows retry-cap fix and deprovision-retarget only PARTIALLY landed despite draft PRD narrating them as done; states program baseline 1 PASS/5 FAIL/1 BLOCKED; MR-W-DEPROV RESOLVED by ADR-0036, MR-W-INGEST still OPEN. |
| 4IF3xjIdAs | PRD: orvex-studio-workflows | **superseded** | The original/base PRD: FR-W1–W18, NFR-W1–W8, OQ-W1–W10; defines the four-domain scope (tenant-lifecycle live, knowledge-rebuild/ai-tool-loop/org-conversion planned), D-WF-1 single-Temporal-home charter, polymorphic tenancy (D-S17), Free-entitlement provisioning (FR-W18). Superseded by the PRD-delta (DxXIJWyzWb) which layers reconciliation on top without renumbering. |
| D8DsxAX2JE | Per-Agent Build Prompt: orvex-studio-workflows | canonical (body says draft) | Elevates the already-filed 37-story Linear spine (ENG-2615..2650 + 2784) to the H1–H17 acceptance bar; P0 = retry-cap fix + rename migration; dispatch-blocked on contracts tag; lists the 12 ❌ anti-patterns assessed and SE-Arch lenses/ADR triggers. |
| T4WvwYI9GE | Service Done Definition (SDD): orvex-studio-workflows | canonical (body says draft) | Total eventual-scope Done definition; mechanical totality check over all 14 internal/ packages + 5 cmd/ binaries; full cell-lint (14 rules) status table; explicit "NOT Done until" list; fake-done gate (agent cannot self-advance). |
| ra8InY9IF1 | Test Plan: orvex-studio-workflows | canonical (body says draft) | CS §5 tier-by-tier test strategy with FIXED mock-boundary category per dependency (no store tier — correct, non-goal); lists what's already GREEN in CI vs RED-today assertions (the retry cap, dead deprovision route, wrong broker) that encode the honest gap. |
| G1SoUl6FDe | ZZ table round-trip test delete after | archived | Throwaway table-formatting test page; no substantive content; marked for deletion. |

## 2. Deeper summaries — load-bearing pages

### Architecture: orvex-studio-workflows (JiIyp0RLLJ) — canonical

- One Go module, one deploy pattern, N workflow domains; every domain = ingest (Knative Svc, webhook verify OR spine Trigger) → dispatch (Knative Svc, CE→deterministic workflow ID→`ExecuteWorkflow`) → workflow (deterministic Temporal code, shared cluster/per-app namespace/queue-per-domain) → activity (only IO, HTTP to idempotent satellite step-APIs). No KEDA, no per-org Temporal, no service database.
- A-W3 step-API contract: idempotent, bounded/chunked-by-cursor, complete-in-response (no callbacks), typed errors, no satellite-side orchestration, guarded internal routes, declared retry class (AUTHORITATIVE vs BEST-EFFORT).
- A-W4 retry classes: AUTHORITATIVE = unbounded (`MaximumAttempts:0`), 1s→1min×2.0 backoff, retries forever; BEST-EFFORT = 30s, 3 attempts. As-built 10-attempt cap on the live provision/deprovision legs is a defect, not a posture — it silently breaks the 720h purge on any outage >~5min.
- A-W9 "adding a domain" checklist: contracts → code → deploy → proof (replay test, dedup test, satellite conformance test). No new brokers/namespaces/in-satellite workers.
- A-W10: enqueue mechanism is CE-on-spine only — NO inbound start-workflow HTTP API; keeps workflows verifier-free; enqueue authz sits on the publishing satellite.
- Domain map: tenant-lifecycle (live), knowledge-rebuild (planned, first extension), personal→Teams org-conversion (planned), ai-tool-loop (planned, charter-level).
- §6 Cell posture: Temporal is a sanctioned global singleton (cell rule 14) — NOT per-cell, by design. Owed: CELL_ID/healthz echo, orvexcell CE-extension stamping, cell-routed activity targets via identity's tenant→cell registry (still an open decision as of this doc).
- §7 honesty section: at time of ratification the repo had **zero CI** — every "CI-checkable"/"merge-gate" claim was aspirational (later corrected per the audit's 2026-07-06 update — CI baseline now exists).
- §8 Open decisions (6): Clerk ownership (workflows vs identity — F-IDP), cell-routing model, spine catalog surface (which clerk.* → studio.* promote), rename migration timing, namespace/Temporal-namespace consolidation, org-conversion trigger source + ai enqueue payload shape.

### Architecture Audit — SE-Arch review (2026-07-05) (7LGGFR5tGE) — canonical

- Adversarial review of the arch page; verdict needs-tightening, now fixed-in-draft on most findings.
- Confirms real production code: clerk-lifecycle domain live (provision/deprovision-with-grace/hourly reconcile), observability real (OTLP→Tempo/Loki/Mimir).
- Findings table with severity: F-CI (high, no CI at all — later partially fixed 2026-07-06: baseline `.github/workflows/ci.yml` running go vet/build/test-race), F-CELL (high, zero cell-contract treatment — later partially fixed: CELL_ID/healthz/orvexcell now built), F-IDP (high, open-decision — direct Clerk Management API client conflicts with Principle 4 that only identity should talk to IdPs), F-RETRY/F-DEDUP/F-PAYLOAD/F-BROKER/F-HOST/F-SEAM (medium), F-HTTPROUTE/F-SECRETS/F-NACK (low).
- Cost lens: **pass** — NO-KEDA respected, no AI call-sites, entitlement values stay in billing.
- ADR triggers named: cell posture/routing, Clerk ownership, ID-only payload enforcement, studio-spine migration, unbounded-retry policy, rename workstream.

### Contract Summary: orvex-studio-workflows (HdRj1oIXYJ)

- Honesty header: almost nothing frozen in contracts yet (0 git tags in the contracts repo; brief says contracts repo "~90% unbuilt").
- HTTP surfaces: Svix webhook ingress (OBSERVED, live); the `/v1/workflows` proxy (5 verbs: list/get/signal/retry/cancel) wrapped by deny-by-default Gate — this is explicitly called "**the console seam**" and its charter is contested/un-chartered ("lives in another space" — MR-CONSOLE).
- 5 `clerk.*` CE types produced, matching FR-W1 exactly; NOT `studio.*` — promotion of any to family-consumable spine entries is an open decision (OQ-W3/MR-W-INGEST), blocked on who owns Clerk ingestion.
- Step-API callees: engine (provision retargeted correctly; deprovision STILL BROKEN, hits dead route), identity (501 stub today), billing (create-Free/revoke entitlement, PROPOSED), knowledge rebuild, ai (charter only), Clerk Mgmt API (true-external).
- cell rule 11: every internal/webhook call MUST carry `Idempotency-Key` — not yet verified as implemented (F-DEDUP/ENG-2633).
- ADR-0035 posture: workflows is a Go service, NOT one of the three TS satellites — no Go-stub deliverable; Go legs consume JSON Schema/OpenAPI directly; TS consumers (console) generate types off `openapi/workflows-proxy.yaml` (not yet authored) via openapi-typescript; CE types via json-schema-to-typescript + ajv at the trust boundary.
- 4 contract deliverables owed (all PROPOSED, dispatch-blocked until contracts repo cuts a tag): ENG-2621 (clerk.* CE catalog+fixtures), ENG-2622 (step-API OpenAPI+retry annotations), ENG-2623 (versioned append-only workflow types), FR-W16 (workflows-proxy.yaml).
- Must-resolve seams: MR-W-DEPROV, MR-W-INGEST, MR-CONSOLE (proxy is console's ruling, not workflows').

### PRD-delta (reconciled): orvex-studio-workflows (DxXIJWyzWb)

- Not a fresh PRD — reconciles brief + concept-map + draft PRD (4IF3xjIdAs) + deployed code (measured at ref `7cdfbee`).
- Verdict: base PRD "substantially correct and current" (already carries D-S17, D-S13, billing-SoR, NFR-W5 retry fix as decision). Delta adds: honest gap table, brief/map citations per FR, two seam contests promoted to blocking MR, and applies "ArgoCD-Healthy is not evidence" doctrine.
- §2 gap table (core of the doc) — draft PRD claims vs deployed reality:
  - NFR-W5 unbounded retry: DEFINED in retry.go and used by new domains, but the LIVE provision/deprovision legs still cap at 10 — **PARTIAL, active G2 loss window in production**.
  - FR-W2 provision retarget to identity: DONE.
  - FR-W3 deprovision hard-purge: **NOT DONE** — still posts to the dead engine route, explicitly scoped out of the fixing commit ("same bug, out of scope").
  - OQ-W3 broker move to studio-spine: NOT DONE (still namespace-local `default` broker).
  - OQ-W1 rename: NOT DONE (go.mod still `orvex-workflows`).
  - FR-W6 DLQ + already-started ACK: NOT DONE.
- Program acceptance baseline stated explicitly: **1 PASS / 5 FAIL / 1 BLOCKED** (defects ENG-2039..2054 filed and real) — deployment is Synced/Healthy but that is not credited as "works."
- §4 Must-resolve seams: **MR-W-DEPROV RESOLVED by ADR-0036** (RJkFGHoht4, PO ruling 2026-07-15) — workflows OWNS full Clerk/tenant lifecycle as sole orchestrator; identity keeps sole Clerk creds + tenant→cell registry, exposes real callees; workflows drives them via ADR-0034 scoped credential lanes (no shared static bearer). **MR-W-INGEST remains OPEN** — where Clerk webhook ingestion itself lives (identity vs workflows) is unresolved, still blocks FR-W17 design and the OQ-W3 spine-catalog promotion decision.

### PRD: orvex-studio-workflows (4IF3xjIdAs) — status: superseded

- The base/original PRD, now superseded by the PRD-delta layered on top (numbering NOT changed by the delta — this doc's FR/NFR/OQ numbers remain authoritative text).
- Charter: D-WF-1 — this is the family's **single Temporal control plane**; ALL durable/multi-step/retryable/timer-bearing work lives here; satellites run no worker, no saga, no cron.
- 5 goals: G1 one Temporal home, G2 lossless lifecycle (webhook→broker→Temporal chain, AUTHORITATIVE retries never exhaust), G3 deduplicated effects (deterministic workflow IDs), G4 cheap domain addition, G5 blast-radius isolation (task-queue+Deployment per domain).
- Explicit non-goals: NOT the event spine itself (one publisher/subscriber among many); NOT owning business state (no service DB — Temporal history + DLQ = the record); activities never do business logic, never reach a sibling's datastore, never compute entitlement VALUES (billing owns those).
- FR-W1..W18 define: the 5-type Clerk pipeline; Provision/Deprovision/Reconcile workflows; grace-cancel; DLQ hardening; studio-cutover to identity; IdP-agnostic (Keycloak) ingest via identity-emitted CEs; Free-entitlement provisioning/revocation on lifecycle transitions; the 3 new domains (knowledge-rebuild FR-W8-10, ai-tool-loop FR-W11 charter-level, org-conversion/personal→Teams-upgrade FR-W13); platform obligations (schedules, observability SLIs, contracts deliverables).
- NFR-W1..W8: determinism (workflow.GetVersion + WorkflowReplayer mandatory before any logic change, because 720h grace sleeps replay live histories on every deploy), idempotency/dedup, shared-Temporal-only topology (per-org claim disabled, must NOT be re-enabled), NO-KEDA, the 2-class retry taxonomy (AUTHORITATIVE unbounded / BEST-EFFORT 3-attempt), security (Svix mandatory, no other inbound HTTP surface except the future read-only console endpoint), availability/loss-boundedness, cost (scale-to-zero dispatcher, small fixed workers).
- Rollout order: (1) rename migration, (2) harden live domain, (3) knowledge rebuild domain, (4) identity alignment + org-conversion, (5) ai tool-loop. Kafka-first spine + engine outbox-relay are launch prerequisites, not deferred.
- OQ-W1..W10 open questions all owned by "Daniel."
- Locked platform decisions folded in 2026-07-05: D-S11 (Linear removed product-wide — no linear-resync domain anywhere), D-S13 (Kafka-first, outbox-direct, Redis→Kafka bridge retired), D-S17 (polymorphic user|org tenancy — REPLACES orgs-from-the-start; personal signups get a user-keyed tenant with NO Clerk org), D-S12 (Mongo struck from datastore doctrine).

### Per-Agent Build Prompt (D8DsxAX2JE)

- The 37-story `[workflows]` Linear spine (ENG-2615..2650 + ENG-2784) already exists — this doc elevates it to the H1–H17 acceptance bar, does not re-file.
- Dispatch gate: contract-authoring stories (2621/2622/2623) and everything downstream of an unfrozen seam are **dispatch-blocked until orvex-studio-contracts cuts a tag** (ADR-0035 §3 SEAMS rule).
- P0 priority: ENG-2625 (fix the live 10-attempt retry cap — active production G2 loss window) and ENG-2615 (rename migration, before any new domain deploys).
- BLOCKED stories named explicitly: ENG-2639 (deprovision purge) + ENG-2642 (cutover) on MR-W-DEPROV; ENG-2643 on MR-W-INGEST + identity FR-I15; 2638/2624 on the billing step-API.
- 12 ❌ anti-patterns assessed per-service (❌2 raw store-driver N/A — no datastore; ❌4 mocking-own-pkg flagged as a live risk in the M3 E2E test that needs migration to contracts golden fixtures; ❌10 raising-a-ratified-ceiling applies to entitlement caps — never a code fix).
- Next-free Studio ADR number stated as 0036 at authoring time (ADR-0033/34/35 canonical) — note this predates the PRD-delta's later ADR-0036 (MR-W-DEPROV resolution), i.e. that ADR number got used for exactly the seam this doc anticipated.

### Service Done Definition (SDD) (T4WvwYI9GE)

- Doctrine: "Done" = TOTAL eventual scope, not current wave. **ArgoCD-Healthy is explicitly NOT Done** (D-STG1) — gate-green/CI-green/Linear-Done/ArgoCD-Healthy are none of them observation.
- §0 mechanical totality check: every one of 14 internal/ packages and 5 cmd/ binaries must be mentioned in the SDD (grep-verified, self-run result 14/14 and 5/5 present).
- Per-package Done checklist (§1) covers events, dispatch, workflows (7 + billing family), activities, clients, clerk, proxy, authwiring, api, temporal, tenant, config, telemetry, workerutil, and all 5 cmd binaries — each ties to a specific FR/NFR and names current known defects inline (e.g. the 10-cap, the dead deprovision route).
- §3 Must-resolve: same MR-W-DEPROV (now RESOLVED by ADR-0036 per this page too), MR-W-INGEST (open), MR-CONSOLE (proxy charter is console's call).
- §5 Cell-lint 14-rule status table: several PARTIAL/PROPOSED (rules 1, 5, 6, 9, 10, 11), some N/A (no datastore → rules 7/8/12 N/A), rule 4 (CELL_ID/CLUSTER_NAME distinct, healthz echoes both) OBSERVED live, rule 13 (NO-KEDA) OBSERVED as posture. Rule 13's KEDA-coexistence with knowledge's own KEDA plan is flagged UNRESOLVED at the cell-contract level (not specific to this service).
- §9 Family-E2E Done-defining tests are explicitly BLOCKED on billing/identity/knowledge step-APIs and MR-W-DEPROV — none can pass yet.
- §10 "Explicitly NOT Done until" list: retry-cap fix, MR-W-DEPROV ruled + live callee, studio-spine migration, rename debt cleared, contract deliverables tagged.
- §11 Fake-done gate: implementing agent cannot self-advance to Done; requires adversarial CS+SE-Arch review PASS and orchestrator/human sign-off.

### Test Plan (ra8InY9IF1)

- No UI in this service — "looks good AND works" bar is explicitly N/A (stated, not skipped).
- §0 what's already green: go vet/build/test-race, workflow determinism denylist, M3 E2E (real dockerized Temporal), no-testsuite-import gate on e2e dir, replay-determinism tests — 25 test files total. Caveat: CI-green ≠ the lifecycle domain works end-to-end (M3 fakes wiki/billing with httptest, doesn't prove the real deprovision callee exists — it doesn't).
- §1 CS §5 mock-boundary table (FIXED, not negotiable): the 14 internal/ packages are Row 1 (in-process, NEVER mock); Postgres/store tier is Row 2 but genuinely EMPTY (no datastore, by design — a reviewer must not add a store tier "for completeness"); Temporal is Row 3 but special (testsuite allowed in unit tests only, banned in e2e — must use real dockerized Temporal there); Kafka/spine and sibling Studio services (engine/identity/billing/knowledge/ai) are Row 3, tested via golden fixtures from orvex-studio-contracts (not hand-rolled — this is an owed migration); Clerk is Row 4 true-external, tested via committed real-response replay.
- §3 RED-today assertions (the honest baseline): retry-cap-not-fixed, deprovision-posts-to-dead-route, broker-not-yet-studio-spine — all currently failing tests that encode the known gap, by design.

## 3. Bindings on the AI-surfaces redo (MCP / wiki-api / CLI)

These are commitments in orvexstudioworkflows that constrain how the AI-facing surfaces should be re-architected:

1. **No workflow logic in any of the three AI surfaces.** D-WF-1 is a hard platform charter: ALL durable/multi-step/retryable/timer-bearing orchestration lives in orvex-studio-workflows. If any MCP/API/CLI feature needs retries-with-state, sagas, or timers, that logic must be delegated to workflows via a step-API call and a spine CloudEvent — never implemented locally in wiki-api, MCP, or CLI. This directly bears on any "long-running MCP job" or "async ingest" design.
2. **No inbound start-workflow HTTP API anywhere — enqueue is CE-on-spine only** (A-W10). If the MCP/API redo wants to trigger a durable background job (e.g. bulk reindex, bulk export), the correct shape is: the calling surface publishes a CloudEvent on the spine (deny-by-default, admin-scoped on the publishing surface per lib FR-L5/L6), not a synchronous "start workflow" REST call into workflows.
3. **Step-API contract discipline (A-W3) applies to any step-API wiki-api/knowledge exposes to workflows**: idempotent (natural-key, not client nonces), bounded/cursor-chunked for long work, complete-in-the-response (no callbacks/polling), typed errors (5xx/timeout retryable, 4xx non-retryable), no satellite-side orchestration, guarded `/internal/v1/*` routes (NetworkPolicy-restricted, not public), and a declared retry class (AUTHORITATIVE/BEST-EFFORT) per step. Any new internal endpoint wiki-api adds for workflows to call (e.g. rebuild/reindex) must honor this shape.
4. **ID-only / no-PII payload rule (F-PAYLOAD, cell §4).** CloudEvents and Temporal payloads must carry references (tenant/org IDs), never business bytes or display names. Bears on any event schema the AI surfaces emit onto the spine.
5. **`Idempotency-Key` header is mandatory** on every `/internal/*` step-API call and webhook forward (cell rule 11). Any new internal contract between wiki-api/MCP-supporting services and workflows must implement this.
6. **Contracts-first freeze discipline (ADR-0008, ADR-0035).** Every cross-boundary shape (CE types, step-API OpenAPI) must be authored in orvex-studio-contracts and tagged before it's treated as frozen; nothing downstream may pin a draft artifact for a GA cutover. If the AI-surfaces PRD/architecture redo defines new CE types or step-APIs touching workflows, they go through the same contracts pipeline, not an ad hoc schema in the MCP/API repo.
7. **TS-consumer codegen posture (ADR-0035).** workflows itself never produces Go-stub deliverables for TS consumers; TS surfaces (console, and by extension any TS-based AI surface) generate types off authored OpenAPI/JSON-Schema via openapi-typescript / json-schema-to-typescript + ajv validation at the trust boundary — not hand-authored client types.
8. **Cell/tenancy discipline.** Any AI-surface component must resolve target-cell service origins via the identity tenant→cell registry rather than a single static URL env var once cell #2 exists (F-CELL lesson from this service's own unresolved gap) — worth flagging as a shared cross-service pattern, not unique to workflows.
9. **Observability/governance pattern to reuse**: per-domain SLIs (latency, failure rate ~0-with-alert, long-retry alert >15min, exhaustion count, DLQ depth) feeding LGTM via orvex-studio-console — not Grafana directly. The AI-surfaces redo's observability section should follow this same pattern/vocabulary rather than inventing its own.
10. **Governance pattern to reuse: the SDD mechanical-totality-check + fake-done gate + H1-H17 acceptance bar.** These wiki-native artifact types (SDD, Test Plan, Per-Agent Build Prompt, PRD-delta) and their "ArgoCD-Healthy is not Done" doctrine (D-STG1) are the house style this program uses; the AI-surfaces redo's own documentation set should likely mirror this artifact shape for consistency.
11. **Entitlement/quota ownership boundary**: billing owns entitlement VALUES exclusively; any surface (including AI surfaces) must never compute or store entitlement values locally — only call billing's step-API or read via the SoR. Bears on any quota-checking logic the AI surfaces might otherwise be tempted to inline.
12. **Linear is removed product-wide (D-S11).** No AI-surface design should reintroduce a Linear-resync domain or dependency.

## 4. Staleness flags

Claims in this space that are contradicted by newer pages, or by the known 2026-07-16/17 live state (MCP live-green 19 tools on dev; wiki-api /v1 cutover done; streaming folded into existing tools per R21; audit-service PRD canonical):

- **MR-W-DEPROV resolution is internally inconsistent across pages at different freshness.** The base PRD (4IF3xjIdAs, superseded) and the arch/audit pages (JiIyp0RLLJ, 7LGGFR5tGE) present the deprovision-owner question as fully open. The PRD-delta (DxXIJWyzWb) and the SDD (T4WvwYI9GE) — both later — correctly show it **RESOLVED by ADR-0036** (2026-07-15 PO ruling): workflows owns the full Clerk/tenant lifecycle. Anything drafted from the base PRD or arch page alone would misstate this as still contested. Use the PRD-delta/SDD framing as current.
- **The base PRD (4IF3xjIdAs) is formally `status: superseded`** — it should not be cited as authoritative on its own; the PRD-delta layers on top of it (numbering intact) and is the current reconciled reading. Several other pages in this space (Contract Summary, Build Prompt, SDD, Test Plan) show `status: canonical` in frontmatter but their own body text says `status: draft` — a metadata/body mismatch across the whole Wave-3 pack; treat the body's self-declared status (draft, ENG-2107, ADR-0008 change-authority) as more authoritative than the frontmatter for these.
- **CI claims are stale/superseded within this space itself.** The architecture page (§7, ratified 2026-07-06) and the original audit findings (F-CI) state "no CI of any kind exists." The audit page's own 2026-07-06 update-note and the later Test Plan / Build Prompt pages (measured at ref `7cdfbee`) show a baseline CI (`ci.yml`) now exists and is green (go vet/build/test-race, determinism denylist, M3 E2E, replay tests). A reader relying only on the architecture page's §7 prose (not its audit-page footnote) would wrongly conclude zero CI exists today.
- **KEDA references are known-stale in sibling docs** (explicitly flagged inside this space): knowledge's arch A8, knowledge PRD FR-K24, knowledge PRD deps row, and "the split page" all still say Temporal workers are KEDA-scaled — this space's own architecture/PRD pages repeatedly flag these as needing correction to NO-KEDA (platform decision). Not fixed within this space's remit; flagged here as a cross-space staleness item worth checking when reading knowledge-space docs.
- **Program acceptance baseline (1 PASS/5 FAIL/1 BLOCKED, defects ENG-2039..2054) is stated as of the PRD-delta's writing** — no page in this space claims it has since improved; given the memory context's "certified ≠ current" lesson and the fact this space was last synced 2026-07-17 with no visible post-delta update, this baseline should be treated as possibly stale itself and re-verified against live Linear/deployed state before being cited in the AI-surfaces redo, rather than assumed still accurate.
- **No page in this space mentions the MCP/wiki-api/CLI re-baseline directly, nor R21 streaming-folded-into-19-tools, nor an audit-compliance-service PRD.** This space is infrastructure-only (Temporal orchestration) and does not itself claim anything about MCP tool counts, wiki-api /v1 status, or the audit service — those are out of scope here and must be corroborated from their own spaces, not inferred from workflows pages. Worth noting explicitly since the study brief's known-live-state context (MCP 19/19, wiki-api /v1 done, audit-service PRD canonical) has zero overlap/contradiction surface in this space — it neither confirms nor stales any of it.
- **The Per-Agent Build Prompt's "next-free Studio ADR = 0036" note (authored earlier in Wave 3) is now literally consumed** — the PRD-delta/SDD show ADR-0036 was in fact used for the MR-W-DEPROV ruling. Not a contradiction, but a reader should not assume "0036" is still free when planning new ADRs referenced from an AI-surfaces redo; the next-free number must be re-checked live.
- **The engine's transactional-outbox-relay-to-Kafka and the studio-spine broker migration are repeatedly stated as "launch prerequisites, not deferred" (D-S13) across the base PRD, architecture, and PRD-delta** — yet the PRD-delta's measured gap table shows the broker migration (OQ-W3) as **NOT DONE** (still namespace-local `default` Broker) as of ref `7cdfbee`. If the AI-surfaces redo assumes a live Kafka-backed studio-spine to consume from, that assumption should be verified against current deployed state, not taken as given from the "prerequisite" framing alone.
