---
title: "Product Brief: Orvex Studio"
status: draft
created: 2026-07-13
updated: 2026-07-13
---

# Product Brief: Orvex Studio

> The umbrella brief: the big picture of everything Orvex Studio is becoming — the
> three-layer context system, the Librarian, the Prompt Composer, the wiki, the
> cross-AI sync — and the delivery doctrine that turns a 16-service program into
> something buildable in isolation and provable end-to-end. It sits above the
> canonical Vision (`CSqjqciAX9`), the service PRDs, and *Product Brief: The
> Librarian* (`fr7YaPq8Tl`); it restates none of them — it stitches them and adds
> what was decided in this session. Companion detail lives in `addendum.md`;
> evidence receipts in `evidence/`.

## Executive Summary

AI hands everyone a torrent of valuable output — and then forgets them. Every
assistant is amnesiac about who you are; everything you learned together dies in
chat scrollback; and whatever one vendor's memory does retain is locked to that
vendor. Orvex Studio is the answer: **the AI Prompt & Knowledge Manager that
makes every AI you use finally know you** — the most amazing, easy-to-use memory
system in the world for non-technical people, doing all the heavy lifting for
them.

The product stands on a **three-layer context system** maintained almost entirely
without user effort: **Memory** (curated facts — your RAM), the **wiki** (kept
knowledge — your HDD), and **beads** (the live, uncurated stream of agents
narrating their work). **The Librarian** is the maintenance crew — capturing from
every AI via MCP/CLI, fishing keepers out of the beads stream, importing your
ChatGPT/Claude history, and filing everything through a propose-and-confirm
ritual. **The Prompt Composer** is the payoff — a marketplace skill plus your
tweaks plus your three layers of context, composed into an expert-grade prompt
for *any* AI. And because Orvex is the un-lock-in layer, your memory **syncs
outward** to the native memories of the assistants you already use.

Orvex Studio already exists as a shipped, live proof: the Phase-1 monolith closed
15/15 milestones and 83/83 stories on 2026-07-02. The program now underway is a
double migration — the monolith *and* the wiki engine strangled into a 16-service
family — and its current state is: design canon mature, satellite code real and
deployed on one dev cell, **nothing proven end-to-end and nothing live in
production**. This brief locks the big picture and the delivery doctrine, and
charters the research phase that must run before contract-frozen isolated builds
can start.

## The Problem

**For people:** knowledge from AI conversations is abundant and unusable at the
same time. There is no filing system (and no two people want the same one); the
hard part is the *decision*, not the saving; each vendor's memory is opaque,
unportable, and theirs rather than yours; and non-technical users — teachers,
marketers, small-business owners — never get expert-grade results because
prompting well requires knowing things they shouldn't have to know.

**For the program:** the product story above is scattered across a live monolith,
16 service canons, and one three-day-old coordination service — with the
connective tissue (contracts, shared auth, event spine) the weakest part. The
delivery risk is not building the pieces; it is that the pieces have never been
proven to work as one.

## The Product — the big picture

**North star:** *your AI finally knows you.* Context is the product; prompts are
the payoff surface.

**The knowledge loop:**

1. **Intake — three routes into the Librarian's staging area.**
   - *Explicit saves:* Orvex exposes an MCP (and CLI) that any AI agent can save
     to. Every Orvex-composed prompt carries a standing instruction — "any memory
     you learn about the user or the business, anything important, save it to the
     librarian staging area" — so capture is ambient, engineered, and never
     dependent on agent goodwill (user-pull floor per the Librarian brief).
   - *Beads monitoring:* the Librarian watches the beads stream and fishes out
     the keepers. Nothing important dies in scrollback — not even your agents'
     scrollback.
   - *External import:* one-off import of ChatGPT/Claude/Gemini/Grok exports,
     distilled through the same propose-and-confirm gate (the Phase-2
     Chat-History Import, reusing the Librarian pipeline as bulk backfill).
2. **Curation — the Librarian ritual.** Propose-and-confirm, diff before every
   destructive change, structure learned not templated (per the ratified
   Librarian brief — its 11 decisions stand unmodified here).
3. **The stores — a memory hierarchy.** **Memory** holds curated facts: small,
   fast, always-on — RAM, even CPU cache. Memory's own surface carries the
   flagship bar too: a legible, navigable portrait of what Orvex knows about
   you — it must look good *and* work. **The wiki** holds kept content —
   research, recipes, documents; everything worth keeping that doesn't warrant
   Memory — the HDD. **Beads** is the volatile working set: unstructured,
   dynamic, shared by all your agents, deliberately uncurated.
