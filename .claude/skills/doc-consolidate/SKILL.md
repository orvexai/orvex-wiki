---
name: doc-consolidate
description: "The living-wiki anti-mess pass (Goal 1). Detect clusters of pages covering the same concept across drafts AND canonical, and for each CONFIDENT duplicate cluster pick the live successor and retire the loser(s) WHOLE-DOC to archive with two-sided supersession links (P5). No partial in-page merge, no dates-as-winner heuristic, no /Suspense tree, no vibrant rewrite, no learning-log. Ambiguous clusters are surfaced to the human as one plain-English question (P3) and returned for decision — never auto-merged. Nothing is silently dropped or deleted. Use when the user asks to clean up duplicates, deduplicate the manual, or run a consolidation pass."
---

# doc-consolidate

The **anti-mess pass** (PLAN Goal 1). One concept is meant to have exactly one live page (P1); over time a manual still accretes near-duplicate pages — a draft authored before its canonical was found, two pages on the same concept seeded by different planning passes. This workflow finds those clusters and resolves the **confident** ones by **whole-doc supersession** (P5): pick the live successor, retire the loser(s) to archive, link both sides. The **ambiguous** ones it never touches — it surfaces each as one plain-English question and hands them back for a human decision.

This skill is a **thin orchestrator**. The durable work lives elsewhere and is composed, never re-implemented:

- **Detection** is the server's duplicate engine (`verify duplicates`, detection-only) for candidate clusters and per-member similarity, plus a conservative concept-identity judgement made from a direct body read (`page get`) of each member — this skill never hand-rolls title/content similarity.
- **Retirement** is Marian's **manual-supersede** named procedure (the transclusion-impact preflight, the atomic two-sided supersede, the optional redirect). `doc-consolidate` decides *which* page wins each confident cluster and dispatches that procedure per loser; it does not write the supersession edges itself.
- The dup logic it reuses conceptually is `doc-amend`'s find-before-create — the same conservative "is this the same concept?" judgement (an FTS+title probe + the create-path dup guard, no duplicate-check endpoint), asked across a whole space instead of for one incoming unit.

It enforces **P1** (one living page per concept, no dated sprawl), **P3** (ambiguity is one plain-English question, never an auto-merge), **P5** (supersession is whole-doc, to archive only — a live doc holds zero superseded content, there is no partial in-page merge), and **P6** (it never self-promotes a draft to canonical; a draft that wins a cluster stays a draft for `doc-ratify`).

## What this skill is NOT (the pre-doctrine traps it deliberately does not fall into)

The capability this serves was previously a sprawling "comprehensive consolidate + vibrant rewrite" workflow. This re-authoring keeps the *anti-mess goal* and discards every mechanism that violated the constitution:

- **No partial in-page merge.** Losers are NOT rewritten section-by-section into the winner. Supersession is whole-doc to archive (P5). The winner is left exactly as it is — content reconciliation, if any is genuinely needed, is a separate `doc-amend` the human can request afterward, never a silent merge here.
- **No dates-as-winner heuristic.** The winner is NOT "the newest `updated_at`" or "the longest body" or "the most history versions". Recency and length are weak, gameable signals. The winner is chosen by living-register fitness (see Step 4), and any cluster where the successor is not unambiguous is ambiguous → human question.
- **No `/Suspense/` tree.** Ambiguous clusters are NOT moved into a quarantine subtree of wrapper pages. They are returned in `deferred_ambiguous[]` with a plain-English rationale; the pages stay exactly where they are, untouched.
- **No vibrant rewrite.** This skill writes no bodies, adds no callouts/emoji/diagrams, restructures nothing. It supersedes; it does not author.
- **No learning-log YAML.** There is no `consolidation-decisions.yaml`, no `generalizable_rule`, no confidence-threshold auto-promotion of "learned" patterns into auto-merges. Every confident merge is justified inline at run time; every ambiguous one goes to a human. The system does not teach itself to auto-merge more aggressively over time.
- **No 30-day grace gate, no migration-staging drain, no cross-space scope.** Those were migration-coupling artifacts. This pass operates on one space's live manual, now.
- **No blind auto-supersede mode of `verify duplicates`.** No such mode is sanctioned for this pass; `verify duplicates` is used for DETECTION only. Any blind supersede toward a server-chosen canonical would bypass the human question, the whole-doc discipline, and the chosen-successor logic — so it never runs here. Detection only.

