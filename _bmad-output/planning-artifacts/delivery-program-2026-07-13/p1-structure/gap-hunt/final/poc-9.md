## 🎯 Story

As a **visitor deciding whether to trust a skill or an owner managing it**, I want **the Claim action (GitHub OAuth), a 'Why Trusted?' decomposition panel, live worked/partially/didn't reviews, and a Community zone gated by ownership state**, so that **I can always answer 'why is this trusted' and the right actions are available for my relationship to the skill** (marketplace §3.2 Zones 1/4/5, §4, §5).

**Definition of Done:** ONE named test `TestSkillDetailOwnershipActionsAndTrustPanel` (integration — asserts the action set (Copy/Save/Fork/Claim/Comment/Suggest/Review/Edit) renders exactly per the 5-column ownership-state matrix (Anonymous/Claimed-not-yours/Claimed-yours/Unclaimed/Fork-yours); 'Why Trusted?' opens a panel listing every criterion's actual status (never a composite score); the Claim button drives GitHub OAuth via Clerk and renders all 4 distinct edge messages (cancelled/failed/unreachable/already-claimed) inline; and a Review post is use-gated (rejected without a prior real use/copy event) and renders as a text-labelled non-color distribution). *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a skill in each of the 5 ownership/auth states, When the action bar renders, Then it shows exactly the actions the matrix permits (e.g. Claim only on Unclaimed + signed-in; Comment/Suggest/Review require sign-in and a CLAIMED/NATIVE owner state; Edit only on the owner's own). *Assertion: 5-state action matrix enforced.* [Source: POC marketplace-scenario-and-spec.md §3.2.3]
- [ ] **AC2** — Given the Trust & freshness panel (Zone 4), When 'Why Trusted?' is tapped, Then a panel lists every named criterion (Safety-scan, Claimed/Verified-owner, Author credentials, Usage, Reviews, Lineage, Model freshness, Editorial) with THIS skill's actual status text — never a single composite number. *Assertion: decomposed criteria render, no composite score.* [Source: POC marketplace-scenario-and-spec.md §5]
- [ ] **AC3** — Given Claim is tapped on an Unclaimed skill, When the GitHub OAuth round-trip runs via Clerk, Then it renders the happy-path confirm ('…its N saves stay with the skill') on match, and 4 DISTINCT inline messages for OAuth-cancel, OAuth-fail, GitHub-unreachable, and already-claimed-by-another (never a generic error, never a half-claimed state — claim is transactional). *Assertion: 4 distinct claim-edge messages; no half-claim.* [Source: POC marketplace-scenario-and-spec.md §3.2.2, §4.4]
- [ ] **AC4** — Given a CLAIMED/NATIVE skill's Community zone (Zone 5), When a signed-in user posts a Review, Then it is rejected unless a real per-user use/copy event exists (use-gated), stores worked/partially/didn't as a raw text-percentage distribution (non-color pattern, no gameable star average), and is one-per-user latest-wins. On an UNCLAIMED skill the zone is replaced (not empty) by the claim-explainer panel. *Assertion: use-gate enforced; distribution text+pattern; unclaimed shows claim panel, not an empty zone.* [Source: POC marketplace-scenario-and-spec.md §3.2.1 Zone 5, §5 signal 5]
- [ ] **AC5** — Given each live write in this surface (Claim/Comment/Suggest/Review), When it fails online, Then it fails-soft within its own control (inline error + retry) and never disables or blanks any other zone or action on the page — there is no global read-only degrade. *Assertion: per-write fail-soft; no global degrade.* [Source: POC marketplace-scenario-and-spec.md §0-E, Locked Decision #2]

## 🔨 Tasks

- [ ] RED: TestSkillDetailOwnershipActionsAndTrustPanel (AC1/AC3/AC4).
- [ ] GREEN: ownership-state action matrix (AC1); Why-Trusted decomposition panel (AC2); Claim GitHub-OAuth flow with 4 edge states (AC3); Community zone with use-gated Reviews + unclaimed claim-panel swap (AC4); per-write fail-soft wiring (AC5).

## 🧠 Context

React-front surface (CS §6 — the domain state machine and reputation ledger are owned by the api project's marketplace/social backend story). Layers on top of E4-S2's read-only typed-item render (which owns 'every declared injection slot mounts empty/clean' — this story fills the ownership/trust/social slot). Reuses the shared reputation chip component from the Review-inbox companion gap for Community-zone attribution, and reuses the Skill-feedback overlay gap's Comment/Suggest widgets for the zone's discussion content — this story owns ONLY the zone container, the Reviews sub-feature, and the unclaimed-panel swap, not the Comment/Suggest composer itself (kept distinct from that gap). Seam: BFF claim/review/comment endpoints + Clerk GitHub OAuth. Sibling dependency: E4-S2 (viewer host), the Review-inbox gap (shared reputation chip). Best-fit milestone B4 (Discover, Skill Viewer & Builder) — this is the Skill Detail face E4-S2 hosts.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. marketplace-scenario-and-spec.md §3.2/§4/§5 (Locked Decisions #3/#6/#7, PO refinement 2026-06-17 reversing Reviews to fully-live). E4-S2 has no Claim/Trust/Reviews; api's E2-S3 (reputation ledger) is backend-only, with no GitHub-OAuth-claim UI story anywhere. Distinct from the block-level Comment/Suggest overlay (companion gap) — this is the trust/claim/reviews panel.

## 🧪 Testing

`TestSkillDetailOwnershipActionsAndTrustPanel` (integration) + unit tests on the 5-state action matrix and the 4 claim-edge messages. CS §5 mocking: BFF claim/review/comment fixtures; never mock own action-matrix rendering.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view · §11 honesty (no black-box scores, no fabricated proof, honest empty states) · §3 naming.
- SE-Arch `8sYi523i4t`: honesty lens (no fake data/social proof); reuse-don't-redesign lens (cite the reused surfaces, don't re-spec them).

## 🔗 References

PRD `xsRMrju3D1` (nearest existing FR-UI12 covers only the read-only viewer) · POC `marketplace-scenario-and-spec.md` §3.2, §4, §5 (Locked Decisions #3/#6/#7, PO refinement 2026-06-17).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Related:** E4-S2 (Skill Viewer, hosts the injection slot); Review-inbox companion gap (shared reputation chip); backend 'Marketplace, social & append-only reputation ledger' story in orvex-studio-api (E2-S3/ENG-2303).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
