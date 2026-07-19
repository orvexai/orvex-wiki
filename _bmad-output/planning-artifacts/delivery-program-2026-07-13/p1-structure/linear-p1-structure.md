# Phase-1 Definition Factory — Linear structure receipt (filed 2026-07-14)

Filed by the orchestrator under PO standing authority, per the program plan (`5eFdxN3edd`
§Tracking structure), the Phase-1 prompt (`yXUWpQpRjx` §5), and the Issue Authoring Prompt
(`9VUHxAcoXw`, adapted to definition-pack work — see judgment calls below). Bodies were
authored by a 62-agent authoring/verify/fix pipeline + a 22-agent canonical-❌ normalization
pass; every body passed an independent conformance verify (reviewer ≠ author).

## Milestones (17)

- Hub `Orvex Studio — Delivery Gates`: **P1 — Definition Factory** (`d8295b4e`, target 2026-07-27) — pre-existing.
- **16 per-service milestones created** (same name, target 2026-07-27) on: Orvex CLI, Orvex Studio
  AI / API / Billing / Console / Contracts / Identity / Knowledge / Lib / MCP / Staging / UI /
  Workflows / Workgraph, Orvex Wiki, Orvex Wiki API.
- Created via `linearis milestones create` — the CLI now supports milestone creation; the
  "milestone creation needs the Linear MCP" note in `yXUWpQpRjx` §5 is stale.

## Issues (20 new; ENG-2037 recast as the Wave-1 gate)

| Wave | Issue | Key | Project |
|---|---|---|---|
| 1 | ENG-2091 | pack-contracts | Orvex Studio Contracts |
| 1 | ENG-2092 | pack-lib | Orvex Studio Lib |
| 1 | ENG-2093 | bridge-proof (Go↔TS, ADR-0035) | Delivery Gates hub |
| 1 gate | ENG-2037 (existing) | wave-1 gate | Delivery Gates hub |
| 2 | ENG-2094 | pack-staging | Orvex Studio Staging |
| 2 | ENG-2095 | pack-workgraph | Orvex Studio Workgraph |
| 2 gate | ENG-2096 | wave2-gate | Delivery Gates hub |
| 3 | ENG-2097 | pack-ai | Orvex Studio AI |
| 3 | ENG-2098 | pack-api | Orvex Studio API |
| 3 | ENG-2099 | pack-knowledge | Orvex Studio Knowledge |
| 3 | ENG-2100 | pack-billing | Orvex Studio Billing |
| 3 | ENG-2101 | pack-identity | Orvex Studio Identity |
| 3 | ENG-2102 | pack-mcp | Orvex Studio MCP |
| 3 | ENG-2103 | pack-wiki | Orvex Wiki |
| 3 | ENG-2104 | pack-wiki-api | Orvex Wiki API |
| 3 | ENG-2105 | pack-cli | Orvex CLI |
| 3 | ENG-2106 | pack-console | Orvex Studio Console |
| 3 | ENG-2107 | pack-workflows | Orvex Studio Workflows |
| 3 gate | ENG-2108 | wave3-gate | Delivery Gates hub |
| 4 | ENG-2109 | pack-ui | Orvex Studio UI |
| 4 gate | ENG-2110 | wave4-gate (Phase-1 exit) | Delivery Gates hub |

All 20 created at `Todo` (never Backlog), each verified by re-read (project + milestone +
state). Pack issues sit in their service's project under its P1 milestone; the bridge proof
and wave gates sit in the hub under the hub P1 milestone.

## Dependency graph (36 blocked-by edges; the Frontier derives from these)

- Ready now: **ENG-2091 (contracts), ENG-2092 (lib)** — Wave 1 packs have no blockers.
- ENG-2093 ← 2091, 2092 · ENG-2037 ← 2091, 2092, 2093 (Wave-1 gate).
- ENG-2094, ENG-2095 ← ENG-2037 · ENG-2096 ← 2037, 2094, 2095 (Wave-2 gate).
- 11 Wave-3 packs (2097–2107) ← ENG-2096 · ENG-2108 ← 2096 + the 11 (Wave-3 gate).
- ENG-2109 ← ENG-2108 · ENG-2110 ← 2108, 2109 (Wave-4 / Phase-1 exit gate).

