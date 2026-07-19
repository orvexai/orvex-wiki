# Recheck: orvexstudioui vs brief-orvex-studio-2026-07-13

Scope: PRD `xsRMrju3D1`, Architecture `DmJsnB5Z9Y`, Architecture Audit `1dFHMUtcKS`. Architecture + Audit pages are engineering-detail (topology, seams, ADR triggers, CI) — out of scope per instructions; only the PRD carries product-level material, checked below against the brief's coverage and its Scope Out / Open lists.

## Candidate gaps

- **Page:** PRD: orvex-studio-ui (`xsRMrju3D1`), FR-UI20.
  **Missed concept:** "Demo World" — a guided, demo-data-populated onboarding mode used as the primary aha-moment device before real onboarding, distinct from the FormSpec streaming onboarding the brief describes.
  **Quote:** "the persistent banner on **every authenticated route** naming the exit action; the guided first-run (≤5 steps, skippable, resumable...) with the **visible demo-mode enrichment citations** ("used: Year 9 syllabus, your grading rubric") — the aha mechanic that production keeps silent."
  **Why it matters:** the brief's whole "knowledge loop" onboarding narrative is FormSpec-only; it never mentions a demo/sample-data walkthrough as a persona-onboarding device, an omission the brief neither adopts nor consciously scopes out.

- **Page:** PRD: orvex-studio-ui (`xsRMrju3D1`), FR-UI26, D-S23, D-S19.
  **Missed concept:** concrete trial/pricing packaging mechanics — a 7-day **card-required** trial, **GBP-only at launch**, and a 14-day dunning grace before auto-downgrade.
  **Quote:** "the **7-day card-required Personal trial** (D-S23 — a card IS captured up front to start the trial)... on lapse — the D-S19 dunning truth (**14-day grace → auto-downgrade to Free; never data loss**)." Also: "prices display **VAT-inclusive** — **GBP-only at launch**."
  **Why it matters:** these are user-facing packaging/trust decisions (card-upfront friction, currency restriction, grace-period promise) the brief's Scope/Open sections don't mention at all — the brief's Open list only flags "the exact £ price point" and tier composition, not trial mechanics, currency scope, or the dunning promise, so this isn't a conscious exclusion.

- **Page:** PRD: orvex-studio-ui (`xsRMrju3D1`), FR-UI16.
  **Missed concept:** named five-AI export as a first-class flagship feature — deterministic export formatters for ChatGPT, Claude, Gemini, Grok, Copilot with "Open {engine} →" affordances, Copy as a permanently non-degrading Tier-1 feature.
  **Quote:** "Export renders correctly-formatted artifacts for **ChatGPT, Claude, Gemini, Grok, Copilot**... Copy is Tier-1 and never degrades."
  **Why it matters:** the brief's Prompt Composer section describes composing "a prompt that works in any AI" only abstractly; it never names this concrete, named-competitor export/copy mechanic as a product feature, which is one of the more externally visible (and marketing-relevant) capabilities of the product.

- **Page:** PRD: orvex-studio-ui (`xsRMrju3D1`), FR-UI10.
  **Missed concept:** "Professional Mode" — a Beta toggle that flips Memory + Curator surfaces to a sober/professional skin with full functional parity, alongside the default expressive skin.
  **Quote:** "**Professional Mode** (FR-54a, Beta) flips Memory + Curator surfaces to the sober skin with full functional parity — both skins pass the same scale + AA gates."
  **Why it matters:** the brief's "three-surface arc" ties consumer/business/enterprise differentiation to UI + entitlements generically, but never mentions this specific dual-skin (expressive vs professional) mechanism as the concrete vehicle for that differentiation within a single UI — a persona/positioning detail worth at least a conscious scope note.

No other product-level gaps found: Memory wall/provenance, sensitive-consent, Curation Queue, Chat-History Import, Your Wiki omnibox/Ask, Connections/MCP write-modes, and the honesty/draft-vs-committed rendering invariants in the PRD all restate or specialize concepts the brief already covers (Librarian ritual, private memories, propose-and-confirm, chat-history import, Prompt Composer/RAG) at a level the brief already reaches.
