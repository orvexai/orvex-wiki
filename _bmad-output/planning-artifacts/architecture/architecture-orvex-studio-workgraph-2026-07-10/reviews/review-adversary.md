---
name: review-adversary
type: architecture-review
lens: workgraph-spine-adversary
target: ../ARCHITECTURE-SPINE.md
prd: ../../../prds/prd-studio-agent-memory-2026-07-09/prd.md
reviewer: adversarial (spine-attack)
created: '2026-07-10'
verdict: '15 holes (2 top-tier structural)'
---

# Adversarial Attack — orvex-studio-workgraph spine

## Method

For each seam I constructed **two units one level down (epics/stories) that each obey every AD as written**, yet build incompatibly. A pair that clashes is a hole in the spine — the ADs did not constrain enough. Ranked by likelihood × blast radius. Each hole ends with the **minimal tightening** (new/tightened AD) that closes it. A closing section records what the spine *does* already close, so the holes below are the residue, not noise.

Terminology: "α" and "β" are the two independent builder units; both are AD-conformant.

---

## H1 — The synchronous verb request/response schemas have no contracts-first home [TOP-TIER]

**Pair.** α = the *contracts epic*, authoring per AD-7 exactly what AD-7 enumerates: event types, rich event payload schemas, the topic-domain addition, and `sources/workgraph.yaml`. β = the *MCP surface epic* in the **separate `studio-mcp` repo** (and identically the CLI epic in `orvex-cli`, the KG interop adapter, the Claude memory-tool backend), which per AD-10 are "thin protocol translators onto the same **published** workgraph API verbs" and per P3/`gen/` codegen typed clients from the pinned contracts tag.

**Clash.** AD-7's enumeration is entirely event-side and source-adapter-side. **No AD places the synchronous verb request/response schemas** — `prime` (compact/full body), `ready`, `recall`, `search`, `stats`, `handoff` create, `grant` create, `batch` — **in `orvex-studio-contracts`.** So α authors only events and treats the sync OpenAPI as service-local (workgraph's own `gen/` from its own spec); β, in another repo, has nothing in the shared tag to codegen against and hand-rolls each shape. Four adapters, four drifting renderings of the prime payload, the handoff payload, the ready item shape. AD-10's "published API verbs" is asserted but never made true by any AD. This is the meta-hole: it also swallows the prime-payload-fields, handoff-payload, and banner-shape gaps below.

**Fix (tighten AD-7 / new AD-14).** The synchronous verb request/response schemas are authored in `orvex-studio-contracts`, tag-pinned, before build — **same additive lane and same tag as the event schemas** — and every AD-10 adapter plus `cmd/api` codegens from that one tag. AD-7's enumeration must be extended from "event payload schemas" to "event **and** sync-verb schemas."

## H2 — `blocked`/`deferred`: enum status value vs orthogonal denormalized flag [TOP-TIER]

**Pair.** α = graph-core story "item lifecycle & status," which builds `status` as a single enum column with the **only** value set the spine points a builder at — the PRD §3 glossary `{open, in-progress, blocked, closed, deferred}` — validated as single-valued. β = graph-core story "ready/blocked denormalization," which per AD-4 builds `blocked` as a **denormalized boolean flag** maintained on edge writes, and per AD-2's `defer` verb builds `deferred` as a flag, leaving `status = {open, in-progress, closed}`.

**Clash.** Both obey AD-2/4/6/7. β's edge write sets `blocked=true` while α's `status` stays `open`; the `ready` query then filters either `status='open'` (α — silently includes blocked items, the exact ready-work corruption AD-4 exists to prevent) or `blocked=false ∧ status='open'` (β). Worse, α's claim-CAS (AD-2: "assignee + status together") on a `blocked`-*status* item overwrites the block. The single most central concept — what is ready — is modeled two incompatible ways, and the spine's own ADs never restate the enum, so both readings are conformant.

**Fix (new AD).** Pin the canonical item model: `status ∈ {open, in-progress, closed}` (single-valued lifecycle) with `blocked`, `deferred`, and claim-existence as **orthogonal dimensions** (derived/flag, never enum members); `ready ≝ status=open ∧ ¬blocked ∧ ¬deferred ∧ ¬claimed`. The enum and the dimensions live in the H1 contracts tag.

## H3 — Handoff carries two state machines on one row, with two writers

