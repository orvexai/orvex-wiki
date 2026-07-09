---
name: doc-drift
description: "Reconcile the living manual against a code change. Compute the affected-page set (the documenting page plus its REFERRERS, not its callees — the RepoAgent rule), produce a refresh as a DRAFT revision (never an in-place canonical write), and route it to doc-ratify. Use after a code change merges, on a story's on_complete, or from a CI/git drift shim."
---

# doc-drift

This is the steady-state RepoAgent loop. When code changes, the manual pages that *document that code* go stale. This workflow finds exactly which pages drifted, refreshes each one **as a draft revision**, and hands the drafts to `doc-ratify` for human promotion. It never writes a canonical page in place and it never self-certifies a `verified_against` stamp — that is a human act (P6).

The single non-negotiable shape of this loop:

- **Affected set = the documenting page + its REFERRERS (callers), NOT its callees.** This is the ported RepoAgent rule. When a code object changes, the pages that describe the *things that depend on it* may now be wrong; the things *it* depends on did not change because of this edit. Walking callees instead of callers is the classic over-refresh bug — do not do it.
- **A drift refresh is always a `draft` revision.** Never an in-place canonical rewrite. The draft routes to `doc-ratify` (decision-order branch 6). Drafts are quarantined from grounding/RAG reads until ratified, so a stale-but-unreviewed refresh never feeds another agent's reasoning.
- **`verified_against` is re-stamped only on (a) human ratification of a body-changing revision, or (b) a zero-body-delta re-affirmation.** Case (b) — the code moved but the documenting prose is still true word-for-word — is the *only* headless stamp permitted. Everything else needs the human-attributed `RATIFY_TOKEN`.

This is PLAN §B.4 + §H.3, and decision-order.md branch (8) DRIFT. Read `{project-root}/_bmad/doc/data/decision-order.md` for the full routing context before running.

## What this skill orchestrates vs. what the durable tools own

This skill is orchestration only. It does **not** parse ASTs, compute graphs, or fingerprint code itself — never parse an AST in a skill. The heavy lifting lives in the CLI/server. `verify drift` is the primary affected-set path; `code graph` that feeds its referrer walk is **BUILD-CONDITIONAL** (the cgo Tree-Sitter build — absent from the standard binary), so probe for it (Step 2) and drop cleanly to provided-set mode when it is missing. The staleness fingerprint and the `code_component_id → page_id` map remain unbuilt; where a piece is still PENDING or build-conditional and absent, the skill falls back to the closest existing primitive and upgrades cleanly.

| Step | Durable tool | Status |
|---|---|---|
| Build the dependency graph (Tree-Sitter AST → `depends_on` + `referenced_by` + line ranges) | `docmost-cli code graph --lang go --root <dir> --out graph.json` (CONTRACTS §1.7) | **BUILD-CONDITIONAL** — needs the cgo Tree-Sitter build and is ABSENT from the standard binary. Probe `code --help`; if `graph` is present, use it; if not, drop to provided-set mode. Do **not** assume it is unconditionally as-built. |
| Compute the referencer-scoped affected set, query drift | `docmost-cli verify drift` (CONTRACTS §1.5) hitting `GET /api/orvex/drift` (§2.3) | **AS-BUILT** — use now; `--graph @graph.json` enables the one-hop referrer walk. |
| The drift baseline column | native `verified_against` / `verified_at` columns + `POST /api/orvex/pages/verify` body-delta split (§2.1, §2.2) | **AS-BUILT** (CLI flag) — `--verified-against` on `page update` routes to the verify endpoint. Server column wiring depth is server-side. |
| The staleness fingerprint | driftcheck normalized-AST fingerprint (`doc-section → file#symbol@fingerprint`) | **PENDING** — genuinely unbuilt; lean conservative on the body-delta call. |
| Produce the draft revision in place (section-scoped) | `docmost-cli page patch` / `page update` with `--if-version` CAS | **AS-BUILT** — use now. |
| Stamp the baseline | `docmost-cli page update --verified-against <sha> [--ratify-token <token>]` | **AS-BUILT** (§1.3) — zero-delta re-affirm is headless; a body delta requires `--ratify-token` (applied by `doc-ratify` post-ratification). |
| Leave a review-required note | `docmost-cli comment add <slug> --body "<text>"` | **AS-BUILT** — use now. |

