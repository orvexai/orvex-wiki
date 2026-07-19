# Review — Version / Reality lens (both spines)

**Scope:** this single review covers BOTH architecture spines authored 2026-07-10:
- `architecture-orvex-studio-staging-2026-07-10/ARCHITECTURE-SPINE.md`
- `architecture-orvex-studio-workgraph-2026-07-10/ARCHITECTURE-SPINE.md`

**Lens (configured gate floor):** verify every committed decision was web-researched or reality-checked
rather than asserted from training data — current library/framework versions, that each named technology
still exists and fits, and the live defaults of anything it leans on. Flag anything that could be out of date
and was not confirmed against the web, the existing project, or current reality.

**Evidence used (no new web calls needed — evidence + repos settled every claim):**
- Web-verified pins: `scratchpad/version-pins.md` (verified 2026-07-10).
- As-built repos under `/home/daniel/repos/orvex-studio-*`, `orvex-workflows`, `orvex-wiki-api`.
- Family conventions: `scratchpad/canon-distilled.md`.

Method: every Stack-table row and every as-built assertion was checked against a pin file or a real repo.
Nothing required a fresh WebSearch — the two evidence files plus the on-disk repos resolved all of it.

---

## 1. Stack-table verification

Legend: ✅ verified stable & current · ⚠ finding (see §3) · ℹ confirmed but worth a note.

### Staging Stack

| Row | Claimed | Verdict | Evidence |
| --- | --- | --- | --- |
| Go | 1.26.0 / toolchain go1.26.5 | ✅ | pins §1: go1.26.5 stable 2026-07-07; go1.27 is rc2 only (correctly not pinned). lib go.mod `go 1.26.0`. |
| orvex-studio-lib | v0.3.0 | ⚠ **F1** | repo tags: v0.3.1 (2026-07-10) is latest stable; v0.3.0 (2026-07-08) lags the auth/secrets surface the spine leans on. |
| jackc/pgx/v5 (pgxpool) | v5.10.0 | ✅ | pins §10 (CVE-2026-33816 fixed ≥v5.9.0); as-built: 5 satellites on v5.10.0. pgxpool is native to pgx/v5. |
| PostgreSQL / CNPG | 18 / operator v1.30.0 | ✅ | pins §2: PG18 GA (19 is Beta1 only); CNPG supports 14→18, operator v1.30.0 (2026-06-29), default image PG18.4. |
| orvex-studio-contracts | v0.1.2 at authoring | ✅ | repo: v0.1.2 is the latest tag (HEAD 3 commits past, untagged additive ADR-0015 work). Pin correct. |
| testcontainers-go | v0.43.0 | ℹ **F3** | not in pins (web-unverified) but confirmed as-built family convention (billing + 2 others on v0.43.0). |
| Temporal (central) | server v1.31.2 · Go SDK v1.46.0 | ℹ **F2** | pins §4: both are verified latest-stable (server fixes CVE-2026-5724). As-built workflows deploys 1.31.0. |
| MCP server side (TS) | @modelcontextprotocol/sdk ^1.29 · zod 4 | ✅ | studio-mcp package.json: `^1.29.0` + `zod ^4.4.3`. Exact match. |
| Object store | Rook-Ceph S3 | ✅ | canon platform substrate. |

### Workgraph Stack (rows additional to / differing from staging)

