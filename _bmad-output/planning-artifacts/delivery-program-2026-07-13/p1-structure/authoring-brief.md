# P1 Definition-Factory issue authoring brief (shared)

You are authoring ONE Linear issue body for the Orvex Studio **Phase 1 — Definition Factory**.
The issue tracks the authoring + certification of a **Service Definition Pack** (or a wave gate /
the bridge proof). Author it to the Issue Authoring Prompt standard (wiki `9VUHxAcoXw`),
**adapted for definition work**: this issue's deliverables are wiki drafts + a frozen tagged
contract + review verdicts — not application code. Where a section of the standard is
code-specific, state its adaptation explicitly instead of faking code content (the guide itself
requires "APPLICABLE / NOT APPLICABLE (and why)").

## Canon you may cite (invent NOTHING beyond these)

- Program plan `5eFdxN3edd` (Phase 1 = Definition Factory; four waves in strict dependency order)
- Phase-1 orchestrator prompt `yXUWpQpRjx` (pack = 5 artifacts; stage gate; wave content)
- Umbrella brief `rgBOQh31p3` (source of every new product feature a PRD-delta folds in)
- Coding Standards `6aMAzsYeQb` (CS §N cites) · SE-Arch review `8sYi523i4t` (lenses + fake-done)
- Issue Authoring Prompt `9VUHxAcoXw` (H1–H17; the standard the pack's BUILD-PROMPT stories must meet)
- ADR-0033 claim arbiter `yNFx3YyNap` · ADR-0034 credential lanes `12aDkq4iOd` · ADR-0035 Go↔TS bridge `QbEBPuKcGR`
- ADR-0008 contracts change-authority (additive → automated lane; breaking → ADR + human ratify)
- Cell + tenancy contract `JGAUQRsw2g` (14-rule cell-lint every pack declares compliance with)
- Evidence (local): `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/current-state-map.md`
  (+ the per-space evidence file named in your spec), `evidence/migration-assessment.md`
- Phase-0 ground truth: six-surface verdict **1 PASS / 5 FAIL / knowledge-sync+cross-cutting PARTIAL**,
  defects ENG-2039..2054 + ENG-2068/2069 open (`delivery-program-2026-07-13/program-status-2026-07-14.md`)

Citation form on every AC/claim: `[Plan 5eFdxN3edd §…]`, `[P1 yXUWpQpRjx §…]`, `[Brief rgBOQh31p3 §…]`,
`[CS §…]`, `[SE-Arch 8sYi523i4t §…]`, `[ADR-0035 QbEBPuKcGR]`, `[Map current-state-map §…]`.
If a value does not exist yet (an NFR id, a tag scheme), write **"TBD — defined by <owner>"**;
NEVER invent numbers. The contract TAG naming scheme is defined by the Wave-1 contracts pack;
downstream packs cite "a tag in orvex-studio-contracts covering this service's surface,
scheme per the W1 contracts pack".

## The five pack artifacts (what the issue tracks, per `yXUWpQpRjx` §3)

1. **PRD-delta (reconciled)** — what the brief adds to THIS service per the concept-to-service
   map, reconciled with the service's existing PRD; every added FR/NFR cited; contested
   ownership seams flagged as review must-resolve items, never silently chosen.
2. **FROZEN, TAGGED contract** — OpenAPI + CloudEvents (ADR-0007 envelope / ADR-0010 `studio.*`
   taxonomy) + golden fixtures + generated clients in `orvex-studio-contracts`, git-TAGGED;
   TS clients for TS satellites per ADR-0035. The tag is the Phase-2 dispatch gate.
3. **Test plan** — unit / store (testcontainers) / contract (fixture round-trip in CI) /
   crew-slot / family-E2E split per CS §5; UI surfaces carry the "looks good AND works" bar.
4. **Service Done Definition (SDD)** — EVERYTHING the product will eventually need from this
   service (full API surface incl. later waves, events produced/consumed, entitlement/quota,
   cell-lint compliance, observability+SLOs, all test tiers, runbook, family-E2E participation).
   Wave scoping happens AGAINST it; per-issue DoDs roll up to it.
5. **Per-agent build prompt** — scope, ACs, standards refs, crew recipe, deterministic Done
   gate; its STORIES authored to the full 9-section H1–H17 standard of `9VUHxAcoXw`.

Packs land as **visible wiki drafts in the service's own space** (slug = repo name without
dashes). AI never promotes to canonical; promotion is human doc-ratify.

## Required output shape — exactly these 9 sections

Every completable item is a `- [ ]` checkbox (H17). Use the exact headers below.

```
1. 🎯 Issue
```
"As the Phase-2 build orchestrator I want a certified Definition Pack for <service> so that
build stories dispatch only against a frozen, reviewed contract." Then **Definition of Done —
the binary gate** (the pack analog of the named DoD test, one tickable block):
- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue*
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI run green on the tag commit*
- [ ] All five artifacts exist as wiki drafts in space `<slug>` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages*
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes")
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the wave slice
Red on any = NOT done, no override. (Adapt/trim only where your spec says the unit is a wave
gate or the bridge proof.)

