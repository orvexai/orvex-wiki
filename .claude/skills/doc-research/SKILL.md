---
name: doc-research
description: "Conduct technical / market / domain research on a topic and land it as DURABLE Tier-A canon (P2): ONE living research doc per topic, updated in place. Drives the web research, synthesises a finished research body, and resolves its own inference-flags, then hands that finished content unit to doc-amend's routing spine (find-before-create → ASK → amend-in-place / create-at-draft) — without author_from_evidence, so doc-amend does not re-author it — into the subject's research IA node (technical → Architecture-ish, market/domain → Product-ish). A SECOND research input on the same topic UPDATES the same living doc rather than spawning a dated sibling. Current-state-only body (no per-run date stamp, no 'as of' narration); authored at draft, promoted via doc-ratify. Use when a human asks to research a topic and capture the findings in the manual."
---

# doc-research

Research is **durable manual canon, not scratch** (P2). A research investigation produces knowledge a reader returns to away from the keyboard, so it lives as **one living doc per topic** in the project's manual — updated in place, never re-run into a dated sibling. This skill is the research-gathering driver that does the web search, synthesises a finished research body, resolves its own inference-flags, then hands that finished unit to the routing spine so it lands correctly.

This skill is a **thin orchestrator**. It does the one thing that is genuinely its own — drive the topic's research, synthesise the findings into a finished unit, and flag-resolve it — and then delegates everything durable:

- **The finished research unit is find-before-created and amended-in-place by `doc-amend`** (its routing spine, Steps 1–5). doc-research is the research driver: it does the web research doc-amend cannot do, authors the finished body, and resolves its own web-research inference-flags (P3) — then hands doc-amend a **supplied, finished `content_unit`** (NOT `author_from_evidence`, which would re-author from code+wiki and discard the web research). doc-amend then runs find-before-create across drafts AND canonical, ASKs one plain-English question on a fuzzy match, and either amends the one living topic doc in place or creates a fresh draft.
- **The body shape is `{project-root}/_bmad/doc/data/doc-type-templates/research.md`** — the research doc-type template (subject / key findings / evidence & sources / implications / open questions). doc-research never invents a body skeleton.
- **Promotion is `doc-ratify`'s job** — AI authors at `draft`; a human moves it to `canonical`. doc-research never self-promotes (P6).
- **The placement is project-derived** — the research IA node is resolved from the project's `manual-outline.yaml`, by subject. The module hardcodes no section.

The defining behaviour — and the whole reason research is durable, not ephemeral — is **one living doc per topic**: a second (or third) research input on a topic that already has a doc **UPDATES that doc in place** (`action: amended`), never a `<topic>-2026-05` sibling. That is the expected outcome on the second-and-later run. The body always reads as current-state-only: no per-run date stamp, no "as of <date>" narration, no in-body history — what we know about the topic *now* (P4).

## What this skill owns vs what it delegates

| Concern | Owner | Note |
|---|---|---|
| Drive the topic's web research, synthesise a finished body, flag-resolve it | **this skill** (Step 2–3) | the one genuinely-own capability — web research doc-amend cannot do |
| Route subject → research IA node (technical/market/domain) | **this skill** (Step 1) resolved against `manual-outline.yaml` | project-derived IA; no hardcoded section |
| find-before-create, ASK, amend-in-place, create-at-draft over the supplied unit | `skill:doc-amend` (routing spine; NOT `author_from_evidence`) | the durable routing spine — never re-implemented here |
| Body shape | `{project-root}/_bmad/doc/data/doc-type-templates/research.md` | used by this skill to author the finished unit |
| Draft → canonical promotion | `skill:doc-ratify` | a human act; never self-promoted |
| P2 (research is durable) + the constitution | `skill:doc-session-policy` | loaded as a session fact |

## Conventions

