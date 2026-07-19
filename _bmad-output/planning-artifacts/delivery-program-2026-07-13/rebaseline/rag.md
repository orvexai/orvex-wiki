# Six-surface re-baseline — Surface: **rag** (ENG-2033)

**Date:** 2026-07-13 · **Verifier:** rag acceptance subagent · **Service:** orvex-studio-knowledge (hybrid retrieval / Turbopuffer)
**Honesty note:** every verdict below is backed by a command I personally ran against the standing dev cell and the actual (trimmed) output. No verdict is inferred from code reading, Linear state, or a CI badge. Where I could not exercise something it is called out explicitly.

**Overall verdict: FAIL** (mission's ACL/isolation/tsvector checks all PASS live — see checks 1-4; but the `/v1/query` endpoint misbehaves with a confirmed over-exposure/bloat defect (DEFECT-RAG-1) that also keeps the canonical M5 DoD gate `TestM5KnowledgeE2E` RED — see check 5. The surface's isolation *guarantees* are sound; the surface is *not* a clean end-to-end pass.)

---

## 1. Environment facts established

| Fact | Value |
|---|---|
| kube context | `kubernetes-admin@eu-central-1` |
| knowledge ns / pods | `orvex-studio-knowledge-dev` — query `orvex-studio-knowledge-5c87498d88-2v55q`, indexer, sse all `Running` |
| identity ns | `orvex-studio-identity-dev` (svc `orvex-studio-identity:80`) |
| engine ns | `orvex-wiki-dev` (svc `orvex-wiki:3000`) |
| Access method | `kubectl port-forward`: knowledge query pod →`127.0.0.1:28080`, identity →`:28091`, engine →`:28082` (knowledge `/v1` is deliberately cluster-local-only, no public edge) |
| Clerk (idP) | `https://api.clerk.com` (reachable from host; Cloudflare blocks default urllib UA → used `curl/8` UA) |
| Endpoint under test | `POST /v1/query` (hero hybrid search), `POST /v1/retrieve`; auth = identity-minted opaque exchange bearer |
| Tenants used (disposable, self-provisioned per m9 recipe) | **Tenant A** org `org_3GRokYxDY8P…` → engine workspace UUID `22a8755e-9694-4a02-b07d-7708b646cada`; **Tenant B** org `org_3GRokVkfUP…` → workspace `586aeb4c-0488-4c32-a759-559f6d09b24c` |
| Personas | ownerA (org:admin, both grants), scopedA (org:member, **no** page/space grant — same tenant A), ownerB (org:admin, tenant B) |
| Seeded corpus (deterministic needles, real engine pages) | tenant A: `M5 Readable` (page `…eaad7685ef49`), `M5 Restricted` (page `…e6d4046b8453`, page-permission restricted); tenant B: `M5 TenantB` (page `…a7e29d1f8f84`) |
| Internal-token alignment verified | engine `INTERNAL_API_BEARER_TOKEN` == identity `ENGINE_INTERNAL_API_TOKEN` (sha16 `2413fc4e16ab8937` both) |

The corpus + identities were produced by running the repo's own M5 gate harness (`orvex-studio-knowledge/tests/e2e`, `TestM5KnowledgeE2E`) against the port-forwarded dev cell, with real-dep secrets pulled from the cluster (Clerk key from `orvex-studio-identity-clerk-credentials`, engine internal bearer from `orvex-wiki-internal-api`). The harness successfully ran the full backbone — Clerk mint → identity `/v1/exchange` → engine `/api/orvex/session/exchange` → `/internal/principals/provision` (materialized both workspaces) → space/page create → **Turbopuffer index** → visible in `/v1/query`. **Note:** the identity `/v1/registry/assign` HTTP-500 that fake-done'd this gate on 2026-07-12 is now FIXED — the gate advanced past it to the query step.

---

## 2. Checks

### Check 1 — auth is enforced (deny-by-default) ✅ PASS
```
$ curl -i -XPOST http://127.0.0.1:28080/v1/query -d '{"query":"x","mode":"hybrid","k":5}'
HTTP/1.1 401 Unauthorized        # no bearer → opaque 401 (no oracle)
```
Query never serves an unauthenticated caller.

