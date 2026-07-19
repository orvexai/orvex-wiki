## 🎯 Story

As a **visitor browsing Discover**, I want **near-duplicate/fork clusters collapsed under one representative card with a '+N more' expander**, so that **I see one clean row per topic instead of a wall of near-identical cards, while the original author is never silently buried by a fork** (marketplace §2, §3.1.3).

**Definition of Done:** ONE named test `TestClusterCollapseQueryAwareHeadNeverBuriesRoot` — an integration test asserting: (a) a materialized cluster renders as one card + a '+N more ›' footer that expands inline to independently-countable members, (b) with a query present the displayed head is the highest-blended-score member for THAT query (not always the lineage root), (c) when a fork legitimately out-earns the root the header reads 'top pick — a fork of [Original by octocat]' and the root is still named (never silently demoted), and (d) engaging any trust/freshness/claimed facet or an explicit sort flips the view to flat — Sam's power-user signal. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a materialized cluster (lineage or semantic), When it renders in results, Then it shows one head card with a '+N more ›' (or '+N similar ›' for semantic) footer that expands INLINE to a compact stacked list of members, each with its own independent (often low/zero) counts. *Assertion: collapse renders; expand is inline, no route change.* [Source: POC marketplace-scenario-and-spec.md §3.1.3]
- [ ] **AC2** — Given a search query is present, When head election runs, Then the displayed representative is the highest blended-score member FOR THAT QUERY (DISTINCT ON cluster_id ORDER BY blended DESC) — not simply the lineage root — while Browse (no query) collapses on the lineage root. *Assertion: query-aware head differs correctly from the no-query browse head.* [Source: POC marketplace-scenario-and-spec.md §0-D, §3.1.3]
- [ ] **AC3** — Given a fork legitimately out-earning its parent by a large sustained verification-weighted margin, When it becomes the displayed head, Then the header reads 'top pick — a fork of [Original by octocat]' and the original is never silently demoted from view. *Assertion: co-representative naming always cites the root.* [Source: POC marketplace-scenario-and-spec.md §0-D]
- [ ] **AC4** — Given the collapsed view is active, When the user engages a trust/freshness/claimed facet or an explicit sort, Then the view flips to flat automatically (never requiring a manual toggle for that specific case); the explicit 'Group similar (on)/Show all (off)' toggle is also available directly. *Assertion: power-facet engagement auto-flips to flat; manual toggle also works.* [Source: POC marketplace-scenario-and-spec.md §2 'Toggle behavior']
- [ ] **AC5** — Given a freshly-forked skill, When it is created, Then it collapses under its parent cluster immediately (cluster_id/lineage_root_id set synchronously at fork INSERT — no stray top-level-row race). *Assertion: new fork appears grouped, not as a stray row.* [Source: POC marketplace-scenario-and-spec.md §3.1.6]

## 🔨 Tasks

- [ ] RED: `TestClusterCollapseQueryAwareHeadNeverBuriesRoot` (AC2/AC3/AC4).
- [ ] GREEN: cluster head card + inline '+N more' expander (AC1); query-aware head selection wiring (AC2); lineage-root-anchored naming copy (AC3); facet-engagement auto-flip-to-flat + explicit toggle (AC4); fork-at-insert grouping (AC5).

## 🧠 Context

This sits inside E4-S1's Discover surface (reads the materialized cluster_id/is_cluster_head columns the api's marketplace backend computes — the UI does no clustering itself, only presentation). Distinct from facet/search rendering, which E4-S1 already covers. React-front presentation layer (CS §6 — no client-side clustering logic). Seam: BFF /api/skills read, PENDING an upstream backend gap — grep of every breakdown/*/bodies/*.md (incl. api's E2-S3 reputation-ledger story) finds no story that computes/exposes cluster_id/is_cluster_head/lineage_root_id; this UI story cannot be verified end-to-end until that backend gap is also filed and its API contract lands. Sibling dependency: E4-S1 (hosts the results region this collapse renders inside).

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. marketplace-scenario-and-spec.md §0-D, §2, §3.1.3 (Locked Decisions #2/#12, PO refinement 2026-06-17 §15 tie-break). E4-S1 covers only facets/search-as-you-type; no story owns clustering/collapse/'+N more'/query-aware head election.

## 🧪 Testing

`TestClusterCollapseQueryAwareHeadNeverBuriesRoot` (integration) + unit tests on head-election selection logic. CS §5 mocking: BFF cluster-bearing skill-list fixtures; never mock own expand/collapse rendering.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view (no client-side domain logic — BFF/api own it) · §11 honesty (no fabricated proof, honest empty states) · §3 naming.
- SE-Arch `8sYi523i4t`: honesty lens (original never silently buried); reuse-don't-redesign lens.

## 🔗 References

PRD `xsRMrju3D1` (nearest existing FR-UI11 covers only search/facets, not clustering) · POC `marketplace-scenario-and-spec.md` §0-D, §2, §3.1.3.

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Intra-epic order:** after E4-S1 (extends its results region).
- [ ] **Needs companion backend gap:** no api/knowledge story computes cluster_id/is_cluster_head/lineage_root_id — file alongside api's E2-S3 (Marketplace, social & append-only reputation ledger) before this story can be end-to-end verified.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
