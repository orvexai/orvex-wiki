---
name: review-adversary-orvex-studio-staging
type: architecture-review
lens: adversarial-spine (configured gate floor — "two compliant units that build incompatibly")
target: ../ARCHITECTURE-SPINE.md
prd: ../../../prds/prd-studio-staging-area-2026-07-09/prd.md
reviewer: adversary
date: 2026-07-10
verdict: 14 holes
---

# Adversarial Spine Review — orvex-studio-staging

**Method.** For each plausible pair of one-level-down units (intake+quota · triage/routing/beautify · review-queue+policy · apply-engine + workflows · maintenance-sweeps · learning/prompt-pack · MCP/CLI surface · migration/hard-cut · contracts), I built two implementations that each obey **every AD as written** yet cannot integrate — clashing shared shapes, one entity with two writers, divergent ordering/idempotency/versioning assumptions, or a validation seam each side thinks the other owns. Every such pair is a hole the ADs fail to pin. Ranked by likelihood × blast radius.

**Verdict: 14 holes.** Two are release-blocking (H1, H2): they silently defeat the two guarantees the PRD sells as its differentiated heart — "a confident mis-route can't hide" (FR-STG12) and "auto-applied content isn't agent-groundable" (SM-C3). The spine's paradigm is sound; the gaps are almost entirely *shared-shape semantics the prose gestures at but never fixes as a field, scale, owner, or chokepoint*.

---

## Summary table

| # | Pair | Clash | Severity |
| --- | --- | --- | --- |
| H1 | triage/routing ↔ review-queue/policy | routing-confidence scale/direction/producer unpinned → adjudication lane inverts | **CRITICAL** |
| H2 | apply-engine ↔ workflows | Idempotency-Key derivation unpinned → double wiki writes on replay | **CRITICAL** |
| H3 | triage/beautify ↔ review-queue/apply | beautified content not hash-bound → approved diff ≠ applied bytes | HIGH |
| H4 | apply ↔ review-queue ↔ knowledge | groundability flag home + writers unpinned, collides with forbidden edge → SM-C3 leak | HIGH |
| H5 | intake ↔ apply/conflict | base-version token type (version int vs updated_at) → silent overwrite or spurious conflict | HIGH |
| H6 | review-queue ↔ learning | Feedback Event pack-version = decision-time vs produce-time → learning attribution corrupts | HIGH |
| H7 | learning ↔ policy ↔ quota | Trust Tier writer/cadence/read-consistency unpinned → admit-then-gate, mid-session drift | MED-HIGH |
| H8 | apply ↔ scheduled ↔ sweep | cross-ChangeSet concurrency on one page unarbitrated → interleaved block-ops | MED-HIGH |
| H9 | triage/apply ↔ contracts | divert target: spine says workgraph, PRD says memory → cross-service miswire | MED-HIGH |
| H10 | intake ↔ apply/beautify | content-schema validation ownership seam → late mid-apply failures | MED |
| H11 | triage/beautify ↔ apply | beautify reassigns section block IDs → AD-3 anchor re-resolution spurious-conflicts | MED |
| H12 | MCP/CLI ↔ intake | public submit not idempotent → retry = duplicate Proposals, quota burn | MED |
| H13 | quota ↔ lifecycle | "in-flight" state-set for caps undefined → cap under/over-counts | MED |
| H14 | surface/scheduling ↔ workflows | scheduled fire-time timezone storage unpinned → wrong-hour / DST applies | MED |

Also flagged (shape overload, low-med): **"receipt"** names two different contracts (submit vs apply) — see H15 note.

---

## H1 — Routing-confidence has no fixed scale, direction, or single producer  [CRITICAL]

**Pair.** triage/routing epic (produces the score) ↔ review-queue/policy epic (thresholds it into the mandatory adjudication lane).

**Both obey the ADs.** AD-6 says routing candidates come from `orvex-studio-knowledge`'s query API. AD-7 makes routing confidence one of the four verdict inputs and says "routes below the confidence threshold always join the mandatory per-item adjudication lane … excluded from bulk-accept." FR-STG7 says the Librarian "produces a routing-confidence score." Nothing fixes (a) the **range** ([0,1]? 0–100?), (b) the **direction** (is it *confidence*, higher=better, or a vector **distance**, lower=better — the natural output of a knowledge similarity query?), or (c) the **single producer** (the knowledge match score vs the Librarian LLM's self-assessed confidence — AD-6 and AD-7 each imply a different origin).

