# Patches-drift CI subsystem + frozen inline-edit allow-list — DESIGN

Status: DRAFT — Deliverable 1 of ENG-1649. Gate: this design must pass adversarial
CS §0 + SE-Architect review before Deliverable 2 (build) starts.

Split from ENG-1604 AC6/AC7 per PO ruling 2026-07-09 (design-first, Option D).
Provenance pin: `orvexai/docmost@050187676624f2395c55b36ec60e365f87fd4a9f`.

## 1. Problem

orvex-wiki is a fork of upstream Docmost. Two kinds of divergence from upstream
exist and must stay governed as the fork evolves:

1. **Patched files** — upstream files carried via `patch-package`-style unified
   diffs under `patches/`, applied at install time (today: only
   `scimmy@1.3.5.patch`, a node_modules dependency patch — unrelated to this
   subsystem, which concerns **upstream Docmost source files**, not deps).
2. **Inline-edited upstream files** — upstream Docmost source files edited
   directly in the orvex-wiki tree (no patch file), tracked only by knowledge in
   people's / agents' heads today.

Both are drift risk: (1) a patch's context can silently stop matching upstream
as upstream moves, hiding the fact the patch no longer applies as intended; (2)
an inline edit to an upstream file that ISN'T on a declared allow-list is
undocumented fork divergence that nobody is watching.

AC6 covers (1) — a CI gate that detects patch-context drift against the pinned
upstream commit. AC7 covers (2) — a governance allow-list of which upstream
files may be inline-edited at all, enforced in CI.

## 2. Unified-diff format + generation against the pinned upstream commit

- **Format**: standard unified diff (`git diff -U5`), identical to what
  `patch-package` already writes for `patches/*.patch` — no new diff dialect.
  5 lines of context matches the ±5-line fuzzy-context rule in §3, so the
  stored patch already carries the context window the matcher needs.
- **Generation inputs**: the pinned upstream commit and the current orvex-wiki
  working tree. **Single source of truth for the pin**: `pinnedUpstreamSha` in
  `patches/inline-edit-allowlist.json` (§4) — `check-patches.mjs` reads it from
  there at startup; there is no second hardcoded copy of the SHA anywhere in
  the script, so the pin can never drift out of sync with itself.
- **Source-of-truth for upstream content**: the repo already carries a
  configured `upstream` git remote (`docmost/docmost`, verified present in
  `.git/config`) — `check-patches.mjs` reuses it rather than inventing a new
  remote/URL. It runs `git fetch upstream <pinnedUpstreamSha>` into a local
  ref (`refs/upstream-pin/docmost`), fetched once (idempotent — a re-run with
  the ref already present and matching the pin skips the fetch) and cached; no
  vendoring of a second checkout into the repo. This fetch is the subsystem's
  one **true-external boundary** (CS §5, same category as the GitHub API row):
  a network/auth failure here (timeout, rate limit, auth) is an **infra
  error**, distinct from a drift finding — `check-patches.mjs` exits **2** (not
  1) and prints `INFRA-ERROR: could not fetch pinned upstream ref: <cause>` so
  CI/on-call never confuses a transient fetch failure with real drift. Only a
  successful fetch proceeds to the §3 matching logic (exit 0 or 1).
- **Scope**: only files declared in the frozen allow-list (§4) are diffed.
  There is no "whole-tree diff" mode — the subsystem only ever asks "does file
  X's current patched/edited form still fuzzy-match upstream's copy of X at
  the pin," never "what changed anywhere."
- Patch files that apply to real dependencies (e.g. `scimmy@1.3.5.patch`) are
  **out of scope** for this subsystem — they are `patch-package`'s job, not
  `check-patches.mjs`'s. `check-patches.mjs` only ever inspects
  `patches/apps__*.patch` (the upstream-Docmost-source naming convention) plus
  the inline-edit allow-list, never `patches/<dep>@<version>.patch`.

## 3. ±5-line fuzzy-context matching rules

