---
name: doc-spec-gate
description: "The cross-module wiki-first gate orchestrator. At create-story time (human present) it records the intent node and captures a one-question human confirmation; at dev-story time it is a read-only token check that passes silently in the happy path and HALTs only on a genuine miss when wiki_first_enforcement is block. Owned by bmad-docmost, referenced by bmad-linear."
---

# doc-spec-gate

The manual outranks the code. Before any code is written, the **intent** for a work item is recorded in the project's living manual and **confirmed by a human**, then built. This skill is the agent-side companion that makes that mandate hold across two BMAD workflows without ever pausing an autonomous loop in the happy path.

The design principle is **guardrails over gates**: the path of least resistance runs *through* the gate. We achieve that by capturing the human confirmation **early, where a human is already present** — at `bmad-create-story` time — so that by `bmad-dev-story` time the gate is only a cheap, non-blocking token read. The autonomous dev loop is never made to stop and wait for a human unless intent genuinely never got confirmed.

This skill is **owned by bmad-docmost** and **referenced by bmad-linear** via `recommendedModules`. It is loaded as `persistent_facts` into the `bmad-create-story` and `bmad-dev-story` overrides, and the actual mid-`<step>` activation is performed by a patch-injected `<check>` / `<ask>` (see "What this skill is and is not" below).

## What this skill is and is not

- **It is** the agent-side orchestrator: the two behaviors (confirm-at-create-story, read-at-dev-story), the enforcement-mode branching, and the durable-record-of-intent procedure via `doc-amend`.
- **It is not** the enforcement substrate. The un-bypassable parts live one layer down — the server columns/endpoint/token and the patch-engine guards. The CLI gate probe is **built**; the server substance-validation it calls may not be fully wired. Where a dependency is still **PENDING**, this skill uses the built primitive as the primary call and falls back only when the CLI is absent/old. Do not block on a PENDING dependency.
- The **mid-step injection itself is a patch**, authored and applied in a separate phase by the shared `bmad-patch-engine` (region-merge composer). This skill describes the behavior the injected guard invokes; it does not perform the injection.

> **Status — what is AS-BUILT vs PENDING.** This skill is the agent-side companion to the gate substrate:
> - **AS-BUILT — `docmost-cli spec gate check <story-id>`** — the gate probe is live (verified against `docmost-cli spec gate check --help`). It calls `POST /api/orvex/spec-gate/check` and prints `{ satisfied, token }`: **exit 0 satisfied** (token present) / **exit 9 `GATE_UNSATISFIED`** (no confirmed intent node). This is the PRIMARY dev-story read below. (CONTRACTS §1.8)
> - **PENDING (server-side, do not block) — the substance-validation behind the endpoint:** the `spec_confirmed` boolean column on `pages` set only by a human-attributed confirm (CONTRACTS §2.1), and the human-confirm submission that mints the substance-validating, work-item-scoped, human-attributed, time-boxed `SPEC_CONFIRM_TOKEN` (CONTRACTS §0.3, §2.6). A stub page must NOT satisfy. The `spec gate check` verb is built; the depth of the server's substance check / confirm-write path is the part that may still be landing.
> - **PENDING — the patch-engine wiki-first guards** — the confirm `<ask>` injected into create-story Step 5 and the read-only `<check>` injected at dev-story Step 5 top, composed region-merge against Linear's guards (PLAN §C.2, §C.3). The actual injection is a patch in a separate phase.
>
> Use the built `spec gate check` as the primary probe; fall back only when the CLI is absent/old, and emit a single one-line note. Never fabricate a token; tokens are server-minted only (CONTRACTS §0.3, §6.2).

## Config and enforcement mode

Resolve `{project-root}/_bmad/doc/config.yaml`:

- `docmost_space` — the space slug for this project's manual.
- `docmost_manual_root_slug` — the manual root; entry point for intent-node resolution.
- `docmost_manual_outline` — path to the project's `manual-outline.yaml` (the project-derived IA mapping doc-type → manual node).
- `wiki_first_enforcement` — **`off | warn | block`. Defaults to `block`.** This is the single switch that decides what dev-story does on a genuine miss.

`wiki_first_enforcement` governs **only the dev-story read path**, and only the genuine-miss branch:

