# CHALLENGE — adversarial review of the CLI parity-gap list (`draft-cli.md`)

**Reviewer role (PO-D2).** Refute weak dispositions, hunt rows missing entirely, verify citations
spot-wise against the evidence fleet. Built 2026-07-17 against `draft-cli.md`,
`evidence-docmost-cli.md` (baseline), `evidence-orvex-cli.md` (HEAD @ `48329b7`),
`evidence-fork-server.md`, `evidence-fork-client.md`, `evidence-canon-cli.md`,
`wiki-study/orvexcli.md`, and the four PO directives (`po-decisions/2026-07-17.md`).

**Inputs note.** `wiki-study/atlas.md` does **not** exist (no cross-wiki atlas was produced); that
optional input is absent, so no atlas bindings were applied.

**Verdict up front.** The draft is strong on structure and PO-D4 serving-service discipline (no row
routes an AI/search path to the engine; search→knowledge is correct per D-M8). But it has a
recurring **"client-completeness = live-correctness" over-claim** — the exact trap its own §P0
preamble warns against — that it applied to `comment/label/attach` but NOT to `governance`,
`wiki migrate`, or the `page/nav` verb set. It also silently omits two capabilities the CLI code
itself declares (entitlement-read, knowledge reindex/reembed), and inherits a stale-currency claim
and a mis-count. 14 corrections below, most-severe first.

---

## C1 — Row 11 (`page` CRUD + nav) — VERIFY DEFECT, HIGH — `mentions` claimed "done" but ABSENT; four docmost-cli page verbs unaccounted-for

**What's wrong.** Row 11 lists nav as `(tree/backlinks/breadcrumbs/`**`mentions`**`/resolve-slug/permissions/transclusion)` at state **"done — real"**. At HEAD there is no `mentions` verb: `evidence-orvex-cli.md §3` enumerates `wiki nav` = `tree, outline, breadcrumbs, backlinks, recent, resolve-slug, watchers, permissions, transclusion` — and `grep -i mention evidence-orvex-cli.md` returns **0 hits**. Conversely the row omits three *real, new* nav verbs it should credit (`outline`, `recent`, `watchers`). Separately, four docmost-cli `page`-subtree verbs (`evidence-docmost-cli.md §1a`) have **no HEAD counterpart** and are swept under a blanket "done": `ratify` (grep = only the `/v1/settings/ratify-gate` route, no verb), `restore-content` (grep = 0 hits; distinct from `restore`=untrash and `revert`), `page watch <slug>` (per-page change-watch; ≠ `mirror watch`, ≠ `nav watchers`), and `page tree apply <file>` (bulk tree-restructure *write*; HEAD `nav tree` is read-only).

**Fix.** Move `mentions` out of the "done" set into a parity-gap line (docmost-cli `page mentions` → no HEAD verb). Credit `outline`/`recent`/`watchers`. Give `ratify`, `restore-content`, `page watch`, `tree apply` an explicit disposition each (fold into governance/history/changes-feed or drop-with-reason) — do not leave them silently implied by "15 verbs + nav … done."

**Evidence.** `evidence-orvex-cli.md §3` (nav enumeration); grep 0-hits for `mention`/`restore-content`/ratify-verb; `evidence-docmost-cli.md §1a` lines 69–84.

---

## C2 — Row 9 (Human-gated governance transport) — VERIFY/CONSISTENCY DEFECT, HIGH — `wiki governance` rated "real" but evidence flags its routes UNVERIFIED (same 404 class it calls "broken" elsewhere); no `ratify` verb exists

