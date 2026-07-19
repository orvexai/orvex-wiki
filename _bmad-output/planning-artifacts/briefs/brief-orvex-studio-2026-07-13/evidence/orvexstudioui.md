Digest of space `orvexstudioui` (mirrored 2026-07-13T08:28:50Z, 3 pages, no ADRs in-space)

## 1. Mandate

`orvex-studio-ui` is the Orvex AI Studio front-end: a thin, presentational **React SPA** (Vite+TS) extracted from the `orvex-prompt-studio-poc` monolith. It renders every Studio surface (app shell/first-run, marketplace/Discover, Skill Viewer/Builder, private Memory FormSpec onboarding, Improve-with-AI, Export/Share, Library, and Phase-2 surfaces — Demo World, Chat-History Import, Curator desk, Your Wiki omnibox, pricing/billing) but holds **no business logic, no data store, no secrets**. It talks to exactly one upstream, `orvex-studio-api` (its BFF), over `/api`; the only non-BFF egresses are Clerk (session UI) and Stripe-hosted redirects. Ships as a single global URL (`orvex.ai`/`orvex.dev`/`crew-{name}.orvex.dev`) region-agnostically. Proprietary (not AGPL) — poc code reuse is unrestricted.

## 2. Inventory

- PRD: orvex-studio-ui (draft)
- Architecture: orvex-studio-ui (canonical, ratified 2026-07-06)
- Architecture Audit — SE-Arch review (2026-07-05) (canonical)

## 3. Decided vs draft

**Canonical/locked:**
- Architecture page itself is canonical (ratified 2026-07-06, batch approval).
- D-S17: principal model is **polymorphic {user|org}** — solo user = user-keyed, NO Clerk org; only Teams are Clerk orgs. Reverses an earlier org-keyed reading (D-UI8).
- D-S20: one BFF SSE entitlement channel — paywall dissolves <60s without reload; closes OQ-UI10.
- D-S19: GBP-only launch pricing; 14-day grace → auto-downgrade to Free, "never data loss."
- D-S23: 7-day card-required Personal trial.
- D-UI9/D-UI10: Kafka-first event spine day one; single global URL / region-agnostic SPA, Worker routes by `cell` claim.
- A-STATELESS (post-audit fix): SPA attaches the **identity-exchanged, cell-bearing session token**, not the raw Clerk JWT.
- Serving topology (post-audit fix): canon end-state is **Cloudflare Workers Static Assets + Studio Worker**, grey-cloud DNS-only per-cell origins — nginx-origin Deployment is a sanctioned Alpha interim only (OQ-UI4 timing still open).

**Still draft/open:**
- PRD itself is status **draft** (not ratified).
- Studio ADR Decision Records parent + numbering registry: **TBD** — blocks filing 3 identified mandatory ADR triggers (serving topology, Clerk/Stripe external-dep, session-token auth-flow).
- OQ-UI1 (org-chrome timing), OQ-UI2 (redirect tier), OQ-UI3 (SEO prerender), OQ-UI4 (CDN posture/timing), OQ-UI5 (which repo ships Phase-2 Alpha), OQ-UI7 (DS as-is vs Tailwind), OQ-UI8 (chat-stream protocol) all open.
- NFR-UI10 (entitlement freshness, ENG-1570) is an **appended draft addendum pending human doc-ratify fold-in** — explicitly "never self-promoted to canonical by this Issue."

## 4. API/contract surface

- Single seam: SPA → orvex-studio-api over same-origin `/api` (REST + SSE), via Cloudflare Worker.
- Wire DTOs + SSE grammars (`scaffold_proposed/committed`, `section`, `done`, PacingGate, improve response, entitlement verdict shape) are **pinned in `orvex-studio-contracts`** repo — SPA is "a conformant consumer... not the author."
- No OpenAPI/swagger artifact named directly in these pages; contract lives in a separate contracts repo (deltas to file there).
- Two true-external non-BFF seams: Clerk Frontend API (session UI) and Stripe-hosted Checkout/Portal (redirect-only, no Stripe SDK/card data — confirmed posture OQ-UI6).
- Entitlement freshness budget machine-checked via `nfr-budget.json`'s `entitlement-freshness` key (60,000ms ceiling), referenced by ENG-1570.
- Engine cross-ref: wiki-touching writes can return engine's **402 QUOTA_EXCEEDED** (F-QUOTA chokepoint) — SPA renders only, never computes.

## 5. Delivery state

- **Repo is a single-commit scaffold** (commit `ae0400d`). Real files: package.json (React 19.1+Vite 7+TS 5.8, **no test runner, no eslint, no data-fetch lib, no contracts codegen dep**), placeholder `src/App.tsx`, vite.config.ts (dev-proxy, `sourcemap: true` — flagged info-leak), two-stage Dockerfile → nginx:1.27-alpine, kustomize manifests with **HTTPRoute self-labelled a STUB** and `cloudflare-proxied: "true"` (contradicts canon's grey-cloud posture).
- **No CI**: no `.github/workflows`, not enrolled in the org-level `cell-lint` required-status ruleset.
- README/CLAUDE.md explicitly say "Status: scaffold — PRD/architecture in progress" — audit calls this "honestly-labelled... no fake-done."
- §3 of architecture doc explicitly states surfaces are "design targets, not claimed-built."
- Poc predecessor (`orvex-prompt-studio-poc`) is live/shipped (Phase 1: 15/15 milestones, 83/83 stories, 2026-07-02) — this repo is the strangler extraction destination, not yet flipped.
- Rollout plan: step 1 (parity extraction) not yet executed; Phase-2 Alpha targeted ~2026-07-23 but OQ-UI5 unresolved on which repo ships it.

## 6. Gaps & tensions

- PRD status draft vs Architecture status canonical — asymmetric ratification for a single service.
- ADR-registry gap: 3 SE-Arch-mandatory ADR triggers identified (serving topology, Clerk/Stripe external dependency, session-token auth-flow change) but **cannot be filed** — the Studio Decision Records parent/numbering registry doesn't exist yet.
- Serving-topology drift: scaffold ships orange-proxied nginx origin; canon wants Workers Static Assets + grey-cloud origins — explicitly flagged as contradicting canon, not merely incomplete.
- Prior cross-doc contradiction (this doc vs peer studio-api doc on org-keyed vs polymorphic principal) was reconciled via D-S17, but change-log shows it required an explicit "REVERSED — retained for provenance" annotation, i.e. drift already happened once.
- CI/quality-gate absence means A-DS ship-gates (axe/WCAG AA, DS token-fidelity lint) are **unlanded**, despite being called "hard gates" in the PRD (G5, NFR-UI2/UI3).
- Minor tracked debt: prod sourcemaps enabled (info leak), caret-range deps (not pinned per CS §5).
- OQ-UI5 is a real sequencing risk: Phase-2 Alpha clock (07-23) vs strangler-extraction-first — unresolved which repo ships Alpha features.