| Mode | dev-story on a confirmed intent node (happy path) | dev-story on a genuine miss |
|---|---|---|
| `block` (default) | no-op pass — silent | **HALT** — implementation must not proceed |
| `warn` | no-op pass — silent | emit a WARN, continue |
| `off` | no-op pass — silent | no-op |

The create-story confirm behavior is **independent of this switch**: recording and confirming intent is always attempted where a human is present, so that the dev-story read finds something. The switch only decides how strict the downstream read is.

## Pre-conditions

Before any wiki call, verify the CLI is present and authenticated:

```bash
which docmost-cli || { echo "NOTE: docmost-cli not on PATH — spec gate degraded"; }
docmost-cli auth status --output json
```

- If `docmost-cli` is absent: in `warn`/`off` log a NOTE and proceed; in `block` log a NOTE and HALT (the gate cannot be verified, and the default posture is conservative). Never silently pass `block` when the gate cannot be checked.
- If auth status is non-zero: tell the user to run `docmost-cli auth login --instance <url> --token <api-key>`; HALT in `block`, WARN-and-continue otherwise.

Never parse stderr text — branch on the exit code and the `errorCode` field of the JSON envelope (CONTRACTS §0.4).

## create-story behavior — record the intent node, then CONFIRM (human present)

This runs inside `bmad-create-story` Step 5 ("Create comprehensive story file"), where a human is interacting with the workflow. It is a **record → confirm** sequence: the spec/intent is recorded into the manual via `doc-amend`, then a single plain-English question captures the human confirmation, which the server turns into `spec_confirmed = true` and a fresh `SPEC_CONFIRM_TOKEN`.

This is the moment the gate is satisfied. By placing the confirmation here, the later dev-story check is a no-op in the happy path — preserving dev-story's "execute continuously" contract.

<workflow>

<step n="cs-1" goal="Resolve the work item and its intent doc-type">
  <action>Take the story identifier ({{story_key}} / {{story_id}}) and its epic from the create-story context.</action>
  <action>Determine the intent doc-type for this work item from the durable catalog in {project-root}/_bmad/doc/data/taxonomy.md — normally `technical-spec`, or a `prd`-section under the story's epic. The intent node is the page that records what this story is supposed to do, before code.</action>
  <action>Resolve the intent node's manual IA path from {docmost_manual_outline}; the IA is project-derived — do not assume any fixed section set.</action>
</step>

<step n="cs-2" goal="Record the intent node via doc-amend (never write canonical directly)">
  <critical>Recording intent is an authoring action — route it through doc-amend so find-before-create, the one-question ASK, current-state-only bodies, and the section-scoped in-place amend all apply. Do NOT call page upsert --status canonical here; AI never self-promotes (P6).</critical>
  <action>Invoke `skill:doc-amend` with `{ content_unit: <the story's intent/spec text>, target_doc_type: <intent doc-type from cs-1>, space: {docmost_space}, parent_hint: <epic's section node> }`.</action>
  <action>doc-amend will: read the live node (status-filtered), find-before-create across drafts AND canonical, ASK one question on a fuzzy match, and either amend the existing intent node in place or create a new one at `--status draft`. Capture the returned `{ page_slug, page_url, action }`.</action>
  <note>The intent node lands at `status: draft`. It is NOT yet confirmed — confirmation is the next step's human ratification, never AI self-certification (P6).</note>
</step>

<step n="cs-3" goal="CONFIRM with the human — one question (P3)">
  <critical>This is the wiki-first confirmation. It is the patch-injected `<ask>` in production; described here as the behavior that guard invokes. One plain-English question — not a form, not a nag (P3).</critical>
  <ask>Here is the intent recorded for {{story_key}} in the manual: "{{intent_node_title}}" ({{page_url}}). In one line, this story will: {{one_line_intent_summary}}. Confirm this is the intent to build? [y to confirm / n to revise]</ask>

  <check if="user revises">
    <action>Capture the correction and re-invoke doc-amend (cs-2) to amend the intent node in place; re-ask cs-3. Stay in this loop until the human confirms or abandons.</action>
  </check>

  <check if="user confirms">
    <action>Submit the human confirmation to the server so it sets `spec_confirmed = true` on the intent node and mints a fresh, work-item-scoped `SPEC_CONFIRM_TOKEN`. The confirmation MUST be human-attributed (carries the confirming user id); a service-account / AI-self confirm is rejected server-side.</action>
    <note>PENDING (server-side): the depth of the human-confirm submission that sets `spec_confirmed` and mints `SPEC_CONFIRM_TOKEN` (CONTRACTS §2.6). Where the confirm-write path is not yet wired, record the human confirmation durably on the intent node with `docmost-cli comment add <slug> --body "spec confirmed by {user} for {{story_key}}" --output json` (the real verb is top-level `comment add <slug> --body …`, NOT `page comment`; verified against `docmost-cli comment add --help`) and treat the gate as "confirmed-but-untokened" for this session. Never fabricate the token.</note>
  </check>

  <check if="user abandons">
    <action>Leave the intent node at draft, unconfirmed. The gate will be unsatisfied at dev-story time; that is correct — nothing was confirmed to build.</action>
  </check>
