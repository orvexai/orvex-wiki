# Rubric-walk — orvex-studio-staging ARCHITECTURE-SPINE

**Spine:** `architecture-orvex-studio-staging-2026-07-10/ARCHITECTURE-SPINE.md`
**Lens:** good-spine checklist (9 points), the reviewer-gate rubric.
**Cross-refs:** `scratchpad/version-pins.md`, `scratchpad/canon-distilled.md`, PRD `prd-studio-staging-area-2026-07-09/prd.md`, and the three sibling reviews in this dir.
**Date:** 2026-07-10

**Standing note — this is a post-reconcile revision.** The current file has already folded in *every*
finding from the two sibling reconcile passes (`reconcile-canon.md` a/b/c + P3-minor; `reconcile-prd.md`
G1–G6, N1, N3, N4). Each is confirmed re-homed below where relevant, so this walk judges the *current*
text, not the drafts those peers saw. Settled facts I therefore do **not** re-flag: the PO-ruled
`orvex-studio-memory`→`orvex-studio-workgraph` rename (PRD still says "memory"/`divert-to-memory`); that the
shared `pkg/auth` verifier is real now (not the stale "stub as of 2026-07-06"); version-lens verdict PASS.

**Verdict: PASS-WITH-FIXES.** No critical, no high. 3 medium + 6 low, all additive/clarifying; none reopens
a settled ruling or forces a redesign.

---

## Point 1 — Fixes the real divergence points; nothing load-bearing left silent

Strong. The genuine incompatibility points for a new Go platform service are pinned: single deployable +
binary set (AD-1), the one CAS mutation path (AD-2), conflict keying on stable block IDs + authoritative
read (AD-3), the wiki-api write chokepoint (AD-4), central Temporal / local checkpoints (AD-5), the ai +
knowledge seams (AD-6), the dial as a server-side domain verdict (AD-7), tenancy/credential/trust keying on
the verified principal + RLS in baseline (AD-8), event telemetry-vs-truth (AD-9), pointer-state (AD-10),
quota (AD-11), verbatim supersession + loud cut (AD-12), beautify-at-triage with byte-equality apply
(AD-13), admin-gated learning (AD-14). The dependency-direction diagram plus its explicit forbidden-edge
list is exactly the kind of mechanically-checkable boundary a spine owes its epics.

Residual silences that could still let two units choose differently (all sub-load-bearing):
- **FR-STG22 review-state flag home (→ M1).** Semantics are now well-specified (human-settable, decoupled
  from ACLs, auto-apply gate — AD-7) but *where the flag persists* and *how it reaches knowledge's retrieval
  gate* are implicit; staging and knowledge teams could each assume the other owns it.
- **ChangeSet-grouping key (→ L1).** "one session ⇒ one open ChangeSet" (FR-STG2) has no pinned resolution
  key; AD-8's "never a body-supplied id" governs trust/provenance, but grouping legitimately needs the
  supplied session/conversation ref — the two need one line of disambiguation.
- **cmd/sweep vs Temporal-scheduled sweeps (→ L6).** Naming collision between the `cmd/sweep` tick
  (orphansweep-precedent, AD-1) and the AD-5 workflow-scheduled Librarian maintenance sweeps (FR-STG18–21).

## Point 2 — Every AD's Rule is enforceable and prevents its divergence

All 14 Rules are checkable by grep/inspection or a CI probe (verdict-only-in-`policy`; state-only-in-
`lifecycle`; apply imports only `wikiapiclient`; no `go.temporal.io` import; no LLM SDK import; RLS in
`0001`; append-only feedback; full-text+marks equality in apply; etc.). One Rule is currently
*unsatisfiable*, not unenforceable: **AD-9's "knowledge reindexes from the ENGINE's `wiki.*` events" has no
producer today** (→ M2). Everything else holds.

## Point 3 — Deferred is safe