**Clash.** Routing team, reading AD-6, emits knowledge's cosine **distance** (0 = perfect match). Policy team, reading AD-7 ("below the confidence threshold"), treats the field as **confidence** and gates anything *below* the threshold. Result: perfect routes (distance ≈ 0) fall below threshold and get gated; garbage routes (distance ≈ 1) sail through as "high confidence" into bulk-accept. The mandatory adjudication lane inverts. The one failure the PRD spends FR-STG12 to make un-hideable — "a confident mis-route cannot hide inside a 2-second bulk skim" — is exactly what ships, silently. This also poisons SM-2 (acceptance) and SM-C3.

**Blast radius.** The differentiated heart of the product. Not caught by types (both are `float`); caught only in production by a wrong-page apply.

**Fix (tighten AD-7 + new convention row).** Pin: `routing_confidence` is a **float in [0.0,1.0], 1.0 = certain match**, and is the **single fused value emitted by the `routing` package** (it may *consume* the knowledge similarity score as an input, but knowledge never emits the authoritative field). The adjudication **threshold is per-tenant config read by `policy` only**; surfaces and triage never compare it. Add a Data-&-formats convention row: `routing_confidence float[0,1] · route_source enum · confidence_threshold ∈ tenant policy config`. The Disposition schema in contracts carries these as named, ranged fields.

---

## H2 — Idempotency-Key derivation across the workflows↔apply seam is unpinned  [CRITICAL]

**Pair.** apply-engine epic (staging `/internal/*` step-APIs) ↔ workflows epic (`orvex-studio-workflows`, a **different repo/team**, drives the Temporal activities).

**Both obey the ADs.** AD-5: activities call idempotent `/internal/*` step-APIs, "`Idempotency-Key` mandatory, payloads are IDs only … each step-API is a small CAS state transition, so any retry/replay is a no-op." The convention row repeats "`Idempotency-Key` on all `/internal/*`." Nothing says **how the key is derived**, and AD-5 leans on **two** dedup mechanisms at once (the key *and* the CAS state guard) without saying which is authoritative.

**Clash.** Workflows team derives the key per-**activity-attempt** (a fresh UUID each Temporal retry — a defensible reading of "mandatory key"). Apply team assumes the key is stable per logical step and uses it as the dedup authority, *and* relies on the CAS state guard. On a Temporal replay after a heartbeat timeout where the first attempt already wrote to wiki-api but the state-commit hadn't landed, the retry arrives with a **new** key **and** finds the Proposal still in `applying` (CAS guard passes) → it calls wiki-api a second time. wiki-api's own `ifVersion` CAS may catch it — or may not, if the first write already advanced the version and the second carries the post-write version from a re-read. Double-apply / double history row — precisely the engine-abuse the whole PRD exists to prevent.

**Blast radius.** Corrupts live customer wikis on ordinary retry paths; violates NFR-STG3 (resumable, replay-safe) at its core.

**Fix (tighten AD-5, pin in the contracts step-API spec).** `Idempotency-Key = deterministic f(workflow_run_id, step_name, target_id)` — **stable across every retry/replay**, never a per-attempt UUID; the workflows contract mandates this derivation. Staging persists a **keyed result row** and returns the stored result on key collision; the key is the **primary** dedup authority and the CAS state guard is defense-in-depth, not the mechanism. State this explicitly in AD-5.

---

## H3 — "The approved diff IS the final content" is never bound to an immutable artifact  [HIGH]

**Pair.** triage/beautify epic (re-authors content) ↔ review-queue/apply epic (renders the diff, then writes bytes).

**Both obey the ADs.** AD-13: "the rendered diff the reviewer approves IS the final content; apply performs mechanical engine writes only … apply verification is full-text + effective-marks equality per affected section." AD-10 stores **Proposal bodies and pre-mutate snapshots** in S3 by sha256 — but the **beautified re-authored content is neither**; it's a new artifact produced at triage, and no AD says where it lives or that it's immutable.

**Clash.** Beautify team stores a human-facing **display diff** (HTML/text) on the Disposition and treats the ProseMirror as regenerable. Apply team, reading "mechanical writes only," re-invokes beautify at apply time to get ProseMirror — or reads a separately-stored `final_content` field that beautify overwrote when the pack version changed between triage and a scheduled apply (FR-STG28 can delay apply for hours). The human approved artifact X; apply writes artifact Y. AD-13's equality check passes (it verifies apply wrote *what apply intended*, not *what the human saw*).

