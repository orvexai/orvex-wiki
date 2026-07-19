---
review: rubric-walk
target: ARCHITECTURE-SPINE.md (orvex-studio-workgraph)
reviewer: rubric walker (architecture-spine reviewer gate)
date: 2026-07-10
verdict: PASS-WITH-FIXES
tally: 0 critical · 0 high · 2 medium · 9 low
---

# Rubric-walk review — orvex-studio-workgraph ARCHITECTURE-SPINE.md

**Gate verdict: PASS-WITH-FIXES.** The spine is sound and buildable. It resolves both
canon collisions the brownfield reality carried (`studio.memory.*` namespace, and pgvector),
maps all 27 FR-MEM + 7 NFR-MEM, and gives its 13 ADs real teeth (forbidden-edge list,
isolation probes, RLS backstop, three named pre-GA gates). No invariant is wrong and no AD
enables a NOW divergence. The fixes below are completeness gaps — most notably an unreconciled
change-authority claim (M1) and two load-bearing dependencies that are non-functional today and
left unflagged where the spine flags a lesser one (M2).

---

## Point-by-point walk

### 1. Fixes the REAL divergence points; nothing load-bearing left silent — **PASS**
The spine pins every place two epic teams could pick incompatibly: event namespace (AD-7,
`studio.workgraph.*`), vector store (AD-3, none-local / via knowledge), ID scheme (AD-6,
UUIDv7 + short-id), claim mechanics (AD-2, single CAS), authz model (AD-9, one chokepoint),
adapter pattern (AD-10, thin translators onto published verbs), quota (AD-13), blocked-flag
(AD-4). Cross-epic divergence is further foreclosed by pushing schemas to the contract seam
(rich event payloads, source-adapter, interop mapping all authored in `orvex-studio-contracts`
before build) — teams codegen from one source, they can't diverge. The hot-path / warm-path
boundary is clean: `recall-by-key` (facts, index scan) vs `search` (ranking → knowledge) is a
crisp split two teams can build to independently. Silent-but-shared residue is minor: migration
tool is unnamed (L1) and the rate-limit enforcement point is underspecified (L7).