Yes. Every deferred item fixes its structural signature now and defers only a value or a manifest/UX choice:
dial doc-type granularity (the `policy` verdict already takes a scope key), retention windows (config +
purge mechanism already in AD-10), review-queue UI host (queue API is fixed), workload shape (P7 pre-decides
the Deployment/Knative mapping), numeric SLOs (benchmark publishes the contract), Card→Proposal mapping
(AD-12 fixes verbatim-superset semantics), marketplace mechanics (seam named). No deferral lets two units
diverge now.

## Point 4 — Named tech verified-current

Owned by the version lens (`review-versions.md`), which verified every Stack row against pins or the
as-built repos and returned **PASS**. Its one MEDIUM stands: **`orvex-studio-lib v0.3.0` is stale — bump to
`v0.3.1`**, which carries the exact auth/secrets surface AD-4/AD-8 lean on (workload-identity hook,
offline-verifier port, `pkg/secrets` helper). Not re-counted here; deferred to that lens. Go 1.26.5,
pgx v5.10.0, PG18/CNPG v1.30.0, Temporal v1.31.2/SDK v1.46.0, MCP TS SDK ^1.29 + zod 4 all confirmed;
`testcontainers-go v0.43.0` is repo-verified (not in pins) — its F3 info-note.

## Point 5 — Ratifies rather than contradicts brownfield reality

Very canon-aware; the Inherited Invariants table is thorough and the canon-reconcile findings are all
re-homed (surfaces→ADR lane L98; P8 probes→AD-8 L92; P8/P9 "content source, staging is not one"→L35;
P3 CI/image→conventions L166). The single brownfield gap: **AD-9's reindex path assumes a live `wiki.*`
producer the engine does not have** (REgcVseTR5: vanilla Docmost v0.95.0, zero events). The spine flags the
wiki-api / ai / knowledge 501 prerequisites but not this engine-outbox one, and the diagram draws
`ENGINE -->|wiki.*| SPINE` as if live (→ M2).

## Point 6 — Driving spec's capabilities covered

All 29 FR-STG and all 6 NFR-STG are homed (FRs across the Capability Map rows; NFR-STG2–6 via each AD's
`Binds:` line even though the map surfaces only NFR-STG1 → L4). Two capabilities land shallowly: the
FR-STG8 **divert-to-workgraph write seam** is named only as a diagram arrow + `workgraphclient`, with no
AD-level invariant like ai/knowledge/wiki-api/billing get (→ L3, contract-first mitigates; PRD peer counts
FR-STG8 as landed), and the **FR-STG22 flag** (→ M1). PRD-reconcile G1/G3/G4/G5/G6 + N1/N3/N4 all confirmed
re-homed.

## Point 7 — No new AD weakens an Inherited Invariant

