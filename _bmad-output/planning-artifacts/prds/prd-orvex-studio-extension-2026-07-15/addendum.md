# Addendum — Orvex Studio Extension (downstream detail)

Depth that belongs to architecture / solution-design, kept out of the PRD's requirement narrative. Source of record for the rulings referenced here: `V6hlDjecfh` (viability verdict) and `IgOjzk034v` (build-vs-buy).

## A. Mechanism & transport (architecture-owned)

- **Vehicle:** Chrome MV3 extension; content scripts in the isolated world, per-provider files (`entrypoints/content/<provider>.ts`) for FR-BC breakage isolation. Build framework: WXT (wxt.dev), inherited from the supermemory fork base.
- **Composer-write technique (the load-bearing detail `IgOjzk034v` verified by source read):** a naive `.value = …` / `.textContent = …` / `appendChild` does **not** register with the app's editor model. Required patterns, per surface:
  - React-controlled textareas: `setNativeValue` via `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set` then `dispatchEvent(new Event('input',{bubbles:true}))` — bypasses React's valueTracker.
  - ProseMirror/contenteditable (ChatGPT `#prompt-textarea`, likely Claude): `execCommand('insertText', false, text)` on the focused node, or a synthetic `beforeinput`/`InputEvent(inputType:'insertText')` the PM transaction pipeline listens for.
  - Gemini (Quill/Angular): the observed **"triple-fire"** requirement — a single input event is insufficient; multiple synthetic events must fire.
  - Note: supermemory's own ChatGPT/Claude writers **omit** this dispatch (broken-as-written); mem0's per-provider writers do it correctly — hence mem0 as the pattern donor.
- **SPA resilience:** `MutationObserver` + URL-poll re-init to survive new-chat / model-switch navigation without losing the composer reference; `data-orvex-initialized` idempotency guards to prevent double-injection across observer fires.

## B. Breakage-canary design (FR-D7 / F-E, made concrete)

- **The canary IS the delivery transaction, not a bolt-on check.** Every delivery runs one pipeline: **resolve** the compose node → **verify-writable** → **insert** (native-setter + dispatched `InputEvent`; never a naive `.value =` assignment) → **read-back** within a **~250ms** budget → **branch** to success or a failure class (FR-BC1). Abort happens **before** the write reaches the visible conversation — a failed resolve or writability check never touches the composer the user sees at all (FR-BC3).
- **Four failure classes** (FR-BC5), each alerted separately with provider + selector-version:
  - **NOTFOUND** — compose node not resolved.
  - **NOTWRITABLE** — node resolved but not writable (disabled/read-only/wrong type).
  - **AMBIGUOUS** — multiple candidates, no disambiguation.
  - **VERIFY** — insert ran but read-back didn't confirm within budget.
- **Versioned selector manifest per provider, shipped as remote JSON data** (FR-BC7) — a multi-candidate list preferring stable `data-testid`/ARIA-role/structural anchors over brittle hashed class names **or localized ARIA-label/placeholder text** (an EU-beachhead French/German/etc. DOM renders different label strings per locale — a locale-keyed selector would false-trip the canary) — tolerating A/B *and* locale variants (FR-BC6). Data-only: no remote code, MV3's no-remote-code rule (FR-TS4) holds; a selector-data fix ships within the bounded FR-BC7/NFR-8 SLA, not store-review time. A code-level fix (e.g. a new insertion technique) still needs a store update.
- **Non-destructive insert:** before writing, detect existing non-empty composer content and never overwrite an in-progress draft (FR-BC8).
- **Post-inject read-back** (FR-BC2): re-read the node; assert the injected text is present at the intended node and registered with the editor model. Not "done" until this passes within the FR-BC1 budget.
- **Team alert** (FR-BC5): telemetry per failure class, provider, selector-version — pages the team before broad user impact.
- **Live-DOM prototype REQUIRED before trust:** the spike designed this against static/archived HTML; the Chrome browser tool was not connected, so no selector was validated against a live authenticated DOM. Prototype per provider — including, for Gemini, the closed-shadow-DOM check (FR-PA6, §C) — is a build precondition (§7).

## C. Per-provider ToS posture (from `V6hlDjecfh`; verbatim clauses live there)