**Pair.** α = the *claims/leases epic*, implementing `claim` as the uniform AD-2 CAS (assignee + `status`=in-progress) for **all** item types — AD-8 explicitly says "handoff claims use the same AD-2 CAS." β = the *handoff epic*, implementing AD-8's `submitted → claimed → accepted/returned` machine on a `handoff_state` column.

**Clash.** A handoff is simultaneously "a first-class item type" (with item `status`) and a state machine (with `handoff_state`). When a handoff is claimed through α's generic path, `status` advances to in-progress but `handoff_state` is never touched — it sits at `submitted` forever, and β's `accepted/returned` transitions (the target's accept-or-bounce decision, which is *not* item close) have no trigger. `ready`/`prime` surfacing of handoffs (FR-MEM5) keys on one field or the other with no rule which. Two owners of one entity's state.

**Fix (new AD).** Handoff state is **not** a second free column: either (a) `handoff_state` is *derived* from `(status, assignee, resolution)`, or (b) the claim-CAS on an item of type=handoff atomically advances `handoff_state` in the same transaction. Pin the mapping (`submitted`=open/unclaimed, `claimed`=in-progress/assigned, `accepted`=in-progress post-accept, `returned`=open+returned) and the sole writer of each transition.

## H4 — `blocked` recompute has three writers with three affected-set definitions

**Pair.** α = graph story "edge writes," recomputing `blocked` incrementally over the written edge's downstream subtree (AD-4). β = graph story "gate items," recomputing `blocked` for a gate's dependents when a gate *item* resolves (AD-4: "gate items block dependents through the same flag machinery") — but a gate resolution is an item-status change, **not** an edge write, so it is a different code path with its own notion of "affected subgraph." (γ = the idempotent repair job, a third writer.)

**Clash.** An item blocked by **both** an edge and a gate (a diamond) is recomputed by α's edge-scoped set and β's gate-scoped set; concurrent incremental recomputes interleave and lose updates — the item is left `blocked=false` while still gated, or `blocked=true` after both clear — until the periodic repair job (γ) eventually reconciles. AD-4 mandates "incremental over the affected subgraph" and "an idempotent repair job" but never says the three triggers share one recompute primitive or one affected-set definition.

**Fix (new AD / tighten AD-4).** A single `recomputeBlocked(affectedSet)` primitive owns the flag, invoked by edge-write, gate-resolve, claim/close, and repair alike, each supplying its affected set; each affected item's recompute is one serialized row-locked transaction. One writer path, N triggers.

## H5 — Reaper revert races heartbeat renew on the lease row

**Pair.** α = claims epic `heartbeat` = `UPDATE claim SET expires_at=now()+ttl WHERE item=? AND owner=?` (owner-only, AD-2). β = the reaper epic (`cmd/reaper`, AD-5): read stale ids `WHERE expires_at < now()-grace`, then revert those items to ready.

**Clash.** AD-2 makes `claim` a CAS so a *stale-blind claim* fails on conflict — but the **reaper's revert is not a claim** and AD-2's protection does not reach it. If β reads a batch of stale ids at T0 and a heartbeat (α) extends one lease at T0+1, a revert-by-captured-id at T0+2 (without re-checking `expires_at` in the mutating `WHERE`) yanks a **live** claim back to ready, and a concurrent claimer double-works it — breaking SM-2 (<1% double-claims). Nothing in the spine forbids read-then-write-by-id, and nothing pins `reaper_grace > max heartbeat interval`, so a slow-but-alive agent can also be reaped.

**Fix (tighten AD-5).** Reaper revert MUST be a conditional CAS — the `expires_at < now()-grace` predicate lives in the mutating statement, never a read-then-revert-by-id. Pin the time invariant `reaper_grace > heartbeat_interval` (and expose all three of TTL / heartbeat / grace as one coherent per-tenant config, not three independent assumptions).

## H6 — System principals (janitor, reaper, relay) vs AD-9 "every mutation through authz"

**Pair.** α = the *grants/authz epic*, enforcing AD-9 literally — "evaluated by the single `authz` domain package on **every** read and mutation — MCP, CLI, interop adapters, **step-APIs**, and `ranking` all pass through it," callers "verified via lib `pkg/auth` per-agent scoped tokens." β = the *janitors epic* (and the reaper, and the relay), whose consolidation/compaction writes and lease reverts are mutations invoked by workflow step-APIs (or the reaper tick) under a **service** token, not a per-agent token.

**Clash.** β's system writes carry no per-agent grant, so α fails them closed — consolidation, compaction, and lease-revert cannot write (liveness dead). The only escape is α growing an unspecified "system bypass," which is precisely a hole in the "single chokepoint" AD-9 promises. The spine lists step-APIs as passing through authz but never defines the authorization model for a non-agent principal.

**Fix (new AD).** Define a first-class `system` principal class (janitor, reaper, relay) that `authz` recognizes with a **scoped system capability — not a bypass** — audited distinctly, with an enumerated closed set of permitted mutations (consolidate/compact facts + closed items; revert leases) and the hard invariant that it can never touch open/in-progress/claimed items or cross a tenant boundary (reinforcing AD-5's untouchability rule).

## H7 — Knowledge-side indexing: rich-event-inline vs content-resolver-fetch, and the unshaped `acl_primitive`

**Pair.** α = the *event/contracts epic*, emitting rich events with indexable content **inline** (AD-3: "knowledge indexes items/notes/facts **from** `studio.workgraph.*` rich events"), treating the source-adapter `content resolver` as vestigial. β = the *knowledge-side source-adapter epic* (in `orvex-studio-knowledge`), indexing by **calling back** workgraph's `content resolver` and `acl_primitive` (both listed in AD-7's `sources/workgraph.yaml`), treating events as lean triggers.

**Clash.** Two indexing paths named by the spine, no ruling which is authoritative: α ships fat events and a stub resolver → β's resolver-driven indexer gets nothing (or double-indexes inline + resolver, with a snapshot-vs-live consistency skew). And the **`acl_primitive` request/response shape is never fixed** — `{principal, candidate_ids[]} → allowed_ids[]`? a predicate? — nor is its fail-open-vs-fail-closed behavior on a contract mismatch. Security is *partially* saved (AD-3's `ranking` re-filter + count-oracle probe catch leakage), but liveness is not: a shape mismatch either returns nothing or narrows nothing. The purge event (AD-5 erasure → "a knowledge purge event per the source-adapter contract") is likewise named but unshaped.

