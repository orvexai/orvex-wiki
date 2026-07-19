# Six-Surface Re-baseline — Surface: **mcp** (ENG-2033)

**Verifier:** rebaseline subagent (adversarial, evidence-only) · **Date:** 2026-07-13 (~12:07 UTC)
**Protocol source:** `_bmad-output/.../evidence/migration-assessment.md` §4 (mcp bullet)
**Overall verdict: PASS (mandated mission) — with 3 recorded DEFECTS (2 real code, 1 environment).**

The mandated mission — *initialize a session with a real token, list tools, execute a REAL page mutation via a tool, read it back, record tool count vs 73* — was **personally exercised and passed** end-to-end with a real org-keyed identity token and real data. Two *modify-existing* write paths (`save_page update`, `edit`) are **reproducibly broken (502)** on a healthy backend, and the underlying engine deployment is **churning/hanging continuously** — both recorded as defects below. None of this is extrapolated: every verdict has a captured command + output.

---

## 1. Environment facts established

| Fact | Value (established by inspection) |
|---|---|
| Kube context | `kubernetes-admin@eu-central-1` |
| MCP gateway | ns `orvex-studio-mcp-dev`, `svc/orvex-studio-mcp` :8787, pod `orvex-studio-mcp-57689bfcdd-c7p6v` (1/1). Path `POST /mcp` (Streamable-HTTP), health `GET /healthz`. |
| Access | `kubectl port-forward svc/orvex-studio-mcp 18787:8787` → `http://localhost:18787` |
| Auth model | Gateway is **resolve-only**: verifies an identity-minted bearer via identity `POST /v1/introspect`, forwards it byte-identical downstream. It never mints. (`src/transport/http.ts`, `src/index.ts`) |
| Identity | `https://auth.orvex.dev` (ns `orvex-studio-identity-dev`). Token minted via the M9 recipe `scripts/mint-e2e-token.mjs` (Clerk session → `/v1/exchange`). |
| Tenant used (disposable test fixture, **not** a real user) | Clerk org `org_3GRoWZjTJsMm9NHCaQ7CsFRRfdW` ("M9 Gate Primary" e2e org) → engine workspace/tenant `da607f24-72d3-41d7-acd8-65f09787c06d`, space **General** `019f5b57-1ef5-7a25-8a81-61c91aceafec`. Persona `e2e-primary+clerk_test@orvex.dev`. |
| Token scope obtained | `["ai:invoke","search:read","wiki:read","wiki:write"]` — write-capable. |
| Downstream seams (from gateway configmap) | `WIKI_API_BASE_URL=orvex-wiki-api.orvex-wiki-api-dev:80`, `ORVEX_IDENTITY_URL=auth.orvex.dev`, `AI_BASE_URL=ai.orvex.dev`; engine at `orvex-wiki.orvex-wiki-dev:3000`. |
| Secrets source | OpenBao `apps/orvex-studio-mcp-dev/e2e` (clerk-secret-key, primary-email) + k8s secret `orvex-studio-identity-clerk-credentials`. |

**Pre-work required to unblock:** the identity `/v1/exchange` mint initially failed `500 principal_provision_failed` because the engine (`orvex-wiki.orvex-wiki-dev:3000`) was **hung** (pod `0/1` NotReady, zero service endpoints, `/api/health` timing out — the documented "hung docmost pod" mode). Restarting the engine pod (`kubectl delete pod`) restored readiness and the mint succeeded. See DEFECT-3.

---

## 2. Checks — command, output, verdict

### Check A — Gateway reachable
```
$ curl -s http://localhost:18787/healthz
{"ok":true,"service":"orvex-studio-mcp","cell":"solo","cluster":"eu-central-1",
 "ts":"2026-07-13T11:55:45Z","revocationConsumer":{"running":true,"wired":false,"topic":"identity-events.dev"}}
```
**PASS** — gateway serving.

### Check B — Real token minted (M9 recipe, real Clerk + identity)
```
$ node scripts/mint-e2e-token.mjs   (CLERK_SECRET_KEY, primary-email, E2E_IDENTITY_BASE_URL=https://auth.orvex.dev)
mint-e2e-token: M9 primary org-keyed: org=org_3GRoWZjTJsMm9NHCaQ7CsFRRfdW user=user_3GRoWdbShtkWLNZLmcHlw5oo10a
mint-e2e-token: tenant org_3GRoWZjTJsMm9NHCaQ7CsFRRfdW -> cell eu1
mint-e2e-token: primary -> E2E_IDENTITY_TOKEN minted + exchanged (org-scoped cell token, TTL-bounded)
exit 0   (opaque exchange token, 36 chars)
```
**PASS** — real RS256/JWKS-verified Clerk session exchanged at live identity `/v1/exchange` for a cell bearer.