**What's wrong.** Row 9 states "`wiki governance` real" and files only `spec gate check` / `ratify-confirm transport` as scaffolded. But `evidence-orvex-cli.md §3 (finding)` places governance in the **same uncertainty bucket** it uses to call `comment/label/attach` "broken": *"SupersedePage / GetGovernanceStatus / SetGovernanceStatus / VerifyGovernance / AttachGovernanceLabel → paths not matching the {resource} grammar either (need direct verification, not confirmed present in wiki-api's route table)"*, and `§13` lists governance as "route match not independently re-verified." The draft rates the identical-risk group inconsistently — "broken" for comment/label/attach, "real" for governance. Worse, the **human-gated `ratify` promotion verb — the P6/P8 keystone the whole row is about — does not exist at HEAD** (only the `/v1/settings/ratify-gate` *read* route does). docmost-cli shipped a dedicated `page ratify` + full ratify-token gate (`evidence-docmost-cli.md §3.3`); orvex-cli's governance surface is `supersede, status, verify, label` only.

**Fix.** Downgrade governance state to **partial / unverified (likely same 404 class as comment/label/attach)**; explicitly record that the human-gated `ratify` verb is **absent at HEAD**, not merely "transport scaffolded." This is the load-bearing "AI never self-promotes" chain (PO-D1) — overstating it as real is precisely the trap §2.2 warns about.

**Evidence.** `evidence-orvex-cli.md §3 (finding), §13`; grep ratify; `evidence-docmost-cli.md §3.3, §12`.

---

## C3 — MISSING ROW, HIGH — entitlement / quota-state READ (serving: billing → knowledge projection)

**What's wrong.** The draft §0 preamble names "entitlement/quota reads → billing→knowledge projection" and the CLI code itself declares `admin workspace entitlements → knowledge (reads a projection fed by `billing.entitlement.changed`)` (`evidence-orvex-cli.md §7`), yet **no scored row exists** for it. `synthesis-parity.md A.8` independently flags "Quota READ endpoint (`GET /orvex/quota`) — missing." For 10k paying tenants an agent/operator needs to *see* quota usage and entitlement state; this is a real capability with a declared serving-service and a stubbed handler — a gap parked on the right service is still a gap (PO-D4).

**Fix.** Add a P1 row: **entitlement / quota-state read** | precedent `docmost-cli` has no analogue (single-tenant era) + `orvex-cli §7` declared routing | serving = **billing (source) → knowledge projection (read leg)** | state = **missing (stub)** | **adopt-reshaped** (billing has no CLI host; read the knowledge-side projection, never Stripe).

**Evidence.** `evidence-orvex-cli.md §2 (no `ORVEX_BILLING_URL`), §7`; `synthesis-parity.md A.8`.

---

## C4 — MISSING ROW, MED-HIGH — admin `reindex` / `reembed` (knowledge corpus maintenance, serving: knowledge)

**What's wrong.** `evidence-orvex-cli.md §7` declares `reindex, reembed → knowledge` (stub); `evidence-fork-server.md §3.1` maps "Bulk re-embed admin → knowledge"; docmost-cli shipped `ai reembed` (`evidence-docmost-cli.md §8`). The draft's `admin` coverage has rows for **user** (Row 19) and **workspace** (Row 20), and folds **events** into Row 24 — but the **knowledge-maintenance leg (`reindex`/`reembed`) has no row at all.** It is a real operator/agent capability (re-index a corpus after a bulk import, force re-embed) with a settled serving-service.

**Fix.** Add a row: **admin `reindex` / `reembed`** | precedent `docmost-cli §8` `ai reembed` + `fork-server §3.1` | serving = **knowledge** | state = **missing (stub)** | **adopt-reshaped** (corpus maintenance is a knowledge admin verb, never engine).

**Evidence.** `evidence-orvex-cli.md §7`; `evidence-fork-server.md §3.1`; `evidence-docmost-cli.md §8`.

---

## C5 — Row 18 (`migrate`) — VERIFY/CONFLATION DEFECT, MED — "done" conflates two distinct migrate surfaces; the `wiki migrate` archive facade is unverified

**What's wrong.** Row 18 rates `migrate scan/apply/verify` **"done — real … both live calls match the {resource}=wiki grammar."** That is true only of the **top-level** `migrate` (`evidence-orvex-cli.md §8` — `SavePage`→`/v1/wiki`, `GetPageV1`→`/v1/wiki/{loc}`, grammar-matched). There is a **separate** `wiki migrate {import,export,verify,apply}` archive facade (`§3`, `§13`) that the evidence explicitly flags: *"targets ArchiveRequest-shaped calls whose exact routes were not independently re-verified … should be checked before being presented as parity-complete"* — i.e. plausibly the same 404 class. The draft treats the two as one "done" surface.

