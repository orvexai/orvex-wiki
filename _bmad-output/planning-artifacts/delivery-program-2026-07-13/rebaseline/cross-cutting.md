# Six-surface re-baseline — Surface: CROSS-CUTTING (ENG-2033)

**Date:** 2026-07-13 · **Verifier:** cross-cutting subagent (adversarial, evidence-only)
**Protocol:** migration-assessment.md §4 (Cross-cutting seams)
**Absolute-honesty:** every verdict below is backed by a command + its actual output that I personally ran against the standing dev cell. No pass is extrapolated from code, CI, or Linear.

## OVERALL VERDICT: **FAIL**

| Seam | Verdict | One-liner |
|---|---|---|
| (1) identity exchange-token → engine session mint, fail-closed | **PASS** (with lineage caveat) | Live exchange endpoint rejects forged/none/HS256/expired tokens with no session cookie; real Clerk JWT mints a session. |
| (2) quota → 402 QUOTA_EXCEEDED frozen contract (REST + collab) | **BLOCKED** | Quota chokepoint is NOT wired on any running engine (`ORVEX_MODULES_ENABLED` unset cluster-wide; no billing URL). Page-create is unbounded; the 402 contract is un-exercisable. |
| (3) single-host ingress hides the split | **FAIL** | No single client-visible host fans out `/api/ai/*`→ai and `/mcp`→mcp. Those paths are served by the monolith engine; satellites live on separate subdomains. `verbs`→wiki-api works, but on a *different* host. |

---

## 1. Environment facts established

- **kubectl context:** `kubernetes-admin@eu-central-1` (cluster `eu-central-1`).
- **Client-visible wiki host / engine:** `https://dev-docmost.eu-central-1.myidp.cloud` → Deployment `docmost` in namespace **`docmost-dev`** (pod `docmost-78f975dffb-cn9lz`, image `repos.eu-central-1.myidp.cloud/docmost/docmost-dev:dev`). `GET /api/health` → 200 `{"status":"ok","database":"up","redis":"up"}`.
- **Engine lineage:** this is the **CLERK-tenancy Docmost fork**, *not* the thin-AGPL-engine + orvex-modules build. Pod env has `CLERK_TENANCY=true`, `CLERK_SECRET_KEY=sk_test_…`, and **no** `ORVEX_MODULES_ENABLED`, **no** `ORVEX_BILLING_API_URL`, **no** `ORVEX_IDENTITY_URL`, **no** `KAFKA_*`.
- **Cluster-wide check:** `ORVEX_MODULES_ENABLED` is **unset on every running docmost pod** (`docmost`, `docmost-dev`, `orvex-studio-poc-wiki`, `orvex-studio-poc-wiki-dev`). The orvex seam modules are OFF everywhere.
- **Dev-cell front / satellites (each on its own subdomain):**
  - `wiki-api.orvex.dev` → `orvex-wiki-api` (ns `orvex-wiki-api-dev`), Go verb-grammar front; `/healthz` `upstream_configured:true`, ENGINE upstream = dev-docmost.
  - `api.studio.orvex.dev` → `orvex-studio-api` (ns `orvex-studio-api-dev`), studio BFF (`/healthz` `service":"orvex-studio-api"`).
  - `ai.orvex.dev` → orvex-studio-ai · `mcp.orvex.dev` → orvex-studio-mcp · `events.orvex.dev` → orvex-studio-knowledge · `auth.orvex.dev` → orvex-studio-identity · `billing.orvex.dev` → orvex-studio-billing.
- **Disposable tenant used (seam 1 positive + seam 2):** JIT-provisioned via a fresh Clerk `+clerk_test@example.com` user → engine workspace `019f5b5b-6d77-75a2-87b7-ef5fb9590546`, space "General" `019f5b5b-6d80-73fc-a800-18c6422440ca`, user `019f5b5b-6d73-7f60-82f3-8641438458c5`. **Clerk test user deleted after the run** (verified: lookup-by-email returns empty).

---

## 2. Seam-by-seam evidence

### SEAM 1 — identity exchange-token → engine session mint, FAIL-CLOSED — **PASS**

The new microservices seam controller `OrvexSessionExchangeController` (`POST /api/orvex/session/exchange`, backed by `ExchangeTokenVerifier`: RS256-only, iss+aud+exp+nbf enforced) is **NOT mounted** on the dev cell — modules are off:

```
$ curl -X POST https://dev-docmost…/api/orvex/session/exchange -d '{}'
{"statusCode":404,"error":"Not Found","message":"Route POST:/api/orvex/session/exchange not found…"}
```

