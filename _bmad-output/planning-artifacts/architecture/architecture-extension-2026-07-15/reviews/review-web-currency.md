# Review — WEB-CURRENCY / REALITY-CHECK

**Reviewer lens:** finalize_reviewers[0] — WEB-CURRENCY / REALITY-CHECK
**Target:** `_bmad-output/planning-artifacts/architecture/architecture-extension-2026-07-15/ARCHITECTURE-SPINE.md`
**Review date:** 2026-07-15 (live npm/web checks, not training-data recall)
**Verdict: PASS**

## Method

All checks performed live, not from model training-data assumptions:
- `npm view <pkg> dist-tags.latest` for all five Stack entries, plus `npm view <pkg> versions --json` to inspect the tail of the release history (catches "latest tag is stale/wrong" and "a newer non-latest release exists" cases) and `npm view <pkg> time.<ver>` / `deprecated` for anomalies.
- `gh api repos/<org>/<repo>` for the three cited GitHub projects (existence, archived flag, license, last-push date, description) plus a contents listing to confirm the exact subpath cited in the doc.
- `WebSearch` + `WebFetch` against Chrome for Developers / Google Policies pages for the three external-policy claims.

## 1. Stack versions (§ "Stack (seed)")

| Package | Doc claims | `dist-tags.latest` (checked 2026-07-15) | Verdict |
|---|---|---|---|
| WXT | 0.20.27 | 0.20.27 | MATCH |
| TypeScript | 7.0.2 | 7.0.2 | MATCH |
| React | 19.2.7 | 19.2.7 | MATCH |
| @types/chrome | 0.2.2 | 0.2.2 | MATCH |
| Vitest | 4.1.10 | 4.1.10 | MATCH |

All five match exactly. Deeper sanity pass on the version tails, since a `dist-tags.latest` match alone doesn't rule out "a newer version exists under a different tag" or "the latest tag itself is stale/wrong":

- **WXT** — a `0.21.0` exists in the version list, published AFTER 0.20.27, but is NOT the `latest` dist-tag. Inspected directly: `wxt@0.21.0` carries an npm `deprecated` notice — *"Accidental release, see 0.20.18 instead"* — and `dist-tags.latest` correctly stays pinned at `0.20.27`. The doc's citation is correct; this is not a finding, just documenting that the check went one level deeper than dist-tags alone.
- **TypeScript** — versions immediately after `7.0.2` are `7.1.0-dev.20260708.3` … `7.1.0-dev.20260714.1` (unpublished dev snapshots on the `dev`/nightly channel, not `latest`). `7.0.2` is correctly the current stable — this also confirms TS7 (the native/Go-ported compiler line) really has shipped as of this date, not a training-data artifact.
- **React** — versions after `19.2.7` are `19.3.0-canary-*` builds (canary channel). `19.2.7` is correctly current stable.
- **Vitest** — versions after `4.1.10` are `5.0.0-beta.*` (beta channel). `4.1.10` is correctly current stable, correctly not jumping to the v5 beta line.
- **@types/chrome** — version history runs `…0.1.42, 0.1.43, 0.2.0, 0.2.1, 0.2.2` — a monotonic, non-prerelease sequence; `0.2.2` is the tip. No anomaly.

All five Stack entries are genuinely current-stable as of the review date, not asserted from stale training data. No findings here.

## 2. Named OSS projects (fork base, pattern donor, framework)