## Conventions

- Bare paths (e.g. `references/guide.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.
- The `docmost-cli` CLI is the **only** sanctioned interface. Always pass `--output json` and branch on the exit code and the `errorCode` field — never on stderr text.

## Inputs (the contract)

| Input | Meaning |
|---|---|
| `space` | The manual's space slug (config key `docmost_space`). The pass operates within this one space — never cross-space. |
| `topic` / `scope` | Optional. A subject or one-line scope statement that bounds the pass to clusters touching that topic, instead of the whole space. When absent, the pass covers the whole space. |

## Outputs (the contract)

```json
{
  "clusters": [
    { "winner_slug": "<slug>",
      "superseded": ["<loser_slug>", "..."],
      "redirects": ["<loser_slug>", "..."],
      "asked": false }
  ],
  "deferred_ambiguous": [
    { "cluster_members": ["<slug>", "..."],
      "reason": "<one-line plain-English ambiguity>",
      "question_asked": "<the one question surfaced, if any>" }
  ]
}
```

- `clusters[]` — every CONFIDENTLY resolved cluster. Each has exactly one `winner_slug` (the live successor) and one or more `superseded[]` losers, each retired **whole-doc** via `manual-supersede`. `redirects[]` lists losers a redirect was stamped for (optional). `asked` is true only if a one-question confirmation fired for that cluster.
- `deferred_ambiguous[]` — every cluster the skill would not resolve on its own. Each carries the member slugs, a one-line reason, and the question surfaced to the human (if a question was asked this run). These pages are **untouched** — not moved, not superseded, not deleted. They wait for a human decision.
- Every retirement is a whole-doc supersede. Nothing is silently dropped or deleted.

## Never (the hard guardrails)

- **Never** partially merges loser content into the winner. Retirement is whole-doc to archive (P5). No section-by-section merge, ever.
- **Never** picks the winner by `updated_at` / body length / version count alone. Those are weak signals (Step 4); an unclear successor is an ambiguous cluster, not a guess.
- **Never** auto-merges an ambiguous cluster. Ambiguity → one plain-English question → if still unclear, defer to `deferred_ambiguous[]`. Never stack questions; never proceed past a genuine ambiguity (P3).
- **Never** moves pages into a `/Suspense/` tree, writes wrapper pages, or authors/rewrites any body. This skill supersedes; it does not author.
- **Never** promotes a draft to canonical. If the live successor of a cluster is itself a draft, it stays a draft — promotion is `doc-ratify`'s job (P6). A draft can still win a cluster (a draft on the topic is a real candidate, exactly as in `doc-amend`).
- **Never** uses any blind auto-supersede mode of `verify duplicates` (none is sanctioned). Detection only.
- **Never** supersedes without the transclusion-impact preflight `manual-supersede` performs. Silent reference breakage is the exact failure this prevents.
- **Never** deletes a page. Supersede to archive; the archived loser keeps a two-sided link to its successor.

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

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim. At minimum this loads `skill:doc-session-policy` (the constitution — P5 is the governing principle for this skill) and `file:_bmad/doc/data/decision-order.md` (branch (9) SUPERSEDE is the branch this skill drives).

### Step 4: Load Config

Load `{project-root}/_bmad/doc/config.yaml` and resolve:

- `docmost_space` — the manual's space slug.
- `docmost_manual_root_slug` — the manual root (so a cluster member can be located in the IA).
- `docmost_manual_outline` — path to this project's `manual-outline.yaml` (the project-derived IA).

If `docmost_space` is missing, HALT and tell the user the manual is not configured. If `docmost_manual_root_slug` / `docmost_manual_outline` is missing, the manual is not yet scaffolded — there is nothing to consolidate; surface that and stop.

### Step 5: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order. Activation is complete; do not begin the main workflow until every activation step has run in order.

## Pre-flight (always, before the workflow)

```bash
docmost-cli auth status --output json     # exit non-zero → HALT; tell user to run `docmost-cli auth login`
docmost-cli cache sync --space {docmost_space}   # so detection + dup probe + CAS reads are current
```

Branch on the exit code + the `errorCode` field of the JSON envelope. Never parse stderr text. (Exit/`errorCode` table: `docmost-cli-reference.md` §"Exit codes & error envelope".)

## Execution

<workflow>

<step n="1" goal="DETECT clusters of same-concept pages across drafts AND canonical (P1)">
  <critical>Detection is the server's job, not this skill's. Do NOT hand-roll title/content similarity. Run the duplicate engine in DETECTION mode only — never any blind auto-supersede mode (none is sanctioned), which would supersede toward a server-chosen canonical and bypass the chosen-successor logic and the human question.</critical>

  <action>Read the server's pre-computed semantic duplicate clusters for the space (detection only). `--status open` returns clusters a human has NOT already dismissed — so a cluster judged "distinct, leave alone" on a prior pass does not re-surface every run:</action>
  ```bash
  docmost-cli verify duplicates --space {docmost_space} --engine server --status open --output json
  ```
  <note>`--engine server` reads the server's pre-computed clusters (embeddings + reranker sweep) and EXCLUDES already-superseded pages — so a prior consolidation's losers do not resurface. Each cluster carries a `cluster_id`, a cluster-level `top_similarity`, and per-member `similarity_to_canonical`. This is real embedding signal — far stronger than string heuristics.</note>
  <critical>NEVER widen to `--status all` for the consolidation pass. `--status dismissed` lists clusters a human already judged "distinct, leave alone" and `--status all` includes them; both would RE-SURFACE the exact clusters a human asked you to stop asking about, re-firing the Step-5 question every run. Use `--status open` only. (The dismissed-status carve-out is what makes the anti-mess pass idempotent across runs — a Step-5 "they are distinct" answer is recorded durably so the same cluster is never re-raised.) `--status dismissed` / `--status all` are diagnostic-only — read them if a human asks "what did we dismiss and why", never to drive supersession. (Statuses: `docmost-cli-reference.md` §`verify duplicates`.)</critical>
  <check if="exit non-zero / errorCode indicates the server engine is unavailable (no AI provider, or no sweep has run)">
    <action>Fall back to the offline engine (regex suffix patterns + Jaccard body similarity). It is the FALLBACK, not the default; note the degraded detection in the run report. It INCLUDES superseded pages, so filter those out before clustering.</action>
    ```bash
    docmost-cli verify duplicates --space {docmost_space} --engine local --mode content --output json
    ```
  </check>

  <action>The duplicate engine indexes canonical and draft pages alike — a draft sibling on a concept is a real cluster member (the P1 failure this pass fixes). Keep clusters with N ≥ 2 members. A singleton (N = 1) is healthy by definition — drop it (this is consolidation, not a freshness or orphan sweep).</action>

  <check if="a `topic` / `scope` bound was supplied">
    <action>Keep only clusters with at least one member matching the topic. Use a cheap probe to bound membership when the topic is not already obvious from cluster titles:</action>
    ```bash
    docmost-cli search "<topic>" --cached --content --space {docmost_space} --output json
    ```
  </check>

  <check if="no clusters of N ≥ 2 remain">
    <action>The manual is clean (no detectable duplicates in scope). Report a clean pass — `clusters: []`, `deferred_ambiguous: []` — and STOP.</action>
  </check>
</step>

<step n="2" goal="CONFIRM each cluster is a genuine same-concept duplicate (the dup arbiter; the same conservative judgement doc-amend's find-before-create makes, applied space-wide)">
  <critical>A `verify duplicates` cluster is a CANDIDATE, not proof. Two pages can rank similar on page-level embeddings yet be genuinely distinct concepts (a how-to and its reference; a parent and its child). Confirm before treating a cluster as a duplicate set, using the signals that are BUILT today — never on a single similarity number alone.</critical>

  <action>The same-concept judgement here is the one `doc-amend`'s find-before-create makes — its FTS+title probe plus the built-in create-path dup guard (exit 8 `DUPLICATE_CANDIDATE`) — except asked **space-wide across an already-existing cluster** rather than for one incoming unit. doc-amend never calls a duplicate-check endpoint; neither does this step. The confirmation rests on two BUILT signals already in hand:</action>

  1. **The server-engine similarity already returned by `verify duplicates`** (Step 1): the cluster-level `top_similarity` and per-member `similarity_to_canonical`. This is real embedding signal — a member well below the cluster's same-concept band is a weak member, not a confirmed duplicate.
  2. **Each member's actual body + metadata, read directly.** For each cluster, read every member so the concept-identity judgement, the winner-pick (Step 4), and the human question (Step 5) are accurate:
  ```bash
  docmost-cli page get <member-slug> --output json   # body + status + doc_type + updated_at + supersedes/superseded_by
  ```

  <action>Judge concept identity CONSERVATIVELY from those two signals together: a member is a confirmed same-concept duplicate only when both its similarity sits in the cluster's same-concept band AND its body is genuinely about the same concept (not an adjacent how-to/reference, not a parent/child). Drop any member that fails either test — below a clear threshold it leaves the cluster. Never merge on doubt: an unclear member is removed from the cluster (or, if it leaves the cluster ambiguous, routed to Step 5), never silently treated as a duplicate.</action>

  <action>Discard members that are NOT the same concept. If a cluster drops below N = 2 confirmed same-concept members, it is not a duplicate cluster — drop it.</action>
  <note>PENDING — a draft-inclusive synchronous semantic `POST /api/orvex/pages/duplicate-check` endpoint (CONTRACTS §2.4) would let this step add a direct member-vs-member semantic confirmation. It is UNBUILT and is NOT an `docmost-cli` verb (there is no standalone `page duplicate-check` CLI verb; the synchronous guard that exists is built into `page create`). Skills never speak HTTP, so this step does not POST it; when it ships it would STRENGTHEN the BUILT signals above, not replace them. Until then the `verify duplicates` similarity + a direct body read are the arbiter, exactly as doc-amend's find-before-create relies on its FTS+title probe + the create-path guard.</note>
</step>

<step n="3" goal="CLASSIFY each confirmed cluster — CONFIDENT vs AMBIGUOUS">
  <critical>This is the safety fork. A cluster is CONFIDENT only when ALL of the criteria below hold. Anything else is AMBIGUOUS — it goes to the one-question path (Step 5), never to auto-supersede. When in doubt, it is ambiguous. Never guess a winner.</critical>

  <action>Classify each confirmed cluster as CONFIDENT only when ALL hold:</action>
  - **Same concept, high confidence** — the Step-2 probe confirms every member is the same concept (not merely adjacent).
  - **An unambiguous live successor exists** — exactly one member is clearly the one true page for the concept by living-register fitness (Step 4 defines the criteria). Not "the newest"; the *correct* one.
  - **No factual contradiction between members** — where members overlap, they agree. A contradiction means a human must decide what is true; that is ambiguous, never an auto-merge.
  - **Same `doc_type`** (or losers carry no/compatible `doc_type` and the winner's type is the consistent one). Conflicting real doc-types means the pages may belong on different IA nodes — ambiguous.
  - **No member is itself a supersession anchor for a third concept** (it would tangle two chains) — if so, ambiguous.

  <check if="a cluster meets ALL confident criteria">
    <action>Mark it CONFIDENT. Continue to Step 4 to pick its winner.</action>
  </check>
  <check if="a cluster fails ANY confident criterion">
    <action>Mark it AMBIGUOUS and record the single most material reason in one plain-English line (e.g. "two members give different acceptance criteria — which is current?" or "a how-to and a reference, not duplicates of one concept"). Route it to Step 5. Do NOT pick a winner.</action>
  </check>
</step>

<step n="4" goal="PICK the live successor for each CONFIDENT cluster (living-register fitness, NOT dates)">
  <critical>The winner is the page that is the correct living register for the concept — NOT mechanically the newest `updated_at`, the longest body, or the most history versions. Those signals are gameable and were the pre-doctrine failure mode. Use them only as tie-breakers AFTER the doctrinal criteria below decide.</critical>

  <action>Pick the winner by these criteria, in order:</action>
  1. **Status** — a `canonical` member outranks a `draft` member for the live-successor role (the manual's live page is canonical). If the only fit is a draft, the draft wins the cluster but **stays a draft** (Step 6 routes it to `doc-ratify`; this skill never self-promotes — P6).
  2. **IA fit** — the member sitting at the correct IA node for the concept (per `{docmost_manual_outline}`) is the natural successor; a member parked under the wrong section is a loser even if newer. If the winner's IA node CANNOT be resolved from `{docmost_manual_outline}` — e.g. off-tree members surfaced by the local-engine fallback that map to no outline node — do NOT guess where the concept belongs: treat the cluster as AMBIGUOUS and route it to the Step-5 one-question path. IA placement is then a human call, not an inference.
  3. **Completeness of CURRENT-STATE truth** — the member whose body is the truest current-state description of the concept. (Length is evidence here, never the rule — a longer body padded with stale "previously/used to" narration is *worse*, not better, under P4.)
  4. **Tie-break only** — if still tied, prefer the more recently `updated_at` member. This is the ONLY place recency is consulted, and only to break an otherwise-even tie.

  <check if="the winner is not unambiguous after applying these criteria">
    <action>Demote the cluster to AMBIGUOUS — the successor is genuinely a human call. Record the reason and route it to Step 5. Never flip a coin on the winner.</action>
  </check>
  <action>Set `{{winner_slug}}` and `{{loser_slugs}}` (every other confirmed member) for the cluster.</action>
</step>

<step n="5" goal="ASK GATE — one plain-English question per ambiguous cluster (P3); never auto-merge">
  <critical>Exactly ONE question per ambiguous cluster. Not a form, not a checklist. The question names the members and gives the one-line ambiguity. A confident cluster does NOT pass through here — it goes straight to supersede (Step 6). Confident clusters are silent; only ambiguity asks.</critical>

  <action>For each AMBIGUOUS cluster, compose one plain-English question that names the members and states the single thing the human must decide (which is current / are these even the same concept / which should be the live page).</action>

  <action>Make the question durable so the decision is auditable and survives a suspend (the real verb is top-level `comment add <slug> --body …`, NOT `page comment`):</action>
  ```bash
  docmost-cli comment add <one-cluster-member-slug> \
    --body "doc-consolidate found possible duplicates: «<titles>». <one-line ambiguity>. Which is the live page — or are these distinct?"
  ```

  <action>SUSPEND and surface the SAME one question to the human in chat:</action>
  <ask>I found pages that may cover the same concept: «<member titles>». <one-line ambiguity>. Which should be the live page (the others retire to archive), or are these genuinely distinct pages I should leave alone?</ask>
  <note>Auto-resume from the chat reply. Set the cluster's `asked = true`.</note>

  <check if="the human names a clear winner among the members">
    <action>Set `{{winner_slug}}` to the named page and `{{loser_slugs}}` to the rest. The cluster is now resolvable — treat it as confident and continue to Step 6 with `asked = true`.</action>
  </check>
  <check if="the human says the pages are distinct (not duplicates)">
    <action>Drop the cluster entirely — leave every member untouched. Do NOT record it in `deferred_ambiguous` (it was resolved: they are distinct) and do NOT supersede anything. DISMISS the cluster server-side so it does not re-surface on the next pass (this is what makes Step 1's `--status open` filter durable — without it the same cluster re-fires its question every run):</action>
    ```bash
    docmost-cli verify duplicates --space {docmost_space} --dismiss <cluster_id> \
      --reason "human: distinct concepts, not duplicates" --output json
    ```
  </check>
  <check if="the human wants the winner's body to absorb something from a loser before retirement">
    <action>This is a reconcile-then-retire request. Do NOT merge here (this skill never authors). Record it as a follow-up: recommend the human run `doc-amend` against the winner to fold that content in, THEN re-run this pass (or proceed to supersede now only if they explicitly say the winner already carries everything it needs). Whole-doc supersede still applies — the loser is retired whole, never partially merged (P5).</action>
  </check>
  <check if="the calling context cannot suspend for a human reply (non-interactive handoff)">
    <action>Do NOT guess. Leave the durable comment, supersede NOTHING for this cluster, and record it in `deferred_ambiguous[]` with the reason and the question. A human resolves it later (the comment is the seam). Never auto-supersede over an ambiguous cluster.</action>
  </check>
</step>

<step n="6" goal="RETIRE losers WHOLE-DOC via manual-supersede (P5) — never a partial merge">
  <critical>This is the only mutation this skill performs, and it does NOT perform it directly — it DISPATCHES Marian's manual-supersede procedure (doc-librarian) for every loser. That procedure owns the transclusion-impact preflight, the atomic two-sided supersede, and the optional redirect. Supersession is WHOLE-DOC: the loser moves whole to archive; the winner is left untouched; a live doc holds ZERO superseded content (P5). There is no partial in-page merge here, ever.</critical>

  <action>For each resolvable cluster (confident from Step 4, or human-resolved in Step 5), dispatch `manual-supersede` (via `doc-librarian`) with the winner and its loser(s). The procedure runs, per loser:</action>

  1. **Transclusion-impact preflight** — surfaces what transcludes the loser so the retirement does not silently break live pages. The conflict posture is **block**:
     ```bash
     docmost-cli page transclusion-impact <loser-slug> --operation supersede --output json
     ```
  2. **Atomic two-sided supersede** — writes BOTH sides (`superseded_by` on the loser, `supersedes` on the winner) in one call and flips the loser to `superseded`; archived cards auto-drop from card-grid landings (no dead cards):
     ```bash
     docmost-cli page supersede <winner-slug> --supersedes <loser-slug> \
       --on-transclusion-conflict block --output json
     ```
  3. **Optional redirect** — only if the human asked (or scope policy requests it); stamps the winner's `redirect_from` and enqueues the async inbound-link rewrite:
     ```bash
     docmost-cli page update <winner-slug> --redirect-from <loser-slug> \
       --if-version <updated_at> --output json
     ```

  <note>`page supersede` and `page update` resolve by slug and do NOT accept `--space` (passing it → exit 2 `INVALID_ARGS`). The winner is never rewritten — its body is left exactly as it was; doc-consolidate authors nothing.</note>

  <check if="transclusion-impact reports active references (errorCode TRANSCLUSION_REFERENCES_ACTIVE)">
    <action>Do NOT force the supersede. Per manual-supersede, this becomes a human decision: surface the impacted live pages and DEMOTE this cluster to `deferred_ambiguous[]` with reason "loser is transcluded by active pages — resolve transclusions or confirm unsync first". Never silently break a live transclusion to satisfy the consolidation. (Only with explicit human consent does manual-supersede pass `--on-transclusion-conflict unsync`.)</action>
  </check>
  <check if="page supersede / page update returns exit 7 (CONFLICT, --if-version mismatch)">
    <action>The page moved under us. Re-read the winner's `updated_at`, retry once. If it conflicts again, leave a review comment and demote the cluster to `deferred_ambiguous[]` — do not force-overwrite.</action>
  </check>

  <action>POST-SUPERSEDE LINK CHECK — after the loser(s) are superseded, confirm the retirement did not strand inbound links. The redirect rewrite is ASYNC (Step 6.3 enqueues a `PAGE_SLUG_REWRITE`) and an `--on-transclusion-conflict unsync` retires a transclusion without rewriting its source, so either can leave a live page pointing at a now-archived loser. For EACH superseded loser, list who still links to it (cache-only, no API — `verify links` is per-page/outbound and not space-scoped, so `page backlinks` is the right INBOUND check here):</action>
  ```bash
  docmost-cli page backlinks {{loser_slug}} --output json   # live pages still pointing at the retired loser
  ```
  <check if="`page backlinks` still lists live pages linking to a superseded loser AND a redirect was stamped">
    <action>The async redirect rewrite has not drained yet — this is expected to self-heal (read-time `page resolve-slug` already resolves the loser to the winner). Note it in the run report; do NOT hand-author link fixes here (this skill never authors). Re-running `page backlinks` is the human's confirmation seam once the queue drains.</action>
  </check>
  <check if="`page backlinks` lists live pages linking to a superseded loser and NO redirect was stamped (e.g. an `unsync` retirement)">
    <action>Inbound links are genuinely stranded — surface the impacted source pages in the run report and recommend the human stamp a redirect on the winner (Step 6.3) or run `doc-amend` to re-point the sources. Do not silently leave dangling links; do not auto-rewrite them here.</action>
  </check>
  <note>`page backlinks` is the read-only post-condition check for this mutation; it confirms supersession + redirect/unsync did not strand the link graph. (`docmost-cli-reference.md` §Inspect & navigate.)</note>

  <action>Record the resolved cluster in `clusters[]` with `{{winner_slug}}`, the `superseded[]` losers, any `redirects[]`, and whether `asked` fired. If the winner is a draft, note it must still be ratified (`doc-ratify`) — consolidation retires the losers but does not promote the survivor (P6).</action>
</step>

<step n="7" goal="Report (the output contract)">
  <action>Emit the JSON output object to the caller:</action>
  ```json
  {
    "clusters": [
      { "winner_slug": "{{winner_slug}}", "superseded": {{loser_slugs}}, "redirects": {{redirects}}, "asked": {{asked}} }
    ],
    "deferred_ambiguous": {{deferred_ambiguous}}
  }
  ```
  <output>
    **doc-consolidate complete.**
    - Clusters resolved (whole-doc supersede): {{count_resolved}}  (each: one live winner, loser(s) → archive with two-sided links)
    - Clusters deferred to a human: {{count_deferred}}  (ambiguous — pages left untouched; see `deferred_ambiguous`)
    - Questions asked this pass: {{count_asked}}  (one plain-English question per ambiguous cluster)
    - Draft winners pending ratification: {{count_draft_winners}}  (run doc-ratify — consolidation retires losers, it never self-promotes a survivor)
    - Detection engine: {{engine}}  (server semantic, or local fallback if the server engine was unavailable)
  </output>
  <action>Nothing was deleted; every retirement is a whole-doc supersede to archive with two-sided links. Ambiguous clusters were returned for human decision, not merged. If any cluster was resolved by a human's one-question answer, surface that the answer is recorded on the durable comment.</action>
</step>

</workflow>

## Error handling

Branch on exit code + the `errorCode` field — never on stderr text.

| Condition | Action |
|---|---|
| `docmost-cli` not on PATH | HALT; tell the user to install/authenticate the CLI |
| `auth status` non-zero (`AUTH_MISSING`) | HALT; tell the user to run `docmost-cli auth login` |
| `cache sync` exits 3 (`CACHE_STALE`) | re-run once and retry; if still stale, WARN and stop |
| `verify duplicates --engine server` unavailable (no AI provider / no sweep) | fall back to `--engine local --mode content`; note the degraded detection in the report; filter out superseded members the local engine includes |
| same-concept confirmation (Step 2) | the BUILT arbiter is the `verify duplicates` similarity (`top_similarity` / `similarity_to_canonical`) + a direct `page get` body read, judged conservatively — a member below a clear same-concept threshold is dropped, not merged. The semantic `POST /api/orvex/pages/duplicate-check` endpoint is PENDING (CONTRACTS §2.4, unbuilt, not an `docmost-cli` verb) and is never POSTed |
| `transclusion-impact` shows active refs (`TRANSCLUSION_REFERENCES_ACTIVE`) | do NOT force the supersede — demote the cluster to `deferred_ambiguous`; surface impact; only `--on-transclusion-conflict unsync` with explicit human consent |
| `page supersede` / `page update` exits 7 (`CONFLICT`, `--if-version` mismatch) | re-read live, retry once; if it conflicts again, review comment + demote to `deferred_ambiguous` |
| post-supersede `page backlinks <loser>` still lists inbound links to a loser | redirect stamped → async rewrite pending, note in report (self-heals); no redirect (e.g. `unsync`) → surface stranded sources, recommend redirect or `doc-amend` re-point; never auto-rewrite links here |
| `FORBIDDEN` (exit 5) | the caller lacks permission on a member — surface to the user; do not retry |
| non-interactive context on an ambiguous cluster | leave the durable comment, supersede nothing, record in `deferred_ambiguous`; never auto-supersede over ambiguity |

## What this skill orchestrates vs. what the durable tools own

This skill is orchestration only — it decides *which* page wins each confident cluster and *whether* a cluster is even resolvable. The durable capability is composed, never re-implemented:

- **Detection** — the server's duplicate engine (`verify duplicates`, detection-only) for the candidate clusters and the per-member similarity signal, plus a direct body read (`page get`) of each member to judge concept identity conservatively. The skill never hand-rolls similarity. (A draft-inclusive semantic `POST /api/orvex/pages/duplicate-check` endpoint is **PENDING** — CONTRACTS §2.4 — and would strengthen Step 2 once built; it is unbuilt, is not an `docmost-cli` verb, and is never POSTed directly.)
- **Retirement** — Marian's **manual-supersede** named procedure (`doc-librarian`): transclusion-impact preflight, atomic two-sided supersede, optional redirect. The skill dispatches it per loser; it never writes supersession edges itself.
- **The dup logic it reuses conceptually** — the same conservative same-concept judgement `doc-amend`'s find-before-create makes (its FTS+title probe + the create-path exit-8 dup guard — it calls no duplicate-check endpoint), asked space-wide across an existing cluster instead of for one incoming unit.
- **The constitution** — `doc-session-policy`, with **P5** (whole-doc supersession to archive) as the governing principle, and `decision-order.md` branch **(9) SUPERSEDE** as the branch this skill drives.

This skill never authors a body, never partially merges, never picks a winner by date alone, never auto-merges an ambiguous cluster, never builds a `/Suspense` tree or a learning log, never uses any blind auto-supersede mode of `verify duplicates`, never deletes a page, and never promotes a draft to canonical.
