## 🎯 Story

As the **delivery-boundary consent layer of the extension**, I want to **treat every injected/retrieved memory as untrusted data (composed, never executed) and support consent revocation + connection removal that fails closed on the next delivery — while keeping delivery neutral across all supported assistants with no lock-in**, so that a stored prompt-injection carried in a memory can never be executed, a revoked consent can never be silently satisfied from a cached prior grant, and the extension never becomes an assistant-specific trap for the user's portable memory.

**Definition of Done:** `TestMemoryIsUntrustedDataAndRevocationFailsClosed` (integration) — memory content is inserted into the compose surface verbatim and is never interpreted/executed as instructions; disconnecting an assistant or revoking a standing consent takes effect on the **next delivery attempt** and fails closed (requires fresh consent, never falls back to a cached prior consent); and delivery + memory portability work uniformly across every supported assistant with no assistant-specific hard binding.
*Exact consent-state schema + revocation propagation are pinned at Definition-Pack certification (ENG-2690); this story is dispatch-blocked until that contract exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a memory bundle selected for delivery, When the extension composes it, Then the memory content is treated as **untrusted data, not instructions** — the extension composes/inserts it, it never evaluates or executes it. *assert: no eval/exec/`Function`-construction over memory content; injected text reaches the compose surface verbatim only.* [Source: QpVnEF7aEU FR-CF4]
- [ ] **AC2** — Given a connected assistant or a standing consent, When the user disconnects the assistant or revokes the consent, Then the change takes effect **on the next delivery attempt**. *assert: post-revoke delivery attempt does not proceed under the old grant.* [Source: QpVnEF7aEU FR-CF5]
- [ ] **AC3 (fail-closed)** — Given a revoked consent, When the next delivery is attempted, Then it **fails closed** — it requires a fresh consent and **never falls back to a cached prior consent**. *assert: after revoke, a delivery attempt with only the cached prior consent is refused; only a fresh per-use consent proceeds.* [Source: QpVnEF7aEU FR-CF5]
- [ ] **AC4 (neutrality)** — Given multiple supported assistants, When memory is delivered, Then there is **no provider lock-in** — delivery works across all supported assistants and the memory stays portable (no assistant-specific hard binding of the memory). *assert: the same memory bundle is deliverable to each supported provider with no provider-exclusive transform of the stored memory.* [Source: QpVnEF7aEU NFR-3]

## 🔨 Tasks

- [ ] RED: `TestMemoryIsUntrustedDataAndRevocationFailsClosed` (AC1, AC3).
- [ ] GREEN: enforce compose-only handling of memory content — no execution path over memory data (AC1).
- [ ] GREEN: disconnect/revoke that takes effect on the next delivery attempt and fails closed with no cached-consent fallback (AC2, AC3).
- [ ] GREEN: provider-neutral delivery — no assistant-specific hard binding of the portable memory (AC4).

## 🧠 Context

**🧾 Gap provenance (2026-07-15):** traceability-matrix sweep (225 canon pages, id-level join). FR-CF4 (memory-as-untrusted-data), FR-CF5 (consent/connection revocation, fail-closed) and NFR-3 (cross-assistant neutrality / no lock-in) each surfaced uncovered — the corpus storied the per-use consent gate (FR-CF1) and the firewall (FR-CF2/CF7) but not the untrusted-data posture, the fail-closed revocation semantics, nor the neutrality NFR.

Tier: `entrypoints/background/` (consent-state + revocation authority, delivery gating) with `entrypoints/content/<provider>.ts` inserting verbatim. FR-CF4 inherits FR-S6 (`g9vWbSYplh`). NFR-3 is a cross-cutting posture assertion folded in per instruction — it ships here as a checkable neutrality AC rather than its own ticket. Server-side enforcement of consent/firewall is authoritative at the identity mint boundary (AD-8); this story is the client-side compose-and-gate half.

## 🧪 Testing

`TestMemoryIsUntrustedDataAndRevocationFailsClosed` (integration, headless browser). Tiers: unit (consent-state machine, fail-closed revocation) + integration (compose-only insertion, cross-provider delivery). CS §5: drive the real delivery path, never a mocked consent store.

## 📏 Guidance

CS `6aMAzsYeQb` §§0/4/6/7 (fail-loud, no silent fallback). SE-Arch `8sYi523i4t`: no-fallbacks (revoked consent fails closed, never a cached-consent side door); Security (stored-prompt-injection defense = data-not-instructions).

## 🔗 References

PRD `QpVnEF7aEU` — FR-CF4 (injected/retrieved memory is untrusted data, not instructions; inherits FR-S6 `g9vWbSYplh`), FR-CF5 (consent revocation + connection removal, fail-closed, no cached-consent fallback), NFR-3 (neutrality / no lock-in / portable memory).

## 🔗 Dependencies

Blocked by: **ENG-2690** (Definition Pack — consent-state + revocation contract). Project **Orvex Studio Extension**, milestone **B4 — Consent & firewall gate**.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