**Fix (new AD).** In `sources/workgraph.yaml`, in contracts before build: choose **one** indexing path (rich-event-inline **or** resolver-fetch, not both), and fully shape `acl_primitive` (`{principal, candidate_ids[]} → allowed_ids[]`, **fail-closed**) and the purge event. Note that ADR-0016's PII rule is telemetry-scoped only — the event **payload** carries content by design; state this so a belt-and-suspenders reading doesn't strip content and starve the index.

## H8 — Grant vs 3-state privacy enum: precedence unspecified

**Pair.** α = the authz story "privacy base," treating the migrated 3-state enum (`open | private | shared-private`, AD-1) as the authoritative visibility ("grants built **on** the enum"). β = the authz story "explicit grants," treating per-item grants as authoritative (AD-9: "per-item grants… evaluated on every read").

**Clash.** An item that is `private` (enum) but carries an explicit read-grant to agent X: α denies X (enum wins), β allows X (grant wins). FR-MEM21 pins one direction only — "no existing grant silently downgrades" (the enum may not lower a grant) — leaving the upward direction (does a grant widen a stricter enum?) undecided. A security-relevant divergence either over-shares or breaks an intended share.

**Fix (new AD / tighten AD-9).** Pin precedence: the enum sets a **default visibility floor**; explicit grants may only **widen** it; no grant is ever ignored by a stricter enum and no enum revokes an explicit grant; namespace-prefix isolation caps both and is never crossable (already AD-9).

## H9 — `/internal/*` step-API bodies and orchestration granularity, across the workflows↔workgraph seam

**Pair.** α = the *janitors epic*, exposing a **coarse** `/internal/consolidate` that does top-k (via knowledge) + ai-decide + apply internally, so the workflow merely triggers. β = the *workflows epic* (sibling repo, `orvex-studio-workflows`), which for durability orchestrates **fine** steps (`/internal/topk`, `/internal/ai-decide`, `/internal/apply`) and expects workgraph to expose each.

