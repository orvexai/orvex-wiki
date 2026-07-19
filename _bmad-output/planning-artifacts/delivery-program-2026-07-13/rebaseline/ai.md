# Surface re-baseline — `ai` (orvex-studio-ai cited-ask + inline writeback)

**Program:** Orvex Wiki six-surface acceptance re-baseline (ENG-2033)
**Surface:** ai
**Date:** 2026-07-13
**Verifier:** rebaseline subagent (adversarial; honesty clause per `po-decisions/fake-done-forensics.md`)
**Overall verdict: FAIL** — the cited-ask *contract mechanics* (edge-auth, delegated retrieval, K5 envelope, graceful abstention, no-leak) were exercised and work end-to-end, but the surface's **headline product promise could not be demonstrated**: cited-ask returns **zero citations** (knowledge corpus holds only un-extracted registry stubs), and the inline-edit **writeback could not be confirmed landing through the engine chokepoint** (engine is flapping / binds localhost; `can-edit` returns 404/502). Two ai-side defects also found (500 on a workspace-less token; ACL denial masked as `500 UPSTREAM_ERROR`).

---

## 1. Environment facts established

| Fact | Value |
|---|---|
| kube context | `kubernetes-admin@eu-central-1` (dev cell) |
| ai namespace / pod | `orvex-studio-ai-dev` / `orvex-studio-ai-f98d9d78c-928v8` (1/1), container `server`, listens `:8080` |
| ai edge-auth | issuer `https://tough-hornet-12.clerk.accounts.dev`, audience `orvex-studio-ai`, JWKS from Clerk (from secret `orvex-studio-ai-clerk-credentials`) |
| ai upstreams (configmap `orvex-studio-ai-config`) | KNOWLEDGE=`orvex-studio-knowledge.orvex-studio-knowledge-dev`, IDENTITY=`orvex-studio-identity.orvex-studio-identity-dev`, WIKI_API=`orvex-wiki-api.orvex-wiki-api-dev`, BILLING=`orvex-studio-billing.orvex-studio-billing-dev` |
| knowledge | `orvex-studio-knowledge-dev` (svc + indexer + sse pods 1/1); Postgres `documents` table: **112 rows, all `extraction_state=''`, no chunks, no titles** |
| billing | `orvex-studio-billing-dev` — healthy; `/v1/entitlements/{type}/{id}` returns free-tier 200 |
| engine (chokepoint) | `orvex-wiki-dev` — **UNSTABLE / flapping**: pods cycle 0/1↔1/1; every replica logs `Listening on http://127.0.0.1:3000` (localhost bind) and `Error: Cannot find module './ee/ee.module'` (MODULE_NOT_FOUND, "continuing"). Readiness probe to pod-IP:3000/api/health intermittently times out. |
| test tenant (disposable) | Clerk user `user_3GRp7ZIIDYP22voQ5eKuZNC6Bzz` (`example.com` email), minted via identity's `CLERK_SECRET_KEY`; workspace claim `user:user_3GRp7ZII…` (personal, no org). No real user tenant mutated. |
| ai surface reached via | `kubectl port-forward pod/orvex-studio-ai-… 19091:8080` |

Token mint: real RS256 Clerk session JWT via Clerk Backend API (`POST /v1/sessions` → `POST /v1/sessions/{id}/tokens/{template}`). Two templates used: `orvex-studio-ai-e2e` (aud only) and `orvex-ai-nightfix-budget-preflight` (adds `workspace: user:{{user.id}}`). Clerk dev instance is at its **100-user cap** (`user_quota_exceeded`) — reused one user.

---

## 2. Checks

### Check A — Deny-by-default (no bearer) → 401 — **PASS**
```
$ curl "http://127.0.0.1:19091/api/ai/ask?ask=what%20is%20orvex"
unauthorized            HTTP 401
$ curl -X POST .../api/ai/inline  (no token)
unauthorized            HTTP 401
```
`GET /api/ai/ask` and `POST /api/ai/inline` both fail closed (authV.Middleware). Health confirms identity: `GET /healthz → {"service":"orvex-studio-ai","status":"ok"} 200`.
Note: the inline 401 (not a 501) proves `/api/ai/inline` is **wired to the real handler** (InlineWiring.Service non-nil), not a pre-cutover stub.