</step>

<step n="cs-4" goal="Interactivity fallback (non-interactive handoff)">
  <check if="the create-story handoff context cannot suspend for a human reply">
    <action>The confirm `<ask>` (cs-3) belongs in `activation_steps_append` or an interactive step, NOT in a non-interactive finalize/external_handoff. If this context cannot block for a reply, do not fabricate a confirmation: record the intent node (cs-2), leave it unconfirmed, and surface to the user that the wiki-first confirmation is pending and must be answered before dev-story can proceed under `block`.</action>
  </check>
</step>

</workflow>

## dev-story behavior — a NON-BLOCKING read-only token check

This runs at the **top of `bmad-dev-story` Step 5** (the implementation step), injected by the patch guard. It is **read-only**: it never authors, never confirms, never mutates. In the happy path (intent confirmed at create-story) it is a silent no-op pass, preserving the `<critical>Execute continuously without pausing</critical>` contract.

<workflow>

<step n="ds-1" goal="Read the gate token for the story (read-only)">
  <action>Resolve `wiki_first_enforcement` from config (default `block`).</action>
  <action>Run the gate probe — this is the PRIMARY, authoritative, substance-validating check (AS-BUILT):</action>

  ```bash
  docmost-cli spec gate check {{story_id}} --space <docmost_space> --output json
  ```

  <note>AS-BUILT: `docmost-cli spec gate check <story-id>` is live (verified against `docmost-cli spec gate check --help`; CONTRACTS §1.8). It calls `POST /api/orvex/spec-gate/check` and prints `{ satisfied, token }` — exit 0 satisfied (token present) / exit 9 `GATE_UNSATISFIED` (no confirmed intent node). A stub does NOT satisfy. This is the only source of the `SPEC_CONFIRM_TOKEN`, so it is the primary call. *Fallback (CLI absent/old):* approximate with doc-read-first **spec mode** against the intent node for this story (resolve from {docmost_manual_outline}, fetch status-filtered, and treat the gate as satisfied ONLY if a non-trivial intent node exists at `status: canonical` AND carries a durable human-confirmation marker — a draft or stub does NOT satisfy). The fallback cannot mint a token; under `block` an unverifiable gate is conservative (see the exit-handling below).</note>

  <action>Branch ONLY on the exit code and the JSON envelope, never on stderr text:
    - exit 0 → gate satisfied (token present in `{ satisfied: true, token, intent_page }`). GOTO ds-2 (pass).
    - exit 9 `GATE_UNSATISFIED` → genuine miss (`{ satisfied: false, reason }`). GOTO ds-3 (enforce).
    - any other non-zero (e.g. 6 SERVER_UNREACHABLE) → the gate could not be evaluated. In `block`: HALT and tell the user the gate is unverifiable; in `warn`/`off`: log a WARN and continue. Do NOT treat an evaluation error as a pass under `block`.</action>
</step>

<step n="ds-2" goal="Happy path — silent no-op pass">
  <critical>Do NOT pause, do NOT announce, do NOT ask. A satisfied gate is a no-op. The dev loop continues uninterrupted (preserves "Execute continuously without pausing").</critical>
  <action>Optionally fetch the confirmed intent node body (via doc-read-first spec mode) to use as the grounding spec for implementation — "NEVER implement anything not mapped to a confirmed intent node in the manual." Then return control to dev-story Step 5 to proceed.</action>
  <action>Output (to the host workflow): { satisfied: true, action: pass, intent_page: <slug> }</action>
</step>

