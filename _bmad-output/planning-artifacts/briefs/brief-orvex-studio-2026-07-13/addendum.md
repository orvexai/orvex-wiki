---
title: "Addendum — Product Brief: Orvex Studio"
status: draft
created: 2026-07-13
updated: 2026-07-13
---

# Addendum — Product Brief: Orvex Studio

Depth that earned a place but belongs downstream (PRDs, architecture, contract
design), not in the brief. Evidence receipts live in `evidence/`.

## 1. New-to-canon feature seeds (for their future PRD sections)

### Outbound memory sync
- Concept: optionally sync Orvex Memory OUT to the native memories of the chat
  systems the user uses (ChatGPT, Claude, Gemini, Grok). Rationale (Daniel,
  2026-07-13): "what they have saved in their memory is better for them than
  relying on our memory." Orvex = master copy; vendor memories = replicas.
- Product angles: makes the "un-lock-in layer" literal; pairs with import to
  form a full bidirectional story (import once, sync forever).
- **Tier: FREE (ruled 2026-07-13)** — zero cost to us; giving it away builds
  trust. If a per-vendor AI-assisted distillation/formatting slice emerges,
  that slice may tier; the core sync is free.
- Per-vendor state (audit, 2026-07-13): Claude has a native memory-tool
  backend adapter (FR-MEM27, v1); **OpenAI/ChatGPT is platform-blocked** (no
  memory API); MCP-KG interop (FR-MEM16) is the universal read/write fallback
  — any MCP-capable tool can reach the workgraph/memory surface.
- Open: sync granularity (all Memory? curated subset?); private memories
  presumably excluded by default; conflict policy when a vendor-side memory
  diverges.

### Prompt Composer — per-piece attribution (audit find — rejected as default UX)
- Per-piece attribution inside the assembled prompt ("this line came from your
  Memory, this from the skill, this from your tweak") is an **empty
  competitive slot — 0 of 18 surveyed tools do it** (OPS `JDvrKcC0Gp`).
  **PO ruling 2026-07-13: rejected for the composed output** — attribution
  stamped into the assembled prompt is UX-hostile and of doubtful value. The
  legibility need it points at is already served by the teaching editor
  (structure visible, every piece labelled and touchable at edit time); the
  composed prompt stays clean. Do not carry source labels into the assembled
  output or the default view.

### Wizard-driven task-first prompt builder (ruled in 2026-07-13)
- Say the task; the wizard interviews you ("do you want this?"), scans
  marketplace prompts, and composes the best prompt for the task from
  marketplace skills + Memory/wiki context via RAG — task-first instead of
  catalog-first search.
- Tension managed: canon's "generate-by-selection, not free-form" constraint
  holds as the DEFAULT (the curated shelf); the wizard is a guided,
  marketplace-grounded alternative — pure unguided free-form generation stays
  out. The Vision re-ratification bundle carries the rewording.
- Open: tier placement (a frontier-AI interview is paid per the cost doctrine;
  a cheap-model variant may clear the free bar); wizard question design; the
  recommend-existing-skill vs compose-new threshold; whether wizard outputs
  land as saveable skills (likely yes — feeds the marketplace flywheel).

### Orvex rating — every prompt scored (ruled in 2026-07-13)
- Like a film rating on the catalog: every marketplace prompt carries an Orvex
  rating computed from multiple factors — structural quality (how well-built
  the prompt is, machine-scorable against the same "what good looks like" the
  teaching editor teaches), popularity/usage (live-data-only, per the POC's
  shipped usage-tracking mechanics), and user upvotes — an upvote naturally
  increases the rating.
- Sits beside the ruled-in gated reviews + transparent reputation ledger;
  distinct from the deferred trust badges (a computed quality score, not an
  identity/endorsement construct) — keep that boundary explicit in the PRD.
- Open: scoring formula + weights; gaming resistance; whether the rating gates
  catalog placement/ranking; recompute cadence; whether structural scoring
  runs on a cheap model (our infra cost — not user-tier-gated).

### Private memories + per-use consent
- Concept: memories flaggable private; shown as private in every surface; a
  prompt-enrichment (Prompt Composer, Ask-your-wiki) that would use a private
  memory requires an explicit per-use opt-in.
- Extends the Librarian's capture-time sensitivity gating (AI-classified +
  user-taught, fail-safe) into consumption-time consent.
- Open: opt-in UX (per-prompt? per-session? remembered-for-this-skill?);
  whether private memories are excluded from outbound sync (recommend: yes,
  hard default); whether beads can ever carry private-classified content.

### Librarian preference & autonomy system
- Concept: the Librarian learns curation rules from teaching-by-prompting (what
  to save/skip, how the user likes their data) and gains autonomy on obvious
  calls. User-preference spectrum: confirm-everything → auto-when-confident →
  fully automated. Tidiness is an invariant at every dial position — no mess,
  no duplicates, even at full auto. Preference profiles include
  private-by-default for the security-conscious.
