---
name: doc-migrate
description: "Bring existing legacy/local docs INTO the project's living manual, ROUTED by the taxonomy — not mirrored. For each source doc: classify its doc_type, resolve the IA node from the project's manual-outline, then hand the content unit to doc-amend so it find-before-creates — a source matching an existing concept AMENDS that node in place, a genuinely new concept lands as a fresh draft at its IA node. No migration-staging parent, no 1:1 git mirror, no dated pages, no separate grace-period consolidation phase. Nothing is silently dropped; unclassifiable sources are surfaced to the human."
---

# doc-migrate

This is the **intake** skill: it takes documents that live outside the manual — a legacy `docs/` tree, a markdown export, a pile of local files — and folds their *knowledge* into the project's one living manual, one concept at a time. It is a **batch driver over `doc-amend`**: doc-migrate decides *which IA node each source belongs to*, and `doc-amend` does the actual per-doc work (find-before-create across drafts and canonical, ASK on a fuzzy candidate, amend-in-place, create-at-draft). doc-migrate never writes a page itself.

The single non-negotiable shape of this loop:

- **Routed by taxonomy, never mirrored.** Each source's `doc_type` (classified against `data/taxonomy.md` §4) resolves to an IA node via the project's `manual-outline.yaml`. The source lands at that node — NOT at a file-tree path that mirrors its on-disk location. There is no migration-staging parent, no 1:1 directory shadow. The legacy folder shape is discarded; the manual's project-derived IA is the only structure.
- **Knowledge, not files.** Two legacy files about the same concept do not become two pages — they converge on one living node, because each is routed through `doc-amend`'s find-before-create. A source that matches an existing concept **amends** that node in place (P1); only a genuinely new concept creates a fresh draft. doc-migrate is not a copier; it is a curator's intake queue.
- **Everything lands at `draft`.** doc-migrate (through `doc-amend`) authors at `status: draft` only — never canonical. Promotion is a separate human act via `doc-ratify`. A migrated draft is quarantined from grounding/RAG reads until ratified, so an unreviewed import never silently becomes ground truth (P6).
- **Current-state-only, no dates, no history narration.** The landed body says what is true now. No `migrated_at` front-matter, no "Migration metadata" table, no per-commit provenance, no dated slug. The legacy file's *content* is folded in as living prose; the fact that it was migrated is git/page-history, not a body block (P4). Migration provenance, if needed, is server/audit metadata — never an in-body section.
- **Nothing silently dropped.** Every source gets an outcome: `created`, `amended`, or `skipped` with a reason. A source whose `doc_type` cannot be classified, or whose IA node cannot be resolved, is **surfaced to the human** — never guessed into a wrong node, never dumped into a catch-all parent.

This is the living-wiki-native replacement for the old "1:1 git → Docmost mirror into a migration-staging parent, with a 30-day consolidation grace period." That model produced exactly the dated, file-tree-shaped, un-routed sprawl the 7 principles exist to prevent. The capability we keep is "bring legacy knowledge into the manual without losing any of it"; the mechanism is **route + amend**, not mirror + defer.

## What this skill orchestrates vs. what the durable tools own

doc-migrate is **orchestration only**. It owns the per-source loop: classify → resolve IA node → hand to `doc-amend` → record the outcome. Everything durable lives elsewhere and is composed, never re-implemented:

| Concern | Owned by | doc-migrate's part |
|---|---|---|
| Find-before-create across drafts + canonical, ASK on fuzzy, amend-in-place, create-at-draft | `skill:doc-amend` (the per-doc engine) | Hand each classified source's content unit + `target_doc_type` + `parent_hint` to it; one invocation per source |
| `doc_type → IA node` routing | `data/taxonomy.md` §4 (the catalog) + the project's `manual-outline.yaml` (the derived IA) | Read both; match `doc_type` → node; for many-per-type (`research`, `runbook`, `adr`, …) also match on subject/title |
| The synchronous draft-inclusive dup guard, CAS, banned-suffix/date-slug validation | `docmost-cli` CLI + the Docmost server | Never bypassed; surfaced through `doc-amend`'s exit-code branching |
| Whole-doc supersession (when a migrated successor replaces an old concept wholesale) | `doc-librarian`'s **manual-supersede** procedure (P5) | Not doc-migrate's job; if a source clearly supersedes a live concept rather than amending it, surface it and recommend `manual-supersede` — never amend old content into a live page |
| Promotion draft → canonical | `skill:doc-ratify` | Out of scope; doc-migrate leaves everything at `draft` and recommends `RATIFY` at the end |