**Blast radius.** Breaks the core review-what-you-apply promise; worst under scheduled applies and re-triaged conflicts.

**Fix (tighten AD-13 + extend AD-10).** Beautify writes the final re-authored content as an **immutable S3 artifact addressed by sha256**; the Disposition stores that hash; **the queue renders from that hash and apply reads the identical hash**, refusing any content whose hash differs (**no apply-time re-authoring, ever**). Add the beautified-content prefix to AD-10's declared datastore set / `TenantMoveManifest`. A re-triage (conflict rebase) mints a **new** hashed artifact and a new human approval — never mutates the approved one.

---

## H4 — The AI-groundability / review-state flag has no fixed home and two writers, and its natural home collides with a forbidden edge  [HIGH]

**Pair.** apply-engine epic (sets auto-applied-unreviewed ⇒ not-groundable) ↔ review-queue epic (post-hoc review flips it groundable; humans also set it directly) ↔ knowledge retrieval (must read it to gate grounding).

**Both obey the ADs.** AD-7: "auto-applied-but-unreviewed content is not agent-groundable until post-hoc review flips the FR-STG22 flag, and the flag itself is human-settable and decoupled from human ACLs." FR-STG22: "the Librarian **and agent retrieval** respect it." The dependency-direction block forbids `ai/knowledge → staging store`. The flag is a property of a **wiki page**, but staging cannot write the engine DB (forbidden edge), and knowledge cannot read the staging store (forbidden edge).

**Clash.** Apply team writes the flag as a **staging-store** annotation keyed by page (natural — apply owns the auto-apply path). Review team flips it in the same staging store. But **knowledge retrieval cannot legally read the staging store** — so either it never sees the flag (every auto-applied page stays groundable → SM-C3 leak, "zero by construction" violated) or knowledge grows an illegal read edge. Meanwhile a second team writes it as **wiki-api page-meta**; now there are two sources of truth for one flag and they disagree.

**Blast radius.** SM-C3 is a declared **leak alarm** ("any non-zero value"), and this is the exact amplification loop (AI-writes→AI-grounds→AI-writes) the Vision indicts competitors for.

**Fix (new AD, or tighten AD-7/FR-STG22 mapping).** The groundability + review-state flag is **wiki-page metadata written ONLY through wiki-api** — by the apply engine when it auto-applies-unreviewed, and by the review path via the **same wiki-api call** on post-hoc review; knowledge reads it from the wiki/contracts existence API, **never from the staging store** (preserves the forbidden edge). Staging may hold a read-only mirror for queue display, never the source of truth. Pin the flag's owning store and its single mutation path (wiki-api) in an AD.

---

## H5 — "base-version" is stamped and re-checked with no fixed token type  [HIGH]

**Pair.** intake epic (stamps base-version at submit, FR-STG4) ↔ apply/conflict epic (re-checks it and does the CAS write, AD-3/AD-4).

**Both obey the ADs.** FR-STG4/glossary say the Proposal records "the page's current **version/updated-at**" — two options, either compliant. AD-3: "base-version stamps at submit; pre-apply re-check reads the authoritative content path … a moved base at the conflict key = `conflict`." AD-4: apply uses wiki-api "CAS `ifVersion`." Neither names the **token type**.

**Clash.** Intake stamps `updated_at` (a timestamp — the literal other option in FR-STG4). Apply does `ifVersion` CAS, which needs the wiki's **opaque monotonic version token**, which intake never captured. Either apply can't form the CAS precondition, or it compares timestamps — unreliable against the engine's ≤45s debounce and clock skew (AD-3 itself warns the content column is ≤45s stale). Silent overwrite of a human edit that landed inside the debounce window, or spurious conflicts on every Proposal.

**Blast radius.** Directly undermines AD-3's "prevents silent overwrites of human edits."

**Fix (tighten AD-3/AD-4 + convention row).** `base_version` is the **wiki-api version token used verbatim as the `ifVersion` CAS value** — an opaque monotonic version, **not** `updated_at`. Intake stamps exactly that token; `updated_at` is display-only and never enters a conflict comparison. Add a Data-&-formats convention row naming the `base_version` token type and its sole comparison path.

---

## H6 — Feedback Event pack-version: decision-time vs produce-time  [HIGH]

**Pair.** review-queue epic (records the human decision) ↔ learning epic (consumes Feedback Events for attribution + the held-out harness).