For each declared patch (`patches/apps__*.patch`) or inline-edited file
(§4 allow-list):

1. Extract the patch's context lines (the unchanged `" "`-prefixed lines
   surrounding each hunk, or — for an inline-edited file with no patch — the
   5 lines immediately above and below each previously-recorded edit anchor,
   captured in the allow-list entry itself as `anchor_before` / `anchor_after`
   snippets).
2. Fetch the same file from the pinned upstream commit (§2).
3. Attempt an **exact** match of the context block at the hunk's originally
   recorded line offset first (cheap path, the common case — upstream hasn't
   moved).
4. If the exact-offset match fails, search a **window of ±5 lines** around
   that offset for a match of the full context block, allowing whitespace-only
   differences to be ignored (Docmost occasionally reformats without semantic
   change). This is the "fuzzy" match — equivalent to `patch`'s own fuzz level
   2 behaviour, bounded explicitly at ±5 rather than `patch`'s unbounded fuzz.
   **Tie-break (deterministic):** if the context block matches at more than
   one offset inside the window, choose the match with the **smallest
   absolute distance** from the recorded offset; if two candidates tie on
   distance (one before, one after), the **earlier** (smaller line number)
   offset wins. `matchContext` always returns exactly one verdict, never an
   ambiguous list.
5. If no match is found within ±5 lines at any offset in the file → **drift
   detected** for that hunk/anchor.
6. A file with zero drifted hunks/anchors is CLEAN; any drifted hunk/anchor
   makes the file (and the overall run) DRIFTED.

This is a **static, deterministic, no-side-effect check** — same category as
the existing `orvex-marker-check.sh` (§5 of CS: in-process / no I/O beyond the
read of the pinned upstream ref and the working tree — no network call in the
steady state once the local upstream-pin ref is fetched).

## 4. Governance allow-list — source of truth + enforcement

**Source of truth**: a single committed JSON file,
`patches/inline-edit-allowlist.json`, shape:

```json
{
  "pinnedUpstreamSha": "050187676624f2395c55b36ec60e365f87fd4a9f",
  "entries": [
    {
      "path": "apps/server/src/core/auth/auth.service.ts",
      "reason": "short human reason + Linear ref, e.g. ENG-1234",
      "anchorBefore": "5 literal lines of upstream context immediately before the edit",
      "anchorAfter": "5 literal lines of upstream context immediately after the edit"
    }
  ]
}
```

- The **frozen set** = every `path` listed here, union with every file targeted
  by a `patches/apps__*.patch` (the naming convention this subsystem defines
  for upstream-Docmost-source patches, distinct from dependency patches like
  `scimmy@1.3.5.patch`). Today both sets are empty — no `apps__*.patch` exists
  and no inline edit has been formally declared yet; landing this subsystem
  does not itself declare any file. A follow-up housekeeping pass (tracked
  separately, not part of this ticket) inventories any actual pre-existing
  inline edits to upstream files and back-fills allow-list entries for them.
- **Enforcement**: `scripts/check-patches.mjs --allowlist` uses the same
  `refs/upstream-pin/docmost` ref fetched in §2 (never a bare merge-base guess
  against orvex-wiki's own history, which shares no direct ancestry with
  `orvexai/docmost` in the running checkout). It runs
  `git diff --name-only refs/upstream-pin/docmost -- HEAD` scoped to the
  path set present at `refs/upstream-pin/docmost` (i.e. only paths that exist
  in the pinned upstream tree are candidates), and fails if any such path
  differs from its upstream content AND is **not** in the frozen set. A file
  wholly new to orvex-wiki (no upstream counterpart at the pin) is never in
  scope — only files that exist upstream can be "inline-edited" in the
  governed sense.
- This is the CI-tier check that fails the job; it is a static diff computed
  against the pinned ref, not a live GitHub API call, so it needs no
  true-external port (CS §3.2/§5) — same in-process category as §3.

## 5. CI remediation-report shape

On any drift or allow-list violation, `check-patches.mjs` prints a single
human-readable report to stdout and exits non-zero. Shape:

```
FAIL: patches-drift check

Drifted patches (context no longer matches upstream @ 0501876):
  - patches/apps__server__src__core__auth__auth.service.ts.patch
      hunk @@ -42,7 +42,7 @@: no match within ±5 lines (searched 37-52)
      remediation: regenerate the patch against the current pinned SHA,
        or bump PINNED_UPSTREAM_SHA in scripts/check-patches.mjs if the
        fork is intentionally re-basing.

Undeclared inline edits to upstream files (not in patches/inline-edit-allowlist.json):
  - apps/server/src/core/somefile.ts
      remediation: either revert the edit, move it to a patches/apps__*.patch,
        or add a reviewed entry to patches/inline-edit-allowlist.json with a
        Linear reference.

2 problem(s) found.
```

- Clean run: `OK: patches-drift check — N patch(es), M allow-listed file(s), 0 drifted, 0 undeclared.` and exit 0.
- The report never fabricates a diff — it prints only the exact hunk header /
  path and the literal remediation instruction; no invented line numbers or
  guessed content (CS "zero-mock / honest states").

## 6. `pnpm check:patches` wiring

- New root `package.json` script: `"check:patches": "node scripts/check-patches.mjs"`.
- `scripts/check-patches.mjs` CLI surface:
  - (no args) — the CI gate: exit 0 clean / exit 1 drifted-or-violation (per
    §5) / exit 2 infra error (pinned-ref fetch failed, per §2 — never reported
    as drift).
  - `--self-test` — runs the script against **committed fixtures** under
    `scripts/test/fixtures/patches-drift/` (a `clean/` fixture pair that must
    report 0 problems, and a `drifted/` fixture pair — an upstream file
    snapshot + a patch whose context deliberately no longer matches — that
    must report exactly 1 drifted problem). `--self-test` exits 1 if either
    fixture doesn't produce its expected verdict; this is the script testing
    itself, not the repo's real patches/allow-list.
  - `--allowlist` — runs only the §4 governance check (used standalone by a
    lighter-weight pre-commit hook if one is added later; out of scope here).
- Fixtures live at `scripts/test/fixtures/patches-drift/{clean,drifted}/` —
  each fixture directory holds a tiny synthetic "upstream file" + a synthetic
  patch, never a real orvex-wiki or Docmost source file, so the self-test
  never depends on the real pinned SHA being reachable.
- CI tier: a new step in the existing CI workflow (wired alongside
  `orvex-marker-check.sh` and `engine-license-guard.sh`) runs
  `pnpm check:patches`; failure fails the job.

## 7. Interface sketch (CS §3.7 design-it-twice note)

Two materially different shapes considered for `check-patches.mjs`'s internals:

- **Sketch A — single monolithic script**, all logic (fetch upstream ref, load
  allow-list, diff+fuzzy-match, report) inline in one file.
