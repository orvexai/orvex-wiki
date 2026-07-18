# Binding decision register — MCP / wiki-api / CLI redo (evidence-mapper output)

Sources read in full:
- `/home/daniel/repos/orvex-wiki/po-decisions/2026-07-16.md` (orchestrator judgment-call lane, JC-1..JC-4)
- `/home/daniel/repos/orvex-wiki/tools/act3/po-decisions-2026-07-07.md` (1480 lines — the R-numbered PO ruling ledger, R1–R27, plus the 16 kickoff decisions, doctrine, and forensic/CI rulings)
- Supporting cross-checks (NOT po-decisions, cited separately where used): `.cache/linear/issues/ENG-2529.yaml`, `ENG-2464.yaml`, `ENG-1405.yaml`, `ENG-2454.yaml`, `ENG-2535.yaml`; `_bmad-output/planning-artifacts/delivery-program-2026-07-13/p1-structure/breakdown/{mcp,wiki-api}/bodies/*.md`

Only one file matching `po-decisions*` exists outside `po-decisions/2026-07-16.md`: `tools/act3/po-decisions-2026-07-07.md` (plus its `.lock`, not content). No other `po-decisions*` files found under the repo.

---

## 1. R21 — MCP streaming folds INTO the 19-tool surface (the headline ruling)

**Source:** `tools/act3/po-decisions-2026-07-07.md:1446–1448` (heading `## 2026-07-16 — R21: MCP streaming folds INTO the 19-tool surface (R15 × amazing-MCP design reconciled)`)

**Exact text:**
> PO ruling: the amazing-MCP design's 19 intent-verb surface stands as the product shape; R15's streaming becomes a REQUIREMENT ON IT — the design's ask/edit(-class) verbs MUST support streamed delivery (MCP progress-notification relay) where the client supports it, degrading gracefully to buffered where not. NO separate chat/inline tools; no surface growth. ENG-2811/ENG-2813 recast as the tracking tickets for this requirement against the final surface. **Note to the amazing-MCP session (Layer 3): this requirement is binding on the tool-surface build — fold streamed delivery into the verb implementations, not new tools.**

**Constraint on the redo:** the MCP surface is frozen at **19 intent verbs**. Streaming is NOT a tool-count increase and NOT a new `chat`/`inline` tool family — it is a **transport requirement layered onto existing ask-class and edit-class verbs**: relay progress via MCP `notifications/progress`, degrade to buffered when the client (or upstream) doesn't support it. Any PRD/architecture draft that proposes new streaming-specific tools, or that treats streaming as a separate product surface, violates R21 directly.

**Lineage that produced R21 (read in this order):**
- **R15** (`:1436`, 2026-07-16 PO question batch): "MCP streaming NOW — chat/inline ship as MCP tools relaying token chunks via progress notifications; ADR amends the mcp A-REACTIVE doctrine for these tools; 2 new full-standard mcp stories + pack amendment." — this is R21's *predecessor* framing (separate chat/inline tools) and was **explicitly superseded/reconciled by R21** the same day ("R15 × amazing-MCP design reconciled" in R21's own heading) — do not cite R15's "ship as MCP tools" wording as current; R21 is the binding version.
- **R8** (`:1418`, 2026-07-15/16 Phase-2 regrounding): "R8 SSE-over-MCP deferred (A-REACTIVE stands)" — the prior-to-R15/R21 posture (streaming parked, doctrine A-REACTIVE held).
- ENG-2811 (ask-class: relay `ai /v1/ask` synthesis as `notifications/progress`) / ENG-2813 (edit-class: instrument `save_page`/`edit` convert→apply→verify with local stage-progress) are the concrete tracking tickets R21 names.

