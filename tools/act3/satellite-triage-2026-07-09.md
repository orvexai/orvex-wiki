# Satellite dirty-tree triage manifest — 2026-07-09

Consolidated record of the 2026-07-09 dirty-working-tree triage across the five satellite
repos. Produced per PO instruction: **every change gets checked and a decision made — worth
keeping or not; no mess left behind.**

- Ticket states were read **only** from the local Linear cache
  `/home/daniel/repos/orvex-wiki/.cache/linear/` (`initiative.json` `issues` index +
  `issues/*.yaml`). **Zero live Linear API calls, zero Linear writes.**
- All archive refs are `refs/archive/inflight/<name>-20260709`, **local-only, pushed nowhere**
  (doctrine 3.20b — never lose bytes; archive ref before any reset/delete).
- End state for every repo: **working tree clean, checked out on `dev` (default branch).**

Per-repo evidence detail lives in the scratchpad triage reports
(`satellite-triage/<repo>.md`); this file is the durable consolidation.

## Verification summary (consolidator pass)

| repo | tree clean | on `dev` | archive refs verified | kept | merge-cand | discarded |
|---|---|---|---|---|---|---|
| orvex-prompt-studio | yes | yes | 5/5 present, hashes match | 2 | 0 | 2 |
| orvex-prompt-studio-poc | yes | yes | 1/1 present | 0* | 0 | 0 |
| orvex-studio-billing | yes | yes | 3/3 present, deleted branches gone | 0 | 0 | 3 |
| orvex-studio-gallery | yes | yes | 5/5 present | 5 | 0 | 2 |
| orvex-studio-contracts | yes | yes | 2/2 present | 1 | 0 | 1 |

\* poc: 1 archived-and-flagged group (unattributed-but-valuable); counted as archived, not
kept-against-open-ticket.

Independently re-verified by the consolidator:
- `git status --porcelain` empty and `HEAD` on `dev` for all 5 repos.
- Every archive ref named in the per-repo reports resolves (`git show-ref --verify`) to the
  hash the report claims.
- The two branches deleted **without** an archive ref are genuine merged ancestors of
  `origin/dev` (no bytes lost): gallery `run-r34929c9d` (`435834a`, ancestor confirmed) and
  billing Group-4 `fix/*` + `crew/daniel` pointers (deleted via `git branch -d`, which git
  only permits on merged branches).
- Every branch deleted with `git branch -D` had an archive ref created first (billing
  `eng-1439-work`→`bfce772`, `eng-1584-work`→`20600c7`; prompt-studio
  `promote/rollout-knative-rbac`→`a454f18`, `scratch/tooling-scaffold-restore`→`1d76d74`).
- Ticket states re-read from `initiative.json` `issues` index: billing DISCARD set
  (ENG-1431/1439/1518/1523/1524/1525/1526/1527/1382/1584) all **Done**; ENG-1583 **Duplicate**
  (closed); contracts ENG-1503 **Todo** (open, correctly kept).

---

## KEEP — open ticket, archived + resume note

### orvex-studio-contracts — ENG-1503 (Todo, OPEN)
- **What:** commit `ffb984b` "ENG-1503: author the authtest V1–V12 signed-JWT golden corpus
  (FR-L7)" on branch `eng-1503-authtest-corpus` — adds
  `identity/vectors/conformance/authtest-tokens.json` (13 signed compact-JWS fixtures),
  `authtest-jwks.json`, `scripts/gen_authtest_corpus.py`,
  `tests/test_authtest_corpus_contract.py`. Closes the "golden token fixtures come FROM
  contracts" DoD box (part of AC1/AC2/AC8); AC3–AC7 not started.
- **State:** branch already fully pushed (`origin/eng-1503-authtest-corpus`, 0/0). Belt-and-
  suspenders archive ref: `refs/archive/inflight/eng-1503-authtest-corpus-20260709` →
  `ffb984b`.
- **Resume:** `git checkout eng-1503-authtest-corpus` (or restore from the archive ref),
  rebase onto current `origin/dev` (dev moved ~14 commits since base), continue T3–T8. **Do
  NOT** resurrect the discarded stale `packages/dfm/corpus/**` snapshot (see discard entry
  below) — the current DfM golden corpus lives at `fixtures/dfm/**` on `origin/dev`
  post-ENG-1598.