<step n="ds-3" goal="Genuine miss — enforce per wiki_first_enforcement">
  <check if="wiki_first_enforcement == 'block'">
    <critical>HALT. Implementation must not proceed without a human-confirmed manual intent node for this work item.</critical>
    <output>🚫 Wiki-first gate UNSATISFIED for {{story_id}}: {{reason}}.
      No human-confirmed intent node exists in the manual for this story. Implementation is blocked.
      The intent must be recorded and confirmed before code. Run `bmad-create-story` for this story (the confirmation `<ask>` is captured there, where you are present), or invoke `skill:doc-amend` + `skill:doc-spec-gate` to record and confirm now.</output>
    <action>HALT — return { satisfied: false, action: halt, intent_page: <slug if any> } to the host workflow. Do not implement.</action>
  </check>

  <check if="wiki_first_enforcement == 'warn'">
    <output>⚠️ Wiki-first gate unsatisfied for {{story_id}}: {{reason}}. Proceeding without a confirmed intent node (warn mode). Record + confirm intent to clear this.</output>
    <action>Continue the dev loop. Return { satisfied: false, action: warn, intent_page: <slug if any> }.</action>
  </check>

  <check if="wiki_first_enforcement == 'off'">
    <action>No-op. Return { satisfied: false, action: pass, intent_page: null }. (Enforcement disabled; the dev loop continues unaffected.)</action>
  </check>
</step>

</workflow>

## Output contract (to the host workflow)

Both behaviors return the same shape so the host (create-story / dev-story) can branch deterministically:

```json
{ "satisfied": true|false, "action": "pass|halt|warn", "intent_page": "<slug>|null" }
```

- `action: pass` — proceed (gate satisfied, or `off` mode).
- `action: halt` — stop the dev loop (`block` mode, genuine miss). The host must not implement.
- `action: warn` — proceed but a warning was surfaced (`warn` mode, genuine miss).

The create-story path additionally surfaces the recorded intent node `{ page_slug, page_url }` and whether the human confirmed.

## Hard rules carried by this gate

- **Confirm early, where the human is.** The human confirmation is captured at create-story, never by pausing the autonomous dev loop. dev-story only *reads* the resulting token.
- **A stub does not satisfy.** Mere existence of an intent page never satisfies the gate. Substance is validated server-side; a draft or trivial page is a genuine miss. (CONTRACTS §2.6)
- **Never fabricate a token.** `SPEC_CONFIRM_TOKEN` is server-minted, work-item-scoped, human-attributed, and time-boxed. The skill and CLI only transport it. (CONTRACTS §0.3, §6.2)
- **AI never self-confirms.** Setting `spec_confirmed` requires a human-attributed confirm; an AI / service-account confirm is rejected. (P6)
- **Record via doc-amend, not a canonical write.** Intent is authored through `doc-amend` (find-before-create, ASK, in-place, draft) — never `page upsert --status canonical`.
- **Branch on exit code, never on text.** Exit 0 = satisfied; exit 9 `GATE_UNSATISFIED` = miss; any other non-zero = unverifiable (conservative under `block`). (CONTRACTS §0.4, §1.8)
- **Default is conservative.** `wiki_first_enforcement` defaults to `block`; when the gate cannot be evaluated under `block`, HALT rather than pass.

## Relies on

- `skill:doc-amend` — records the intent node (find-before-create, ASK, in-place, draft).
- `skill:doc-read-first` (spec mode) — fetches the confirmed intent node for a story; the fallback read path used only when `spec gate check` (the primary probe) is unavailable.
- `skill:doc-session-policy` — the constitution (the manual outranks the code; record + confirm intent before implementing).
- `docmost-cli spec gate check <story-id>` — **AS-BUILT** authoritative gate probe (CONTRACTS §1.8).
- `POST /api/orvex/spec-gate/check` + `spec_confirmed` column + `SPEC_CONFIRM_TOKEN` — server enforcement substrate; the endpoint/verb are built, the **PENDING** part is the depth of server-side substance-validation and the confirm-write path (CONTRACTS §2.1, §2.6).
- The shared `bmad-patch-engine` wiki-first guards — **PENDING** mid-`<step>` injection (the create-story confirm `<ask>` and the dev-story read `<check>`), applied in a separate phase (PLAN §C.2–§C.3).