| Claim | Verified | Verdict |
|---|---|---|
| `wxt-dev/wxt` exists, MIT, active, is an extension framework | `gh api repos/wxt-dev/wxt` → not archived, `license.spdx_id: MIT`, description "⚡ Next-gen Web Extension Framework", `pushed_at: 2026-07-11`, 10,179 stars | MATCH — exists and fits the stated role |
| `supermemoryai/supermemory`, path `apps/browser-extension`, MIT, "pushed 2026-07-14" | `gh api repos/supermemoryai/supermemory` → not archived, `license.spdx_id: MIT`, `pushed_at: 2026-07-14T20:49:23Z` (exact date match to the doc's §9 citation); `gh api .../contents/apps/browser-extension` → path exists and contains `wxt.config.ts`, `entrypoints/`, confirming it is in fact a WXT-based extension, consistent with the doc's claim that WXT is "the supermemory fork base" | MATCH — exists, correct license, correct path, correct WXT lineage |
| `mem0ai/mem0-chrome-extension`, MIT, "archived 2026-03-23" | `gh api repos/mem0ai/mem0-chrome-extension` → `archived: true`, `license.spdx_id: MIT`, `pushed_at: 2026-03-23T23:26:12Z` (exact date match to the doc's §9 citation), description confirms it targets ChatGPT/Claude/Perplexity/Grok memory injection | MATCH — exists, correctly stated as archived, MIT, fits "pattern donor, never a live dependency" role |

All three project bindings are real, correctly licensed, and correctly characterized (active vs. archived, exact push/archive dates cited in the doc line up to the day with the live GitHub metadata). No findings here.

## 3. External policy claims

### 3a. Chrome Web Store AI-injector / Limited-Use policy, restriction dated 2026-08-01

Confirmed via `developer.chrome.com/blog/cws-policy-updates-2026` (WebFetch) and corroborating press (Android Authority, CyberInsider, Cybernews, etc., WebSearch, all dated ~2026-07):
- The update is real, announced ~2026-07-01, **enforcement begins 2026-08-01** — matches the doc's `2026-08-01` date exactly.
- It bundles two policy changes: (1) a **Limited Use Data policy** tightening what data an extension may collect, and (2) a separate ban, under Chrome's **Malicious and Prohibited Products Policy**, on "extensions designed to circumvent safety guardrails, usage restrictions, or other protective measures implemented by AI-powered services" — the AI-injector/jailbreak restriction.

**Finding (LOW):** the doc's §-AD-6 line reads *"the category Chrome Web Store restricts from 2026-08-01 (Limited-Use data policy)"* — this attributes the AI-injector/prompt-injection restriction to the **Limited-Use Data policy**, but per Chrome's own announcement the AI-guardrail-circumvention ban is a **separate, distinctly-named policy** (Malicious and Prohibited Products Policy), not the Limited-Use Data policy. The date (2026-08-01) is correct and both changes do ship in the same announcement/enforcement wave, so the substance (a real, dated CWS restriction that bears on shipping an AI-compose extension) is not wrong — only the specific policy-name attribution is imprecise. Does not change the verdict; worth a one-line correction before this doc is cited in the legal-counsel precondition (§10 item 1), since counsel will want the correct policy name.

### 3b. Google ToS revision effective 2026-07-30

Confirmed via WebSearch (Gulf News, Strategic Revenue, and Google's own `policies.google.com/terms/update`): Google's Terms of Service revision **does take effect 2026-07-30**, and does add/clarify "automated means" access language (prohibiting automated access in violation of machine-readable instructions, expanded AI-related provisions). Matches the doc's OQ-E2 citation exactly (date and substance — a "must re-diff before Gemini ships" framing is a reasonable, appropriately cautious reading of a live, dated ToS change).

### 3c. MV3 no-remote-code rule (permits remote JSON, not remote code)

Confirmed via `developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code` (WebFetch): Manifest V3's Remote Hosted Code (RHC) restriction applies to executable code (JS, WASM) loaded from outside the extension package; it explicitly **excludes** data formats like JSON and CSS. This is exactly the doc's AD-EXT-2 / AD-EXT-5 framing — "data, not code, so MV3's no-remote-code rule is unaffected" and "selector/tier packs are remote DATA only... NO remote code." Matches precisely.

## Summary

Every committed technology decision in this document was reality-checked against a live source (npm registry or GitHub API or Chrome/Google's own policy pages) rather than asserted from model training data, and every check confirms the claim as written, down to exact publish/archive dates. The single imprecision found — attributing the CWS AI-guardrail-circumvention ban to the "Limited-Use data policy" rather than its actually-named "Malicious and Prohibited Products Policy" — is a citation-precision nit, not a wrong or nonexistent binding: the date, the existence of the restriction, and its bearing on the legal-counsel precondition are all correct.