### Check B — Cited-ask envelope round-trip with a real caller-scoped token — **PARTIAL / envelope PASS, citations FAIL**
Token with a `workspace` claim:
```
$ curl -H "Authorization: Bearer <clerk-jwt>" \
    "http://127.0.0.1:19091/api/ai/ask?ask=What%20is%20the%20Orvex%20Studio%20split%20plan%3F"
{"answer":"","citations":[],"unanswered":true,
 "gapNote":"No relevant content was found for this question.",
 "confidence":0,"followups":[]}   HTTP 200
```
- Edge-auth accepted the token (not 401); budget-preflight passed (billing free-tier); the **full delegated loop ran**: ai → identity `/v1/exchange` → knowledge retrieve → K5 envelope.
- The response carries the **complete K5 shape** `{answer, citations, unanswered, confidence, followups, gapNote}` (matches `schemas/k5-cited-answer.schema.json` required set). ✅ contract shape.
- **citations = [] / unanswered = true** on every question tried (split plan, architecture). The mission's core assertion — *citations resolving to real readable pages* — **cannot be satisfied**: knowledge has no citable content (see Check D). ❌

### Check C — Cited-ask with a token that has NO workspace claim → 500 (ai DEFECT) — **FAIL**
Same call with the `orvex-studio-ai-e2e` template (aud only, no `workspace` claim):
```
{"code":"INTERNAL"}      HTTP 500
```
ai log: `ask discovery turn failed: clients: read-entitlement status 404: 404 page not found`.
Root cause: with no workspace claim the derived principal id is empty → the budget-preflight's billing `ReadEntitlement` hits a malformed path (`/v1/entitlements/user/` with empty id) → billing default-mux 404 → mapped to opaque `500 INTERNAL`. Billing itself is healthy (a well-formed principal returns free-tier 200). An authenticated-but-unscoped token should be rejected cleanly (400/403), not 500. → **DEFECT-AI-1**.

### Check D — Do citations resolve to real readable pages? — **FAIL (blocked upstream)**
`documents` table in knowledge Postgres:
```
$ psql -c "select source_type,status,extraction_state,(title<>'') has_title,(chunk_content_hash<>'') has_chunks,count(*) ..."
 source_type | status    | extraction_state | has_title | has_chunks | count
 wiki-page   | published |                  | f         | f          |   112
```
All 112 documents across 58 tenants are **registry stubs**: `extraction_state=''`, empty `title`, empty `chunk_content_hash` → **zero extracted/chunked content anywhere** → nothing citable.
Indexer log (root cause):
```
indexer: ingest event type="wiki.page.content_updated": ingest resolve body …
  engine ResolveBody: Get "http://orvex-wiki.orvex-wiki-dev…:3000/internal/pages/…/export": connect: connection refused
indexer: ingest event type="wiki.workspace.created": workflow: pipeline not implemented (scaffold)
```
Extraction fails because the engine chokepoint it must call (`/internal/pages/{id}/export`) is unavailable during the engine's flapping, **and** many event types are still `pipeline not implemented (scaffold)`. → **DEFECT-KNOW-1 / DEFECT-ENG-1**.

### Check E — Inline-edit writeback through the engine chokepoint with the DELEGATED token — **FAIL (could not confirm a landed write)**
```
$ curl -H "Authorization: Bearer <clerk-jwt>" -d '{"pageId":"019f5b53-…","prompt":"Add a summary"}' \
    http://127.0.0.1:19091/api/ai/inline
{"code":"UPSTREAM_ERROR","detail":"permission check: clients: can-edit status 404","status":"error"}  HTTP 500
   (observed variants across engine flaps: can-edit status 502, can-edit status 404)
```
- The inline handler **forwards the delegated caller token** to wiki-api `can-edit` (no elevated credential — an elevated cred would have bypassed the check). ✅ delegation posture.
- It **fails closed** on a page the caller cannot see (`can-edit 404`, no-leak). ✅ ACL posture.
- But I **could not confirm a write landing in the engine ydoc**: I have no editable page in my own disposable tenant, and creating one requires the engine chokepoint, which is flapping (wiki-api → engine returns 404/502 depending on the flap). The "writeback lands through the chokepoint" assertion is therefore **UNVERIFIED / blocked by engine instability**.
- Secondary issue: a permission **denial** (`can-edit 404`) is surfaced to the caller as `HTTP 500 UPSTREAM_ERROR` rather than a clean 403/404. → **DEFECT-AI-2**.