**Post-R21 reality (JC-series, `po-decisions/2026-07-16.md`), for "certified ≠ current" honesty in the redo doc:**
- JC-2 (`:20–64`): ENG-2811/2813 executed as Layer-3 work under direct PO "yes," NOT automated Act-3 dispatch; companion ADR = **ADR 0002** amending A-REACTIVE (`BE0jTNoweS`), filed draft in `orvexstudiomcp` as `ok9tiXDCjB`.
- JC-3/JC-4 (`:66–129`): merged to `dev` (merge commit `ac3e90b`, PR #37), 258 tests + CI green, **dev only — no main/prod**.
- **Live-truth caveat (binding for how the redo describes "streaming" — do not overclaim):** `ai /v1/ask` is **buffered-only today**; the SSE relay mechanism is **built + integration-tested but DORMANT** — a streamed ask fails loud `AI_UPSTREAM_TRUNCATED` because `ai`'s grammar has no verdict frame and `ask` currently advertises `accept: application/json` only. ENG-2811's streaming half is **"mechanism-ready, contract-pending,"** not reality-verified; do not tick/describe it as live-proven. Edit-class (`ENG-2813`) stage-progress IS honest/real but was only integration-test-proven since the deployed MCP runs `WRITES_ENABLED=off`.
- **R27** (`:1470–1472`, obsolete-ticket closure): confirms "amazing-MCP 19/19 live on mcp.orvex.dev" as the certified tool-count baseline R21 binds against; ENG-2811/2813 correctly remain OPEN (real, un-started-at-that-point work, not fake-done).

---

## 2. Layering doctrine — CLI + MCP go through wiki-api /v1, engine only when forced

No single PO ruling uses the literal phrase "no direct-to-engine" — the doctrine is assembled from several concrete rulings/findings that are individually binding. Quote each precisely; do not compress them into one fabricated ruling.

| # | Ruling / finding | Source | Exact constraint |
|---|---|---|---|
| 2a | **Q22 "slim-AGPL"** | `po-decisions-2026-07-07.md:32` | "everything possible OUTSIDE the AGPL engine; engine placement requires per-row justification." Binding on the redo: any new API/MCP/CLI capability defaults to living in `orvex-wiki-api` (or a satellite), not the engine — the engine only grows when a row-by-row justification is made. |
| 2b | **M7 milestone name = product truth** | `po-decisions-2026-07-07.md:1014` | "M7 — **Wiki API Composition Tier** milestone CLOSED." Confirms wiki-api's canonical role is *composition tier* — it is the intended seam CLI/MCP compose through, not a pass-through. |
| 2c | **Write chokepoint pattern (engine-internal, but the enforcement point CLI/MCP writes must land on)** | `po-decisions-2026-07-07.md:709–711, 1018, 1311, 1337` | Engine enforces entitlement/quota/CAS/content-format at named **write chokepoints** (`PageService.create`'s `EntitlementService.assertWithinQuota`, `internal/blockpatch.Orchestrator.Apply`, `parseProsemirrorContent`/`jsonToNode`). wiki-api and MCP must route writes through these — not invent parallel write paths. |
| 2d | **CLI's current state is the legacy-shortcut the redo must NOT repeat** | `po-decisions-2026-07-07.md:1310` | "the CLI /api grammar IS compatible with the prod ENGINE directly (no /v1 needed) ... Added a `prod` profile -> wiki.eu1.orvex.ai." **This is documented existing behavior, not a ruling endorsing it** — it shows today's CLI talks straight to the engine host (`wiki.eu1.orvex.ai`) bypassing wiki-api `/v1`, which is exactly the pattern the fresh AI-first CLI redesign (Track 2) must not carry forward per Q22/M7. Flag as a Track-1→Track-2 migration item, not a precedent to copy. |
| 2e | **internal-api plane ≠ the public composition tier** | `po-decisions-2026-07-07.md:1236, 1240, 1251` | The "internal-api plane" (bearer-token secured, e.g. `orvex-wiki-internal-api` ExternalSecret, `apps/orvex-wiki/internal-api`) is **engine↔knowledge/ai service-to-service plumbing**, provisioned separately from and prior to the public `/v1` composition tier. Do not conflate: CLI/MCP/AI-facing traffic is `wiki-api /v1`; `internal-api` is a different, narrower east-west seam (relevant context given this session's own branch touches `/internal/pages/{id}/export`). |
| 2f | **Deployed reality outranks stale doc/canon (M1)** | `po-decisions/2026-07-16.md:1442` (Forensics entry) | "(M1) deployed artifact OUTRANKS any doc on conflict — conflicts file drift corrections, never builds-from-doc." Binding process rule for the redo: verify wiki-api's actual `/v1` grammar in code (router.go serves the full live resource grammar per ENG-1969, superseding the stale ADR-0001 "flat-verb /v1 = 501 stubs" premise) before writing the new PRD/architecture off old certified docs. |
| 2g | **`no-fallbacks` / fail-closed doctrine, explicitly named** | `po-decisions-2026-07-07.md:768` | "Doctrine (contract-first + no-fallbacks + fail-closed + no-fake-done): AC7-full deferred ... do NOT stub a fake per-verb gate to force green." Applies directly to the MCP/API/CLI redo: no silent fallback paths, no fake-passing stubs standing in for unbuilt behavior. |

---

## 3. MCP/wiki-api governance — publish/ratify/supersede stays human; `needs_human_publish`

**Not found as a literal po-decisions ruling under this exact name**, but the doctrine is stated repeatedly and consistently across po-decisions + the live ticket corpus that po-decisions references and rules on. Treat the po-decisions citations as the PO-level authority and the ticket-corpus citations as the current implementation-contract evidence for the same rule.

**PO-level statements (po-decisions):**
- `po-decisions-2026-07-07.md:70`: "ADR-0015 (DRAFT) ... human doc-ratify pending (**agents don't self-ratify**)."
- `po-decisions-2026-07-07.md:202`: "Status draft — **NOT self-promoted** (doctrine 3.4); awaits human doc-ratify."
- `po-decisions-2026-07-07.md:682`: override-approval of derived NFR budgets explicitly "does not self-promote them to canonical" — ratify is a distinct human step even under PO override authority.
- `po-decisions-2026-07-07.md:18` (Q10/PD-9): ratify literal string is scoped — "**"all ratified please ratify them now"**" covered only the named decision records, **not** a blanket; "ADR-0013 MCP event-consumption left DRAFT, genuinely unsettled" — shows MCP-adjacent canon is deliberately held to per-item human ratify, not batch auto-ratify.
- `po-decisions-2026-07-07.md:1436` (R13): "batch self-ratify of all ~80 certified Definition-Pack **wiki drafts** AUTHORIZED" — note this is a PO-authorized exception for the *definition-pack* corpus specifically, not a general grant that MCP/wiki-api may self-ratify draft→canonical content or governance tokens.

**Implementation-contract evidence (current spec, cited for design grounding — these are Linear story bodies, not po-decisions rulings, so cite them as such):**
- `.cache/linear/issues/ENG-2529.yaml:16` (wiki-api E4-S3): "wiki-api to return `needs_human_publish`/`needs_human_confirm` plus a Studio deep-link and transport server-minted RATIFY/CONFIRM tokens **verbatim** ... minting and enforcement stay at the **engine chokepoint (D-A8)** — wiki-api never mints, never promotes draft→canonical."
- `.cache/linear/issues/ENG-1405.yaml:60` (mcp AC8): "RATIFY/CONFIRM tokens are engine-minted, human-triggered; ... the MCP transports it verbatim and **NEVER promotes draft→canonical itself, on any path**."
- `.cache/linear/issues/ENG-2464.yaml:16`: "the MCP returns `needs_human_publish` / `needs_human_confirm` plus a Studio deep-link, transports a human-supplied CONFIRM token verbatim ... honestly reports a supplied RATIFY token as un-applyable where no such endpoint exists yet (ratify), and never promotes draft→canonical on any path — so that **"AI never self-promotes"** survives the re-plumbing end-to-end."
- `_bmad-output/planning-artifacts/delivery-program-2026-07-13/p1-structure/breakdown/mcp/bodies/E4-S4.md:5`: same "AI never self-promotes" framing at the MCP layer.

**Constraint on the redo:** the chain of custody for governance actions is fixed: **engine mints RATIFY/CONFIRM tokens → wiki-api transports verbatim (never mints/promotes) → MCP/CLI transport verbatim (never mint/promote)**. The PRD/architecture must model `needs_human_publish`/`needs_human_confirm` as first-class typed responses (with a Studio deep-link) on every publish/ratify/supersede-adjacent verb across all three surfaces, and must not design any surface-side auto-promotion, even under agent/orchestrator "full autonomy" framing (Q4, below) — autonomy governs *build/ops* judgment calls, not draft→canonical promotion.

**Caveat to carry into the redo (current build state, not a ruling — do not treat as done):** per `ENG-2529.yaml:74`, as of `orvex-wiki-api@dev@57a69ba` the types/envelopes exist (`gen/errors.go`, `gen/governance.go`) but `specgate.Gate.Check`/`GateState` are still **unconditional `ErrNotImplemented`** — "scaffolded, not wired." The redo should treat human-gated transport as a design-complete-but-unimplemented seam, not an already-delivered guarantee.

---

## 4. R16 / R25 — audit service seam reservations (Daniel's incoming design)

**R16** — `po-decisions-2026-07-07.md:1436`:
> R16 **central audit service** — NEW family component (orvex-studio-audit) owns the WORM/tamper-evident audit sink; OQ-A13 (wiki-api), OQ-CLI3 (cli) and console BrowseAudit re-point to it (console = read-side consumer); founding ticket + pack issue in the hub.

**R25** (extends R16 from reservation to active migration) — `po-decisions-2026-07-07.md:1462`:
> Ruling (extends R16 from reservation to active migration): **NO service owns audit storage, WORM tables, audit read-models, or audit query APIs.** Every service EMITS audit events (outbox, per its existing event discipline); the dedicated audit+compliance service OWNS storage, retention, tamper-evidence, and the read/query API; consumers (console first) READ via that API only. ... **Emission contract shape + service internals remain the PO's incoming design (seam reservation posture holds)** — migrated stories park as reservation-shaped scope in the audit project, **never invented**.

**R24** (support-access grants, rides the same seam) — `po-decisions-2026-07-07.md:1458`:
> "audit rides the R16 reserved seam (every support-session action emits audit events consumed by the incoming audit+compliance component; console reads that trail back — the watcher is watched)."

**Constraint on the redo:** wiki-api (`OQ-A13`) and CLI (`OQ-CLI3`) must be scoped as **audit EMITTERS ONLY** — outbox events out, per existing per-service event discipline. **Do not design wiki-api/MCP/CLI to own audit storage, a WORM table, an audit read-model, or an audit query endpoint** — that is explicitly reserved to `orvex-studio-audit`, which Daniel is personally designing (per user memory `audit-compliance-service-incoming.md`, corroborated by R16/R25's "PO's incoming design" language). Any audit-shaped scope drafted for these three surfaces should be written as a **reservation stub** (seam only — event name/shape may be sketched as provisional, contract internals not invented) pointing at the incoming design, never as built-out storage/query functionality.

---

## 5. Quotas, cells, tenancy — constraints the surfaces must respect

| Topic | Source | Exact constraint |
|---|---|---|
| **R7 — Teams/Enterprise quota** | `po-decisions-2026-07-07.md:1418` | "R7 Teams/Enterprise quotas → deferred ticket **ENG-2794** (Free/£7 locked per D-S7)." Only the Free and £7 personal tiers are quota-locked now; Teams/Enterprise quota shape is explicitly deferred — the redo must not hardcode a finished Teams/Enterprise quota model, only the Free/£7 one, with an open seam for ENG-2794. |
| **F-QUOTA write-chokepoint enforcement** | `po-decisions-2026-07-07.md:265–280, 1018` | Quota is enforced at the engine's `EntitlementService.assertWithinQuota` write chokepoint and surfaced as **HTTP 402 `QUOTA_EXCEEDED`** (with `deep_link`) through wiki-api; MCP/CLI must surface this verbatim (per ENG-1404 AC6, `.cache/linear/issues/ENG-1404.yaml:55`: "fail-loud passthrough ... `402 QUOTA_EXCEEDED` ... surfaces it verbatim, never retried, partially applied, masked as success, or turned into a fabricated result"). |
| **A3 plan taxonomy** | `po-decisions-2026-07-07.md:43` | "free / personal / teams / enterprise (canon `H5NzkdsOzK`)." The four-tier taxonomy is canon-fixed; the redo's quota/entitlement UX across CLI/MCP/API should key off these four tiers, not invent new ones. |
| **Cell routing / `421 CELL_MISMATCH`** | `po-decisions-2026-07-07.md:846–913` | Contract for cross-cell misdirect is `421` → typed `CELL_MISMATCH` → client re-resolves via `cell-discovery` and retransmits once (`MisdirectedRequest{error:"cell_mismatch", reResolve:{action:"rediscover", discoveryUrl?}, cell?, cellEpoch?}`). Status at last verified ruling: **contract pinned** (`ENG-1964`, `v0.1.3`), **CLI runtime implemented at the Transport level** (`ENG-1425`, mutation-tested) but **inert in prod** by design (no `cmd/` entrypoint wires `WithCellResolver` yet — owned by `ENG-1971`). The redo must design the CLI/MCP/API transport layer to speak this cell-discovery/421 vocabulary, not invent a new one, and should not assume it is live end-to-end yet. |
| **Tenancy identity claims** | `po-decisions-2026-07-07.md:850` | `cell`/`cell_epoch` are carried as claims on the frozen Principal/token (`ENG-1405`/`ENG-1944`) — tenancy routing is identity-token-carried, not a separate per-call parameter the surfaces should reinvent. |
| **Prod tenancy URLs (topology the surfaces must target)** | `po-decisions-2026-07-07.md:1272` | "engine `wiki.eu1.orvex.ai`, wiki-api `wiki-api.orvex.ai`, identity `auth.orvex.ai`, knowledge `events.orvex.ai`, ai `ai.orvex.ai`, billing `billing.orvex.ai`, **mcp `mcp.orvex.ai`**, console `console.orvex.ai`." Confirms `mcp.orvex.ai`/`wiki-api.orvex.ai` (prod) vs `mcp.orvex.dev` (dev, per JC-1/R27) as the real per-service hostnames the redo's API/MCP/CLI base-URL config must target — engine host (`wiki.eu1.orvex.ai`) is NOT a surface CLI/MCP should default to (see §2d). |
| **R17 — signed selector/tier config origin** | `po-decisions-2026-07-07.md:1436` | "R17 AD-EXT-2 signed selector/tier config served from the **api service** (CF-fronted `api.eu1.orvex.ai`)." A distinct api hostname (`api.eu1.orvex.ai`) for extension-facing selector/tier config, separate from `wiki-api.orvex.ai` — don't conflate the two when placing new config-serving endpoints. |
| **Clerk 100-user cap (dev only, operational not design)** | `po-decisions-2026-07-07.md:1168`; user memory `orvex-studio-dev-cell-topology.md` | Noted for completeness — a dev-environment constraint (Clerk `tough-hornet-12` shared instance, 100-user cap), not a design constraint on the redo, but relevant if the redo's acceptance testing plans fresh-tenant flows against dev. |

---

## 6. Full R-numbered ruling register (R1–R27), condensed

**Source for R1–R12:** `po-decisions-2026-07-07.md:1418` (single dense paragraph — condensed here into rows for traceability; ledger of origin cited as `scratchpad ground-truth/RULINGS.md`, not independently re-read).
**Source for R13–R20:** `po-decisions-2026-07-07.md:1436`.
**Source for R21:** `po-decisions-2026-07-07.md:1446–1448` (own heading, quoted in full in §1).
**Source for R22–R27:** `po-decisions-2026-07-07.md:1450–1472` (each has its own `##` heading).

| Ruling | One-line content | Relevance to MCP/API/CLI redo |
|---|---|---|
| R1 | Extension fork-first (ENG-2755 foundation; ENG-2711 hardening on top) | Low — browser extension track, not the three surfaces |
| R2 | ENG-2690 pack v2 full rewrite, 9-artifact source universe | Low — extension |
| R3 | ENG-2097 amended with memory-extraction scope | Indirect — memory-extraction may touch MCP `ask`/knowledge verbs |
| R4 | orvex-ds folds into orvex-studio-ui, tokens → Tailwind | Low — UI design system |
| R5 | staging↔workgraph promotion edge = PUSH (stagingclient/sha256) | Low — unrelated program |
| R6 | **ifVersion/CAS owned by W1 contracts** | **Direct** — CAS (optimistic concurrency, `If-Match`/`ifVersion`) semantics for wiki-api writes are contract-owned (`orvex-studio-contracts`), not each surface's local invention; MCP/CLI edit-class verbs must consume the pinned CAS contract, not roll their own version-conflict handling |
| R7 | Teams/Enterprise quotas deferred (ENG-2794); Free/£7 locked (D-S7) | **Direct** — see §5 |
| R8 | SSE-over-MCP deferred, A-REACTIVE stands | **Direct** — superseded by R15→R21 (see §1); kept here for lineage |
| R9 | Security decisions owned in packs (authz/purge-cancel/audience/Anti-Sybil/PII/BYOK/k-anon/CSP) | Direct-ish — security-shaped ACs on the three surfaces should defer to the relevant pack, not be re-litigated in the redo |
| R10 | Stale-world corrections (tags v0.1.0–v0.1.3 exist, prod modules ON, verifier real) | Process — grounding hygiene, not a design constraint |
| R11 | Current-state-only (no history narration in ticket bodies) | Process — applies to how the redo PRD/architecture itself should be written |
| R12 | Newest-wins (on conflicting decisions) | Process — resolves any apparent contradiction between R8 and R15/R21 in favor of R21 |
| R13 | Batch self-ratify of ~80 certified Definition-Pack wiki drafts AUTHORIZED | Process/canon hygiene |
| R14 | ENG-2033 closed Done (six-surface gate re-baseline discharged) | Confirms the six-surface gate baseline the amazing-MCP claim rests on |
| R15 | MCP streaming (superseded framing) — see §1 | Superseded by R21 |
| R16 | Central audit service seam reservation | **Direct** — see §4 |
| R17 | AD-EXT-2 signed selector/tier config served from api service (`api.eu1.orvex.ai`) | **Direct** — see §5 |
| R18 | Anti-Sybil = Cloudflare Turnstile + FingerprintJS OSS | Low-direct — relevant only if API/CLI expose public unauthenticated endpoints |
| R19 | Extension ships unlisted-beta → listed-GA, counsel gate before default-on injection | Low — extension |
| R20 | Extension repo stays CLOSED, MIT attribution in-bundle | Low — extension |
| R21 | **MCP streaming folds into the 19-tool surface** | **Direct — headline ruling, see §1** |
| R22 | Phase-2 dispatch preconditions (ENG-2055/2810/2817 must land before automated fleet dispatch) | Process — governs how the *redo itself* gets built by the agent fleet, not the product design |
| R23 | Cross-session ticket-claim stays convention (not tooled) until a 3rd autonomous writer exists | Process |
| R24 | Temporary user-granted support access, fully audited | **Direct-ish** — identity/console/ui feature, rides R16 audit seam; relevant if MCP/CLI ever expose support-session context |
| R25 | Audit moves OUT of every repo into the dedicated service (extends R16) | **Direct** — see §4 |
| R26a–e | Console review rulings (manage-parity parked, tenant-360/triage-home added, RBAC two-role split, alert ack/silence proxy, UBA k=5 privacy) | Low-direct — console-specific, not the three AI surfaces, except R26c's two-role RBAC pattern (READ-ONLY default + OPERATOR/ADMIN behind fresh-auth) is a reusable precedent if the redo needs an RBAC shape |
| R27 | Obsolete mcp tickets (ENG-2451/2454/2455/2456/2458/2464/2475) closed DELIVERED; confirms amazing-MCP 19/19 live on mcp.orvex.dev; ENG-2811/2813 correctly stayed OPEN | **Direct** — the certified baseline R21 counts against |

---

## 7. Standing mitigations from the MCP-staleness forensics (binding on how the redo itself must be produced)

**Source:** `po-decisions-2026-07-07.md:1438–1444` ("Forensics: the MCP staleness failure + standing mitigations (PO: 'mitigate against me')") — cross-referenced in user memory as `certified-is-not-current.md`.

> **What happened:** the certified mcp pack + corpus inherited ADR-0001's canonical-but-superseded premise (flat-verb grammar, "/v1 = 501 stubs") while router.go served the full live resource grammar (ENG-1969 done).

**Standing mitigations (ruled), quoted:**
> (M1) deployed artifact OUTRANKS any doc on conflict — conflicts file drift corrections, never builds-from-doc; (M2) pre-claim reality probe — dispatch re-verifies a story's Existing-code premises at HEAD, mismatch bounces to drift triage; (M3) ticket-drift ratchet — merges/ratifications compute the affected-story set from [Source:] cites and flag REBASELINE; (M4) PO vision-intake — a new vision produces an impact map over packs/stories BEFORE any build; affected tickets get flag-comments (not rewrites) while the target moves.

**Constraint on the redo process itself:** the PRD/architecture redo for MCP/API/CLI must be written against **verified current code state** (M1) — every behavioral claim in the new documents needs a live-code citation, not a citation to a possibly-stale prior certified pack. Given R21 explicitly reconciles a same-day prior ruling (R15), and R8 was itself superseded, apply **R12 newest-wins** wherever two rulings in this register appear to conflict, and prefer the ruling with the later timestamp/higher R-number on the same topic.

---

## 8. Items explicitly NOT found (checked for, absent)

- No literal ruling string "no-legacy/no-fallback/no-layering-shortcut" — the doctrine is real but assembled from Q22, M7, the write-chokepoint pattern, and the `no-fallbacks`/fail-closed doctrine line (`:768`); do not quote a single ruling as if it used that exact compound phrase.
- No PO ruling using the literal string `needs_human_publish` — that string lives only in the ticket-corpus/spec layer (§3), which po-decisions rulings (R13/Q10) constrain via the general self-ratify/self-promote doctrine.
- Only one other `po-decisions*` file exists in the repo (`po-decisions/2026-07-16.md`, fully read — JC-1..JC-4); no `po-decisions/2026-07-07.md`, no other dated files under `po-decisions/`.
