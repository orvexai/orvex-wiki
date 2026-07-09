---
name: doc-amend
description: "Route a unit of content to its living manual node, find-before-create across drafts AND canonical, ask one plain-English question on a fuzzy candidate, then amend only the affected sections in place (current-state-only). Can also AUTHOR the content unit first from code + wiki evidence (the strawman front-stage), flagging each inference as one plain-English question. Creates a fresh page only when genuinely new — always at status draft, never canonical. This is the update-by-default skill that the planning overrides call instead of page upsert."
---

# doc-amend

The heart of **update-by-default** (PLAN §B.2). Given a unit of content destined for the project's living manual, this workflow finds the one node it belongs to, updates **only the affected sections in place**, and never spawns a sibling page for a concept that already has one. It asks the human exactly one plain-English question when — and only when — a candidate match is genuinely fuzzy. It creates a new page only when the content is genuinely new, and always at `status: draft`; promotion to `canonical` is a separate human act (`doc-ratify`), never something this skill performs.

A caller may hand this skill a finished `content_unit`, or it may ask this skill to **author the unit from evidence first** (the strawman front-stage, Step 0). The front-stage is the productized form of the old tech-writer-manual "bit-loop": gather evidence from the code and the existing wiki, write a plain-language strawman, and flag every *inference the evidence does not directly support* as one plain-English chat question (P3) — never an unflagged guess, never a body section of open questions, never a Docmost comment used as a chat surface. Once the unit exists (supplied or authored), the rest of the workflow is unchanged: find-before-create → ASK → amend-in-place → create-at-draft. Promotion remains `doc-ratify`'s job.

This skill replaces the old `page upsert --status canonical` path that the six planning overrides used to call. It enforces principles **P1** (one living page per concept, no dated sprawl), **P3** (update by default, ask-when-ambiguous, one question), **P4** (current-state-only bodies), and **P7** (the `tldr` lead and protected story zones are never flattened).

It is an **orchestrator**: the durable safeguards (the synchronous dup guard, CAS, the role-anchored lead targeting, the draft→canonical guard) live in the `docmost-cli` CLI and the Docmost server. This skill walks the router in `decision-order.md` (branches READ → FIND → ASK → AMEND → CREATE) and branches on exit codes — never on stderr text.

## Conventions

