# Adversarial Incompatibility Review — Extension Cross-AI Delivery Spine

**Lens:** ADVERSARIAL INCOMPATIBILITY (finalize_reviewers[1]) — the core spine test.
**Target:** `ARCHITECTURE-SPINE.md` (Orvex Studio Extension — Cross-AI Delivery), §2 AD-EXT-1..8, §3 topology, §4 sequence, §8 contract shapes.
**Cross-checked against:** PRD `QpVnEF7aEU` (FR-CF/FR-AU/FR-BC/NFR-6), verdict `V6hlDjecfh`, build-vs-buy `IgOjzk034v`.
**Reviewer stance:** adversary constructing two units one level down that each obey EVERY AD-EXT to the letter yet build INCOMPATIBLY.
**Date:** 2026-07-15
**Verdict: FAIL** — I constructed multiple real divergence pairs the spine does not close. Two are CRITICAL (a contract shape with two owners; a token that cannot carry the guarantee the spine asserts on it). Four more are HIGH.

The bar for this lens is explicit: *fail if you find a real divergence pair the spine does not already close.* I found seven. The spine's own headline claim — "zero ARCHITECTURE decisions left for the build agent" (§12) — is falsified by at least two build stories that must invent a pinned-but-absent decision to proceed.

---

## Method

For each attack I name (a) the two units one level down, (b) the proof that BOTH are AD-EXT-compliant, (c) the exact shared-data / ownership / state-mutation clash, (d) the specific AD gap, and (e) the new or tightened AD-EXT rule that closes it. Units are drawn from the four permitted families: two build stories (ENG-2711..2730 across B1..B6), two provider adapters, or the extension vs identity/api.

---

## FINDING 1 (CRITICAL) — Shape 1 fuses two different operations under one name and one generated-client symbol: the client DOM `composeInto` port and the server-side api compose-validation call

### The two units
- **Unit A — B3 (per-provider delivery adapters).** Realizes AD-5a's `composeInto(target, text) -> {ok | needs-manual-paste}` inside `entrypoints/content/<provider>.ts`. Per AD-EXT-5 the content script runs in the isolated world with **NO network** (§3: "NO network, NO token minting — they message the service worker only"). So for Unit A, `composeInto` is a pure in-process DOM operation: resolve → verify → insert → read-back → return `ok` or `needs-manual-paste`. No token, no api call, raw `text` in.
- **Unit B — B4 (token mint/present wiring) + the AD-EXT-8 seam client.** Reads §8 Shape 1 literally: *"`composeInto` … this is the api-side compose call the extension presents the token to,"* request `{providerId, target, deliveryToken, composedTextRef}`, response `{ok | needs-manual-paste}`, consumed via the **generated TS client** (AD-EXT-8, "never a hand-rolled type"). So for Unit B, `composeInto` is a server-side HTTP call over the seam that validates token/scope/consent/content and records the deliver-time audit (§4 `SW->API`).

### Both are fully AD-EXT-compliant
Unit A obeys AD-EXT-1 (adapter behind the registry), AD-EXT-4 (delivery IS the canary), AD-EXT-5 (isolated world, no network). Unit B obeys AD-EXT-3 (presents the token at compose), AD-EXT-8 (generated client, no hand-rolled type). Each is doing exactly what its AD-EXT tells it to.

### The clash
`composeInto` is **one name with two irreconcilable owners, transports, inputs, and outputs**:

| | Unit A (`composeInto` per AD-5a/§4 CS→P) | Unit B (`composeInto` per §8 Shape 1) |
|---|---|---|
| Owner | content script (isolated world) | api (server) |
| Transport | in-process DOM | seam HTTP, generated client |
| Input | `(target, text)` raw text | `{providerId, target, deliveryToken, composedTextRef}` |
| Does | DOM insert + read-back canary | token/scope/consent/content validation + audit |
| `needs-manual-paste` produced by | the canary read-back failing | ??? api cannot run the canary |

