## 🎯 Story

As a **user connecting a third-party AI assistant**, I want **an AI-privacy setup check on the Connections surface that verifies the connected assistant won't train on my data — with honest "unsupported"/"unknown" states when a vendor's posture can't be verified** so that **I can decide whether to connect knowing that vendor's training/retention posture, without ever confusing it with Orvex's own no-train config** (rgBOQh31p3; extends FR-UI25 Connections & MCP setup).

**Definition of Done:** ONE named test `TestConnectedAssistantPrivacyPostureRendered` — a component-integration test that renders the Connections surface for a set of connected-assistant vendors and asserts (a) each vendor's training/retention posture renders from the per-vendor posture registry the BFF supplies, (b) a vendor whose posture is unverifiable renders an explicit honest "unsupported"/"unknown" state (never a fabricated "safe"), and (c) the check never conflates a vendor's posture with Orvex's own no-train provider config — verified through the rendered state and store state. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a connected third-party assistant, When its connection is viewed, Then the Connections surface renders that vendor's training/retention posture ("won't train on your data" verification) sourced from the BFF per-vendor posture registry. *Assertion: `TestConnectedAssistantPrivacyPostureRendered` — posture value rendered from registry fixture, not hard-coded.* [Source: rgBOQh31p3, FR-UI25]
- [ ] **AC2 (honest state)** — Given a vendor whose training/retention posture is unverifiable or unreported, When the check renders, Then it shows an explicit "unsupported"/"unknown" state, never a fabricated affirmative. *Assertion: unknown-posture vendor renders unsupported state; no "safe" claim present.* [Source: rgBOQh31p3]
- [ ] **AC3** — Given the AI-privacy check, When it renders, Then it is scoped to third-party connected assistants only and is visibly distinct from Orvex's own no-train provider config (workgraph NFR-MEM7) and from the api Private-Memory guard. *Assertion: label/copy scopes to the connected vendor; no coupling to Orvex own-provider config or the api guard.* [Source: rgBOQh31p3, NFR-MEM7]
- [ ] **AC4** — Given a change in a vendor's reported posture, When the registry updates, Then the surface reflects the new posture on next load (server-truth, no stale cached affirmative). *Assertion: posture re-renders from refreshed registry response.* [Source: rgBOQh31p3, FR-UI25]
- [ ] **AC5 (negative)** — Given the SPA, When rendering the check, Then it never asserts a vendor's training posture that the per-vendor registry did not supply. *Assertion: no posture rendered absent a registry entry; falls to unsupported.* [Source: rgBOQh31p3]

## 🔨 Tasks

- [ ] RED: `TestConnectedAssistantPrivacyPostureRendered` across a verified / unverifiable / distinct-from-Orvex vendor set (AC1/AC2/AC3).
- [ ] GREEN: extend the Connections & MCP setup surface (E7-S2 / FR-UI25) with the per-connection AI-privacy panel (AC1); honest unsupported/unknown state (AC2); scoping + labelling that separates it from Orvex own-provider config and the api guard (AC3); server-truth re-render (AC4); no-fabrication guard (AC5).
- [ ] Consume the BFF per-vendor posture registry contract (must-resolve backend share — see §8); fixture it until the registry lands.

## 🧠 Context

**🧾 Gap provenance (2026-07-14):** Filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed: the Brief line "AI-privacy setup — verify the connected assistant won't train on your data" was read as already covered by Orvex's OWN no-train provider config (workgraph NFR-MEM7) and by the api Private-Memory guard — but those govern Orvex's own model providers and internal memory, not a user-facing check of a THIRD-PARTY connected assistant's posture; zero stories covered that surface.

**🧾 Code audit (origin/main @ 74c2a39, 2026-07-14):** absent — no user-facing connected-assistant training/retention check on the Connections surface (build, not verify-harden).

React-front connections surface (CS §6; honest states CS §11). Seam: BFF supplies the per-vendor posture registry (the SPA never scrapes vendor policies itself). Extends E7-S2 (Connections & MCP setup). Sibling dependency: E1-S2 (client).

## 🧪 Testing

`TestConnectedAssistantPrivacyPostureRendered` (component-integration) + unit tests on the unsupported/unknown-state renderer. CS §5 mocking: fixture the BFF per-vendor posture registry (remote-but-owned); never mock the own Connections surface.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view · §11 honest unsupported/unknown states (no fabricated "safe") · §5 fixture the sibling registry.
- SE-Arch `8sYi523i4t`: honesty + invariant-consistency lens — the connected-assistant check must not fork into or conflate with Orvex's own no-train config.
- Cell-lint `JGAUQRsw2g`: N/A runtime.

## 🔗 References

Brief `rgBOQh31p3` (canonical — "AI-privacy setup") · PRD `xsRMrju3D1` (FR-UI25) · workgraph NFR-MEM7 (distinct: Orvex OWN provider no-train config).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the per-vendor posture registry contract shape is the dispatch gate). Project: Orvex Studio UI · Milestone: B7 — Your Wiki, Connections & Billing.
- [ ] **Must-resolve (pack review):** the backend share — a per-vendor training/retention posture registry (likely the `ai` service) — is an open pack-review must-resolve; this story consumes it and is flagged pending that ruling.
- [ ] **Extends:** E7-S2 (Connections & MCP setup).
- [ ] **Intra-service order:** after E1-S2.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ author) → TICK → DONE (orchestrator-only) → ESCALATE.