The **live** exchange path is `POST /api/clerk/exchange` (Clerk-tenancy lineage; `ClerkController_exchange` in the running engine's `/api/version/orvex/api` descriptor). I forged four attack tokens with a locally-generated RSA key (PyJWT) and fired each; every one was rejected with **401 and NO `set-cookie`** (no session ever minted):

| Attack token (claims: sub, iss=`https://evil.example.com`, aud=`wrong-audience`) | Result | set-cookie |
|---|---|---|
| RS256 signed with attacker key (wrong key + wrong iss + wrong aud) | `401 {"message":"invalid_clerk_token"…}` | none |
| `alg:none` unsigned, perfect claims | `401 {"message":"invalid_clerk_token"…}` | none |
| HS256 key-confusion (`secret`) | `401 {"message":"invalid_clerk_token"…}` | none |
| RS256 expired (exp in past) | `401 {"message":"invalid_clerk_token"…}` | none |
| empty body `{}` | `401 {"message":"missing_clerk_token"…}` | none |

Positive control (proves it *can* mint, so the 401s are real rejections not blanket failures): a **real Clerk session JWT** minted via the Clerk Backend recipe (`POST /v1/sessions{user_id}` → `POST /v1/sessions/{id}/tokens`) exchanged cleanly:

```
$ curl -c cookies.txt -X POST https://dev-docmost…/api/clerk/exchange -d '{"token":"<real clerk jwt>"}'
{"data":{"success":true},"success":true,"status":200}   [HTTP 200]
# Set-Cookie: authToken=eyJhbGciOiJIUzI1NiI…  (HS256 Docmost session, sub=019f5b5b-…, workspaceId=019f5b5b-…)
$ curl -b cookies.txt -X POST https://dev-docmost…/api/users/me
{"data":{"user":{"id":"019f5b5b-…","email":"…+clerk_test@example.com","role":"owner","workspaceId":"019f5b5b-…"}}}  [200]
```

**Verdict: PASS** — the session-mint entry fail-closes on wrong key / wrong iss / wrong aud / alg:none / expired, and only a genuinely Clerk-signed token mints a session.
**Caveat (not a defect, a scope note):** the path exercised is the Clerk-tenancy `/api/clerk/exchange`, not the split-plan `orvex/session/exchange` seam module (absent because `ORVEX_MODULES_ENABLED` is off). The fail-closed *property* is proven on the live wire; the specific microservices seam module is undeployed.

### SEAM 2 — quota → 402 QUOTA_EXCEEDED frozen contract — **BLOCKED**

Frozen contract in engine source (`apps/server/src/orvex/entitlement/quota.exception.ts`): `402` body `{ error: 'QUOTA_EXCEEDED', resource, limit }`, thrown before any write. It is gated behind the `OrvexRootModule` register flag (`ORVEX_MODULES_ENABLED === 'true'`) + the `EntitlementModule`'s `ORVEX_BILLING_API_URL` port.

On the dev cell that gate is **off** and billing is **unwired**, so the chokepoint cannot fire:

```
# engine pod env — no modules flag, no billing URL:
$ kubectl exec -n docmost-dev docmost-… -- env | grep -Ei 'MODULE|BILLING|ENTITL'
CLERK_TENANCY=true
# (no ORVEX_MODULES_ENABLED, no ORVEX_BILLING_API_URL)

# native entitlements readout is hard-403'd, not a usage/caps readout:
$ curl -b cookies.txt -X POST https://dev-docmost…/api/workspace/entitlements
{"message":"workspace_settings_managed_by_studio","error":"Forbidden","statusCode":403}

# the F-QUOTA readout endpoint is absent (and is a 501 stub in source):
$ curl https://dev-docmost…/api/orvex/quota
{"statusCode":404,"error":"Not Found","message":"Route GET:/api/orvex/quota not found…"}

# page-create on the disposable tenant succeeds with NO quota check (unbounded write):
$ curl -b cookies.txt -X POST https://dev-docmost…/api/pages/create -d '{"spaceId":"019f5b5b-…","title":"xcut-rebaseline-probe"}'
{"data":{"id":"019f5b5b-dc7b-7408-…","title":"xcut-rebaseline-probe",…}}   [200]
```

Lowering a cap on the disposable tenant in `orvex-studio-billing` would have **no effect** because the running engine never calls billing. The **collab path** was therefore also not separately exercisable for quota (same unwired chokepoint; moot).

**Verdict: BLOCKED** — the 402 QUOTA_EXCEEDED frozen contract could not be exercised on the dev cell because quota enforcement is not wired into any running engine. This is the exact acceptance behavior the surface is supposed to prove, and it is un-demonstrable today.

### SEAM 3 — single-host ingress hides the split — **FAIL**

Claim under test: one client-visible host with `/api/ai/*`→ai, `/mcp`→mcp, verbs→wiki-api, `/api/`→engine, zero client-URL change.

**`verbs → wiki-api`: present** (on `wiki-api.orvex.dev`):
```
$ curl -X POST https://wiki-api.orvex.dev/v1/whoami -d '{}'
{"code":"UNSUPPORTED_RESOURCE_TYPE","message":"verbs: unsupported resource_type (wiki-only grammar, D-S11)"}  [400]
$ curl https://wiki-api.orvex.dev/api/health
{"status":"ok",…database…redis…}  [200]   # /api/* reverse-proxied to the engine
```

**`/api/ai/*` → ai: ABSENT** — served by the monolith engine, not the ai satellite. Fingerprints differ (engine = NestJS `{"statusCode":…}`; real ai = Go `{"cell":…,"nfrBudgets":…}`):
```
$ curl https://dev-docmost…/api/ai/health        → {"message":"Unauthorized","statusCode":401}   [401]  (engine)
$ curl https://wiki-api.orvex.dev/api/ai/health  → {"message":"Workspace not found",…"statusCode":404}  (engine, via proxy)
$ curl https://ai.orvex.dev/healthz              → 200  {"cell":…,"nfrBudgets":…}  (the ACTUAL ai satellite, separate host)
```

**`/mcp` → mcp: ABSENT** — served by the monolith engine, not the mcp satellite (distinct error strings):
```
$ curl https://dev-docmost…/mcp   → {"message":"No auth token","error":"Unauthorized","statusCode":401}   (engine)
$ curl https://mcp.orvex.dev/mcp  → {"error":"Unauthorized","message":"Missing Authorization: Bearer token"}   (the ACTUAL mcp satellite, separate host)
```

So there is **no single host that hides the split**. The client-visible wiki host (`dev-docmost…`) is the monolithic Clerk-tenancy engine and answers `/api/ai` and `/mcp` itself; the satellites are only reachable on their own separate subdomains (`ai.orvex.dev`, `mcp.orvex.dev`, `wiki-api.orvex.dev`, …). The wiki-api front proxies `/api/*` wholesale to the engine (including `/api/ai`) rather than path-splitting to the ai/mcp satellites.

**Verdict: FAIL** — the public wire does NOT hide the split on the dev cell. `/api/ai/*`→ai and `/mcp`→mcp fan-out is not realized; the split is exposed across multiple subdomains and served partly by the monolith.

---

## 3. DEFECTS (ready-to-file ticket stubs)

### DEFECT-1 — Quota 402 QUOTA_EXCEEDED not enforced on the dev cell (chokepoint unwired)
- **Title:** [rebaseline] Quota chokepoint inert on dev cell — `ORVEX_MODULES_ENABLED` off + billing unwired ⇒ unbounded writes, 402 contract un-exercisable
- **Evidence:** `ORVEX_MODULES_ENABLED` unset on every running docmost pod cluster-wide; docmost-dev pod env has no `ORVEX_BILLING_API_URL`; `POST /api/pages/create` on a fresh tenant succeeds with no quota check; `GET /api/orvex/quota` → 404 (source is a 501 stub); `POST /api/workspace/entitlements` → 403 `workspace_settings_managed_by_studio`. The frozen `{error:'QUOTA_EXCEEDED',resource,limit}`@402 (`quota.exception.ts`) can never fire.
- **Suspected owner:** engine (orvex-wiki-api / `apps/server` deploy overlay — enable `ORVEX_MODULES_ENABLED` + wire `ORVEX_BILLING_API_URL` on the dev cell) with orvex-studio-billing (cap source).

### DEFECT-2 — Single-host ingress does not hide the split (`/api/ai`,`/mcp` served by monolith)
- **Title:** [rebaseline] Split is exposed, not hidden — client host serves `/api/ai` & `/mcp` from the monolith engine; satellites only on separate subdomains
- **Evidence:** `dev-docmost…/api/ai/health` and `/mcp` return NestJS-engine 401s (not the Go ai/mcp satellites, whose fingerprints differ); `wiki-api.orvex.dev` proxies `/api/*` (incl. `/api/ai`) wholesale to the engine and 404s `/mcp`; satellites reachable only at `ai.orvex.dev` / `mcp.orvex.dev`. No single host does `/api/ai`→ai + `/mcp`→mcp + verbs→wiki-api. (verbs→wiki-api DOES work, but on its own host.)
- **Suspected owner:** ingress/gateway + orvex-wiki-api (single-host router) — path-fan-out for `/api/ai/*`→ai and `/mcp`→mcp is not configured on the client-visible host.

### DEFECT-3 (observation) — Dev cell engine is the Clerk-tenancy fork, not the thin-AGPL + orvex-modules build
- **Title:** [rebaseline] "standing dev cell" engine runs the CLERK_TENANCY monolith (modules off); `orvex/session/exchange` seam module is undeployed (404)
- **Evidence:** docmost-dev image `docmost-dev:dev` with `CLERK_TENANCY=true`, `ORVEX_MODULES_ENABLED` unset; `/api/orvex/session/exchange` → 404 while `/api/clerk/exchange` is live. The microservices session-mint / quota / ingress-fan-out seams cannot be exercised as designed because the modules build is not the deployed engine on any dev pod.
- **Suspected owner:** platform/deploy (which engine image + flags the dev cell should run) — blocks a faithful re-baseline of all three seams as specified.

---

## 4. Reproduction assets
Scratchpad (this session): forged tokens `tok_{RS256_FORGED,ALG_NONE,HS256_CONFUSION,RS256_EXPIRED}.txt`, engine session `cookies.txt`, live orvex descriptor `orvex-api.json`. Clerk secret used is the dev instance's `sk_test_…` from the docmost-dev pod env. Disposable Clerk user deleted post-run.