## Judgment calls (orchestrator, under PO standing authority — logged in po-decisions)

1. **9-section standard adapted for definition work**: the guide is code-issue-shaped; pack
   issues carry all 9 sections with the binary DoD gate = review PASS + contract TAG +
   five wiki drafts + H1–H17 self-audit + SDD completeness; ❌ rows assessed
   APPLICABLE/NOT-APPLICABLE per the guide's own rule.
2. **ENG-2037 recast as the Wave-1 gate** (blocked-by the decomposed per-service packs) —
   per-service tracking doctrine from the plan; decomposition comment posted on ENG-2037.
3. **Same-name per-service milestones** ("P1 — Definition Factory") — mirrors the P0
   "P0 — Stabilize the Ground" precedent.
4. **linearis used for milestone creation** — capability exists now; no human escalation
   needed; `yXUWpQpRjx` §5's escalation note is stale.
5. **Wave gates as hub issues** (ENG-2096/2108/2110) mirroring ENG-2037, encoding the
   plan's strict wave order without flooding every pack with cross-edges.
6. **Ground-truth refresh**: bodies citing the 2026-07-14 morning verdict were updated to
   the evening prod-spine acceptance (po-decisions Phase-4 walk: 6/8 PASS; residuals
   rag/ai/cli) with the morning dev-cell ledger (ENG-2039..2054) kept as the filed defect list.

## Artifacts

- Issue bodies: `p1-structure/issue-bodies/<key>.md` (source of the filed descriptions)
- Authoring standard: `p1-structure/authoring-brief.md` · specs: `p1-structure/specs.json`
- Write ledger: `p1-structure/ledger.json` · filing script: `p1-structure/file-p1-structure.py`

## The story corpus (filed 2026-07-14 evening, PO-directed expansion)

PO directives during the run: 100s of issues covering the ENTIRE PRD surface; opus agents
extensively reading all documentation; a code audit; NO epic issues (Linear = projects +
milestones); per-service isolated-build milestones + an E2E tail.

- **Decomposition:** 16 opus agents read every service's PRD + Architecture live from its
  wiki space (+ brief `rgBOQh31p3` + concept-to-service map + digests) → **133 feature areas /
  575 stories**; FR coverage independently verified per service (fill passes closed all gaps).
- **Code audit:** 16 opus agents audited each repo at its origin default branch (disposable
  worktrees; staging/workgraph cloned): **178 present / 208 partial / 189 absent**; stamped
  per-story into every issue body ("present" → VERIFY + harden, do not rebuild); ahead-of-main
  branches noted (ENG-2069 hazard).
- **Filed:** stories **ENG-2111..ENG-2685** (575, status Todo) in their service projects under
  **133 per-service build milestones** `B<n> — <feature area>` (milestone descriptions carry the
  area narrative + FR ids; Linear name cap ~80 chars → clipped). Every story blocked-by its
  service's Definition Pack (ENG-2091..2109) — the contract TAG is the dispatch gate.
- **E2E tail (hub):** milestones "P2 — Isolated Builds" (2026-08-24) + "P2.5 — Product
  Acceptance E2E" (2026-09-08) + umbrella issue "[E2E] P2.5 Product Acceptance…" blocked-by
  ENG-2110, alongside the existing M11/M13/M14 closing gates.
- Ledger: `ledger-corpus.json` · breakdown: `breakdown/<svc>/{plan.json,audit.json,bodies/}` ·
  browsable map: claude.ai/code/artifact/65bf8419-abb5-4bab-8857-42a3dbeced41

## Post-filing coverage fix (2026-07-14, late evening)

