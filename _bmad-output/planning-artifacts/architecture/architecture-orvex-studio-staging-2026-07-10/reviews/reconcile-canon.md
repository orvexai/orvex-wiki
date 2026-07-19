# Canon ↔ spine reconciliation — orvex-studio-staging + orvex-studio-workgraph

**Date:** 2026-07-10 · **Reviewer scope:** conformance of the two new Go-satellite architecture spines
to the family canon (distilled ADRs + principles) and the carried Coding Standards.

**Inputs**
- Canon (authoritative): `scratchpad/canon-distilled.md` (distilled ADRs + principles, exact quotes) + `project-context.md` (carried CS).
- Spines under review:
  - staging: `architecture-orvex-studio-staging-2026-07-10/ARCHITECTURE-SPINE.md`
  - workgraph: `architecture-orvex-studio-workgraph-2026-07-10/ARCHITECTURE-SPINE.md`

**Rules checked (each, both spines):** P1–P13, Ruling 5, ADR-0001/0003/0007/0008/0009/0010/0011/0012/0013/0014/0015/0016,
cell-lint 1–14, CS ❌1–12, D-S12 / D-S13 / D-WF-1.

**PO rulings treated as settled (2026-07-10):** workgraph rename + `studio.workgraph.*` additive subdomain (no ADR-0010
collision); FormSpec stays product-side; the semantic leg rides knowledge/Turbopuffer, no pgvector. Findings below do **not**
re-litigate these.

**Report contract (per spine, only):**
(a) a canon rule that binds the service but has **no home** in the spine (not in Inherited Invariants, not in an AD, not in
conventions/deferred); (b) a spine statement that **contradicts** canon (cite ADR/principle + spine line); (c) an
Inherited-Invariants row that **misquotes or over-claims** its source.

---

## Verdicts

- **orvex-studio-staging — 4 findings** (1×a-substantive, 1×b, 1×c, 1×a-minor). No blocker; all fixable in-spine.
- **orvex-studio-workgraph — 4 findings** (2×a-substantive, 1×b-low-confidence, 1×a-minor). No blocker; all fixable in-spine.

Neither spine has a structural canon violation. Every ADR/principle in the checklist is either homed or named below.
The two substantive threads are symmetric: **ADR-0003 `surfaces` enrollment** is mishandled by both (staging files it in
the wrong change-authority lane; workgraph omits it entirely), and **P8's isolation-probe trio** is unhomed in both.

---

## orvex-studio-staging

### (b) — CONTRADICTION · ADR-0003 D5 + ADR-0008 lane vs AD-9

- **Spine line:** AD-9, L98 — "Event types + payload schemas + the topic-domain addition are authored in
  `orvex-studio-contracts` before build (**additive lane**); staging enrolls in the AGPL-import denylist, drift gates,
  and **402 `surfaces` list**." The 402-`surfaces` enrollment is placed inside the additive/automated-lane sentence.
- **Canon:** ADR-0003 D5 — "a new capped surface must ADD itself to `surfaces` (a contracts change; **ambiguity resolves
  to ADR-0008's ADR lane, fail-safe**)." ADR-0008 (distilled) lists "**changing the QUOTA `surfaces` semantics**" under the
  breaking / ADR-gated + human-doc-ratify lane, and "ambiguity resolves to the ADR lane (fail-safe toward review)."
- **Why it's a contradiction:** staging classifies the `surfaces` change as additive/automated (no human ratify). Canon
  fail-safes exactly this change to the ADR + human-ratify lane. Adding the topic-domain and new event types *is* additive;
  the `surfaces` vocabulary entry is the one item in that sentence that canon pulls into the ADR lane. Split it out of the
  additive-lane clause and route it ADR-lane.

### (a) — NO HOME · P8 isolation probes

- **Canon:** P8 — beyond live ACL narrowing, "**Isolation probes (cross-tenant, intra-tenant restricted-page,
  count-oracle) run in CI and post-deploy.**"
- **Spine coverage:** the live-narrowing half of P8 is homed (Inherited row L35; AD-4 wiki-api chokepoint; AD-8 verified
  principal). The **isolation-probe trio is homed nowhere** — the only probe named anywhere in the spine is the ADR-0012
  personal-tenant probe (Inherited row L36), which is a different probe. The review queue and Proposal bodies are
  tenant-scoped wiki content; cross-tenant / count-oracle egress probes bind and should appear as a CI + post-deploy gate
  (conventions or a testing invariant).

### (c) — MISQUOTE · Inherited row P8/P9 over-broadens P9

- **Row (L35):** "P8 / P9 … fail-closed live ACL narrowing on every content egress; **new producers register a contracts
  source-adapter**."
- **Source:** P9 — "**A new content source** registers a source-adapter (event types, content resolver, ACL primitive,
  purge events) … knowledge indexes it." P9 binds new *content sources* (indexed by knowledge), not every *producer*.
