## 🎯 Story

As a **signed-in contributor and skill user**, I want **the block-level feedback loop on a claimed/native skill — a hover-and-keyboard-focus action strip offering Comment (discussion, no change) and Suggest (per-type diff, batchable), sign-in-first composers, and a per-skill Discussion surface (Comments / Suggestions / plain-English Version-history tabs) with the shared reputation-ladder chip** so that **I can flag or fix a specific block without editing the skill directly, community feedback is legible and itemized, and I never hit a dead end on an unclaimed skill**.

**Definition of Done:** ONE named test `TestBlockFeedbackAndDiscussionSurface` (integration — asserts the action strip is keyboard-focusable (not hover-only) on every block of a CLAIMED/NATIVE skill; Comment/Suggest on an unauthenticated session opens Clerk sign-in before the composer; a Suggest composer renders the correct per-type diff widget for the target block's kind and is batchable with a required 'Why this change?'; an UNCLAIMED skill renders the claim/fork redirect panel instead of the strip; and the Discussion surface renders three tabs — Comments (with an honest 'What I changed' delta strip), Suggestions (vote+status, NO Accept/Reject, 'Review in inbox →' link, honest empty state), and a Version-history timeline with a 'Current' marker — every person-reputation signal via the shared New→Contributor→Reliable→Steward ladder chip, never the skill-level 'Trusted' label reused for a person). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (keyboard-reachable action strip)** — Given a block on a CLAIMED/NATIVE skill, When hovered OR keyboard-focused, Then a 💬 Comment / ✎ Suggest / ⋯ action strip renders (never hover-only). *Assertion: strip reachable by keyboard.* [Source: POC skill-authoring-scenario-and-spec.md §3.2, P1-1]
- [ ] **AC2 (sign-in-first composer)** — Given an unauthenticated user, When Comment or Suggest is tapped (on the block strip OR the Discussion composer), Then Clerk sign-in opens first and the composer only opens after sign-in succeeds (FR-27 sign-in-first, no anon-draft). *Assertion: composer never opens pre-auth.* [Source: POC skill-authoring-scenario-and-spec.md §1 J3.2/J4.1, §8 Q2; POC 08-discussion.md Reconciliation 'Sign-in-first feedback']
- [ ] **AC3 (per-type diff Suggest, batchable)** — Given Suggest is opened on a block, When the composer renders, Then it uses the same per-type widget the owner's editor uses, pre-filled, rendered as a per-type diff (Text→word-level redline, Rule→polarity-change, Example→paired in/out, Placeholder→field table, Conditional→branch-logic, Task-list→row-level +/−/↕, Verbatim→byte-level with alteration warning, File→scan+visualizer diff), and is batchable across multiple blocks with a required one-line 'Why this change?'. *Assertion: correct diff widget per kind; batchable submit.* [Source: POC skill-authoring-scenario-and-spec.md §4.3]
- [ ] **AC4 (comment never mutates + bridge)** — Given a Comment, When posted, Then it never mutates the skill, carries the author's reputation chip, and offers a one-tap 'Turn into a suggestion' bridge pre-anchored to the same block (linked; a reject on the derived suggestion returns the comment thread to Open). When a comment carries a declared customisation, a 'What I changed: {note}' delta-disclosure strip renders on that comment only. *Assertion: comment→suggestion bridge one-tap, linked; delta strip renders iff a changed-note exists.* [Source: POC skill-authoring-scenario-and-spec.md §1 J3.4; POC 08-discussion.md B3]
- [ ] **AC5 (unclaimed redirect, not a wall)** — Given an UNCLAIMED skill, When a viewer reaches where the action strip would render, Then an honest redirect panel shows instead ('Feedback opens once someone owns this skill' + Claim via GitHub OAuth or Fork) — never a silent absence or a wall. *Assertion: unclaimed redirect renders, not a dead-end.* [Source: POC skill-authoring-scenario-and-spec.md §3.2 'Unclaimed redirect']
- [ ] **AC6 (Discussion tabs)** — Given a skill, When Discussion opens, Then three tabs render — Comments (live count), Suggestions (live count), Version history — with real counts from the social API (never fabricated); the Version-history tab shows each version with a plain-English maker note and marks the current version. *Assertion: 3 tabs with real counts; timeline renders a 'Current' marker.* [Source: POC 08-discussion.md B1, B5]
- [ ] **AC7 (suggestions read-view: no decisions here)** — Given the Suggestions tab, When rendered, Then each item shows a vote count and a status chip (In review/Merged, text+shape not colour-alone) and NO Accept/Reject control — decisions live in the Review inbox (J5), surfaced via a 'Review in inbox →' link to owners; zero suggestions shows an honest empty state ('No suggestions yet — be the first to make this skill better.'), never '0 suggestions'. *Assertion: no accept/reject affordance; 'Review in inbox →' shown to owners; honest empty copy.* [Source: POC 08-discussion.md B4 + Reconciliation 'one decision surface']
- [ ] **AC8 (reputation vocabulary)** — Given any person-reputation signal (top-contributors sidebar, comment author, suggestion attribution), When shown, Then it renders via the shared decomposable New→Contributor→Reliable→Steward ladder chip — NEVER the skill-level 'Trusted' label reused for a person, and never on any Memory surface. *Assertion: person signals use the ladder chip, not a person 'Trusted' pill.* [Source: POC 08-discussion.md Reconciliation 'Reputation vocabulary collision']

## 🔨 Tasks

- [ ] RED: `TestBlockFeedbackAndDiscussionSurface` (AC1/AC2/AC5).
- [ ] GREEN: keyboard-reachable action strip (AC1); sign-in-first gate (AC2); per-type diff composer + batching (AC3); comment posting + reputation chip + bridge + delta strip (AC4); unclaimed redirect panel (AC5); Discussion tab bar + Comments/Version-history (AC6); Suggestions read-view (vote/status, no decisions, 'Review in inbox →', honest empty) (AC7); shared reputation-ladder chip wiring (AC8).

## 🧠 Context

React-front overlay + surface (CS §6). This is the human-authored, owner-reviewed suggestion/comment loop that FEEDS the Review inbox (J5, companion gap) — distinct from the Improve-with-AI panel (E5-S1, FR-UI14), which patches the signed-in user's OWN Delta via a single-shot AI call and is never a social suggestion visible to the owner. api E2-S3 builds the backend social layer (comments/suggestions/reviews/following/reputation_ledger) this surface reads/writes; nothing in the ui program renders it. Reuses the deterministic per-type widget components from the Builder (E4-S3) for rendering and the shared reputation chip; the diff/composer logic and the Clerk sign-in gate are net-new. Seam: BFF comment/suggest persist + Clerk auth. Sibling dependency: E4-S2 (Skill Viewer, hosts the action-strip mount point and the 'Something off?'/Discuss entry point), E4-S3 (typed-widget reuse). This is the read/reply face; J5 owns Accept/Reject.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. Consolidates two independent finds of the same feedback/discussion face: skill-authoring-scenario-and-spec.md §1 J3/J4/§3.2/§4.3 (block-level Comment/Suggest overlay) and design-artifacts/D-Design-System/screens/08-discussion.md (comments/suggestions/version-history surface). E4-S2 scopes its injection slots as owned by each feature's surface, but no surface claims the Comment/Suggest slot.

## 🧪 Testing

`TestBlockFeedbackAndDiscussionSurface` (integration) + unit tests on the per-type diff-widget selection, the sign-in gate, and the ladder-chip mapping. CS §5 mocking: BFF comment/suggest fixtures + api social-layer fixtures (E2-S3); never mock own diff-widget/tab/composer rendering.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view · §11 honesty (no black-box scores, honest empty states) · §3 naming.
- SE-Arch `8sYi523i4t`: honesty lens (itemised reputation, never an opaque score); person-trust vs skill-Trusted collision lens; reuse-don't-redesign lens.

## 🔗 References

PRD `xsRMrju3D1` / `85qj2wwU2L` (FR-SA3) · POC `skill-authoring-scenario-and-spec.md` §1 J3/J4, §3.2, §4.3 (PO-confirmed 2026-06-16) · POC `design-artifacts/D-Design-System/screens/08-discussion.md` · FR-27 (sign-in-first).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Blocked by:** ENG-2303 (api E2-S3 — comments/suggestions/reputation_ledger social API this surface reads/writes).
- [ ] **Related:** E4-S2 (Skill Viewer, hosts the action-strip slot + Discuss entry point); the Review-inbox (J5) companion gap is the decision surface this feeds via 'Review in inbox →'.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
