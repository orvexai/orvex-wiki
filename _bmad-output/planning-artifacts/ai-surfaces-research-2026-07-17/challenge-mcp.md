# ADVERSARIAL CHALLENGE — the MCP ⊇ CLI Delta List (`draft-mcp.md`)

**Reviewer job (PO-D2):** refute weak dispositions, hunt missing rows, verify citations spot-wise.
**Method:** read `draft-mcp.md` in full; swept `evidence-fork-server.md`, `evidence-fork-client.md`,
`evidence-docmost-cli.md` for capabilities absent from the list; verified current-state claims against
`evidence-mcp.md` (@`4f81b48`), `evidence-orvex-cli.md` (@`48329b7`), `evidence-linear.md`,
`evidence-canon-mcp.md`, `ZGjLctEnGH.txt`. `wiki-study/atlas.md` confirmed absent (draft is correct).

Findings ordered most-important first. Each = **target row · what's wrong · the fix · evidence**.
Severity in **[brackets]**. This is not a lazy-pass empty list; 11 defects survive verification, 3 of them
material (a false current-state, a canon-violating serving assignment, and two genuinely undisposed live CLI verbs).

---

## C1 — [HIGH · citation defect, CONFIRMED] P1 row "AI image generation": current-state is factually wrong

**Row:** P1 *AI image generation* — current state @HEAD = "`generate_image` scaffold `NOT_AVAILABLE_YET`
(`synthesis-parity A.1`, ENG-2802)".

**What's wrong:** There is **no `generate_image` / `ai_image` tool registered in the MCP at HEAD** — not as a
scaffold, not as a real tool. `evidence-mcp.md §3b` enumerates *all 30* scaffold stubs by substrate
(memory 2 · staging 8 · workgraph 14 · `wiki_attachment_*` 2 · `ai_models` 1 · `billing_*` 2 · `audit_query` 1
= 30) and `§14` re-confirms the 30-count; `generate_image` is in **neither** the 30 scaffolds nor the 21 real
tools. `grep generate_image evidence-mcp.md` → **zero hits**; `grep generate_image evidence-canon-mcp.md` →
**zero hits**. The "scaffold" claim is inherited uncritically from `synthesis-parity A.1`, which itself
asserts an MCP scaffold that the HEAD inventory does not corroborate.

**The fix:** current state = **"absent — no `generate_image`/`ai_image` verb registered at HEAD (not a
scaffold); ENG-2802 is a Todo to *wire* the tool to the ai upstream."** Disposition `adopt` still holds; only
the current-state label is defective. This matters because "scaffold present" implies a reserved seat + a
naming/schema decision already made, whereas "absent" means the verb, its category, and its serving contract
are all still greenfield.

**Evidence:** `evidence-mcp.md §1/§3b/§14` (30 scaffolds enumerated, none is `generate_image`; 21 real, none is
`generate_image`); `evidence-linear.md:229` ENG-2802 = "*Wire* `generate_image` MCP tool to the direct ai
upstream (FR-M16/D-M7)" — a build-it ticket, confirming the tool does not yet exist.

---

## C2 — [HIGH · serving-service violates settled canon] P0 row "Ratify": "wiki-api mint" breaks the mint chain

**Row:** P0 *Ratify draft → canonical* — serving service = "**wiki-api mint** / engine (D-A8)".

**What's wrong:** The canonical governance chain is **engine mints, wiki-api transports verbatim, the AI
surface NEVER mints.** "wiki-api mint" directly contradicts it. This is a settled-canon violation, not a
wording nit: goggles P8 — "*Engine mints RATIFY/CONFIRM tokens; wiki-api transports verbatim (never
mints/promotes)*"; `synthesis-parity A.7` — "*engine mints (D-A8) → wiki-api transports → mcp/cli transport*";
`synthesis-parity A.4` — token "*mint*" target = **engine**. It is also **internally inconsistent** with the
adjacent P0 row 3 (*Lifecycle/supersede*), which correctly writes "wiki-api (**engine mints tokens**)".

**The fix:** serving service = **"engine (mints, D-A8) / wiki-api (transports verbatim)"**; the rationale
column ("a transport verb, not an authority grant") is already correct and should be preserved — only the
serving label is wrong. Fold the same wording into the supersede/status rows so the whole governance cluster
names *engine=mint, wiki-api=transport* uniformly.

