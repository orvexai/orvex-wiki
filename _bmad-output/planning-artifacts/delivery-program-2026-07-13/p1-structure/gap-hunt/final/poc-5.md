## 🎯 Story

As a **signed-in Studio user**, I want **a per-type notification-preferences surface — in-app notification centre feed backing the shell's inbox drawer, email/digest delivery channel selection, and per-type toggles for suggestion-accepted/rejected, new-comment, Library-saves, and community-activity events — with an honest 'coming' state on any toggle not yet wired to a real delivery path**, so that **I control what interrupts me, and the app never shows a fake working switch**.

**Definition of Done:** one named test `TestNotificationPrefsPerTypeAndHonestComing` (integration — creates a notification_prefs row for a fixture user, triggers a suggestion-accepted event and asserts an in-app notification-centre item is created and the shell's unread-actionable count increments; toggles the suggestion-accepted preference off and asserts the next event produces no in-app item; asserts a not-yet-wired channel (e.g. email digest, if unbuilt) renders as an honest 'coming' state rather than a silently-no-op toggle, through the notifications API + preferences store). *Final elaboration + exact contract tag/versions are pinned at pack certification (ENG-2098); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1 (schema + route)** — Given the platform, When notification preferences are stored, Then a `notification_prefs` table persists per-user per-type settings, served via `/account/notifications` in an Accounts route. *Assert: schema round-trips; route reachable.* [Source: POC p4-requirements-inventory.md ARCH-4, ARCH-13]
- [ ] **AC2 (in-app centre)** — Given a signed-in user, When a tracked event fires (suggestion accepted/rejected, new comment, Library save, community activity), Then an in-app notification-centre item is created and the unread-actionable count the shell's inbox drawer reads increments. *Assert: event → notification row created; unread count reflects it.* [Source: POC p4-requirements-inventory.md FR-37]
- [ ] **AC3 (per-type toggle)** — Given a user disables one notification type, When that event type fires again, Then no notification item is created for it, while other enabled types are unaffected. *Assert: disabled-type event → no new item; other types unaffected.* [Source: POC p4-requirements-inventory.md FR-37]
- [ ] **AC4 (honest 'coming' state)** — Given a delivery channel (e.g. email/digest) not yet wired to a real delivery path, When shown in preferences, Then it renders an honest 'coming' state — never a toggle that appears to work but silently does nothing. *Assert: unwired channel → disabled/coming UI state, not a functional-looking no-op toggle.* [Source: POC p4-requirements-inventory.md FR-37]

## 🔨 Tasks

- [ ] `notification_prefs` Postgres table + migration (per-user, per-type) (AC1)
- [ ] `bff/routes/notifications` — GET/PUT preferences at `/account/notifications` (AC1)
- [ ] Event-triggered notification-centre item creation on suggestion-accept/reject, new-comment, Library-save, community-activity (AC2)
- [ ] `unreadActionableCount` backing query feeding the shell's existing badge selector (AC2)
- [ ] Per-type toggle enforcement at notification-creation time (AC3)
- [ ] Honest 'coming' state for unbuilt delivery channels, distinct from a functional toggle (AC4)
- [ ] Write `TestNotificationPrefsPerTypeAndHonestComing` (RED→GREEN)

## 🧠 Context

Tier placement: route (`/account/notifications`) → application (event-to-notification mapping) → domain (preferences) → Postgres port. Seam crossed: consumes `studio.skill.*`/community events already emitted by E2-S3 (ENG-2303, reputation/suggestions) and the reputation-ladder gap ticket. Sibling dependency: E1-S2 (auth, ENG-2295 — per-user scoping), ui E2-S1 (ENG-2658 — the inbox-drawer badge this story's `unreadActionableCount` backs; UX-DR-5 already names the selector contract on the ui side but nothing produces the data it reads). This is the BACKEND service; the UI account Notifications panel is a separate ticket (the Account & Settings merged gap) that consumes this store.

**🧾 Gap provenance (2026-07-15):** POC completeness sweep — the UI corpus was authored from the service PRD, not the POC design source. FR-37 plus its architecture-level ARCH-4/ARCH-13 companions describe a full backend (schema + route + event-triggered generation), but the only trace anywhere in the delivery program is a UI-only badge-pill story (ui E2-S1) that assumes a data source with zero backing implementation. No service owns the schema, the route, or the notification-generation triggers.

## 🧪 Testing

Named DoD test: `TestNotificationPrefsPerTypeAndHonestComing` (integration). Tiers: unit (per-type filter logic, honest-'coming' state derivation) + integration (event→notification round trip, preferences CRUD). CS §5 mocking: mock the event bus/outbox consumer boundary; never mock own preferences domain.

## 📏 Guidance

CS 6aMAzsYeQb §§0/4/5/6/11 (honest states — never a fake working switch); SE-Arch 8sYi523i4t lenses (no-silent-no-op lens); cell-lint JGAUQRsw2g (per-cell).

## 🔗 References

POC PRD reconciliation `p4-requirements-inventory.md` FR-37, ARCH-4, ARCH-13 (§4.7, §Architecture Requirements); ui E2-S1 (UX-DR-5 `unreadActionableCount` selector, consumer side already speced).

## 🔗 Dependencies

- [ ] Blocked by: **ENG-2098** (contract TAG).
- [ ] Blocked by: **ENG-2295** (api E1-S2 auth — per-user scoping), **ENG-2303** (api E2-S3 — the reputation/suggestion events this story consumes).
- [ ] Blocks: ui E2-S1's inbox-drawer badge (ENG-2658) having a real data source instead of a hypothetical one; the UI Account Notifications panel.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