### Check C — `initialize` (Streamable-HTTP session)
```
POST /mcp {jsonrpc,initialize,protocolVersion:2025-06-18} + Authorization: Bearer <token>
→ HTTP 200, mcp-session-id: f4e71fb4-...
  result.protocolVersion=2025-06-18, serverInfo={orvex-studio-mcp,0.1.0},
  capabilities={resources,tools}, instructions=<Orvex Studio MCP v1 Phase 3 preamble>
```
**PASS** — session established, protocol negotiated, auth accepted.

### Check D — `tools/list` + tool count vs 73 target
tools/list is **paginated** (5/page). Followed `nextCursor` to exhaustion.
```
DEFAULT (3 pages) COUNT=11:
 ["ask","edit","get_changes","get_neighborhood","get_page","get_space_tree",
  "list_tools","related_pages","save_page","search","whoami"]
list_tools(category="studio") → reveals 8:
 [studio_marketplace_search, studio_skill_get, studio_memory_get, studio_memory_save,
  studio_library_list, studio_library_save, studio_librarian_session, studio_comment_post]
AFTER expand (4 pages) COUNT=19 (11 hero + 8 studio)
```
**PASS as executed** (list works, pagination works) — but **TOOL COUNT = 19 / 73 target (26%)**. See DEFECT-1.

### Check E — `whoami` (real backstage scope probe)
```
tools/call whoami → HTTP 200, isError=false:
 {"space_ids":["019f5b57-...General"],"asserted_access_level":"write","access_level_source":"token-scope",
  "asserted_can_edit":true,"token_scope":["ai:invoke","search:read","wiki:read","wiki:write"],
  "backstage_ok":true,"user":{"id":"019f5b57-...","name":"e2e-primary+clerk_test"},
  "spaces":[{"id":"019f5b57-...","name":"General"}],"tenant":"da607f24-...","org_or_realm":"org_3GRo..."}
```
**PASS** — real org-scoped principal, `backstage_ok:true`, write scope present, ACL-derived spaces returned live.

### Check F — REAL page mutation via a tool (`save_page` create) + read-back  ← **mandated core**
```
tools/call save_page {operation:create, spaceId:019f5b57-...General, title, content:<DfM w/ MARKER>}
→ HTTP 200, isError=false:
 {"persisted":true,"id":"019f5b59-02b3-7c62-859d-f18d6e867bed","slugId":"gkkzJEw1tc",
  "title":"mcp-rebaseline-1783943987830","url":".../doc/gkkzJEw1tc","version":1,
  "status":"canonical","updatedAt":"2026-07-13T11:59:47Z"}

tools/call get_page {locator:{id:019f5b59-...}, mode:full}
→ HTTP 200: content contains "MCP-REBASELINE-MARKER-1783943987830"  (format:"dfm", version:1)
MARKER PRESENT IN READBACK: true
```
**PASS** — real write persisted to the engine and read back byte-faithfully via a tool. **The mandated mission is satisfied.**

### Check G — Modify-existing writes (`save_page update` w/ CAS, and `edit`)
Retested against a **healthy** engine (endpoint present) with a **freshly minted** token — reproducible:
```
get_page(mode:full) → version:1  (valid ifVersion obtained)
tools/call save_page {operation:update, locator:{id}, ifVersion:1, content:<DfM>}
→ isError=true: {"error":"BACKSTAGE_ERROR","message":"Docmost 502 on /api/pages/update: [object Object]"}

tools/call edit {mode:string_patch, locator:{id}, old, new_text, ifVersion:1}
→ isError=true: {"error":"BACKSTAGE_ERROR","message":"Docmost 502 on /api/pages/<id>/blocks/patch-string: [object Object]"}
```
Engine log for the update request (same request, curl UA is the proxy):
```
{"level":"warn","url":"/api/pages/update","context":"Unknown node type: undefined",
 "msg":"Stripping unknown node types from document:"}
```
wiki-api logged **nothing** for these calls (no proxy-level error) → the 502 originates at the engine's DfM→ProseMirror path.
**FAIL** — both modify-existing write verbs 502 on a healthy backend while `create` succeeds. See DEFECT-2.

---

## 3. Overall verdict

**PASS on the mandated mission** (init + real token + tools/list + real mutation via `save_page create` + read-back + tool count recorded), **with 2 real code defects and 1 environment defect** that materially cap the surface:

