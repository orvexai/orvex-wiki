## 🎯 Story

As a **build agent**, I want **every memory surface to be i18n-capable — strings externalized, a locale provider plumbed, English shipped first — proven by a pseudo-locale ship-gate** so that **the EU-beachhead locale phasing can land later without a re-string rewrite, and English-first never hard-codes us out of localization** (NFR-7).

**Definition of Done:** ONE named test `TestMemorySurfacesI18nReadyWithPseudoLocale` — a CI i18n-gate test that boots every memory surface under a pseudo-locale (accented + ~35% expanded), asserting (a) zero inline user-facing literals leak through un-catalogued, (b) all strings resolve via the single plumbed locale provider with English as the fallback, and (c) layout survives expansion with no truncation/overlap, verified through the rendered pseudo-locale surfaces + gate result. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given every memory surface, When the i18n lint runs, Then no user-facing literal string remains inline; all resolve through the message catalog. *Assertion: pseudo-locale render shows zero Latin-passthrough (untranslated) user-facing strings.* [Source: NFR-7]
- [ ] **AC2** — Given a selected locale, When the app boots, Then the active locale resolves via a single plumbed provider, English is the default, and a missing key falls back to English (never blank/key-name). *Assertion: missing-key render == English string, not empty or raw key.* [Source: NFR-7, g9vWbSYplh]
- [ ] **AC3** — Given the pseudo-locale, When memory surfaces render, Then all strings are accented + expanded and layout survives ~+35% expansion with no truncation or overlap. *Assertion: `TestMemorySurfacesI18nReadyWithPseudoLocale` — expansion snapshot has no clipped/overlapping text.* [Source: NFR-7]
- [ ] **AC4** — Given OQ7 (locale priority) is unresolved and owned by GTM, When the scaffolding lands, Then only English is enabled and no EU-beachhead locale is ordered or shipped; the phasing hook exists but its enabled-locale list is `[en]` only. *Assertion: enabled-locales == ["en"]; no locale order committed.* [Source: NFR-7, OQ7]
- [ ] **AC5 (negative)** — Given a newly added memory-surface string authored as an inline literal, When the i18n gate runs, Then the build fails. *Assertion: seeded hard-coded string → non-zero exit.* [Source: NFR-7]

## 🔨 Tasks

- [ ] RED: `TestMemorySurfacesI18nReadyWithPseudoLocale` with a seeded inline literal (AC1/AC3/AC5).
- [ ] GREEN: string externalization sweep + message catalog over the memory surfaces (AC1); locale provider plumbing with English default + missing-key fallback (AC2); pseudo-locale generator + expansion snapshot runner (AC3).
- [ ] GREEN: English-only enabled-locale list behind an empty phasing hook — no locale order committed (AC4); wire the gate into the CI required-status suite alongside the a11y gate (AC5).

## 🧠 Context

**🧾 Code audit (origin/main @ 74c2a39, 2026-07-14):** absent — no string externalization / message catalog / locale provider on any memory surface; user-facing strings are inline literals and the shipping a11y gate (E8-S1) is WCAG-only, with no i18n dimension.

**🧾 Gap provenance (2026-07-14):** this story was filed by the post-decomposition gap-hunt (adversarially verified) — NFR-7 i18n readiness had **zero** i18n/locale/localization hits across all 575 story titles, and the ui accessibility ship-gate was WCAG-only, so i18n readiness slipped between the a11y gate and the feature surfaces and ended up owned by nobody. This lands the scaffolding (externalization + locale plumbing + pseudo-locale test) **without** committing locale order — OQ7 is deferred to GTM.

Cross-cutting NFR ship-gate (CS §6 view + §11 honest states; A-DS). Seam: CI (E1-S1 harness), same required-status suite as the E8-S1 a11y gate. Sibling dependency: E1-S1 (harness), E1-S3 (skins), every memory feature surface to externalize. English-first is a shipping decision, not a code lock-out — the gate proves the surfaces stay locale-ready.

## 🧪 Testing

`TestMemorySurfacesI18nReadyWithPseudoLocale` (CI i18n-gate) + per-surface catalog-coverage unit runs. CS §5 mocking: none of our own; run against the real rendered surfaces under the pseudo-locale, exactly as the a11y gate runs against the real built bundle.

## 📏 Guidance

- CS `6aMAzsYeQb`: §11 honest states (English fallback, never blank/raw key) · §6 shallow view · §4 gate discipline · §0 adversarial review.
- SE-Arch `8sYi523i4t`: NFR-as-gate lens — bake i18n readiness into CI now so localization is not a late re-string rewrite; do not commit a locale order the product has not decided.
- Cell-lint `JGAUQRsw2g` §5: part of the required-status suite.

## 🔗 References

Cross-cutting NFR canon `g9vWbSYplh` (NFR-7, OQ7) · PRD `xsRMrju3D1` (NFR ship-gates) · Architecture `DmJsnB5Z9Y` §2 (A-DS) §7 · DS `C9ufBCuXsy`.

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate). Project: Orvex Studio UI · Milestone: B8 — Cross-cutting quality & NFR ship-gates.
- [ ] **Must-resolve (does NOT block scaffolding):** OQ7 — locale priority / EU-beachhead order, owned by GTM; only the enabled-locale list waits on it, the scaffolding does not.
- [ ] **Parent epic:** E8.
- [ ] **Intra-service order:** after E1-S1/S3; runs continuously against every memory feature surface (E3+).

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