PO question "what about browser plugins?" surfaced a real hole: the Memory gap-closure PRD
`g9vWbSYplh` F1 (Tier-1 flagship, FR-D1..D7) requires a **browser-extension component** —
"a NEW browser-extension component (F1)"; fold-in home "a new extension/mcp spec" (AD-5a =
the extension client port; the MCP is explicitly NOT it, AD-5b). It is a 17th component with
no repo, no wiki space, and no concept-to-service-map assignment, so the per-service
decomposition + per-service coverage audits structurally could not own it: **zero stories
covered FR-D1..D7** (FR-D6's vendor-API sync-out half was covered in knowledge; FR-O2 chat
import covered in api/ai/ui). Filed the fix in the hub under P1 — Definition Factory:
- **ENG-2689** — [F1][SPIKE] ToS + web-UI-durability go/no-go (the PRD's own gate; ready now)
- **ENG-2690** — [FACTORY] browser-extension component definition pack (blocked-by ENG-2689 +
  ENG-2037; component stories born from the pack once the mechanism ruling lands)

**Extension story corpus (2026-07-15, PO probe "all issues?"):** 6 build milestones /
**20 stories ENG-2711..2730** decomposed from `g9vWbSYplh` F1, coverage-verified
(FR-D1..D7 + FR-O4 + AD-5a each owned), all blocked-by ENG-2690, every mechanism-shaped
story carrying the ENG-2689 spike-contingency line; audit = absent (scaffold repo).
Breakdown: `breakdown/extension/` · ledger: `gap-hunt/ledger-extension.json`.

**PO ruling (same evening): the extension is a SEPARATE first-class component — stood up:**
Linear project **"Orvex Studio Extension"** (`fa731289`, 18th member of the initiative) with
its own "P1 — Definition Factory" milestone (ENG-2689/2690 re-homed there, verified) · wiki
space **`orvexstudioextension`** · private repo **`orvexai/orvex-studio-extension`**
(governance README @ `b568ba6`; CI/scaffold land with the pack's foundation stories, per
family practice). Remaining must-resolves live on ENG-2690: store-distribution posture +
the OQ1 mechanism ruling (owned by the ENG-2689 spike).

## Trust sweep — the comprehensive gap-hunt (2026-07-14/15 night, PO-directed)

Method (all adversarially verified, reviewer ≠ finder): 18-space canon inventory → full-read
of EVERY requirement-bearing page the decomposition never consumed (48 + 75 = 123 pages; the
canon is now 100% swept) → component census (repos × Linear projects × canon births) → brief
feature re-diff → fold-in audit of `g9vWbSYplh`/`vBvVDFklZo`. Candidate gaps: ~20; survivors
after adversarial verification: **15** (notable refutations: FR-O4 is owned by ENG-2690;
OTel tracing claims were REFUTED because ENG-1599/1600 shipped outside plan.json).

**Filed fixes ENG-2696..2710** (each blocked-by its pack; Gap-provenance line in §4):
outbound Memory sync (knowledge, NEW milestone B11) · AI-privacy setup (ui) · task-first
wizard UI (ui) · Orvex-rating assembler (api) · marketplace GitHub-seeding (api) · FR-O1
first-run seeding (api) · FR-O3 designed empty states (ui) · NFR-7 i18n readiness (ui) ·
ADR-0011 mint-side cell claim (identity) · ADR-0015 7a at-rest encryption helper (identity)
· ADR-0004 #2 cell-lint reason-required (contracts, verify-harden) · ADR-0020 MCP
cell-discovery routing (mcp, verify-harden) · ADR-0035 TS CloudEvent codegen (contracts) ·
ADR-0015 7b existence-read op (contracts) · orvex-ds ownership (ui, PO must-resolve).

Root causes recorded: (1) cross-cutting PRDs birthing NEW components escape per-service
sweeps (extension, orvex-ds); (2) brief promises without formal FR ids escape id-keyed
coverage audits; (3) family ADR obligations (orvexstudioarch) bind services without
appearing in their PRDs. All three checks are now part of this receipt's method.

## Ratified-canon ticket sweep (2026-07-15 — "loose ends + cross-AI memory")

After PO ratified the six extension pages (all canonical; counsel ENG-2734 = provisional GO,
develop-first), a 7-lens sweep (each page + an end-to-end cross-AI memory-loop walk) found
33 candidates → **25 verified tickets filed, ENG-2739..2763**, 4 new milestones:

- **Server-side seam halves (the biggest hole):** api B10 "Cross-AI delivery seam" — Shape 1a
  compose-validation/outcome-report (reserve-then-spend token) + Shape 3 canary ingest;
  identity Shape 2 mint tightening (composedTextRef binding, scope re-resolve); contracts B8
  —

- The pack wiki drafts themselves (5 artifacts × 16 services) — Phase-1 authoring work.
- Contract tags — cut by pack execution; the TAG is the Phase-2 dispatch gate; at
  certification each pack refreshes its service's stories with the pinned tag/versions.
