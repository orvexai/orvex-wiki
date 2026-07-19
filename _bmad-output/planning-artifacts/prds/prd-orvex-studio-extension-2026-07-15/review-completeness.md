# Completeness / Edge-Case Review — Orvex Studio Extension PRD

**Reviewer:** Adversarial completeness / edge-case hunter
**Documents:** `prd.md` + `addendum.md` (both read in full)
**Verdict:** PASS_WITH_FIXES

---

## Summary

This is a strong, honest PRD. It folds F1 FR-D1..D7 into a real component home, adopts `V6hlDjecfh` and `IgOjzk034v` verbatim with cited slugs (ENG-2690 AC1 met), surfaces the AC3 must-resolves explicitly rather than silently (repo/wiki/Linear resolved; store-posture + open-source posture flagged OPEN), and makes consent + firewall contract-level obligations (AC4) rather than injecting silently. FR-D6 sync-out is correctly cross-referenced to knowledge (AC2). The breakage-canary spine, the pre-send review pause, and the GO/DEGRADE honesty are genuinely well-specified.

But for a browser extension that **writes private and employer-scoped memory into third-party AI web UIs**, several failure classes that the product *carries* are named by no section. The most serious: the extension's whole distribution channel (the Chrome Web Store) can reject a ToS-adjacent injector — an existential risk treated only as review *latency*, not *rejection*; and there is **no requirement anywhere for how the extension authenticates to Orvex or knows which memory scope is active** — which is the load-bearing precondition for the firewall to mean anything at delivery. The clipboard fallback silently broadens exposure of the exact private/employer data the firewall guards. These are addable, not fatal — hence PASS_WITH_FIXES, but the three CRITICAL/HIGH-security items should block architecture sign-off.

**FR overlaps (acceptable, but note):** FR-D4 ≈ FR-CF1/CF2, FR-D7 ≈ F-E, FR-CF4 restates FR-S6 — all are explicit fold/cross-refs ("See F-D", "Expanded in F-E") and are fine. **Traceability gap:** inherited IDs FR-S6, FR-O3, FR-O4 are cited but not defined here; a reader can't verify the fold without the umbrella open. **AC2 story-mapping** (every FR-D → ≥1 story) cannot be verified from this doc — the stories live in ENG-2711..2730; the pack, not this PRD, must carry that matrix.

---

## Findings

### 1. [CRITICAL] Store-review *rejection* of a ToS-adjacent injector is unaddressed — only review *latency* is
**Location:** §6 NFR-8, §8 store-distribution posture

The entire product ships through the Chrome Web Store, and CWS Developer Program Policy prohibits extensions that facilitate violations of *other services'* terms. The PRD itself documents that Claude and Grok are DEGRADE precisely because their "automated means" clauses arguably bar a content script — and a store reviewer can apply that same reasoning to reject the extension for **all** providers, including the GO ones. §8 treats the store only as a *latency* budget for canary fixes; the far larger risk — outright rejection or post-publish takedown of the injecting build — is named nowhere. This is existential: no store listing, no distribution, no product.

**Fix:** Add an FR (F-F or NFR-8) making "store-policy viability for an injecting extension" an explicit build precondition alongside FR-PA4's counsel review — including a store-listing narrative that frames injection as user-initiated own-session assistance, a fallback distribution posture if CWS rejects (self-hosted/enterprise/Firefox-first), and a contingency that the *same* counsel opinion covers CWS third-party-ToS policy, not only the providers' ToS.

### 2. [CRITICAL] No requirement for how the extension authenticates to Orvex or knows the active memory scope — the firewall has nothing to bind to
**Location:** §F-C connection, §F-D firewall, §7 dependencies

FR-CN3 says connection requires *only* that the user is signed in **to the provider** — "no Orvex-held provider credentials, no OAuth to the provider." But the memory bundle comes from `orvex-studio-api` / `orvex-studio-knowledge`, and the personal↔employer firewall lives in `orvex-studio-identity`. Nothing in the PRD states how the extension authenticates to Orvex, where that token lives, how it refreshes/revokes, or — critically — **how the active Orvex scope (personal vs. employer) is determined at the moment of injection into a provider tab.** FR-CF2 asserts the firewall "MUST be enforced at delivery," but delivery happens inside the provider's tab under the provider's account with no stated link to any Orvex identity. Without that binding the firewall is unenforceable by construction.

**Fix:** Add FRs for (a) Orvex authentication of the extension (token storage in extension storage, refresh, mid-session expiry behavior, sign-out), and (b) an explicit binding between the active Orvex scope and each delivery, so FR-CF2 has a subject. State what happens when the Orvex session expires mid-compose (must fail closed, not fall back to an unscoped bundle).

### 3. [HIGH] The clipboard fallback silently broadens exposure of the exact private/employer memory the firewall guards
**Location:** §F-E FR-BC4, §F-D, UJ-2, UJ-3