**Both obey the ADs.** AD-14: "Feedback Events are append-only rows linked to Proposal + Disposition + **pack version**." FR-STG15: linked to "the prompt-pack version **that produced it**." The review epic writes the event; nothing pins whether it stamps the **produce-time** pack version (bound at triage) or the **currently-active** version at decision time.

**Clash.** Review team stamps the tenant's **currently-active** pack version (the obvious read: "what pack is live now"). But a self-proposed or marketplace pack revision (FR-STG29) may have activated between triage and Marta's morning review. The Feedback Event now credits/blames the **wrong** pack version. FR-STG16's exemplars-on/off held-out harness and FR-STG17's "prompt-pack revision changelog with measured effect" both read this linkage — attribution silently corrupts, and the learning-effect validation (the thing that lets Priya trust the dial, UJ-3) measures noise.

**Blast radius.** Learning transparency + the trust story that justifies raising the autonomy dial.

**Fix (tighten AD-14).** Every **Disposition immutably records the `pack_version` (and exemplar-set version) that produced it**; the Feedback Event **inherits `pack_version` from the Disposition it decides** — it never re-reads the tenant's active pack. State the produce-time-provenance rule in AD-14.

---

## H7 — Trust Tier: no single writer, no recompute cadence, no read-consistency rule  [MED-HIGH]

**Pair.** learning epic (recalibrates tiers, AD-14) ↔ policy epic (reads tier for the verdict, AD-7) ↔ quota epic (reads tier to throttle admission, AD-7 "Trust Tiers also gate intake pace").

**Both obey the ADs.** AD-2 pins single-writer discipline only for **Proposal/ChangeSet state columns** — Trust Tier is not a lifecycle state column, so **AD-2 does not protect it**. FR-STG11 says tiers are "recomputed continuously" without naming the writer; AD-14 says learning does "tier recalibration"; AD-7 makes both policy and quota readers.

**Clash (two-writer + read-skew).** One team materializes Trust Tier as a column written by the `learning` recalibration job. Another team, reading FR-STG11's "recomputed continuously," computes eligibility **on-read** from raw Feedback history inside `policy`. Now the tier has two derivation paths that disagree. Even with one writer: `quota` admits a Proposal on a stale high tier, then `policy` gates its apply on a freshly-recalibrated low tier — the same Proposal is both "trusted enough to enter" and "not trusted enough to auto-apply," inconsistent within one lifecycle. During Marta's bulk-accept, continuous recompute reshuffles the auto-apply-eligible bucket **mid-session** → nondeterministic FR-STG12 buckets.

**Blast radius.** Cross-cuts intake, policy, and the dial. This is the "one entity, two writers" hole AD-2 was written to prevent but doesn't reach.

**Fix (new AD, "non-lifecycle shared entities have a single writer").** Trust Tier is a **single-writer materialized entity owned by `learning`** (the only writer), recomputed on an **explicit cadence**, **version-stamped**. `policy` and `quota` **read the last-committed tier snapshot — never recompute from raw history**. A Proposal pins its tier snapshot **at admission** and uses that snapshot for the life of the Proposal (no mid-lifecycle flip). Generalize the rule to the other mutable shared entities the spine leaves unowned (Autonomy Dial config, active Pack version, groundability flag — see H4).

---

## H8 — Cross-ChangeSet concurrency on one page is unarbitrated  [MED-HIGH]

**Pair.** apply-engine epic (immediate apply) ↔ workflows epic (scheduled publishing, FR-STG28) ↔ sweep epic (maintenance apply).

**Both obey the ADs.** AD-2 scopes all-or-nothing **within a ChangeSet** ("a ChangeSet cannot reach `applied` while any member … is unresolved"). AD-3 sequences multi-Proposal applies **within one ChangeSet** ("re-resolve every subsequent anchor after each write"). Nothing arbitrates **two different ChangeSets** (an immediate apply + a fired scheduled apply + a sweep fix) writing the **same page** concurrently.

**Clash.** Two apply workflows interleave block-ops on one page. wiki-api `ifVersion` catches a *conflicting* write — but AD-3's within-ChangeSet re-anchoring assumes **no external writer moved the page mid-sequence**; a second ChangeSet writing between op-1 and op-2 of the first invalidates every subsequent anchor, turning legitimate edits into a cascade of spurious `conflict`s, or (worse) racing two `ifVersion` reads that both then write. The handling of the **loser** (blind retry? conflict? pause?) is unpinned — each of the three epics picks its own.