- **RULED (Daniel, 2026-07-13):** full-auto = the Librarian auto-approves the
  obvious, non-destructive placements; edits, deletes, and sensitive items are
  ALWAYS gated, at every dial position. The principle shifts from "never auto"
  to "auto never acts destructively or on sensitive items without eyes."
  **Follow-up owed:** amend *Product Brief: The Librarian* (`fr7YaPq8Tl`) —
  its Scope "out" line and Resolved Decisions table — to carry this ruling
  (route via doc-amend when this brief is published).

### Free-tier cost doctrine (pricing refinement)
- No frontier models anywhere in the free tier; very cheap models permitted for
  basic tasks; free/near-free embeddings and other ~zero-marginal-cost quick
  wins are INCLUDED free — the free tier should be as powerful and amazing as
  possible without incurring meaningful AI cost.
- Consequence: the free/paid boundary is marginal AI cost, not "AI vs no AI"
  categorically — a refinement of the 2026-07-12 session capture's "full
  functionality without AI" framing.
- Open: which capabilities clear the bar (cheap-model Librarian triage? local/
  free embeddings for RAG? dedup heuristics?); model-tier routing policy per
  feature; cost-guardrails so a "cheap" path can never silently upgrade.

### The beads→Librarian promotion edge
- Concept: the Librarian monitors the beads stream and proposes promotions
  into staging → Memory/wiki. Layers are NOT parallel; there is one upward
  path, and it runs through the same propose-and-confirm gate as everything.
- Contract implication: workgraph emits (or exposes a read surface over) the
  narration stream; staging consumes. This edge exists nowhere in canon
  (ADR-0025 split the stores but defined no bridge) — it needs a filed
  contract + an ownership ruling (who runs the fishing logic: staging's
  Librarian engine reading workgraph, or workgraph pushing candidates?).

## 2. Beads — concept grounding (from ~/repos/beads, digested 2026-07-13)

- Upstream framing: "persistent, structured memory for coding agents… a
  dependency-aware graph" — a "distributed graph issue tracker for AI agents."
- The free-narration stream Daniel means = the `bd comment` pattern
  (unstructured, timestamped "working on this now" appends), distinct from
  `bd remember`/`bd recall` (durable cross-session facts, injected by
  `bd prime` at session start) and from structured machine Events.
- Mechanics worth borrowing conceptually: ready-work derivation (no open
  blockers), compaction as "semantic memory decay," prime-time context
  injection, ephemeral never-synced wisps (agent-private traces).
- Deliberately dropped (already ruled in workgraph canon): the entire
  decentralized apparatus — hash-based collision-proof IDs, Dolt cell-level
  merge, federation — exists only so disconnected clones converge; a
  centralized single-writer store uses sequential IDs and transactions.
- Naming note: user-facing name "beads" vs canon service name workgraph vs
  the memory-product naming collision — resolve in the P1 "memory
  disambiguation" ruling before any UI copy ships.

## 3. Audience tension — the full picture (for the wedge ruling)

- Canonical Vision (`CSqjqciAX9`): Phase 1 = ONE non-technical profession,
  named candidates: estate agents / SMB marketing; developer product deferred.