Both DEGRADE (Claude/Grok) and every fail-loud abort put the enriched prompt — which may contain private and employer-scoped memory — **onto the system clipboard** (FR-BC4, UJ-2 "copied," UJ-3 "puts the prompt on her clipboard"). The system clipboard is readable by every other app, other extensions, clipboard managers, and OS cloud-clipboard sync (Windows Win+V history, macOS Universal Clipboard). The consent step (FR-CF1) and the deletion-boundary disclosure (FR-CF3, scoped to "third-party session") say nothing about this. The primary fallback path — reached on *every* breakage and for *two of four* providers — routes firewalled data through the least-controlled surface on the machine, with no disclosure.

**Fix:** Extend FR-CF3's deletion-boundary and FR-CF1's consent disclosure to cover the clipboard explicitly; consider consent-gating clipboard placement of private/employer items, an auto-clear/expiry of the copied payload, and a warning when employer-scoped content is copied.

### 4. [HIGH] Multi-account provider sessions, account-switch, and logged-out/expired-mid-use are unhandled — and they break the firewall
**Location:** §F-C, UJ-1, §F-D

UJ-1 and FR-CN3 assume one signed-in provider tab. Real state: ChatGPT/Gemini/Grok all have account and workspace switchers; a user can be in a personal account in one tab and an employer/Team workspace in another, or switch mid-session, or be silently logged out when a token expires. The extension has no stated way to detect *which provider account* is active, so it cannot prevent injecting employer memory into a personal ChatGPT (or vice-versa) — the firewall's core promise. "Not signed in" is listed as a status (FR-CN2) but the *transition* (signed-in → expired between consent and write) and multi-account detection are unspecified.

**Fix:** Add FRs for detecting provider account/workspace context (or, if undetectable, requiring explicit user confirmation of the target account before injecting scoped memory), for handling session expiry between consent and write (re-probe → re-consent or fail closed), and define behavior when multiple provider tabs/accounts are open.

### 5. [HIGH] Non-destructive injection is unspecified — injection can clobber the user's in-progress draft
**Location:** §F-A FR-D1, §F-E FR-BC2, addendum A

The composer-write technique (addendum A) replaces/sets the composer value, but no FR says what happens when the user **already has text in the compose box**. `setNativeValue` and `execCommand('insertText')` behave differently (overwrite vs. insert-at-cursor); a naive set clobbers a half-typed message with no undo. For a "user reviews and sends it themselves" product, silently destroying the user's own draft is a trust and data-loss failure the read-back check (FR-BC2) would even report as *success*.

**Fix:** Add an FR requiring non-destructive injection — detect existing composer content and prepend/append/insert-at-cursor (or prompt the user) rather than overwrite; never destroy user-authored text.

### 6. [HIGH] No emergency tier-demotion / kill path reconciled with MV3 no-remote-code + store latency
**Location:** §F-B FR-PA3, §F-F FR-TS4, §F-E FR-BC7

FR-PA3 says a provider's tier is "changeable without a code rewrite" via config/manifest; FR-TS4 forbids remote code; FR-BC7 says fixes ship as store updates. These leave a hole: if counsel flips a provider to NO-GO or a provider issues a C&D, is the emergency GO→copy/paste demotion a *remote-fetched config* (fast, but the PRD never says remote config is allowed, and it must be distinguished from "remote code") or a *baked manifest* (store-review-latency-bound, potentially days)? A legal takedown that can only ship at store-review speed is a real liability exposure. FR-BC7's "before most users notice" claim also silently depends on store-review latency it never bounds.