**Evidence:** `synthesis-goggles §1 P8`; `synthesis-parity §A.4, §A.7`; `evidence-mcp.md §6` (ratify_token
"never minted by the MCP" — FR-M11); PO-D4 "engine is SoR… wiki-api composition tier."

---

## C3 — [MEDIUM · missing row, a live CLI verb undisposed] Page **duplicate/clone** (+ scaffold, tree-apply) has no disposition row

**Target:** MISSING-ROW.

**What's wrong:** `orvex-cli wiki page duplicate` is **REAL/done** (`synthesis-parity §C`: the 15-verb page CRUD
incl. `duplicate` = "done"; docmost-cli `page duplicate <slug>`, `evidence-docmost-cli §1a`). PO-D1 makes it a
MCP-reachability *requirement*. The draft names it **only** in §(a) ("no delete/move/**duplicate** verb
ticket") and gives it **no disposition row** in P0/P1/P2. Clone-from-existing is a distinct capability (template
instantiation, "copy this page to draft") that `wiki_save` (create/upsert) does not express. Two sibling
structural-create verbs are in the same blind spot: docmost-cli `page scaffold <title>` (template
instantiate) and `page tree … apply <file>` (bulk create/reparent from a tree file) — both real CLI
capabilities, neither disposed.

**The fix:** add a P0/P1 row **"Structural create: duplicate / scaffold / tree-apply"** — serving
**wiki-api → engine**, disposition **adopt-reshaped** (on-demand `wiki_duplicate`, or a `wiki_save` clone/scaffold
mode; tree-apply rides the async-batch home §5(c)Q8). At minimum give `page duplicate` its own row — it is a
delivered CLI verb with zero MCP disposition.

**Evidence:** `synthesis-parity §C` (page duplicate/scaffold "done"); `evidence-docmost-cli §1a` (`duplicate`,
`scaffold`, `tree … apply`); `draft-mcp.md §(a)` (acknowledges "no duplicate verb ticket" but never disposes it).

---

## C4 — [MEDIUM · missing row, a live CLI verb undisposed] **Spec-gate** appears only as an open question, never a row

**Target:** MISSING-ROW.