### 2. Every AD's Rule is enforceable and prevents its stated divergence — **PASS**
All 13 ADs carry rules with teeth. Structural enforcement dominates: hot-path packages
physically can't import sibling clients (forbidden-edge list + package boundary), adapters can't
touch the store (cross-repo for MCP/CLI; the forbidden edge covers in-repo), authz is a single
package backstopped by RLS fail-closed, no-pgvector is enforced by the CNPG extension set +
import guard. Testable rules are testable: CAS under `go test -race` (AD-2), cycle rejection at
write (AD-4), bytes=0 cross/intra-tenant isolation probes (AD-3), "consolidate an open item →
rejected" (AD-5), "grant can't cross namespace" (AD-9). Two soft spots: AD-1 reads as a scope
declaration rather than a lint (acceptable — it's enforced by separate repo/DB/namespace), and
AD-10's *in-repo* adapters (KG interop, Claude memory-tool) rely on a review-only forbidden edge
where MCP/CLI get physical isolation (L8).

### 3. Nothing under Deferred lets two units diverge NOW — **PASS**
Each Deferred item defers a future consumer (as-of query engine — bi-temporal columns are fixed
now, AD-6), a single-epic artifact (interop mapping table — golden-fixtured in one adapter epic,
direction/authz fixed by AD-10), a display toggle (short-id in console — ids exist either way),
a dimension-agnostic seam (quota dimensions — one `quota` evaluator, keys resolved with billing),
or a measured-later number (numeric SLOs — topology fixed, spike gates the number). Workload
shape defers cleanly (shape doesn't change Go code). The one soft edge: AD-11 defers learning-loop
convergence with the Librarian and asserts "feedback/adherence events share compatible envelopes"
without pinning that shared schema in contracts now — a later additive merge depends on a
compatibility that isn't yet enforced (L5, cross-spine).

### 4. Named tech is verified-current (vs version-pins.md) — **PASS**
Every pinned Go-service version matches the pin sheet: go1.26.5 (clears the CVE floor the
foundation rollup set at 1.26.4), pgx v5.10.0, PG18/CNPG v1.30.0 (no pgvector — consistent with
AD-3), testcontainers-go v0.43.0, Temporal server v1.31.2 / Go SDK v1.46.0, `memory_20250818`,
`@modelcontextprotocol/server-memory` 2026.7.4, spec 2025-11-25 with the "2026-07-28 is RC — do
not pin" caveat internalized verbatim. Lib-inherited deps (franz-go, OTel, Redis, migration tool)
are reasonably left to the lib. Only unverifiable item: the TS MCP repo's `@modelcontextprotocol/sdk
^1.29` and `zod 4` aren't on the pin sheet (which scopes the Go services) — confirm against
studio-mcp's lockfile (L6).

### 5. Ratifies rather than contradicts brownfield family reality (vs canon-distilled.md) — **PASS (strong)**
The two headline collisions are resolved the right direction — canon wins over the PRD's stale
text:
- **Collision #1 (`studio.memory.*` reserved for the product, producer `orvex-studio-api`):**
  resolved by AD-7 minting a *new* subdomain `studio.workgraph.*` and leaving `studio.memory.*`
  untouched. (But see M1 — the new-producer question isn't reconciled.)
- **Collision #2 (pgvector vs P5/ADR-0014 "Turbopuffer is the sole vector store"):** resolved by
  AD-3 shipping *no* pgvector and routing the semantic leg through knowledge's Turbopuffer via a
  P9 source-adapter — a stronger, more canon-aligned reading than a service-local Turbopuffer, and
  cited to the PO ruling. The double-authz (source acl_primitive + ranking re-filter) and bytes=0
  probes bind it.
Kafka-not-Redpanda (P2), no-fallbacks/Ruling-5 hard cuts, cell-local (ADR-0011), no cross-DB
(ADR-0015, wiki-worthy via `stagingclient`) are all honored. Where it under-ratifies: it flags
the `pkg/obs` stub but is silent on the two *more* load-bearing brownfield facts — the
`pkg/auth.Verify` stub and knowledge being a scaffold (M2).

### 6. Driving spec's capabilities are covered (PRD FR-MEM1–27, NFR-MEM1–7) — **PASS**
Spot-check of the Capability→Architecture map: all 27 FR-MEM and all 7 NFR-MEM are placed on a
home tier and a governing AD; no orphan. The one large delta is sanctioned: FR-MEM21/22 (migrate
the built `/v1/memory` store) is rescoped to "tool-description repoints only" per the PO
rename + FormSpec-split ruling (user-memory stays product-side, workgraph starts empty) — the
spine reflects the ruling and flags the PRD-text amendment as a correct-course edit rather than
silently dropping it. FR-MEM8 (workgraph's own Remembered Facts) and the product-side user-memory
are cleanly fenced by the `memory`-word reservation + separate namespace/store, so nothing
collides and nothing is orphaned. PRD §5 non-goals are restated as fences in AD-1. Minor:
templates (FR-MEM26) are mapped to `graph` and ER-modeled but AD-4's rule text governs gates/
dispatch, not template instantiation (L9).

### 7. No new AD weakens or contradicts an Inherited Invariant — **PASS**
Every AD is consistent with or strengthens its inherited invariant. AD-3/AD-9 strengthen P5/P8/P9
and ADR-0014. AD-5's in-service `cmd/reaper` does not violate P6 (a periodic reconciliation tick
is not a Temporal worker — the `cmd/orphansweep` precedent is cited; the durable consolidation/
compaction schedules correctly live in workflows). AD-5's LLM path is bound to the no-train/
EU-resident/zero-retention config (NFR-MEM7). The 0.98-cosine intra-batch dedup is coherent with
"no pgvector": embeddings are transient via `orvex-studio-ai` and durable top-k is via knowledge —
no local vector store implied. No contradiction found.

### 8. Every altitude-owned dimension decided/deferred/open — esp. operational envelope — **PASS (with low gaps)**
Data, interface, auth, quota, events, observability, tracing, tenancy, secrets, config, CI/CD are
all decided or deferred. The operational/environmental envelope is addressed but **scattered**
across Conventions + Deferred + Structural Seed + inheritance rather than consolidated, which is
where the low findings cluster: (a) the spine never states workgraph's public-host posture — it is
almost certainly cluster-internal (MCP/CLI front it; step-APIs are `/internal/*`; cell-lint 1),
but the URL/host dimension (86CiGucQwU) is left implicit (L2); (b) "workload shape per binary"
is deferred wholesale though P7 already determines `cmd/api` and `cmd/relay` as Deployments —
only `cmd/reaper`'s shape is genuinely open (L3); (c) tenant-move (cell-lint 10) is inherited and
the manifest covers workgraph's own stores, but the outbox-drain + knowledge re-projection
ordering on a move is unaddressed (L4). None is fully silent — each dimension is reachable via
inheritance or deferral — so no dimension rises to a hard finding, but the envelope would be
stronger consolidated into an explicit Deployment/Environments/Operations treatment.

### 9. Diagrams valid mermaid; frontmatter coherent; no template residue — **PASS**
Both diagrams parse: the `flowchart LR` dependency graph (subgraph, edge labels incl.
`/internal/* step-APIs` and `studio.workgraph.*`, cylinder `SPINE[(studio-spine)]`, middot-
separated `DOM` label all valid) and the `erDiagram` (cardinality glyphs, quoted/unquoted
labels, underscored entity names all valid). Frontmatter is coherent: `name` matches the service,
`binds` matches the PRD's FR/NFR ids, `sources` cites the PRD wiki id + ADRs + version-pins + the
PO rulings, `companions` points at the staging spine, `scope` records the rename lineage. The
only bracketed tokens are intentional `[ASSUMPTION: …]` / `[ADOPTED …]` markers (matching the
PRD convention), not template placeholders. No `TODO`/`TBD`/`{{…}}`/comment scaffolding.

---

## Findings register

### Critical — none
### High — none

### Medium

**M1 — `studio.workgraph.*` change-authority: "all additive lane" is asserted without reconciling
ADR-0010 D4's producer binding.** AD-7 declares the new subdomain, its types, payload schemas,
topic-domain addition and source-adapter entry are "all additive lane." But ADR-0010 D4 binds the
`studio.*` namespace producer to `orvex-studio-api`; `orvex-studio-workgraph` is a *new* producer.
canon-distilled explicitly advised, for exactly this shape, "additive via P9 source-adapter **BUT**
confirm the producer-binding read with contracts." A new producer for a `studio.*` subdomain may be
the ADR-gated reshaping lane (ADR-0008: "ambiguity resolves to the ADR lane, fail-safe"), not the
automated lane. *Fix:* cite the basis that a new `studio.*` producer via a P9 source-adapter is
additive (P9 + the PO rename ruling likely sanction it), or route the producer-model extension
through an ADR. This governs the change-authority of the service's entire event surface, so it must
be settled before contracts authoring, not discovered at drift-gate.

**M2 — Two load-bearing dependencies are non-functional today and unflagged, and one lacks a
confirmed consumer contract.** The spine flags the `pkg/obs` stub ("wiring is early scope") but is
silent on two more critical brownfield facts from the foundation rollup / deployment status:
(a) `orvex-studio-lib/pkg/auth.MultiIssuerVerifier.Verify()` is still a deny-by-default stub — the
security ceiling AD-9's caller verification rests on; (b) `orvex-studio-knowledge` is a scaffold
(healthz+501) — the entire AD-3 semantic leg and the AD-7 console fleet view depend on it. Related:
AD-3 assumes knowledge exposes a *principal-scoped, acl_primitive-narrowing* query API to platform
services (grounded in P8), yet ADR-0013 OD-7 removed the MCP gateway's direct knowledge client
("reaches knowledge via wiki-api and ai") — so a direct platform→knowledge query client should be
explicitly reconciled/confirmed, not assumed. *Fix:* name the auth-verifier port-in and the
knowledge-query contract as hard sequencing gates (the retrieval spike implicitly exercises the
latter — make it explicit); the "don't hand-roll auth" invariant is correctly inherited, but the
blocking status belongs in the spine's dependency/gate ledger next to `pkg/obs`.

### Low

- **L1 — Migration tool unnamed.** Convention fixes `NNNN_name.sql` forward-only + advisory lock +
  RLS in `0001` (good), but not the tool (golang-migrate / goose / atlas per version-pins §12);
  name the family standard or state it's inherited, so two epics don't pick differently.
- **L2 — Public-host posture silent.** The URL/host dimension (86CiGucQwU) is never decided;
  workgraph is almost certainly cluster-internal (MCP/CLI/step-APIs front it), but state it.
- **L3 — Workload-shape defer over-broad.** P7 already determines `cmd/api` and `cmd/relay`
  (Deployments); only `cmd/reaper`'s shape is genuinely open — tighten the Deferred line.
- **L4 — Tenant-move cross-store ordering.** cell-lint 10 manifest covers workgraph's own stores,
  but the outbox-drain + knowledge re-projection sequencing on a move is an open question worth
  naming.
- **L5 — AD-11 "compatible envelopes" not pinned.** The later workgraph↔staging learning-loop
  merge is promised "additive" on the strength of a shared envelope that isn't authored in
  contracts now; pin it (cross-spine) or the promise is unenforced.
- **L6 — TS deps unverified vs pin sheet.** `@modelcontextprotocol/sdk ^1.29` and `zod 4` aren't
  on version-pins (Go-service-scoped); confirm against studio-mcp's lockfile.
- **L7 — Rate-limit enforcement point underspecified.** AD-4 names per-tenant rate limits as the
  noisy-neighbor control but not where enforced (edge/gateway vs in-service quota).
- **L8 — In-repo adapter store-isolation is review-only.** MCP/CLI can't import the store
  (cross-repo); the KG-interop and Claude memory-tool adapters need a package-level import lint to
  match, since the forbidden edge is otherwise review-enforced for them.
- **L9 — Templates (FR-MEM26) lack a governing invariant.** Placed in `graph` and ER-modeled, but
  AD-4's rule governs gates/dispatch, not parameterized template instantiation / pre-wired-edge
  cycle rejection; low divergence risk (single domain) but the rule is thin.

---

## Bottom line
A strong first-draft spine — the hard problems (namespace collision, vector-store doctrine, authz
chokepoint, hot-path purity) are decided correctly and enforceably, and the map is complete.
Address M1 (change-authority reconciliation) and M2 (dependency/contract gates) before epics
authoring against the contract seam; the lows are polish that tightens the operational envelope.