- **Over-claim:** staging's own AD-9 (L98) states staging events are **telemetry** and "never trigger a second reindex" —
  i.e. staging is a producer but **not** a content source and registers **no** source-adapter. The row's "new producers
  register a source-adapter" both misquotes P9 ("content source" → "producers") and asserts an obligation staging's design
  explicitly declines. (Contrast workgraph, which *is* a content source and correctly registers `sources/workgraph.yaml`.)
  Reword the row to "new **content sources** register…", and note staging is out of P9's scope.

### (a, minor) — NO HOME · P3 CI / image-build clause

- **Canon:** P3 — "Every CI job runs on the self-hosted `runners` group; image builds are **Tekton→Harbor exclusively,
  and CI never builds or pushes images**."
- **Spine coverage:** the contracts-first half of P3 is homed (Inherited row L31; AD-3-equivalent authoring). The CI /
  image-build discipline appears only as a `tekton/` directory in the Structural Seed (L206) — no invariant or convention
  states "CI never builds/pushes images; Tekton→Harbor exclusive; self-hosted runners." Minor (build-substrate), but it is
  a binding family invariant with no invariant-level home.

### Confirmed homed (staging) — no finding
P1/P10 (Inh L29; AD-1/AD-4/AD-12) · P2+D-S13 (Inh L30; AD-9) · P4+ADR-0009 (Inh L32; AD-8) · P5+D-S12+ADR-0014 (Inh L33;
AD-10; no pgvector, staging has no vector leg) · P6+D-WF-1 (Inh L34; AD-5 — no own Temporal worker; `cmd/sweep` is a
billing-`orphansweep`-style tick, sanctioned) · **P7 (Deferred L248 — homed per report contract)** · ADR-0001/0012 (Inh L36;
AD-8 polymorphic tenant + personal-tenant probe) · ADR-0003 verdict/402 (AD-11) · ADR-0007 (Inh L38; AD-9 envelope) ·
ADR-0010 D2/D3 (AD-9; `studio.staging.*` is a brand-new subdomain ⇒ canon-blessed additive, D4 producer-binding is for the
existing sub-domains) · ADR-0011 D5 + cell-lint 1–14 (Inh L39; conventions L162–166: UUIDv7, tenant-keyed no `cell_id`,
Idempotency-Key, TenantMoveManifest incl. S3 prefixes AD-10, partitions:1, no KEDA, no host literals; `/healthz` echoes
CELL_ID+CLUSTER_NAME) · ADR-0013 (default Knative Trigger per Inh L30; no always-on-gateway exception invoked) · ADR-0015
(Inh L40; delete-event reconciliation via `event` tier + `sweep`) · ADR-0016 (Inh L41; obs convention L166) · Ruling 5 +
no-fallbacks (Inh L42; AD-4/AD-12 hard cut, loud migration error, no shim) · CS ❌1–12 (Inh L28; six-tier mapping L22,
domain-in-`internal/<context>`, store confined, no own-package mocks) · P12 (CLI convention) · P13 (ADR-0016 + console).

> Watch-item (not a finding): AD-12 transfers the Curator golden "degrade reasons `sibling-unreachable`/`cap-exhausted`."
> Read as transient runtime resilience (record reason + retry) it is §10-compliant; if it hardens into a standing
> reduced-function mode when `ai`/`knowledge` is absent it would cross Ruling 5. Keep it transient-only.

---

## orvex-studio-workgraph

### (a) — NO HOME · ADR-0003 D5 `surfaces` enrollment omitted

- **Canon:** ADR-0003 D5 — "a new capped surface must **ADD itself to `surfaces`**" (`errors/vocabulary.yaml`, currently
  `[engine, wiki-api]`); consumers "branch on `errorCode: QUOTA_EXCEEDED`."
- **Spine:** AD-13 (L122) gives workgraph capped write surfaces returning "the frozen 402 shape," and AD-7 (L86) enumerates
  its contracts enrollments (types, payload schemas, topic-domain, `sources/workgraph.yaml`). **None of them enrolls
  workgraph in the 402 `surfaces` list.** Because MCP/CLI/step-API callers must special-case QUOTA_EXCEEDED from workgraph,
  the `surfaces` entry is required and is homed nowhere. (Staging homes it — mis-laned, above — workgraph drops it.)

### (a) — NO HOME · cross-tenant bytes=0 isolation probe (P8 + ADR-0014 D3)

- **Canon:** P8 — "Isolation probes (cross-tenant, intra-tenant restricted-page, count-oracle) run in CI and post-deploy."
  ADR-0014 D3 — "**Cross-tenant isolation probe is REQUIRED — the top M5 gate. E2E cross-tenant bytes = 0 AND intra-tenant
  restricted-page bytes = 0**." Canon-distilled COLLISION #2 explicitly: workgraph "**inherits the cross-tenant bytes=0
  isolation probe as a hard gate either way**."
- **Spine:** AD-3 (L58–62) leans on "structural isolation (separate namespaces)" and `ranking` grant re-filter, and AD-9
  (L98) evaluates grants on every read — but **no AD, convention, or deferred item names the bytes=0 / count-oracle probe
  as a CI + post-deploy gate.** Workgraph's semantic egress lands its content in Turbopuffer (via knowledge) and returns it
  across the grant boundary; the probe is load-bearing and must be homed (jointly with knowledge, whichever owns the write).