4. **Consumption — the Prompt Composer.** Marketplace skill + plain-language
   tweaks + Memory + wiki knowledge (retrieved via RAG over Turbopuffer —
   retrieval is a mechanism here, never a fourth store) composed into a prompt
   that works in any AI. Ask-your-wiki draws through the same retrieval. The
   **prompt editing experience is a flagship quality bar [RULED 2026-07-13]**:
   the most amazing prompt editor in the world — really easy to understand,
   really easy to use, with Improve-with-AI woven in. The editor *teaches*:
   the structure is visible, every piece labelled and touchable, with clear
   example prompts showing how it will be used — it tunes non-technical users
   into understanding what a good prompt is and writing their own. The POC's
   Skill Viewer/Builder is the substrate, not the standard — substantially
   improved, not inherited. And composition is **task-first as well as
   catalog-first [RULED 2026-07-13]**: a wizard-driven builder — say what you
   want done, it interviews you ("do you want this?"), scans the marketplace,
   and composes the best prompt for your task from marketplace skills plus your
   Memory/wiki context via RAG — instead of making you hunt for a pre-created
   prompt. The curated shelf stays the default entry; the wizard is the guided,
   marketplace-grounded alternative (pure unguided generation stays out).
5. **Outbound — memory sync out.** Optionally, Orvex syncs your Memory to the
   native memories of the chat systems you use: what they hold locally serves
   them better than a remote call to ours. Orvex is the master copy of you;
   every other AI's memory becomes a replica. **Free tier [RULED 2026-07-13]:**
   it costs us nothing, and giving it away builds the trust the product runs
   on. **[NEW — not yet in canon]** Per-vendor reality: Claude ships a native
   memory-backend adapter; ChatGPT is platform-blocked today (OpenAI exposes no
   memory API) — the promise carries per-vendor caveats, with MCP interop as
   the universal fallback path.

**Beads, precisely:** our own implementation of the beads idea — the free-sharing
narration stream (the `bd comment` "working on this now" pattern) as part of our
CLI and MCP, on a centralized store with none of the upstream project's
decentralized hash-ladder machinery (which exists only to merge disconnected
clones). Canon home: `orvex-studio-workgraph` (beads-inspired, ADR-0025).
**User-facing visibility [RULED 2026-07-13]: optionally visible, hidden by
default** — transparency for those who want it; whether it earns consumer-grade
UX is a later decision.
The Librarian's fishing rights over that stream are a **new contract edge**
(workgraph emits, staging consumes) owed to the architecture. **[NEW — the
promotion path is not yet in canon]**

**The Librarian learns you.** Beyond learned structure (already canon), she
learns your curation rules as you prompt and teach her — what to save, what to
skip, how you like your data — and earns autonomy on the obvious calls. The
trust dial runs the full spectrum by user preference: confirm-everything →
auto-when-confident → fully automated. At every position one thing is
non-negotiable: **tidiness is an invariant, not a mode** — no mess, no
duplicates, even at full auto. **[RULED 2026-07-13]** Full-auto means the
Librarian auto-approves the obvious, non-destructive placements; edits,
deletes, and sensitive items stay gated at every dial position. This amends the
Librarian brief's "auto-disposition without a confirm (out by principle)" scope
line — the principle is now *auto never acts destructively or on sensitive
items without eyes* (amendment owed to that page; addendum §1).