```
2. ✅ Acceptance Criteria
```
`- [ ] **AC<n>** — Given/When/Then …` — one per artifact + per must-carry item in your spec +
negative/rejection ACs (e.g. review REVISE bounces to a fix pass, never overridden; an untagged
contract blocks Phase-2 dispatch) + forward-compat ACs (what a future wave must NOT break).
EVERY AC carries a literal *machine-checkable assertion in italics* + a `[Source:]` cite.

```
3. 🔨 Tasks/Subtasks
```
Dependency-ordered authoring tracer bullets, each tagged (AC: n): read canon → draft PRD-delta
→ resolve contested seams (or flag for review) → author contract + fixtures → land + tag in
contracts repo → test plan → SDD → build prompt (9-section stories) → request adversarial
review → fix pass if REVISE → tick + hand to orchestrator. Name the wiki space, the target
page(s), and the repo path(s) each task writes.

```
4. 🧠 Dev Context
```
- Inputs table: canon page/slug | what it feeds in this pack.
- The service's wiki space slug, its per-space evidence file path, the live-repo-wins
  reconciliation note (repo + migration assessment outrank stale space canon).
- Contested seams this pack MUST resolve or flag (from your spec) — each a `- [ ]` must-resolve item.
- ❌ classic-mistakes table (CS §0): assess all 12 rows APPLICABLE (with the concrete guard,
  e.g. ❌#6 big-upfront schema binds the contract shapes; ❌#3 premature seam binds port choices;
  ❌#10 ceilings bind entitlement/cap shapes) or NOT APPLICABLE (why — definition-only work).
- SE-Arch lenses (all 5) — one line each on how the pack addresses it; ADR triggers this pack
  is expected to fire (new external dependency, topic schema change, ceiling change…).

```
5. 🧪 Verification
```
The deterministic certification gates as tickable items (review PASS; tag exists; fixtures
round-trip in contracts CI; H1–H17 self-audit on build-prompt stories; SDD completeness check
against the concept-to-service map). Then **What NOT to fake** (plain bullets, not boxes):
no self-review, no claimed-but-unverified tag, no SDD trimmed to the wave slice, no invented
NFR numbers.

```
6. 📏 Guidance to follow
```
CS `6aMAzsYeQb`: §0, §3 (deep-module, design-it-twice on any NEW seam), §4 (TDD contract binds
the build-prompt stories), §5 (mocking categories bind the test plan), §6 (tier placement binds
the build prompt), §7 (seam map — name the seams this service's contract pins), §8, §10, §11,
§12 (wiki-first; pinned contracts are contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5
lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules).
NO-MONGO override (D-S12): event data = Postgres append/outbox tables; strike any Mongo wording.

```
7. 🔗 References
```
All cited slugs + the specific sections used.

```
8. 🔗 Dependencies
```
Project + milestone (from your spec) · Blocked by / Blocks (symbolic names from your spec;
ENG ids are wired at filing) · deferred work named with its future owner (e.g. story-level
issues are born FROM this pack, not before it).

```
9. 📡 How to update Linear and behave — STAGE-BY-STAGE
```
The full protocol, adapted: 1 CLAIM (Todo→In Progress; post agent/model; claim arbiter per
ADR-0033) · 2 PLAN comment · 3 continuous PROGRESS comments (each artifact drafted/landed,
blockers) · 4 COMMITS: every commit/PR body carries "Part of ENG-NNN" (links, never closes) ·
5 STAGE HANDOFF author→review · 6 REVIEW: reviewer posts `PACK-REVIEW: PASS|REVISE` + findings ·
7 TICK boxes only when genuinely verified · 8 DONE: ONLY the delivery orchestrator advances
(author CANNOT self-advance — fake-done gate) · 9 ESCALATIONS as comments; judgment calls
logged "orchestrator judgment under PO standing authority". Writes via linearis CLI; reads
from `.cache/linear/`; never the Linear MCP.

## Hard requirements (adapted H-audit — verify before emitting)

H1 binary DoD gate present · H2 every AC machine-checkable · H3 every claim cited, nothing
invented · H4 the pack leaves the BUILD agent zero architecture decisions (that's what the pack
is FOR — say so) · H6 all 12 ❌ rows assessed · H7 SE-Arch lenses + ADR triggers · H10 repos
discovered not declared; one PR per touched repo; per-repo PR gate is the merge authority ·
H11 just-in-time scope, deferred work named · H13 ALL-REAL (no fabricated review verdicts/tags)
· H14 adversarial review is a mandatory non-overridable gate · H15 author cannot self-advance ·
H16 §9 full stage-by-stage protocol + Part-of convention · H17 every completable item tickable.

## Style

GitHub markdown. No YAML frontmatter. Target 110–200 lines (umbrella/wave-gate units: 50–90
lines, lighter — mirror ENG-2037's description+DoD style but keep §8/§9 compact sections).
Use the service's REPO name in prose (e.g. `orvex-studio-knowledge`). British-neutral, terse,
zero filler. Do NOT include the issue title in the body (Linear renders it separately).