**Fix.** Scope Row 18's "done" to the top-level `migrate`; add/annotate the `wiki migrate` archive facade as **partial / routes-unverified**.

**Evidence.** `evidence-orvex-cli.md §3, §8, §13`.

---

## C6 — Row 17 (`verify` suite) — VERIFY/OVER-CLAIM, MED — "wiring gap not design gap" holds for only half the leaves

**What's wrong.** Row 17 says the backend endpoints "(links/lint/orphans/render) shipped in wiki-api (ENG-1959) … a wiring gap, not a design gap." The wiki-api route table (`evidence-orvex-cli.md §3`) does register `…/links /lint /orphans /render` — but it does **not** register `/duplicates`, `/staleness`, `/ia-conformance`, or a spaces `/space` route. So four of the ~eight verify leaves have **no server backend** — they are **design gaps** (dup/stale must be built on knowledge; ia-conformance/space have no home), not wiring gaps. The blanket "wiring gap, not design gap" overstates readiness.

**Fix.** Split the claim: `lint/links/orphans/render` = wiring gap (backend exists on wiki-api); `duplicates/staleness` = design gap → **knowledge** (unbuilt); `ia-conformance`/`space` = design gap (no server home).

**Evidence.** `evidence-orvex-cli.md §3` (route table + `wiki verify` stub list).

---

## C7 — Baseline note + Open-Q #10 — CURRENCY DEFECT, MED — CI-RED / D-CLI1 false-green presented as flatly current; canon says it is UNVERIFIED past 2026-07-15

**What's wrong.** The draft's "Baseline @HEAD" and Open-Q #10 ("Fix the CI-RED false-green (D-CLI1) **FIRST**") state the red state as present-tense fact. The finding is **well-grounded** in `evidence-canon-cli.md` (Wave-3 pack, `UQFNh4QEmw`/`6NVIjKeiWs`/`lhqTzMTPCj`/`8GNuGKq8wn`) — so this is not fabrication — **but its currency is overstated.** `wiki-study/orvexcli.md:114` is explicit: *"CI-RED / D-CLI1 … dated 2026-07-13 to 2026-07-15 (last measured) … has NOT been re-verified as of 2026-07-17 … do not assume it's still red, but do not assume it's fixed either — UNVERIFIED past 2026-07-15."* And `evidence-orvex-cli.md:6` observed `go test ./... all green`. Per the standing "certified ≠ current" doctrine, an as-of-07-15 finding may not be true on 07-17.

**Fix.** Keep the finding but carry the mandatory hedge: "CI-RED per canon as of 2026-07-15 — **unverified past 07-15; reality-probe live before treating as current.**" Do not phrase as an established present-tense blocker.

**Evidence.** `wiki-study/orvexcli.md:114`; `evidence-canon-cli.md:53,112`; `evidence-orvex-cli.md:6`.

---

## C8 — Row 21 (`audit`) — DROP-WITHOUT-CHECKING-SETTLEDNESS, MED — "read/query moves off the CLI, emit-only" asserted as settled against an un-built service

**What's wrong.** Row 21 says "Read/query moves off the CLI to the audit service" and files the CLI leg as **emit-only**. But the audit service is **Daniel's incoming design** — memory `audit-compliance-service-incoming`: *"R16 artifacts = seam reservations only, his design supersedes."* docmost-cli shipped `audit log` / `audit summary` **read** verbs (`evidence-docmost-cli.md §12`). The draft removes the CLI audit-read leg and defers it to a service that does not yet have a settled query contract, without confirming the agent/CLI retains **any** audit-read path (knowledge-style no-public-host risk). Dropping a real capability onto an unbuilt home is a deferral, not a disposition.