- **ChatGPT (OpenAI) — GO (conditional):** ToU "What you cannot do" is extraction/interference-focused, not squarely on point for a one-way write into the user's own compose box. Conditions: never auto-click Send, never scrape Output, never fight a Cloudflare challenge.
- **Gemini (Google) — GO (conditional):** narrowest clause of the four (scoped to robots.txt-style extraction). Re-diff against the ToS revision effective 2026-07-30. **Additionally gated on a categorical, non-ToS condition (FR-PA6):** if Gemini's Angular/Material composer renders inside a shadow root with `mode:'closed'`, DOM injection is impossible outright, full stop — this is a pre-build DOM-accessibility check, not a selector-fragility risk the canary can absorb, and a closed root forces DEGRADE regardless of how the ToS question resolves. *Prior calibration:* Gemini's composer is Quill/Angular, and Quill renders into a **light-DOM `contenteditable`** (§A) — which lowers the closed-shadow-DOM likelihood versus a Material-web-component assumption; neither spike did live-DOM inspection, so this stays a hypothesis to rule in/out via the prototype, not an expected block. The same closed-shadow-DOM ruling applies to every GO provider's prototype and feeds FR-PA3.
- **Claude (Anthropic) — DEGRADE:** Consumer Terms §3(7) "automated or non-human means, whether through a bot, script, or otherwise" — a persistent content script matches on its face. Copy/paste delivered path; possibly supersede with the native memory-import route (FR-D6, OQ-E1) — **but memory-sync reaching GO there is a separate mechanism under a separate ruling and does not upgrade this DEGRADE (FR-D6, FR-PA1); the two MUST NOT be conflated.**
- **Grok (xAI) — DEGRADE:** xAI AUP carries the same clause; on x.com, X ToS "any means (automated or otherwise)" is stricter and controls — dual-ToS jeopardy. v1: grok.com only (OQ-E3).
- **The interpretation risk:** "automated means" clauses were drafted against scraping bots, not user-initiated own-session injection; a co-equal analysis read Claude + Grok as NO-GO. This is a lawyer call → counsel review is a hard build precondition (FR-PA4), and that same review MUST also cover the independent Chrome Web Store third-party-ToS-facilitation policy (FR-PA5) — a provider-ToS "win" does not guarantee a CWS listing survives review.

## D. Rejected mechanism alternatives (OQ1)

- **Bookmarklet:** best ToS-hygiene fact pattern (runs only on explicit click, no standing presence) BUT no auto-update (users hold frozen stale code), no native telemetry/canary channel, and CSP on modern SPAs (documented for X/Twitter, GitHub) already blocks `javascript:` execution — fatal for the Grok/x.com surface. Kept only as a ToS-hygiene comparator.
- **Native helper (local app / native-messaging / accessibility automation):** highest ToS exposure (an external process driving the browser is the closest fact pattern to prohibited automation/RPA), highest trust cost (OS-level install), highest build cost (cross-platform, signing). Rejected unless a provider hard-blocks extensions.

## E. Build plan (adopts `IgOjzk034v`)

- **Fork base:** `supermemoryai/supermemory` → `apps/browser-extension` (MIT, pushed 2026-07-14). Take: WXT/MV3 scaffold, per-provider file layout, ChatGPT composer skeleton (then add the missing input-event dispatch). Prune: bookmark/capture scope, broad `webRequest`/`tabs` permissions, non-F1 features.
- **Pattern donor:** `mem0ai/mem0-chrome-extension` (MIT, archived 2026-03-23). Mine: correct `dispatchEvent('input')` writers; Gemini/Claude/Grok/Perplexity selector maps (broadest coverage found). Strip: the `api.mem0.ai` phone-home (FR-TS2). Do not depend on the repo.
- **Build-fresh (no OSS prior art):** the FR-D7 breakage canary; the AD-6 pre-send review pause (both donors auto-inject silently — architecturally opposite to Orvex consent); GO/DEGRADE per-provider split; copy/paste degrade UI; Orvex memory-enrichment backend wiring (replace supermemory/mem0 backends with Orvex knowledge/ai).
- **License hygiene:** both MIT — clean for a store-distributed, Orvex-backend extension; preserve borrowed-file notices; exclude GPL/AGPL sources (e.g. ChatHub).

## F. Options considered — PRD shape

- Full standalone component PRD (chosen) vs lean PRD-delta on `g9vWbSYplh`. Chosen: full, because the PO ruled the extension a first-class 17th component (own space/repo/CI); the component deserves its own home doc. The delta framing survives as the fold-relationship in §9.
