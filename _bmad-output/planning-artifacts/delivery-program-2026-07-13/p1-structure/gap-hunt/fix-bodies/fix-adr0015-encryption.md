## 🎯 Story

As the **identity data owner**, I want an at-rest encryption helper (envelope AEAD, key sourced via OpenBao/ESO) applied to the DB-held per-tenant Clerk config in the identity-owned tenancy DB, so that a per-tenant Clerk secret is never stored plaintext and the raw table is useless to a DB-level compromise.

**Definition of Done:** `TestClerkConfigAtRestEncryption` (integration layer) — through the tenancy-DB persistence path, a written per-tenant Clerk secret lands as ciphertext (the raw Postgres column never exposes plaintext), an authorized read round-trips to the original value using the OpenBao/ESO-sourced key, and when the key is unavailable the path fails closed (no plaintext write, no default-key boot).
*Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2101); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given a per-tenant Clerk secret written to the tenancy DB, When the row is inspected at rest, Then the secret column holds ciphertext, not plaintext. *assert: raw column value ≠ plaintext; decrypts only via the helper* [Source: ADR-0015 PxoUAiGN29 ruling 7a]
- [ ] **AC2** — Given the encryption helper, When it obtains its key, Then the key is sourced from OpenBao via ESO — never a hardcoded literal or plain env value. *assert: key material resolves from the ESO-injected source; no key literal in code/config* [Source: ADR-0015 PxoUAiGN29 ruling 7a]
- [ ] **AC3** — Given a stored ciphertext, When an authorized reader decrypts it, Then it returns the original plaintext secret. *assert: encrypt→decrypt round-trip == identity* [Source: ADR-0015 PxoUAiGN29 ruling 7a]
- [ ] **AC4** — Given the helper's envelope, When a value is encrypted, Then it carries a key id/version so the key can be rotated without re-authoring the helper. *assert: ciphertext envelope tags its key id/version* [Source: ADR-0015 PxoUAiGN29 ruling 7a]
- [ ] **AC5** (negative) — Given the ESO-sourced key is unavailable at boot, When a write is attempted, Then the path fails closed (no plaintext fallback, no default/empty-key boot). *assert: missing key → error, never a plaintext or default-key write* [Source: ADR-0015 PxoUAiGN29 ruling 7a]

## 🔨 Tasks

- [ ] RED: test ciphertext-at-rest, ESO-sourced key (no literal), round-trip identity, key-id envelope, fail-closed-on-missing-key (AC1–5).
- [ ] GREEN: author the envelope AEAD encryption helper keyed off the OpenBao/ESO-injected key; apply encrypt/decrypt on the per-tenant Clerk config persistence seam; tag the key id/version in the envelope; fail-boot/fail-write when the key is absent (AC1–5).

## 🧠 Context

**🧾 Gap provenance (2026-07-14):** Filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed: identity E4-S6 storied the admin *authz* over the Clerk config and E8 storied *infra* secret delivery (ESO/Crossplane), so ADR-0015 ruling 7a's at-rest encryption *helper* for the DB-held secrets fell in the seam between "authz" and "delivery" — no lib/identity story authored the helper itself.

Tier: data/store tier — sits on the tenancy-DB persistence path (E8-S1) beneath the admin config surfaces (E4-S6). Seam: OpenBao→ESO key injection; Postgres per-tenant Clerk config column. The per-tenant Clerk config is what CLOUD multi-tenant mode reads at request time, so plaintext-at-rest here is a live blast radius.

## 🧪 Testing

`TestClerkConfigAtRestEncryption` (integration, real Postgres testcontainer) — asserts ciphertext-at-rest + round-trip + fail-closed; a helper-level unit test covers the AEAD envelope + key-id tagging. CS §5: real store, exercise the encryption seam for real; no own-package mocks of the key source.

## 📏 Guidance

CS 6aMAzsYeQb §§0/3/4/5/6/7/10/11 (esp. §6/§7 security — secrets never plaintext at rest, no fallbacks). SE-Arch 8sYi523i4t: Security lens (at-rest encryption, key sourced not baked, fail-closed on missing key). cell-lint JGAUQRsw2g.

## 🔗 References

ADR-0015 `PxoUAiGN29` ruling 7a (identity-owned tenancy DB; at-rest encryption helper, OpenBao/ESO-sourced key); PRD `cnhla0qRRF` §4 F6 (FR-I16 persistence); Architecture `dQUjrSXhdp` A-DATA; OpenBao/ESO secret delivery (E8 / infra).

## 🔗 Dependencies

Blocked by: **ENG-2101**. Project **Orvex Studio Identity**, milestone **B8 — Persistence, cell-contract conformance & security ops**; parent epic **E8**. Sits on: E8-S1 (tenancy-DB persistence where the encrypted column lives); underpins E4-S6 (admin Clerk-config surfaces). Consumes the ESO-injected key delivered by infra.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN") → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
