
# Architecture: Orvex Studio Extension — Cross-AI Delivery

**Status: DRAFT (pending human doc-ratify, CS §12).** This is Task 2 of the ENG-2690 Definition Pack, authored after the PRD (`QpVnEF7aEU`) and its addendum (`5t8uxVnnA4`), before the contract/SDD/build-prompt. It targets zero architecture decisions left for the build agent across ENG-2711..2730.

**Two hard build preconditions carried forward, never laundered away (full list in §10):**
- Legal-counsel review of the "automated means" ToS interpretation (Claude, Grok) and the Chrome Web Store third-party-ToS-facilitation policy — blocks shipping injection for any provider and blocks store submission.
- A live-DOM prototype per GO provider that explicitly rules closed-shadow-DOM IN or OUT (not merely validates selectors) — a categorical go/no-go feeding the tier-by-config path, most salient for Gemini.

**Contract tag status:** the contracts SHAPE is authored in §8 of this document. The git-TAG on `orvex-studio-contracts` — the ENG-2690 AC5 dispatch gate — does **not yet exist**; it is **BLOCKED on the Wave-1 contracts seam (ENG-2037 / ENG-2091, both Todo)**. No build story dispatches before the tag lands and fixtures are green.

## Design Paradigm

**Ports-and-adapters delivery client on MV3.** The extension realizes the initiative spine's single AD-5a compose port (`composeInto(target, text) -> {ok | needs-manual-paste}` — Shape 1b, §8, an in-process interface EXCLUDED from the contracts seam) as one `DeliveryAdapter` interface with four per-provider adapters (AD-EXT-1). The MV3 layering maps to namespaces: the **service worker** is the orchestration + I/O edge (Orvex backends, token mint/present, signed-pack fetch, telemetry) at `entrypoints/background/`; the **per-provider content scripts** are the isolated-world adapters that own DOM resolve/insert/read-back only at `entrypoints/content/<provider>.ts`; the **popup** is a strictly presentational React shell at `entrypoints/popup/`. Trust runs one way — the extension is an untrusted client; consent, the personal↔employer firewall, and scope enforce server-side at the identity mint boundary (AD-8): the client presents tokens, it never decides them. Inherited from the parent spine's "delivered into any AI through a mechanism-agnostic adapter", fixed to the MV3 mechanism the viability spike resolved.

## Stack (seed)

Verified current via the npm `latest` dist-tag (CS §14) on 2026-07-15; the code owns these once it exists.

- **WXT** — 0.20.27 (extension framework / build tooling; the supermemory fork base)
- **TypeScript** — 7.0.2
- **React** — 19.2.7 (popup / UI shell only, presentational)
- **@types/chrome** — 0.2.2 (MV3 platform typings)
- **Vitest** — 4.1.10 (unit / adapter tests; the provider DOM is the only mocked boundary, CS §5)
- **Generated TS client** — from `orvex-studio-contracts`; version is **Wave-1-gated** (the tag is not yet cut — ENG-2037 / ENG-2091). Never hand-rolled (AD-EXT-8).

Manifest V3 is the platform target (a Chromium spec, not a pinned dependency); Firefox AMO is a phased target (§12). There is no server-side runtime, image, or datastore — the extension holds no system of record (AD-EXT-7); its only build artifact is the reproducible store bundle (§11). Backend environment (dev cell vs. prod) is env-injected per build, with no baked-in default (AD-EXT-9).

## Consistency Conventions