**Blast radius.** Grows with tenant activity; the sweep mandate (always-on) guarantees the collision surface.

**Fix (new AD).** Apply acquires a **per-(tenant, page) advisory lock** for the duration of a page's block-op sequence, so no two apply workflows (immediate, scheduled, or sweep) interleave ops on one page; a lost `ifVersion` is always a `conflict` Disposition + explicit ChangeSet pause — **never a blind retry, never a silent overwrite**. Scheduled and sweep applies already re-run conflict-recheck at fire time (FR-STG28) — pin that they do so **under the lease**.

---

## H9 — The divert target contradicts between spine and PRD  [MED-HIGH]

**Pair.** triage/apply epic (handles the `divert-to-memory` Disposition on accept) ↔ contracts epic (authors the divert client/contract).

**The contradiction.** The spine's dependency diagram edge is `DOM --> WG[orvex-studio-workgraph divert]` and the convention row lists lib clients to add as `aiclient, workgraphclient` — i.e., **workgraph**. The PRD FR-STG8 and §9 say `divert-to-memory` packages the content and submits it to the **Cross-Agent Memory service** (`orvex-studio-memory`, sibling PRD FR-MEM1) with two-way cross-links; there is **no memoryclient** in the spine's client list.

**Clash.** The apply/triage team wires `workgraphclient` (per the spine diagram + conventions); the contracts team authors a **memory** item/note contract (per the PRD). They build against different services — the divert path never lands, and the Wiki·Memory·Trash routing (FR-STG8) is broken. No downstream team reading only the spine can know which sibling receives a diverted Proposal.

**Blast radius.** One Disposition path, and it fails loudly (missing client/contract) rather than silently — but it blocks the migration/contracts epics until resolved.

**Fix.** Resolve the target (the PRD is explicit: **`orvex-studio-memory`, FR-MEM1**): correct the dependency-diagram edge, **add `memoryclient`** to the lib-client convention row, and pin the divert contract slug in `orvex-studio-contracts`. If workgraph is genuinely an intermediary, say so and pin both edges.

---

## H10 — Content-schema validation ownership seam  [MED]

**Pair.** intake epic (accepts the submitted payload) ↔ apply/beautify epic (asserts "only schema-registered nodes").

**Both obey the ADs.** The convention row says "content payloads DfM or ProseMirror JSON only (lossy formats rejected)." AD-13's done-bar requires "only schema-registered nodes — zero stripped-node warnings." Neither names the **enforcement point**.

**Clash.** Intake accepts any well-formed ProseMirror JSON (including unknown/unregistered nodes), assuming triage/apply will validate or strip. Apply's done-bar then fails at write time with a stripped-node warning — a **mid-apply pause** on a live wiki (FR-STG13) for what should have been a door rejection. Each side thinks the other owns node-schema validation.

**Fix (new convention row: "validation chokepoint = intake").** Intake validates at submit — DfM/ProseMirror well-formedness **and** only schema-registered nodes — rejecting at the door with a frozen `ErrorCode`; no unknown node ever persists. Beautify/apply trust the door and never re-validate format.

---

## H11 — Beautify may reassign the section's anchor block IDs  [MED]

**Pair.** triage/beautify epic (re-authors a section, AD-13) ↔ apply epic (re-resolves anchors, AD-3).

**Both obey the ADs.** AD-3 keys section conflicts on the stable engine block ID (UniqueID) and re-resolves each subsequent anchor after each write; "an anchor lost … is a `conflict`, never a guess." AD-13 says section ops re-author "ONLY the affected section." Neither says whether re-authoring **preserves the target section's block UniqueID** or mints fresh IDs.