- Draft artifacts pointing broader/consumer: Value-Prop workshop ("teachers,
  lawyers, parents… ordinary people, not techies"); Target Groups (canonical!)
  ranking Priya (consumer, cold first-timer) PRIMARY; Laura Pendleton
  persona-discovery (teacher, adoption-likelihood High); demo-data plan
  (teacher/doctor/parent — NB: persona boards say teacher/lawyer/parent, an
  unresolved mismatch); pricing framing (£5–7 consumer slot).
- Reading: the center of gravity has already drifted consumer-ward since the
  Vision was ratified; the artifacts younger than the Vision all point the
  same way.
- **RULED (Daniel, 2026-07-13):** teachers = launch wedge; "for everyone
  non-technical" = the story. **Follow-up owed:** re-ratify the canonical
  Vision (`CSqjqciAX9`) Phase-1 paragraph via doc-amend + doc-ratify when this
  brief is published. Bundle canon hygiene into the same pass: the Vision's
  "see also" cites the superseded `ApOYJwtWnK` ("What We Will Not Build",
  parked in the OPS Archive, RAG-quarantined) with an overstated gloss —
  repoint or drop the link (audit §4).

## 4. Demo data — ~8 persona versions (ruled 2026-07-13)

Daniel: demo data ships **around 8 different persona versions** (up from the
three launch personas in the session capture). Teachers first per the wedge
ruling. PRD-time reconciliation required: the onboarding research recommends
persona self-selection into exactly **3** pain-framed tracks because tour
completion collapses past ~4 steps — 8 datasets must not become 8 tour steps.
Likely shape: one self-selection step offering ~8 datasets, skippable with a
default. Related PRD-time devices (audit): the **Demo World** aha-mechanic
with visible enrichment citations (FR-UI20) and the demo-data **graduation
model** (flagged-rows vs isolated demo-tenant — `qTF4fTd1Wb`) — decide there,
not here.

## 5. Pricing strawman (presented 2026-07-13 — superseded same day by locked-canon adoption)

**2026-07-13 rulings:** locked canon adopted — consumer paid = **£7/mo** (not
£5–7), Teams **£70** framing, GBP-only, hidden Enterprise, Teams-teaser, free
caps 200 pages / 1 GiB / 2,000 files / 25 members. The 10-lifetime-action
free-AI trial is **superseded by the cost doctrine** (cheap AI free forever;
frontier-taster redesign open; billing/ai canon amendments owed before contract
freeze). Marketplace core social layer (forking-with-lineage, gated reviews,
reputation ledger) IN; creator profiles + following-graph deferred. **Trial
mechanics RULED (same day):** no card required — the standard free month simply
downgrades to free at the end; canon's card-required 7-day trial is superseded
(billing amendment owed). Table below kept as the session's working artifact:

| Tier | Who / why | Composition |
|---|---|---|
| Free — forever | Consumer; the name-on-the-map + trust engine; never crippled | Full manual loop: MCP/CLI capture into staging, Librarian ritual with ~zero-cost assistance (cheap-model triage, free/near-free embeddings for search & dedup), wiki + Memory in full, manual chat-export import, **outbound memory sync**, marketplace + manual composition — plus everything else that costs us nothing |
| Consumer paid — £5–7/mo | Where frontier AI costs us per use | Full-power Librarian (rich proposals, auto-when-confident, full-auto), AI distillation on import, Ask-your-wiki, AI-enriched Prompt Composer, Improve-with-AI; free month standard |
| Teams | Business; the money; shared governed knowledge | Professional at-scale UI, governance models (moderator-permissioned · self-curate · mix), admin, shared spaces; seat price open |
| Enterprise | Later; planned-in | SSO / compliance / isolation / custom quotas; deliberately unspecified |

Boundary logic: free↔paid = **marginal AI cost**; consumer↔business =
**collaboration + governance**; business↔enterprise = **compliance + scale**.
Same microservices under all four; differences ride UI + entitlements.

## 6. Pricing — working decisions vs open items (coaching queue)

- Working decisions (session capture, 2026-07-12): free for individuals
  forever, full functionality without AI, "never crippled"; AI features =
  paid tier £5–7/mo ("AI curation costs us per use — not lock-in"); schools/
  teams = the paying tier for shared/governed knowledge; free month of paid
  as standard onboarding; "lead with the free/paid split and price within the
  first two turns" (the Laura lesson).
- Free-tier cost doctrine (2026-07-13): see §1; no frontier models in free;
  ~zero-marginal-cost AI (cheap models, free embeddings) allowed and encouraged
  in free; boundary = marginal AI cost.
- Open: exact price point in £5–7; package composition per tier (what exactly
  is "AI features" — Librarian ritual? Composer? import distillation? outbound
  sync?); which capabilities clear the ~zero-cost bar for free; import tiering
  ("manual free / AI auto-distil paid" is likely, not confirmed); teams tier
  scope + governance models; workgraph/staging pricing dimensions (flagged open
  in both canons); Enterprise wiki quotas.

## 7. Ownership map + contested seams (carried from evidence synthesis)

- Memory (user-facing FormSpec product) → orvex-studio-api `/v1/memory`.
- Agent memory / beads → orvex-studio-workgraph (explicitly NOT the memory
  product, ADR-0025).
- Retrieval/RAG + corpus isolation → orvex-studio-knowledge (isolation grade
  open: attribute-scoped vs per-user namespace wall).
- The Librarian → orvex-studio-staging (supersedes BFF Curator; Curator still
  live in the monolith until cutover — double-ownership window).
- Contested: Clerk lifecycle (identity vs workflows); console's workflows
  proxy (un-chartered); chat-import UX (api) vs indexing (knowledge).

## 8. Six-surface acceptance protocol (condensed; full: evidence/migration-assessment.md §4)

Fresh tenant + real identity-minted token + real data on the dev cell, human-
observed, per surface: **api** (save/get/block-patch edit with `ifVersion` →
409 on stale, correct receipts) · **mcp** (real page mutation via tool over
`/mcp`, tool parity → 73) · **cli** (byte-faithful DfM round-trip through the
`/v1` grammar) · **ai** (cited-ask with delegated-token retrieval + inline-edit
writeback, ACL respected) · **rag** (tenant-namespaced, ACL∩token-scope
filtered hybrid results; two callers, different hits) · **knowledge-sync**
(mutation → outbox CloudEvent → Kafka → indexed → searchable within SLA, with
an end-to-end message trace; `TestM5KnowledgeE2E` genuinely green on merged
code). Plus cross-cutting: session exchange fail-closed; 402 QUOTA_EXCEEDED on
REST and collab paths; single-host ingress = zero client URL change.

## 9. Evidence index

- `evidence/current-state-map.md` — 16-service rollup, concept-to-service map,
  top-10 doctrine risks, 18 prioritized research questions.
- `evidence/migration-assessment.md` — the wiki-migration verdict + protocol.
- `evidence/<space>.md` × 17 — per-space digests (mandate, inventory, decided
  vs draft, contract surface, delivery state, gaps).