The two cannot be the same function. AD-EXT-5 forbids the content script from making the network call, so the DOM `composeInto` is provably not the api call. And the api call provably cannot return `needs-manual-paste` on the AD-5a semantics: §4 orders the api compose-validation (`SW->API`, step "Validated, deliver-time audit recorded") **before** the client canary (`SW->CS: Proceed to canary`, then `CS->P`). At the moment api responds, the canary has not run, so api physically cannot know whether the DOM insert will succeed or degrade — yet Shape 1 hands api the `{ok | needs-manual-paste}` response arm that only the canary can decide. The generated TS client (AD-EXT-8) will emit exactly one `composeInto` symbol from Shape 1 — the api one — and Unit A cannot use it (it's server-side, token-bound, and returns a validation result, not a DOM outcome). Two build stories generate two incompatible `composeInto`s and both cite the same §8 Shape 1 as authority.

### The AD gap
AD-EXT-8 declares "three contract shapes" and puts `composeInto` (Shape 1) in the codegen'd seam, but AD-5a's `composeInto` is the **client DOM port** (§ Design Paradigm: "realizes … AD-5a's `composeInto(target, text)` as one `DeliveryAdapter` interface") which AD-EXT-5 bars from the network. The spine never says which of the two `composeInto`s is the seam contract and which is the in-process interface, and it reuses the identical name and identical `{ok | needs-manual-paste}` response for both — guaranteeing the generated client collides with the DOM adapter.

### The rule that closes it
**Tighten AD-EXT-8 (and split §8 Shape 1 into 1a + 1b):**
- **Shape 1a — api compose-validation call (seam, codegen'd):** request `{providerId, target, deliveryToken, composedTextRef}`; response `{validated | refused}` (NOT `{ok | needs-manual-paste}` — api decides validity, never DOM outcome). Server-side, presented by the service worker only.
- **Shape 1b — the AD-5a client DOM port (in-process, NEVER codegen'd, NOT in the seam):** `composeInto(target, text) -> {ok | needs-manual-paste}`, owned by the content-script `DeliveryAdapter`, returns the canary outcome. AD-EXT-8 must state explicitly that Shape 1b is an internal client interface excluded from the contracts seam and the generated client, so the drift gate and codegen never emit it.
- Add to AD-EXT-3/§4 an ordering invariant: the `{ok | needs-manual-paste}` outcome is produced by the client canary **after** api returns `validated`; api's response is never the AD-5a outcome.

---

## FINDING 2 (CRITICAL) — The delivery-token scope `{memory, target, user}` cannot carry the composed-text binding the spine's anti-swap guarantee depends on; the build story must invent it

### The two units
- **Unit A — identity (mint).** Per Shape 2, mints on `mint request: {memoryRef, target, user-scope}`; the token scope is `{memory, target, user}`. It binds the **memory selection**.
- **Unit B — api (compose validation).** Per §8 Shape 1 Note, must "validate that mint-scope, consent, and **delivered-content** are the exact same bundle (closing the gap where a client could otherwise swap content after minting)." The delivered content is identified by `composedTextRef` (a composeId/content-hash of the **ai-composed, enriched** text — §8: "fetched by VALUE … from knowledge/ai").

### Both are fully AD-EXT-compliant
Unit A obeys AD-8 / AD-EXT-3 (mint scoped to `{memory, target, user}`, single-use, short-TTL). Unit B obeys AD-EXT-3 (enforcement at api), AD-EXT-7 (RYW audit), AD-EXT-8 (Shape 1 as authored).

### The clash
The token binds `memoryRef`. The anti-swap check is over `composedTextRef`. **These are different entities.** `composedTextRef` is a hash of the *enriched composition* produced by `ai` ("prompt composition/enrichment," §3) from the memory — not the memory itself. For api to enforce "delivered-content == consented bundle," it needs the composed-text identity inside the token or otherwise pinned at mint. It has neither:
- The token scope (Shape 2) contains no `composedTextRef` / content-hash.
- api "never re-serves the text" and "never re-derives it post-mint" (§8) — so api cannot recompute `hash(composedText)` to compare, and in any case ai enrichment is not guaranteed deterministic, so a recompute could differ from what the user consented to.

Result: api can confirm the token is a valid `{memory, target, user}` token and that *some* `composedTextRef` was presented, but it **cannot** confirm that `composedTextRef` is the bundle the user saw at consent (FR-CF1). The exact "swap content after minting" gap the spine claims to close stays open: a buggy/precompute-racing/malicious client presents `composedTextRef_B` (a different enrichment of the same `memoryRef`, e.g. from an OQ-E4 warm-cache refresh) against a token minted for `memoryRef`, and api accepts it. The user consented to text A; text B is delivered and audited as consented.

### The AD gap / invented decision
The spine asserts a guarantee (Shape 1 Note) that its own token shape (Shape 2) cannot express. To make api's validation real, build story B4 must **invent** the binding — either add `composedTextRef` to the mint request so the token pins it, or have api independently re-derive and compare (which §8 forbids). That is an architecture decision the spine claims (§12) it left none of. Two teams will invent opposite answers: identity's team may bind it into the token; api's team may trust the client's presented ref. Either way FR-CF1/FR-CF2 integrity depends on an unpinned choice.

### The rule that closes it
**Tighten AD-EXT-3 / Shape 2:** the mint request MUST carry the consented `composedTextRef` (content-hash of the exact bundle shown at FR-CF1 consent), and the minted token scope MUST become `{memory, target, user, composedTextRef}`. api validates `presented.composedTextRef == token.composedTextRef` (a string/hash equality it *can* perform without re-deriving text). Sequence §4 already fetches the bundle at `SW->K` **before** the `SW->ID MINT` step, so the ref is available to bind — the shape just fails to capture it. State explicitly that any OQ-E4 precompute that changes the composed text produces a new `composedTextRef` and therefore requires a fresh consent + fresh mint (it cannot silently satisfy an existing token).

---

## FINDING 3 (HIGH) — `tier` (and `selectorPackRef`, `writeStrategy`) have two owners: the in-code provider registry (AD-EXT-1) and the remote signed JSON (AD-EXT-2), with no precedence rule

### The two units
- **Unit A — B1 (foundation / provider registry).** Builds the AD-EXT-1 registry exactly as specified: `providerId -> {tier, hostMatch, selectorPackRef, writeStrategy}`, "the single place a provider is added or removed." Adding/removing a provider is a code change (a new `<provider>.ts` file), so this registry is **in-bundle code**, and `tier` is a field in it.
- **Unit B — B5 (tier-by-config channel).** Builds the AD-EXT-2 path: "every provider's tier is a field in the versioned, remote-fetched, signed JSON provider config," flippable "within the FR-BC7 remediation SLA, not a store update."

### Both are fully AD-EXT-compliant
Unit A implements AD-EXT-1's registry tuple verbatim (`tier` is listed in it). Unit B implements AD-EXT-2's remote tier config verbatim. Each is doing precisely what its AD-EXT names.

### The clash
`tier` now lives in **two owners**: an in-bundle code field (registry) and a remote signed-JSON field (config). The spine states no precedence. When they disagree — which is the *entire reason AD-EXT-2 exists* (a counsel DEGRADE→GO flip, or a closed-shadow-DOM GO→DEGRADE finding per AD-EXT-4) — the adapter that reads `registry.tier` injects while the degrade path that reads `config.tier` copies (or vice-versa). This is not cosmetic: it decides inject-vs-copy, which is a ToS-clean-vs-ToS-risk and firewall-relevant behavior. Worse, AD-EXT-1 giving the registry a *code* `tier` field directly contradicts AD-EXT-2's promise that a tier flip is "a config push … not a store update" — if `registry.tier` is authoritative, a flip *requires* a store update. AD-EXT-2 also says the extension "DEFAULTS a provider to DEGRADE when its config is absent," which is incoherent if `registry.tier` already carries an authoritative value. The same double-ownership afflicts `selectorPackRef` (registry pointer vs the self-versioning remote pack — which pins the live pack version?) and `writeStrategy` (registry field vs §5's per-surface technique baked in the adapter).

### The AD gap
AD-EXT-1's registry tuple `{tier, hostMatch, selectorPackRef, writeStrategy}` overlaps AD-EXT-2's remote config on `tier` (and `selectorPackRef`) with no stated authority. Neither AD names the winner nor forbids a resolved `tier` in the registry.

### The rule that closes it
**Tighten AD-EXT-1 + AD-EXT-2:** remove any *resolved live value* from the code registry. The registry carries only static, code-level identity — `providerId -> {hostMatch, contentScriptEntry}` (and at most a `tierConfigRef`/`selectorPackRef` that is a *pointer*, never a value). State a single precedence rule: **the remote signed JSON (AD-EXT-2) is the sole authority for the live `tier` and the live `selectorPackVersion`; absent/stale/invalid config fails safe to DEGRADE; the code registry never carries a resolved tier or a pinned pack version.** Fold `writeStrategy` selection to §5's surface mapping owned in the adapter, and delete `writeStrategy` from the registry tuple (or make it a non-authoritative annotation) so it cannot drift against the adapter.

---

## FINDING 4 (HIGH) — Single-use token vs the GO-provider canary-fail→copy path: the token is consumed at the api compose call before the canary runs, leaving the copy fallback with a spent token or an undefined re-mint

### The two units
- **Unit A — B4 (mint/present).** Implements AD-EXT-3: single-target, single-use, short-TTL token, presented to api at compose (§4 `SW->API`), "re-mints on every per-use action."
- **Unit B — B5 (canary + degrade).** Implements AD-EXT-4 + §4's GO branch: canary runs *after* the api compose call; on failure it branches to copy/paste (§6), and §4's DEGRADE note says "consent and the token still apply to the copy path."

### Both are fully AD-EXT-compliant
Unit A obeys AD-EXT-3 to the letter (single-use, present-then-consumed). Unit B obeys AD-EXT-4 and §4's ordering and its copy-path-consent rule.

### The clash
Per §4 the sequence is: mint → **present token to api (consumed)** → api records deliver-time audit → *then* client canary → on failure, copy/paste. For a **GO provider whose canary fails at runtime**, the token was already single-use-consumed by the api call *before* the failure was known. The copy fallback now must either:
- **reuse the already-consumed token** — violating AD-EXT-3's single-use invariant; or
- **re-mint** — but re-mint is defined as "every per-use action," which re-triggers consent (FR-CF1), so a transparent inject→copy degrade would pop a second consent for the same click; and the spine never says the copy path re-mints.

The pure-DEGRADE path (Claude/Grok, canary never runs) is specified; the **GO-then-fail-to-copy** path — the common breakage case AD-EXT-4 exists for — is not. Compounding it: api recorded the deliver-time audit as a *compose* at the pre-canary step, but the delivery actually became a *clipboard copy*. The server audit now asserts an injection that never happened. Two units (identity/api's "delivered via compose" record vs the client's real outcome) disagree on what occurred.

### The AD gap
AD-EXT-3 pins single-use + re-mint-per-action; §4 pins compose-call-before-canary; §4's DEGRADE note pins "token applies to copy." For the GO-fail→copy case these three cannot all hold. No AD resolves the token lifecycle when a presented token's delivery downgrades after the fact.

### The rule that closes it
**Tighten AD-EXT-3 + AD-EXT-4:** define the token as bound to a *delivery attempt*, not a *transport*. Move the single-use consumption point to the **final delivery outcome**, not the pre-canary api validate: api's compose call *reserves/validates* the token; the client reports the terminal outcome (`injected` | `copied` | `aborted`) back to api, which *then* marks the token spent and writes the authoritative audit reflecting the real mechanism. A GO-fail→copy is the **same** per-use action under the **same** token (no second consent, no re-mint); a *target change* still forces re-mint. State that api's audit is written on outcome-report, never at pre-canary validate.

---

## FINDING 5 (HIGH) — Two owners of the audit log: the client-side bounded log (AD-EXT-6 / §7 / FR-CF6 / NFR-6) and api's deliver-time audit (§4 / §8), with no authority or reconciliation rule

### The two units
- **Unit A — B4/B5 client audit.** Per AD-EXT-6 / §7 / FR-CF6 / NFR-6, the extension holds a "bounded audit log (retention window, size cap, protected at rest)" of consent/injection decisions, cleared on uninstall.
- **Unit B — identity/api server audit.** Per §4 ("deliver-time audit recorded") and §8 Shape 1 ("record the RYW-relevant audit"), api records the delivery server-side.

### Both are fully AD-EXT-compliant
Unit A obeys AD-EXT-6 and NFR-6. Unit B obeys AD-EXT-3/AD-EXT-7 and Shape 1.

### The clash
There are now two audit logs for the same firewall/consent-critical event, and the spine never says which is the **system of record**. In a firewall-breach compliance dispute ("did employer-scoped memory reach a personal ChatGPT session?"), the client log (attacker-clearable, uninstall-wiped, size-capped — it *rotates out* evidence by design) and the api log can disagree, and no rule says the server wins or how they reconcile. The PRD calls the local log "the trust evidence" (NFR-6) while the spine puts enforcement server-side (AD-8) — the *evidence* and the *enforcement* live on opposite sides of the trust boundary with no stated primacy. Two teams implement two logs, each believing theirs is authoritative.

### The AD gap
No AD-EXT designates the compliance system-of-record for the audit entity, nor scopes the client log to non-authoritative local UX only.

### The rule that closes it
**Tighten AD-EXT-6 (+ cross-ref AD-EXT-3):** the **server (identity/api) audit is the sole compliance system-of-record**; the client bounded log is explicitly non-authoritative local UX/history and MUST NOT be relied on as trust evidence. Require the client to report the terminal delivery outcome to api (ties to Finding 4) so the server record reflects the real mechanism (injected/copied/aborted) and the true delivered `composedTextRef` (ties to Finding 2).

---

## FINDING 6 (HIGH) — Personal-vs-employer scope: the client resolves it (AD-EXT-6 / FR-AU2) and sends `user-scope` in the mint request (Shape 2), but AD-8 says the client never decides — the trust model for the client-supplied scope is undefined

### The two units
- **Unit A — B2/B4 client scope resolution.** Per AD-EXT-6 / FR-AU2, the extension resolves "an EXPLICIT, currently-active personal-vs-employer scope … from the LIVE Orvex session at the moment of delivery" and, per Shape 2, sends `user-scope` in the mint request.
- **Unit B — identity (mint enforcement).** Per AD-8 / AD-EXT-3, "consent and the personal↔employer firewall bind at the mint boundary … the client presents tokens, it never decides them," and "the firewall breach … is ENFORCED at mint."

### Both are fully AD-EXT-compliant
Unit A obeys AD-EXT-6 (resolve scope client-side from live session). Unit B obeys AD-8 (enforce at mint).

### The clash
The mint request carries a client-resolved `user-scope`. Does identity **trust** it or **re-resolve** it?
- If identity trusts the client's `user-scope`, then the untrusted client has *decided* the firewall subject — violating AD-8's "never decides them," and an attacker who tampers the scope field breaches the firewall at the point the spine claims is authoritative.
- If identity re-resolves scope server-side from the session and ignores the client value, then Shape 2's `user-scope` field is a divergence hazard: the client's FR-CF7 pre-mint guard and FR-CF1 preview run against the client-resolved scope, which can differ from identity's server-resolved scope (e.g., a scope switch racing the session refresh), so the user previews "personal" while identity mints for "employer" or refuses — with no reconciliation.

The spine never states which. Two teams implement opposite trust models against the same Shape 2 field, both "compliant."

### The AD gap
AD-EXT-6 makes the client resolve scope; AD-8 makes the client never decide; Shape 2 puts `user-scope` on the wire without a trust designation. The seam between "client resolves for its own UX" and "server is authoritative" is unpinned.

### The rule that closes it
**Tighten AD-EXT-6 + AD-EXT-3 / Shape 2:** state that **identity re-resolves the personal-vs-employer scope server-side from the live Orvex session and is authoritative**; any client-supplied scope is a non-authoritative *assertion* used only to detect mismatch (fail-closed if client-asserted ≠ server-resolved). The client's AD-EXT-6 resolution drives ONLY the local preview and the FR-CF7 pre-mint guard, never the minted scope. Rename Shape 2's field to `asserted-scope` (or drop it and have the client send only the session token) so no build story can read it as authoritative.

---

## FINDING 7 (MEDIUM) — `data-orvex-initialized` is one DOM attribute with two lifecycle owners and two meanings: SPA re-init ("observer attached") and the canary ("already injected here")

### The two units
- **Unit A — B3 SPA resilience (per-adapter).** Per §5, uses `data-orvex-initialized` as the idempotency guard so "MutationObserver + URL-poll re-init" doesn't double-attach across "repeated observer fires" — meaning "the extension has already wired up this composer node."
- **Unit B — B5 canary (shared `lib/canary/`).** Per §5, the same `data-orvex-initialized` "prevent[s] double-injection" — meaning "we have already written into this node."

### Both are fully AD-EXT-compliant
Both obey AD-EXT-1 (adapter/registry), AD-EXT-4 (canary), and §5's consistency convention (which names exactly one attribute).

### The clash
"Observer attached to this composer" and "already delivered into this composer" are different lifecycle facts sharing one attribute and one owner slot. If the shared canary sets `data-orvex-initialized` to mark a completed injection, the per-adapter observer reads it as "already wired" and skips a legitimate re-init after a new-chat/model-switch navigation into a *reused* node — losing the composer reference the SPA logic exists to preserve. Conversely, if SPA re-init sets it on attach, the canary reads it as "already injected" and **blocks a legitimate second delivery** into the same chat (the user delivering twice), a silent no-op with no failure class. One attribute, two writers, opposite intents.

### The AD gap
The Consistency Conventions and §5 pin the attribute *name* but not its single owner or single semantic; two AD-EXT-1 units (per-adapter SPA vs shared canary) both claim it.

### The rule that closes it
**Tighten AD-EXT-1 / §5 conventions:** split the concerns into two named, single-owner attributes — e.g. `data-orvex-attached` (owned by the per-adapter SPA/observer lifecycle) and `data-orvex-last-delivery` (owned by the shared canary, and NOT a delivery-blocker — repeat delivery into the same node is permitted and is a fresh per-use action). State that no single attribute encodes both "wired" and "delivered."

---

## Summary of divergence pairs and the rules that close them

| # | Sev | Incompatible pair | AD gap | Closing rule |
|---|-----|-------------------|--------|--------------|
| 1 | CRITICAL | B3 DOM `composeInto` (no-network, AD-5a) vs seam `composeInto` (api call, §8 Shape 1) | AD-EXT-8: one name/shape for two owners/transports | Split Shape 1 into 1a (api, `{validated\|refused}`, codegen'd) and 1b (client DOM `{ok\|needs-manual-paste}`, never codegen'd) |
| 2 | CRITICAL | identity mint on `memoryRef` vs api anti-swap check on `composedTextRef` | Token scope `{memory,target,user}` cannot express the composed-text binding | Bind `composedTextRef` into the mint request + token scope; precompute change ⇒ new ref ⇒ re-consent |
| 3 | HIGH | B1 registry `tier` (code) vs B5 remote config `tier` (data) | AD-EXT-1/AD-EXT-2 double-own `tier`/`selectorPackRef`, no precedence | Registry carries no resolved value; remote signed JSON is sole authority for live tier/pack version; absent⇒DEGRADE |
| 4 | HIGH | B4 single-use token (consumed pre-canary) vs B5 GO-fail→copy fallback | Token lifecycle undefined when delivery downgrades post-validate | Bind token to the delivery *attempt*; consume on client-reported terminal outcome; audit on outcome-report |
| 5 | HIGH | client bounded audit log vs api deliver-time audit | No compliance system-of-record designated | Server audit is sole SoR; client log non-authoritative; client reports terminal outcome |
| 6 | HIGH | client scope resolution (AD-EXT-6/FR-AU2, `user-scope` on wire) vs identity mint enforcement (AD-8) | Trust model for client-supplied scope unpinned | identity re-resolves scope server-side & is authoritative; client value is a fail-closed assertion only |
| 7 | MEDIUM | per-adapter SPA guard vs shared canary guard on `data-orvex-initialized` | One attribute, two owners/semantics | Split into `data-orvex-attached` (SPA) and `data-orvex-last-delivery` (canary, non-blocking) |

## Verdict rationale

**FAIL.** The lens' fail condition — "a real divergence pair the spine does not already close" — is met seven times over, two at CRITICAL. Findings 1 and 2 also each independently falsify the spine's §12 claim of "zero ARCHITECTURE decisions left for the build agent": Finding 1's `composeInto` collision forces B3/B4 to invent which call the seam owns, and Finding 2's missing token binding forces B4 to invent how api proves delivered-content == consented content — a firewall/consent-integrity decision, not an implementation detail. Findings 3–6 are classic two-owners-of-one-entity gaps (tier, audit, scope) plus a conflicting-state-mutation path (token single-use vs post-validate downgrade), each of which lets two AD-EXT-compliant units diverge on inject-vs-copy, on what the compliance record says happened, or on who the firewall's subject is. None is closed by the current text; all are closable by the tightened rules above without reopening any adopted verdict, tier, or invariant.