> **Fallback contract (graph absent, or CLI absent/old):** the deterministic referencer-scoped walk via `code graph` + `verify drift` is the PRIMARY path *when the graph is available*. But `code graph` is BUILD-CONDITIONAL — it requires the cgo Tree-Sitter build and is absent from the standard binary — so probe `code --help` for it (Step 2). If `code graph` is absent (the common case on the standard build), or the CLI is absent/too old to carry these verbs at all, the skill drops to **provided-set mode**: the caller (a story's `on_complete`, a human, or a CI shim) supplies the changed code symbols and/or candidate page slugs, and the skill executes the draft → ratify half against them. Note the degraded mode in the run output. The `code_component_id → page_id` map is still PENDING, so even with the graph, symbol→page resolution uses `search`/`page list` (canonical-filtered) — see Step 3.

## Inputs

The skill receives (CONTRACTS §3.3):

- `repo_root` — absolute path to the code repository.
- `lang` — the first-class language for the `code graph` MVP. The built MVP supports `--lang go`; pass `go`. (Other languages land as `code graph` grows; until then a non-go repo falls to provided-set mode.)
- `since_sha` — the git ref the manual was last reconciled against (the prior `verified_against` baseline). The diff is `since_sha..HEAD`.
- `space` — the manual's space slug (`docmost_space` from config).

In **provided-set mode** (the fallback when `code graph` is absent — it is BUILD-CONDITIONAL — or the CLI is absent/old), additionally accept either:

- `changed_symbols` — a list of changed code-component ids (`pkg/file.go:FuncName`), OR
- `candidate_pages` — an explicit list of page slugs a human/CI believes documents the change.

## Pre-conditions

```bash
which docmost-cli || { echo "ERROR: docmost-cli not on PATH"; exit 1; }
docmost-cli auth status --output json
```

If `docmost-cli` is absent or auth is non-zero, HALT and tell the user to run `docmost-cli auth login --instance <url> --token <api-key>`. A drift run mutates the manual (draft revisions); it must not proceed unauthenticated.

Read `{project-root}/_bmad/doc/config.yaml` for `docmost_space`, `docmost_manual_root_slug`, and `docmost_manual_outline`. If `docmost_space` is missing, HALT — there is no manual to reconcile.

## Step 1 — Compute HEAD and the diff window

```bash
head_sha="$(git -C <repo_root> rev-parse HEAD)"
```

Resolve `since_sha`. If not provided, derive it from the lowest `verified_against` across the manual's canonical pages (the oldest baseline is the safe floor). If no page carries a `verified_against` yet (the manual was never stamped), treat the run as a **first reconciliation** and fall to provided-set mode.

Compute the changed line ranges per file:

```bash
git -C <repo_root> diff --unified=0 <since_sha>..<head_sha> -- '<lang-glob>'
```

Keep the per-file hunk line ranges — they intersect the graph's component line ranges in Step 3.

## Step 2 — Build the dependency graph (BUILD-CONDITIONAL)

> **BUILD-CONDITIONAL:** `docmost-cli code graph` requires the cgo Tree-Sitter build and is **ABSENT from the standard binary**. Do not assume it is present. Probe for it first, and only build the graph if `code --help` reports the `graph` subcommand:
>
> ```bash
> if docmost-cli code --help 2>/dev/null | grep -q '\bgraph\b'; then has_graph=1; else has_graph=0; fi
> ```
>
> If `has_graph=0`, **skip this step and run in provided-set mode** (note the degraded affected set in the report) — do not silently fail or fabricate a `graph.json`. If `has_graph=1`, the verb parses the repo with Tree-Sitter and emits the dependency graph; the `--lang go` MVP is the supported language today (pass `--lang go`).

```bash
# Only when has_graph=1. Tree-Sitter AST → depends_on (callees) + referenced_by (callers) + line ranges.
# --out is required; --since records a baseline ref for downstream diffing.
docmost-cli code graph --lang go --root <repo_root> --out graph.json --since <since_sha>
```

The frozen `graph.json` shape (CONTRACTS §1.7) is:

```json
{ "lang": "...", "head_sha": "...",
  "components": [
    { "id": "pkg/file.go:FuncName", "kind": "func|type|method|const",
      "file": "...", "line_start": N, "line_end": M,
      "depends_on": ["<id>", "..."],        // callees — DO NOT walk these
      "referenced_by": ["<id>", "..."] }    // callers/referrers — THIS is the drift edge
  ] }
```

If `code graph` is unavailable — either because the standard binary lacks the cgo Tree-Sitter build (the common case; `has_graph=0`) or because the CLI is absent/old — this step is skipped and the skill runs in **provided-set mode**: take `changed_symbols` (or `candidate_pages`) from the input and proceed to Step 4 (route the draft), skipping the deterministic referencer walk. Note the degraded mode in the run output so the caller knows the affected set was human-supplied, not graph-derived.

## Step 3 — Classify the change and walk the affected set

Intersect each diff hunk's line range with `components[].{line_start, line_end}` to map changed *lines* to changed *components*. Classify each touched component:

- **added** — present at HEAD, absent at `since_sha`.
- **changed** — present in both, body within the changed line range.
- **deleted** — absent at HEAD, present at `since_sha`.

Then compute the affected-page set. **This is the RepoAgent rule — read it carefully:**

> For each changed/deleted component `C`, the affected code objects are `C` **plus the contents of `C.referenced_by`** (its callers/referrers) — **one hop**. Do **not** descend into `C.depends_on` (its callees). The set is the documenting page of `C` and the documenting pages of everything that *refers to* `C`.

> **AS-BUILT:** `docmost-cli verify drift` is live (verified against `docmost-cli verify drift --help`). It queries `GET /api/orvex/drift`, compares each page's `verified_against` stamp to HEAD, and — **when `--graph @graph.json` is supplied** (i.e. only when `code graph` was available in Step 2, `has_graph=1`) — walks the dependency graph's CALLER edges one hop (`referenced_by`, NOT callees) to compute the affected-referrer set. This is the PRIMARY affected-set computation; run it. Without the graph (the BUILD-CONDITIONAL `code graph` was absent), drop the `--graph` flag and fall to provided-set mode for the referrer walk.

```bash
# AS-BUILT. Walks caller edges one hop, compares verified_against to head_sha.
# HEAD is resolved from --since, then `git rev-parse HEAD`, then the graph's head_sha.
# Pass --graph @graph.json ONLY when has_graph=1 (Step 2); otherwise omit it and use provided-set mode for the walk.
docmost-cli verify drift --space <space> --graph @graph.json --since <since_sha> --strict --output json
```

Frozen output (CONTRACTS §1.5):

```json
{ "drifted_pages": [
    { "slug": "...", "page_id": "...", "verified_against": "<sha>",
      "head_sha": "<sha>", "reason": "...", "affected_referrers": ["..."] } ],
  "affected_set_size": N, "head_sha": "<sha>", "checked_at": "..." }
```

With `--strict`, exit 7 `DRIFT_DETECTED` means at least one page is behind HEAD (a CI/git shim gates on this exit); WITHOUT `--strict` the report is emitted and the command exits 0 regardless. Either way, an empty `drifted_pages` is a clean run — stop and report.

In **provided-set mode**, the affected set is `candidate_pages` directly, or the documenting pages of `changed_symbols` resolved via `docmost-cli search`/`page list` (status-filtered to `canonical`) since the `code_component_id → page_id` map is PENDING.

## Step 4 — For each affected page, produce a DRAFT revision

For every page in the affected set, refresh **only the affected, non-protected sections** in place, then leave the page at `status: draft`. Never rewrite the whole body, never touch the protected zones (the story root, the `tldr` lead, "how this manual works" — they are transcluded canon and non-AI-writable), and never write history/obsolescence narration into the body (P4 — bodies are current-state-only).

First read the live page to get its body and CAS token. **Which read you use depends on whether the page has embeds:**

```bash
# Plain-prose page: page get carries body + updated_at + status + verified_against.
docmost-cli page get <slug> --output json
```

> **EMBED-AWARE READS (the landmine).** `page get` — *including `--output json`* — silently DROPS embeds (they come back as empty `##` headers) and strips inline link URLs. For any page that has (or might have) embeds — mermaid, `:::info`/callouts, Linear `:::linear-graph` cards, Excalidraw — the drift check MUST read the body via **`page mirror pull`**, the only faithful read; never drift-check embed content off a `page get` body. (Still read CAS via `page get --field updated_at` — the token is reliable; it is the *body* that is lossy.) See the EMBED-READ LANDMINE in `data/rich-page-authoring.md` §0. Two corollaries:
>
> - **Author/repair embeds via `page block`, never by reconstructing an embed from `mirror pull` markdown and pushing** — `mirror push` is lossy for embeds (it strips embed args). If an affected section is an embed, treat it as not auto-reconcilable (Step 6) unless it can be re-authored with `page block`.
> - **For dashboard / hub pages, "freshness" is about STRUCTURE and LINKS, not the live Linear numbers.** A Linear-embed card renders live data at view time, so its in-card numbers are never "stale" in the drift sense — do not treat changed Linear counts as a body delta. Drift on a dashboard means a broken/renamed embed target, a dead crosslink, or a structural section that no longer matches the code — not a moved metric.

```bash
# Embed-bearing page: mirror pull is the only faithful body read; page get for the CAS token only.
docmost-cli page mirror pull <slug>                 # faithful body (embeds + link URLs intact)
docmost-cli page get <slug> --field updated_at      # CAS token only
```

### 4a — Determine the body delta

Compare the would-be refreshed sections against the live body. There are two cases, and the case decides everything downstream:

- **Zero body delta** — the code changed but the documenting prose is still true word-for-word (e.g. an internal refactor a caller's page never named). The page is **not** rewritten. It is a candidate for a **headless re-affirmation stamp** (Step 5b). Record it in `headless_reaffirmed`.
- **Non-zero body delta** — a section must change to stay true. Produce the draft revision below.

Compute the body delta with `page diff` rather than hand-rolling a local comparison:

```bash
# AS-BUILT. Unified diff of the would-be refresh vs. the live server body — no hand-diff.
docmost-cli page diff <slug> --against server --output json
```

> **EMBED-AWARE — `page diff` reads markdown, so it does NOT see embed nodes.** For an embed-bearing page (mermaid, callouts, Linear cards), `page diff --against server` will not surface embed-level changes; diff such pages by reading both sides faithfully via `page mirror pull` (the only faithful read — see the EMBED-READ LANDMINE below and `data/rich-page-authoring.md` §0). Use `page diff --against server` only for plain-prose pages.

> **AS-BUILT / PENDING split:** the authoritative body-delta comparison is the server's, at `POST /api/orvex/pages/verify` (§2.2), against the body hash at the page's last canonical ratification — the `--verified-against` CLI route to it is built (Step 5). What is still **PENDING** is the driftcheck normalized-AST fingerprint that would let this step ignore cosmetic code edits and flag only factual contradictions. Until that fingerprint lands, use `page diff --against server` (or the `mirror pull` delta for embed-bearing pages) to decide the delta and lean conservative — a real prose change is a delta; a no-op is not.

### 4b — Write the section-scoped draft (non-zero delta only)

Use a section-scoped substring amend with CAS, never a full-body overwrite. The write is in-place on the existing canonical page, which moves the page's *working revision* to draft — it does **not** flip the canonical status itself.

```bash
ver="$(docmost-cli page get <slug> --field updated_at)"
docmost-cli page patch <slug> \
  --from "<section-anchor-start>" --to "<section-anchor-end>" \
  --find "<stale current-state text>" --replace "<refreshed current-state text>" \
  --if-version "$ver" \
  --output json
# then mark the working revision as a draft pending ratification:
docmost-cli page update <slug> --status draft \
  --if-version "$(docmost-cli page get <slug> --field updated_at)" \
  --output json
```

Notes:

- `--from`/`--to` (or `--line`) scope the amend to the affected section so other sections are untouched (the spike proved section-level edits do not disturb other sections).
- `--once` is the implicit default for `page patch`; an ambiguous `--find` returns `AMBIGUOUS` with line numbers — tighten the anchor, do not guess.
- `--if-version` is mandatory for skill writes (CAS by default). A `CONFLICT` exit means the page moved underneath you; re-read and retry once, then leave a review comment (Step 6) if it still conflicts.
- Record the intended baseline (`head_sha`) for this page so `doc-ratify` can stamp `verified_against` after the human promotes. Do **not** stamp it here — the body changed, so the stamp requires the `RATIFY_TOKEN` the skill cannot mint.
- Add the slug to `draft_revisions`.

## Step 5 — Route stamping (the body-delta split)

`verified_against` re-stamps in exactly two ways. The skill never invents the SHA's authority — it only carries it.

### 5a — Body-delta revisions → route to doc-ratify (human stamp)

Do **not** stamp here. Hand every `draft_revisions` slug to `doc-ratify`, which runs the one-question ratification (P3), and on the human OK promotes and stamps in a single guarded call:

```bash
# Performed by doc-ratify, NOT by this skill — shown for the contract:
docmost-cli page update <slug> --status canonical \
  --verified-against <head_sha> --ratify-token <RATIFY_TOKEN> --output json
```

> **AS-BUILT:** `--verified-against` and `--ratify-token` on `page update` are live (§1.3; verified against `docmost-cli page update --help`). The `RATIFY_TOKEN` is server-minted from the human confirmation (§0.3) — neither this skill nor `doc-ratify` ever fabricates it. A body-delta stamp without the token returns `BODY_DELTA_REQUIRES_RATIFY` (§2.2); the server's draft→canonical guard (§2.5) rejects a service-account promotion. So `doc-ratify` promotes + stamps in the single guarded call shown above. (The depth of the server-side draft→canonical guard on every write path is the only part still PENDING — see CONTRACTS §2.5.)

### 5b — Zero-body-delta re-affirmation → headless stamp allowed

When the code moved but the prose is unchanged, re-affirm the baseline headless (no token, no human, no draft) — this is the *only* headless `verified_against` path:

```bash
docmost-cli page update <slug> --verified-against <head_sha> --output json
```

> **AS-BUILT:** `page update --verified-against <sha>` (no `--ratify-token`, no `--status`) routes to `POST /api/orvex/pages/verify` (§2.2), which confirms zero body delta against the last-ratification hash and emits `PAGE_VERIFIED_REAFFIRM`. Run it directly and record the slug in `headless_reaffirmed`. *Fallback (CLI absent/old):* record the slugs in `headless_reaffirmed` and surface them in the report for a later stamp. **Never** route a zero-delta re-affirmation through `doc-ratify` — it needs no human and would waste a ratification question (P3: do not nag).

## Step 6 — Unreconcilable pages get a review-required comment

If a page's drift cannot be resolved automatically — the change is ambiguous, the affected section is protected/transcluded, the `--find` anchor will not resolve, or repeated `CONFLICT` on CAS — do **not** guess and do **not** force a write. Leave a durable review-required note and move on:

```bash
docmost-cli comment add <slug> \
  --body "Drift detected against ${head_sha} (code: <component-id>) but not auto-reconcilable: <one-line reason>. Needs human review." \
  --output json
```

Capture the returned comment url in `review_comments`. These pages are *not* counted as drafts or re-affirmed; they are explicitly deferred to a human.

## Output

Return the frozen shape (CONTRACTS §3.3):

```json
{ "affected": ["slug", "..."],
  "draft_revisions": ["slug", "..."],
  "headless_reaffirmed": ["slug", "..."],
  "review_comments": [ { "slug": "...", "comment_url": "..." } ] }
```

Then hand `draft_revisions` to `doc-ratify` (scope `drift-revisions`) for human promotion + stamping. If the run was clean (`verify drift` exit 0, or provided-set was empty after filtering), report a clean reconciliation and stop.

Also surface, in plain English for the user: how many pages drifted, how many became draft revisions, how many were re-affirmed headless, how many need human review, and — if the run was in **provided-set mode** — that the affected set was human/CI-supplied rather than graph-derived (because `code graph` was absent from this binary — it is BUILD-CONDITIONAL, needing the cgo Tree-Sitter build — or the CLI was absent/old).

## Guardrails (carried for the whole run)

- **Referrers, not callees.** Walk `referenced_by` one hop. Never descend `depends_on`. (RepoAgent rule.)
- **Draft, never silent canonical.** A drift refresh is always a `draft` revision routed through `doc-ratify`. The only headless write is a zero-body-delta `verified_against` re-affirmation (Step 5b).
- **AI never self-certifies a body change.** `verified_against` on a body delta is stamped only after human ratification carries the `RATIFY_TOKEN` (P6). The skill transports tokens; it never mints them.
- **Section-scoped, current-state-only.** Amend only the affected non-protected sections; CAS with `--if-version`; never write obsolescence/history narration into a body (P4).
- **Never flatten protected zones.** The story root, the `tldr` lead, and "how this manual works" are transcluded canon and non-AI-writable.
- **Never parse an AST in the skill.** Graph/fingerprint work belongs to `code graph` / the drift endpoint. `code graph` is BUILD-CONDITIONAL (cgo Tree-Sitter, absent from the standard binary) — probe `code --help`, and if it is missing fall back to provided-set mode rather than reinventing the graph.
- **Read embed-bearing pages via `mirror pull`, never `page get`.** `page get` drops embeds and strips link URLs (the EMBED-READ LANDMINE, `data/rich-page-authoring.md` §0). Drift-check embed content only off a faithful `mirror pull` body. On dashboard/hub pages, freshness is structure + links, not live Linear numbers.
- **Don't guess on ambiguity.** Unreconcilable drift → a review-required `comment add`, not a forced write.

## Error handling

| Condition | Action |
|---|---|
| `docmost-cli` absent / auth non-zero | HALT; tell the user to authenticate |
| `code graph` absent (BUILD-CONDITIONAL — not in the standard binary; probe `code --help`) or `verify drift` unavailable (CLI absent/old) | Drop to provided-set mode; note the degraded affected set in the report |
| Affected section is an embed (mermaid / callout / Linear card / Excalidraw) | Read it via `mirror pull` (not `page get`); re-author via `page block`, or — if it cannot be cleanly re-authored — leave a review comment (Step 6). Never reconstruct an embed from `mirror pull` markdown and `mirror push` (push is lossy for embeds) |
| `verify drift` exit 0 with empty `drifted_pages` | Clean run — report and stop. (Without `--strict`, exit is always 0; read `drifted_pages`, not just the exit code.) |
| `verify drift --strict` exit 7 `DRIFT_DETECTED` | Expected on drift — proceed to refresh; a CI shim gates on this exit (only `--strict` raises it) |
| `page get` / `page patch` exit non-zero | Log WARN with `errorCode`; leave a review comment for that page (Step 6) |
| `page patch` `AMBIGUOUS` | Anchor matched >1 place — tighten `--from`/`--to`; if still ambiguous, review comment |
| `page update --if-version` `CONFLICT` | Page moved — re-read `updated_at`, retry once; if it still conflicts, review comment |
| Body-delta stamp without token (`BODY_DELTA_REQUIRES_RATIFY`) | Expected — that page belongs in `draft_revisions` for `doc-ratify`, not a headless stamp |
| Affected section is protected/transcluded | Do not write — leave a review comment (Step 6) |

Never parse stderr text — branch on the exit code and the `errorCode` field from the JSON envelope (CONTRACTS §0.4).
