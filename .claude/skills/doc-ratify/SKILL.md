---
name: doc-ratify
description: "Walk pending draft pages and draft drift-revisions and promote draft → canonical only via explicit human confirmation — one plain-English question per decision (P3), with a human delight-review for the manual root and section landings (P7). Use when a human asks to ratify, publish, or promote drafts in the manual. Never self-promotes; the RATIFY_TOKEN is server-minted and only transported."
---

# doc-ratify

This is the trust-promotion workflow. AI authors at `draft`; **a human, and only a human, moves a page to `canonical`**. `doc-ratify` is the facilitated, one-question-at-a-time conversation that walks the pending drafts and the draft drift-revisions, asks the human to confirm each, and — on a yes — transports the human-attributed `RATIFY_TOKEN` to the server promotion guard.

The voice is the librarian's (Marian): calm, precise, one decision at a time. This skill embodies P3 (one plain-English question, contextual suspension, auto-resume from the chat reply), P6 (canonical pages change only through human ratification, never AI self-certification), and P7 (a human delight-review for the manual's most-read landings).

**Load `skill:doc-session-policy` first** if it is not already carried in the session — the 7 principles and the draft→ratify rule are the constitution this skill executes.

## What this skill does and does not do

- **Does:** enumerate pending `draft` pages and draft drift-revisions; for each, ask the human one plain-English question; on a yes, promote via `docmost-cli page update --status canonical --ratify-token <token>` (or stamp a body-delta drift-revision via `--verified-against <sha> --ratify-token <token>`); run a delight-review — including a `verify render` check — for the manual root and section landings before promoting those; block promotion of any page with an un-baked Excalidraw until a human bakes it; on shipping a release-notes version page, update the living Release Notes index's "latest" pointer.
- **Does NOT:** author or edit page bodies (that is `doc-amend`); mint or fabricate a token (the token is server-issued from a real human confirmation); promote silently or in bulk without a per-page human yes; promote a page the human did not confirm.

## The token rule (read this before anything else)

The `RATIFY_TOKEN` is a **human-attributed, server-minted, single-purpose, page-scoped, time-boxed** string. It proves a *human* (not this service account, not AI self-certification) authorized the `draft → canonical` transition.

- The skill **transports** the token to the CLI on the promotion call. It **never** fabricates one, never reuses one across pages, never derives one from its own prose.
- The token carries the confirming user's identity. The server validates substance and attribution; the CLI only carries it.
- A promotion call that arrives without a valid token, or with a service-account / self-authored identity, is **rejected server-side** — exit 2 `RATIFY_TOKEN_REQUIRED`. That rejection is the safety net, not the primary control: the primary control is that we only call promote after a human said yes in chat.

> **Status — what is AS-BUILT (CLI) vs PENDING (server-side):**
> - **AS-BUILT — the CLI transport.** `docmost-cli page update <slug> --status canonical --ratify-token <RATIFY_TOKEN>` is live (verified against `docmost-cli page update --help`). `--ratify-token` is the human-attributed token carried on canonical promotions and body-delta verify stamps; the CLI never fabricates it. There is **no** `--human-token` flag on `page update` — use `--ratify-token`. The body-delta verify stamp is `--verified-against <sha>` (also live), and a body delta requires `--ratify-token`.
> - **PENDING (server-side, do not block):** The server's `draft → canonical` transition guard that *requires* a human-attributed `RATIFY_TOKEN` (CONTRACTS §2.5) may not be fully wired on every write path. The skill's primary control is unchanged: we only call promote after a human said yes in chat, transporting the token on `--ratify-token`. When the server guard fully fires, an unattributed/self-authored promote is rejected with exit 2 `RATIFY_TOKEN_REQUIRED`.
> - **PENDING — retrieval quarantine of drafts** (CONTRACTS §2.8). Today a draft may still be visible to grounding/`ai ask` reads. Treat ratification as the moment a page becomes truly grounding-eligible; until quarantine ships, prefer ratifying promptly so the live set stays trustworthy, and tell the human when a long-lived draft is in play.

## Inputs

This skill is invoked with:

- `space` — the space slug for this project's manual (resolve from `{project-root}/_bmad/doc/config.yaml` `docmost_space` if not passed).
- `scope` — one of `drafts | drift-revisions | all`. Default `all`.

Resolve `{project-root}/_bmad/doc/config.yaml` for `docmost_space`, `docmost_manual_root_slug`, and `docmost_manual_outline` (the project-derived IA — used to recognise the root and section landings for the delight-review). If `config.yaml` or `docmost_space` is missing, log a NOTE and HALT — there is nothing to ratify against.

