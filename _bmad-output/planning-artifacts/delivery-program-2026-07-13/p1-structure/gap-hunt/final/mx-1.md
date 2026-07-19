## 🎯 Story

As a **non-technical user connecting an AI assistant**, I want the **provider-connection step to require only that I am already signed in to that provider in my own browser — no Orvex-held provider credentials, no OAuth to the provider, no separate provider account step — with every connection surface showing a designed empty/again state that teaches the next action**, so that connecting is a zero-credential, self-explanatory step that never presents a blank panel and never conflates the provider connection with my (separate, required) Orvex authentication.

**Definition of Done:** `TestProviderConnectRequiresOnlyBrowserSignInAndTeachesEmptyState` (integration) — the connect flow holds no provider credential and issues no provider OAuth; it gates connection solely on the provider tab being signed in; and each connection surface renders a designed empty/again state (Connected / Not signed in / Not yet supported / Needs copy-paste) that names the next action instead of a blank panel. The provider-connection path never invokes the Orvex token mint (FR-AU1 is a distinct obligation).
*Exact surface copy + per-provider status wiring are pinned at Definition-Pack certification (ENG-2690); this story is dispatch-blocked until that contract exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a supported provider, When the user connects it, Then the extension holds **no Orvex-managed provider credential** and issues **no OAuth-to-the-provider and no separate provider account step** — connection is gated only on the provider being signed in in the user's own browser. *assert: no provider-credential store exists; connect path issues zero provider-OAuth calls; connection state derives from the signed-in provider tab.* [Source: QpVnEF7aEU FR-CN3]
- [ ] **AC2** — Given the provider-connection step, When it runs, Then it is **separate from the extension's own Orvex authentication (FR-AU1)** and never satisfies or substitutes for it — the two obligations are distinct code paths. *assert: the provider-connect path never calls the Orvex delegated-token mint; Orvex auth remains independently required.* [Source: QpVnEF7aEU FR-CN3]
- [ ] **AC3** — Given any connection surface, When it renders with no active connection, Then it shows a **designed empty/again state that teaches the next action** (never a blank panel). *assert: the connect card renders a non-empty guidance state with an explicit next-action affordance in the no-connection case.* [Source: QpVnEF7aEU FR-CN4]
- [ ] **AC4 (error-path)** — Given the user is **not** signed in to the provider, When the connection surface renders, Then it shows the truthful **"Not signed in"** guidance state naming the next action — never a blank panel and never a claim of a capability the surface can't deliver. *assert: unsigned-in provider yields the "Not signed in" empty state, not "Connected".* [Source: QpVnEF7aEU FR-CN4; FR-CN2]

## 🔨 Tasks

- [ ] RED: `TestProviderConnectRequiresOnlyBrowserSignInAndTeachesEmptyState` (AC1, AC4).
- [ ] GREEN: gate connection on provider-tab sign-in only; assert-free of any provider credential/OAuth path (AC1, AC2).
- [ ] GREEN: designed empty/again state per connection surface with an explicit next-action affordance for the no-connection and not-signed-in cases (AC3, AC4).

## 🧠 Context

**🧾 Gap provenance (2026-07-15):** traceability-matrix sweep (225 canon pages, id-level join). FR-CN3 and FR-CN4 were both surfaced as uncovered — the ENG-2711..2730 corpus storied one-step connect (FR-CN1) and per-assistant status (FR-CN2) but never bound the **zero-provider-credential connection requirement** (FR-CN3) nor the **designed connection empty/again state** (FR-CN4) to a story.

Tier: `entrypoints/popup/` (presentational connect surfaces) + `entrypoints/background/` (connection-state resolution). FR-CN3 governs the **provider-connection step only** — the extension's own auth to Orvex is the separate, required FR-AU1 obligation and is out of scope here except as the boundary this story must not cross. FR-CN4's UI detail is co-owned with the `ui` service (`[ASSUMPTION — aligns FR-O3]`); this story owns the extension-side empty-state contract. Cohesive as one ticket: both FRs govern the same connection surface.

## 🧪 Testing

`TestProviderConnectRequiresOnlyBrowserSignInAndTeachesEmptyState` (integration, headless browser). Tiers: unit (connection-state resolver) + integration (surface render across states). CS §5: drive the real built connect surface, never a mocked popup.

## 📏 Guidance

CS `6aMAzsYeQb` §§0/4/6/7 (fail-loud, no silent capability claims). SE-Arch `8sYi523i4t`: no-fallbacks (a not-signed-in state is honest, never a fabricated "Connected").

## 🔗 References

PRD `QpVnEF7aEU` — FR-CN3 (connection requires only in-browser provider sign-in; no Orvex provider credentials / no provider OAuth), FR-CN4 (designed connection empty/again state), with FR-CN2 (truthful per-assistant status) and FR-AU1 (separate Orvex auth obligation) as the reconciled boundary.

## 🔗 Dependencies

Blocked by: **ENG-2690** (Definition Pack — surface copy + per-provider status contract). Project **Orvex Studio Extension**, milestone **B2 — Auth & connection (one-step connect, per-assistant status)**.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
