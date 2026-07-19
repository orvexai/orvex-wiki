**HANDOFF — Task 2 (component architecture) landed as a draft.** Produced via **bmad-architecture** (Fast path), feature-altitude component spine inheriting the initiative spine `iiCcKhGptV`.

**Artifact:** `ViWUZj1MrW` in `orvexstudioextension` (status=draft, doc_type=architecture) —
https://docs.eu-central-1.myidp.cloud/s/orvexstudioextension/p/architecture-orvex-studio-extension-cross-ai-delivery-ViWUZj1MrW
Local bmad deliverable: `_bmad-output/planning-artifacts/architecture/architecture-extension-2026-07-15/ARCHITECTURE-SPINE.md` (status: final) + `.memlog.md` + `reviews/`.

**Loop:** opus-plan → sonnet-write → opus-adversarial-review → sonnet-fix, then the **bmad Reviewer Gate** (deterministic `lint_spine` + 3 parallel lenses).

**Reviewer gate did real work — FAIL → fix → PASS.** The adversarial-incompatibility lens found **7 divergence pairs** where two build stories could each obey every AD-EXT yet build incompatibly; all closed, opus re-review **PASS**:
- **2 CRITICAL** — `composeInto` was one name for two irreconcilable ops → **split into Shape 1a** (api compose-validation, seam/codegen'd, `{validated|refused}`) and **Shape 1b** (the AD-5a client DOM port, in-process, EXCLUDED from codegen); and the delivery token couldn't carry `composedTextRef` → **token scope now `{memory,target,user,composedTextRef}`** with hash-equality validation (closes the post-mint content-swap gap).
- **4 HIGH** — tier authority pinned to the remote signed JSON (registry carries no resolved value); token bound to the delivery **attempt** (spent on client-reported terminal outcome, so GO-canary-fail→copy reuses the same token/consent and the audit reflects the real mechanism); **server audit = sole compliance system-of-record**; **identity re-resolves scope server-side authoritatively** (client scope is a fail-closed `asserted-scope`).
- **1 MEDIUM** — `data-orvex-initialized` split into `data-orvex-attached` (SPA) + `data-orvex-last-delivery` (canary, non-blocking).
- **+ AD-EXT-9** (new) — backend env-injected, **no baked default** (the family's config-parity discipline: dev-cell vs prod is an explicit build-time selection, a missing URL is a build failure). CWS restriction re-cited under the *Malicious and Prohibited Products Policy*.

**Spine = 9 AD-EXT invariants** realizing the parent's AD-5a/6/8/11 + I-1/I-4 read-only. The load-bearing reconciliation is **AD-8**: the extension is a consent-UX surface + delivery-token **presenter**, never itself a trust boundary — consent/firewall/scope enforce server-side at the identity mint. Web-currency lens **PASS** (WXT 0.20.27 / TS 7.0.2 / React 19.2.7 / @types/chrome 0.2.2 / Vitest 4.1.10 verified current; supermemory/mem0/policy dates confirmed to the day).

**Adopted verbatim, never laundered:** the `V6hlDjecfh` tiers (ChatGPT/Gemini GO, Claude/Grok DEGRADE, 0 NO-GO; FR-D1 "without copy/paste" withdrawn for Claude+Grok) and all four caveats; the `IgOjzk034v` fork/donor plan with the canary / AD-6 review-pause / GO-DEGRADE split / degrade-UI / backend wiring kept **build-fresh** (not credited to the fork).

**Carries the 4 hard build preconditions** (none discharged here): legal counsel on automated-means + CWS facilitation; store-policy viability; **live-DOM prototype per GO provider incl. the closed-shadow-DOM go/no-go**; the Wave-1 contract **TAG** (ENG-2037 / ENG-2091, both Todo) — authored the contract **shape**, never claimed a tag.

Definitional pre-work — **does NOT unblock the pack** (still blocked-by ENG-2037 + the counsel precondition). Reviewer ≠ author gate = **PASS**; requesting **doc-ratify** (AI never self-promotes to canon). Next pack artifact in sequence: the contract (Shape 1a/2/3) + tag, Wave-1-gated.