- **Sketch B (chosen)** — three small pure functions plus a thin CLI shell:
  - `loadAllowlist(repoRoot) -> AllowlistEntry[]` (in-process, reads two kinds
    of file: the JSON allow-list and the `patches/apps__*.patch` files).
  - `matchContext(upstreamFileText, contextBlock, recordedOffset) -> {status: 'exact'|'fuzzy'|'drifted', offset?}` — pure, no I/O, unit-testable directly
    against string fixtures (no upstream fetch needed for this function's own
    tests).
  - `checkDrift(allowlistEntries, upstreamResolver) -> Report` — orchestrates
    the two above per entry; `upstreamResolver` is an injected function
    `(path) -> string` (the file's text at the pinned SHA) so `checkDrift` is
    testable with an in-memory fake resolver, never a real git call in its own
    unit tests (git-fetch lives in the CLI shell only).
  - CLI shell (`main()`) wires: real git-based `upstreamResolver` → `checkDrift`
    → format report (§5) → set exit code.

Chosen: Sketch B. Reason: `matchContext` and `checkDrift` are the only logic
with real behavioural branching (exact/fuzzy/drifted; declared/undeclared) and
must be tracer-bullet TDD'd per CS §4 against the exported functions directly;
a monolithic script would force tests through the CLI/process boundary
(spawning node, parsing stdout) for logic that has no I/O of its own —
shallow-module territory (CS #7) and CS §4.2's "test through the exported
interface" would otherwise be violated. Sketch B's `upstreamResolver`
injection point is the one seam this script has (CS §3.2: this is an
in-process/local-substitutable seam — a plain injected function, not a
network port; the git fetch itself happens once, upfront, in the CLI shell,
which is process/IO plumbing, not domain logic under test).

**CS §3.6 three-question note (per new exported function):**

- `loadAllowlist(repoRoot)` — *reduce methods?* one method, one job (load); no
  mode-flag. *simplify params?* single `repoRoot` param, no bool/enum flags.
  *hide more complexity?* yes — callers never see the JSON-file vs.
  `patches/apps__*.patch`-glob split; it returns one normalized
  `AllowlistEntry[]` regardless of which of the two sources an entry came from.
- `matchContext(upstreamFileText, contextBlock, recordedOffset)` — *reduce
  methods?* one pure function covers exact + fuzzy + drifted (no separate
  `matchExact`/`matchFuzzy` — the caller never chooses a mode). *simplify
  params?* three params, none a repeated literal, none a mode-flag — the
  exact-then-fuzzy-then-drift sequencing in §3 is internal, not a caller
  choice. *hide more complexity?* yes — the ±5 search and the tie-break rule
  are entirely internal; the caller only sees the three-way verdict.
- `checkDrift(allowlistEntries, upstreamResolver)` — *reduce methods?* one
  method producing the whole `Report`; no separate per-file call the CLI
  would have to loop and re-aggregate itself. *simplify params?* two params;
  `upstreamResolver` is the single injected seam (not one param per data
  source). *hide more complexity?* yes — per-entry patch-vs-allow-list
  dispatch, aggregation, and the exit-code-worthy problem count are all
  internal; the caller reads one `Report` value.

## 8. Deliverable 2 scope (build, gated on this design passing review)

- `scripts/check-patches.mjs` implementing §2–§7.
- `scripts/test/patches-drift.test.mjs` (or `.spec.mjs`, matching the repo's
  existing JS test runner) — unit tests for `matchContext` and `checkDrift`
  (TDD, tracer-bullet order: exact match → fuzzy-within-5 match → drift →
  undeclared-edit detection), plus an integration test invoking
  `--self-test` end-to-end against the committed fixtures.
- `patches/inline-edit-allowlist.json` — lands as `{"pinnedUpstreamSha": null, "entries": []}`. **`pinnedUpstreamSha: null` is deliberate, not a placeholder to fill in later in this ticket**: orvex-wiki already has years of legitimate upstream-file divergence from vanilla Docmost with no allow-list ever recorded. Turning AC7 enforcement on immediately (a real SHA + still-empty `entries`) would make the CI gate fail the entire repo on landing — a fabricated, un-actionable red gate, not a real signal. `check-patches.mjs` treats a `null` pin as "allow-list not yet activated" and exits 0 (§4/§6) until the follow-up backfill ticket (§4, out of scope here) populates `entries` AND sets a real `pinnedUpstreamSha` in the same change — the two are activated together, never a real pin over an empty list.
- `scripts/test/fixtures/patches-drift/{clean,drifted}/` fixtures.
- `package.json` `check:patches` script + CI workflow wiring.
- No changes to any actual upstream-derived source file — this ticket lands
  the governance subsystem itself, not a retrofit of existing drift.

## 9. Out of scope (explicitly, to bound this design)

- Auditing/back-filling the allow-list for any inline edits that may already
  exist in the tree today (follow-up ticket).
- Any UI/dashboard for drift status — CI job output only.
- Extending the subsystem to non-Docmost upstreams.
- Auto-remediation (auto-regenerating a drifted patch) — the gate reports;
  a human/agent regenerates.