- Read + create + capability probe all work end-to-end on a fresh org-keyed identity token with real data and enforced `wiki:write` scope.
- **Modify-existing writes (`save_page update`, `edit`) are broken (502).** A production agent can create pages but cannot reliably edit them via the MCP today.
- Tool parity is **19/73 (26%)** — the surface is a partial front-door, matching the migration-assessment "19→73, not there yet."
- The dev-cell engine is **operationally unstable** (continuous redeploy churn + hangs) and had to be restarted to make minting/writes work at all.

---

## 4. DEFECTS — ready-to-file ticket stubs

### DEFECT-2 (highest — real code) — MCP modify-existing writes 502 on healthy engine
- **Title:** `save_page operation:update` and `edit` return `502 BACKSTAGE_ERROR` on a healthy engine (create works, edit/update don't)
- **Evidence:** With a valid `wiki:write` token and correct `ifVersion:1`, both `POST /api/pages/update` and `POST /api/pages/{id}/blocks/patch-string` return 502; reproducible across two freshly-minted tokens and two distinct healthy engine pods. Engine logs `context:"Unknown node type: undefined" — "Stripping unknown node types from document"` on the update request. `save_page create` on the same page/space succeeds (persisted, read-back OK). wiki-api logged no proxy error → failure is engine-side in the DfM→ProseMirror conversion for the **update/block-patch** path (create path uses a different/working conversion).
- **Impact:** Agents can create but cannot edit existing pages via the MCP — a core hero-verb (`edit` is "the ONLY write verb for modifying existing pages") is non-functional.
- **Suspected owner:** `orvex-wiki` engine (docmost fork) — DfM/ProseMirror node coercion on `/api/pages/update` + `/blocks/patch-string`; secondary: `orvex-studio-mcp` DfM→PM serialization it hands the engine (the "undefined" node type may originate in the MCP's block conversion). Cross-check `orvex-wiki-api` block-patch translation.
- **Repro:** create a page via MCP `save_page create`; `get_page` for `version`; call `save_page update` (or `edit` string_patch) with that `ifVersion` → 502.

### DEFECT-3 (blocker-grade — environment) — orvex-wiki-dev engine unstable: continuous redeploy churn + hangs
- **Title:** `orvex-wiki-dev` engine deployment churns continuously (new ReplicaSet every few minutes) and intermittently hangs (`/api/health` timeout), bricking identity `/v1/exchange` and MCP writes
- **Evidence:** `kubectl get rs -n orvex-wiki-dev` shows ~11 ReplicaSets, a fresh one created and the prior scaled to 0 every few minutes (image `orvex-wiki:dev` re-pulled each roll — image-updater/ArgoCD churn). Independently, the engine was found `0/1` NotReady with **zero** service endpoints and `/api/health` `context deadline exceeded`; identity `/v1/exchange` then returned `500 principal_provision_failed` (`dial tcp orvex-wiki:3000 connect: connection refused`). A manual `kubectl delete pod` restored it; it cycled again mid-test (3 distinct engine pods observed within ~15 min).
- **Impact:** The single standing dev cell — the only place the microservices path runs — is not stably up; any surface exercising the engine (mint, write, collab) sees intermittent 5xx/hangs. Undermines every gate that "passes" against it.
- **Suspected owner:** platform/GitOps for `orvex-wiki-dev` (ArgoCD/image-updater rollout config) + `orvex-wiki` engine liveness/hang root-cause (event-loop block after ~13 min of serving; matches m9-gate-closed.md "hung docmost pod" note).

### DEFECT-1 (known gap — record only) — MCP tool parity 19/73
- **Title:** MCP gateway advertises 19 tools (11 hero + 8 studio) vs the 73-tool target
- **Evidence:** Exhaustive paginated `tools/list` = 11 default hero tools; `list_tools(studio)` reveals 8 more → 19 total. Target per re-baseline = 73 (26%).
- **Impact:** Front-door is partial; the repoint-to-REST tool expansion (19→73) is incomplete. Not a regression — expected in-flight state — but the surface cannot be called "done."
- **Suspected owner:** `orvex-studio-mcp` (tool-catalog expansion as engine verbs are repointed to REST clients).

---
*Artifacts:* driver scripts in scratchpad (`mcp-drive.mjs`, `mcp-cas.mjs`, `mcp-edit.mjs`). Test page created in the disposable M9 e2e org (`019f5b59-02b3-7c62-859d-f18d6e867bed`, space General) — not a real user tenant.
