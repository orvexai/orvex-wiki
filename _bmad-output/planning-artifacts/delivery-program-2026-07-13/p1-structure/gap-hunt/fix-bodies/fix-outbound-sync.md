## 🎯 Story
As an Orvex Memory user I want my user-facing Orvex Memory actively pushed out to the native memories of the assistants I connect (Claude, ChatGPT, …) so that Orvex is the portable master and I am never locked into one vendor's memory silo.

**Definition of Done:** `TestOutboundSyncPushesMasterExcludesPrivateAndAppliesConflictPolicy` (integration, knowledge outbound-sync driver) — drives a full master→replica push through a stubbed per-vendor adapter and asserts: (a) a non-private Memory item lands in the vendor native store via the selected adapter, (b) an item flagged private / lacking per-use consent is NEVER pushed, and (c) on a master-vs-vendor divergence the recorded conflict policy is applied deterministically (Orvex-master wins per the resolved OQ3 ruling) rather than silently overwritten either way. *Final H1–H17 elaboration + exact contract tag/versions + the resolved conflict-policy value are pinned at pack certification (ENG-2099); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given a user with Orvex Memory as master and a connected vendor assistant, When outbound sync runs, Then non-private Memory items are pushed to the vendor's native memory via the per-vendor adapter. *Assert: adapter receives exactly the eligible item set; a dry-run diff is emitted before write.* [Source: rgBOQh31p3 (outbound memory sync — the un-lock-in layer), yXUWpQpRjx W3 (outbound sync routed to knowledge)]
- [ ] **AC2** (exclusion) — Given items flagged private or without per-use consent, When sync runs, Then those items are excluded from every push. *Assert: private/no-consent items never reach any adapter; exclusion is logged, not silent.* [Source: rgBOQh31p3 (private-memory exclusion + per-use consent)]
- [ ] **AC3** (conflict policy) — Given Orvex-master and vendor-native have diverged for the same memory, When sync reconciles, Then the recorded conflict policy is applied deterministically. *Assert: resolution matches the pinned OQ3 ruling; no silent last-writer-wins.* [Source: OQ3 / 3z78laG6dB (open — Orvex master vs vendor divergence)]
- [ ] **AC4** (adapter selection) — Given >1 connected vendor, When sync runs, Then the correct per-vendor adapter is selected: Claude via its native memory API, ChatGPT via the F1 extension until an API exists. *Assert: adapter registry keys by vendor; unknown vendor fails closed, not a default push.* [Source: FR-D6 (Claude native memory API first), F1 (ChatGPT via extension)]
- [ ] **AC5** (scope boundary) — Given internal agent-state sync already exists, When this outbound push runs, Then it operates on the user-facing Memory product only and does not touch or duplicate the internal agent-state path. *Assert: no overlap with the internal-state sync surface; user-memory items only.* [Source: FR-MEM27, FR-MEM16 (internal agent-state — distinct from the user-memory product)]

## 🔨 Tasks
- [ ] RED: eligible-set + dry-run diff test for a single adapter (AC1). (AC: 1)
- [ ] GREEN: outbound-sync driver + per-vendor adapter interface (AC1, AC4). (AC: 1,4)
- [ ] RED→GREEN: private / no-consent exclusion filter with logged skips (AC2). (AC: 2)
- [ ] RED→GREEN: conflict-policy reconciler keyed to the pinned OQ3 ruling (AC3). (AC: 3)
- [ ] GREEN: adapter registry — Claude native API + ChatGPT F1 extension, fail-closed on unknown (AC4). (AC: 4)
- [ ] RED: scope-boundary test asserting no internal-agent-state overlap (AC5). (AC: 5)

## 🧠 Context
**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed: the brief's headline "outbound memory sync" promise was silently conflated with workgraph FR-MEM27/16, which are self-labeled INTERNAL agent-state ("distinct from the user-memory product") — so no story ever owned the active user-facing master→replica push, its conflict policy (OQ3 still open), private-memory exclusion, or per-vendor adapter selection.

Tier: retrieval/sync backbone — P1 prompt yXUWpQpRjx W3 routes outbound sync to knowledge as the one retrieval/sync home. Seams crossed: vendor native memory APIs / the F1 ChatGPT extension (mock per CS §5), Orvex Memory master store. This is the un-lock-in layer; it is NOT the internal agent-state sync (FR-MEM27/16).

## 🧪 Testing
DoD `TestOutboundSyncPushesMasterExcludesPrivateAndAppliesConflictPolicy` (integration). Tiers: unit (exclusion filter, adapter selection, conflict reconciler) + integration (driver→stubbed adapter). CS §5 mocking: mock the vendor adapters + their native APIs; never mock knowledge's own store or the Memory master source.

## 📏 Guidance
CS 6aMAzsYeQb §§3/4/5/6/7/10/11; SE-Arch 8sYi523i4t privacy + honesty lenses (private-memory exclusion is fail-closed; no silent overwrite on conflict) + the un-lock-in portability invariant (Orvex stays the master).

## 🔗 References
Brief `rgBOQh31p3` (outbound memory sync headline); workgraph FR-MEM27/FR-MEM16 (internal agent-state — boundary, NOT this scope); OQ3 `3z78laG6dB` (conflict policy — open); FR-D6 (Claude native memory API first); F1 extension (ChatGPT bridge); P1 routing prompt `yXUWpQpRjx` W3.

## 🔗 Dependencies
- [ ] Blocked by: **ENG-2099** (contract TAG is the dispatch gate — outbound-sync envelope + per-vendor adapter contract; project **Orvex Studio Knowledge**, milestone **B11 — Outbound memory sync (user-facing, per-vendor)**).
- [ ] Must-resolve (pack review, ENG-2099): the **ai/mcp share of the per-vendor adapters** — flag it; knowledge owns the outbound sync orchestration, but which vendor adapters live in ai vs mcp is unresolved.
- [ ] Must-resolve: **OQ3 / 3z78laG6dB** conflict-policy ruling (Orvex master vs vendor divergence) must be closed before AC3 can pin its expected resolution.
- [ ] Parent milestone: **B11** (new).

## 📡 Protocol
CLAIM→PLAN→PROGRESS→COMMITS ("Part of ENG-NNN", never closes)→HANDOFF→REVIEW (reviewer ≠ implementer)→TICK→DONE (orchestrator-only)→ESCALATE.