**Fix:** Explicitly allow a **remote tier/kill config** (data, not code — distinct from FR-TS4's remote-code ban) with an Orvex-hosted emergency demotion switch that takes effect without a store update; state the review-latency assumption FR-BC7 relies on and the fallback when it's exceeded.

### 7. [HIGH] Consent revocation, connection removal, and uninstall/data-clearing paths are missing (AC4's flip side)
**Location:** §F-D, §6 NFR-6

AC4 makes consent contract-level, and FR-CF1 grants it — but nothing covers *revoking* it: removing a connected assistant, revoking a standing/remembered consent, or what happens to locally stored state on uninstall. NFR-6 mandates a local consent/injection **audit log** — which by definition records what memory was delivered, i.e., sensitive content at rest in extension storage — with no stated retention, encryption, size bound, or deletion on uninstall/disconnect. Consent you cannot withdraw, and an audit log that survives uninstall, are both consent-model gaps.

**Fix:** Add FRs for disconnect/revoke flows and for local-data lifecycle (audit-log retention/bound, clear-on-disconnect, wipe-on-uninstall, and whether the audit log is scrubbed of memory content or protected at rest).

### 8. [HIGH] Selectors and the canary are locale-dependent — non-English DOMs will false-positive or break, undercutting the EU beachhead
**Location:** §6 NFR-7, addendum B, §F-E FR-BC6

NFR-7 localizes the extension's *own* strings but the **selector strategy** is the real i18n risk. Addendum B prefers "stable ARIA/role/data-testid" — but ARIA labels and placeholder text are **localized by the provider**: a French or German ChatGPT/Gemini renders different `aria-label`/placeholder strings, so any text- or ARIA-label-based selector breaks or false-trips the canary per language. Given the EU regulated-role beachhead (Laura, EU AI Act tailwind), this is load-bearing, not phased. RTL languages (Arabic/Hebrew) also affect composer injection. NFR-7 and FR-BC6 (A/B variants) do not name locale as a variant axis.

**Fix:** Require the selector manifest and canary to be locale-robust (prefer locale-invariant `data-testid`/`role`/structural anchors over localized `aria-label`/text; treat locale as a first-class A/B axis in FR-BC6); require live-DOM prototype validation on at least one non-English beachhead locale; note RTL composer handling.

### 9. [MEDIUM] No accessibility requirement for the extension's own consent/notice UI, and focus-steal on inject is unaddressed
**Location:** §6 (no a11y NFR), §F-D, §F-E FR-BC3

The beachhead is regulated professionals, which includes users with disabilities, yet no NFR requires the extension's own surfaces (connect card, consent panel, copy-ready panel, the "visible user notification" of FR-BC3) to be keyboard-navigable, screen-reader-announced, or focus-managed. Injecting into the composer also **steals focus/cursor**, which is disruptive for assistive-tech users and unspecified. NFR-5 covers "non-technical," not "accessible."

**Fix:** Add an accessibility NFR (WCAG-level target for extension surfaces; screen-reader announcement of breakage notices and consent; keyboard operability; defined focus behavior on inject).

### 10. [MEDIUM] The extension's own in-page consent/notice UI may be blocked by the same provider CSP that killed the bookmarklet
**Location:** §F-D, §F-E, addendum D

Addendum D rejects the bookmarklet partly because provider CSP (documented on X, GitHub) blocks injected execution. But the extension still needs to render its **own** consent panel, memory preview, and fail-loud notice *inside the provider page* to enforce FR-CF1 and FR-BC3. Strict provider CSP / DOM sanitization can block or strip content-script-injected UI on some providers. Whether the consent/notice UI renders under each provider's CSP is a technical risk the live-DOM prototype must cover but no section names.

**Fix:** Add the consent/notice UI's CSP-survivability to the per-provider live-DOM prototype precondition (§7); specify a CSP-safe rendering approach (shadow DOM / extension popup vs. in-page overlay) and the fallback when in-page UI is blocked.

### 11. [MEDIUM] Billing/tier-gating is an orphaned dependency — named in §7, owned by no FR
**Location:** §7 (orvex-studio-billing "tier gating")

§7 lists `orvex-studio-billing` for "tier gating," but no FR in §5 mentions tiers, paywalls, connect limits, or entitlement checks. What is gated (number of connections? providers? enrichment volume?), and what the extension does on a free tier, an expired subscription, or a downgrade, is entirely unspecified. Either the dependency is spurious or a whole requirement class is missing.

**Fix:** Either add an FR describing tier-gated behavior and the downgrade/expired/free states (including fail-open-to-copy/paste vs. hard block), or remove the billing dependency if the extension is entitlement-agnostic.

### 12. [MEDIUM] Content-script message surface and prompt-size limits are unhardened
**Location:** §F-F FR-TS3, §F-A FR-D1

Two under-specified edges: (a) MV3 isolated worlds separate JS but the **page can still post messages** to the content script — if the content-script→background channel isn't authenticated against page-originated messages, a malicious/compromised provider page could request or exfiltrate the memory bundle; FR-TS3 governs read scope but not inbound message trust. (b) An enriched prompt can exceed the composer's character/token limit; the provider may silently truncate, delivering a mangled prompt the read-back (FR-BC2) still passes. Neither is named.

**Fix:** Add an FR requiring the content-script message channel to reject page-originated messages (origin/sender validation), and specify behavior when the enriched prompt exceeds the composer limit (measure and warn/split rather than silently truncate).

---

## Strengths (for balance)

- Honest DEGRADE messaging and explicit withdrawal of the "no copy/paste" promise for Claude/Grok — no overclaiming.
- Fail-loud canary with pre-inject probe **and** post-write read-back (FR-BC1/BC2) directly targets the silent-mis-injection class most competitors ignore.
- AC3 must-resolves surfaced, not buried; store-posture and open-source posture left honestly OPEN with owners.
- Build approach credits the fork honestly and explicitly refuses to credit it with the net-new consent/canary work (FR-BA3).
- Counsel review and live-DOM prototype are hard, named build preconditions (§7, FR-PA4) — not assumed away.