**Trust and preferences, throughout:** AI proposes, the human accepts (the
family invariant — now dial-adjustable per the above); sensitive items always
stage; **private memories** are first-class — flagged, displayed as private,
never used to enrich a prompt without an explicit per-use opt-in **[NEW —
consumption-time consent extends canon's capture-time gating]** — and the
security-conscious can flip to private-by-default. Preference depth never leaks
complexity: defaults do the heavy lifting. Protection extends to the boundary:
a **Personal-Data Guard** screens PII before anything reaches a third-party AI,
and AI-privacy setup verifies the connected assistant won't train on your data
— distinct from private memories, which gate Orvex's own enrichment.

## Who This Serves

Non-technical people drowning in their own AI output: the teacher re-explaining
her classes to ChatGPT every morning, the marketer whose best strategy session is
buried in week-old scrollback, the small-business owner who wants AI that sounds
like them. Single-player value first — no community required (Priya, the
canonical primary persona, gets value in under 90 seconds without signup).
Above all: **this is a consumer product first** — friendliness is a hard
requirement, and every trust and preference control must survive contact with a
non-technical user.

**The three-surface arc:** the consumer product is how Orvex gets its name on
the map; the business/teams product is how it makes money; enterprise follows.
All three ride the **same microservices** — the differences live primarily in
the UI (consumer-friendly vs professional-at-scale vs enterprise) and in
entitlements. Phase 1 ships the consumer UI; the business and enterprise
surfaces are planned in from the start, never bolted on. Two nuances the arc
must carry: the **admin/curator/fleet-operator is a first-class job** on the
business surface (bulk review queues, per-space autonomy tuning, fleet
dashboards — real workflows, not a re-skin); and the **account model**
underneath — a solo user runs org-free, and upgrading to Teams mints an org
that carries data and entitlements across a hard personal↔org firewall (new
members never retroactively see pre-upgrade private content).

**[RULED 2026-07-13 — audience]** The product story is **"for everyone
non-technical"**; the launch wedge is **teachers** — Laura is the richest
validated persona and the demo-data work already leads with her. The canonical
Vision's Phase-1 paragraph (estate agents / SMB marketing) is superseded by this
ruling and owes a re-ratification (follow-up logged). The demo-data persona
mismatch (doctor vs lawyer on the boards) resolves at PRD time.

## Where We Are Today (evidenced, 2026-07-13)

- **The product is live** as the Phase-1 monolith (skills, marketplace, Memory,
  Improve, Curator, per-user wiki) — a real substrate, not a greenfield.
- **Design canon is mature:** 31/32 family ADRs canonical; most service
  architectures ratified; the Librarian, staging, and workgraph fully specified.
- **Satellite code is real and deployed on one dev cell** — identity furthest
  (M9 closed), wiki-api Phase-0/1 facade live and catching real defects, knowledge
  wired to Turbopuffer, mcp at ~19/73 tools. This is genuine build progress.
- **But the wiki is not migrated:** production runs deliberately vanilla Docmost
  with the orvex modules OFF; the full microservices path exists only on the dev
  cell (first switched on 2026-07-13); the certifying E2E gate was fake-done'd
  while provably RED (2026-07-12); **no surface has a green, human-verified,
  real-data end-to-end pass.** Verdict: *strong build; not migrated.*
- **The doctrine's foundations are the weakest part:** the contracts repo is ~90%
  unbuilt and unowned with its change-authority contradiction unresolved; the
  shared auth verifier is a deny-by-default stub blocking every Go satellite; the
  Go↔TypeScript bridge is undecided; "memory," the Librarian, and Clerk lifecycle
  each have contested or split ownership.

Full receipts: `evidence/current-state-map.md`, `evidence/migration-assessment.md`.

## Delivery Doctrine — from mess to program

1. **Contracts first, literally.** Resolve contracts ownership + change authority
   (the P3-vs-CS§9 contradiction) as the program's first ruling; then file every
   cross-service seam — wiki-api, knowledge, ai, billing, identity, the new
   workgraph→staging edge — as pinned artifacts with validation CI and golden
   fixtures. No service starts its isolated build against prose.
2. **Build the two shared chokepoints before anything else:** `orvex-studio-lib`
   (auth verifier + codegen) and the Go↔TS client bridge. Everything queues
   behind them.
3. **Isolated builds against pinned contracts** — each service developed and
   tested in its own repo against contract fixtures, sibling services faked from
   golden fixtures (the CS mock-boundary rule already mandates this). Services
   stay **tier-agnostic**: entitlements (billing SoR) switch behavior between
   consumer / business / enterprise; the UI is architected from day one for
   surface variants so "a different UI" never forks the family.
4. **Integrate continuously, not "at the end."** [RULED 2026-07-13] The
   evidence says big-bang integration risk is already maximal: never-run seams, a just-lit event spine, fake-done history on
   the exact gates. The doctrine: the standing dev cell is the always-on
   integration proving ground; every service that reaches a milestone must pass
   the six-surface fresh-tenant E2E protocol *there*, human-verified — "Done" is
   an observed pass, never a reported one (the fake-done antibody).
5. **Testing plans are per-service AND per-seam:** each service's contract tests
   + the cross-service protocol (api / mcp / cli / ai / rag / knowledge-sync)
   defined in `evidence/migration-assessment.md` §4 as the acceptance floor.
6. **Cutover last:** prod module-enablement and the monolith strangle complete
   only after the six surfaces are green on dev with real data.
7. **Launch readiness is its own gate:** the consumer go/no-go tracks the
   readiness assessment's two ADAPT items — Complexity (one-tap AI connect,
   price transparency up front) and Observability (shareable before/after wins,
   since the benefit is otherwise invisible to peers) — distinct from, and
   additional to, the engineering E2E bar.

## The Research Phase (immediate next step)

Objective: retire the unknowns that block contract freezing and isolated builds.
The evidence sweep produced **18 prioritized questions** (full list:
`evidence/current-state-map.md` §5):