**Clash.** Beautify emits a re-authored subtree with **new** UniqueIDs for the section and its children. Apply writes it; subsequent Proposals in the same ChangeSet that targeted a sub-anchor inside that section now find their anchor "lost" — to **our own beautify**, not a human edit — and become spurious `conflict`s. Multi-Proposal-per-page ChangeSets (UJ-2's 100-proposal case) degrade into conflict storms.

**Fix (tighten AD-13).** Beautify **preserves the target anchor's block UniqueID verbatim**; only genuinely new child nodes receive fresh IDs. Apply's AD-3 re-resolution may therefore assume the target anchor survives beautify. A beautify that cannot preserve the anchor emits `conflict`, never a silent re-anchor.

---

## H12 — Public submit is not idempotent  [MED]

**Pair.** MCP/CLI surface epic (retries on network failure) ↔ intake epic (creates a Proposal per call).

**Both obey the ADs.** The convention/ADR rule is "`Idempotency-Key` on all **`/internal/*`**" — the public `staging_propose` / `orvex-cli staging propose` write is **not** an `/internal/*` step-API, so it carries no idempotency requirement. FR-STG1 says submit is "a single MCP/CLI call."

**Clash.** MCP client times out and retries `staging_propose`; intake creates a **second** Proposal in the ChangeSet. Duplicate proposals inflate the ChangeSet, **burn per-session quota** (FR-STG3/AD-11), and hand Marta duplicate diffs. UJ-1 even warns agents to "not retry-spam" — but the door doesn't enforce it.

**Fix.** Extend the `Idempotency-Key` rule to the **public write verbs**: MCP/CLI generate a per-logical-proposal key; intake dedups on it and returns the same Proposal ID on retry. Add to the Naming/Data convention rows.

---

## H13 — "In-flight" state-set for admission caps is undefined  [MED]

**Pair.** quota epic (enforces per-session/per-tenant in-flight caps, AD-11) ↔ lifecycle epic (owns the state machine, AD-2).

**Both obey the ADs.** AD-11: admission control is "per-session and per-tenant **in-flight** caps." FR-STG3: "in-flight caps." Neither defines **which states count as in-flight**.

**Clash.** Quota team counts `{open, submitted}` only; lifecycle lets Proposals sit in `inreview`/`accepted` for hours (Marta reviews at 9am). The cap under-counts by the entire review backlog → the per-tenant valve (the Stack-Overflow lesson AD-11 cites) never trips, and the queue rots (violates SM-4). Or quota counts everything pre-`applied` and legitimately-accepted-pending work locks out new submissions.

**Fix (tighten AD-11).** Pin the predicate: a Proposal counts against caps while `state ∈ {open, submitted, in-review, accepted}` (i.e., not yet `applied`/`rejected`/`expired`/`rolled-back`). Export it as a **single `lifecycle` predicate** both `quota` and `lifecycle` consume — never two copies.

---

## H14 — Scheduled fire-time timezone storage is unpinned  [MED]

**Pair.** surface/scheduling epic (captures the human's schedule) ↔ workflows epic (fires the apply, AD-5/FR-STG28).

**Both obey the ADs.** FR-STG28 says scheduled publishing is "**timezone-aware**, cancellable until apply-start." AD-5 runs it as a Temporal workflow. Neither pins the **stored shape** (UTC instant vs local wall-clock + tzid).

**Clash.** Surface stores a naive local wall-clock; workflows interprets it as UTC (Temporal's native instant). The apply fires hours off. Or surface stores local+tzid and workflows resolves at a different moment across a **DST** boundary than the human intended.

**Fix (tighten FR-STG28 step-API contract).** Store the fire time as an **absolute UTC instant computed at schedule-creation from the origin `tzid`** (DST captured at creation), **plus** the `tzid` for display/audit. Pin the stored shape in the step-API contract.

---

## H15 — (note) "receipt" names two different contracts

FR-STG1's **submit receipt** (`proposal_id`, `changeset_id`, disposition **forecast**) and AD-4/FR-STG13's **apply per-item receipt** (`item_id`, target page, applied version, status) are both called "receipt." A single overloaded contract type collides; two same-named types confuse the MCP/CLI epic. Worse, UJ-1's submit-receipt **disposition forecast** is pre-triage — if a team wires it to real triage it blows the 500ms submit p95 (FR-STG1). **Fix:** two distinct contract types — `SubmitReceipt` (forecast omitted, or an explicitly non-binding cache-cheap hint decoupled from triage) and `ApplyReceipt`. Never one "Receipt."

---

## What the spine already closes well (not holes)

- **State mutation** (AD-2): single `lifecycle` writer with CAS + same-txn outbox is airtight *for state columns* — the gap is only that non-state shared entities (H4, H7) lack the same rule.
- **Wiki write chokepoint** (AD-4) and **credential-class enforcement at wiki-api** are pinned tightly enough that no two units can open a second write path.
- **Reindex trigger** (AD-9): moving reindex to the engine's `wiki.*` events kills the dual-trigger hole before it exists.
- **Snapshot-for-destructive / inverse-for-additive** rollback split (AD-4/FR-STG13) is unambiguous — I could not construct a divergent pair here (though the snapshot's *fidelity scope* — content only vs content+status+anchors — is one clarification worth a sentence, lest rollback restore content but drop canonical status).