| Row | Claimed | Verdict | Evidence |
| --- | --- | --- | --- |
| PostgreSQL / CNPG | 18 / operator v1.30.0 — **no pgvector** | ✅ | pins §2; pgvector correctly excluded per P5 + ADR-0014 (resolves canon COLLISION #2). |
| MCP server side (TS) | …sdk ^1.29 · zod 4 · **spec 2025-11-25 (2026-07-28 is RC — do not pin)** | ✅ | pins §6: 2025-11-25 is current stable; 2026-07-28 is an RC. Spine correctly picks stable over RC. |
| Claude memory-tool protocol | `memory_20250818` | ✅ | pins §7 exact match (name `memory`, 6 cmds view/create/str_replace/insert/delete/rename over `/memories`). |
| KG interop shape | @modelcontextprotocol/server-memory 2026.7.4 | ✅ | pins §8 exact match (calver 2026.7.4, entity/relation/observation shape). |
| Temporal (central) | server v1.31.2 · Go SDK v1.46.0 | ℹ **F2** | same as staging. |
| Go / lib / pgx / contracts / testcontainers | (same as staging) | ⚠ **F1** / ℹ **F3** | lib v0.3.0 stale; testcontainers repo-only. Rest ✅. |

---

## 2. As-built assertion verification

| Assertion (spine) | Verdict | Evidence |
| --- | --- | --- |
| lib `pkg/obs` is a stub; wiring OTel is early scope | ✅ real | `pkg/obs/` = only `doc.go` (22 LOC): "stdlib-only stub; the otel SDK dependency lands with the first…". |
| auth via lib `pkg/auth` `Middleware` + `VerifyFresh` (per-agent scoped tokens) | ✅ real | `verifier.go`: `Verify` (L173), `VerifyFresh` (L182), `Middleware` (L388) — real methods, exercised by happy-path + fail-closed + workload-route tests. **Canon-distilled's "Verify() is a stub as of 2026-07-06" is itself now stale** — identity's verifier has been ported in. |
| no own Temporal worker / no Temporal SDK in satellites (P6) | ✅ real | zero `go.temporal.io` imports in any `orvex-studio-*/go.mod`. |
| billing `cmd/orphansweep` precedent (staging `cmd/sweep`, workgraph `cmd/reaper`) | ✅ real | `orvex-studio-billing/cmd/orphansweep/main.go` exists. |
| lib clients: `wikiapiclient`, `billingclient`, `knowledgeclient`, `identityclient` exist; `aiclient`/`stagingclient`/`workgraphclient` to be added | ✅ accurate | `pkg/` has the first four; the latter three are absent — both spines correctly say "extend lib" rather than assuming them. |
| staging AD-12: `classifyOnSave` is the migration on-ramp; "shipped Curator goldens" (idempotency, no-direct-LLM, degrade reasons) | ✅ real | `orvex-studio-api/src/curator/classifyOnSave.ts` + `test/curator-idempotent-golden.test.ts`, `curator-no-direct-llm.test.ts`, `curator-degrade-unclassified.test.ts`. (Lives in studio-api, not mcp.) |
| MCP tools `studio_library_save` / `studio_librarian_session` / `studio_marketplace_*` / `save_page` (staging); `studio_memory_get/save` (workgraph) | ✅ real | all present in `orvex-studio-mcp/src/server/tool-catalog.ts`; `installToolVisibility` real in `tool-visibility.ts`. |
| workgraph: semantic leg rides knowledge/Turbopuffer, ships no local vector store (ADR-0014) | ✅ correct | resolves the P5/ADR-0014 pgvector collision; PO ruling recorded in AD-3. |
| named external tech — beads (work-graph), Mem0 (ADD/UPDATE/DELETE/NOOP), Zep (LLM-in-loop), Turbopuffer, CNPG, Strimzi, Knative | ✅ exist & fit | all are real projects and each characterization matches its real behavior. (`beads ADR-0002` cited as design lineage is an external, non-pinned reference — immaterial to versioning.) |
| hard-cut gated on non-501 `orvex-studio-ai` + `orvex-studio-knowledge` | ✅ honest | canon confirms ai/knowledge are 501 scaffolds today; spine gates the cut on them going non-501 rather than assuming them live. |

---

## 3. Findings

**F1 — [MEDIUM] `orvex-studio-lib` pinned at v0.3.0 is stale; bump to v0.3.1 (both spines).**
`v0.3.1` is the latest stable tag (2026-07-10 01:22), ahead of the pinned `v0.3.0` (2026-07-08). The v0.3.0→v0.3.1
range is exactly the surface the spines' invariants lean on: **ENG-1639 workload-identity hook + route-class
exclusivity** (staging AD-4 "agent-class tokens 403" / AD-8 + workgraph AD-9 per-agent scoped-token Middleware),
**ENG-1638 offline-verifier port**, **`pkg/secrets` OpenBao+ESO AES-256-GCM helper** (both spines' "secrets
OpenBao+ESO"), and the **go1.26.5 toolchain bump** the Stack already claims. Pinning v0.3.0 asks the build to
depend on auth/secrets behavior that only fully lands in v0.3.1. Fix: set both Stack tables to
`orvex-studio-lib v0.3.1`.

**F2 — [LOW] Temporal server pin is ahead of as-built (both spines) — informational, not a defect.**
Stack cites `server v1.31.2 · Go SDK v1.46.0`, both the verified latest-stable (server fixes CVE-2026-5724) — the
correct forward target. As-built `orvex-workflows` deploys `temporalio/auto-setup:1.31.0`, and its go.mod SDK pin
could not be confirmed (no `go.temporal.io/sdk` line found). The spine's numbers are right; flag only so the
workflows deploy/SDK is uplifted to match, and confirm the SDK pin before freeze.

**F3 — [INFO] `testcontainers-go v0.43.0` is repo-verified but not web-verified.**
Not present in `version-pins.md`; confirmed only as the current as-built family convention (billing + two other
satellites on v0.43.0). Consistent and safe to adopt, but a one-line web latest-stable check would close the lens
fully before freeze.

**No RC/beta pins, no fabricated technologies, no phantom dependencies found.** Both spines demonstrate active
reality-checking: stable-over-RC on the MCP spec, the pgvector/ADR-0014 collision resolved to Turbopuffer-via-
knowledge, and precision-critical strings (`memory_20250818`, `@modelcontextprotocol/server-memory 2026.7.4`)
reproduced exactly from the vendor surface.

---

## 4. Verdicts

- **Staging — PASS (version/reality lens).** Every Stack row is stable-channel and matches a verified pin or the
  as-built repos; every as-built assertion is real. One MEDIUM (F1 lib pin) + two minor (F2/F3).
- **Workgraph — PASS (version/reality lens).** Same shared F1/F2/F3; otherwise exemplary — stable-over-RC MCP
  spec, pgvector correctly excluded, memory-tool and KG-interop shapes reproduced exactly from the verified pins.
