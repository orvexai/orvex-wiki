# Track 2 — Fresh Goggles: the AI-First Design of the Orvex AI-Surface Family

**Synthesis agent deliverable.** Scope: treat **orvex-studio-contracts → orvex-wiki-api (`/v1`) → orvex-studio-mcp + orvex-cli** as ONE layered system and produce the fresh AI-first design assessment. Inputs read in full: the three web-research files (`evidence-web-mcp.md`, `evidence-web-api.md`, `evidence-web-cli.md`), the decision register (`evidence-decisions.md`), and the six current-state surface maps (`evidence-mcp.md`, `evidence-wiki-api.md`, `evidence-orvex-cli.md`, `evidence-engine.md`, `evidence-contracts.md`, plus the canon maps summarized in the brief).

Everything here is Track 2 (fresh design), grounded against **verified HEAD code** per standing mitigation M1 ("deployed artifact / real code OUTRANKS any doc"). Where a decision binds, it is cited by its `R#`/`Q#`/`D-*` id and source line; where a web principle drives it, the source is named.

---

## 0. The one-paragraph thesis

The Orvex AI surfaces are not three products — they are **three projections of one contract**. The contract (`orvex-studio-contracts`) defines the resource grammar, the verbs, the error vocabulary, the CAS/receipt semantics, and the governance envelope. `wiki-api /v1` is the single **composition tier** that realizes that contract over the engine's internal `/api` primitives (Q22 slim-AGPL `:32`; M7 "Wiki API Composition Tier" `:1014`). **MCP and CLI are complementary projections of `/v1`, never rivals** — the 2025-2026 consensus (Anthropic Skills-vs-MCP framing; `evidence-web-cli.md §4, §12`) is explicit that MCP supplies the typed, authenticated capability surface and the CLI supplies the context-cheap, scriptable surface, and both should sit on the SAME `/v1` truth rather than fork it. The design job for Track 2 is therefore to **maximize the shared spine** (contract, errors, CAS, receipts, governance, discovery) and **minimize what each projection owns** (transport ergonomics, progressive-disclosure mechanics, output shaping). The current surfaces are individually strong but the spine is not yet a spine: the contract is untagged and drifted, `wiki-api`'s `gen/` is hand-authored not generated, and each surface has invented its own error envelope. That gap is the whole redo.

---

## 1. Unified design principles for the family

Distilled from the three web files + the decision register into ONE ranked catalog. Each principle names its **owning layer** (where it must be implemented once and inherited), its **web source**, and the **binding decision** it must respect.