- **P0 — blocks the doctrine:** contracts ownership + change authority; file the
  five owed seam contracts; prove the dev cell genuinely end-to-end (starting
  with `TestM5KnowledgeE2E` truly green); build lib; decide the Go↔TS bridge.
- **P1 — ownership rulings:** Clerk lifecycle (identity vs workflows); Curator→
  Librarian cutover sequencing; "memory" disambiguation + corpus isolation; stand
  up the Studio ADR registry (20+ ADRs are queued behind it); console's
  workflows-proxy charter.
- **P2 — pin before cutover:** host-routing form; SSE cursor + `content_pm`
  parity; AGPL/legal posture + Stripe severance; anti-Sybil anchor; deferred
  quota/pricing dimensions; the standalone full-family stack; spec-gate rebuild.

Exit criteria: every P0 closed with a filed artifact or a green observed pass;
every P1 closed with a ruling recorded as an ADR. [RULED 2026-07-13] **No
timebox** — the phase exits on criteria, not on a date; quota-heavy
verification sweeps run during engine pauses.

## Success Criteria

- **Product:** placement-without-regret (the Librarian brief's metric) stays
  primary; context demonstrably reused across ≥2 different AI systems per active
  user [ASSUMPTION — proxy for "your AI knows you"]; private-memory opt-in works
  and is never bypassed; outbound sync adopted by a meaningful share of paid
  users [ASSUMPTION — target TBD with pricing].
- **Program (the Phase-1 definition of done, verbatim):** the wiki fully WORKS
  via every surface — api / mcp / cli / ai / rag / knowledge-sync — all as
  microservices, proven by real end-to-end product-acceptance passes on fresh
  tenants with real data; every seam contract filed and CI-enforced; each service
  buildable in isolation against fixtures alone; prod cutover off vanilla.

## Scope

**In (this program):** the three-layer context system; the Librarian + staging
area (as already ratified); beads v1 (our centralized implementation, CLI + MCP);
Prompt Composer; chat-history import; outbound memory sync (optional; free
tier — zero cost to us); private memories + per-use consent; persona demo-data onboarding with **~8
persona versions** (teachers first, per the wedge ruling); marketplace seeding
(the POC's shipped GitHub import → vet → claim pipeline with its
permissive-license two-gate, carried forward); the Librarian Prompt Pack
templates + scheduled ChangeSet publishing (PO-decided 2026-07-10); the
wizard-driven task-first prompt builder [RULED 2026-07-13]; an **Orvex rating**
on every marketplace prompt — multi-factor: structural quality, popularity/
usage, and user upvotes [RULED 2026-07-13]; the contract/lib/bridge foundations; the
six-surface proving protocol; tiers/Stripe per the **locked pricing canon, adopted [RULED 2026-07-13]**:
free-forever individuals (caps: 200 pages · 1 GiB · 2,000 files · 25 members) ·
consumer AI tier **£7/mo** · Teams (£70 framing) · GBP-only · hidden Enterprise
· Teams-teaser · trial = the standard free month, **no card required — it
simply downgrades to free** at the end [RULED 2026-07-13; supersedes canon's
card-required 7-day trial — billing amendment owed] — and a second
supersession: the 10-lifetime-action free-AI trial is
**overruled by the free-tier cost doctrine [RULED: doctrine wins]**. No frontier
models in free, but ~zero-cost AI (very cheap models for basic tasks,
free/near-free embeddings, every low-cost quick win) is free **forever**; the
frontier-taster mechanic is reopened for redesign, and the billing/ai canon
amendments are owed before contract freeze. The free/paid boundary is marginal
AI cost, not "AI vs no AI" — and **everything that costs us nothing is included
free, because trust is the point** (outbound memory sync included). The
marketplace's core social layer — forking-with-lineage, gated reviews, the
transparent reputation ledger — is **in [RULED 2026-07-13]**.

**Out (unchanged from canon, plus this session's deferrals):** team/shared
curation v1 (minimally team-aware only); regulated sectors; community
marketplace trust badges, **creator profiles + the following-graph** (deferred
to the community wave [RULED 2026-07-13]); the developer product (deferred,
funded by Phases 1–3); free-form generation as default; auto-disposition
without confirm (*re-ruled: auto the obvious; destructive/sensitive always
gated*).

**Open (queued for PRDs):** which cheap-model/free-embedding capabilities clear
the ~zero-cost bar for free; import/outbound-sync tiering detail; the
frontier-taster redesign (the superseded 10-action trial's replacement — likely
simply the free month); the teams seat price detail; beads' product surface
(name, retention — visibility ruled: optional, off by default);
workgraph/staging pricing dimensions.