### orvex-prompt-studio — ENG-1275..1297 cluster (A3 Search / A5 Curator / A6 Composer — all Backlog, OPEN)
- **What:** full click-through Studio UI prototype
  (home/wiki/memory/search/myskills/useit/makeityours/review/authoring/account/marketplace/auth,
  36 files under `web/src/prototype/**`); `main.tsx` rewired to render it in place of the
  placeholder `App.tsx`; `vite.config.ts`/`web/Makefile` LAN-bind convenience; checked-in
  `web/package-lock.json`. Genuine ~4h incremental work (mtimes 2026-06-17 15:49–19:43), not a
  bulk restore.
- **Where:** branch `work/eng-1286-studio-ui-prototype-20260709` (commit `00f6476`, based on
  `dev`@`4a09fa7`); archive ref
  `refs/archive/inflight/eng-1286-studio-ui-prototype-20260709` → `00f6476`. Branch also left
  in place locally.
- **Resume:** when any of ENG-1275..1297 relaunches, checkout the branch (or archive ref),
  rebase onto current `dev`, and use the matching screen(s) as the starting point.
  **Caveats:** (a) no single story owns the whole screen set — PO to confirm ownership /
  possibly its own story; (b) `App.tsx` was deleted in favor of untyped `prototype/app.jsx`
  (`@ts-expect-error`'d) — a typed-port decision per CS is required before this reaches `dev`;
  (c) marketplace/account/auth/review/authoring screens have no matching AC in cache.

### orvex-prompt-studio — fix/rollout-knative-rbac (no ticket found; real, ready fix)
- **What:** commit `288e050` "fix(rbac): let tekton-studio-rollout patch Knative Services" —
  grants `serving.knative.dev/services [get,patch]` in `tekton/studio-rollout-rbac.yaml` so the
  rollout-restart finally step stops failing red for Knative-served binaries (e.g. billing
  metering/webhook). Verified exactly `dev`+1 (no rebase needed) and **not** already on `dev`.
- **Where:** local branch `fix/rollout-knative-rbac` (left in place, tidy); archive ref
  `refs/archive/inflight/fix-rollout-knative-rbac-20260709` → `288e050`.
- **Resume / PO action:** no Linear ticket in cache — PO to either file a CI/infra ticket or
  fast-track-merge directly (trivial RBAC-only diff). Not pushed / no PR opened per triage
  scope. **See flag F1.**

### orvex-studio-gallery — three unattributed in-flight efforts (no Linear project in cache)
This repo has **no** matching Linear project or issue anywhere in the cache; all three are
routed "ticket NOT FOUND", archived recoverably, branch+worktree left intact.

- **feat/blocktree-migrate** — 37 commits ahead of `origin/dev`, never pushed. Tip `4e3c27c`.
  Archive ref `refs/archive/inflight/feat-blocktree-migrate-20260709` → `4e3c27c`.
- **feat/paved-road-portals** — 42 commits ahead of `origin/dev`, never pushed. Tip `5471192`.
  Archive ref `refs/archive/inflight/feat-paved-road-portals-20260709` → `5471192`.
- **run-r7bbc5ac9** — 2 unpushed commits atop the live `origin/run-r7bbc5ac9` (`e15d352`
  top-kind-menu, `7cb54ef` cache-bust). Archive ref
  `refs/archive/inflight/run-r7bbc5ac9-unpushed-20260709` → `7cb54ef`. Clean fast-forward of
  the existing remote branch when wanted.
- **Resume / PO action:** PO must confirm whether a Linear project for orvex-studio-gallery
  exists (cache-sync gap) or open tickets retroactively for these efforts, then the engine
  rebases each onto current `origin/dev` from that ticket context. **See flag F2 (highest).**

### orvex-studio-gallery — orvex-brochure.pdf (asset, no ticket)
- **What:** 296KB, 2pp Orvex AI marketing brochure. Kept as asset, removed from working tree.
- **Where:** archive ref `refs/archive/inflight/orvex-brochure-20260709` → `a7a2209`.
- **Resume:** `git show refs/archive/inflight/orvex-brochure-20260709:orvex-brochure.pdf`
  recovers it byte-for-byte; land at the eventual ticket's deliverable path.

### orvex-prompt-studio-poc — competition design artifacts (no ticket; possible out-of-repo coursework)
- **What:** 13 untracked files under `design-artifacts/competition/` — 3 Python SVG/PNG
  generators (`build_personaboards.py`, `build_postits.py`, `build_vp_deliverable.py`) + their
  rendered `.svg`/`.png` outputs (persona boards teacher/lawyer/parent, value-prop
  postits/deliverable). Extends the already-landed competition-strategy set (commit `96131df`).
- **Where:** archive ref `refs/archive/inflight/competition-design-artifacts-20260709` →
  `8ca92ed` (single commit off `crew/daniel`; temp branch deleted after the ref existed).
- **Resume / PO action:** no cache ticket. `build_vp_deliverable.py` comment "for the lecturer"
  hints this may be personal/coursework collateral parallel to (not tracked as) an ENG story —
  possibly belongs to a bulk-closed OPS POC issue (ENG-982/988/998/1001) or should not live in
  this repo. Additive-only: `git cherry-pick 8ca92ed` applies cleanly. **See flag F3.**

---

## MERGE-CANDIDATE (rebased onto default, evidence recorded; not pushed / no PR)

**None this run.** No dirty-state change group was attributed to a Done ticket while *also*
adding real value beyond what already landed on the repo default branch. Every Done-ticket
group assessed as strictly superseded (net deletions only, zero unique hunks) → discarded (see
below). The one "ready to merge" item (prompt-studio `fix/rollout-knative-rbac`) has **no**
ticket, so it is filed under KEEP + flag F1 rather than as a Done-ticket merge-candidate.

---

## DISCARD — archived for evidence, then removed (adds nothing beyond landed work / junk)

### orvex-studio-billing — three Done-ticket groups, all strictly superseded by `origin/dev`
1. **97-file staged snapshot on `main`** (ENG-1431/1439/1518/1525/1524/1526/1382/1527, all
   **Done**). Diffed the index tree vs `origin/dev`: 25 files, +65/-2076, **all deletions** —
   the index only *lacks* things dev already has (real `internal/event/relay.go`, `cmd/relay`
   binary+Deployment, advisory-lock fix, git-insteadOf/netrc, Go 1.26, lint scripts). Zero
   unique hunks. Archive ref
   `refs/archive/inflight/main-staged-eng1439-snapshot-20260709` → `01165f0`; then
   `git reset --hard`.
2. **branch `eng-1439-work`** (4 commits, ENG-1439 **Done**) — same net-deletion diff vs
   `origin/dev`; the predecessor state of #1. Archive ref
   `refs/archive/inflight/eng-1439-work-20260709` → `bfce772`; `git branch -D`.
3. **branch `eng-1584-work`** (2 commits, ENG-1584 **Done**) — vs `origin/dev` only
   `tekton/*.yaml` differ, pure deletions (dev's tekton is newer/leaner). Archive ref
   `refs/archive/inflight/eng-1584-work-20260709` → `20600c7`; `git branch -D`.
   - Note: ENG-1583 (**Duplicate**, closed) branch `eng-1583-work` + `fix/ensureschema-advisory-lock`
     have active worktrees and are fully pushed to their own origin branches — left untouched,
     no archive needed (already on origin).
   - Pre-existing archive refs from earlier runs left intact:
     `eng-1518-work`, `eng-1523`, `eng-1523-work`, `eng-1525`.

### orvex-studio-contracts — stale pre-ENG-1598 DfM corpus snapshot (junk, superseded)
- 5 untracked paths (`packages/dfm/corpus/**` + spec/util files, 36 files). Byte-identical to
  commit `b86af99` (ENG-1393, already an ancestor of `origin/dev`), which was folded into and
  superseded by `fixtures/dfm/**` in commit `6f3bfd6` (ENG-1598, also on `origin/dev`).
  `packages/dfm/corpus/` no longer exists on `origin/dev` — deliberately moved. Unrelated to
  the branch's own ENG-1503.
- Archive ref `refs/archive/inflight/orvex-studio-contracts-dfm-junk-20260709` → `d26daf5`
  (a dropped `git stash -u` commit); then `git stash drop`. **Do not resurrect** — authoritative
  corpus is `fixtures/dfm/**` on `origin/dev`.

### orvex-prompt-studio — bulk-restored tooling/planning/marketing scaffold (junk)
- `.agents/`, `.claude/`, `.factory/` (BMad skill installs, ~1500 files each), `_bmad/` (167),
  `_bmad-output/planning-artifacts/architecture.md`, `docs/architecture/**` (12),
  `marketing/**` (36). All share identical mtime `2026-06-17 15:48:56` — a single bulk
  restore, contrary to the deliberate 2026-06-12 `fresh-start` reset (`dev` squashed this
  lineage out). No ticket. Archive ref
  `refs/archive/inflight/tooling-scaffold-restore-20260709` → `1d76d74`; then throwaway branch
  `git branch -D` (after ref) + `rm -rf`. Also recoverable from `origin/dev-old` (`496ac41`).

### orvex-prompt-studio — stale/duplicate local branches
- **crew/yafet** — 1 stale local-only commit `a90bc6c` (research corpus, 2026-06-07),
  superseded by later planning artifacts. Archive ref
  `refs/archive/inflight/crew-yafet-stale-research-corpus-20260709` → `a90bc6c`; local ref then
  reset to `origin/crew/yafet` (`fce6190`) so it no longer silently diverges. **Bytes preserved
  in the archive ref before the reset.**
- **promote/rollout-knative-rbac** — commit `a454f18`, functional duplicate of
  `fix/rollout-knative-rbac` on a stale 37-commit pre-fresh-start lineage. Archive ref
  `refs/archive/inflight/promote-rollout-knative-rbac-dup-20260709` → `a454f18`; then
  `git branch -D` (after ref).

### orvex-studio-gallery — junk scratch
- `B`, `C` (0-byte files), `.agents/`, `.claude/`, `_bmad/` (local skill-tooling installs,
  never tracked in this repo). Archive ref
  `refs/archive/inflight/gallery-scratch-junk-20260709` → `b6ea3d5`; then removed.
- **run-r34929c9d** — sole commit `435834a` is a proven ancestor of `origin/dev` (work landed);
  deleted with `git branch -d` (no archive ref needed — content safe on `origin/dev`,
  re-verified by the consolidator). build-craft2 / run-r2b6fa190 — identical to their remotes,
  no-op.

---

## FLAGS — questionable items needing PO / engine decision on relaunch

- **F2 (highest) — orvex-studio-gallery is entirely off-Linear.** No project or issue for this
  repo exists in the cache, yet it holds **~79 commits of unpushed, unattributed work**
  (blocktree-migrate 37, paved-road-portals 42) plus a live-remote-adjacent run-r7bbc5ac9 (+2).
  All preserved via archive refs and left intact, but none is backed by a ticket and the two
  big branches exist **only locally** (never pushed anywhere). PO must confirm whether the
  Linear sync missed a gallery project or open tickets retroactively before this work risks
  being stranded on one machine.
- **F1 — orvex-prompt-studio `fix/rollout-knative-rbac` has no ticket.** Real, tidy, `dev`+1
  RBAC fix that unblocks rollout-restart for Knative-served binaries; kept as a live branch +
  archive ref but not merged/pushed per scope. PO to file a ticket or fast-track merge.
- **F3 — orvex-prompt-studio-poc competition artifacts may be out-of-repo coursework.** "for
  the lecturer" comment suggests personal/coursework collateral rather than an ENG deliverable;
  archived + flagged rather than committed to any branch. PO to attribute or relocate.
- **F4 — orvex-prompt-studio UI prototype has no owning story + deletes `App.tsx`.** Spans
  ENG-1275..1297 (all Backlog) with no single AC for a UI-prototype deliverable, and the
  prototype is untyped JSX (`@ts-expect-error`'d) replacing the typed `App.tsx`. A story-
  ownership + typed-port decision is needed before it can reach `dev`.
- **F5 (low) — orvex-studio-contracts ticket states inferred from git, not cache.** ENG-1392/
  1393/1357/1598 are absent from the local Linear cache; the DfM-junk discard rests on
  unambiguous git ancestry evidence (superseded by ENG-1598's `fixtures/dfm/**`) rather than a
  cached ticket state. Safe (archived either way), but noted for completeness.

No doctrine 3.20b violation was found in any repo: every unmerged branch/dirty state was
archived before any reset or `-D`, and both no-archive deletions were verified merged ancestors
of `origin/dev`.