### Check F — ACL: a second caller without access must not receive the same citations — **INCONCLUSIVE (untestable on empty corpus)**
With zero extracted content, **no** caller receives any citations, so a citation *differential* between an authorized and an unauthorized caller cannot be demonstrated. The deny-closed / no-leak posture is however positively confirmed by the surrounding checks: no-token → 401 (Check A); cross-tenant page → `can-edit 404` no-leak (Check E); out-of-scope ask → `unanswered` envelope with no content leaked (Check B). A true ACL-differential re-test is **blocked until the corpus has real, extracted, ACL-tagged content** (i.e. until DEFECT-ENG-1 / DEFECT-KNOW-1 clear).

---

## 3. Overall verdict — **FAIL**

Verified working (personally exercised): edge-auth deny-by-default; the cited-ask **contract** (K5 envelope shape, delegated ai→identity→knowledge retrieval, graceful `unanswered` abstention, no-leak); inline surface is wired and forwards the delegated token fail-closed.

Not delivered / could not confirm (the surface's actual acceptance): **no real citations to real readable pages** (empty/un-extracted corpus), and **no confirmed inline writeback landing in the engine ydoc** (flapping chokepoint). Plus two ai-side failure-mode defects. Per the honesty clause this is a **FAIL**, with the dominant root cause being **upstream** (engine instability → broken knowledge extraction), not the ai service's own logic.

---

## 4. DEFECTS (ready-to-file ticket stubs)

### DEFECT-ENG-1 (root cause / blocker for the whole surface) — suspected owner: **orvex-wiki (engine)**
**Title:** Engine dev pod flaps / binds `127.0.0.1` only + `Cannot find module './ee/ee.module'` — chokepoint intermittently unavailable
**Evidence:** `orvex-wiki-dev` replicas cycle 0/1↔1/1; every pod logs `Listening on http://127.0.0.1:3000` and `Error: Cannot find module './ee/ee.module' (MODULE_NOT_FOUND)`; readiness probe `Get http://<podIP>:3000/api/health: context deadline exceeded`. Downstream: wiki-api `can-edit` returns 404/502; knowledge indexer `engine ResolveBody … connect: connection refused`. Blocks inline writeback AND knowledge extraction.

### DEFECT-KNOW-1 — suspected owner: **orvex-studio-knowledge (indexer)**
**Title:** Knowledge corpus is 112 un-extracted registry stubs (0 chunks) — cited-ask can never cite
**Evidence:** `documents` table: 112 rows, all `extraction_state=''`, `chunk_content_hash=''`, `title=''`. Indexer log: page-content pipeline fails at `engine ResolveBody` (connection refused, see DEFECT-ENG-1) and several event types (`workspace.created`, `space.member_added`, …) log `pipeline not implemented (scaffold)`. Effect: `GET /api/ai/ask` always returns `unanswered` regardless of token/tenant. (Consistent with the documented M5 fake-done/RED history.)

### DEFECT-AI-1 — suspected owner: **orvex-studio-ai**
**Title:** `GET /api/ai/ask` returns `500 INTERNAL` for an authenticated token with no `workspace` claim (empty principal → billing 404 masked)
**Evidence:** aud-only Clerk JWT → `{"code":"INTERNAL"} 500`; log `ask discovery turn failed: clients: read-entitlement status 404: 404 page not found`. Billing is healthy (well-formed principal → free-tier 200); the empty principal produces a malformed entitlements path that 404s and is mapped to an opaque 500. Expectation: reject a workspace-less token cleanly (400/403), or degrade to free-tier — never 500.

### DEFECT-AI-2 — suspected owner: **orvex-studio-ai**
**Title:** `POST /api/ai/inline` maps a permission DENIAL (`can-edit 404`) to `HTTP 500 UPSTREAM_ERROR`
**Evidence:** editing a page outside the caller's tenant returns `{"code":"UPSTREAM_ERROR","detail":"permission check: clients: can-edit status 404"} 500`. A can-edit 403/404 is an authorization outcome, not an upstream fault; surfacing it as 500 mis-signals a server error and defeats a clean fail-closed UX. (Distinct from the transient `can-edit 502`, which is DEFECT-ENG-1.)

---
_Artifacts: mint scripts + captured tokens/outputs under the session scratchpad. No production/real-user tenant was mutated; the disposable Clerk user was used read-only for ask and denied-closed for inline._
