## 🎯 Story

As the **extension's configuration + contract seam**, I want **provider tier (GO/DEGRADE) and selectorPackVersion to be resolved SOLELY from a versioned, remote-fetched, signed JSON channel (fail-safe to DEGRADE on absent/malformed/invalid-signature/stale config), and the three contract Shapes (1a/2/3) authored in `orvex-studio-contracts` and consumed via a generated TS client with an AGPL-import/license denylist + drift gate — with the Shape 1b `composeInto` DOM port explicitly excluded from the seam**, so that a tier flip is a signed-config push (not a store-review cycle), the in-code provider registry never becomes a second owner of `tier`, and the client and the DOM adapter can never collide on one generated name.

**Definition of Done:** `TestTierIsSignedDataAndContractSeamCodegen` (integration) — the live `tier`/`selectorPackVersion` are read only from the signature-validated remote JSON (the in-code registry carries only static identity + pointers); a provider defaults to DEGRADE when its config is absent, malformed, signature-invalid, or stale beyond max-age; Shapes 1a/2/3 are consumed via the generated TS client guarded by an AGPL/license denylist + drift gate; and Shape 1b is absent from codegen/the drift gate.
*The Shape 1a/2/3 git-TAG is Wave-1-gated (blocked on the contracts seam, ENG-2037 / ENG-2091); this story authors/consumes the SHAPE and is dispatch-gated at Definition-Pack certification (ENG-2690) — it never claims a tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given provider config, When the extension resolves a provider's live `tier` and `selectorPackVersion`, Then both are read **solely from the versioned, remote-fetched, signed JSON channel** — the in-code provider registry carries only static identity + pointers (`tierConfigRef`/`selectorPackRef`), never a resolved `tier`, `writeStrategy`, or pinned pack version. *assert: grep the registry finds no `tier`/`writeStrategy`/pinned-version literal; tier is read only from the verified remote config.* [Source: ViWUZj1MrW AD-EXT-2]
- [ ] **AC2 (fail-safe)** — Given the provider config is **absent, malformed, signature-invalid, or stale beyond max-age**, When the extension resolves tier, Then the provider **DEFAULTS to DEGRADE (copy/paste)** — never GO. *assert: each of the four bad-config cases resolves tier=DEGRADE.* [Source: ViWUZj1MrW AD-EXT-2]
- [ ] **AC3** — Given a signed config push, When it is applied, Then a **tier flip happens without a code/store change** and only a signature-valid config is honored. *assert: a signature-invalid config is rejected; a valid pushed config flips tier with no rebuild.* [Source: ViWUZj1MrW AD-EXT-2; FR-BC7]
- [ ] **AC4** — Given the contract seam, When the client is built, Then **Shapes 1a (compose-validation + outcome-report), 2 (consent-delivery-token mint/present), 3 (breakage-canary telemetry)** are consumed via the **generated TS client (never hand-rolled)**, guarded by an **AGPL-import/license denylist + drift gate**. *assert: the client is codegen-emitted; the denylist is RED on a planted AGPL import; the drift gate is RED on a hand-edited type.* [Source: ViWUZj1MrW AD-EXT-8]
- [ ] **AC5 (exclusion)** — Given the Shape 1b `composeInto(target, text) -> {ok | needs-manual-paste}` client DOM port, When codegen and the drift gate run, Then Shape 1b is **excluded** — never emitted by the TS client and never a drift-gate symbol. *assert: no generated `composeInto` seam symbol; the drift gate ignores the in-process DOM port.* [Source: ViWUZj1MrW AD-EXT-8]

## 🔨 Tasks

- [ ] RED: `TestTierIsSignedDataAndContractSeamCodegen` (AC1, AC2, AC5).
- [ ] GREEN: signed remote JSON tier/selector-pack channel with signature validation, max-age staleness, and DEGRADE-default fail-safe; registry holds static identity + pointers only (AC1–AC3).
- [ ] GREEN: generated TS client over Shapes 1a/2/3 with AGPL/license denylist + drift gate; Shape 1b excluded from codegen and the drift gate (AC4, AC5).

## 🧠 Context

**🧾 Gap provenance (2026-07-15):** traceability-matrix sweep (225 canon pages, id-level join). AD-EXT-2 and AD-EXT-8 both surfaced uncovered against the ENG-2711..2730 corpus. Both carry a real build delta (not pure design principle): AD-EXT-2 mandates the signed-remote-config channel with a precedence + fail-safe rule; AD-EXT-8 mandates the authored contract Shapes + generated client + denylist/drift gate + the Shape 1b exclusion. Cohesive as one ticket — both are the data/contract seams the service worker consumes.

Tier: `entrypoints/background/` (the ONLY Orvex-backend caller — pack fetch+verify, contract client) + `packages/contracts-client/` (generated). The precedence rule (AD-EXT-2) closes the two-owners gap with the AD-EXT-1 registry; the Shape 1b exclusion (AD-EXT-8) is what prevents the generated client and the DOM adapter from colliding on one name. Canary telemetry (Shape 3) rides `api` over the same generated client (never CloudEvents, never a direct broker touch — AD-EXT-5).

## 🧪 Testing

`TestTierIsSignedDataAndContractSeamCodegen` (integration). Tiers: unit (signature/staleness/DEGRADE-default resolver; codegen exclusion check) + integration (signed-config push flips tier; generated-client round-trip). CS §5: exercise the real fetch+verify + real codegen output; mock only the remote-config HTTP edge.

## 📏 Guidance

CS `6aMAzsYeQb` §§0/3/10/12 (no baked defaults; generated typed structs never `any`; ADR trigger on the highest-blast-radius contract surface). SE-Arch `8sYi523i4t`: Reliability (never-white-screen fail-safe to DEGRADE), config-as-data. Every contract change is a CS §3.7 design-it-twice + CS §9 ADR trigger.

## 🔗 References

Architecture `ViWUZj1MrW` — AD-EXT-2 (tier is data, never code; signed remote JSON; DEGRADE-default fail-safe; precedence over the AD-EXT-1 registry), AD-EXT-8 (contracts seam authored here; generated TS client + AGPL/license denylist + drift gate; Shape 1b explicitly excluded; git-TAG Wave-1-gated on ENG-2037 / ENG-2091). Ties FR-BC7 (versioned remote-JSON selector packs).

## 🔗 Dependencies

Blocked by: **ENG-2690** (Definition Pack — dispatch gate; AC5's git-TAG is Wave-1-gated on the contracts seam ENG-2037 / ENG-2091, both Todo — this story authors the SHAPE, never claims the tag). Project **Orvex Studio Extension**, milestone **B1 — Foundation (MV3 scaffold, build+CI, contracts-codegen client)**.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