> **doc-migrate never writes a page directly.** It never calls `page create` / `page patch` / `page update` itself — those run *inside* `doc-amend`. doc-migrate's only direct CLI calls are read-only pre-flight (`auth status`, `cache sync`) and read-only classification probes (`search`, `page list`), plus the `verify lint` body-conformance check on the resulting drafts. This keeps the durable safeguards (dup guard, CAS, ASK gate, draft-only authoring) in exactly one place.

## Conventions

- Bare paths (e.g. `references/guide.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory.
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.
- The `docmost-cli` CLI is the **only** sanctioned interface to the manual. Always pass `--output json` and branch on the exit code and the `errorCode` field — never on human-readable stderr text.

## Inputs (the contract)

| Input | Meaning |
|---|---|
| `space` | The manual's space slug (config key `docmost_space`). |
| `sources` | The intake list: `[{ path \| slug, doc_type? }]`. Each entry names a source document — a local file `path`, or an existing wiki `slug` (e.g. a page already imported under some legacy parent) — plus an OPTIONAL `doc_type` hint. The hint is a tiebreaker for classification, never an override of the catalog: a hint outside `taxonomy.md` §4 is rejected, not coined. |

> Beyond `space`, doc-migrate also depends on config keys `docmost_manual_root_slug` + `docmost_manual_outline` (the project-derived IA) for routing — placement (Execution Step 1 / Step 4) cannot proceed without them. These are loaded and enforced during activation (On Activation Step 4); a missing one means the manual is not yet scaffolded and the run HALTs.

## Outputs (the contract)

```json
{
  "migrated": [ { "src": "<path|slug>", "page_slug": "<slug>", "action": "created|amended|forced_new" } ],
  "skipped":  [ { "src": "<path|slug>", "reason": "<plain-English reason>" } ]
}
```

- `migrated[].action` mirrors `doc-amend`'s output: `amended` (the source folded into an existing node in place — the desired default), `created` (a genuinely new concept landed as a fresh draft), or `forced_new` (a human explicitly chose a new page over a candidate, carrying a server-minted token).
- `skipped[]` carries every source that did NOT land, each with a reason — `unclassifiable doc_type`, `no IA node for doc_type <t>`, `manual not scaffolded`, `non-interactive: candidate needs a human decision`, or `looks like whole-doc supersession — route via manual-supersede`. **The two arrays together account for every input source** (the no-silent-drop invariant).
- Every landed page is `status: draft`. Promotion is `doc-ratify`'s job, recommended in the final report — doc-migrate never promotes.

## Never (the hard guardrails)

- **Never** mirrors the legacy file tree. No migration-staging parent, no directory-shadow pages, no slug derived from the on-disk path. Placement is `doc_type → IA node`, full stop.
- **Never** creates or promotes a page at `--status canonical`. Everything lands at `draft` (via `doc-amend`); promotion is `doc-ratify`.
- **Never** writes a dated page, a `migrated_at` field, or a "Migration metadata" / provenance section into a body. Bodies are current-state-only (P4). A date segment in a slug is permitted ONLY for `release-notes / retrospective / adr` (validated against `doc_type`, not slug text).
- **Never** creates a second page for a concept that already has a live or draft node — that is exactly what routing each source through `doc-amend`'s find-before-create prevents (P1). Two legacy files on one concept converge on one node.
- **Never** classifies blindly or dumps an unclassifiable source into a catch-all. An unclassifiable `doc_type` or an unresolvable IA node is a **skip with a reason** surfaced to the human — never a guess.
- **Never** amends old content INTO a live page to "preserve" it. If a source supersedes a live concept wholesale, that is whole-doc supersession (P5) — surface it and recommend `manual-supersede`; do not launder superseded prose into a living body.
- **Never** writes a page directly. The per-doc write path is `doc-amend`'s, so the dup guard / CAS / ASK gate / draft-only authoring apply in exactly one place.

## On Activation

### Step 1: Resolve the Workflow Block

Run: `python3 {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --key workflow`

**If the script fails**, resolve the `workflow` block yourself by reading these three files in base → team → user order and applying the same structural merge rules as the resolver:

1. `{skill-root}/customize.toml` — defaults
2. `{project-root}/_bmad/custom/{skill-name}.toml` — team overrides
3. `{project-root}/_bmad/custom/{skill-name}.user.toml` — personal overrides

Any missing file is skipped. Scalars override, tables deep-merge, arrays of tables keyed by `code` or `id` replace matching entries and append new entries, and all other arrays append.

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context for the rest of the run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim. At minimum this loads `skill:doc-session-policy` (the constitution), `file:_bmad/doc/data/decision-order.md` (the router), and `file:_bmad/doc/data/taxonomy.md` (the doc-type catalog used for classification).

### Step 4: Load Config

Load `{project-root}/_bmad/doc/config.yaml` and resolve:

- `docmost_space` — the manual's space slug.
- `docmost_manual_root_slug` — the manual root.
- `docmost_manual_outline` — path to this project's `manual-outline.yaml` (the project-derived IA, the routing target).

If `docmost_space` is missing, HALT and tell the user the manual is not configured. If `docmost_manual_root_slug` / `docmost_manual_outline` is missing, the manual is **not yet scaffolded** — surface that and stop (run `manual-scaffold` via `doc-librarian` first). doc-migrate routes into the IA; there must be an IA to route into.

### Step 5: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order. Do not begin the main workflow until every activation step has run.

## Pre-flight (always, before the workflow)

```bash
docmost-cli auth status --output json            # exit non-zero → HALT; tell user to run `docmost-cli auth login`
docmost-cli cache sync --space {docmost_space}   # so dup-guard + classification reads are current
```

Branch on the exit code + the `errorCode` field. Never parse stderr text. (Exit/`errorCode` table: `docmost-cli-reference.md`.)

## Execution

<workflow>

<step n="1" goal="Load the routing inputs once (taxonomy catalog + project IA)">
  <action>Load the doc-type catalog from `taxonomy.md` §4 (the closed set of valid `doc_type` values + the living/dated rule) and the project's IA from `{docmost_manual_outline}`. These are read ONCE and reused for every source — they are the routing table.</action>
  <action>From the outline, build a `doc_type → IA node(s)` map: for each catalog `doc_type`, the section/leaf node(s) under `{docmost_manual_root_slug}` where that type lives. Note which types are **many-per-project** (`research`, `brainstorm`, `adr`, `runbook`, `technical-spec`, `api-reference`, `contract`, `feature-inventory`, `persona`, `ux-spec`, `redesign-doc`) — for those, the IA node is chosen by SUBJECT, not by type alone (e.g. `research` files under a Product-ish OR an Architecture-ish node depending on whether it is market/domain or technical — taxonomy §4).</action>
  <check if="{docmost_manual_outline} is empty or has no nodes">
    <action>The manual has no IA to route into. HALT and recommend `manual-scaffold` (via `doc-librarian`). Do NOT improvise a structure.</action>
  </check>
</step>

<step n="2" goal="Read each source's content (the per-source loop begins)">
  <critical>Process sources ONE AT A TIME, in order. Each source is fully routed and recorded before the next begins, so a mid-batch suspend (an ASK gate inside `doc-amend`) cleanly resumes on the same source. Maintain the running `migrated[]` and `skipped[]` arrays across the loop — every input source ends in exactly one of them.</critical>

  <action>For each `source` in `sources`, read its content into a `content_unit`:</action>
  <check if="source has a `path` (local file)">
    <action>Read the file. Strip any legacy front-matter / "Migration metadata" / dated provenance blocks — those are NOT carried into the living body (P4). Keep only the substantive prose.</action>
  </check>
  <check if="source has a `slug` (an existing wiki page, e.g. legacy-imported)">
    <action>First RESOLVE the slug — a legacy/imported slug may be a redirect or already superseded, and reading it raw would silently fold a stale/superseded body into the manual. Resolve, then `page get` the resolved (live canonical) slug:</action>
    ```bash
    docmost-cli page resolve-slug <slug> --output json   # walks redirect_from then superseded_by → live destination
    docmost-cli page get <resolved-slug> --output json
    ```
    <action>Use the returned body as the `content_unit`, again stripping any legacy provenance blocks.</action>
  </check>
  <check if="the source cannot be read (missing file, FORBIDDEN on the slug, empty body)">
    <action>Record `skipped: { src, reason: "unreadable source: <errorCode>" }` and continue to the next source. Do NOT guess content.</action>
  </check>
</step>

<step n="3" goal="Classify the doc_type (against the catalog — never coined)">
  <critical>The `doc_type` MUST be a value from `taxonomy.md` §4. doc-migrate never invents or recases a doc_type. A supplied `doc_type` hint is a tiebreaker, never an override — a hint outside the catalog is rejected.</critical>

  <action>Classify the source against the catalog using its content + title + (if present) the `doc_type` hint: map it to the single best-fit catalog `doc_type` (e.g. a requirements doc → `prd`, a decision record → `adr`, a market study → `research`, an operational procedure → `runbook`, a how-to for an end user → `user-guide`). Use the catalog's descriptions and Diataxis lens to decide.</action>
  <check if="the source clearly maps to a catalog doc_type">
    <action>Set `{{doc_type}}` and continue to Step 4.</action>
  </check>
  <check if="the source is genuinely ambiguous between two catalog types AND a human is present">
    <ask>One plain-English question, naming the source and the two candidate types — e.g. "«{source}» reads as either a `technical-spec` or an `adr`. Which is it?" Wait for the reply; apply it; do NOT stack questions. (This is the only classification question doc-migrate asks per source, and only when genuinely ambiguous — a clean match needs no question.)</ask>
  </check>
  <check if="the source maps to NO catalog doc_type (e.g. transient workflow state, a test artifact, a one-off prompt — Tier C per taxonomy §3)">
    <action>Record `skipped: { src, reason: "unclassifiable doc_type — not durable Tier-A canon (likely Tier-C transient; stays in the repo)" }` and continue. Tier-C artifacts do NOT belong in the manual (taxonomy §3) — skipping them is correct, not a loss.</action>
  </check>
  <check if="the calling context cannot suspend for a classification reply and the source is genuinely ambiguous">
    <action>Do NOT guess. Record `skipped: { src, reason: "ambiguous doc_type — needs a human classification decision" }` and continue.</action>
  </check>
</step>

<step n="4" goal="Resolve the IA node (doc_type → manual-outline node)">
  <critical>Placement is taxonomy-routed, NOT a mirror of the source's on-disk path. The legacy folder shape is irrelevant; the project IA decides where the concept lives.</critical>

  <action>Look up `{{doc_type}}` in the `doc_type → IA node(s)` map from Step 1.</action>
  <check if="exactly one IA node maps to this doc_type">
    <action>Set `{{parent_hint}}` to that node's slug and continue to Step 5.</action>
  </check>
  <check if="the doc_type is many-per-project and several IA nodes are candidates">
    <action>Choose the node by SUBJECT (the source's actual topic), per taxonomy §4 — e.g. technical research → an Architecture-ish node, market/domain research → a Product-ish node. Set `{{parent_hint}}` to the chosen node's slug. If the subject is genuinely ambiguous between two real nodes AND a human is present, ask ONE plain-English question naming the source and the two nodes; otherwise pick the clearly-better-fit node and let `doc-amend`'s own ASK gate catch any later ambiguity.</action>
    <note>`{{parent_hint}}` is exactly that — a HINT. doc-amend re-resolves the authoritative node against the outline in its own Step 1, and may land the concept on an existing node it finds via find-before-create regardless of the hint. doc-migrate does not force placement; it proposes it.</note>
  </check>
  <check if="NO IA node maps to this doc_type in the project's outline">
    <action>The project's IA has no home for this type (the outline was derived without it). Record `skipped: { src, reason: "no IA node for doc_type '<{{doc_type}}>' in this project's manual-outline — extend the outline via manual-scaffold, then re-run" }` and continue. Do NOT create an off-taxonomy parent (that would fail `verify ia-conformance`).</action>
  </check>
</step>

<step n="5" goal="Hand the source to doc-amend (the per-doc engine — find-before-create, ASK, amend-in-place, create-at-draft)">
  <critical>This is where the actual page write happens — INSIDE `doc-amend`, never here. doc-migrate composes; it does not re-implement. doc-amend runs the full spine: READ the IA node → FIND-BEFORE-CREATE across drafts AND canonical → ASK one plain-English question on a fuzzy candidate → AMEND only the affected sections in place → CREATE a fresh draft only when genuinely new.</critical>

  <action>Invoke `skill:doc-amend` with this source's contract inputs:</action>
  ```
  doc-amend(
    content_unit   = <the stripped, current-state-only prose from Step 2>,
    target_doc_type = {{doc_type}},          # from Step 3, a catalog value
    space           = {docmost_space},
    parent_hint     = {{parent_hint}}         # from Step 4; a hint, re-resolved authoritatively by doc-amend
  )
  # author_from_evidence is NOT set — the unit already exists (the legacy source IS the unit).
  ```
  <note>doc-amend's find-before-create is what makes this routing, not mirroring: a source whose concept already has a node AMENDS it in place (P1); only a genuinely new concept CREATEs a fresh draft. Two legacy files on the same concept therefore converge on ONE node — the second one amends the page the first one created. The synchronous draft-inclusive dup guard built into `page create` (exit 8 `DUPLICATE_CANDIDATE`) is the authoritative backstop inside doc-amend; doc-migrate never sees it directly.</note>

  <action>Capture doc-amend's output object: `{ page_slug, page_url, action, asked, ... }`.</action>

  <check if="doc-amend returns action = amended | created | forced_new">
    <action>Record `migrated: { src, page_slug: <page_slug>, action: <action> }`. The page is at `status: draft`. Continue to the next source.</action>
  </check>
  <check if="doc-amend reports a non-interactive deferred decision on a fuzzy candidate (it could not get a human amend/new answer)">
    <action>doc-amend left a durable comment on the candidate and did NOT create a sibling (its non-interactive guardrail). Record `skipped: { src, reason: "candidate match needs a human amend-vs-new decision — see comment on <candidate>" }` and continue. Never auto-create over an ambiguous candidate.</action>
  </check>
  <check if="this source clearly REPLACES a live concept wholesale (a true successor, not an amendment)">
    <action>This is whole-doc supersession (P5), not migration-amend. Do NOT amend the old content into the live page and do NOT have doc-amend launder superseded prose. Record `skipped: { src, reason: "looks like whole-doc supersession of <live-concept> — route via doc-librarian's manual-supersede after landing the successor" }` and surface it in the final report. (doc-amend itself never supersedes; that is the librarian's procedure.)</action>
  </check>
  <check if="doc-amend errors hard (e.g. FORBIDDEN, repeated CONFLICT, manual not scaffolded mid-run)">
    <action>Record `skipped: { src, reason: "doc-amend failed: <errorCode>" }` and continue. One source's failure aborts that source, never the batch.</action>
  </check>
</step>

<step n="6" goal="Body-conformance check on the landed drafts (P4 / P7)">
  <action>After the batch, lint the drafts doc-migrate landed this run to confirm legacy prose did not carry obsolescence narration or dated/provenance cruft into a living body. Lint is PER-PAGE and RULE-SCOPED (verified against `docmost-cli verify lint --help`; the AS-BUILT form doc-ratify uses): loop over THIS run's landed slugs (from `migrated[]`) and lint each one against the rules that matter for a migration:</action>
  ```bash
  # For each slug in migrated[].page_slug (this run's landed drafts only):
  docmost-cli verify lint --page <slug> --rules "P4-OBSOLESCENCE-NARRATION,P7-*" --space {docmost_space} --output json
  # P4-OBSOLESCENCE-NARRATION = "previously / used to / as of / no longer"; P7-* = substance.
  # Branch on the errorCode/exit, never on stderr text.
  ```
  <note>Lint per landed slug — attribution is intrinsic. Because each call names a single page from `migrated[]`, a pre-existing violation elsewhere in the manual is never charged to this migration; there is no space-wide scan to post-filter.</note>
  <check if="lint flags a page doc-migrate landed this run">
    <action>Do NOT silently leave the violation. The legacy source slipped history/obsolescence narration into the body — that body must be re-amended current-state-only. Re-run that one source through `doc-amend` with the offending narration stripped, OR (if a human is present) surface the specific lint finding for them to resolve. Record the page in the report as `lint-flagged` so it is visible, never swept under the batch's success count.</action>
  </check>
  <note>If the CLI build lacks `verify lint`, skip this step and note it in the report — the drafts still go through `doc-ratify`'s human delight-review before promotion.</note>
</step>

<step n="7" goal="Report (the output contract)">
  <action>Emit the JSON output object — `migrated[]` and `skipped[]` together MUST account for every input source (the no-silent-drop invariant):</action>
  ```json
  { "migrated": [ { "src": "...", "page_slug": "...", "action": "amended|created|forced_new" } ],
    "skipped":  [ { "src": "...", "reason": "..." } ] }
  ```
  <output>
    **doc-migrate complete.**
    - Sources in: {{count(sources)}}  ·  migrated: {{count(migrated)}}  ·  skipped: {{count(skipped)}}  (every source is accounted for in exactly one bucket)
    - Of the migrated: {{count(amended)}} amended into existing nodes (knowledge converged — P1), {{count(created)}} new drafts, {{count(forced_new)}} human-forced new.
    - Skipped (surfaced, not lost): {{the reasons — unclassifiable / no IA node / ambiguous-needs-human / supersession-candidate / unreadable}}.
    - Every landed page is **status: draft**. Next step: run **RATIFY** (`doc-ratify`) to promote the migrated drafts to canonical via human ratification — doc-migrate never promotes.
    - Any **lint-flagged** drafts (legacy obsolescence/dated narration) are listed for re-amend before ratification.
    - Any **supersession candidates** are listed for `manual-supersede` (P5) — doc-migrate amends-in-place; it does not supersede.
  </output>
</step>

</workflow>

## Why this is route-and-amend, not mirror-and-defer

The legacy migration this replaces was a deliberate *dumb mechanical mirror*: every file became a page at a path-derived slug under a `migration-staging` parent, with full git-history-as-page-history, dated `migrated_at` provenance, no taxonomy decisions, and a 30-day grace period before a separate consolidation pass could touch any of it. That design was sound for its stated goal (lose nothing) but it manufactures the exact anti-patterns the constitution forbids: file-tree IA instead of project-derived IA, dated/provenance body cruft (P4), 1:1 file-per-page sprawl instead of one-page-per-concept (P1), and a deferred "fix it later" phase that never reads as current truth (P6).

doc-migrate keeps the *only* invariant worth keeping from that design — **nothing is silently dropped** — and discards the mechanism. There is no staging parent (sources route straight to their IA node), no git-mirror (knowledge is folded in as living prose, history stays in git where it already is), no dated pages, and no grace period (find-before-create *is* the dedup, applied at intake by `doc-amend`, so there is nothing to defer to a consolidation phase). The "lose nothing" guarantee is upheld differently: by the `migrated[]` + `skipped[]` accounting that covers every input, with every skip carrying a human-readable reason.

**On the built `migrate scan/apply/verify` pipeline — a deliberate non-use, not an oversight.** The CLI ships a bulk-import pipeline (`migrate scan / apply / verify` — see `data/docmost-cli-reference.md`, *Bulk import*) that turns a source tree into pages. doc-migrate **does not** drive `migrate apply` / `migrate verify`, and the omission is intentional: that pipeline's whole value is a faithful 1:1 mirror (one source → one page, structure-preserving), which is *exactly* the file-tree-shaped, un-routed result the route-by-taxonomy contract above exists to prevent. Running `apply` would re-introduce the staging-parent / path-derived-slug / file-per-page sprawl this skill discards, and would bypass `doc-amend`'s find-before-create (so two legacy files on one concept would land as two pages, violating P1). doc-migrate **may**, however, use `migrate scan` in a strictly read-only role: purely to **ENUMERATE** the source set (walk a tree, list candidate files) so the per-source loop has a complete intake list — never to author. Each enumerated source is still individually classified (Step 3), routed by taxonomy (Step 4), and handed to `doc-amend` (Step 5); `scan` discovers, it does not place.

## Error handling

Branch on exit code + the `errorCode` field — never on stderr text.

| Condition | Action |
|---|---|
| `docmost-cli` not on PATH | HALT; tell the user to install/authenticate the CLI |
| `auth status` non-zero (`AUTH_MISSING`) | HALT; tell the user to run `docmost-cli auth login` |
| `cache sync` exits 3 (`CACHE_STALE`) | re-run once and retry; if still stale, WARN and stop |
| `docmost_manual_root_slug` / `docmost_manual_outline` missing (manual not scaffolded) | HALT; recommend `manual-scaffold` via `doc-librarian` — there is no IA to route into |
| a source is unreadable (missing file / `FORBIDDEN` slug / empty body) | `skipped` with a reason; continue the batch |
| a source's `doc_type` is unclassifiable / Tier-C transient | `skipped` with a reason; continue (Tier-C stays in the repo — taxonomy §3) |
| a `doc_type` hint outside the catalog | ignore the hint and classify against the catalog; if still unclassifiable, `skipped` |
| no IA node maps to the `doc_type` in this project's outline | `skipped` with a reason; recommend extending the outline via `manual-scaffold`; never create an off-taxonomy parent |
| `doc-amend` non-interactive deferred decision on a fuzzy candidate | `skipped` with a reason (doc-amend already left the durable comment + did not create a sibling); continue |
| source is whole-doc supersession, not amend | `skipped` with a reason; recommend `manual-supersede` (P5); never launder superseded prose into a live body |
| `doc-amend` hard error (`FORBIDDEN`, repeated `CONFLICT`) | `skipped` with the `errorCode`; aborts that source, never the batch |
| `verify lint` flags a landed draft | re-amend that source current-state-only (or surface to a human); record it `lint-flagged` — never hide it in the success count |
| `verify lint` unavailable (CLI absent/old) | skip Step 6 and note it; the drafts still face `doc-ratify`'s delight-review before promotion |

## Dependencies — what is leaned on vs what is owned here

doc-migrate owns no durable capability. It leans entirely on built, proven primitives and skills:

- **`skill:doc-amend`** — the per-doc engine. doc-migrate is a batch driver over it: one `doc-amend` invocation per classified source. The find-before-create / ASK / amend-in-place / create-at-draft spine, the synchronous dup guard, CAS, and draft-only authoring all live there (and in `docmost-cli` / the server). doc-migrate never re-implements any of it.
- **`data/taxonomy.md` §4 + the project's `manual-outline.yaml`** — the `doc_type → IA node` routing table. doc-migrate reads them; it never invents a doc_type or an IA node.
- **`skill:doc-ratify`** — promotion of the resulting drafts. doc-migrate leaves everything at `draft` and recommends `RATIFY`; it never promotes.
- **`doc-librarian`'s manual-supersede procedure** — for the whole-doc supersession case (P5). doc-migrate surfaces supersession candidates; it never supersedes itself.
- **`docmost-cli verify lint`** — read-only body-conformance check (P4/P7) on the landed drafts.

doc-migrate never builds tokens, never promotes to canonical, never creates a page directly, never mirrors a file tree, and never silently drops a source.