**Clash.** Cross-repo, opposite decompositions of the same loop; the step-API **endpoint set and body schemas** (`{tenant, batch_ref}` vs `{tenant_id, item_ids[]}`) don't match. AD-5/P6 pin that schedules live in workflows calling idempotent `/internal/*` step-APIs, and cell-lint pins the Idempotency-Key — but neither the **bodies** nor the **orchestration boundary** (who calls knowledge/ai — janitor-internal or workflow-driven) is fixed.

**Fix (tighten AD-5).** Pin, in contracts, the exact `/internal/*` step-API set and request/response bodies, and the orchestration boundary (recommend: janitor owns the top-k+ai+apply loop internally; workflow triggers + checkpoints only — consistent with AD-2's "no sibling call on the hot path" keeping the fan-out inside the async janitor).

## H10 — Anomaly detectors need input signals the event schema never defines

**Pair.** α = the *console-projection epic*, computing AD-7's exactly-three detectors (stale-claim, **re-open loop ≥2 after rejection**, orphaned-blocker) from knowledge projections. β = the *event/contracts epic*, defining the event schema with no "rejection" concept (items have `closed`, handoffs have `returned`, neither is "rejected") and edge events that don't carry the target's status.

**Clash.** α's re-open-loop detector needs a "rejection" event/field β never emits; α's orphaned-blocker detector needs the blocker's `closed/missing` status correlated onto the edge, which β's edge event omits. Both obey AD-7 (the detector *set* is fixed) — but the detectors silently produce nothing because their **input signals** were never pinned.

**Fix (tighten AD-7).** Alongside the fixed detector set, pin in the event schema the exact fields each detector consumes: a close `resolution` enum including `rejected`, a per-item re-open counter, and edge-target status/tombstone on edge events.

## H11 — Batch: one coarse event vs N per-resource events, and the idempotency-key→event-id derivation

**Pair.** α = the graph-batch story, emitting **one** `studio.workgraph.batch.applied` event (AD-2: "batch is one transaction"; one Idempotency-Key). β = the knowledge-projection story, expecting **N** per-resource events (AD-7: "every mutation emits `studio.workgraph.<resource>.<past-tense>`") to index each item.

**Clash.** α's single coarse event → β indexes nothing per item. If α instead emits N, the batch's single Idempotency-Key must derive N deterministic, distinct event ids or an at-least-once replay double-indexes. AD-2 (atomicity) and AD-7 (per-resource emission) are both satisfiable two ways and the spine never reconciles transaction-granularity with event-granularity.

**Fix (tighten AD-7).** A batch emits **N per-resource events** within the one transaction, with event ids **deterministically derived** from `(Idempotency-Key, resource-id)` so replay dedups. State that transactional atomicity ≠ event coarseness.

## H12 — `event_time` provenance and which clock recency/staleness use

**Pair.** α = the graph epic, setting edge `event_time` = **caller-supplied** domain time (true bi-temporal, AD-6's `event_time` distinct from `ingest_time`). β = the ranking epic, whose recency decay (AD-3) orders by `event_time` assuming write-monotonicity — while the console projection orders by `ingest_time`.

**Clash.** A backdated caller `event_time` ranks a just-written edge as "old" in β's fusion but "new" in the console; AD-3's staleness banner ("content newer than the projection lag") fires by an unspecified clock and so inconsistently. AD-6 introduces both timestamps but never says who sets `event_time` or which clock ranking/staleness read.

**Fix (tighten AD-6).** Pin `event_time` provenance (caller-supplied, **server-clamped to ≤ ingest_time**) and pin that recency decay and the staleness banner use `ingest_time` (the monotonic index-order clock); reserve `event_time` for as-of/invalidation only.

## H13 — Elision / staleness / degraded banners: three sources, no shape, and "degraded" undefined

**Pair.** α = prime/facts/ranking, each emitting its banner in a different shape (a structured field vs a content-prefix string) for its own concern — injection-cap elision (AD-13), projection staleness (AD-3), degraded-empty (NFR-MEM6). β = the MCP and CLI adapters (AD-10, thin translators) that must render banners uniformly, and the adherence telemetry (AD-11) that keys on "was content elided?"

**Clash.** Three banner producers with no unified envelope → each adapter renders inconsistently and telemetry can't parse elision. Compounding it, **"degraded" is never defined**: is knowledge-down degraded? AD-3 says the Postgres legs must still serve, so knowledge-down should be a *staleness* banner — but a prime epic reading NFR-MEM6 literally may over-degrade to honest-empty while ranking serves partial results.

**Fix (new AD).** One banner envelope in contracts — `{kind: elision|staleness|degraded, scope, detail}` — carried on every affected response. Define "degraded" = **store-unavailable only**; knowledge-unavailable = staleness banner + Postgres-legs, never empty.

## H14 — Remembered-Fact key uniqueness/resolution scope

**Pair.** α = the facts epic, keying facts `(tenant, agent, key)` and resolving `recall-by-key` (AD-2 fast path) within the caller's agent namespace. β = the prime epic, whose admin-pinned "tenant memories" (AD-13) are `(tenant, key)` with agent=null.

**Clash.** α's agent-scoped recall for `key` misses (or ambiguously collides with) β's tenant-pinned `(tenant, null, key)`. The KG interop adapter (AD-10, entities/observations→facts) needs the same key scope and picks its own third answer. AD-9 names the `tenant/agent/session` namespaces but never binds the fact **key** uniqueness to that tuple or fixes resolution precedence.

**Fix (tighten AD-9 / facts).** Pin the fact key tuple `(tenant, scope ∈ {tenant|agent|session}, key)` unique, and the recall resolution order `session → agent → tenant` with explicit precedence.

## H15 — Short-id grammar not published to its consumers

**Pair.** α = the graph epic, issuing short ids as `(tenant, seq)` in some encoding (say base32-crockford, no type prefix — AD-6 only requires `(tenant, short_id)` unique). β = the note-reference parser (prime/graph), the KG interop adapter, and compaction id-resolution (AD-5: "its summary preserves id resolution"), all of which parse short ids out of free text and several of which follow the PRD's `mem-4f2a` (type-prefixed) example.

**Clash.** β can't reliably parse α's prefix-less ids embedded in note text; cross-references, interop round-trips, and compaction's id-preservation break. Four consumers parse the id; AD-6 fixes uniqueness and issuance but not the **grammar**.

**Fix (tighten AD-6).** Pin the short-id grammar (prefix policy, charset, length) in the contracts tag as a shared, parseable format.

---

## Minor also-rans (real, lower blast radius)

- **Does `ready` include type=handoff items?** graph-ready vs handoff vs prime — if `ready` returns handoff items *and* prime lists "pending handoffs" separately (AD-13), handoffs double-count; if excluded inconsistently, they vanish. Fix: pin that `ready` excludes open handoffs; handoffs surface only via the handoff list.
- **"Top ready item" ordering in prime-compact.** AD-13 forbids semantic retrieval in compact, but AD-4 ready is "ranked by priority/age/hybrid." prime's non-semantic top item can disagree with `ready`'s hybrid top item. Fix: pin compact's top-item ordering = priority/age (the non-semantic sub-order of `ready`), so they agree.
- **`close` + `claim_next` atomicity (FR-MEM14).** adapter-composed (two calls) vs core-atomic (one tx) — a CAS-fail on the next claim either strands a closed item or rolls back the close. Fix: pin `claim_next` as a best-effort *follow-on*, never rolling back the close.
- **Wiki-worthy "unchanged content" hash (AD-12).** workgraph-side vs staging-side dedup definitions must match or the cycle-reject either misfires or misses. Fix: pin the content-hash definition in the `stagingclient` contract.

## What the spine already closes (checked, not holes)

- **Degraded claim safety** — AD-2 keeps `claim` a server-side CAS even when prime is degraded, so a stale-blind claim CAS-fails rather than double-claiming (closes the UJ-1 edge case).
- **Cross-tenant search leak** — AD-3 binds the ADR-0014-D3 bytes=0 isolation probe plus intra-tenant restricted-content and count-oracle probes to *both* the knowledge corpus and workgraph's own reads, CI + post-deploy. Security of the knowledge seam is defended even where H7's *contract shape* is not.
- **Namespace non-crossing** — AD-9 makes namespace-prefix isolation the uncrossable outer boundary; no grant can escape it (org-shared only via one org principal).
- **Live-state untouchability** — AD-5 forbids janitors from touching open/in-progress/claimed/pending-handoff rows, protecting SM-2 from the LLM loop (the residual gap is H6: *who authorizes* the janitor, not *what* it may touch).
- **PRD/FR-MEM21 migration divergence** — the spine knowingly starts empty (AD-1) and flags the PRD's backfill/rename as a correct-course edit; this is a flagged divergence, not a spine-internal hole.