**Fix.** Reframe: audit **write/dual-write** = emit-only via wiki-api forward (fine); audit **read/query** CLI home = **OPEN, pending the incoming audit-service design** — flag as an open dependency, not a settled removal.

**Evidence.** memory `audit-compliance-service-incoming`; `evidence-docmost-cli.md §12`; `synthesis-parity.md A.6` (read/query "moves off these surfaces" is the R16/R25 *reservation*, not a built contract).

---

## C9 — Row 37 (`apikey force-grant`) — WEAK DROP RATIONALE, MED — "API-key management is gone" mis-states the code

**What's wrong.** Row 37's rationale: *"API-key management is gone with SSO cutover; no client-side key. Correct."* API keys are **not gone** — the engine ships a clean-room `core/api-key` implementing FR-11 auth + CRUD (ENG-1380 **Done**, `synthesis-parity.md A.10`), and the fork moved key *management* to a UI/portal surface (`evidence-fork-client.md §4.3` `orvex-api-docs-settings.tsx`, `§5` `api-key/utils/mcp-enabled.ts`). What is dropped is the **CLI's force-grant leg**, and PO-D4 would home API-key management on **identity/portal**. The drop is defensible but its stated reason is wrong, and it skips the dependent: headless service-account credential issuance (mostly covered by SSO + headless `--token`, but that substitution should be named, not assumed).

**Fix.** Reframe: "CLI `apikey force-grant` dropped; API-key management → **identity/portal** surface (engine FR-11 clean-room persists). Service-account issuance covered by SSO + headless bearer — confirm no agent flow needs a CLI key-mint leg."

**Evidence.** `synthesis-parity.md A.10`; `evidence-fork-client.md §4.3, §5`.

---

## C10 — Row 30 (`code graph`) — WEAK DISPOSITION, MED — adopted from precedent with no first-principles / PO-D4 family-membership argument

**What's wrong.** Row 30 files `code graph` (tree-sitter code dependency-graph) as **adopt-reshaped, "same two-variant posture; defer"** — i.e. kept because docmost-cli had it. Under PO-D2 (challenge everything from first principles) and PO-D4 (name the serving family member), tree-sitter code analysis composes **none** of wiki / knowledge / ai / identity / audit / billing — it is an orthogonal code-intelligence capability with no home in the AI-*wiki*-surface family. The disposition names a *build variant* (`orvex-full`) but never a *serving service* or a first-principles reason a wiki/knowledge CLI should ship it.

**Fix.** Either name the family member it serves (none is obvious → likely a scope-out) or mark it **rethink/drop (out-of-family)**, not a quiet "adopt-reshaped, defer." Same challenge applies more weakly to Row 29 (`screenshot`) — but screenshotting *rendered wiki pages* is at least wiki-adjacent doc-QA, so it survives on a thinner-but-real argument; `code graph` does not.

**Evidence.** `draft-cli.md` P2 rows; PO-D2/PO-D4 (`po-decisions/2026-07-17.md`).

---

## C11 — Row 14 (Block authoring) — VERIFY/COUNT DEFECT, LOW-MED — the embed counts are internally inconsistent with the evidence enumeration

**What's wrong.** Row 14 says "28 subtypes, 29→21" and "**Drop the 6 Linear embeds**." `evidence-docmost-cli.md §5` actually **enumerates 30 block names** including **7** `linear_*` types (`linear_entity, linear_cycle, linear_roadmap, linear_mention, linear_graph, linear_issue, linear_view`) — while its own prose header says "28 subtypes / 6 of 28 Linear." The evidence is self-inconsistent and the draft inherited the wrong figure (6 Linear, not 7). Also `rm` is a *remove operation*, not an embed type, and `orvex_dashboard` is a separate D-S24 drop (not a Linear embed). The disposition (drop all Linear embeds, rebuild `orvex_dashboard` generic) is unaffected — but a planner using "6 Linear / 21 retained" will mis-count.

**Fix.** Recompute from the actual enumeration: 7 `linear_*` embeds drop, `orvex_dashboard` drops (D-S24), `rm` is an op not a type → recount "retained non-Linear embeds" precisely and cite the 7 (not 6) Linear types.