### Check 2 — tenant-namespaced isolation, NO cross-tenant leak (AC1) ✅ PASS
Three callers, **same term** `"orvexm5gate needle"` (tenant B's doc also contains "needle"). Vectors stripped for readability; full raw in `scratchpad/rag-acl-probe.txt`.
```
introspect: ownerA  tenant=22a8755e-…-7708b646cada  scope=[ai:invoke search:read wiki:read wiki:write]
            scopedA tenant=22a8755e-…-7708b646cada  (SAME tenant as ownerA)
            ownerB  tenant=586aeb4c-…-559f6d09b24c

TERM 'orvexm5gate needle':
  ownerA : total=2  hits=[…e6d4046b8453(RESTRICTED-A), …eaad7685ef49(READABLE-A)]
  scopedA: total=0  hits=[]
  ownerB : total=1  hits=[…a7e29d1f8f84(TenantB)]
```
- ownerA sees ONLY tenant-A pages; tenant-B's `…a7e29d1f8f84` NEVER appears.
- ownerB sees ONLY tenant-B's page; tenant-A pages NEVER appear.
- Cross-probe (defence): ownerA querying `"orvexm5gate bravo needle"` (B's own terms) still returns only A's 2 pages; ownerB querying `"orvexm5gate secret needle"` (A's restricted terms) still returns only B's page. **No leak in either direction.** Namespace derivation is `namespace := principal.Tenant` (workflow.go:285) — the Turbopuffer query is scoped to the caller's tenant workspace UUID.

### Check 3 — intra-tenant ACL ∩ token-scope filtering, results DIFFER appropriately (AC2) ✅ PASS
- ownerA (owner, granted) vs scopedA (org:member, **no** grant), **same tenant, same term**:
  - ownerA → `{READABLE, RESTRICTED}` (2 hits)
  - scopedA → `{}` (0 hits) — the restricted page is filtered (AC2 core: restricted bytes = 0) AND the readable page is filtered too (scoped member has no space/page grant → engine-ACL deny-by-default). The scoped principal is confirmed co-tenant (tenant `22a8755e…` == ownerA's), so this is a real ACL narrowing, not a vacuous empty-tenant pass.
- Results differ appropriately by ACL within the same tenant namespace and token scope. The engine-ACL post-filter (`Orchestrator.narrow`, workflow.go:302) admits nothing a caller cannot read.

### Check 4 — Postgres tsvector fallback is genuinely GONE; search goes through Turbopuffer ✅ PASS
Static (independent grep over all non-test production Go — `internal/`, `cmd/`):
```
$ grep -rniE "to_tsquery|plainto_tsquery|websearch_to_tsquery|ts_rank|tsvector|\btsv\b|ts_headline|@@ " --include=*.go internal cmd | grep -v _test
(no matches)
$ go test ./internal/search/ -run TestUnifiedSearchReadYourWritesAndCitations -v   # contains assertNoTsvectorSymbols over internal/search + internal/turbopuffer
--- PASS
```
Runtime: the live `/v1/query` round-trip returned real Turbopuffer ANN results — 1024-dim embeddings per hit + RRF-fused scores (`0.0164 = 1/(60+rank)`), keyed by per-tenant namespace (`principal.Tenant`). Query pod consumes `studio-knowledge-turbopuffer-credentials` (`TURBOPUFFER_API_KEY`, `TURBOPUFFER_BASE_URL`). The candidate-gen path is `o.index.Query(turbopuffer.Query{…})` (workflow.go:286) — no Postgres text-search code path exists.

### Check 5 — `/v1/query` response integrity ❌ FAIL (DEFECT-RAG-1)
The M5 gate harness RED'd at the query step:
```
m5_knowledge_e2e_test.go:150: [M5-GATE-RED reason=decode] step query: decode response:
    invalid character ' ' after decimal point in numeric literal
--- FAIL: TestM5KnowledgeE2E (12.42s)
```
Root cause (captured raw response, `scratchpad/rag-repro-query.txt`): **`/v1/query` returns every hit's full raw embedding `vector` (1024 floats) in the JSON body.**
```
query response bytes: 26391  (2 hits)   →  bytes WITHOUT vectors: 981
  hit …e6d4046b8453  vector_dims=1024  snippet_bytes=59
  hit …eaad7685ef49  vector_dims=1024  snippet_bytes=55
```
~13 KB/hit of raw floats (27× bloat). The harness reads the body under `io.LimitReader(resp.Body, 4096)`, so the body truncates mid-vector → invalid JSON → decode RED. Beyond breaking the canonical gate, this is an **over-exposure**: `gen.Hit.Vector`'s own contract (gen/query.go:38-43) says it is "populated ONLY when the query set `turbopuffer.Query.IncludeVectors`", yet the hero `Orchestrator.Search` path (workflow.go:241-296) never sets `IncludeVectors` and never strips the field — the Turbopuffer adapter copies `row.Vector` into every hit unconditionally (turbopuffer.go:357 `IncludeAttributes:true` + line ~383 `Vector: row.Vector`) and the API serializes it. Raw embeddings are returned to every search caller (ai cited-ask, mcp, cli) with no opt-in.

This does **not** compromise the ACL/tenant-isolation guarantees (checks 2-3 hold), but the endpoint does not cleanly work end-to-end: the canonical DoD gate cannot go green against it and real consumers receive malformed-for-them, over-large, embedding-leaking payloads.

---

## 3. Overall verdict: **FAIL**
- Tenant-namespaced isolation, no cross-tenant leak (both directions): **verified PASS**.
- ACL ∩ token-scope intra-tenant filtering, results differ appropriately: **verified PASS**.
- tsvector fallback gone / search through Turbopuffer: **verified PASS** (static + live).
- `/v1/query` response integrity: **FAIL** — embedding over-exposure + 27× payload bloat (DEFECT-RAG-1); keeps the canonical `TestM5KnowledgeE2E` gate RED.

The surface's security-critical behavior (isolation/ACL) is sound and was exercised on real data; the surface is not a clean acceptance pass because its primary endpoint over-exposes raw embeddings and the canonical gate cannot pass against it.

---

## 4. DEFECTS — ready-to-file ticket stub

### DEFECT-RAG-1 — `/v1/query` leaks each hit's raw 1024-dim embedding vector (over-exposure + 27× payload bloat; blocks M5 DoD gate)
- **Suspected owner service:** `orvex-studio-knowledge` (hero search path).
- **Severity:** High — over-exposes raw embeddings to every search caller; 26 KB for 2 hits vs 981 B without vectors; and it is the reason `TestM5KnowledgeE2E` (ENG-1559 M5 DoD) still RED's — the harness's `io.LimitReader(…, 4096)` truncates the vector-bloated body mid-number → `decode: invalid character ' ' after decimal point`.
- **Evidence:**
  - Live raw `POST /v1/query` (owner A, term `orvexm5gate needle`) returned `hits[].vector` = 1024 floats per hit; body 26391 B, 981 B once vectors stripped (`scratchpad/rag-repro-query.txt`, `rag-acl-probe.txt`).
  - `gen/query.go:38-43` contract: `Vector` is populated "ONLY when the query set `turbopuffer.Query.IncludeVectors`"; hero `Orchestrator.Search` (`internal/workflow/workflow.go:241-296`) never sets `IncludeVectors` and never nils `Hit.Vector`; adapter unconditionally copies `row.Vector` (`internal/turbopuffer/turbopuffer.go:357,~383`).
  - Gate output: `m5_knowledge_e2e_test.go:150 [M5-GATE-RED reason=decode] … invalid character ' ' after decimal point` (`scratchpad/rag-m5-out.txt`).
- **Suggested fix (either/both):** (a) hero `Search`/`Retrieve` explicitly drop `Hit.Vector` before returning (retrieval callers never need it — see gen/query.go note); (b) the adapter only populates `Hit.Vector` when `q.IncludeVectors`. Also raise the M5 harness `LimitReader` cap so it isn't silently truncating (secondary, test-side).

### (Observed, not a product defect) M5 gate harness `doJSON` 4096-byte `LimitReader`
- The 4096 cap in `tests/e2e/m5_knowledge_e2e_test.go` doJSON turns any large-but-valid response into a decode RED. It masks the real cause behind a generic decode error. Owner: `orvex-studio-knowledge` test harness. Fix alongside DEFECT-RAG-1 (bump cap / stream-decode) so the gate reports the true failure.

---
*Reproduction artifacts (host scratchpad): `run-m5-gate.sh`, `rag-m5-out.txt`, `repro-query.sh`, `rag-repro-query.txt`, `acl-probe.py`, `rag-acl-probe.txt`.*
