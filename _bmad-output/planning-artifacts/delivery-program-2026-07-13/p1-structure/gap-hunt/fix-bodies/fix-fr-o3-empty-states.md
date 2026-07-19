## 🎯 Story

As a **new or returning user**, I want **a designed empty state on every memory surface that teaches me the next action, and a hard demo/real separation so seeded Demo content is never mistaken for my own and never silently lost on clear** so that **an empty Memory wall, Curation Queue, or Chat History reads as an invitation (not a dead end) and I always know which rows are mine vs. the Demo World's** (FR-O3, g9vWbSYplh F0).

**Definition of Done:** ONE named test `TestMemoryEmptyStatesTeachNextActionAndSeparateDemo` — a component-integration test that mounts each memory surface (Memory wall, Curation Queue, Chat History, Memory Coach) with a zero-real-rows fixture and asserts (a) each renders a surface-specific empty state naming a single concrete next action — never the generic "—" trio — and (b) with Demo Data present, demo rows carry the demo marker and are visually/semantically separated from real rows, and a clear-demo operation removes ONLY demo rows while any user forks survive labelled as the user's own, verified through rendered output + post-clear state. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a memory surface with zero real rows, When it mounts, Then a surface-specific designed empty state renders that names exactly one concrete next action (e.g. wall → "Start onboarding"; queue → "Import a chat to get proposals"; history → "Import your ChatGPT/Claude archive"). *Assertion: each surface's empty state names its own next action; none falls back to the generic honest-empty placeholder.* [Source: FR-O3, g9vWbSYplh F0]
- [ ] **AC2** — Given Demo Data is present on a surface, When rows render, Then every demo-origin row carries a persistent demo marker and is separable from real rows. *Assertion: demo rows tagged demo-origin; a real row and a demo row are never rendered as indistinguishable.* [Source: FR-O3, g9vWbSYplh F0]
- [ ] **AC3** — Given a mix of demo rows and user-owned forks, When the demo is cleared, Then only demo-origin rows are removed and user forks survive re-labelled as the user's own. *Assertion: post-clear set contains the forks (now non-demo) and zero demo-origin rows.* [Source: FR-O3, g9vWbSYplh F0]
- [ ] **AC4** — Given an empty state was shown, When the user completes the taught action, Then the surface transitions to its populated view without a manual reload. *Assertion: first real row replaces the empty state in-session.* [Source: FR-O3, g9vWbSYplh F0]
- [ ] **AC5 (negative)** — Given a clear-demo that partially fails, When it errors, Then no half-cleared surface renders as usable and the demo/real labels stay truthful (no demo row silently re-tagged as real). *Assertion: on error, surface stays honest — no orphaned untagged demo rows.* [Source: FR-O3, g9vWbSYplh F0]

## 🔨 Tasks

- [ ] RED: add `TestMemoryEmptyStatesTeachNextActionAndSeparateDemo` across all four surfaces (AC1–AC3, AC5).
- [ ] GREEN: author a per-surface `EmptyState` variant with a single taught next action, specialising (not replacing) the shared honest-empty primitive (AC1).
- [ ] GREEN: add demo-origin tagging + a shared demo-marker treatment to memory row rendering (AC2).
- [ ] GREEN: make clear-demo remove demo-origin rows only, re-label surviving forks as user-owned, and fail-honest on partial clear (AC3, AC5); wire in-session empty→populated transition (AC4).

## 🧠 Context

**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified) — FR-O3 (brief `g9vWbSYplh` F0) appears in NO `plan.json` `covers[]`. Why it was missed: the generic honest-states trio (E1-S5, `PaneState.tsx`) and the Demo World banner + atomic graduation (E6-S1) each cover a slice, so decomposition read FR-O3 as already-satisfied by adjacency; but neither specialises empty states *per memory surface* with a teach-next-action, and demo/real separation is only enforced at graduation, not on the surfaces themselves. This story closes the seam: designed per-surface empty states + on-surface demo/real guarding.

React-front memory surfaces (CS §6 — presentational; the demo-origin flag comes from the BFF, no client demo-vs-real inference). Seam: BFF memory/queue/history reads carrying the demo-origin flag. Sibling dependency: E1-S5 (honest-states primitive to specialise), E3-S3 (Memory wall), E6-S1 (Demo World graduation/clear), E6-S4 (Curation Queue).

## 🧪 Testing

`TestMemoryEmptyStatesTeachNextActionAndSeparateDemo` (component-integration) + unit tests on the demo-origin tagger and the clear-demo filter. CS §5 mocking: fixture the BFF memory/queue/history reads (sibling) with demo + real rows; never mock our own EmptyState or clear filter. Machine-check the post-clear set membership directly.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view (no client demo/real math) · §11 honest states (no fabricated rows, no half-cleared usable surface) · §3 naming.
- SE-Arch `8sYi523i4t`: no-data-loss + honesty lenses — a clear that could drop a user fork, or a demo row that could pass as real, fails the gate.

## 🔗 References

Brief `g9vWbSYplh` (F0 — FR-O3 every-memory-surface empty state + demo/real separation) · PRD `xsRMrju3D1` (FR-UI29 honest states, FR-UI20 Demo World) · Architecture `DmJsnB5Z9Y` §2.

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate) · project Orvex Studio UI · milestone B3 — Onboarding & Memory.
- [ ] **Must-resolve:** after E1-S5 (honest-states primitive) and E6-S1 (Demo World clear/graduation); pairs with E3-S3 (wall) and E6-S4 (queue).
- [ ] **Parent epic:** the B3 memory epic (E3).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