**Evidence.** `evidence-docmost-cli.md §5`; `evidence-fork-client.md §2`.

---

## C12 — MISSING ROW, MED-LOW — `ai memory` read/write leg (serving: ai) — net-new, silently omitted

**What's wrong.** The ai satellite owns memories (`evidence-fork-server.md §3.1` `ai-memories`), the MCP carries `memory_recall`/`memory_propose` (highest-scored hero verb per `evidence-mcp-research-corpus.md`), and the amazing-MCP mandate is "cover everything useful." The draft **adds** net-new AI-first rows it judged worthy (schema, Skill file, rate-limit, async-batch) but omits any `ai memory` CLI leg, without a drop-decision. PO-D4 ("compose the ai family") makes this at least disposition-worthy. Lower confidence because it is net-new (no docmost-cli baseline) and PO-D1 is MCP⊇CLI, not CLI⊇MCP — so this is a *candidate*, not a hard parity gap.

**Fix.** Add a row (or an explicit "no CLI leg — MCP-only, reason X" drop): **`ai memory` list/add/recall** | serving = **ai** | state = missing (net-new) | disposition = adopt-reshaped **or** documented drop.

**Evidence.** `evidence-fork-server.md §3.1`; `evidence-mcp-research-corpus.md` (memory_recall force-matrix top score); PO-D4.

---

## C13 — MISSING ROW, LOW-MED — `wiki whoami` (tenant self-discovery) is a real kept primitive with no row

**What's wrong.** `evidence-orvex-cli.md §3` documents `wiki whoami` as a **real, new** primitive (wiki-api `GET /v1/whoami`, surfaces `workspace_id`/`workspace_name`/`default_space_id`) added specifically to fix a genuine blind spot — a fresh tenant previously had "no way to learn its auto-provisioned space id short of a privileged DB SELECT." It is distinct from `auth whoami` (→ identity). The draft's Row 12 (Auth+profiles) covers `auth whoami`→identity but the list has **no row** for `wiki whoami`→wiki-api.

**Fix.** Add a small row: **`wiki whoami`** | serving = **wiki-api** | state = **done** | **adopt** (agent tenant-bootstrap primitive; keep).

**Evidence.** `evidence-orvex-cli.md §3` (`wiki whoami` fix11).

---

## C14 — Row 26 (Config) — VERIFY/OVER-CLAIM, LOW — "endpoints real" is asserted; evidence only presumes it

**What's wrong.** Row 26 state = "partial — `endpoints` real; `set`/`migrate` stub." `evidence-orvex-cli.md §9` does **not** confirm `endpoints`; it says *"(not read in detail — has `endpoints` **presumably** real given `doctor` shares the resolver)"*. The draft upgraded a hedged presumption to a stated fact.

**Fix.** Downgrade to "`endpoints` **presumed-real (unconfirmed)**; `set`/`migrate` stub" — a one-word hedge, but the list elsewhere leans on exactly this kind of unverified "real" (see C1/C2).

**Evidence.** `evidence-orvex-cli.md §9`.

---

## Cross-cutting pattern (for the PRD redo)

The four HIGH/MED verify defects (C1, C2, C5, C6) plus C14 are one recurring failure: **the draft
applies the "client-completeness ≠ live-correctness" skepticism selectively.** It marked
`comment/label/attach` "broken" (correctly) but rated the *same-risk* `governance`, `wiki migrate`
archive facade, and `page/nav` verbs "real/done," and upgraded a hedged `config` presumption and a
stale-caveated CI-red finding to flat facts. Recommendation: apply one uniform evidence rule to
**every** resource-shaped verb group — any client method whose route is not confirmed in the live
wiki-api mux (`evidence-orvex-cli.md §3` table) is **partial/unverified**, never "real/done," until a
`served-openapi-diff` conformance gate proves it. That single rule collapses C1, C2, C5, C6, C14 and
prevents the next unswept 404 class.