- Bare paths (e.g. `references/guide.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.
- The `docmost-cli` CLI is the only sanctioned interface to the manual. Always pass `--output json` and branch on the exit code and the `errorCode` field — never on stderr text (CONTRACTS §0.4).

## Inputs (the contract)

| Input | Meaning |
|---|---|
| `space` | The manual's space slug (config key `docmost_space`). |
| `research_topic` | The subject to investigate — the *concept*, which becomes the one living doc. Topic-level, not a dated occurrence. |
| `research_scope` | Optional one-line scope statement bounding the investigation: what this research must cover (and deliberately leaves out). If absent, Step 2 asks for it (P3 — one question), and the bounded scope is baked into the finished unit before handoff. |
| `research_type` | `technical \| market \| domain`. Decides the IA routing (taxonomy.md §4 — research routes by subject, many-to-one): `technical` → an Architecture-facing research node; `market` / `domain` → a Product-facing research node. The subject ultimately decides; this is the default lens. |

## Outputs (the contract)

```json
{ "page_slug": "<slug>", "page_url": "<url>", "action": "created|amended" }
```

- `action: amended` — an existing living topic doc was updated in place. **This is the expected outcome on the second-and-later input for a topic** (one living doc per topic, P2). Also the outcome whenever find-before-create resolves an existing doc on the first run.
- `action: created` — no doc existed for this topic; a fresh page was created at `status: draft`.

The page is always left at `status: draft`. Promotion to `canonical` is a separate human act via `doc-ratify` — never performed here (P6).

## Never (the hard guardrails)

- **Never** routes research to a local repo path or treats it as ephemeral. Research is durable Tier-A manual canon (P2) — it lands in the wiki, not in `<work-output>/`. (This is the explicit correction of the pre-doctrine "Tier C — do not publish" treatment.)
- **Never** spawns a dated sibling for a topic that already has a doc (`<topic>-research-2026-05`, `<topic>-v2`). A second research input on a topic **amends the one living doc in place** (P1/P2). A banned-suffix/date-slug refusal from the server is a sprawl signal, not a renaming puzzle.
- **Never** writes a per-run date stamp, an "as of <date>" line, a "this update adds…" note, or an in-body changelog into the body. The body is current-state-only — what we know about the topic now (P4). History lives in git + Docmost page history + the server-rendered changelog.
- **Never** creates or promotes a page at `--status canonical`. AI authors at `draft`; promotion is `doc-ratify`'s job, server-guarded (P6).
- **Never** re-implements the routing spine. find-before-create, the one-question amend-vs-new ASK, amend-in-place, create-at-draft all live in `doc-amend`. doc-research composes them; it does not duplicate them. (Authoring the research body and flag-resolving it IS doc-research's own job — doc-amend cannot do the web research, so it does not re-author the supplied unit.)
- **Never** launders unverified web prose into the body as fact. Every finding is evidenced (a cited source) or it is an inference-flag doc-research surfaces as one plain-English question (Step 3) and resolves before the unit is handed off — never an unflagged guess. (doc-amend authors from code+wiki only and does not do web search, so it cannot resolve a web-research inference; that is why doc-research owns its own flagging.)

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

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim. At minimum this loads `skill:doc-session-policy` (the constitution — **P2: research is durable, not ephemeral**) and `file:_bmad/doc/data/taxonomy.md` (the research doc-type and the subject-routing rule — taxonomy.md §4: research routes by subject, many-to-one — market/domain → Product-ish, technical → Architecture-ish).

### Step 4: Load Config

Load `{project-root}/_bmad/doc/config.yaml` and resolve:

- `docmost_space` — the manual's space slug.
- `docmost_manual_root_slug` — the manual root, entry point for IA-node resolution.
- `docmost_manual_outline` — path to this project's `manual-outline.yaml` (the project-derived IA).

If `docmost_space` is missing, HALT and tell the user the manual is not configured. If `docmost_manual_root_slug` / `docmost_manual_outline` is missing, the manual is not yet scaffolded — surface that and stop (run `manual-scaffold` first, via Marian's `SCAFFOLD`).

### Step 5: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order. Activation is complete; do not begin the main workflow until every activation step has run in order.

## Pre-flight (always, before the workflow)

```bash
docmost-cli auth status --output json     # exit non-zero → HALT; tell user to run `docmost-cli auth login`
docmost-cli cache sync --space {docmost_space}   # so doc-amend's find-before-create dup-guard + CAS reads are current
```

Branch on the exit code + the `errorCode` field. Never parse stderr text.

**Web search required.** This skill does live research; if web search is unavailable in the running context, do NOT fabricate findings — surface that research cannot proceed and stop. The one narrow exception: when web search is unavailable, synthesis may proceed ONLY from in-repo / in-wiki evidence that can be cited (code paths read via Grep/Glob/Read; manual pages via `docmost-cli search --cached --content`) — and then every finding MUST carry a checkable in-repo/in-wiki source. A research doc with no checkable sources is not durable canon; do NOT launder the model's own prior knowledge ("knows it cold") into the body as fact. Any claim that cannot be cited is not a finding — it is an inference-flag doc-research's own Step-3 ASK must resolve before it enters the body, or it is dropped. If neither web nor citable in-repo/in-wiki evidence is available, stop.

## Execution

<workflow>

<step n="1" goal="Resolve the research topic and route it to the subject's research IA node (project-derived IA)">
  <action>Take `research_topic`, `research_scope` (if given), and `research_type` from the input. The topic is the **concept** — it becomes the one living doc, at topic granularity, never a dated occurrence.</action>
  <action>Read `{docmost_manual_outline}` and find the IA node that hosts `doc_type: research` for this subject. Research is a **many-per-project** doc-type, so match on subject as well as doc-type. Route by `research_type` (taxonomy.md §4 — research routes by subject, many-to-one):
    - `technical` → an **Architecture-facing** research node (system design, stack, integration, build trade-offs).
    - `market` / `domain` → a **Product-facing** research node (audience, competition, the bet, the domain).
  The subject ultimately decides; `research_type` is the default lens. The module hardcodes no section — this is the project's own IA. Record the resolved `{{research_parent_node}}` (the IA parent where a new research child would land).</action>
  <check if="the outline has no node mapping doc_type research for this subject">
    <action>Do NOT invent a section. Surface to the human that the manual's IA has no home for research of this type, and recommend running Marian's `SCAFFOLD` to add one. Stop. (The IA is project-derived and human-confirmed — never auto-created here.)</action>
  </check>
</step>

<step n="2" goal="Establish the research plan (one crisp scope question, only if scope was not supplied) (P3)">
  <critical>One plain-English question, only when `research_scope` is genuinely absent. Not a form, not a multi-axis confirmation ritual (the pre-doctrine workflow's "✅ Architecture / ✅ Implementation / ✅ Stack…" checklist is exactly the friction we are removing). If a sensible scope can be inferred from the topic, infer it and proceed.</critical>
  <ask>If `research_scope` was not supplied: "On «{research_topic}»: in one or two sentences, what should this research answer, and what does it deliberately leave out?" Wait for the reply; it bounds the investigation. Anything out of scope is recorded in `{{deferred_followups}}` as a candidate future research topic, never wedged into this doc.</ask>
  <action>Set the bounded scope from the supplied `research_scope` or the answer. It bounds the Step-3 research and is baked into the finished unit, so doc-amend (which receives a finished `content_unit`, not a topic/scope to author) never re-asks it.</action>
</step>

<step n="3" goal="Drive the research and synthesise the findings (this skill's one genuinely-own capability)">
  <critical>This is the research-gathering work doc-research exists to do. It produces a synthesised, source-backed, **finished content unit** — the research body itself — and resolves its own inference-flags (below) before handing it off. doc-amend does NOT re-author it: it runs only its routing spine (find-before-create → ASK → amend-in-place / create-at-draft) over the supplied unit. Synthesise on the body shape of `{project-root}/_bmad/doc/data/doc-type-templates/research.md`: subject, key findings (lead-with-the-answer), evidence & sources (one row per source with an honest strength label), implications (so-what, for product and/or architecture), open questions.</critical>

  <action>Run the live research within the bounded scope. Fan out web searches across the topic, fetch the strongest sources, and prefer current, primary, multiply-corroborated sources over a single secondary claim. For a project-internal technical topic, also gather code/wiki evidence (Grep/Glob/Read on the repo; `docmost-cli search "<topic>" --cached --content --space {docmost_space} --output json` on the manual) so the findings are grounded in *this* project, not just the open web.</action>
  <note>A deep, adversarially-verified multi-source pass is available via the `deep-research` harness when the topic warrants it; for a focused technical/market/domain question, a direct fan-out + fetch + corroborate pass is enough. Either way, capture for each finding the source(s) it rests on and an honest confidence label (strong / suggestive / anecdotal) — that evidence table is what makes the doc durable, checkable canon.</note>

  <action>**Synthesise — current-state-only, no run narration.** Write the findings as what we know about the topic *now*. Lead with the single most decision-relevant conclusion (the inverted-pyramid "in short"). Each key finding stands alone and is independently checkable against its cited source. Translate findings into implications for the product and/or architecture. List what the research did not settle as open questions. **No** per-run date stamp, **no** "as of <date>", **no** "this run found / previously we thought" narration, **no** in-body changelog (P4) — the synthesis reads as finished current-state prose.</action>

  <action>**Resolve inference-flags HERE, before handing the unit off (P3).** doc-research owns the web research, so it also owns flagging the inferences that research produced — doc-amend's Step-0 strawman front-stage authors from code + wiki evidence and does **not** do web search, so it cannot resolve a web-research inference and will be skipped (we hand it a finished unit; see Step 4). Walk the synthesis. Where a finding is an inference the evidence does not directly support, two sources disagree, or you picked one reasonable reading among several, queue a plain-English question. Then ask exactly ONE at a time — highest-impact first (structural/scope/naming before minor author-choice) — wait for the reply, fold it into the synthesis, and only then ask the next. Be selective: if a point can be sensibly defaulted, default it; reserve questions for what the human genuinely must decide. If an answer says a point is out of scope, record it in `{{deferred_followups}}` and drop it from this unit — do not wedge it in. Never stack questions; never launder an un-evidenced claim into the body as fact.</action>
  <check if="the calling context cannot suspend for the chat questions (non-interactive handoff)">
    <action>Do NOT guess past a flag. Keep only the evidenced portions in the synthesis, and carry the open flags as a deferred decision to the report so a human resolves them before the doc is promoted (doc-ratify). Never launder an unanswered inference into the body.</action>
  </check>
  <action>**Hold the flagged-and-resolved synthesis as the finished `content_unit`** (in memory or a temp file). It now carries only evidenced or human-resolved claims, current-state-only, on the `research.md` body shape — a clean finished unit ready for doc-amend's routing spine.</action>
</step>

<step n="4" goal="Route the finished research unit through doc-amend's routing spine (find-before-create → ASK → amend-in-place → create-at-draft)">
  <critical>This is the delegation. doc-research does NOT write the page itself — it hands the **finished, flag-resolved synthesis** (Step 3) to `doc-amend` as a supplied `content_unit`, **WITHOUT** `author_from_evidence`. That is deliberate: doc-amend's Step-0 strawman front-stage authors from code + wiki evidence and does NOT do web search, so setting `author_from_evidence` would re-author from zero and discard doc-research's web research. With `content_unit` supplied and `author_from_evidence` unset, doc-amend SKIPS Step 0 (its own contract: "When the caller already supplied a finished `content_unit`… SKIP straight to Step 1") and runs only its routing spine over the supplied unit: find-before-create across drafts AND canonical, the one-question ASK on a fuzzy topic match, amend-in-place on an existing topic doc, and create-at-draft when genuinely new. This is exactly where "one living doc per topic" is enforced — a second research input on the topic resolves the SAME doc and amends it (`action: amended`).</critical>

  <action>Invoke `skill:doc-amend` with the finished unit (no `author_from_evidence` — doc-research already authored and flag-resolved it):</action>
  ```json
  {
    "content_unit": "<the finished, flag-resolved research body from Step 3, on the research.md body shape>",
    "target_doc_type": "research",
    "space": "{docmost_space}",
    "parent_hint": "<research_parent_node from Step 1>"
  }
  ```
  <note>`content_unit` is the finished research body doc-research authored and flag-resolved in Step 3 — doc-amend treats it as a supplied unit and does NOT re-author it (no `author_from_evidence`, so its Step 0 is skipped). `target_doc_type: research` makes doc-amend resolve the research IA node by subject and apply the `research.md` body shape's placement rules. `parent_hint` is the Step-1 routing; doc-amend re-resolves it authoritatively against the outline (a tiebreaker, not an override). The scope from Step 2 is already baked into the finished unit, so doc-amend does not re-ask it.</note>

  <action>doc-amend executes the routing spine and returns `{ page_slug, page_url, action, asked, authored, deferred_followups }`. Capture `page_slug`, `page_url`, `action`. `authored` is `false` (doc-amend did not author the supplied unit) and `deferred_followups` is empty (doc-amend's Step 0 did not run) — the out-of-scope follow-ups for this run are the ones doc-research itself recorded in Step 2/Step 3 (`{{deferred_followups}}`); merge in anything doc-amend happens to return.</action>

  <check if="doc-amend returns action: amended">
    <action>The one living topic doc was updated in place — the desired P2 outcome (always so on a second-and-later research input for the topic). Carry `page_slug`, `page_url`, set this skill's `{{action}} = "amended"`.</action>
  </check>
  <check if="doc-amend returns action: created">
    <action>No prior doc existed for this topic; a fresh research page was created at `status: draft`. Carry `page_slug`, `page_url`, set `{{action}} = "created"`.</action>
  </check>
  <check if="doc-amend returns action: forced_new">
    <action>A human explicitly chose a separate page over a known candidate (a deliberate split, e.g. "technical research" vs "market research" on a related-but-distinct topic). Carry the slug/url; report it as `created` in this skill's contract output (the page is a new living research doc), and note the human-chosen split in the report.</action>
  </check>
  <check if="there are deferred follow-ups (out-of-scope subjects doc-research deferred in Step 2/Step 3)">
    <action>Carry `{{deferred_followups}}` to the report as candidate future research topics. Do NOT wedge them into this doc and do NOT auto-spawn docs for them — a future research topic is a future `doc-research` run a human can choose to start.</action>
  </check>
  <check if="doc-amend's own ASK gate cannot suspend for a human reply (non-interactive handoff on a fuzzy candidate)">
    <action>doc-amend leaves its durable comment, does NOT create a sibling, and reports `asked: true` with a deferred decision (its own contract). Surface that deferred amend-vs-new decision in the report so a human resolves it. Research inference-flags are already resolved upstream in Step 3 — if Step 3 itself could not suspend, those flags are carried as a deferred decision per Step 3's non-interactive branch, not re-raised here.</action>
  </check>
</step>

<step n="5" goal="Hand off to ratification — do NOT self-promote (P6)">
  <critical>The research doc is at `status: draft`. doc-research NEVER promotes it. Promotion to `canonical` is a separate human act through `doc-ratify`, which asks one plain-English question and transports the server-minted `RATIFY_TOKEN`. doc-research only authors; it does not certify its own writing (P6).</critical>
  <action>Recommend `doc-ratify` to the human to promote the draft when the findings are ready. Do not invoke a canonical write here. The promotion call (`docmost-cli page update <slug> --status canonical --ratify-token <T>`) is performed by `doc-ratify`, not this skill — it is shown only for the contract.</action>
  <note>Until ratified, the research draft is quarantined from grounding/`ai ask` reads (PENDING server-side; CONTRACTS §2.8) — so an unreviewed research finding never silently feeds another agent's reasoning. Prefer ratifying promptly so the live research canon stays trustworthy (P6).</note>
</step>

<step n="6" goal="Report (the output contract)">
  <action>Emit the contract output to the caller:</action>
  ```json
  { "page_slug": "{{page_slug}}", "page_url": "{{page_url}}", "action": "{{action}}" }
  ```
  <output>
    **doc-research complete.**
    - Topic: «{research_topic}» ({research_type})
    - Action: {{action}}  (amended = the one living research doc updated in place — expected on a second-and-later input for this topic; created = a fresh research draft)
    - Page: {{page_url}}  (status: draft — promotion is a separate human ratification via doc-ratify)
    - Deferred research follow-ups: {{deferred_followups}}  (out-of-scope subjects flagged as candidate future research topics)
  </output>
  <action>The page is left at `status: draft`. doc-research never auto-promotes (P6). Recommend `doc-ratify` to promote when ready.</action>
</step>

</workflow>

## Error handling

Branch on the exit code + the `errorCode` field — never on stderr text (CONTRACTS §0.4).

| Condition | Action |
|---|---|
| `docmost-cli` not on PATH | HALT; tell the user to install/authenticate the CLI |
| `auth status` non-zero (`AUTH_MISSING`) | HALT; tell the user to run `docmost-cli auth login` |
| `docmost_space` missing in config | HALT; the manual is not configured |
| `docmost_manual_root_slug` / `docmost_manual_outline` missing | Manual not scaffolded — recommend Marian's `SCAFFOLD`; stop |
| outline has no research node for the subject | Do NOT invent a section — recommend `SCAFFOLD` to add one; stop |
| web search unavailable | Do NOT fabricate findings — surface that research cannot proceed; stop |
| `cache sync` exits 3 (`CACHE_STALE`) | re-run once; if still stale, WARN and proceed (doc-amend reads the freshest cache) |
| doc-amend returns a duplicate/banned-suffix/date-slug signal | a P1/P2 sprawl signal — this is doc-amend's routing-spine ASK/AMEND path; the correct outcome is amend the existing topic doc, NOT a dated sibling. doc-amend handles it; surface the resolution in the report |
| non-interactive context on a research inference-flag (Step 3) | keep only the evidenced portions, carry the open flags as a deferred decision, surface them — never guess past a flag, never promote until resolved |
| non-interactive context on doc-amend's amend-vs-new ASK | doc-amend leaves its durable comment, does not create a sibling, reports a deferred decision; surface it |

## Dependencies — what this skill leans on (all AS-BUILT or owned by composed skills)

- **`skill:doc-amend` (routing spine — a supplied `content_unit`, NOT `author_from_evidence`)** — the durable routing spine. doc-research hands it a **finished** research unit, so doc-amend SKIPS its Step-0 strawman front-stage (its own contract skips Step 0 when a `content_unit` is supplied) and runs only find-before-create across drafts AND canonical, the one-question amend-vs-new ASK on a fuzzy topic match, and amend-in-place or create-at-draft. **This is where "one living doc per topic" (P2) is enforced** — doc-research is the research-gathering driver in front of it, never a re-implementation of it. doc-research does NOT pass `author_from_evidence`: that front-stage authors from code+wiki and does no web search, so it would discard the web research.
- **`{project-root}/_bmad/doc/data/doc-type-templates/research.md`** — the research body shape (subject / key findings / evidence & sources / implications / open questions). doc-research authors the finished unit on this shape; never re-invented here.
- **`skill:doc-ratify`** — draft → canonical promotion via one-question human ratification + server-minted `RATIFY_TOKEN`. doc-research never self-promotes (P6).
- **`skill:doc-session-policy`** — the constitution, carried as a session fact. **P2 is the load-bearing principle here: research is durable manual canon, not ephemeral.**
- **`docmost-cli` CLI** — `auth status`, `cache sync`, `search --cached --content` (doc-research's own citable in-repo/in-wiki evidence probe AND doc-amend's find-before-create probe), `page create … --status draft` and `page patch … --if-version` (doc-amend's create/amend), `page update --status canonical --ratify-token` (doc-ratify's promotion, not this skill's). Always `--output json`; branch on exit/`errorCode`.
- **The `deep-research` harness** — available for an adversarially-verified multi-source pass when a topic warrants the depth; the direct fan-out/fetch/corroborate pass in Step 3 suffices for a focused question.

This skill never dates a research doc, never spawns a sibling for a topic that already has one, never promotes to canonical, and never re-implements the routing spine. It drives the research and authors the finished, flag-resolved unit; the durable routing/dedup/CAS capability lives in `doc-amend` + `docmost-cli` + the server.