**What's wrong:** `spec gate check` is a first-class capability (docmost-cli `spec gate`, `evidence-docmost-cli
§6`, exit-9 `GATE_UNSATISFIED`; orvex-cli `wiki spec gate check`, stub; fork-server §3.7 → **wiki-api** under
D-S8). The draft surfaces it **only** in open-question Q10 and §(a), with **no disposition row**. PO-D1's
default is parity for every CLI capability; "it's still a stub on both sides" is a *current-state*, not a reason
to omit the disposition. Leaving it in the open-questions bucket means the PRD floor silently loses a
governance verb.

**The fix:** add a P1 row **"Wiki-first spec-gate"** — serving **wiki-api** (D-S8), disposition **rethink →
adopt-reshaped** (de-Linearized wiki-first governance verb, pending the "does it belong on the agent door"
ruling in Q10), current state "server 501 (ENG-2537 Todo) + CLI stub." Keep Q10 as the *ruling*, but the row
must exist.

**Evidence:** `evidence-docmost-cli §6`; `evidence-orvex-cli §3` (`wiki spec gate check` stub);
`evidence-fork-server §3.7` (spec-gate → wiki-api, D-S8); `draft-mcp.md §(c)Q10, §(a)`.

---

## C5 — [MEDIUM · under-enumerated nav read] **Backlinks** (inbound-link graph) is missing from the nav row

**Row:** P1 *Nav: permissions / watchers / transclusion-impact / mentions / recent* — current state lists
"tree/neighborhood/changes reachable; permissions/watchers/**transclusion-impact**/mentions not."

**What's wrong:** `orvex-cli wiki nav` ships **`backlinks`** and `breadcrumbs` as **REAL** verbs
(`evidence-orvex-cli §3`: "wiki nav — real: tree, outline, breadcrumbs, **backlinks**, recent, resolve-slug,
watchers, permissions, transclusion"). `backlinks` ("what links here") is a *distinct* inbound-reference read —
`wiki_get_neighborhood` is structural parent/children/siblings (`evidence-mcp.md §3a`), and `wiki_get_tree` is
hierarchy; neither returns the inbound-link set. Backlinks is a **safety read before a destructive edit**
(impact analysis) in the same class the row already argues transclusion-impact must be reachable — yet the row
omits it entirely. It is a delivered CLI verb (PO-D1 floor) with no MCP disposition.

**The fix:** add `backlinks` (and `breadcrumbs`) to the nav row's partial set; name its serving service —
**knowledge** (link/orphan graph, consistent with the verify row's "knowledge (link/orphan graph)") or
**wiki-api → engine** — and dispose **adopt-reshaped** (fold into a `wiki_inspect`/`wiki_get_neighborhood`
option).

**Evidence:** `evidence-orvex-cli §3` (backlinks/breadcrumbs REAL); `evidence-mcp.md §3a` (neighborhood =
structural only; no backlinks verb); `draft-mcp.md` P1 nav row.

---

## C6 — [MEDIUM · serving-service conflicts doctrine] P0 "Comment" family parked on studio-api, not wiki-api

**Row:** P0 *Comment read/list/resolve/unresolve/rm* — serving service = "engine primitive + **studio-api
`/v1/social`**".

**What's wrong:** The split doctrine routes agent comment access through **wiki-api**, not studio-api:
D-S16 ("programmatic (agent) access to comments routes through wiki-api", `evidence-fork-server §3.11`);
`synthesis-parity §A.9` gives comments the target "engine primitive + **wiki-api front**"; goggles Q8
recommends comments as a **wiki-api locator sub-resource** (`/v1/wiki/{loc}/comments`). The draft assigns the
*whole family* to studio-api purely by continuity with the existing `wiki_comment_post`, which lives on
studio-api `/v1/social` only as an explicitly **sanctioned R-SEAM-1 exception** for that single write verb
(`evidence-mcp.md §3c, §12`). PO-D4 is explicit that "a capability parked on the wrong service is a gap."
Completing read/list/resolve/rm on studio-api entrenches the exception into the whole family.

**The fix:** name **wiki-api (front) over the engine comment/resolve primitive** as the target serving service
(comments as a locator sub-resource, Q8), and record the R-SEAM-1 studio-api `/v1/social` home for
`wiki_comment_post` as an *acknowledged exception to reconcile*, not the family's destination. This is the same
"wiki-api needs comment/label/attachment sub-resources" server gap the draft already flags in §(c)Q3 — the
comment row's serving column should point there.

**Evidence:** `evidence-fork-server §3.11` (D-S16); `synthesis-parity §A.9` (wiki-api front);
`synthesis-goggles §4 Q8`; `evidence-mcp.md §3c/§12` (R-SEAM-1 = sanctioned exception for the *post* verb only).

---

## C7 — [MEDIUM · weak disposition, rationale fails first principles] P1 "AI chat / inline edit" conflates ask with generate

**Row:** P1 *AI chat / inline edit* — disposition **rethink**, rationale "inline overlaps `ai_ask`+`wiki_save`".

**What's wrong:** The rationale is false from first principles. `ai_ask` is **cited Q&A that "never fetches a
body"** and returns a K5 verdict object, not document content (`evidence-mcp.md §3a`). Inline AI edit
("rewrite this selection", `/ai`, Cmd+J) is an **ai content-generation/transform** operation — it *produces*
prose to be written. That is neither `ai_ask` (read-only answer) nor `wiki_save` (a dumb write of
caller-supplied bytes). So there is a **genuine ai-served capability gap** — a generate/transform verb — that
the "overlaps ai_ask+wiki_save" framing erases. Chat and inline are also two different things bundled into one
row with one disposition.

**The fix:** split the row. **Chat** = `rethink` (interactive multi-turn, arguably not agent-native — the
existing rationale holds *here*). **Inline/generate** = `adopt-reshaped`: evaluate an ai-served
`ai_generate`/transform verb (produce content → hand to `wiki_save`), serving **ai** — because ai owns the full
generation loop (D-A12, `evidence-fork-server §3.1`) and the engine is never the AI path (PO-D4).

**Evidence:** `evidence-mcp.md §3a` (`ai_ask` never returns a body); `evidence-fork-server §3.1`
(ai-inline → ai; D-A12 ai owns the loop); `evidence-fork-client §4.2` (InlineAiPrompt streams a *generation*,
Insert/Save-to-draft/Discard — content production, not Q&A).

---

## C8 — [MEDIUM-LOW · disposition under-weights PO-D1] P2 "Support-issue relay" floor should be adopt-reshaped

**Row:** P2 *Support-issue relay* — disposition **rethink**, "rename to `support_report` or **drop**".

**What's wrong:** `orvex-cli wiki issue create` is **REAL and Done** (ENG-1484, `evidence-orvex-cli §3, §13`;
`evidence-linear.md:258`) — a live, tested CLI capability (bundle build/git/config context, SSO-delegated,
server-held key, `--dry-run`). PO-D1 makes MCP-reachability a *floor* for any capability the CLI can do. Framing
it as "rethink → rename **or drop**" treats a delivered CLI verb as optional. The only legitimate open question
is the **Linear naming** (Q10), not whether the capability exists.

**The fix:** disposition floor = **adopt-reshaped** (reachable, renamed off Linear — `support_report`/
`/v1/support/issues`, server-held key). "Drop" is only on the table if the capability is *also* dropped from the
CLI (which would itself need a PO ruling, since it's currently Done). Keep Q10 as the naming ruling.

**Evidence:** `evidence-orvex-cli §3/§13`; `evidence-linear.md:258` (ENG-1484 Done); PO-D1
(`po-decisions/2026-07-17.md:10-37`); `synthesis-goggles §4 Q10`.

---

## C9 — [MEDIUM-LOW · serving-service cross-doc conflict] P1 "AI cost / usage read": ai vs billing unreconciled

**Row:** P1 *AI cost / usage read* — serving service = "**billing** (+ai spend)".

**What's wrong:** The usage/spend *dashboard* is homed to **ai** in the source evidence, not billing:
`evidence-fork-server §3.1` ("Usage/spend dashboard → **ai**"); `synthesis-parity §A.1` ("AI usage / spend
dashboard | … | **ai** | missing"). Billing owns entitlement *caps*, but the usage *read* is an ai-product
surface (`ai/ai-usage.controller.ts`). The draft chose "billing" to match the MCP scaffold names
`billing_usage`/`billing_plan` (`evidence-mcp.md §3b`) — a defensible pointer, but it silently contradicts two
other synthesis docs and PO-D4's split (usage-read ≠ entitlement).

**The fix:** name **ai (usage/spend read, ai-usage) + billing (cap/entitlement)** and flag the
`billing_usage`/`billing_plan` scaffold naming as a reconcile item — is the read served by ai's usage endpoint
or a billing projection? Don't let the scaffold name silently decide the owner.

**Evidence:** `evidence-fork-server §3.1`; `synthesis-parity §A.1`; `evidence-mcp.md §3b` (scaffolds named
`billing_*`); PO-D4.

---

## C10 — [LOW · citation arithmetic] Reading-rule #2 undercounts the can-never-succeed set

**Target:** §0 reading rule #2 — "The MCP registers 52 tool names but only **21 are REAL**; **30 are permanent
scaffolds** that can never succeed."

**What's wrong:** 21 + 30 = 51, not 52. The 52nd tool is **`marketplace_publish`** — real elicitation/confirm
governance wired ahead of an absent substrate, so a *confirmed* publish still returns `NOT_AVAILABLE_YET`
(`evidence-mcp.md §1, §3a, §14`). It is neither "REAL" (can't succeed) nor one of the 30 scaffolds — it is a
distinct fourth category, and it *also* can-never-succeed today. So the "cannot succeed" set is **31**, and the
arithmetic should reconcile to 52.

**The fix:** "52 = 21 REAL + 30 scaffolds + 1 (`marketplace_publish`, real-gate/absent-substrate); 31 of the 52
cannot succeed at HEAD." Immaterial to any delta disposition, but it's a verifiable inaccuracy in a rule the
whole list leans on.

**Evidence:** `evidence-mcp.md §1` (the 5-row count table), `§3a` (marketplace_publish), `§14`.

---

## C11 — [LOW · under-specified serving] P1 "Memory" write-leg service not named

**Row:** P1 *Memory recall / propose* — serving "ai / memory (read-leg → knowledge, ENG-2800)".

**What's wrong:** The read-leg → knowledge is correctly cited (ENG-2471 "memory read as a knowledge tool call";
ENG-2800 canon-drift), but the **write/propose leg** has no named owner, and there are *two distinct* memory
concepts in evidence that the row blurs: (1) fork `ai/ai-memories` (workspace/user AI memory → ai) and (2) the
studio **Memory product** `studio_memory_get`/`studio_memory_save` on **studio-api** (`evidence-mcp.md §3c`).
`memory_propose` also carries a `staged`/`direct` tenant gate (`evidence-mcp.md §3b`). Naming only "ai / memory"
leaves the propose path's serving service and the ai-memories-vs-studio-Memory distinction unresolved.

**The fix:** name the write-leg explicitly (ai-memories → **ai**; or studio Memory → **studio-api**) and note
the two-product ambiguity as a reconcile item alongside ENG-2800. Reads → knowledge is fine as-is.

**Evidence:** `evidence-mcp.md §3b` (`memory_propose` staged/direct gate), `§3c` (`studio_memory_*` on
studio-api); `evidence-linear.md:228, 244` (ENG-2471 read-leg, ENG-2800 carve-out).

---

## What held up (spot-checks that PASSED — recorded so the pass is auditable)

- **Hero-13 / KPI numbers:** "connect-schema budget 5,303 tokens inside ~4.5–5.5k, required CI gate" and
  "`standalone-boot.test.ts` asserts default `tools/list` == hero-13, +1 needs an ADR" — **both accurate**
  (`evidence-canon-mcp.md:58,218`; `ZGjLctEnGH.txt:146`; `evidence-mcp.md §2`).
- **7-of-13 hero seats are scaffolds** (memory_recall, staging_propose, workgraph_prime/ready/claim/save/handoff)
  — accurate (`evidence-mcp.md §2, §14`).
- **Scaffold current-states** for attachments (`wiki_attachment_*`, R-SEAM-8a), `ai_models` (R-SEAM-9c),
  `billing_*` (R-SEAM-9c), `audit_query` (R-SEAM-9a) — all **verified present** in `evidence-mcp.md §3b`.
- **Comment write-only reachability** (`wiki_comment_post` only; no read/list/resolve) — accurate
  (`evidence-mcp.md §3c`). *(Serving assignment challenged separately in C6.)*
- **Ticket citations** ENG-2470 (fold marketplace→knowledge, reversed by R-SEAM-3), ENG-2460 (search/related/
  neighborhood→knowledge, omits duplicates), ENG-2469 (six studio_* fronts comment_post), ENG-2455 (get_changes
  no-SSE), ENG-2464 (governance transport-only), ENG-1483/1484 (Linear relays Done) — **all match**
  `evidence-linear.md` verbatim (lines 227, 201, 226, 191, 210, 52/258/622/623).
- **§4 CLI-only exceptions** (config/daemon/cache/mirror/doctor/completion/auth/screenshot/code-graph/version) —
  the statelessness/no-filesystem/never-mints arguments are sound and each maps to a real docmost-cli group.
- **"Audit emit/dual-write → drop"** — well-argued from first principles (MCP is an audit *source*, already
  stderr-audits every mutation, `evidence-mcp.md §6`); no hidden dependent broken.
- **`wiki-api` spaces/comment/label/attachment 404-class server gap** and orvex-cli's broken clients against
  them — accurate (`evidence-orvex-cli §3`).

---

## Net verdict

The list is **structurally sound** — the reachable/exception/serving framing is right, the §4 exceptions are
well-argued, and its ticket + scaffold citations are almost all accurate. But it carries **one false
current-state (C1, `generate_image` is absent not scaffolded)**, **one canon-violating serving assignment (C2,
"wiki-api mint")**, **two delivered CLI verbs with no disposition row at all (C3 duplicate/scaffold/tree-apply,
C4 spec-gate)**, **one under-enumerated safety read (C5 backlinks)**, and **three serving/disposition
reconciles (C6 comments→wiki-api, C7 inline=generate, C9 usage=ai)**. C1–C4 are the must-fix set before this
becomes a PRD requirements floor.
