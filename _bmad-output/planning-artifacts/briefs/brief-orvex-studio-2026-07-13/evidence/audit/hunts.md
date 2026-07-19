# Two hunts — Orvex Studio brief audit (2026-07-13)

## Hunt 1 — the "Phase 1 reconciliation" page

**The link.** The canonical Vision (`orvexstudio` / `orvexstudioarch`... actually space `orvexstudio` &
mirrored copy in `OPS`, slug `CSqjqciAX9`) "See also" section links three
pages, the third being:

> Phase 1 reconciliation (what changed and why): → mention slugId `ApOYJwtWnK`

**Resolved.** `ApOYJwtWnK` = **"What We Will Not Build"**, space `OPS`,
`https://docs.eu-central-1.myidp.cloud/s/OPS/p/what-we-will-not-build-ApOYJwtWnK`.

Confirmed this is the *intended* target, not a mislink: the same slugId is
independently cited the same way from two other OPS pages —
`PuZLHOWOT9` ("Orchestration Plan") glosses it as *"Phase-1 reconciliation /
what we will not build"*, and `HD9ky5WSVU` ("Pivot — Staging Area") calls it
out for "full reconciliation" of the pre-pivot non-goals. So "Phase 1
reconciliation" is this team's working nickname for the non-goals page,
because it's the page that absorbed the pivot's edits to the non-goals list.

**What it rules (content).** A short non-goals list, current as written:
- Deferred to Phase 2+: company/project layers + RLS/multi-tenant isolation,
  team shared knowledge + light governance (paid SMB tier), real-time
  recommender, second vertical.
- Deferred to Phase 3: community marketplace/trust badges, multi-vertical open
  marketplace, enterprise tier (SSO/compliance/audit/verified catalogues).
- Deferred to P∞ (developer product): typed slot model, git-native CLI
  compiler, expert mode, developer API/SDK, provenance ribbons.
- Permanently out: being a runtime/AI gateway, free-form AI generation as
  default, regulated sectors at launch, vendor lock-in features, a Kanban
  board (tiny "My skills" list only).

**Status problem (the real gap).** The page is `status: superseded` and its
parent is the `OPS` **Archive** node (`cgaZbPaQfK`), whose own banner reads:
*"retired history... kept for provenance only — not current, excluded from
grounding."* So the canonical, still-live Vision cites, as one of only three
"see also" links, a page that is (a) not canonical, (b) parked under Archive,
(c) explicitly excluded from RAG grounding. Anyone (human or AI-via-RAG)
following that link from the Vision either gets a superseded-page warning or,
via retrieval, nothing at all.

**Contradiction / drift vs. the brief:**
- No hard content contradiction — the non-goals list is *consistent* with the
  brief's Scope §Out (team/shared curation v1 minimally team-aware only,
  regulated sectors, community marketplace trust badges, developer product
  deferred, free-form generation as default out, auto-disposition without
  confirm out by principle). The brief's Out-list appears to trace straight
  back to this doc.
- One line item is missing from the brief that this page still carries: **"no
  Kanban management board (tiny 'My skills' list only in Phase 1)."** Minor,
  cosmetic, but it's a genuine non-goal in canon that the brief's Scope
  section never restates.
- Bigger miss: the brief never flags that its own citation trail runs through
  an archived/superseded/non-grounded page. Given the brief's own posture on
  fake-done / observed-vs-reported ("Done is an observed pass, never a
  reported one"), a "see also" pointer that resolves to excluded-from-RAG
  content is the same category of problem in miniature — a canon page
  claiming a live reference that isn't actually live.
- The Vision's own gloss — *"what changed and why"* — overstates what
  `ApOYJwtWnK` actually contains. The real "what changed and why" narrative
  (the W2/W3/W6/W10 reopen/soften/rewrite decisions forced by the pivot) lives
  in `HD9ky5WSVU` ("Pivot — Staging Area"), itself ALSO superseded (superseded
  by `WA9A1sEol7`, "Product Brief: Orvex Prompt Studio"). `ApOYJwtWnK` itself
  is just the resulting non-goals list, with no "why" narrative attached.
  So the three-page citation chain a reader must actually walk to get "what
  changed and why" is: Vision → `ApOYJwtWnK` (superseded, archived, list only)
  → cross-reference to `HD9ky5WSVU` (superseded, has the "why") → `WA9A1sEol7`
  (the actual current successor). None of that chain is visible from the
  Vision's one-line link text.

**Recommendation (not actioned, audit only):** the Vision's "see also" line
should either point at a canonical successor page that actually carries the
non-goals + the why, or be re-labeled to make clear it's a provenance-only
archive pointer. Follow-up owed, not fixed here.

## Hunt 2 — strays in the `general` space

Ran `docmost-cli cache sync --space general --wait` (full resync, completed
clean) then `docmost-cli page list --space general --output json`.

**Result: the `general` space has zero pages.** `{"items":[],"truncated":false,"next_offset":null}`
after a fresh full sync — not a stale-cache artifact. Confirmed the space
itself exists (`docmost-cli space list` shows `general` / uuid
`019e1776-1c3f-763d-a88f-2b0e5dbbda81`, name "General").

**No strays found.** Nothing to skim, nothing Orvex/Studio/wiki-product-shaped
to fetch. This hunt is a clean negative — the `general` space is not where any
brief-relevant content, current or orphaned, has landed.