- **Naming / files** — per-provider adapters at `entrypoints/content/<provider>.ts` (`chatgpt`, `gemini`, `claude`, `grok`); the DOM lifecycle attributes are SPLIT and single-owner — `data-orvex-attached` (per-adapter SPA/observer-attach lifecycle) and `data-orvex-last-delivery` (shared canary, non-blocking — a repeat delivery into the same node is a permitted fresh per-use action; no single attribute encodes both "wired" and "delivered," §5); the provider registry is the single add/remove point (AD-EXT-1).
- **Data & formats** — selector packs and tier config are versioned, signed remote JSON on ONE channel (AD-EXT-2 / FR-BC7); the canary telemetry event shape is fixed (Shape 3, §8): `providerId, selectorPackVersion, failureClass, tier, timestamp`; contract bodies cross the seam as generated typed structs, never `any` (CS ❌#12).
- **State & cross-cutting** — all UI state derives from the service worker (the popup is presentational, CS §6); the delivery token is single-target / single-use / short-TTL, re-minted per action (AD-8 / AD-EXT-3); every provider-page touch is synchronous with an explicit user action (AD-6); operational telemetry rides metrics (OTLP) + logs (Loki) via `api`, never CloudEvents (CS §10, §11); config via env / build injection only, no embedded secrets (CS §10); the fail-safe direction is always toward DEGRADE / copy-paste / re-auth — never white-screen (NFR-4).

## Structural Seed

Cold-start source tree (WXT layout; the code owns the detail once it exists):

```text
orvex-studio-extension/
  entrypoints/
    background/        # service worker: auth/session (AD-EXT-6), pack fetch+verify
                       #   (AD-EXT-2), token mint/present (AD-EXT-3), telemetry (FR-BC5),
                       #   provider registry (AD-EXT-1) — the ONLY Orvex-backend caller
    content/
      chatgpt.ts       # GO       DeliveryAdapter (AD-EXT-1/4)
      gemini.ts        # GO       (shadow-DOM go/no-go gated, AD-EXT-4 / section 6)
      claude.ts        # DEGRADE  (copy/paste)
      grok.ts          # DEGRADE  (grok.com only, OQ-E3)
    popup/             # React presentational shell: connect / consent-preview /
                       #   copy-ready degrade / breakage notice (CS §6)
  lib/
    contracts-client/  # generated TS client over orvex-studio-contracts (AD-EXT-8)
    canary/            # resolve -> verify -> insert -> read-back -> branch (AD-EXT-4)
  packs/               # NOT shipped in-bundle: signed selector/tier JSON, remote-fetched
  wxt.config.ts        # MV3 manifest, least-privilege host_permissions (AD-EXT-5)
```


## 1. Altitude, relationship, and the adopt-vs-decide ledger

**Altitude.** This is a component architecture, one level below the initiative-wide `Architecture Spine: Orvex Memory — Gap Closure` (`iiCcKhGptV`), which is the cross-cutting consistency contract binding `ai` / `knowledge` / `mcp` / `api` / `identity` / `staging` and this delivery client. This document owns the **extension component only** — the realization of the spine's AD-5a client compose port. It inherits the spine's invariants and the umbrella F1 intent (`g9vWbSYplh`) read-only; it decides only what is internal to the extension and its contracts seam.

**Adopted read-only — never re-litigated here, cited and carried:**
- **I-1** — cross-service interaction only through `orvex-studio-contracts` (OpenAPI or a CloudEvent on `studio-spine`); services never share a database; Postgres-only.
- **I-4** — retrieval is always a `knowledge` call made with the caller's delegated principal; `knowledge`'s chokepoint enforces ACL ∩ token-scope regardless of caller.
- **AD-5a** — the port signature `composeInto(target, text) -> {ok | needs-manual-paste}`; paradigm = user-triggered, write-only, single-session compose-box insertion. Mechanism is now RESOLVED by the viability spike (`V6hlDjecfh`) = Chrome MV3 browser extension.
- **AD-6** — the ToS-clean invariant: (1) acts only in the user's already-authenticated session, (2) fires only on an explicit per-use action, (3) writes the input field only — never scrapes/parses model Output at scale, (4) never auto-sends without separate opt-in. Positioned as compose-box autofill, explicitly distinct from prompt-injection tooling — the category Chrome Web Store restricts from **2026-08-01** under its **Malicious and Prohibited Products Policy** (the AI-guardrail-circumvention ban — a separate, distinctly-named policy from the Limited-Use Data policy also shipping in that same release wave). Carries a CWS-2026-08-01 policy-recheck precondition.
- **AD-8** — consent and the personal↔employer firewall bind at the **mint boundary** (`identity`), not at client compose. A delivery fetch mints an identity-owned, single-target, single-use, short-TTL consented delivery token scoped to `{memory, target, user}`; the client cannot compose without presenting one; every per-use action re-mints (a ChatGPT token cannot deliver to Gemini). The client compose is never itself a trust boundary.
- **AD-11** — the Memory card schema, the AD-5a port, and MCP additions are pinned in `orvex-studio-contracts`; `memory.*` CloudEvents ride `studio-spine` against golden fixtures; delivery reads are read-your-writes for the confirming user.
- **`V6hlDjecfh` per-assistant tiers (ADOPTED VERBATIM):** ChatGPT GO, Gemini GO, Claude DEGRADE, Grok DEGRADE — zero NO-GO. Four caveats carried, none discharged by this document: (1) legal-counsel review before shipping injection for any provider — a co-equal analysis in the verdict read Claude and Grok as NO-GO on the persistent-extension mechanism; (2) a live-DOM prototype per provider is required before the canary is trusted — the spike designed the canary but did not DOM-validate it; (3) a Google ToS revision effective 2026-07-30 must be re-diffed before Gemini ships; (4) the CWS 2026-08-01 AI-injector policy must be re-checked (AD-6). For Claude and Grok, copy/paste **is** the delivered path and FR-D1's "without copy/paste" claim is **withdrawn**.
- **`IgOjzk034v` build plan:** fork `supermemoryai/supermemory` (`apps/browser-extension`, MIT), pattern-donate from `mem0ai/mem0-chrome-extension` (MIT, archived), build-fresh the canary, the AD-6 pre-send review pause, the GO/DEGRADE split, the copy/paste degrade UI, and the Orvex memory-enrichment backend wiring.

**Decided at this component level (this document is the source of record):** the AD-EXT set (§2), the MV3 topology (§3), the port and token-presenter flow realization (§4), the per-provider selector/write/SPA strategy (§5), the canary design including the closed-shadow-DOM gate (§6), the trust/security posture (§7), the contracts-seam shape (§8), the fork/build mapping (§9), and the build-story landing (§10).

**The governing reconciliation — FR-CF1..CF4/CF7 vs. AD-8 (stated once, up front, never buried):** The PRD's consent/firewall FRs read as "enforced at delivery/injection." AD-8 says enforcement binds at the identity mint boundary, server-side. These are **not in conflict** once split by role:
- The **extension** is a consent-UX surface and token PRESENTER: it shows the memories it will include (FR-CF1), captures the user's per-use confirmation, discloses the clipboard/deletion boundary (FR-CF3), performs a pre-mint target-identity guard (FR-CF7), and presents the minted token at compose. It never itself decides whether a firewall breach is allowed.
- **`identity`/`api`** are the ENFORCEMENT: they mint the scoped, single-use, short-TTL token (AD-8) and validate it at the compose call; a firewall breach is refused at mint, never merely warned at the client.
Every consent FR in §5 F-D of the PRD is mapped onto exactly one side of this split in AD-EXT-3 (§2).

## 2. Component spine — the AD-EXT decision set (load-bearing, closed at nine)

Each AD-EXT fixes exactly one invariant two build stories could otherwise implement incompatibly. NFR-shaped obligations (i18n, accessibility, etc.) are folded as Rule clauses under the nearest AD-EXT, not treated as new invariants.

**AD-EXT-1 — Delivery is a provider-adapter framework behind one registry.**
- Binds: how a provider plugs into delivery.
- Prevents: four divergent hand-rolled per-provider code paths that drift independently; two owners of a provider's live `tier`/pack-version (the registry and the AD-EXT-2 remote config) disagreeing on inject-vs-copy.
- Rule: one `DeliveryAdapter` interface realizes AD-5a's `composeInto(target, text) -> {ok | needs-manual-paste}` (Shape 1b, §8 — an in-process interface, EXCLUDED from the contracts seam), with per-provider adapters at `entrypoints/content/<provider>.ts` (inherited file layout, §9). A **provider registry** carries ONLY static, code-level identity — `providerId -> {hostMatch, contentScriptEntry}` — plus AT MOST POINTERS, never resolved values (a `tierConfigRef`/`selectorPackRef` pointing at the AD-EXT-2 remote channel, never a `tier`, `writeStrategy`, or pinned pack-version baked into the registry itself). It is the single place a provider is added or removed. Adapters carry NO tier logic (AD-EXT-2) and NO consent logic (AD-EXT-3); `writeStrategy` is owned by §5's per-surface adapter mapping, never the registry (AD-EXT-2 precedence rule). Breakage isolation is per-file, so one provider's DOM change cannot break another (FR-BC isolation, FR-D3).

**AD-EXT-2 — Tier (GO/DEGRADE) is data, never code (FR-PA3, FR-PA6).**
- Binds: how a provider's inject-vs-copy/paste behavior is chosen and changed.
- Prevents: a code rewrite (and a store-review cycle) every time counsel, a provider permission, a ToS revision, or a closed-shadow-DOM finding flips a tier; two owners of `tier` (the AD-EXT-1 registry and this remote config) disagreeing on inject-vs-copy.
- Rule: every provider's tier is a field in the **versioned, remote-fetched, signed JSON** provider config, shipped over the SAME signed data channel as the FR-BC7 selector packs — data, not code, so MV3's no-remote-code rule (FR-TS4 / AD-6) is unaffected. **Precedence (single authority, closes the two-owners gap with AD-EXT-1):** this remote signed JSON is the SOLE authority for the live `tier` and the live `selectorPackVersion`; the AD-EXT-1 in-code provider registry never carries a resolved tier, write strategy, or pinned pack version — only static identity and pointers. A tier flip (DEGRADE→GO after counsel; GO→DEGRADE on a closed-shadow-DOM finding or a ToS loss) is a config push within the FR-BC7 remediation SLA, not a store update. The extension DEFAULTS a provider to DEGRADE (copy/paste) when its config is absent, malformed, signature-invalid, or stale beyond a max-age — fail-safe to the ToS-clean path (CS §10 never-white-screen / graceful-degrade; SE-Arch Reliability). The closed-shadow-DOM go/no-go verdict (AD-EXT-4) feeds this same channel.

**AD-EXT-3 — The extension is a consent-UX surface and token PRESENTER; enforcement is server-side at mint (AD-8, reconciles FR-CF1..CF4/CF7).**
- Binds: where the personal↔employer firewall and per-use consent actually enforce, versus what the client does; the token's binding to a delivery attempt and its consumption/audit timing.
- Prevents: a build story treating the untrusted client compose as the trust boundary and re-composing an already-fetched private card into a different target with no fresh check; a client presenting a different composed bundle than the one consented to; a GO-provider canary failure stranding an already-spent token or forcing an unwanted second consent; a client-asserted scope being trusted as the firewall subject.
- Rule: the client (1) SHOWS the memories it will include, private items flagged, and captures the user's per-use confirmation (FR-CF1); (2) requests a delivery-token mint from `identity` carrying the consented `composedTextRef` (the content-hash of the exact FR-CF1-previewed bundle) and an `asserted-scope` (AD-EXT-6) — `identity` mints a token scoped to `{memory, target, user, composedTextRef}`, with the `user`/scope component SERVER-RESOLVED from the live session (AD-EXT-6), never taken as given from the client; (3) PRESENTS that single-target, single-use, short-TTL token to `api`'s compose-VALIDATION call (Shape 1a, §8), which validates `presented.composedTextRef == token.composedTextRef` by HASH EQUALITY ONLY — `api` never re-derives the text; (4) CANNOT compose without a valid token; (5) RE-MINTS on every per-use action, every target change — a ChatGPT token cannot deliver to Gemini — AND every `composedTextRef` change: a fresh precompute (OQ-E4) that changes the composed text yields a new `composedTextRef` and therefore REQUIRES a fresh FR-CF1 consent and a fresh mint; it can never silently satisfy an already-minted token. The firewall breach, the scope check, and consent validity are ENFORCED at mint/`api`, never merely warned client-side (FR-CF2 breach = hard failure). Client-side FR-CF7 (target-account identity match) is a **pre-mint guard that fails closed to copy/paste** on mismatch or when undetectable — the outward-facing half of the firewall (which identity receives) — while FR-CF2/AD-8 is the inward half (which memory is selected, and the authoritative refusal). The copy/paste fallback is NOT an unconsented side door: the same consent gate and clipboard-exposure disclosure (FR-CF3) apply before copy (FR-BC4/CF1).
- **Token lifecycle — bound to a delivery ATTEMPT, not a transport:** `api`'s Shape 1a compose-validation call RESERVES/validates the token; it does NOT mark it spent and does NOT write the audit. The client then runs the AD-EXT-4 canary (Shape 1b) and reports the TERMINAL outcome — `injected | copied | aborted` — back to `api` over Shape 1a's outcome-report; `api` marks the token spent and writes the ONE authoritative audit entry reflecting the REAL mechanism only on that outcome-report, never at pre-canary validate. A GO-provider canary failure that falls through to copy/paste is the SAME per-use action under the SAME token — no second consent, no re-mint; only a TARGET change (or a `composedTextRef` change, above) forces re-mint.
- **Ordering invariant (Shape 1a vs. Shape 1b, closes the composeInto name collision):** Shape 1a (`api`, seam, codegen'd, `{validated | refused}`) and Shape 1b (the AD-5a client DOM port, in-process, `{ok | needs-manual-paste}`) are NEVER the same call and never share a generated-client symbol. The `{ok | needs-manual-paste}` outcome is produced by the client canary strictly AFTER `api` has already returned `validated` on Shape 1a — `api` NEVER returns the AD-5a DOM outcome, and the client DOM port never returns `{validated | refused}`.

**AD-EXT-4 — Every delivery is a single canary transaction; the closed-shadow-DOM check is a categorical go/no-go feeding AD-EXT-2 (FR-BC1..8, FR-PA6).**
- Binds: how a write happens and how breakage is detected.
- Prevents: a naive `.value=`/`.textContent=` write that never registers with the editor model; a silent mis-inject; conflating a selector-fragility issue with a categorical impossibility.
- Rule: delivery IS the canary — resolve target compose node → verify-writable → insert (native-setter + dispatched `InputEvent`, never naive assignment) → read-back within ~250 ms → branch to success or one of four classes {NOTFOUND, NOTWRITABLE, AMBIGUOUS, VERIFY}. Abort happens BEFORE anything reaches the visible composer (FR-BC3). SEPARATELY, and at PROTOTYPE time (not runtime), each GO provider's live-DOM prototype MUST rule closed-shadow-DOM IN or OUT: if the composer root is a shadow root with `mode:'closed'`, DOM injection is categorically impossible — not a selector fix the canary can absorb — and that verdict flips the provider to DEGRADE via the AD-EXT-2 config path (FR-PA6). Most salient for Gemini (Angular/Material); Gemini's Quill light-DOM `contenteditable` lowers but does not eliminate the prior — name the gate, do not pre-judge it.
- **Token/outcome tie-in (AD-EXT-3):** the canary IS the Shape 1b `composeInto` client DOM port and runs against the token Shape 1a already RESERVED — it never mints or consumes a token itself. The canary's terminal branch (success / one of the four failure classes routed to copy-paste) is exactly the terminal outcome the client reports back to `api` (`injected | copied | aborted`) to spend that reserved token and drive the one authoritative audit entry (AD-EXT-3/AD-EXT-6).

**AD-EXT-5 — MV3 zero-trust posture: isolated-world, no remote code, least-privilege hosts, no third-party egress (FR-TS1..5, AD-6, NFR-9).**
- Binds: the extension's trust surface.
- Prevents: the 900k/8M-user malicious-extension exfiltration failure mode (`IgOjzk034v` §7); a CWS "AI-injector" ban trip.
- Rule: content scripts run in the ISOLATED world; `host_permissions` are the minimum beachhead provider origins only — no `<all_urls>` — each store-justified; the shipped bundle makes ZERO background network calls to any non-Orvex endpoint (all `api.supermemory.ai`/`api.mem0.ai` phone-home stripped — FR-TS2, verified by a bundle network audit); NO remote code — every logic change ships as a reviewed store update (FR-TS4); selector/tier packs are remote DATA only, signed and validated before use (FR-BC7); the extension reads/transmits NO conversation content beyond confirming its own just-written text landed (FR-TS3/BC2); reproducible build, per-permission justification, and a plain-language data-flow statement (FR-TS5). Positioned in the store listing as compose-box AUTOFILL / user-initiated own-session assistance, explicitly distinct from prompt-injection tooling (AD-6, FR-PA5). Carries the CWS-2026-08-01 policy-recheck precondition.

**AD-EXT-6 — Orvex auth and live scope binding is independent, fail-closed, and SERVER-AUTHORITATIVE (FR-AU1, FR-AU2); the server audit is the sole compliance system-of-record.**
- Binds: how the extension knows WHO and WHICH scope it delivers for — the subject the FR-CF2 firewall enforces against; which of the two audit records (client-local vs. server) is the trust evidence.
- Prevents: an unscoped or last-known-scope bundle; silent fallback to a cached or default scope; a client-supplied scope being trusted as the firewall subject; the client's local log being treated as compliance evidence.
- Rule: the extension holds an Orvex session token in extension storage, refreshes it before expiry, and clears it plus all cached scope/memory/audit state on sign-out or uninstall (FR-CF6). Every delivery binds to an EXPLICIT, currently-active personal-vs-employer scope resolved from the LIVE Orvex session at the moment of delivery — never inferred from the provider tab, never defaulted. Expired or absent session at compose time = FAIL CLOSED: no delivery, no unscoped bundle, a visible re-auth prompt. This is separate from, and prior to, the provider connection step (FR-CN3: provider connection needs only that the user is signed in to the provider in their own browser — no Orvex-held provider credentials).
- **Scope authority (closes the client-vs-server trust gap; AD-EXT-3/Shape 2):** `identity` RE-RESOLVES the personal-vs-employer scope SERVER-SIDE from the live Orvex session at mint time and is AUTHORITATIVE. Any client-supplied scope (Shape 2's `asserted-scope`) is a non-authoritative ASSERTION, used ONLY to detect a client/server mismatch — FAIL CLOSED (to re-auth / copy-paste) if `asserted-scope != server-resolved scope`. The client's own scope resolution above drives ONLY the local FR-CF1 preview and the FR-CF7 pre-mint guard; it never decides the minted scope.
- **Audit system-of-record (closes the two-audit-logs gap; ties to AD-EXT-3's outcome-report):** the SERVER (`identity`/`api`) audit is the SOLE compliance system-of-record. The client's bounded local log (FR-CF6, NFR-6, §7) is explicitly NON-AUTHORITATIVE local UX/history — a delivery history for the user's own device, cleared on sign-out/uninstall, size-capped — and MUST NOT be relied on as trust evidence in a compliance dispute. The client reports the terminal delivery outcome (`injected | copied | aborted`) to `api` (AD-EXT-3), which writes the one authoritative audit entry reflecting the real mechanism and the delivered `composedTextRef`. PRD NFR-6's "local log = trust evidence" wording is RECONCILED here: the server audit is the trust evidence; the local log remains valuable UX history, never compliance evidence.

**AD-EXT-7 — Delivery reads are read-your-writes for the confirming user (AD-11).**
- Binds: the consistency the composer reads memory under.
- Prevents: a just-confirmed card being invisible because the knowledge projection lagged the confirm.
- Rule: the memory bundle for delivery is retrieved via `knowledge` under the delegated principal (I-4), BUT for the confirming user's just-confirmed cards the composer reads the `api` system of record until projection catches up — or the confirm ack is withheld until it does — read-your-writes per AD-11. The extension does not itself hold a memory system of record; it is a client of `knowledge`/`ai`/`api`/`identity` (PRD §7). Warm-cache/precompute of the bundle for the instant-inject feel (NFR-1, OQ-E4) is an architecture-owned optimization named here but kept strictly behind this RYW invariant — a precomputed bundle MUST NOT serve stale-past-a-just-confirmed-card.

**AD-EXT-8 — The contracts seam is authored here; the git-TAG is Wave-1-gated (I-1, AD-11, CS §12).**
- Binds: the cross-service surface the extension consumes.
- Prevents: the extension reaching around the pinned seam; a false claim that the tag exists; a build story codegen'ing or drift-gating the in-process AD-5a DOM port as if it were a seam shape.
- Rule: three contract shapes land in `orvex-studio-contracts` — (a) Shape 1a, the `api` compose-VALIDATION + outcome-report call (validation returns `{validated | refused}`; the outcome-report leg returns an `acknowledged` receipt — NEVER the AD-5a DOM outcome), (b) Shape 2, the AD-8 consent-delivery-token mint/present gate, (c) Shape 3, the FR-BC5 breakage-canary heartbeat/telemetry contract. Consumed via a GENERATED TS client, never a hand-rolled type; an AGPL-import/license denylist plus a drift gate guard it. **Shape 1b — the AD-5a `composeInto(target, text) -> {ok | needs-manual-paste}` CLIENT DOM port realized in-process by each content-script `DeliveryAdapter` (AD-EXT-1) — is EXPLICITLY EXCLUDED from the contracts seam, from codegen, and from the drift gate.** It is never generated, never emitted by the TS client, and never a seam symbol; the exclusion itself is what prevents the generated client and the DOM adapter from colliding on one name. The git-TAG on the Shape 1a/2/3 contract is ENG-2690 AC5's dispatch gate and is BLOCKED on the Wave-1 contracts seam (ENG-2037 / ENG-2091, both Todo): this document authors the SHAPE and flags the tag as Wave-1-gated — it never claims a tag exists. Every contract change is a CS §3.7 design-it-twice sketch and a CS §9 ADR trigger (the family's highest-blast-radius surface).

**AD-EXT-9 — Backend environment is env-injected at build/runtime; no baked default.**
- Binds: which Orvex cell (dev vs. prod) a given extension build targets.
- Prevents: a build silently defaulting to the wrong backend — the family's own documented config-parity failure mode (prod bases wrongly defaulting to the wrong engine URL while only dev overlays were correctly repointed).
- Rule: the Orvex backend base URLs (`identity`, `api`, `knowledge`, `ai`) are injected at build/runtime via env — an `ORVEX_<SVC>_URL`-style config seam (CS §10 config-via-env, no embedded secrets) — with NO baked-in default anywhere in the bundle. A dev/unpacked build (used through B1..B6 implementation and store-review QA) targets the dev cell (e.g. `wiki.eu1.orvex.dev`); a store build targets prod. Which cell a given build targets is an EXPLICIT build-time selection — never a fallback, never inferred, never a value that happens to resolve to prod if the env var is unset. A missing backend-URL env at build time is a build-time FAILURE, not a silent default.

## 3. Component topology

*(Diagram 1 renders in the Diagrams section at the end of this page.)*

Fixed parts and responsibilities:
- **Service worker (MV3 background)** — owns Orvex auth/session and refresh (AD-EXT-6); the signed selector/tier-pack fetch, validation, and cache (AD-EXT-2, FR-BC7); the delivery-token mint request to `identity` (Shape 2) and the Shape 1a compose-validation + outcome-report calls to `api` (AD-EXT-3); breakage-telemetry emission to `api`'s canary-telemetry ingest endpoint over the contracts seam (AD-EXT-4/FR-BC5, §8 Shape 3); and the provider registry (AD-EXT-1). It is the ONLY part of the extension that talks to Orvex backends.
- **Per-provider content scripts (isolated world)** — one per provider (`chatgpt.ts`, `gemini.ts`, `claude.ts`, `grok.ts`), each a `DeliveryAdapter` (AD-EXT-1) realizing the Shape 1b `composeInto` client DOM port: resolve/verify/insert/read-back (AD-EXT-4), SPA re-init (MutationObserver + URL-poll + `data-orvex-attached`), non-destructive-insert guard (FR-BC8). NO network, NO token minting — they message the service worker only, including the terminal outcome (`injected | copied | aborted`) that lets the service worker report Shape 1a's outcome-report (AD-EXT-3).
- **Popup / UI shell (React presentational — CS §6)** — the connect card (FR-CN1..4), the consent/memory-preview panel (FR-CF1, private-item flags), the copy-ready degrade panel (FR-D5/BC4), breakage notifications (FR-BC3), sign-in/out (FR-AU1). Keyboard-operable and screen-reader-announced (NFR-10). NO domain logic; all state derives from the service worker.
- **Orvex backend clients (generated TS client over the contracts seam — AD-EXT-8)** — `identity` (mint, scope, consent), `api` (`/v1/memory`, compose, consent state, RYW SoR read, canary-telemetry ingest — FR-BC5), `knowledge` (bundle retrieval under the delegated principal, I-4), `ai` (prompt composition/enrichment). `billing` is consumed ONLY as a pass/fail connect-time gate (PRD §7) — out-of-component, drawn as an external box, never reached around.

**Canary-telemetry routing (FR-BC5, Shape 3, §8 — the named ingesting service and transport).** A canary trip is operational telemetry about extension/provider health, never a memory-domain state change, so it must not ride `studio-spine`'s CloudEvent bus (CS §10 non-conflation rule, §11); and the client cannot reach the broker directly in any case (AD-EXT-5 zero non-Orvex egress — an isolated-world bundle has no collector/agent to push OTLP or write Loki logs to). The service worker POSTs the classified event (Shape 3: `providerId`, `selectorPackVersion`, `failureClass`, `tier`, `timestamp`) to `orvex-studio-api`'s canary-telemetry ingest endpoint over the SAME generated TS client used for the compose call — `api` is the sole ingesting Orvex service; there is no separate telemetry service to invent. `api` re-emits the event as an OTLP metric (`canary_trip_total{provider,class,selectorPackVersion}`) and a structured Loki log line that drives the paging alert; it is never re-emitted as a CloudEvent.

The trust-boundary line runs between the extension (content scripts + popup + service worker — the untrusted client, AD-8) and `identity`/`api` (the mint/enforcement boundary). The signed selector/tier-pack channel is drawn as a DATA arrow into the service worker, distinct from any code path.

## 4. Delivery/compose port realization and the AD-8 consent-token sequence

*(Diagram 2 renders in the Diagrams section at the end of this page.)*

DEGRADE-provider variant (Claude, Grok): steps through the token mint and the Shape 1a compose-validation call are IDENTICAL — consent and the RESERVED token still apply to the copy path (FR-BC4/CF1) — but the canary step is replaced by the copy-ready panel; no DOM write is attempted. The client still reports the terminal outcome (`copied`) to `api` over Shape 1a's outcome-report to SPEND the token and drive the one authoritative audit entry (AD-EXT-3/AD-EXT-6) — the same mechanism a GO-provider canary-fail-to-copy uses.

Annotations that must be carried forward without dilution:
- Every per-use action RE-MINTS, and so does every `composedTextRef` change (a fresh precompute is a fresh consent + fresh mint, AD-EXT-3/F2). A token is never reused across a target change; the ChatGPT-scoped token cannot deliver to Gemini.
- The token is PRESENTED, never minted, by the client. Minting is exclusively an `identity` operation. The token is RESERVED at Shape 1a validate and SPENT only at Shape 1a's outcome-report (AD-EXT-3) — a GO-canary-fail-to-copy is the same per-use action under the same token, never a second consent.
- `composeInto` is Shape 1b — the AD-5a CLIENT DOM port, `composeInto(target, text) -> {ok | needs-manual-paste}` — an in-process content-script interface EXPLICITLY EXCLUDED from the contracts seam and the generated client (AD-EXT-8). It is never the same call as Shape 1a's api `{validated | refused}` compose-validation response, and it is always produced AFTER Shape 1a returns `validated` (AD-EXT-3 ordering invariant). The `needs-manual-paste` arm is the DEGRADE/abort path, not an error swallow — it always surfaces to the user with the deterministic clipboard fallback (§6).

## 5. Per-provider selector strategy, composer-write technique, and SPA resilience

This is pinned detail (addendum §A, `IgOjzk034v` §5) — build stories inherit it, they do not choose it.

Composer-write technique by editor surface (the load-bearing detail source-verified by `IgOjzk034v`: supermemory's own ChatGPT/Claude writers omit the dispatch step and are broken-as-written on live DOM; mem0's per-provider writers include it correctly — hence mem0 as the pattern donor, never a live dependency):

```text
SURFACE                          TECHNIQUE
React-controlled <textarea>      setNativeValue via
                                  Object.getOwnPropertyDescriptor(
                                    HTMLTextAreaElement.prototype, 'value'
                                  ).set, then
                                  dispatchEvent(new Event('input', {bubbles:true}))
                                  — bypasses React's internal valueTracker.

ProseMirror / contenteditable    execCommand('insertText', false, text) on the
(ChatGPT #prompt-textarea,       focused node, OR a synthetic beforeinput /
likely Claude)                   InputEvent(inputType:'insertText') the PM
                                  transaction pipeline listens for.

Gemini (Quill / Angular)         The observed "triple-fire": a single input
                                  event is insufficient; multiple synthetic
                                  events must fire in sequence to satisfy
                                  Angular's change-detection cycle.

Grok (grok.com v1 only, OQ-E3)   DEGRADE (copy/paste). No live write strategy
                                  ships v1; the adapter is a copy-ready panel
                                  only. x.com is out of scope for v1 under the
                                  stricter X ToS.
```

A naive `.value =` / `.textContent =` / `appendChild` write is explicitly BANNED for every surface above — it does not register with the app's editor model and is the documented failure mode in both fork candidates (supermemory's ChatGPT/Claude writers, `IgOjzk034v` §4.1).

Selector strategy (FR-BC6/BC7):
- Selectors ship as a versioned, remote-fetched, signed JSON **selector pack** per provider — the same channel as the AD-EXT-2 tier config — carrying a MULTI-CANDIDATE list, preferring locale-invariant `data-testid` / `role` / structural anchors over brittle hashed class names AND over localized `aria-label`/placeholder text. An EU-beachhead French/German DOM renders different label strings and would false-trip the canary on a localized selector (NFR-7 localization tie-in).
- The manifest tolerates per-user/per-region A/B UI variants and locale without false-positive alerts — a breakage alert fires only when ZERO candidates match, not when a single candidate among several fails. Every trip is logged; there is no silent degrade.

SPA resilience (addendum §A):
- `MutationObserver` + URL-poll re-init survives new-chat / model-switch navigation without losing the composer reference.
- `data-orvex-attached` idempotency-guards the per-adapter SPA/observer-attach lifecycle only (attach-once across repeated observer fires — "this node is wired"). `data-orvex-last-delivery` is a SEPARATE attribute, owned by the shared canary (`lib/canary/`), that records the most recent delivery ("this node was last written to") and is NON-BLOCKING: it never gates a legitimate repeat delivery into the same node, which is a permitted fresh per-use action (AD-EXT-1/AD-EXT-4). No single attribute encodes both "wired" and "delivered."
- Non-destructive insert (FR-BC8): before writing, detect existing non-empty composer content; insert-at-cursor/append, or prompt the user to choose replace/append/cancel — never silently clobber an in-progress user draft.

## 6. Breakage canary design, failure taxonomy, and the closed-shadow-DOM go/no-go gate

The canary IS the delivery transaction (AD-EXT-4), not a bolt-on check.

Pipeline (one pass per delivery): resolve target compose node → verify-writable (not merely present/attached — disabled/read-only/wrong-type are NOTWRITABLE) → insert (native-setter + dispatched `InputEvent`) → read-back within ~250 ms (re-read the node; assert the text is present at the intended node AND registered with the editor model — this guards the silent-no-op where a write never reaches ProseMirror/React) → branch. Nothing reaches the visible composer until resolve AND verify-writable have both passed; an abort at either stage touches nothing visible (FR-BC1/BC2/BC3).

*(Diagram 3 renders in the Diagrams section at the end of this page.)*

Failure taxonomy — four classes, each alerted separately with provider + selector-pack-version + class (FR-BC5):

```text
NOTFOUND     compose node could not be resolved
NOTWRITABLE  node resolved but failed writability (disabled/read-only/wrong type)
AMBIGUOUS    >1 candidate matched, could not disambiguate
VERIFY       insert ran but read-back did not confirm land+register within budget
```

On any-stage failure: fail loud (FR-BC3/BC4) — abort before the write is visible, surface a visible user notification, offer the deterministic copy/paste fallback with the prompt already on the clipboard or in a copy-ready panel, and emit the classified telemetry that pages the team before broad user impact (routed to `api`'s canary-telemetry ingest per §3/§8 Shape 3). Clipboard fallback obligations: covered by the FR-CF1 consent gate plus the FR-CF3 clipboard-exposure disclosure at consent time (not only at the moment of abort); auto-clear the clipboard payload after a short timeout (`[ASSUMPTION — target 60s; PO/architecture to confirm]`) or on the next copy, whichever is first; visibly flag when the copied content includes employer-scoped memory. Every canary outcome — success, one of the four failure classes, or the copy/paste fallback — is also reported to `api` as the Shape 1a outcome-report (`injected | copied | aborted`) that spends the reserved delivery token and writes the one authoritative audit entry (AD-EXT-3/AD-EXT-6), distinct from and in addition to the classified breakage telemetry above.

Remediation channel (FR-BC7/NFR-8): a selector-DATA fix ships over the signed remote-JSON channel within a bounded SLA (`[ASSUMPTION — target ≤24h canary-trip-to-fix; PO/architecture to confirm]`) — hours, not store-review days. **Owner:** the extension team / on-call rotation is the party paged by the breakage telemetry and is responsible for authoring and shipping the signed selector-pack fix within that SLA window. A CODE-level fix (a new insertion technique) still ships as a reviewed store update at ordinary review latency. Detection (100%, fail-loud, 0 silent mis-inject) is measured SEPARATELY from remediation — a detected-but-unfixed breakage past the SLA window is not counted as "honest" delivery of the breakage-honesty success metric.

**Closed-shadow-DOM go/no-go gate (FR-PA6 — the independent cross-check the verdict and PRD lacked; this gate is a first-class build precondition, repeated in §10).** This is a PROTOTYPE-TIME categorical gate, NOT a runtime canary class. Each GO provider's live-DOM prototype MUST rule closed-shadow-DOM IN or OUT: a `mode:'closed'` composer root makes DOM injection categorically impossible — no legitimate client-side technique reaches inside it — and that verdict FLIPS the provider to DEGRADE via the AD-EXT-2 config path, never a code change. Most salient for Gemini (Angular/Material); Gemini's Quill composer renders into a light-DOM `contenteditable` (addendum §A), which LOWERS but does not eliminate the prior versus a Material-web-component assumption. Neither the viability spike nor the build-vs-buy research did live-DOM inspection — a closed root stays a hypothesis to rule in or out with the prototype, not a prediction that Gemini is blocked. The prototype charge is: for EVERY GO provider, produce an explicit IN/OUT verdict on closed-shadow-DOM before that provider's injection build proceeds past prototype.

## 7. Trust and security posture

Expands AD-EXT-5 into atomic, testable obligations:
- **Least-privilege `host_permissions`** — only the beachhead provider origins actually supported, each store-justified; no broad `<all_urls>` (FR-TS1).
- **Zero third-party egress** — a bundle network audit proves 0 background calls to any non-Orvex endpoint; all supermemory/mem0 phone-home is stripped (FR-TS2, a success metric).
- **No remote code** — every logic change is a reviewed store update; selector/tier packs are signed DATA, validated before use (FR-TS4, AD-6). MV3 forbids server-side hot-patch of CODE — the signed data channel (AD-EXT-2) is the sanctioned resilience path, and the only one.
- **Minimal read scope** — no conversation content, credentials, or page data beyond confirming the extension's own just-written text landed (FR-TS3/BC2).
- **Extension-trust minimization (FR-TS5)** — per-permission store justification for every requested host/API permission; a reproducible build (documented, independently re-runnable, tagged-source to store bundle); a plain-language data-flow statement (what leaves the browser, to which Orvex endpoint), verified by the FR-TS2 bundle network audit.
- **Scoped delegated-token storage/refresh/revoke (AD-EXT-6, FR-AU1/CF5/CF6)** — the Orvex session token lives in extension storage, refreshes before expiry; explicit sign-out clears the token and all cached scope/memory/audit state; consent revocation and connection removal fail CLOSED on the next delivery, never falling back to a cached prior consent; uninstall/disconnect clears connection state, cached bundles, and the bounded audit log (retention window, size cap, protected at rest — NFR-6) — this local log is non-authoritative UX history only, never compliance/trust evidence; the server (`identity`/`api`) audit is the sole compliance system-of-record (AD-EXT-6).
- **CWS positioning (FR-PA5, AD-6)** — the store listing frames injection as user-initiated own-session assistance (the user reviews and sends; the extension does not automate sending or scrape), explicitly distinct from the AI-guardrail-circumvention category Chrome restricts under its **Malicious and Prohibited Products Policy** from 2026-08-01 (not the Limited-Use Data policy — a separate, co-announced change). Named fallback distribution posture if CWS rejects or removes the listing: self-host/enterprise sideload first, Firefox AMO second (§8/§10). The CWS-2026-08-01 policy-recheck is a carried precondition, not discharged by this document.
- **Injected/retrieved memory is UNTRUSTED DATA, not instructions** (FR-CF4 / spine anti-poisoning) — the extension composes memory content into a prompt, it never executes it.

The malicious-extension precedent named in `IgOjzk034v` §7 (the ~900,000-user AITOPIA-impersonation incident and the 8-million-user Urban VPN incident, both AI-conversation exfiltration via extensions) is the concrete failure mode AD-EXT-5 exists to foreclose, structurally, not merely by policy statement.

## 8. Contracts seam — shape, codegen, guard, and the Wave-1-gated tag

Three contract shapes land in `orvex-studio-contracts` at STRUCTURE level (fields/verbs) — Shape 1a (compose-validation + outcome-report), Shape 2 (consent-token mint/present), Shape 3 (breakage-canary telemetry). A FOURTH shape, 1b, is the AD-5a client DOM port and is EXPLICITLY EXCLUDED from the contracts seam, from codegen, and from the AD-EXT-8 drift gate — it never crosses the wire and is listed here only to make the exclusion, and the boundary with Shape 1a, unambiguous. Full OpenAPI/CloudEvent schema authoring is the next Definition-Pack task, not this one.

```text
SHAPE 1a — api compose-VALIDATION + outcome-report calls (seam, codegen'd)
  validate request:   { providerId, target, deliveryToken, composedTextRef }
  validate response:  { validated | refused }
  outcome-report req:  { deliveryToken, outcome: injected | copied | aborted }
  outcome-report resp: { acknowledged }
  Note: this is the api-side compose-VALIDATION call the extension
        presents the token to — it is NOT the AD-5a DOM compose port
        (Shape 1b, below) and NEVER returns a DOM outcome: api decides
        VALIDITY only, never {ok|needs-manual-paste}. composedTextRef is
        a REFERENCE (composeId/content-hash), not the raw text. The full
        composed text is fetched by VALUE exactly once, from knowledge/ai
        (§4 SW->K), into the service worker for consent preview (FR-CF1)
        and later DOM insertion by the content script (§4 CS->P) — the
        same value the user reviewed at consent time, never re-derived
        post-mint. The validate call PRESENTS only the reference bound to
        that already-fetched, already-consented bundle plus the delivery
        token; api validates presented.composedTextRef == token.
        composedTextRef by HASH EQUALITY ONLY — it never re-serves or
        re-derives the text itself (closing the gap where a client could
        otherwise swap content after minting; AD-EXT-3/Shape 2) — and
        RESERVES the token without yet marking it spent and without yet
        writing the audit. The token is spent, and the ONE authoritative
        RYW-relevant audit entry written (AD-EXT-3/AD-EXT-6/AD-EXT-7),
        only on the SEPARATE outcome-report call, once the client reports
        the terminal delivery outcome (injected|copied|aborted) — a
        GO-provider canary-fail-to-copy reports the same token's outcome
        as `copied`, never a second mint. api is not itself the DOM
        writer. This also pins the owner of OQ-E4's precompute: the VALUE
        fetch at SW->K is the single precompute point; a warm-cache/
        precompute optimization (OQ-E4) may move that fetch earlier in
        time but must not change it from a by-value fetch, and must still
        satisfy the AD-EXT-7 RYW guarantee that the value read is never
        stale-past-a-just-confirmed card. Any OQ-E4 precompute that
        CHANGES the composed text produces a new composedTextRef and
        therefore REQUIRES a fresh FR-CF1 consent and a fresh mint — it
        can never silently satisfy an already-minted token.

SHAPE 1b — composeInto client DOM port (AD-5a; in-process,
           EXPLICITLY EXCLUDED from the contracts seam and the
           generated client, AD-EXT-8)
  interface: composeInto(target, text) -> { ok | needs-manual-paste }
  Note: realized by each content-script DeliveryAdapter (AD-EXT-1)
        entirely in-process, isolated-world, NO network (AD-EXT-5). NOT
        codegen'd, NOT consumed via the generated TS client, NOT subject
        to the AD-EXT-8 drift gate — it shares no wire format with Shape
        1a and must never be unified with it under one contracts symbol.
        The {ok|needs-manual-paste} outcome is the canary's read-back
        verdict (§6), produced strictly AFTER api has already returned
        {validated} on Shape 1a (AD-EXT-3 ordering invariant, §4): api
        NEVER returns this outcome, and this port never returns
        {validated|refused}.

SHAPE 2 — Consent-delivery-token mint/present gate (AD-8)
  mint request:  { memoryRef, target, composedTextRef, asserted-scope }
  token:         { single-target, single-use, short-TTL,
                   scope: { memory, target, user, composedTextRef } }
  present:       token attached to the Shape 1a validate call
  Note: every per-use action re-mints, and so does every composedTextRef
        change (a fresh precompute is a fresh consent + fresh mint —
        AD-EXT-3; it can never silently satisfy an already-minted token).
        composedTextRef is the content-hash of the exact FR-CF1-previewed
        bundle; api validates presented.composedTextRef == token.
        composedTextRef by HASH EQUALITY ONLY, never re-deriving the text
        (Shape 1a). asserted-scope is a NON-AUTHORITATIVE client
        assertion (AD-EXT-6) — identity RE-RESOLVES the user/scope
        component SERVER-SIDE from the live Orvex session and mints
        against that; a mismatch between asserted-scope and the
        server-resolved scope FAILS CLOSED. Firewall + consent + scope
        are enforced at mint (identity), never at the client.

SHAPE 3 — Breakage-canary heartbeat / telemetry (FR-BC5)
  event: { providerId, selectorPackVersion,
           failureClass in {NOTFOUND, NOTWRITABLE, AMBIGUOUS, VERIFY},
           tier, timestamp }
  Note: a distinct alert fires per (provider + selector-version + class).
        Ingested by orvex-studio-api's canary-telemetry endpoint (named
        and drawn in §3) over the same generated TS client as Shape 1a;
        api re-emits as an OTLP metric plus a Loki log line, never as a
        CloudEvent (CS §10 non-conflation rule, §11) — a canary trip is
        extension/provider operational health, not a memory-domain state
        change.
```

Codegen and guard: consumed via a GENERATED TS client (CS §12 contract-shape law) — no hand-rolled types, no reaching around the seam. An AGPL-import/license DENYLIST plus a drift gate run in CI (the generated client and a golden-fixture round-trip). Every seam change is a CS §3.7 design-it-twice sketch (≥2 materially different interface shapes recorded) and a CS §9 ADR trigger — the contracts seam is the family's highest-blast-radius surface.

**Wave-1 gating (stated exactly, never over-claimed):** this document AUTHORS the shape above; the git-TAG on `orvex-studio-contracts` is ENG-2690 AC5's dispatch gate and is BLOCKED on the Wave-1 contracts seam (ENG-2037 / ENG-2091, both Todo). No build story dispatches before the tag lands and fixtures are green (PRD §7 precondition 4). The tag does not yet exist; the shape is authored here for the Wave-1 seam to pin.

## 9. Fork / build mapping onto the topology

TAKE — fork `supermemoryai/supermemory` (`apps/browser-extension`, MIT, pushed 2026-07-14):
```text
- WXT/MV3 scaffold and build tooling
- Per-provider content-script file layout (entrypoints/content/<provider>.ts)
- ChatGPT composer skeleton — THEN add the missing input-event dispatch;
  supermemory's own ChatGPT/Claude writers are broken-as-written (no
  dispatchEvent after the DOM mutation; verified by direct source read,
  IgOjzk034v §4.1)
- MutationObserver + URL-poll SPA route-change re-init seed logic (extend
  to fail loud rather than retry-silently)
```

PRUNE on fork:
```text
- Bookmark/capture scope (X/Twitter bookmarking, unrelated to F1)
- Broad webRequest / tabs permissions beyond the content-script + storage
  minimum (AD-EXT-5, FR-TS1)
- All non-F1 features
- ALL phone-home to api.supermemory.ai (FR-TS2)
- The dormant/incomplete Claude wiring and the Grok "save memory dialog"
  feature (wrong data direction — imports Grok's own memory summary
  rather than writing into Grok's composer)
```

DONATE-AS-PATTERN — mine `mem0ai/mem0-chrome-extension` (MIT, archived 2026-03-23; never a live dependency):
```text
- The correct dispatchEvent('input', {bubbles:true}) / InputEvent writers
  per provider — the complete, correct reference implementation of the
  React/ProseMirror-safe write pattern
- The Gemini / Claude / Grok selector maps (broadest provider coverage
  found in the landscape survey)
- Strip the api.mem0.ai phone-home before any pattern is reused
```

BUILD-FRESH — zero OSS prior art anywhere in the landscape; this pack MUST NOT credit the fork with delivering these:
```text
- The FR-D7 breakage canary (AD-EXT-4) — no candidate closes the loop with
  a loud failure signal or team alert; both donors retry/self-heal silently
- The AD-6 pre-send review pause / consent panel — both donors auto-inject
  and auto-capture silently on submit, architecturally OPPOSITE to Orvex's
  consent model
- The GO/DEGRADE per-provider split (AD-EXT-2) — neither donor implements
  any provider-tiered behavioral distinction
- The copy/paste degrade UI (the UX shell pattern is harvestable from
  AI Prompt Genius, but its code/license is not reusable)
- The AD-8 token-presenter wiring
- The Orvex memory-enrichment backend wiring — replacing both donors'
  third-party backends with Orvex knowledge/ai/api/identity clients
  (AD-EXT-3/6/7/8)
```

License hygiene (FR-BA4): both sources are MIT — clean for a store-distributed, Orvex-backend extension. Borrowed files retain their original copyright/license notice. Copyleft (GPL/AGPL) sources are excluded outright (e.g. ChatHub, GPL-3.0) — enforced by the AD-EXT-8 denylist gate in CI.

## 10. Build-story mapping and hard build preconditions

Mapping the six milestones (ENG-2711..2730) onto the §2 AD-EXT set and the §3 topology, so each story inherits STRUCTURE, not choices:

```text
B1  Foundation / MV3 / CI
    -> fork + prune (§9), WXT scaffold, provider registry (AD-EXT-1),
       self-hosted-runner CI posture (CS §13, §11 note), reproducible-build
       scaffolding (AD-EXT-5)

B2  Auth + one-step connect
    -> service-worker Orvex auth/session/refresh (AD-EXT-6); popup connect
       card + per-assistant status (FR-CN1..4); <=3-tap/<=2-min connect,
       usability-tested (FR-O4, gated in B6)

B3  Per-provider delivery adapters
    -> DeliveryAdapter implementations (AD-EXT-1) + composer-write
       techniques + selector packs + SPA resilience (§5) for the GO
       providers

B4  Consent + firewall gate
    -> consent/memory-preview panel (AD-EXT-3, FR-CF1); token mint/present
       wiring (AD-8); FR-CF7 target-identity guard; RYW read (AD-EXT-7)

B5  Degradation + breakage canaries
    -> canary transaction + taxonomy + telemetry (AD-EXT-4, §6);
       copy/paste degrade UI (DEGRADE providers + abort fallback);
       tier-by-config channel (AD-EXT-2)

B6  Store distribution + quality gates
    -> CWS listing framing + fallback posture (AD-EXT-5, FR-PA5); bundle
       network audit; per-permission justification + data-flow statement
       (FR-TS5); the FR-O4 first-run usability test (hard gate)
```

Every FR in PRD §5 maps to at least one story in ENG-2711..2730, with the single exception FR-D6 (knowledge-owned, cross-reference only). The per-id map is the Definition Pack's AC2 pointer job, not duplicated here — this document gives the structural landing.

**Hard build preconditions (PRD §7 — a first-class block; none may be laundered away):**

```text
1. Legal-counsel review of (a) each injecting provider's "automated means"
   ToS interpretation and (b) the CWS third-party-ToS-facilitation policy
   (FR-PA4/PA5). BLOCKS shipping injection AND store submission. A
   co-equal analysis in V6hlDjecfh read Claude+Grok as NO-GO on the
   persistent-extension mechanism -- this is a lawyer call, not laundered
   to GO by this document.

2. Store-policy viability confirmed (FR-PA5): listing framing prepared
   (injection = user-initiated own-session assistance) plus a fallback
   distribution posture named (self-host/enterprise -> Firefox AMO).
   BLOCKS store submission. CWS rejection/takedown is an existential
   channel risk, not merely a fix-latency assumption, and can hit the GO
   providers too, not only the DEGRADE ones.

3. Live-DOM prototype per provider against the real authenticated
   rendered DOM (the spike designed the canary but did not DOM-validate
   it -- the Chrome browser tool was not connected in that research
   session). For EVERY GO provider this MUST rule closed-shadow-DOM
   IN/OUT (FR-PA6, AD-EXT-4/§6) as a go/no-go feeding the AD-EXT-2
   re-tier path -- most salient for Gemini. Also: the Google ToS revision
   effective 2026-07-30 must be re-diffed before Gemini ships (OQ-E2).

4. Contract landed and git-TAGGED in orvex-studio-contracts, fixtures
   green (ENG-2690 AC5), Wave-1-gated on ENG-2037/ENG-2091 -- before any
   build story dispatches. The tag does NOT yet exist (§8).
```

Preconditions 1-3 run in PARALLEL with this architecture; all three gate the first INJECTION build (B3 for the GO providers). Precondition 4 gates ALL build dispatch, B1 included.

## 11. CS and SE-Arch compliance plan

CS sections that bind this component:
- **CS §12** (wiki-first, contract-shape law, human-ratify) — the generated TS client and the pinned contracts version are law for the seam; this document is a draft until human doc-ratify.
- **CS §3.7 / §9** (design-it-twice; ADR triggers) — every contracts-seam change (AD-EXT-8) is highest-blast-radius; an ADR is required when costly-to-reverse, reasonable-engineer-differs, and constrains-future all hold together.
- **CS §6** (tier responsibilities — React fronts are shallow/presentational) — the popup/UI shell holds NO domain logic and makes no direct fetch-to-store call; all state derives from the service worker, the content-script/service-worker analogue of "the service API" for this non-Go-service component.
- **CS §10** (operability / zero-trust baseline) — least privilege, secrets via env/GitOps only (n/a for a client bundle beyond the absence of embedded secrets), never-white-screen graceful degrade (the copy/paste fallback IS the never-white-screen path, NFR-4), fabricate-nothing (honest empty/again states, FR-CN4). The FR-BC5 canary heartbeat rides the metrics(OTLP)+logs(Loki) telemetry paths ONLY, ingested at `api`'s canary-telemetry endpoint (§3, §8 Shape 3) — never the domain-events(CloudEvents) path, since a canary trip is extension/provider operational health, not a memory-domain state change, and a client bundle can neither reach the `studio-spine` broker (AD-EXT-5) nor push OTLP/Loki directly (no collector/agent reachable from an isolated-world script) — it rides the same HTTP contracts seam as every other backend call.
- **CS §11** (honesty directives — ALL-REAL/LIVE + BUILD-EVERYTHING) — no fabricated statuses; a connection status never claims a capability the canary cannot currently deliver (FR-CN2); no percentage-done not derived from real gate outcomes.
- **CS §13** (build/CI/deploy substrate) — see the cell-lint note below.
- **CS ❌ table** — ❌#12 no `any`-laundering across exported TypeScript module surfaces; ❌#4 never mock a module you own (test through the `DeliveryAdapter` interface with a real or in-memory substitute; the provider composer DOM is a true external boundary and the only place a jsdom-style fixture is appropriate, per CS §5's mock-only-true-boundaries rule); ❌#10 the parallel-agent ceiling and its ADR-gate is inherited process, n/a to this component's runtime.

SE-Arch lenses that bind (cited as `SE-Arch <lens>`):
- **SE-Arch Security (Zero Trust, Multi-Tenant)** — AD-EXT-5 host-permission minimization, no egress, no remote code; AD-8 mint-boundary enforcement; the firewall.
- **SE-Arch Reliability (AI + Event-Driven)** — the canary's fail-loud behavior and fail-safe-to-DEGRADE default (AD-EXT-2); the breakage-telemetry alerting (FR-BC5); RYW consistency (AD-EXT-7).
- **SE-Arch Operational Excellence** — the FR-BC7 remote-selector-data remediation channel and its SLA; the reproducible build; the store-review-latency-vs-data-channel split.
- **SE-Arch Performance / Freshness** — NFR-1's click-to-visible p95 budget decomposition (retrieval + ~250 ms canary + render); warm-cache/precompute (OQ-E4) kept strictly behind the RYW invariant.
- **SE-Arch Cost / Resource Governance** — memory LLM/enrichment cost rides `ai`'s scoped budgets (AD-10, inherited); the extension defines NO tier logic of its own; `billing` is the system of record, consumed only as a connect-time pass/fail gate.

**Cell-lint applicability note (required — the browser-extension-vs-Go-cell reconciliation).** The CS six-tier Go-service model and its cell-lints (handler-thinness, `internal/store/postgres/` confinement, projection-determinism, the outbox pattern) do NOT apply to this component — the extension is not a Go six-tier service; it is a TypeScript/WXT MV3 client, closer to the CS "React fronts" and "non-service repo" category. What DOES bind: the CS §6 controllers-thin/domain-in-services SHAPE mapped onto MV3 (content scripts thin and adapter-shaped; the service worker as the orchestration/IO edge; the popup strictly presentational), the ❌ table's TypeScript rows (❌#4 own-module mocking, ❌#12 `any`-laundering), CS §4 TDD (RED→GREEN→refactor through exported interfaces, vertical tracer bullets, never horizontal slicing), CS §5 mock-only-true-boundaries (the provider DOM and the Orvex backends across the seam are the true boundaries; everything the extension owns is tested for real), and CS §12/§3.7/§9 for the contracts seam. CI runs on the self-hosted `runners` group per CS §13 in the private repo `orvexai/orvex-studio-extension`; container images are not relevant — there is no image for a store-distributed extension. The CI gates are lint, `tsc -b` typecheck (never `--noEmit`), tests, contract-drift check, and the bundle-network-audit; the store bundle itself is the reproducible-build artifact, not a Tekton image.

## 12. Deferred / open items and the assumptions ledger

Carried forward verbatim, each with its owner — none resolved silently by this document:

- **OQ-E1** — does Anthropic's native memory/import path (FR-D6, knowledge-owned) become a superior DEGRADE ROUTE for Claude versus copy/paste? Must NOT be conflated with FR-D1 injection: memory-sync reaching GO does not upgrade Claude's injection DEGRADE. Owner: confirm with `knowledge`.
- **OQ-E2** — the Google ToS revision effective 2026-07-30 must be re-diffed before Gemini ships. Independently of that ToS outcome, the closed-shadow-DOM gate (FR-PA6, §6) is categorical regardless of how the ToS question resolves.
- **OQ-E3** — Grok's dual surface: v1 is grok.com only (`[ASSUMPTION]`); x.com/i/grok is deferred under the stricter X ToS.
- **OQ-E4** — precompute/warm-cache of the memory bundle for the instant-inject feel (NFR-1) — an architecture-owned optimization, kept behind the AD-EXT-7 read-your-writes invariant.
- **Store-distribution posture (OPEN — PO/architecture)** — Chrome-first; Firefox AMO and Edge phased. Two named risks kept distinct: MV3 review LATENCY (bounded by the signed data channel, AD-EXT-2/FR-BC7) versus CWS REJECTION/TAKEDOWN (existential, named fallback posture — self-host/enterprise sideload, then Firefox AMO).
- **Open-source posture of the extension itself (OPEN — PO)** — a candidate trust lever (FR-TS5); does not block this architecture.
- **`[ASSUMPTION]` numeric targets to confirm** — NFR-1 click-to-visible p95 ≤400 ms; clipboard auto-clear ~60s; FR-BC7 remediation SLA ≤24h canary-trip-to-fix (owner: the extension team / on-call rotation ships the signed selector-pack fix within the window, §6); success-metric targets (≥50% delivery reach, ≥40% connect activation) inherited from the umbrella PRD (`g9vWbSYplh`).

This architecture leaves the build agent zero ARCHITECTURE decisions: every provider, port, selector, canary, token, and tier decision is pinned in §2 through §9 above. What remains open is legal (counsel review), empirical (the live-DOM prototype and its closed-shadow-DOM verdicts), product (the PO open questions above), and the Wave-1 contract tag — each named here individually, none silently resolved by this document. This claim now also holds against the adversarial-incompatibility lens (§14): the Shape 1a/1b split (AD-EXT-8/§8) closes the `composeInto` name collision that would otherwise have forced a build story to invent which call owned the seam, and the `composedTextRef`-bound token (AD-EXT-3/Shape 2) closes the missing anti-swap binding that would otherwise have forced `api`'s team to invent how "delivered-content == consented content" is actually checked — both were real gaps in the prior draft, both are pinned decisions now, not deferred or silently resolved.

## 13. Review-response note (REVISE pass, closes F1/F2/F3)

The adversarial reviewer returned REVISE on the prior draft: PASS on all four hard gates (SPINE-CONSISTENT, VERDICT-FAITHFUL, FORK-HONEST, DOCMOST-SAFE), with three targeted gaps to close before PASS. All three are closed in this revision; no verdict caveat, tier, or adopted invariant was reopened or weakened.

F1 (MEDIUM) — canary heartbeat had no named ingesting Orvex service and no §3 topology arrow, given AD-EXT-5 zero-non-Orvex-egress and CS §10's non-conflatable telemetry paths.
Change: named `orvex-studio-api` as the sole ingesting service, reusing the existing compose-call client rather than inventing a new telemetry service. Added an explicit `SW -->|canary heartbeat, Shape 3, FR-BC5| CON` and `CON -->|telemetry ingest| API` pair of arrows to the §3 mermaid diagram, updated the API node label and the CON/API dotted annotation, and added a new "Canary-telemetry routing" paragraph in §3. Added a matching Note to Shape 3 in §8, and a one-line CS §10 note in §11 stating the heartbeat rides metrics(OTLP)+logs(Loki) only, ingested at `api`, never CloudEvents — with the reasoning for why the other two of the three CS §10 telemetry paths do not apply to a client bundle (no broker reach under AD-EXT-5; no collector/agent reachable from an isolated-world script).

F2 (LOW) — Shape 1's swap from AD-5a's `text` (by value) to `composedText-ref` left value-vs-reference unstated, with RYW/precompute implications the contract task and B3/B4 would otherwise guess.
Change: renamed the field to `composedTextRef` and added an explicit Note in §8 Shape 1 stating it is a REFERENCE (composeId/content-hash), not the raw text; the raw text is fetched by VALUE exactly once from knowledge/ai at the §4 SW->K step, used for both consent preview and the later DOM insertion, and never re-derived post-mint. Tied the reference-vs-value choice explicitly to AD-EXT-7 (api validates mint-scope/consent/delivered-content are the same bundle, closing a post-mint content-swap gap) and to OQ-E4 (the SW->K fetch is the single precompute point; any future precompute optimization may move it earlier but must not change it to by-value-at-compose-time, and must still satisfy RYW).

F3 (LOW) — mermaid node/participant/message labels in §3, §4, and §6 used `\n` rather than `<br/>`, version-fragile against docmost's bundled mermaid renderer.
Change: swapped every in-diagram `\n` to `<br/>` across the §3 flowchart, the §4 sequence diagram, and the §6 flowchart — no wording changed, only the line-break syntax.

No other section was touched. No caveat, tier verdict, adopt-vs-decide boundary, or fork-honesty attribution was altered by this pass.

## 14. Reviewer-gate response (fix pass)

Three reviewer-gate reviews ran against this document (`reviews/review-adversarial-incompat.md` — FAIL, 7 divergence pairs, 2 CRITICAL; `reviews/review-web-currency.md` — PASS, 1 LOW citation nit; `reviews/review-rubric.md` — CONCERNS, 1 MEDIUM + 2 LOW). This section maps every finding to the exact change made in this fix pass. No adopted verdict, tier, caveat, or invariant (`V6hlDjecfh` tiers, the four caveats, AD-5a/6/8/11, I-1/I-4) was reopened or weakened by any of the changes below — every change tightens a component-level AD-EXT decided at this altitude, never the parent-spine invariants it realizes.

**Finding 1 (CRITICAL, adversarial-incompat) — `composeInto` named two irreconcilable operations: the no-network client DOM port (AD-5a/AD-EXT-5) and the seam `api` compose call (§8 Shape 1), with no ordering rule for `{ok|needs-manual-paste}` vs. api's pre-canary response.**
Change: split §8 Shape 1 into **Shape 1a** — the `api` compose-VALIDATION call (seam, codegen'd; request `{providerId, target, deliveryToken, composedTextRef}`, response `{validated|refused}`, never a DOM outcome) plus its outcome-report leg — and **Shape 1b** — the AD-5a client DOM port `composeInto(target, text) -> {ok|needs-manual-paste}`, in-process, EXPLICITLY EXCLUDED from the contracts seam and the generated client. Updated AD-EXT-8's Rule to name the exclusion explicitly (never codegen'd, never drift-gated). Added an ordering-invariant bullet to AD-EXT-3 and a token/outcome tie-in bullet to AD-EXT-4: the canary's `{ok|needs-manual-paste}` outcome is produced strictly AFTER api returns `validated` on Shape 1a; api never returns the AD-5a DOM outcome. Fixed every §3/§4 reference that previously used the bare name `composeInto` or `Shape 1` for the seam call (§3 topology diagram CON node/edges and prose, §4 sequence diagram and its DEGRADE-variant paragraph and annotations, Design Paradigm intro, AD-EXT-1's Rule) to cite Shape 1a or Shape 1b explicitly and never both under one symbol.

**Finding 2 (CRITICAL, adversarial-incompat) — the token scope `{memory, target, user}` could not carry the anti-swap guarantee Shape 1's Note asserted over `composedTextRef`; a build story would have to invent the binding.**
Change: tightened AD-EXT-3 and §8 Shape 2 so the mint request carries the consented `composedTextRef` (content-hash of the exact FR-CF1-previewed bundle) and the minted token scope becomes `{memory, target, user, composedTextRef}`. `api`'s Shape 1a validate call checks `presented.composedTextRef == token.composedTextRef` by HASH EQUALITY ONLY — it never re-derives the text. Stated explicitly (AD-EXT-3, Shape 2, and Shape 1a's Note) that any OQ-E4 precompute that CHANGES the composed text yields a new `composedTextRef` and therefore REQUIRES a fresh FR-CF1 consent and a fresh mint — it can never silently satisfy an already-minted token.

**Finding 3 (HIGH, adversarial-incompat) — `tier`/`selectorPackRef`/`writeStrategy` had two owners: the in-code AD-EXT-1 registry tuple and the AD-EXT-2 remote signed config, with no precedence rule.**
Change: tightened AD-EXT-1's registry tuple to static identity only — `providerId -> {hostMatch, contentScriptEntry}` — plus at most pointers (`tierConfigRef`/`selectorPackRef`), never resolved values; deleted `tier` and `writeStrategy` as registry fields. Added a single precedence rule to AD-EXT-2: the remote signed JSON is the SOLE authority for the live `tier` and the live `selectorPackVersion`; absent/stale/invalid config fails safe to DEGRADE. `writeStrategy` is now stated as owned by §5's per-surface adapter mapping, never the registry.

**Finding 4 (HIGH, adversarial-incompat) — the single-use token was consumed at the pre-canary `api` compose call, leaving a GO-provider canary-fail→copy fallback with either a spent token (violates single-use) or an undefined re-mint (pops a second consent).**
Change: added a "Token lifecycle" bullet to AD-EXT-3 and a "Token/outcome tie-in" bullet to AD-EXT-4: the token is bound to a delivery ATTEMPT, not a transport. `api`'s Shape 1a validate call RESERVES/validates the token without spending it or writing the audit; the client reports the TERMINAL outcome (`injected|copied|aborted`) back to `api` via Shape 1a's new outcome-report leg, and `api` marks the token spent and writes the authoritative audit only then. A GO-canary-fail→copy is the SAME per-use action under the SAME token — no second consent, no re-mint; only a target (or `composedTextRef`) change forces re-mint. Reflected the same reserve→outcome-report flow in the §4 sequence diagram, its DEGRADE-provider variant paragraph, its annotations list, and §6's failure-handling paragraph.

**Finding 5 (HIGH, adversarial-incompat) — two audit logs (client bounded log, server deliver-time audit) with no designated compliance system-of-record; PRD NFR-6 calls the local log "trust evidence" while enforcement sits server-side.**
Change: added an "Audit system-of-record" bullet to AD-EXT-6: the SERVER (`identity`/`api`) audit is the SOLE compliance system-of-record; the client's bounded local log is explicitly NON-AUTHORITATIVE local UX/history and MUST NOT be relied on as trust evidence. Reconciled PRD NFR-6's "local log = trust evidence" wording inline (the server audit is the trust evidence). Wired the client-reports-terminal-outcome mechanism from Finding 4 as the feed for the server's authoritative entry. Updated §7's delegated-token bullet to state the local log is non-authoritative UX history only.

**Finding 6 (HIGH, adversarial-incompat) — the client resolves personal-vs-employer scope and sends `user-scope` on the mint request (Shape 2), but AD-8 says the client never decides the firewall subject — the trust model for that field was unstated.**
Change: added a "Scope authority" bullet to AD-EXT-6: `identity` RE-RESOLVES the personal-vs-employer scope SERVER-SIDE from the live Orvex session at mint time and is AUTHORITATIVE; any client-supplied scope is a non-authoritative ASSERTION used only to detect a mismatch (fail-closed if `asserted-scope != server-resolved`). The client's own AD-EXT-6 resolution now drives ONLY the local FR-CF1 preview and the FR-CF7 pre-mint guard. Renamed Shape 2's mint-request field from `user-scope` to `asserted-scope` and updated its Note accordingly; cross-referenced from AD-EXT-3's Rule.

**Finding 7 (MEDIUM, adversarial-incompat) — `data-orvex-initialized` was one DOM attribute with two lifecycle owners and two meanings: per-adapter SPA "wired" vs. shared-canary "delivered."**
Change: split it into two single-owner attributes in the Consistency Conventions, §3's content-script bullet, and §5's SPA-resilience bullets: `data-orvex-attached` (per-adapter SPA/observer-attach lifecycle) and `data-orvex-last-delivery` (shared canary, explicitly NON-BLOCKING — a repeat delivery into the same node is a permitted fresh per-use action). Stated that no single attribute encodes both "wired" and "delivered."

**Web-currency (LOW) — the AD-6 preamble and §7 attributed the CWS AI-injector/guardrail-circumvention restriction to the "Limited-Use data policy"; it is actually a separate, distinctly-named "Malicious and Prohibited Products Policy."**
Change: corrected the citation in both the §1 AD-6 bullet and §7's CWS-positioning bullet to "Malicious and Prohibited Products Policy," noting it is co-announced with, but distinct from, the Limited-Use Data policy. The 2026-08-01 enforcement date is unchanged (it was already correct).

**Rubric #8 (MEDIUM) — backend-environment targeting (dev-cell vs. prod) was not decided, deferred, or flagged open anywhere, despite six build milestones depending on a working backend connection from B1 onward.**
Change: added **AD-EXT-9 — Backend environment is env-injected at build/runtime; no baked default**, binding the `identity`/`api`/`knowledge`/`ai` base-URL selection to an `ORVEX_<SVC>_URL`-style build/runtime env seam with no baked-in default; a dev/unpacked build targets the dev cell, a store build targets prod, as an explicit build-time selection, never a fallback. Updated the §2 heading from "closed at eight" to "closed at nine" and added a one-line cross-reference in the Stack (seed) section.

**Rubric (LOW) — AD-EXT-7's RYW branch ("until projection catches up, or the confirm ack is withheld until it does") is inherited verbatim from AD-11 without picking one.**
No change: this is an inherited, read-only parent-spine invariant (`iiCcKhGptV`/AD-11), and the fix-pass brief's binding instructions (F1–F7, web-currency, rubric #8, rubric-low #10) do not include this item — reopening a parent invariant's own unresolved branch is out of scope for a component-level fix pass and would itself risk weakening an adopted invariant. Left as the reviewer found it, correctly attributed as inherited.

**Rubric (LOW) — canary-remediation ownership (who ships the FR-BC7 24h-SLA selector-pack fix) was never named.**
Change: added "Owner: the extension team / on-call rotation" to §6's remediation-channel paragraph and to §12's `[ASSUMPTION]` numeric-targets bullet.

**§12 honesty note.** With Findings 1 and 2 closed, the §12 "zero architecture decisions" claim is now also true against the adversarial-incompatibility lens that found it false: the Shape 1a/1b split and the `composedTextRef`-bound token are the two decisions that were previously missing and forced a build story to invent an answer; both are now pinned in §2/§8 rather than left open. A one-line pointer to this reconciliation was added at the end of §12.

## Diagrams

Diagram 1 — component topology (section 3). Diagram 2 — the AD-8 consent-delivery-token sequence (section 4). Diagram 3 — the breakage-canary failure branch (section 6).