Clean. Every AD strengthens or is orthogonal to its invariants — AD-4/AD-8 *tighten* P8/P4 (chokepoint,
RLS-in-baseline, VerifyFresh); AD-4 explicitly *ratifies* the doc-ratify human gate ("never self-promotes
page status", L68). ADR-0010 D4's producer-binding is for the existing sub-domains; `studio.staging.*` as a
new sub-domain is canon-blessed additive (D1) — confirmed by the canon lens, not a weakening.

## Point 8 — Every owned dimension decided / deferred / open — incl. operational envelope

Mostly complete. Data, stores, events, seams, auth, quota, naming, migrations/tests, CI/CD, observability,
rollout sequencing, tenant-move, and failure/pause runbook are all present. The thin spot is the
**operational/environmental envelope's ingress sub-dimension (→ M3):** whether `orvex-studio-staging` gets a
public flat host or stays cluster-internal, and how `orvex-cli staging` reaches its API, is stated nowhere —
86CiGucQwU makes public-host-or-not an architecture decision and it shapes the edge auth surface. The
prod/dev/crew env-mapping is inherited-but-unrestated (secondary). Deployment (cell-local ApplicationSet),
infra/provider (Stack + conventions), and runbook basics (healthz/readyz echo, DLQ via Knative Triggers,
explicit pause/resume) are covered.

## Point 9 — Diagrams valid, frontmatter coherent, no template cruft

Frontmatter coherent (`binds` = FR-STG1..29 + NFR-STG1..6 matches the PRD; companion = workgraph). The
`stateDiagram-v2` is valid and now includes `partiallyaccepted` (peer N1 closed). `[ASSUMPTION]`/`[ADOPTED]`
tags are intentional status markers, not template comments; no placeholders remain. Low nit (→ L5): confirm
the dependency `flowchart LR` renders — the `DOM[domain: … · … ]` label (colon + middots) and the
hyphenated `subgraph orvex-studio-staging` id are low-risk but worth quoting to be safe.

---

## Findings

| # | Sev | Point | Finding |
| --- | --- | --- | --- |
| M1 | MEDIUM | 1,6 | **FR-STG22 groundability flag has no storage home / propagation contract.** AD-7 specifies the flag's semantics (human-settable, decoupled from ACLs, auto-apply review gate) and AD-6 homes enforcement in knowledge + names a gating contract, but the spine never says *where the review-state persists* or that FR-STG22 rides that AD-6 contract across the staging↔knowledge boundary. SM-C3 ("zero by construction", a leak-alarm) depends on that mechanism. Fix: one line homing the flag store + routing it through the AD-6 gating contract. |
| M2 | MEDIUM | 2,5 | **AD-9 reindex rides a `wiki.*` producer that does not exist today.** Engine is vanilla Docmost emitting zero events (REgcVseTR5); the diagram's `ENGINE -->|wiki.*| SPINE` is drawn as live. The spine flags the wiki-api/ai/knowledge 501 prerequisites but not the engine-outbox one — reindex-on-apply is dark until it ships. Fix: name the engine `wiki.*` outbox as a gating prerequisite alongside the others. |
| M3 | MEDIUM | 8 | **Ingress/public-exposure dimension silent.** No AD/convention/deferred states whether staging is a public flat host or cluster-internal, nor how `orvex-cli staging` reaches the API (edge route vs Studio-plane proxy). 86CiGucQwU treats this as an arch decision; it shapes the edge auth surface. Decide or explicitly defer. |
| L1 | LOW | 1 | ChangeSet-grouping "session" key not pinned; reconcile "one session ⇒ one open ChangeSet" (FR-STG2) with AD-8's "never a body-supplied id" (grouping keys on the session ref; trust/provenance on the verified principal). |
| L2 | LOW | 1 | AD-4 says snapshots go "into the staging store"; AD-10 puts snapshots in S3 with Postgres pointers. Reconcile the "staging store" wording (logical store vs S3 payload tier). |
| L3 | LOW | 6 | Divert-to-workgraph write seam has only a diagram arrow + `workgraphclient`, no AD-level invariant (unlike ai/knowledge/wiki-api/billing). Contract-first covers the wire; add a divert invariant for symmetry. (rename PO-ruled; FR-STG8 counted landed by PRD peer.) |
| L4 | LOW | 6 | Capability→Architecture Map surfaces only NFR-STG1; NFR-STG2–6 are bound via AD `Binds:` lines but not shown in the map. Cosmetic completeness. |
| L5 | LOW | 9 | Verify the dependency `flowchart LR` renders — `DOM[domain: … · …]` (colon+middots) and hyphenated `subgraph orvex-studio-staging` id are low-risk; quote to be safe. |
| L6 | LOW | 1 | Clarify `cmd/sweep` (tick, orphansweep-precedent — AD-1) vs the AD-5 Temporal-scheduled Librarian maintenance sweeps (FR-STG18–21) — which drives the maintenance mandate. Naming collision. |

**Also live (owned by peer lenses, not re-counted):** version F1 — bump `orvex-studio-lib v0.3.0`→`v0.3.1`
(MEDIUM, `review-versions.md`).