## Pre-conditions

```bash
which docmost-cli || { echo "ERROR: docmost-cli not on PATH — cannot ratify"; exit 1; }
docmost-cli auth status --output json
```

If `docmost-cli` is absent, HALT (ratification is a real server write — there is no local fallback). If auth status is non-zero, tell the human to run `docmost-cli auth login --instance <url> --token <api-key>` and HALT.

Sync the cache so the pending set is current:

```bash
docmost-cli cache sync --space <docmost_space>
```

If `cache sync` exits 3 (`CACHE_STALE`), re-run once; if still 3, log WARN and proceed — the enumeration below reads the freshest available cache.

## Procedure

### Step 1 — Enumerate the pending set

Build the worklist according to `scope`. Always read the full result; never sample.

**Draft pages** (`scope` ∈ `drafts | all`):

```bash
docmost-cli page list --status draft --space <docmost_space> --output json
```

**Draft drift-revisions** (`scope` ∈ `drift-revisions | all`) are draft pages produced by `doc-drift` that carry a pending `verified_against` stamp to apply. They surface in the same list; recognise them by a pending verify intent (a `verified_against` candidate sha attached by `doc-drift`, e.g. recorded in the page's draft-revision context or a `doc-drift` review comment).

> **PENDING:** a first-class drift-revision filter (e.g. `page list --revisions-pending-verify`) is not yet built. Today, recognise a drift-revision by the `doc-drift` review comment / the candidate sha that `doc-drift` hands off. **PENDING: upgrade to the dedicated revision filter when built.**

Classify each entry into one of three kinds — this decides which question and which promotion call applies:

- **landing** — the manual root (`docmost_manual_root_slug`) or a section-landing page (a node whose `scaffold: section-landing` in `manual-outline.yaml`). These get the **delight-review** (Step 3) before any promotion.
- **release-version** — a per-version release-notes page (a `release-notes` dated child, titled `Release Notes vX.Y`, slug `release-notes-vX-Y`; `taxonomy.md` release-notes dual-mode). Promoting it draft→canonical **is the ship moment** — see Step 3a. It SKIPS the P7 delight-review (it is a dated changelog, not a landing). The living `release-notes-index` *landing* is itself a `landing` and follows the normal landing path.
- **drift-revision** — a draft revision originated by `doc-drift` carrying a `verified_against` sha. These promote with the verify stamp (Step 4, body-delta path).
- **content** — every other draft (a concept, reference, how-to, ADR, research, brainstorm, etc.). Standard one-question ratify (Step 2 / Step 4).

If the worklist is empty, report `{promoted: [], stamped: [], deferred: []}` and STOP — there is nothing pending.

Order the worklist: **landings first** (the root, then section landings, top of the IA down), then content drafts, then drift-revisions last (they depend on the canonical body being settled). Within each kind, oldest `updated_at` first.

Briefly orient the human, in the librarian's voice, before the first question — e.g. "There are N pages waiting to go canonical: the {project} manual root, 2 section landings, and 4 concept pages. I'll take them one at a time." Then proceed one entry at a time. **One question per decision — never stack questions, never present a form.**

### Step 2 — The one-question ratify (content drafts)

For each `content` draft, fetch its current body and a compact preview, then ask exactly one plain-English question.

```bash
docmost-cli page get <slug> --output json
```

Compose the question from the page title and a one-line essence of what is being made canonical — not the whole body. The human needs the *decision*, not a wall of text. Pattern:

> "**{Title}** ({doc_type}) is ready to go canonical. In short: {one-line tldr of the page}. Promote it? (yes / skip / edit)"

Then **suspend and wait for the human's reply** (P3 contextual suspension). Auto-resume from the chat reply — do not poll, do not re-ask, do not proceed on silence.

Branch on the reply:

- **yes / approve / promote** → go to Step 4 (promote with token).
- **skip / defer / not yet / no** → record `{slug, reason: "<human's words, or 'deferred by human'>"}` in `deferred`; move to the next entry. Do **not** promote.
- **edit / change X / the lead is wrong** → this is an authoring change, not a ratify. Do **not** promote. Hand off to `doc-amend` to make the edit in place (the page stays `draft`), record `{slug, reason: "returned for edit: <what>"}` in `deferred`, and move on. The human can re-run `doc-ratify` after the edit.
- **anything genuinely ambiguous** → ask one clarifying question and suspend again. Do not guess.

### Step 3 — The delight-review (manual root + section landings, P7)

Landings are the most-read pages in the manual — the root tells the project's story, section landings orient the reader. Before promoting a `landing`, run a short **human delight-review**: surface the experience, not just the facts, and let the human judge whether it *reads well* before it becomes canonical.

P7 is about visual *delight*, and a landing is judged from what actually renders — not from its markdown source. So before showing the human, **confirm the page renders.** Run `verify render` (which exercises the embeds/cards/diagrams the way the reader will see them); a landing that errors or renders blank is not promotable yet.

```bash
docmost-cli verify render <slug> --output json   # per-page; slugId is global (no --space). --screenshot <path> / --timeout to tune.
```

If `verify render` fails (non-zero / `ok:false`), do NOT promote — record `{slug, reason: "<render failure>"}` in `deferred`, surface the failing component to the human, and hand back to `doc-amend`. (Un-baked Excalidraw is the most common cause — see the bake gate below.) Optionally capture how the page looks to the eye and show it inline:

```bash
docmost-cli screenshot shot /s/<docmost_space>/p/<slug> --settle 3s --full-page
```

Then fetch the reader-facing surface for the human's eye. **If the landing carries embeds (cards, mermaid, Excalidraw, callouts), read it via `page mirror pull` — `page get` (even `--output json`) silently drops embeds and strips link URLs (the EMBED-READ LANDMINE, `data/rich-page-authoring.md` §0).** Use `page get` only for an embed-free landing.

```bash
docmost-cli page mirror pull <slug> --space <docmost_space>   # faithful read for embed-bearing landings
```

Show the human, compactly: the icon/cover presence, the `tldr` lead (verbatim — this is the L1→L2 hinge), and the card layout / child count for a section landing. Optionally cross-check the P7 lint as evidence (advisory only — the human's judgement decides):

```bash
docmost-cli verify lint --page <slug> --rules 'P7-*' --space <docmost_space> --output json
```

> **AS-BUILT:** `verify lint --page <slug> --rules 'P7-*'` is live (verified against `docmost-cli verify lint --help`) — it fetches the rendered body of the live page and runs the P7 editorial rules (e.g. lead present / ≥ N words via `--min-lead-words` / not a title-restatement; landing card count; concept visual). Use it as the delight-review *evidence*; the promote/skip decision is still a human judgement. *Fallback (CLI absent/old):* run the local-mode lint over the page body and report what you can.

#### Un-baked Excalidraw is a REQUIRED HUMAN TASK before promotion

Per the diagram policy (`data/rich-page-authoring.md` §3), a coloured Excalidraw block **renders blank until a human opens it and clicks Save & Exit** — re-authoring wipes that bake, so every Excalidraw block ships with an adjacent `[bake-pending]` warning callout. A page with an un-baked Excalidraw must **not** be promoted: it would land canonical showing an empty diagram. This applies to any page kind (a content draft can carry an Excalidraw too), but it is most often a landing.

Detect un-baked Excalidraw two ways:

- **`verify render <slug>`** fails its component-render assertion (the Excalidraw component renders empty) — caught above.
- Grep the faithful body (`mirror pull`) for the `[bake-pending]` sentinel callout:

```bash
docmost-cli page mirror pull <slug> --space <docmost_space> | grep -n 'bake-pending'
```

If either fires, do NOT promote. Surface it to the human as a **required bake task**, in the librarian's voice, e.g.:

> "**{Title}** has a diagram that isn't baked yet — Excalidraw renders blank until you open it once. Please open the diagram, click **Save & Exit**, then delete the `[bake-pending]` warning callout. I'll hold this page as draft until then."

Record `{slug, reason: "excalidraw bake pending — human must Save & Exit, then remove [bake-pending] callout"}` in `deferred`. Re-running `doc-ratify` after the bake (the sentinel removed and `verify render` clean) lets it promote normally. Never strip the `[bake-pending]` callout yourself and never promote over it — the bake is a human action and removing the warning is the human's signal that the diagram is live.

Then ask one delight question and suspend:

> "Here's how the **{Title}** landing reads — lead: _{tldr}_; it opens with {cover/icon} and shows {N} section cards. Does this read like a front door you'd want to open? Promote it? (yes / skip / edit)"

Branch exactly as in Step 2 (yes → Step 4; skip → `deferred`; edit → hand to `doc-amend`, stays draft, record in `deferred`). The delight-review never lowers the bar — a landing that the human finds flat is returned for edit, not waved through.

### Step 3a — The release ship (release-notes version pages)

A `release-notes` version page is a **dated changelog**, not a landing — so it **skips the P7 delight-review** entirely (`taxonomy.md` exempts dated version pages from the P4 no-obsolescence-narration lint and treats them as append-only changelogs, not front doors). Do not run Step 3 on it.

But promoting it draft→canonical is special: **for a release-notes version page, going canonical IS the ship moment.** Ask the standard one-question ratify (Step 2 phrasing — "**Release Notes vX.Y** is ready to ship. In short: {one-line of what shipped}. Ship it? (yes / skip / edit)"), suspend, and on yes promote via Step 4 (content path — a release-version is not a body-delta drift-revision).

On a successful ship, **update the living Release Notes landing's "latest" pointer** so the index points at the just-shipped version (`release-notes-index.md` keeps a newest-first "latest" pointer; `taxonomy.md` release-notes dual-mode = living index landing + dated `Release Notes vX.Y` children). The pointer edit on the *index landing* is an authoring change, so hand it to `doc-amend` (the index stays whatever status it already holds; you are not re-ratifying the index here) — e.g. "Shipped **vX.Y** — updating the Release Notes index to point at it." Append the version slug to `promoted`; note the index-pointer follow-up in the run report.

### Step 4 — Promote (transport the token)

Reached only after a human said yes for this specific page. **Use `--if-version` CAS by default** so a concurrent edit cannot be clobbered: read the current version, then promote against it.

```bash
VERSION=$(docmost-cli page get <slug> --output json | jq -r .updated_at)
```

**Content drafts and landings** (no body-delta stamp): promote to canonical, carrying the human-attributed token.

```bash
docmost-cli page update <slug> \
  --status canonical \
  --ratify-token "<RATIFY_TOKEN>" \
  --last-reviewed-at "$(date -u +%FT%TZ)" \
  --if-version "$VERSION" \
  --output json
```

> **Note:** `page update` resolves the page by slug and does NOT accept `--space` (the slug is globally unique). Passing `--space` to `page update` is rejected with exit 2 `INVALID_ARGS` (`unknown flag: --space`). The space is established at `cache sync` / create time, not on update.

On success, append the slug to `promoted`.

**Drift-revisions** (carry the `verified_against` stamp): a drift-revision with a **body delta** requires the token on the stamp (CONTRACTS §2.2 body-delta split). Promote and stamp in one human-attributed call:

```bash
docmost-cli page update <slug> \
  --status canonical \
  --verified-against "<candidate-sha>" \
  --ratify-token "<RATIFY_TOKEN>" \
  --last-reviewed-at "$(date -u +%FT%TZ)" \
  --if-version "$VERSION" \
  --output json
```

On success, append the slug to both `promoted` and `stamped`.

> **Zero-body-delta re-affirmation** (the drift-revision only re-confirms the page is still true against a newer sha, with no body change) is allowed **headless** — no token, no human question — per CONTRACTS §2.2. `doc-drift` performs that headless stamp itself; it should not reach this skill. If a zero-delta stamp does reach here, apply it without a question:
> ```bash
> docmost-cli page update <slug> --verified-against "<sha>" --if-version "$VERSION" --output json
> ```
> and append to `stamped` only.

> **AS-BUILT:** `--ratify-token` and `--verified-against` are live flags on `page update` (CONTRACTS §1.3; verified against `docmost-cli page update --help`). There is **no** `--human-token` flag — use `--ratify-token` for the human-attributed promotion token and `--verified-against <sha>` for the drift baseline stamp (a body delta requires `--ratify-token`). The calls above are the primary, executable path.

### Step 5 — Handle the server's answer (branch on errorCode, never on text)

| errorCode (exit) | Meaning | Action |
|---|---|---|
| — (0) | promoted/stamped | append to `promoted`/`stamped`; continue |
| `RATIFY_TOKEN_REQUIRED` (2) | promotion arrived without a valid human token | the token did not transport / was not minted. Do NOT retry headless. Record `{slug, reason: "ratify token missing — re-confirm with human"}` in `deferred`; surface to the human |
| `BODY_DELTA_REQUIRES_RATIFY` (2) | a `--verified-against` stamp carried a body delta but no token | same as above — needs a human-confirmed token; record in `deferred` |
| `DRAFT_NOT_RATIFIABLE` (2) | structurally ineligible (e.g. fails the P7 lint gate) | NOT a token problem. Return to `doc-amend` to fix the structural issue; record `{slug, reason: "<why ineligible>"}` in `deferred` |
| `CONFLICT` | `--if-version` mismatch — the page moved under us | re-read `updated_at`, re-present the (possibly changed) page to the human, re-ask once; do not silently re-promote stale content |
| `FORBIDDEN` (5) | CASL check failed | record `{slug, reason: "forbidden — insufficient permission"}`; surface to the human; continue |
| `SERVER_UNREACHABLE` (6) | network/API down | log WARN; stop the run cleanly and report what was promoted so far — do not lose the `deferred` list |
| `CACHE_STALE` (3) | cache moved | re-run `cache sync` once, then retry the single page |

Never parse stderr text — always branch on the exit code and the `errorCode` in the JSON envelope.

### Step 6 — Report

After the worklist is exhausted (or the human ends the session), emit the contract output:

```json
{
  "promoted": ["<slug>", "..."],
  "stamped":  ["<slug>", "..."],
  "deferred": [{"slug": "<slug>", "reason": "<why>"}]
}
```

`promoted` = pages now `canonical`. `stamped` = pages whose `verified_against` was set this run (drift-revisions appear in both). `deferred` = everything the human skipped, returned for edit, or that the server refused, each with its reason. Close in the librarian's voice with a one-line tally — e.g. "Ratified 5, deferred 2 (one returned to doc-amend for a sharper lead)."

## Guardrails carried through this skill

- **A human says yes, per page, before any promote.** No bulk promotion, no "promote all", no promoting on silence. One question, one decision, auto-resume from the reply (P3).
- **The token is transported, never fabricated.** If there is no human-attributed token, there is no canonical promotion — full stop (P6).
- **AI never self-certifies.** This skill does not author bodies and does not promote its own writing without the human gate (P6).
- **CAS by default.** Every promote uses `--if-version`; on `CONFLICT`, re-present and re-ask — never clobber a concurrent edit.
- **Landings earn the delight-review.** The root and section landings are promoted only after `verify render` confirms they render and a human judges they read well (P7). Read embed-bearing landings via `mirror pull`, never `page get`. A flat landing is returned for edit, not waved through.
- **Un-baked Excalidraw blocks promotion.** A `[bake-pending]` Excalidraw is a required human task (open → Save & Exit → delete the warning callout); never strip the warning or promote over it (`data/rich-page-authoring.md` §3).
- **A release-notes version page ships at canonical.** Going canonical IS the ship moment; it skips the P7 delight-review (dated changelog, not a landing), and on ship the living Release Notes index's "latest" pointer is updated via `doc-amend` (`taxonomy.md` release-notes dual-mode).
- **Drift body-delta needs the token; zero-delta re-affirm is headless.** Respect the body-delta split (CONTRACTS §2.2) — never stamp a body-changed page canonical without a human token.
- **Branch on errorCode, never on human text.** Use the table in Step 5.

## Relies on

- `docmost-cli page update --status canonical --ratify-token <token>` (promotion) — **AS-BUILT** (CONTRACTS §1.3).
- `docmost-cli page update --verified-against <sha>` (drift-revision stamp; body delta requires `--ratify-token`) — **AS-BUILT** (CONTRACTS §1.3, §2.2 body-delta split).
- `docmost-cli page get`, `page list --status draft`, `cache sync` (existing).
- `docmost-cli verify render <slug>` to confirm a landing actually renders (and to catch un-baked Excalidraw) before the delight-review — see `data/docmost-cli-reference.md`.
- `docmost-cli page mirror pull` for the faithful read of embed-bearing landings (the EMBED-READ LANDMINE — `page get` drops embeds) — `data/rich-page-authoring.md` §0.
- `docmost-cli screenshot shot /s/<space>/p/<slug> --settle 3s --full-page` (optional) to show the human how a landing looks.
- `docmost-cli verify lint --page <slug> --rules 'P7-*'` for the delight-review evidence — **AS-BUILT** (`--page` fetch mode + `P7-*` rule-IDs; CONTRACTS §1.4).
- Server-side `draft → canonical` transition guard requiring a human-attributed token — **PENDING** (CONTRACTS §2.5); the CLI flag transport is built, the full server enforcement on every write path is not.
- Status-based retrieval quarantine of drafts — **PENDING** (CONTRACTS §2.8); ratification is what un-quarantines a page.
- `skill:doc-amend` (for the "edit" branch — authoring stays there); `skill:doc-session-policy` (the constitution); `skill:doc-drift` (originates drift-revisions and performs headless zero-delta stamps).