### (b, low-confidence) — CONTRADICTION / internal tension · AD-1 `studio_memory_*` untouched vs re-pointed

- **Spine line:** AD-1, L50 — "The user-managed memory product (`/v1/memory` FormSpec, `studio.memory.*`, **`studio_memory_*`
  tools) stays product-side, untouched and unmigrated** … **`studio_memory_get/save` tool descriptions are re-pointed to
  `workgraph_*`** for agent state."
- **Tension:** the same rule declares the `studio_memory_*` tool set "untouched," then mutates two of its members
  (`studio_memory_get/save`). The convention row (L157) also reserves the word `memory` for the user-memory product. Either
  `studio_memory_get/save` are user-memory tools (re-pointing them contradicts "untouched" and brushes the settled
  product-side ruling), or they are mis-named agent-state tools (then they aren't part of the "untouched" set and the
  sentence should say so). Low-confidence because it reads as a wording slip, but it needs a one-line disambiguation so the
  cutover doesn't touch the user-memory product.

### (a, minor) — NO HOME · P3 CI / image-build clause

- Same gap as staging: P3's "Tekton→Harbor exclusive; CI never builds/pushes images; self-hosted runners" is present only as
  a `tekton/` Structural-Seed dir (L201), not as an invariant/convention.

### Confirmed homed (workgraph) — no finding
P1/P10 (Inh L29; AD-1) · P2+D-S13 (Inh L30; AD-7 outbox→relay→Kafka, Knative Trigger) · P4+ADR-0009 (Inh L32; AD-9
lib/pkg/auth, VerifyFresh) · P5+D-S12+ADR-0014 (Inh L33; AD-3 — knowledge/Turbopuffer, **no pgvector** per settled ruling;
Stack L170 "no pgvector extension") · P6+D-WF-1 (Inh L34; AD-5 schedules in workflows, `cmd/reaper` tick = billing
`orphansweep` precedent, not a Temporal worker) · **P7 (Deferred L246 — homed per report contract)** · P8 live narrowing
(Inh L35; AD-9 authz chokepoint) · P9 (Inh L35; AD-3/AD-7 `sources/workgraph.yaml` source-adapter — correctly a content
source) · ADR-0001/0012 (Inh L36; AD-9 namespaces + personal-tenant probe) · ADR-0007 (Inh L38; AD-7 envelope) · ADR-0008
(Inh L31; AD-7 additive) · ADR-0010 (settled `studio.workgraph.*`; AD-7; AD-1 collision-avoidance) · ADR-0011 D5 + cell-lint
1–14 (Inh L39; AD-6 UUIDv7 + `(tenant, short_id)` uniqueness = cell-lint 12; conventions L159–161: no `cell_id`,
Idempotency-Key, partitions:1, no KEDA, no host literals; `/healthz` echoes CELL_ID+CLUSTER_NAME) · ADR-0013 (default
Knative Trigger; AD-2 hot path is zero-fanout, no in-request consumption) · ADR-0015 (Inh L40; AD-5 knowledge purge events +
tombstones, orphan-sweep) · ADR-0016 (Inh L41; obs convention L161, PII deny-list on item/note/fact text) · Ruling 5 +
no-fallbacks (Inh L42; AD-3 "if the spike fails the budget… an ADR-0014 carve-out ADR, **never a quiet local index**") · CS
❌1–12 (Inh L28; six-tier mapping L22) · P12 (CLI) · P13 (AD-7 console reads knowledge projections, never workgraph
Postgres).

> Watch-item (not a finding): AD-2/AD-3 "degraded mode returns honest-empty with status" + "Postgres legs alone return
> correct (if less semantic) results for content newer than the projection lag, bannered, never silent." Read as
> projection-lag / eventual-consistency handling (not an absent-`knowledge` fallback) this is P8/§10-compliant; the "never a
> quiet local index" clause keeps it on the right side of Ruling 5. Keep the banner mandatory.

---

## Cross-cutting

1. **ADR-0003 `surfaces` is mishandled by both, oppositely.** Staging files the enrollment in the additive lane (should be
   ADR-lane, fail-safe); workgraph omits the enrollment altogether. One shared fix: a convention line — "any capped 402
   surface adds itself to `errors/vocabulary.yaml` `surfaces` via the ADR + human-ratify lane (ADR-0003 D5 fail-safe)."
2. **P8 isolation-probe trio is unhomed in both.** Add a testing/CI invariant naming the cross-tenant / intra-tenant-
   restricted / count-oracle probes (bytes=0) as a CI + post-deploy gate; for workgraph this is also the ADR-0014 D3 M5 gate.
3. **P3 CI/image-build clause is unhomed in both** (only a `tekton/` seed dir). Minor; a one-line convention closes it.

All three are additive edits to the spines; none reopens a settled PO ruling or forces a design change.