| # | Principle | Owning layer (implement once) | Web source | Binding decision |
|---|---|---|---|---|
| **P1** | **One canonical machine contract; every surface generated from it.** SDKs, human docs, MCP tool schemas, and the CLI client all derive from the pinned contract tag — never hand-maintained in parallel. | contracts (SoT) → generated into wiki-api `gen/`, MCP `wiki-api.d.ts`, CLI client | web-api §8.3 (Stainless/openapi-mcp "single source of truth"); web-mcp §7.1 | R6 (CAS owned by contracts); D-CON-1 (one tag = one contract set) |
| **P2** | **Intent-verb / job-to-be-done surface, not an endpoint mirror.** Design around what an agent is trying to do ("find the canonical page", "propose an edit", "resolve a duplicate"), not a 1:1 of REST routes. | MCP (verbs), CLI (noun-verb), wiki-api (resource grammar) | web-mcp §7.1, §5.6 (Cloudflare "don't wrap your full API schema"); web-api §2 | program framing ("intent-verb MCP") |
| **P3** | **Progressive disclosure at every altitude.** Read ladder (outline→section→full), tool-catalog deferral (hero + on-demand), CLI `--help` tree + `schema`, hierarchical `llms.txt`. Never load what isn't needed. | MCP (catalog), CLI (help tree), wiki-api (read ladder + `llms.txt`) | web-mcp §3 (Tool Search, ~85% ctx saved); web-cli §4, §9; web-api §7 | — |
| **P4** | **Token budget is a first-class response concern.** Markdown/DfM-first reads (never raw block/PM-JSON), verbosity switch (concise/detailed), field selection, server-enforced bounded reads with visible-degrade not silent truncation. | wiki-api (read shape + verbosity), MCP + CLI inherit | web-mcp §5.2 (Notion: 6-7x fewer tokens), §7.2/§7.6; web-api §7 | — |
| **P5** | **Self-healing typed errors, one frozen vocabulary shared by all three.** Every failure carries a stable code + a message written to let an LLM self-correct in one retry (correct example, valid values, next action). | contracts (vocabulary) → all three surfaces | web-api §3 (RFC 9457 + Anthropic self-healing); web-cli §5, §10; web-mcp §1.5 | R9 (security in packs); no-fallbacks doctrine `:768` |
| **P6** | **Verified writes: idempotency + CAS + receipt, together.** `Idempotency-Key` for retry-safety (agents retry casually), `If-Match`/`ifVersion` CAS for concurrent-writer-safety, and a write receipt that hands back the settled version so the caller can chain without a re-read. | contracts (semantics) → wiki-api (chokepoint) → MCP/CLI transport | web-api §4, §5, §10 (Stripe idempotency; ETag CAS; Tokanban multi-agent) | R6 (ifVersion/CAS contract-owned); engine write-chokepoint pattern `:709-711` |
| **P7** | **Safe-by-construction mutations.** MCP annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`), `--dry-run`, elicitation/confirm-token on destructive ops, idempotent-preferred verb design. | MCP (annotations/elicitation), CLI (`--dry-run`), wiki-api (idempotent semantics) | web-mcp §4.3, §7.8-9; web-cli §6 | no-fallbacks/fail-closed `:768` |
| **P8** | **Human-in-the-loop governance is a hard, unbroken chain.** Engine mints RATIFY/CONFIRM tokens; wiki-api transports verbatim (never mints/promotes); MCP/CLI transport verbatim. `needs_human_publish`/`needs_human_confirm` are first-class typed responses with a Studio deep-link on every publish/ratify/supersede verb. | contracts (envelope) → all three surfaces | web-mcp §4.3 (elicitation ≠ free safety); web-api §3 | Q10/`:18`, `:70`, `:202`; ENG-2529/ENG-1405/ENG-2464 (spec layer) |
| **P9** | **Capability discovery + self-description, in-band.** `/.well-known` + `llms.txt` (root), `/v1/capabilities` + `/v1/instructions` + `/v1/openapi.json`, MCP `get_capabilities`/`list_tools`, CLI `instructions`/`schema`. An agent that has never seen the surface can bootstrap without external docs. | wiki-api (`/v1/capabilities`, `llms.txt`), MCP (`get_capabilities`), CLI (`schema`) | web-api §8; web-cli §3, §9; web-mcp §4.2 | — |
| **P10** | **Least-privilege scoped auth; deny-by-default; pass-through, never mint.** Bearer forwards verbatim; effective authz = `gate ∩ token_scope`; no surface ever mints a token. | contracts (scope names) → all three | web-api §2, §13 (Stripe scoped keys); web-mcp §5.6 | FR-M11 (MCP never mints); FR-A16 (wiki-api pass-through); tenancy `:850` |
| **P11** | **Changes feed + CloudEvents, one envelope.** A cursor-paginated `/v1/changes` for backfill/catch-up PLUS webhook push, both off the SAME CloudEvents envelope already used on the Kafka spine — reuse `version_field`/`tenant`/`cell`, don't invent a second event shape. | contracts (event catalog) → wiki-api (feed) → MCP `wiki_get_changes` / CLI | web-api §12 (CloudEvents); web-mcp §4.1 (tasks/progress) | FR-C8 obligations; D-S13 (outbox→Kafka, no Redis bridge) |
| **P12** | **Streaming is a transport requirement folded into ask/edit verbs, not new tools.** Relay via MCP `notifications/progress`; degrade to buffered where the client/upstream can't stream. | MCP (progress relay) | web-mcp §4.1 (progress notifications) | **R21** (`:1446-1448`) — headline ruling |
| **P13** | **Deterministic multi-step workflows are declared, not inferred.** For draft→ratify→supersede, embed-then-index, bulk-migrate — publish the dependency graph (Arazzo-style) so agents don't infer ordering from prose. | contracts (workflow docs) → surfaces link to them | web-api §8.4 (Arazzo); web-mcp §2 (code-execution for compositional flows) | — |
| **P14** | **Adversarial input + response sanitization.** Treat agent-constructed input as untrusted (path traversal, control chars, injection); sanitize returned wiki bodies against embedded prompt-injection before they re-enter an agent's context. | wiki-api (input validation) + MCP/CLI (response sanitization at the read boundary) | web-cli §6 (Poehnelt); web-mcp §6 (unbounded-read CVE class) | — |
| **P15** | **No fallbacks, fail-closed, no fake-done; verify against live, not docs.** No silent legacy path, no stub standing in for unbuilt behavior, every behavioral claim carries a live-code citation. | all layers (process + code) | web-cli §5 (AWS-CLI-v2 pager cautionary tale) | no-fallbacks `:768`; M1-M4 forensics `:1438-1444` |
| **P16** | **Eval-driven design is the method.** Every tool/verb/description change runs a realistic multi-step agentic eval (accuracy/tokens/tool-calls/error-rate) before it ships. | MCP (golden-tape/KPI), CLI (gate harness), wiki-api (fixtures) | web-mcp §1.7, §5.6; web-api §1 | R14 (six-surface gate baseline) |

**One cross-cutting caveat that governs how the redo is written (not a product principle):** "certified ≠ current." R21 itself reconciled a same-day prior ruling (R15); R8 was superseded; apply **R12 newest-wins** and prefer the later ruling on any topic (`evidence-decisions.md §7`). This is the reason §4-Q1 below (streaming/19-verb vs hero-13) is a live open question and not a settled fact.

---

## 2. Assessment of the three surfaces at HEAD

Rating scale: ✅ **met** · 🟡 **partly** · ❌ **violated/absent** · ⚪ **n/a for this layer**. Evidence cites `file` or `file:line` from the surface maps.

### 2.1 Principle-by-principle scorecard

| # | Principle | contracts | wiki-api | MCP | CLI |
|---|---|---|---|---|---|
| P1 | One generated contract | 🟡 SoT exists (`wiki-api.yaml`, ADR-0035) but **untagged/drifted** — v0.1.3 still the old flat grammar (`evidence-contracts §7`) | ❌ `gen/` is **hand-authored**, "target of a future codegen step", no generator, no spec file in-repo (`evidence-wiki-api §8`) | 🟡 client generated via `scripts/gen-client.ts` from `wiki-api.d.ts` (`evidence-mcp §12`) but pinned tag is stale | 🟡 own `internal/client`; **MR-CLI2 open**: Go codegen bridge undecided, ADR-0035 excludes Go stubs (canon-cli) |
| P2 | Intent-verb surface | ✅ `/v1/wiki` resource grammar, flat verbs retired (`evidence-contracts §1`) | ✅ resource grammar, `requireWiki` gate, D-S11 (`evidence-wiki-api §10`) | ✅ hero verbs + read ladder (`evidence-mcp §2, §5`) | ✅ noun-verb `orvex <noun> <verb>` (`evidence-cli §1`) |
| P3 | Progressive disclosure | ⚪ | 🟡 read ladder real (`outline`/`section`/`full`); **no `llms.txt`** on wiki-api (`evidence-wiki-api §2`) | ✅ hero-13 + `list_tools(category)` reveal, `TOOLS_PAGE_SIZE=13` (`evidence-mcp §4`) — but see P-flaw below | 🟡 noun-verb help tree ✅; `instructions`+`ErrorCodeRegistry` ✅; **no `schema` introspection subcommand**, no Skill file (`evidence-cli §11`) |
| P4 | Token budget / markdown-first | 🟡 `to-dfm`/`to-prosemirror` pinned | ✅ server renders DfM, read ladder, whole-doc auto-degrade lives in MCP | ✅ **best-in-class**: `wiki_get` ladder auto-degrades over `token_budget`, `response_format` concise/detailed, `structuredContent` mirror (`evidence-mcp §5, §7`) | ✅ `--fields`/`--id-only`/`--compact` token minimizers, `decodePageDfM` (`evidence-cli §11`) |
| P5 | Self-healing typed errors | 🟡 `errors/vocabulary.yaml` exists (referenced by apikey gate) | 🟡 `gen.APIError{code,message,deep_link,_note,type}` — rich but **bespoke, not RFC 9457**; FOUR overlapping mappers (`evidence-wiki-api §5`) | 🟡 typed codes + fail-loud (`AI_UPSTREAM_TRUNCATED`, `VERSION_MISMATCH`) but text-primary envelope | ✅ **richest**: `{error_code,message,hint,matches,request_id,next}` where `next` = literal runnable recovery cmd (`evidence-cli §11`) |
| P6 | Verified writes (idempotency+CAS+receipt) | 🟡 CAS pinned; **version-semantics split** (string on read, int on CAS) flagged in-contract (`evidence-contracts §1, §8`) | 🟡 integer CAS ✅ (`If-Match`/`ifVersion`) + receipts ✅; **NO `Idempotency-Key` on the public `/v1` write contract** (`evidence-wiki-api §7`) | ✅ CAS `ifVersion` required, 409 `VERSION_MISMATCH`, verified read-after-write receipt (`evidence-mcp §6`) | ✅ CAS surfaced, exit 5 `VERSION_MISMATCH` frozen (`evidence-cli §11`) |
| P7 | Safe-by-construction mutations | ⚪ | 🟡 idempotent-ish; no dry-run at HTTP layer | ✅ 4-layer gate + READ_ONLY ceiling + `dry_run` + `confirm_token` + elicitation seam (`evidence-mcp §6`); annotations present in table (`§3a`) | 🟡 `--dry-run` on `wiki issue create` only; not universal (`evidence-cli §3`) |
| P8 | HITL governance chain | ✅ envelope shape defined (spec layer) | 🟡 types exist (`gen/governance.go`) but `specgate.Check` is **unconditional `ErrNotImplemented`** — "scaffolded, not wired" (`evidence-wiki-api §12`; ENG-2529:74) | ✅ `NEEDS_HUMAN_PUBLISH` + verbatim `ratify_token` relay, never minted (`evidence-mcp §6`) | 🟡 `wiki spec gate check` is a stub (`evidence-cli §3`) |
| P9 | Capability discovery | 🟡 `/v1/openapi.json` disclaimed as codegen source | ✅ `/v1/capabilities` + `/v1/instructions` PUBLIC, `/v1/openapi.json` descriptor (`evidence-wiki-api §2`); ❌ no `llms.txt`, no `/.well-known` | ✅ `get_capabilities` + `list_tools` (`evidence-mcp §3a`) | ✅ `instructions` + `ErrorCodeRegistry()` self-discovery, golden-tested (`evidence-cli §11`) |
| P10 | Scoped auth / pass-through never-mint | ✅ scope names in contract | ❌ **inert**: `IDENTITY_VERIFY_ENABLED=false` default; prod `notImplementedCallerVerifier` 401s everything if enabled; `/v1/audit` unusable (`evidence-wiki-api §4, §12`) | ✅ deny-by-default `assertTokenScope`, `gate ∩ token_scope`, never mints (`evidence-mcp §10`) | ✅ zero-trust bearer forward, OIDC RP + headless `--token` (`evidence-cli §6, §10`) |
| P11 | Changes feed + CloudEvents | 🟡 32 `wiki.*` events cataloged but **DRAFT**, outbox→Kafka relay **not built** (`evidence-contracts §5`) | 🟡 `GET /v1/changes` exists but **time-anchored (since+limit), NOT cursor**, and **draft** (`evidence-wiki-api §6`) | 🟡 `wiki_get_changes` (on-demand, real) forwards it (`evidence-mcp §3a`) | 🟡 `events` SSE service wired; `admin events` stubs |
| P12 | Streaming folded into verbs | ⚪ | ✅ correctly has **no** SSE `/v1` verb (`evidence-wiki-api §3`) | 🟡 edit-class stage-progress **real**; ask-class SSE relay **built but DORMANT** (ai is buffered-only) (`evidence-mcp §9`) | ❌ no streaming; `ai chat`/`inline` are stubs (`evidence-cli §5`) |
| P13 | Declared workflows | ❌ no Arazzo/workflow docs anywhere | ❌ none | 🟡 `get_capabilities` narrates some sequencing | ❌ no Skill/workflow companion |
| P14 | Adversarial input / sanitization | ⚪ | 🟡 locator dialect validated; body-sanitization against injection **not evidenced** | 🟡 scope-gate + bounded reads; body-sanitization not evidenced | ✅ `wiki_verbs` reject lossy format locally, `MARK_SYNTAX_CORRUPTION` pre-check (`evidence-cli §3`) |
| P15 | No fallbacks / verify-live | ✅ live-probe re-ratification is the model (`evidence-contracts §1`) | 🟡 `notImplemented*` are honest fail-closed; but stale `gen/`, Linear relay present | ✅ `zero-legacy.test.ts` gate, `NOT_AVAILABLE_YET` never fabricates (`evidence-mcp §12, §14`) | 🟡 honest stubs BUT **broken client methods** (comment/label/attach hit non-existent routes) (`evidence-cli §3`) |
| P16 | Eval-driven | ⚪ golden fixtures ✅ (`evidence-contracts §6`) | 🟡 SLI snapshot; drift gates mostly draft (`evidence-contracts §4`) | ✅ `kpi/golden-tape.test.ts`, `e2e/three-repo` (`evidence-mcp §13`) | ✅ `internal/gate` M12 E2E golden harness (`evidence-cli §9`) |

### 2.2 The four sharpest current-state failures (cross-surface)

1. **The spine is not generated — it is three hand-maintained copies.** contracts `wiki-api.yaml` (re-authored from live probe, untagged), wiki-api `gen/` (hand-authored Go), MCP `wiki-api.d.ts` (generated but from a stale tag). P1 is **violated in practice** even though every party believes contracts is SoT. This is the single biggest divergence risk and directly caused #2.
2. **The `/v1` composition tier's own auth is inert.** `IDENTITY_VERIFY_ENABLED=false` and both production verifiers are `notImplemented` fail-closed-401 (`evidence-wiki-api §4, §12`). Today wiki-api is a pass-through that delegates ALL authz to the engine's 401, and `/v1/audit` is unusable. The scope-gate story (P10) is real in MCP and CLI but a **scaffold at the tier that is supposed to own it**.
3. **The hero surface an agent sees by default is ~54% stub.** 7 of 13 MCP hero seats always return `NOT_AVAILABLE_YET` (`evidence-mcp §2, §14`). Advertising forward-contract stubs in the always-loaded set burns context (web-mcp §5.3: Linear's tool defs alone cost 17.3k tokens) on tools that can never succeed — a direct violation of P3's intent.
4. **Client-side completeness ≠ live correctness.** The CLI's `comment`/`label`/`attach` groups compile, pass unit tests, and 404 live because `/v1/comments|labels|attachments` are not registered in wiki-api (`evidence-cli §3` finding; `evidence-wiki-api §2` route table). Same defect class already caught once for `wiki space`. This is P15 violated by absence of an end-to-end contract conformance gate (`served-openapi-diff` is draft/unwired — `evidence-contracts §4`).

---

## 3. Target structure

### 3.0 The layered model (what each layer is, and the seams between them)

```
┌─────────────────────────────────────────────────────────────────────┐
│ orvex-studio-contracts  ── SoT ── openapi/wiki-api.yaml (+ai, +knowledge,
│   resource grammar · verb semantics · error vocabulary · CAS/version    events, fixtures)
│   semantics · governance envelope · CloudEvents catalog · workflow docs
│   ↓ generates (P1)                    ↓ pins (D-CON-1: one tag)
├─────────────────────────────────────────────────────────────────────┤
│ orvex-wiki-api  /v1  ── COMPOSITION TIER (M7) ──                       │
│   realizes the contract over engine /api primitives                    │
│   owns: edge auth (scope-gate), CAS chokepoint, receipts, changes feed,│
│         quota-402 passthrough, cell-421, capabilities+instructions+llms │
│   ↓ /v1 (the ONLY public wiki surface — Q22/M7; engine is internal-only)│
├──────────────────────────────┬──────────────────────────────────────┤
│ orvex-studio-mcp             │  orvex-cli                              │
│  PROJECTION: typed capability │   PROJECTION: context-cheap scriptable │
│  hero verbs + progressive     │   noun-verb + --json + daemon/cache    │
│  disclosure + annotations +   │   + Skill file + schema introspection  │
│  progress-streaming (R21)     │   (shells out; also MCP-exposable)     │
└──────────────────────────────┴──────────────────────────────────────┘
```

Non-negotiable seams: engine serves **no `/v1`** and is internal-only (`evidence-contracts §1`; `mcp-surface-shed-at-parity.spec.ts` gate); MCP/CLI **never** talk direct-to-engine (the CLI's current `prod`→`wiki.eu1.orvex.ai` habit is the legacy shortcut to kill, D-S2d `:1310`); knowledge is reached MCP-direct for search only (D-M8), everything wiki-shaped goes through `/v1`.

### 3.1 MCP tool taxonomy + progressive-disclosure model

**Keep the shape that already works, fix the two things that don't.** The hero + on-demand-category model (`evidence-mcp §4`) is exactly the GitHub-toolset / Tool-Search pattern the web research endorses (web-mcp §3.2). What must change:

**A. The always-loaded set must be all-real.** Demote the 7 scaffold-stub heroes (`memory_recall`, `staging_propose`, `workgraph_*`) out of the default `tools/list` until their substrate is live. An agent's first, always-paid context should advertise only tools that can succeed. Reveal them via `list_tools(category)` the moment they go real (the machinery already exists). This turns the "hero-13" ceiling from a forward-contract reservation into a live-capability guarantee.

**B. Namespaced verb families, resolve-then-fetch reads, search-not-list.** Target taxonomy (aligned to the 2026-07-17 re-baseline's namespaced-verb direction, canon-mcp `ZGjLctEnGH`):

| Family | Live-now verbs | On-demand / future | Design rule |
|---|---|---|---|
| `wiki_*` | `wiki_get` (ladder), `wiki_save` (upsert+block-patch), `wiki_get_neighborhood`, `wiki_get_tree`, `wiki_get_changes` | `wiki_comment_*`, `wiki_attachment_*` (seam-gated) | resolve-then-fetch (Context7 pattern, web-mcp §5.5); markdown-first |
| `knowledge_*` | `knowledge_search`, `knowledge_related` | `marketplace_search`, `skill_get` | search over list (web-mcp §7.3); ACL∩scope |
| `ai_*` | `ai_ask` (K5 cited answer) | `ai_models`, chat/inline | streaming folded in (R21/P12) |
| `meta` | `whoami`, `list_tools`, `get_capabilities` | — | self-description (P9) |
| `memory_*` / `staging_*` / `workgraph_*` | — (all scaffold today) | promote when substrate lands | never advertise-until-real (fix A) |

**C. Streaming (P12/R21) as a verb requirement.** Edit-class stage-progress is live and correct (`evidence-mcp §9`). Ask-class SSE relay is built but dormant because `ai /v1/ask` is buffered-only — this is a **cross-service sequencing dependency**, not an MCP gap: `ai` must ship `text/event-stream` + a K5 verdict frame before the relay can fire (JC-2 live-truth caveat, `evidence-decisions §1`). Do not describe streaming as live-proven; it is "mechanism-ready, contract-pending."

**D. Annotations + structuredContent as defaults.** Annotate every read `readOnlyHint:true` (free client-side friction reduction, web-mcp §4.3, §7.8) and adopt `structuredContent` as the default typed channel instead of the current text-primary envelope (web-mcp §7.10 — the Linear stringified-JSON-in-text anti-pattern; MCP currently does text-primary with a `structuredContent` mirror, `evidence-mcp §7` — flip the priority for list/receipt classes).

**E. Reserve, don't build, the code-execution surface** for heavy compositional flows (bulk supersede a duplicate cluster, ingest+cross-link 80 pages — the P1-factory/doc-consolidate workloads). The 150k→2k precedent (web-mcp §2.3) is the ceiling case, but the sandboxing cost is real (web-mcp §2.4). Reserve the seam; don't implement day one.

### 3.2 API resource grammar + agent affordances (wiki-api `/v1`)

**Grammar (keep):** `/v1/wiki/{loc}` resource grammar with dialect-auto locators, D-S11 `{resource}=wiki` hard gate (`evidence-wiki-api §10`). This is correct and should not change.

**Affordances to add/finish (the redo's real work):**

| Affordance | Target | Gap today | Source |
|---|---|---|---|
| **Errors** | Align all surfaces on ONE envelope. Recommended: keep the rich bespoke shape (`code`, `message`, `hint`/`detail`, `deep_link`, `matches`, `request_id`, `next`) but add a stable `type` URI per code and serve `application/problem+json` content-type for standards-compat. The CLI's `{error_code,message,hint,matches,next}` is the richest — **converge the other two onto it**, don't invent RFC 9457 from scratch. | wiki-api has 4 overlapping mappers (`evidence-wiki-api §5`); MCP/CLI/wiki-api field names diverge | web-api §3; web-cli §5 |
| **Idempotency** | Add `Idempotency-Key` header to every `/v1` write, bounded replay window. The engine `apply-ops` already claims an idempotency key internally (`evidence-engine §3`) — **surface it at `/v1`** so agent retries are safe end-to-end, not just at the engine. | absent on public `/v1` contract (`evidence-wiki-api §7`) | web-api §4 |
| **CAS/receipts** | Collapse version semantics onto ONE monotonic integer (`meta.version`) for read, write-CAS, and CloudEvents `version_field`. Today read returns a string, block-patch CAS wants an int — a read-version can't feed a write (`evidence-contracts §1, §8`). | live inconsistency, flagged in-contract | web-api §5, §10; R6 |
| **Changes feed** | Convert `/v1/changes` from time-anchored to **cursor-paginated** (opaque base64 cursor, 410+restart on stale, server-max page size), sharing the CloudEvents `version_field` as the watermark. Pair with webhook push off the same envelope. | `since+limit`, not cursor; draft (`evidence-wiki-api §6`) | web-api §6, §12 |
| **Capability discovery** | Add `llms.txt` + `llms-full.txt` at the wiki root, cross-linked to `/v1/openapi.json`, `/v1/capabilities`, `/v1/instructions`, and the MCP server. Add `/.well-known/agent.json` capability manifest. | no `llms.txt`, no `/.well-known` (`evidence-wiki-api §2`) | web-api §8 |
| **Rate-limit signals** | Emit `X-RateLimit-{Limit,Remaining,Reset}` + `Retry-After` on every response; surface quota as `402 QUOTA_EXCEEDED` verbatim (already the contract). | not evidenced | web-api §10; ENG-1404 AC6 |
| **Edge auth** | Wire a real `CallerVerifier` (the `NewLibCallerVerifier` adapter exists but isn't called) and provision issuer/JWKS so `IDENTITY_VERIFY_ENABLED=true` doesn't 401 everything. Make `/v1/audit` usable (emitter-only per R16/R25). | inert; both verifiers `notImplemented` (`evidence-wiki-api §12`) | P10; R16/R25 |
| **Workflow docs** | Publish Arazzo-style workflow documents for draft→ratify→supersede, import→embed→verify, bulk-migrate. | none | web-api §8.4 |
| **Async batch** | Keep sync single-op + `blocks:batch`/`pages/bulk`; add a submit→poll async batch endpoint for bulk agent jobs (doc-migration sweep), distinct from the live-turn path. | only sync batch exists | web-api §11 |

### 3.3 CLI noun-verb grammar + machine-output contract + shared client

**Grammar (keep):** `orvex <noun> <verb>` uniformly (`evidence-cli §1`) — already the deterministic-tree-search shape agents need (web-cli §7). Exit codes 0-9 frozen, `--output`/`--fields`/`--id-only`/`--compact`, stdout/stderr discipline — all already met (`evidence-cli §11`).

**Add/finish:**
- **`orvex schema` runtime introspection** — the single most agent-specific idea from the CLI research (web-cli §3, Poehnelt). Extend the existing `instructions`/`ErrorCodeRegistry()` self-discovery to emit the full per-verb argument contract as JSON so an agent self-discovers the surface with zero external fetch.
- **First-party Skill file** (Claude Code `SKILL.md`-style) carrying procedural knowledge `--help` can't: sequencing, common workflows, safety invariants (web-cli §9, §10). This program already lives on Skills — ship one.
- **Universal `--dry-run`** on every consequential verb + a **separate** destructive flag (don't conflate `--yes` with authorizing irreversible ops) (web-cli §6).
- **Fix the broken resource client methods** (`comment`/`label`/`attach` → non-existent `/v1/comments|labels|attachments`) — either the routes get added to `/v1` (§3.4-Q13) or these become honest local stubs like `wiki space` (`evidence-cli §3`).
- **Finish `daemon`/`cache`** (mostly stubs today, `evidence-cli §9`) — the daemon/socket/warm-cache pattern is validated for agent call-loops (web-cli §8) and matches the program's Linear cache-first precedent.
- **Shared generated client** — resolve **MR-CLI2** (canon-cli): ADR-0035 covers only the 3 TS satellites and excludes Go stubs. The CLI must consume the SAME pinned contract as MCP; the Go codegen bridge is an open must-resolve (§4-Q2).

### 3.4 What stays unified vs surface-specific

| Concern | UNIFIED (one contract/impl, inherited) | SURFACE-SPECIFIC (each projection owns) |
|---|---|---|
| Resource grammar & verbs | ✅ contracts `wiki-api.yaml` (`/v1/wiki/{loc}`, D-S11) | MCP tool names; CLI noun-verb names |
| Error vocabulary | ✅ frozen code set (P5) + field names | wire format: MCP `structuredContent`, HTTP `problem+json`, CLI `{error_code,next}` |
| CAS / version | ✅ integer `meta.version`, `If-Match`/`ifVersion` (R6) | header vs body vs tool-arg transport |
| Write receipts | ✅ settled `{version, updated_at}` shape | envelope wrapping |
| Governance envelope | ✅ `needs_human_publish/confirm` + deep-link + verbatim RATIFY/CONFIRM (P8) | elicitation (MCP) vs `--confirm` flag (CLI) vs 409 (HTTP) |
| Locator dialect | ✅ `Kind:auto`, no resolve hop | — |
| Quota / cell | ✅ `402 QUOTA_EXCEEDED`, `421 CELL_MISMATCH` vocabulary | transport-level re-resolve (CLI `cell421.go`) |
| Auth model | ✅ bearer pass-through, `gate ∩ token_scope`, never-mint (P10) | OIDC RP flow (CLI); Principal seam (MCP); edge verifier (wiki-api) |
| Read shape | ✅ DfM/markdown-first (P4) | verbosity switch (MCP `response_format`; CLI `--fields`) |
| Discovery artifacts | ✅ `/v1/capabilities`, `/v1/instructions`, `llms.txt` | MCP `get_capabilities`; CLI `schema` |
| Changes/events | ✅ CloudEvents catalog + `version_field` (P11) | cursor feed (HTTP) vs `wiki_get_changes` (MCP) vs SSE (CLI `events`) |
| Streaming | ⚪ (MCP-only per R21/P12) | MCP `notifications/progress` |
| Progressive disclosure | ⚪ (shape is per-surface) | MCP hero+category; CLI help-tree+`schema`; API `llms.txt` |

---

## 4. Brainstorm-seed: the sharpest open design questions

Each has a recommended default the human can accept or overturn. Ordered by leverage.

**Q1 — Is the MCP surface frozen at 19 verbs (R21) or hero-13 namespaced (2026-07-17 re-baseline)?**
This is a live contradiction. R21 (`:1446-1448`) binds streaming to "the 19 intent-verb surface." The 2026-07-17 WDS re-baseline (canon-mcp `ZGjLctEnGH`, PO-ratified, merged to dev) moved to **hero-13 namespaced verbs + on-demand long-tail**, and ADR-0038 streaming-scope reconciliation is flagged **still open/unresolved**. Project memory still cites "19-tool frozen" as binding.
→ **Recommended default:** hero-13 is current under R12 newest-wins; R21's *streaming requirement* survives the surface change (it binds the ask/edit *verb classes*, not the literal count). PRD redo should state hero-13 explicitly and re-file ADR-0038 to reconcile R21's "19-verb" language. **Human must confirm** the count change is intended, not drift.

**Q2 — Do we build real codegen from the contract now, or keep discipline-enforced parallel specs?**
Today: contracts `wiki-api.yaml` (SoT, untagged), wiki-api `gen/` (hand-authored Go), MCP client (generated from stale tag), CLI client (own). MR-CLI2: ADR-0035 excludes Go codegen.
→ **Recommended default:** invest in real codegen now — it is the root cause of failure #1 (the CLI's 404-ing methods) and #2 (auth drift). Cut contracts **v0.1.4** to tag the live `/v1/wiki` grammar, generate wiki-api `gen/` and the MCP `.d.ts` from it, and add a Go generator for the CLI. Wire the `served-openapi-diff` gate (currently draft) so this class of drift fails CI. This is the highest-leverage single decision in the redo.

**Q3 — RFC 9457 `problem+json`, or keep the bespoke error envelope?**
The bespoke shapes are arguably *richer* for agents (CLI's `next` = runnable recovery command; `matches[]` for disambiguation) than problem+json's five fields.
→ **Recommended default:** converge all three onto the CLI's rich shape, add a stable `type` URI per code, and serve it under `application/problem+json` content-type (problem+json explicitly allows extension members — web-api §3.1). Standards-compat without losing the self-healing richness. Don't dogmatically strip fields to match the RFC.

**Q4 — Does `/v1` get an `Idempotency-Key` header, or is CAS enough?**
CAS handles concurrent-writer safety; it does NOT handle retry-safety (agent retries a write it's unsure landed). The engine already has internal idempotency keys.
→ **Recommended default:** yes, add `Idempotency-Key` to the public `/v1` write contract with a bounded replay window (web-api §4 — now table stakes for agent write APIs). Cheap given the engine plumbing exists.

**Q5 — Collapse version semantics onto one integer now?**
Read returns `version` as a timestamp string; block-patch CAS wants the integer `meta.version`. A read-version can't feed a write today (`evidence-contracts §1`).
→ **Recommended default:** yes — unify on the monotonic integer `meta.version` across read receipts, write CAS, and CloudEvents `version_field` (D-CON-5). This is a breaking change to the read shape, so it needs a contracts major bump + deprecation window (D-CON-1). Sequence it before wide MCP/CLI adoption.

**Q6 — When does wiki-api's edge auth get wired, and is engine-delegated 401 acceptable for Phase 0?**
Today `IDENTITY_VERIFY_ENABLED=false`, verifiers are `notImplemented`, `/v1/audit` unusable.
→ **Recommended default:** acceptable for Phase 0 ONLY because the engine still enforces its own 401 (no security hole, just no edge defense-in-depth). But the redo must schedule wiring the real `CallerVerifier` + issuer/JWKS as an M-gate, because P10 says the composition tier owns scoped authz, and `/v1/audit` (emitter-only per R16/R25) is dead until then. Flag it as a named launch gate, not "someday."

**Q7 — Should the scaffold-stub heroes be advertised in the default MCP `tools/list`?**
7 of 13 always return `NOT_AVAILABLE_YET`.
→ **Recommended default:** no. Demote them out of hero until substrate is live; reveal via `list_tools(category)` on promotion. Advertising always-failing tools in the always-loaded set violates P3 and burns context (web-mcp §5.3). Keep the "hero-13 ceiling" as a *live-capability* guarantee, not a reservation.

**Q8 — Does the `/v1/wiki` resource grammar get sub-resources (comments/labels/attachments), or do those stay separate?**
D-S11 gates `{resource}=wiki` only; the CLI's `comment`/`label`/`attach` methods 404 because no such routes exist.
→ **Recommended default:** model them as **sub-resources under the locator** (`/v1/wiki/{loc}/comments`, `/v1/wiki/{loc}/attachments`) rather than top-level resources — preserves the D-S11 `wiki`-only grammar while giving the CLI/MCP a real route. Until built, the CLI methods must become honest local stubs (like `wiki space`), never silent 404s.

**Q9 — Cursor-paginated changes feed + webhooks, or keep the time-anchored feed?**
→ **Recommended default:** cursor feed (opaque, 410+restart, server-max page) sharing the CloudEvents `version_field` watermark, PLUS webhook push off the same envelope (web-api §6, §12). This depends on the outbox→Kafka relay (D-S13) being built — sequence accordingly; the feed can ship cursor-based over the engine primitive before the relay exists.

**Q10 — Is the Linear support-issue relay in scope, given "Linear dropped entirely"?**
wiki-api still ships `POST /api/integrations/linear/issues`; the CLI's `wiki issue create` relays through it (`evidence-wiki-api §11`, `evidence-cli §3`). The code frames it as a scoped "file a support ticket" leg, not the dropped product integration.
→ **Recommended default:** treat it as a distinct **support-issue** capability, not "Linear integration" — but rename it to sever the naming (`/v1/support/issues`, server-held key) so it survives the Linear drop cleanly, or drop it if support-ticketing has another home. **Human should rule**, since the directive says "entirely."

**Q11 — Where does the shared client live, and can the CLI be MCP-exposable?**
Web research (web-cli §12) says CLI and MCP are complementary and the CLI should be MCP-exposable.
→ **Recommended default:** the generated client (Q2) is the shared substrate; the CLI shells out to `/v1` and is itself exposable as MCP tools via code-execution (web-mcp §2). Don't build a fourth abstraction — the contract IS the shared layer.

**Q12 — Async batch job endpoint for bulk agent sweeps?**
Only sync `blocks:batch`/`pages/bulk` exist.
→ **Recommended default:** add a submit→poll async batch endpoint (web-api §11; MCP tasks primitive web-mcp §4.1) for doc-migration/drift-reconciliation sweeps, kept separate from the live-turn path. Reserve now, build when the P1-factory/doc-consolidate workloads move onto `/v1`.

**Q13 — Response sanitization against prompt-injection in wiki bodies (P14)?**
Wiki pages are user-authored; their bodies flow back into an agent's context verbatim.
→ **Recommended default:** add a sanitization/annotation pass at the read boundary (wrap untrusted body content in a clearly-delimited, non-instruction-following frame). No source treats this as solved; flag as a security-pack item (R9) with the audit team, not invented ad hoc.

**Q14 — Does the family publish an eval suite as a shipping gate (P16)?**
MCP has golden-tape; CLI has the M12 gate; wiki-api's drift gates are mostly draft.
→ **Recommended default:** yes — make the realistic multi-step agentic eval a required gate on every verb/description change across all three (web-mcp §1.7, §5.6). Wire the draft drift gates (`served-openapi-diff`, `emitted-event-validation`) to blocking. This is how failure #4 stops recurring.

**Q15 — Is `code-execution-with-MCP` the target for heavy compositional workflows, and when?**
→ **Recommended default:** reserve the seam, defer the build. Budget the sandboxing/security overhead honestly (web-mcp §2.4) before committing; the 150k→2k win is real but so is the infra cost. Revisit once bulk wiki operations (consolidate/migrate) are first-class on `/v1`.

---

## 5. Implications for the PRD/architecture redo of each project

### 5.1 orvex-studio-contracts (must move first — it's the spine)
- **Cut v0.1.4** to tag the live `/v1/wiki` resource grammar (currently only in `Unreleased`; v0.1.3 consumers codegen the retired flat grammar — `evidence-contracts §7`). This unblocks every downstream codegen decision.
- **Own the `/internal/*` export seam.** `/internal/pages/{id}/export` (this branch's `b2f60c22` enrichment) has **zero** contract representation (`evidence-contracts §3`) — add an `openapi/internal/*.yaml` entry for the engine↔knowledge body-fetch leg.
- **Resolve version semantics** (Q5) — pin the unified integer contract with a documented breaking-change window.
- **Wire the drift gates** — move `served-openapi-diff` and `emitted-event-validation` from draft to active/blocking (`evidence-contracts §4`); they are the only mechanism that catches failures #1 and #4.
- **Decide the Go codegen bridge** (MR-CLI2) — extend ADR-0035 to cover the CLI or file a Go-stub ADR.
- Add **Arazzo workflow documents** (P13) for the multi-step wiki flows.

### 5.2 orvex-wiki-api (the composition tier — most net-new affordance work)
- **Replace hand-authored `gen/` with real codegen** from the v0.1.4 tag (`evidence-wiki-api §8`) — root-cause fix for spine drift.
- **Wire edge auth** (Q6): call `NewLibCallerVerifier`, provision issuer/JWKS, make `IDENTITY_VERIFY_ENABLED` safe to turn on, make `/v1/audit` usable (emitter-only).
- **Add:** `Idempotency-Key` (Q4), cursor changes feed (Q9), rate-limit headers, `llms.txt`+`/.well-known`, `problem+json` content-type on the aligned error envelope (Q3), async batch (Q12).
- **Collapse the four error mappers** (`classifyReadLadderError`/`classifyWriteContractError`/`writePageBlocksError`/`writeDriftError`, `evidence-wiki-api §5`) into one table-driven mapper keyed off the frozen vocabulary.
- **Resolve Linear relay naming** (Q10) and **add comment/label/attachment sub-resources** or formally exclude them (Q8).
- Keep the resource grammar, read ladder, CAS, D-S11 gate, and the correct **absence** of any `/v1` streaming verb (R21) — these are right.

### 5.3 orvex-studio-mcp (projection — mostly refinement, one reconciliation)
- **Reconcile the surface count** (Q1): state hero-13 explicitly, re-file ADR-0038, preserve R21's streaming-requirement framing against the verb *classes*.
- **Demote scaffold-stub heroes** out of the default `tools/list` (Q7) — advertise only live-capable tools.
- **Flip to `structuredContent`-primary** for list/receipt payloads; annotate all reads `readOnlyHint:true` (§3.1-D).
- **Ask-class streaming stays dormant** until `ai` ships `text/event-stream`+K5 verdict frame (cross-service dependency; do not claim live — `evidence-decisions §1`).
- **Fix the `marketplace_search`/`skill_get` env-gate mismatch** (gated on `STUDIO_BACKEND_BASE_URL` but really depend on `KNOWLEDGE_BASE_URL`, `evidence-mcp §12`).
- Keep the 4-layer write governance + READ_ONLY ceiling + verbatim-ratify chain — these are exemplary and satisfy P7/P8/P10.

### 5.4 orvex-cli (projection — correctness sweep + agent-CLI finish)
- **Fix the broken resource-shaped client methods** (`comment`/`label`/`attach`/possibly `governance`/`history`/`migrate`-archive) — verify each against a live wiki-api, convert 404-ers to honest stubs or wait on §3.4-Q8 routes (`evidence-cli §3`). This is the #1 correctness item.
- **Retire the direct-to-engine `prod` profile** (`wiki.eu1.orvex.ai`) — route through `/v1` per Q22/M7 (`evidence-decisions §2d`).
- **Add `orvex schema` introspection** + a **first-party Skill file** (§3.3) — the two agent-CLI affordances the research most emphasizes that are missing.
- **Universalize `--dry-run`** + separate destructive flag; **finish `daemon`/`cache`**.
- **Consume the shared generated client** (Q2/Q11) instead of the bespoke `internal/client`.
- **Refresh the stale README** (`evidence-cli §Intro`) — it still calls HEAD "a compiling skeleton."
- Keep noun-verb grammar, frozen exit codes, `--fields`/`--compact`, OIDC+headless auth, `ErrorCodeRegistry` — these already meet the bar.

### 5.5 Cross-cutting (all four PRDs must state the same thing)
- **P1 is the theme:** one contract, generated everywhere. Every PRD references the contracts tag as its codegen source; none re-describes the grammar.
- **The shared spine table (§3.4)** is normative: any PRD that re-invents an error envelope, a CAS scheme, a governance response, or a locator dialect is drifting and should be bounced.
- **Every behavioral claim carries a live-code citation** (M1) — the PRDs are written against verified HEAD, and the four current-state failures (§2.2) are named explicitly as the work, not glossed as done.

---

## Appendix — evidence index (files read in full)

Web research: `evidence-web-mcp.md` (14 MCP design principles), `evidence-web-api.md` (13 API principles), `evidence-web-cli.md` (12 CLI principles). Decisions: `evidence-decisions.md` (R1-R27 + JC-1..4, po-decisions `2026-07-07.md`/`2026-07-16.md`). Current-state surface maps: `evidence-mcp.md` (52 tools @ `4f81b48`), `evidence-wiki-api.md` (`/v1` @ `b651e89`), `evidence-orvex-cli.md` (@ `48329b7`), `evidence-engine.md` (@ `5572beeb`/`b2f60c22`), `evidence-contracts.md` (@ `6512408`). Canon maps (summarized in brief): canon-wikiapi, canon-mcp (hero-13 re-baseline `ZGjLctEnGH`), canon-cli, canon-engine, evidence-linear.
