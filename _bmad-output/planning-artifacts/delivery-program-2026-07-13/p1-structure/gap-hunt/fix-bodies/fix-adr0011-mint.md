## 🎯 Story

As the **org→cell registry (global control plane)**, I want the registry to **MINT** `cell` and `cell_epoch` into the tenant's Clerk org/user metadata and into a **Keycloak protocol-mapper (config-as-code)**, so that the cell claim is written to the IdP at the source of truth and every downstream token carries the correct cell as a **carrier-not-owner** claim (the registry owns the value; the token only carries it).

**Definition of Done:** `TestRegistryMintsCellClaimIntoIdp` (integration layer) — when the registry assigns/updates a tenant's cell, it writes `cell` + `cell_epoch` into Clerk org metadata (and user metadata where the user is org-scoped) and the Keycloak mapper is provisioned from config-as-code such that a freshly-minted token surfaces the matching `cell`/`cell_epoch`; on cell reassignment the epoch increments and the new value is mirrored to both IdP paths.
*Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2101); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given the registry assigns a tenant to a cell, When the assignment commits, Then `cell` + `cell_epoch` are written into the tenant's Clerk **org** metadata. *assert: Clerk org metadata `cell`/`cell_epoch` == registry routing-core value* [Source: ADR-0011 #4]
- [ ] **AC2** — Given an org-scoped user, When cell metadata is minted, Then `cell`/`cell_epoch` are mirrored to Clerk **user** metadata so user-context tokens carry the same claim. *assert: Clerk user metadata `cell`/`cell_epoch` == org value* [Source: ADR-0011 #4]
- [ ] **AC3** — Given the Keycloak realm, When provisioned, Then the `cell`/`cell_epoch` protocol-mapper exists as **config-as-code** (not console-clicked) and stamps the claim onto minted tokens. *assert: mapper present in committed realm config; minted token surfaces `cell`/`cell_epoch`* [Source: ADR-0011 #4]
- [ ] **AC4** (carrier-not-owner) — Given a token carrying `cell`, When the registry value and the token value diverge, Then the **registry** value is authoritative and the token is treated as a stale carrier. *assert: registry routing-core is source of truth; token value never overrides it* [Source: ADR-0011 #4]
- [ ] **AC5** (reassignment) — Given a tenant is moved to a new cell, When the registry re-mints, Then `cell_epoch` increments and both Clerk metadata and the next Keycloak-minted token reflect the new `cell`/`cell_epoch`. *assert: epoch monotonic-increments; both IdP paths mirror the new value* [Source: ADR-0011 #4]

## 🔨 Tasks

- [ ] RED: test mint into Clerk org+user metadata, Keycloak mapper config-as-code presence, epoch-increment on reassignment (AC1–3,5).
- [ ] GREEN: wire the registry mint/write path to Clerk org+user metadata; add the Keycloak `cell`/`cell_epoch` mapper as committed realm config-as-code (AC1–3).
- [ ] GREEN: epoch bump + dual-path mirror on cell reassignment; keep registry routing-core authoritative over any token-carried value (AC4,5).

## 🧠 Context

**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed — decomposition storied only the **PARSE** side of ADR-0011 #4 (lib `pkg/auth` cell-claim parse); the **MINT/write** side — registry → Clerk metadata + the Keycloak mapper config-as-code — was never wired to a story, so tokens would be parsed for a `cell` that nothing ever writes.

Tier: registry service → IdP-mint domain → Clerk (org/user metadata) + Keycloak (protocol-mapper, config-as-code). This is the write-half of the cell-claim contract; the parse-half lives in `lib pkg/auth`. Carrier-not-owner: the registry routing-core (E6-S1) is authoritative; the IdP metadata + token claim are mirrors, not the record. Seam: Clerk metadata API + Keycloak realm config-as-code are external boundaries — mock at the vendor edge, exercise the mint path real.

## 🧪 Testing

`TestRegistryMintsCellClaimIntoIdp` (integration). Tiers: integration. CS §5: mock Clerk + Keycloak at the vendor boundary; exercise the registry mint/write path and the committed realm config real; no own-package mocks.

## 📏 Guidance

CS 6aMAzsYeQb §§0/3/4/5/6/7/10/11. SE-Arch 8sYi523i4t: Security/data-residency (cell as routing claim), config-as-code (Keycloak mapper committed, not console-clicked). cell-lint JGAUQRsw2g.

## 🔗 References

ADR-0011 `qZFmNWGY47` (Canonical, ratified 2026-07-07) decision #4 — cell claim carrier-not-owner; registry mints `cell`/`cell_epoch` into Clerk org/user metadata + Keycloak mapper. Parse-side sibling: `lib pkg/auth` cell-claim parse.

## 🔗 Dependencies

Blocked by: **ENG-2101** (contract TAG: cell-claim mint contract); project **Orvex Studio Identity**, milestone **B6 — Global org→cell registry & routing (the only global component)**. Intra-service must-resolve: **E6-S1** (routing-core is the authoritative `cell`/`cell_epoch` source this story mirrors). Pairs with the `lib pkg/auth` parse-side story (carrier-not-owner two-sided contract).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN") → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