- Bare paths (e.g. `references/guide.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## Inputs (the contract — CONTRACTS.md §3.1)

| Input | Meaning |
|---|---|
| `content_unit` | The body to route into the manual — markdown text or a file path. The unit of knowledge, not a whole document dump. **Optional** when `author_from_evidence` is set — then Step 0 produces it from evidence. |
| `target_doc_type` | The doc-type from the catalog in `taxonomy.md` §4 (lowercase-kebab). The caller supplies it; this skill never invents a doc-type. |
| `space` | The manual's space slug (config key `docmost_space`). |
| `parent_hint` | Optional. A hint at the IA parent node; resolved authoritatively against the project's `manual-outline.yaml` in Step 1. |
| `author_from_evidence` | Optional flag. When true (or when `content_unit` is absent and a `topic`/`scope` is given), run the strawman front-stage (Step 0): gather code + wiki evidence, draft the unit in plain language, and flag each unsupported inference as one chat question (P3) before routing it. When false (the default for override callers handing a finished unit), Step 0 is skipped. |
| `topic` / `scope` | Optional, used only with `author_from_evidence`. The subject to author and a one-line scope statement bounding it — what this unit must cover that its parent does not. |

## Outputs (the contract — CONTRACTS.md §3.1)

```json
{ "page_slug": "<slug>", "page_url": "<url>", "action": "created|amended|forced_new", "asked": true, "authored": false, "deferred_followups": [] }
```

- `action: amended` — an existing node was updated in place (the default and desired outcome).
- `action: created` — no candidate existed; a fresh page was created at `status: draft`.
- `action: forced_new` — a candidate existed but a human explicitly chose a new page, carrying a human-attributed token.
- `asked` — whether the one-question ASK gate fired this run.
- `authored` — whether the strawman front-stage (Step 0) authored the `content_unit` from evidence this run (false when the caller supplied a finished unit).
- `deferred_followups` — subjects the front-stage flagged as out-of-scope candidate future units (empty unless Step 0 ran and the human deferred something).

## Never (the hard guardrails)

- **Never** rewrites the protected story / `tldr` / "how this manual works" zones — those are transcluded canon and are non-AI-writable (P7). The `tldr` lead is amended only through its role anchor (Step 4), never by index or title-stem.
- **Never** creates or promotes a page at `--status canonical`. AI authors at `draft` only; promotion is `doc-ratify`'s job, server-guarded.
- **Never** writes obsolescence/history narration into a body ("previously", "used to", "as of", an in-body changelog). Bodies are current-state-only (P4) — EXCEPT dated/append version pages (`release-notes` / `retrospective` / `adr`), which are point-in-time records exempt from the P4 obsolescence-narration lint (taxonomy.md §5).
- **Never** writes a sibling page for a concept that already has a live or draft page (P1). A draft on the topic is a real candidate.
- **Never** bypasses the ASK gate by silently picking a candidate, and never stacks more than one question.
- **(Front-stage, Step 0) Never** writes an *unflagged guess* into an authored unit. A claim is either evidenced (a code path or a ratified page it can cite) or it is a flag — one plain-English chat question, never an `## Open questions` body section and never a Docmost comment used as a chat surface (comments are for genuine page review, not skill flags). Never invents details "to fill a gap"; a gap is a flag. Never copies old wiki prose into the unit as fact — old pages are *evidence only*, cited in the reasoning, never laundered into canon unreviewed.

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

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim. At minimum this loads `skill:doc-session-policy` (the constitution) and `file:_bmad/doc/data/decision-order.md` (the router).

### Step 4: Load Config

Load `{project-root}/_bmad/doc/config.yaml` and resolve:

- `docmost_space` — the manual's space slug.
- `docmost_manual_root_slug` — the manual root, entry point for IA-node resolution.
- `docmost_manual_outline` — path to this project's `manual-outline.yaml` (the project-derived IA).

If `docmost_space` is missing, HALT and tell the user the manual is not configured. If `docmost_manual_root_slug` / `docmost_manual_outline` is missing, the manual is not yet scaffolded — surface that and stop (run `manual-scaffold` first).

### Step 5: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order. Activation is complete; do not begin the main workflow until every activation step has run in order.

## Pre-flight (always, before the workflow)

```bash
docmost-cli auth status --output json     # exit non-zero → HALT; tell user to run `docmost-cli auth login`
docmost-cli cache sync --space {docmost_space}   # so dup-guard + CAS reads are current
```

Branch on exit code + the `errorCode` field from the JSON envelope. Never parse stderr text. (Exit/`errorCode` table: `docmost-cli-reference.md` §"Exit codes & error envelope" and CONTRACTS.md §0.4.)

## Execution

<workflow>

<step n="0" goal="STRAWMAN FRONT-STAGE — author the content unit from evidence (P3; only when author_from_evidence)" optional="true">
  <critical>Run this step ONLY when `author_from_evidence` is set (or `content_unit` is absent and a `topic`/`scope` was given). When the caller already supplied a finished `content_unit` (the default for the planning overrides), SKIP straight to Step 1. This front-stage produces the `content_unit`; it does not touch the manual — no page is written here. It is the productized "bit-loop" authoring spine from tech-writer-manual, re-skinned: chat questions (not Docmost comments), current-state-only bodies (no ratification stamps, no in-body open-questions), and one node per concept (no `/Manual` root, no `user-guide`+`tags:[manual]` hack — the real `target_doc_type` and project-derived IA carry the placement).</critical>

  <action>**Establish scope (one crisp question, only if `scope` was not supplied).** Ask: "In one or two sentences, what does this {target_doc_type} on «{topic}» need to cover that its parent section does not?" The answer bounds the unit; anything out of scope becomes a deferred follow-up (a future unit), never wedged in. This is the same P3 one-question discipline the rest of the skill uses.</action>

  <action>**Gather evidence — code first, wiki second.** Build a small evidence list before writing a line. Recent code is strong; stale wiki prose is suspect and is *evidence only*, never copied as fact.</action>
  ```bash
  # Wiki — body FTS + near-topic pages (excluding the manual node itself; we don't cite the manual to itself):
  docmost-cli search "<topic>" --cached --content --space {docmost_space} --output json
  docmost-cli page list --filter 'title contains "<topic>"' --space {docmost_space} --output json
  # Code — relevant paths/identifiers via Grep/Glob/Read. Capture for each evidence item:
  #   source kind (code|wiki), path-or-slug, one-line summary, last-updated date
  #   (wiki: updated_at from page get; code: git log -1 --format=%cI <path>).
  ```
  <note>This evidence probe and the Step-2 find-before-create probe overlap deliberately; both are cheap and cache-backed. Step 0's probe is for *authoring material*; Step 2's is the *dup arbiter*. Running Step 0 does not exempt the unit from Step 2 — every authored unit still goes through find-before-create.</note>

  <action>**Draft the strawman (plain language, current-state-only).** Write the unit a smart new teammate could follow: a 2-3 sentence "in short" lead, then the substance of this concept only, drilling down by linking to sibling/child concepts rather than inflating page length. Use the body shape of `{project-root}/_bmad/doc/data/doc-type-templates/<target_doc_type>.md` as the starting structure. Quote code identifiers / config keys / spec terms verbatim — never paraphrase them. Follow the house style in `data/authoring-conventions.md` (header-card callout, ·-metadata bar, Canon row + ↑Part-of breadcrumb). **No** ratification stamp, **no** `## Open questions` section, **no** `## Evidence cited` section, **no** "previously / used to / as of" narration (P4) — the body reads as finished current-state prose. The evidence list stays in your working reasoning, not in the body.</action>

  <action>**Satisfy P7 — author the right embeds for the content (not just prose).** A flat wall of prose fails P7. After the prose is drafted, add the embeds the content calls for, picking each per the "Embeds by doc-type" table in `data/rich-page-authoring.md` and the DIAGRAM POLICY: a **diagram** for any real flow/architecture (coloured MERMAID for multi-node / must-render-unattended; coloured EXCALIDRAW for a simple ≤3–4-node diagram — and ship the adjacent `[bake-pending]` warning callout the policy requires); a **table/chart** for structured data/comparisons; a **callout** for a genuine gotcha or the lead-style header card; a **task_list** for an ordered procedure; a **transclusion** for a fact already canonical elsewhere (cite, don't re-state); **subpages** for an index/landing; and a live **linear_*** embed where the content is status that should stay current. Author every embed with the `page block` verb — never hand-write embed markdown into the unit. See `data/rich-page-authoring.md` (the composition recipe, §0 EMBED-READ LANDMINE, the diagram policy) and `data/authoring-conventions.md`. Preview with `--dry-run`, then confirm with `verify render` once the page exists (Step 4/Step 5). Embeds carrying inferred content are still subject to the P3 flag discipline below.</action>

  <action>**Flag inferences as ONE chat question at a time (P3 — never an unflagged guess).** Walk the draft. For each place where you inferred something the evidence does not directly support, two sources disagree, code contradicts old docs, or you picked one reasonable option among several, queue a plain-English question. Then ask exactly ONE — the highest-impact (structural/scope/naming before minor author-choice) — wait for the answer, fold it into the draft, and only then ask the next. Be selective: if a point can be sensibly defaulted, default it; reserve questions for what the human genuinely must decide. Never stack questions, never post them as a body section, never post them as Docmost comments.</action>
  <ask>One question, in plain English, naming the topic and the single thing you need decided — e.g. "On «{topic}»: the code does X ({path}) but the old wiki says Y — which is current?" Wait for the reply; apply it directly (chat answers are authoritative — do not playback-confirm); then ask the next queued question, or stop when none remain.</ask>
  <check if="an answer says a point is out of scope">
    <action>Record it as a deferred follow-up (a candidate future unit) and drop it from this unit — do not wedge it in. Surface it in the final report, not in the body.</action>
  </check>
  <check if="the calling context cannot suspend for chat replies (non-interactive handoff)">
    <action>Do NOT guess past a flag. Draft only the evidenced portions, and report the open flags as a deferred decision so a human resolves them before the unit is routed. Never launder an unanswered inference into the body.</action>
  </check>

  <action>**Set `content_unit`** to the flagged-and-resolved strawman (in memory or a temp file) and continue to Step 1. The unit now carries only evidenced or human-ratified claims, current-state-only. From here the standard spine routes it: find-before-create → ASK → amend-in-place → create-at-draft. Promotion to canonical is still `doc-ratify`.</action>
</step>

<step n="1" goal="Resolve the target living manual node (READ — decision-order §1)">
  <action>Hand off to `skill:doc-read-first` to resolve the **living manual node** for `target_doc_type` — the manual root plus the project-derived IA path — NOT a loose title-stem search.</action>
  <action>Read `{docmost_manual_outline}` and find the IA node whose `doc_type` matches `target_doc_type`. For many-per-project types (e.g. `research`, `adr`, `runbook`), also match on the content unit's subject/title. This yields the IA path under `{docmost_manual_root_slug}` and the resolved parent node slug. Use `parent_hint` only as a tiebreaker, never as an override of the outline.</action>
  <action>Record `{{ia_parent_slug}}` (where a new child would land) and `{{node_slug}}` (the existing node for this concept, if doc-read-first resolved one).</action>
  <note>doc-read-first excludes draft/superseded/archived from GROUNDING reads. The FIND step (Step 2) is a separate read path that DELIBERATELY includes drafts (CONTRACTS.md §2.8 boundary note) — do not conflate them.</note>

  <check if="`target_doc_type` is a DATED/APPEND type (`release-notes` / `retrospective` / `adr`) — taxonomy.md §5">
    <action>SUSPEND the P1 amend reflex for this run. For a dated/append type, a NEW occurrence is a CREATE of a dated child UNDER the section landing — NOT an amend of a prior occurrence. Resolve `{{ia_parent_slug}}` to the section's living landing (e.g. the release-notes index landing) and treat this unit as a new dated child of it. Set `{{ia_parent_slug}}` accordingly and GOTO step 5 (CREATE) — do NOT set `{{candidate_slug}}` to a prior occurrence and do NOT run the find-before-create dup arbiter against sibling occurrences (per-occurrence dedup only — taxonomy.md §5; the dated/append slug carve-out lets the date segment through). Use the per-version template in `{project-root}/_bmad/doc/data/doc-type-templates/release-notes.md` (titled e.g. "Release Notes vX.Y", slug `release-notes-vX-Y`, newest-first) and keep the living index landing (`release-notes-index.md`) as the parent.</action>
    <note>The dated/append body is EXEMPT from the P4 obsolescence-narration guardrail (taxonomy.md §5): a version page legitimately says "previously / as of / no longer" because it is a point-in-time record, not a current-state living page. The P4 no-obsolescence-narration lint is exempt on these dated version pages. All other guardrails (CAS, draft-only create, anti-orphan link-in) still apply. Embeds (P7) still apply — pick per `data/rich-page-authoring.md`.</note>
  </check>
  <check if="doc-read-first resolved an existing canonical or draft node for this concept">
    <action>Set `{{candidate_slug}} = {{node_slug}}` and GOTO step 4 (AMEND). The node is known; no dup probe is needed.</action>
  </check>
  <action>Otherwise continue to Step 2 — the concept's node is not yet known; we must find-before-create.</action>
</step>

<step n="2" goal="FIND-BEFORE-CREATE across drafts AND canonical (decision-order §2; P1)">
  <critical>A `search` that comes back empty is NOT proof the concept is new — search only sees indexed pages and misses a sibling draft authored seconds ago. The authoritative dup arbiter is the server-side guard built INTO `page create` (Step 5: exit 8 `DUPLICATE_CANDIDATE`, draft-inclusive, semantic + title/FTS/suffix). This step is a cheap pre-probe so a clear existing concept goes through the ASK gate BEFORE we ever attempt a create; the create-path guard is the backstop that catches what this pre-probe misses.</critical>

  <action>Run the find-before-create pre-probe across drafts AND canonical. Treat any hit as a candidate:</action>
  ```bash
  docmost-cli search "<topic>" --cached --content --space {docmost_space} --output json
  # FTS body match (misses unindexed drafts — the create-path guard in Step 5 is the backstop)
  docmost-cli page list --filter 'title contains "<topic>"' --space {docmost_space} --output json
  # title match, ALL statuses incl. draft — do NOT add `--status canonical`; drafts are candidates
  ```
  <note>There is no standalone `page duplicate-check` verb. The synchronous, draft-inclusive, semantic dup guard is built INTO `page create` (`--force-new` + exit 8 `DUPLICATE_CANDIDATE` — CONTRACTS.md §1.2), which fires in Step 5. This pre-probe (FTS + title match) lets us route an obvious existing concept through the ASK gate up front; anything it misses (an unindexed draft, a semantic-only match) is caught by the create-path guard, which returns the candidate and bounces back to the ASK gate. PENDING: a draft-inclusive semantic `POST /api/orvex/pages/duplicate-check` endpoint (CONTRACTS.md §2.4) would let this PRE-probe also see semantic/unindexed-draft matches before the create attempt; until it ships, the FTS/title pre-probe plus the create-path guard cover the same ground.</note>

  <action>Read the results.</action>
  <check if="a candidate is returned (any match: exact-title | fts)">
    <action>Set `{{candidate_slug}}` to the top candidate's slug and `{{candidate_title}}` to its title. GOTO step 3 (ASK GATE). Do NOT silently pick — even a high-similarity match goes through the one question, because the human decides amend-vs-new.</action>
  </check>
  <check if="no candidate (both probes empty)">
    <action>No pre-probe hit. GOTO step 5 (CREATE) — the create-path dup guard is the authoritative backstop; if it finds a candidate the pre-probe missed, it bounces back to the ASK gate (exit 8).</action>
  </check>
  <check if="the pre-probe exits non-zero">
    <action>Log a WARN with the `errorCode`. On a transient failure (`SERVER_UNREACHABLE`, `CACHE_STALE`) re-sync and retry once. Even if the pre-probe cannot run, do NOT create blindly — the create-path guard still arbitrates, but a probe outage on top of an unindexed draft is exactly the P1 failure this skill prevents, so prefer surfacing the situation to the human over a silent create.</action>
  </check>
</step>

<step n="3" goal="ASK GATE — one plain-English question on a candidate (decision-order §3; P3)">
  <critical>Exactly ONE question. Not a form, not a checklist, not a confirmation ritual. The question names the existing page and gives a one-line diff of what this unit would add.</critical>

  <action>Read the candidate so the diff is accurate:</action>
  ```bash
  docmost-cli page get {{candidate_slug}} --output json
  ```
  <action>Compose the one-line diff: the single most material thing `content_unit` would change or add to the candidate's affected section. Keep it to one line.</action>

  <action>Make the question durable on the candidate so the decision is auditable and survives the suspend:</action>
  ```bash
  docmost-cli comment add {{candidate_slug}} \
    --body "Found existing «{{candidate_title}}». Amend it to add: <one-line diff>?  (y = amend / n = new page)"
  ```

  <action>SUSPEND the workflow and surface the SAME one question to the human in chat:</action>
  <ask>Found an existing page «{{candidate_title}}». Amend it to add: <one-line diff>?  Reply **amend** to update it, or **new** to create a separate page.</ask>
  <note>Auto-resume from the chat reply. Set `{{asked}} = true`.</note>

  <check if="human answers amend (or any clear yes)">
    <action>Set `{{candidate_slug}}` as the amend target. GOTO step 4 (AMEND-FIRST).</action>
  </check>
  <check if="human answers new (or any clear no)">
    <action>GOTO step 5 (CREATE) on the `--force-new` path — a new page over a known candidate requires the human-attributed token.</action>
  </check>
  <check if="the calling context cannot suspend for a human reply (non-interactive handoff)">
    <action>Do NOT guess. Default to amend-safe behavior: leave the durable comment, do NOT create a sibling, and report `asked: true` with a deferred decision so a human resolves it (the comment is the seam). Never auto-create over an ambiguous candidate.</action>
  </check>
</step>

<step n="4" goal="AMEND-FIRST — update only the affected sections in place (decision-order §4; P1, P4, P7)">
  <critical>Update the EXISTING node; never spawn a sibling. Touch ONLY the affected sections. Keep the body current-state-only. Never rewrite the protected story / tldr / "how this manual works" zones.</critical>

  <action>Read the current body and capture `updated_at` for CAS. `page get` is fine for a prose-only page, but if the candidate has (or might have) embeds, read it via `page mirror pull` — `page get` (INCLUDING `--output json`) silently DROPS embeds (they collapse to empty `##` headers) and strips link URLs; `mirror pull` is the only faithful read (the EMBED-READ LANDMINE, `data/rich-page-authoring.md` §0):</action>
  ```bash
  docmost-cli page get {{candidate_slug}} --output json            # prose-only candidate; also yields updated_at for CAS
  docmost-cli page mirror pull <dir> --space {docmost_space}        # embed-bearing candidate — the FAITHFUL read
  ```
  <action>Capture `{{cas_version}}` = the returned `updated_at` (from the `page get` envelope, or the mirror's recorded version). CAS is the DEFAULT for skill writes (CONTRACTS.md §1.3 / cross-cutting invariant 3) — every write below carries `--if-version`.</action>

  <action>Decide the edit shape:</action>

  <check if="the change is the tldr / role-anchored lead">
    <action>Leave the lead untouched. Only the *role-anchored targeting* of the lead is PENDING — not the callout verb itself. The lead must be targeted via its deterministic role anchor (`data-orvex-role="tldr"`), never by index or title-stem (CONTRACTS.md §0.5). The `--role tldr` anchor + the server "find block by role" helper that would make a callout `--op` land precisely on the lead are NOT built yet, so if the change is ONLY the lead, amend the affected body section instead and leave the lead alone; never author the lead positionally.</action>
    <note>The `callout` verb itself IS fully built: `page block callout <slug> --op append|prepend|replace-at|insert-at --type info|success|warning|danger --content … [--if-version]` (placement flag is `--op`; `--type` selects the variant; `--if-version` carries CAS; supports `--if-version`-conditioned writes — see `data/rich-page-authoring.md` and `data/docmost-cli-reference.md`'s `page block` surface). What is missing is ONLY role-anchored find-by-role, so the verb cannot safely single out the `tldr` lead. When a body-section amend legitimately needs a callout block (NOT the role-anchored lead, which stays untouched), the executable form is:
    `docmost-cli page block callout {{candidate_slug}} --op replace-at --type info --content @<text> --if-version "{{cas_version}}"` (preview with `--dry-run`, then `verify render`).
    PENDING is narrow: the `--role tldr` anchor + the server find-block-by-role helper (CONTRACTS.md §2.10 / §0.5) — until they ship, the `tldr` lead is never AI-amended in place.</note>
  </check>

  <check if="exactly one affected section (single substring replacement)">
    <action>Patch in place — a proven in-place substring amend that persists server-side and does not disturb other sections:</action>
    ```bash
    docmost-cli page patch {{candidate_slug}} \
      --find "<old section text>" \
      --replace "<new current-state-only section text>" \
      --if-version "{{cas_version}}"
    ```
    <note>`--once` is implicit (exactly one match required). Use `--regex` for a pattern, `--dry-run` to preview the unified diff first. `--all` only when every occurrence must change.</note>
  </check>

  <check if="multiple PROSE sections must be reconciled">
    <action>Round-trip through the filesystem and edit ONLY the affected prose sections — leave every other section, every embed, and the protected zones byte-for-byte unchanged:</action>
    ```bash
    docmost-cli page mirror pull <dir> --space {docmost_space}
    # edit ONLY the affected PROSE sections in <dir>/{{candidate_slug}}.md (current-state-only)
    docmost-cli page mirror push <dir> --space {docmost_space}
    ```
    <note>`mirror push` diffs against the cache and pushes only changed pages, preserving CAS semantics. But `mirror push` is LOSSY for embeds — it strips embed args (the EMBED-READ LANDMINE, `data/rich-page-authoring.md` §0). So NEVER edit an embed through the mirror markdown and push: do not reconstruct an embed from mirror text, and do not let a mirror push touch a page's embeds. Mirror is for PROSE reconciliation only.</note>
  </check>

  <check if="an embed must be added, repaired, or replaced (diagram / table / chart / callout / task_list / transclusion / linear_*)">
    <action>Author/repair embeds with the `page block` verb against the live page — never via mirror markdown (mirror push strips embed args; the EMBED-READ LANDMINE, `data/rich-page-authoring.md` §0). Pick the embed per the "Embeds by doc-type" table and DIAGRAM POLICY in `data/rich-page-authoring.md`; follow `data/authoring-conventions.md`. Carry `--if-version "{{cas_version}}"`; preview with `--dry-run`; confirm with `verify render`:</action>
    ```bash
    docmost-cli page block <kind> {{candidate_slug}} --op <append|prepend|replace-at|insert-at> [kind args] --if-version "{{cas_version}}" --dry-run
    docmost-cli verify render {{candidate_slug}}
    ```
    <note>For a SIMPLE coloured Excalidraw diagram, ship the adjacent `[bake-pending]` warning callout the diagram policy requires — Excalidraw renders blank until a human opens it and clicks Save & Exit, and doc-ratify surfaces that as a REQUIRED HUMAN TASK. Prefer coloured MERMAID for anything multi-node / must-render-unattended.</note>
  </check>

  <action>ALWAYS (current-state living pages): the amended body says what is true NOW. No "previously / used to / as of / no longer", no in-body changelog. History lives in git + Docmost page history + the server-rendered changelog projection (P4). EXCEPT dated/append version pages (`release-notes` / `retrospective` / `adr`), which are point-in-time records exempt from the P4 obsolescence-narration lint (taxonomy.md §5) — but those are CREATEd as dated children in Step 5, not amended here.</action>

  <check if="any write returns exit 7 / errorCode CONFLICT (--if-version mismatch)">
    <action>The page moved under us. Re-read (`page get --output json --no-daemon` for a guaranteed live read), rebase the edit onto the new body, refresh `{{cas_version}}`, and retry once. If it conflicts again, stop and surface it — do not force-overwrite.</action>
  </check>

  <action>Set `{{action}} = "amended"`, capture `{{page_slug}}` and `{{page_url}}` from the receipt, and GOTO the output step.</action>
</step>

<step n="5" goal="CREATE — only when genuinely new, always at status draft (decision-order §5; P1)">
  <critical>Reachable only from Step 2 (no candidate) or Step 3 (human chose "new"). NEVER `--status canonical` on create — AI authors at draft only. The server-side create-path dup guard is the authoritative draft-vs-draft arbiter; if it refuses, that is a real duplicate signal.</critical>

  <check if="reached from Step 2 — no candidate existed (default create)">
    ```bash
    docmost-cli page create "<Title>" \
      --space {docmost_space} \
      --parent {{ia_parent_slug}} \
      --doc-type <target_doc_type> \
      --status draft \
      --content @<content_unit>
    ```
    <action>Set `{{action}} = "created"`.</action>
    <check if="exit 8 / errorCode DUPLICATE_CANDIDATE (server dup guard blocked the create)">
      <action>The server found a candidate the Step-2 probe missed (e.g. a draft-vs-draft race). Read `matches[]` from the envelope (`{slug, title, status, match_kind, suggested_action}`), set `{{candidate_slug}}` to the suggested page, and RETURN to step 3 (ASK GATE). Do NOT retry blindly and do NOT pass `--force-new` to silence it.</action>
    </check>
    <check if="exit 2 / errorCode BANNED_SLUG_SUFFIX or DATE_SLUG_NOT_ALLOWED">
      <action>The derived title/slug carries a banned suffix (`-v2 … -final / -new / -wip / -copy …`) or a date segment for a non-dated doc_type. This is a P1 sprawl signal: do NOT work around it with a different suffix — the right move is almost always AMEND. Strip the suffix, re-resolve the node (Step 1/2), and amend the existing concept. Dates are permitted only for `release-notes / retro / adr` (validated against doc_type, not slug text).</action>
    </check>
  </check>

  <check if="reached from Step 3 — human explicitly chose 'new' over a known candidate">
    <action>A new page over a known candidate requires a human-attributed token. `--force-new` cannot be satisfied by self-authored prose — an agent cannot approve its own sprawl (CONTRACTS.md §0.3 / §1.2; review MA-1). `--force-new` takes the token as its SINGLE argument (`--force-new "<FORCE_NEW_TOKEN>"` — there is no separate `--human-token` flag; verified against `docmost-cli page create --help`). Carry the token the human's confirmation produced:</action>
    ```bash
    docmost-cli page create "<Title>" \
      --space {docmost_space} \
      --parent {{ia_parent_slug}} \
      --doc-type <target_doc_type> \
      --status draft \
      --content @<content_unit> \
      --force-new "<FORCE_NEW_TOKEN>"
    ```
    <action>Set `{{action}} = "forced_new"`.</action>
    <note>AS-BUILT: the synchronous create-time dup guard + the `--force-new <FORCE_NEW_TOKEN>` path are live (`page create` — CONTRACTS.md §1.2). The token is SERVER-MINTED from the human confirmation — this skill never fabricates it (cross-cutting invariant 2). `--force-new` bypasses the dup guard carrying that human-attributed token and emits a FORCED_NEW audit event; without a valid token the create fails with exit 2 `FORCE_TOKEN_REQUIRED`. A forced-new over a real candidate must still wait for an explicit human decision and must NOT be auto-issued.</note>
    <check if="exit 2 / errorCode FORCE_TOKEN_REQUIRED">
      <action>No valid human token was present. Do NOT mint one and do NOT proceed — return to step 3 and let the human supply the decision/token, or amend the candidate instead.</action>
    </check>
  </check>

  <action>Capture `{{page_slug}}` and `{{page_url}}` from the receipt.</action>

  <action>**Author the P7 embeds the content calls for** (not just prose). `--content @<content_unit>` lands the prose; now add the embeds via the `page block` verb — never hand-write embed markdown. Pick each per the "Embeds by doc-type" table and the DIAGRAM POLICY in `data/rich-page-authoring.md` (diagram for flow/architecture, table/chart for data, callout for gotchas / the header card, task_list for ordered procedures, transclusion for facts already canonical elsewhere, subpages for an index, live `linear_*` for status), following `data/authoring-conventions.md`. Carry `--if-version`; preview with `--dry-run`; then confirm with `verify render`. For a simple coloured Excalidraw diagram, ship the adjacent `[bake-pending]` warning callout the policy requires (doc-ratify surfaces the human Save-&-Exit bake as a REQUIRED HUMAN TASK); prefer coloured MERMAID for anything multi-node / must-render-unattended.</action>

  <action>**Link the new page in (anti-orphan — `data/citations-and-crosslinks.md`).** A fresh page with no inbound link is an orphan. After the create: (1) link the new page into its section landing (`{{ia_parent_slug}}`) — for a dated/append type this is the section's living index landing; (2) add the `↑Part-of` breadcrumb on the new page pointing at its parent (`data/authoring-conventions.md`); (3) verify the link took:</action>
  ```bash
  docmost-cli page backlinks {{page_slug}} --output json   # MUST be non-empty after the link-in
  ```
  <check if="`page backlinks` is empty">
    <action>The link-in did not take — the page is still an orphan. Add the inbound link from the section landing (and the ↑Part-of breadcrumb) before reporting; do not leave a new page unlinked.</action>
  </check>

  <action>The page is at `status: draft` and is quarantined from `ai ask` / grounding reads until ratified — STOP here. Promotion to canonical is `doc-ratify`'s job (decision-order §6), never this skill's.</action>
</step>

<step n="6" goal="Report (the output contract)">
  <action>Emit the JSON output object to the caller (`authored` true only when Step 0 ran; `deferred_followups` carries any out-of-scope subjects the front-stage deferred):</action>
  ```json
  { "page_slug": "{{page_slug}}", "page_url": "{{page_url}}", "action": "{{action}}", "asked": {{asked}}, "authored": {{authored}}, "deferred_followups": {{deferred_followups}} }
  ```
  <output>
    **doc-amend complete.**
    - Action: {{action}}  (amended = updated in place; created = new draft; forced_new = human-approved new draft)
    - Page: {{page_url}}  (status: draft — promotion is a separate human ratification via doc-ratify)
    - Asked the human: {{asked}}
    - Authored from evidence: {{authored}}  (true = the strawman front-stage produced the unit this run)
    - Deferred follow-ups: {{deferred_followups}}  (out-of-scope subjects flagged as candidate future units)
  </output>
  <action>The page is left at `status: draft`. doc-amend never auto-promotes (P6).</action>
</step>

</workflow>

## Error handling

Branch on exit code + the `errorCode` field — never on stderr text.

| Condition | Action |
|---|---|
| `docmost-cli` not on PATH | HALT; tell the user to install/authenticate the CLI |
| `auth status` non-zero (`AUTH_MISSING`) | HALT; tell the user to run `docmost-cli auth login` |
| read exits 3 (`CACHE_STALE`) | re-run `cache sync` once and retry; if still stale, WARN and stop |
| find-before-create pre-probe (`search` / `page list`) unavailable / non-zero | the create-path dup guard (exit 8) is the authoritative backstop; on total probe failure, surface to human rather than create blindly |
| `page create` exits 8 (`DUPLICATE_CANDIDATE`) | read `matches[]`, return to ASK GATE (step 3); never `--force-new` to silence it |
| `page create` exits 2 (`BANNED_SLUG_SUFFIX` / `DATE_SLUG_NOT_ALLOWED`) | P1 sprawl signal — strip the suffix and AMEND the existing concept instead |
| `page create --force-new "<token>"` exits 2 (`FORCE_TOKEN_REQUIRED`) | no valid human token — do not mint one; return to ASK GATE or amend |
| any write exits 7 (`CONFLICT`, `--if-version` mismatch) | re-read live, rebase the edit, retry once; if it conflicts again, stop and surface |
| `FORBIDDEN` (exit 5) | the caller lacks edit permission on the node — surface to the user; do not retry |
| non-interactive context on a candidate | leave the durable comment, do not create a sibling, report a deferred decision |

## Dependencies — what is AS-BUILT vs what remains PENDING

The synchronous create-time dup guard, `--force-new <token>`, and CAS-by-default are **built** and are the primary path above; the fallbacks below are genuine error-handling for when the CLI is absent/old. Only the role-anchored lead targeting and the semantic pre-probe endpoint remain PENDING.

- **AS-BUILT — synchronous create-time dup guard + `--force-new <FORCE_NEW_TOKEN>`** (CONTRACTS.md §1.2) — `page create` runs the draft-inclusive guard (exit 8 `DUPLICATE_CANDIDATE`) and accepts the server-minted human token as the single arg to `--force-new` (exit 2 `FORCE_TOKEN_REQUIRED` without it). This is the primary CREATE path. *Fallback (CLI absent/old):* find-before-create pre-probe + `page create --status draft`, with a forced-new waiting on an explicit human decision.
- **AS-BUILT — `--if-version` CAS by default** (CONTRACTS.md §1.3) — every write above carries `--if-version`; the server enforces CAS for skill writes and returns a `CONFLICT` envelope on a version mismatch.
- **AS-BUILT — `page block callout` (and the rest of the `page block` embed surface)** — the callout verb is fully built (`--op append|prepend|replace-at|insert-at`, `--type info|success|warning|danger`, `--content`, `--if-version`), as is the broader embed authoring surface (`page block` for mermaid/excalidraw/table/chart/task_list/transclusion/linear_* etc.). See `data/rich-page-authoring.md` and `data/docmost-cli-reference.md`. Use these to satisfy P7 on every CREATE/AMEND (Step 0, Step 4, Step 5).
- **PENDING — role-anchored `tldr` targeting: a `--role tldr` anchor + server "find block by role"** (CONTRACTS.md §0.5 / §2.10) — ONLY the find-by-role targeting of the lead is missing, not the callout verb. There is no `--role` flag on the CLI today, so a callout `--op` cannot land precisely on the `data-orvex-role="tldr"` lead. *Until it ships:* leave the `tldr` lead untouched and amend the affected body section (never address the lead positionally).
- **PENDING — `POST /api/orvex/pages/duplicate-check` semantic pre-probe** (CONTRACTS.md §2.4) — a draft-inclusive semantic probe that would let the Step-2 PRE-probe see semantic/unindexed-draft matches before the create attempt. The create-path guard (exit 8) already covers this ground as the backstop; there is no standalone `page duplicate-check` verb. *Now:* FTS (`search --content`) + title (`page list --filter`) pre-probe plus the built-in create-path guard.

This skill never builds tokens, never promotes to canonical, and never creates a sibling for an existing concept.
