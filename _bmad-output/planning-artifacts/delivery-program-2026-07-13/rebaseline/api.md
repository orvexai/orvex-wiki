# Surface re-baseline — **api** (orvex-wiki-api `/v1` verb grammar)

- **Program:** Orvex Studio six-surface acceptance re-baseline (Linear ENG-2033)
- **Protocol:** `_bmad-output/.../evidence/migration-assessment.md` §4 (api leg)
- **Date:** 2026-07-13 · **Verifier:** api subagent (honesty clause: every PASS below has captured command output; nothing extrapolated)
- **Overall verdict: PASS** — save / get / edit(block-patch + `ifVersion` CAS) / list all exercised end-to-end against a fresh disposable tenant, through the engine write chokepoint, with a real identity/api-key token. One transient BLOCKER (a hung engine pod) was hit at the start and self-cleared via a rollout; see §Observations.

---

## 1. Environment facts established

| Fact | Value |
|---|---|
| kube context | `kubernetes-admin@eu-central-1` (dev cell) |
| wiki-api namespace | `orvex-wiki-api-dev` |
| wiki-api service | `svc/orvex-wiki-api :80 → containerPort 8080` (pod `orvex-wiki-api-77d7799b66-jhjgh`, image `repos.eu-central-1.myidp.cloud/orvex-wiki-api/wikiapi:dev`) |
| wiki-api endpoint used | `kubectl port-forward svc/orvex-wiki-api :80` → `http://127.0.0.1:<local>` (no external ingress exists on the dev cell; ClusterIP only) |
| `ENGINE_URL` seam | `http://orvex-wiki.orvex-wiki-dev.svc.cluster.local:3000` (from configmap `orvex-wiki-api-config`) |
| `ENGINE_SESSION_EXCHANGE_ENABLED` | `true` (write/list paths exchange the caller token for an engine session; read paths — whoami/get — forward it verbatim) |
| `KNOWLEDGE_URL` seam | `http://orvex-studio-knowledge.orvex-studio-knowledge-dev.svc.cluster.local` |
| engine (AGPL chokepoint) | ns `orvex-wiki-dev`, `ORVEX_MODULES_ENABLED=true`, Kafka outbox wired (`wiki-events.eu-central-1`) |
| Disposable tenant (created for this run) | workspace `267a8ae1-ea10-4338-98d3-0bd2a5aa0139`, owner user `019f5b5c-390e-7c0c-91db-0fb8c653ce22`, default space "General" `019f5b5c-3911-7c87-80bb-f383d1230384` |
| Auth used | engine api-key JWT (HS256/APP_SECRET, `{sub,apiKeyId,workspaceId,type:"api_key",iss:"Docmost"}`) for the disposable tenant; verified accepted by the engine `JwtStrategy.validateApiKey` (row `api_keys.key_hash = sha256(jwt)`) |
| Test page created | id `019f5b5f-e376-7493-8fbe-4f083654c2c7`, slug `byHsmm3xHS` |

### How the disposable tenant was minted (per the fresh-tenant recipe, no real tenant touched)
`POST /internal/principals/provision` on the engine (guarded by `INTERNAL_API_BEARER_TOKEN`) with `provision_workspace:true` atomically materialises workspace + OWNER user + default-group membership + a default "General" space (commit `fc5a8caf`):

```
POST http://127.0.0.1:/internal/principals/provision   (Bearer <INTERNAL_API_BEARER_TOKEN>)
{"subject":"acc-api-verify-…","tenant":"267a8ae1-…","email":"api-verify-…@disposable.orvex.test",
 "name":"API Verify Bot","provision_workspace":true}
→ HTTP=200  {"user_id":"019f5b5c-390e-7c0c-91db-0fb8c653ce22","created":true,"workspace_created":true}
```

An api-key row was then inserted (`creator_id`=owner, `key_hash`=sha256 of the minted JWT, `read_only=false`, `scopes=null`) so the api-key JWT authenticates as the tenant owner. All engine secrets (APP_SECRET, DATABASE_URL, INTERNAL_API_BEARER_TOKEN) were read from the dev cell's own k8s secrets.

---

## 2. Checks (command → trimmed output → verdict)

Base `B=http://127.0.0.1:<pf>` (port-forward to `svc/orvex-wiki-api`), `AUTH="Authorization: Bearer <disposable-tenant api-key JWT>"`.

### C0 — whoami (auth + tenant resolution sanity) — PASS
```
GET $B/v1/whoami  -H "$AUTH"
→ HTTP=200
{"workspace_id":"267a8ae1-ea10-4338-98d3-0bd2a5aa0139",
 "workspace_name":"Workspace 267a8ae1",
 "default_space_id":"019f5b5c-3911-7c87-80bb-f383d1230384"}
```
The api-key JWT is accepted and resolves to the disposable tenant + its default space.

### C1 — SAVE a new page (`POST /v1/wiki`) — PASS
```
POST $B/v1/wiki  -H "$AUTH"
{"spaceId":"019f5b5c-3911-7c87-80bb-f383d1230384","title":"API Rebaseline Verify Page",
 "content":{"type":"doc","content":[{"type":"paragraph","attrs":{"id":"blk-verify-1"},
   "content":[{"type":"text","text":"ORIGINAL tracer alpha-7719"}]}]}}
→ HTTP=200
{"url":"/p/byHsmm3xHS","id":"019f5b5f-e376-7493-8fbe-4f083654c2c7",
 "version":"2026-07-13T12:07:18.622Z","persisted":true}
```
Receipt shape `{url,id,version,persisted:true}` ✔ (create-leg `version` = engine `updatedAt`).

### C2 — GET the page back (`GET /v1/wiki/{id}`) — PASS
```
GET $B/v1/wiki/019f5b5f-e376-7493-8fbe-4f083654c2c7  -H "$AUTH"
→ HTTP=200
{"content":"ORIGINAL tracer alpha-7719\n","id":"019f5b5f-…","space_id":"019f5b5c-3911-…",
 "title":"API Rebaseline Verify Page","url":"/p/byHsmm3xHS","version":"2026-07-13T12:07:18.622Z"}
```
The tracer content round-trips out of the engine ydoc. `GET /v1/wiki/{id}/outline` confirmed the block id `blk-verify-1` was preserved by the create chokepoint:
```
→ {"id":"019f5b5f-…","items":[{"block_id":"blk-verify-1","depth":0,"token_estimate":7,"type":"paragraph"}]}
```

### C3 — EDIT via block-patch with `ifVersion` CAS (`PATCH /v1/wiki/{id}/blocks`) — PASS
Section-edit body `{format:"json",blockId:"blk-verify-1",content:{…paragraph…}}`; `ifVersion` carried via the **`If-Match`** header (numeric ydoc version from `orvex_page_meta.version`).

| Step | If-Match | Result | Verdict |
|---|---|---|---|
| edit #1 (baseline) | *(none)* | `HTTP=200 {"id":"019f5b5f-…","version":"2","persisted":true}` | version now 2 |
| **edit #2 — FRESH** | `2` | `HTTP=200 {"id":"019f5b5f-…","version":"3","persisted":true}` | **fresh → receipt `{url,id,version,persisted:true}`** ✔ |
| **edit #3 — STALE** | `2` (server now 3) | `HTTP=409 {"code":"VERSION_MISMATCH","message":"blockpatch: version mismatch: clients: version mismatch (stale ifVersion)"}` | **stale → 409 VERSION_MISMATCH** ✔ |
| edit #4 — STALE | `1` | `HTTP=409 {"code":"VERSION_MISMATCH",…}` | 409 ✔ |

CAS holds in both directions; the fresh write advanced the version, the stale writes were rejected.

### C4 — LIST pages (`GET /v1/list/wiki?space_id=…`) — PASS
```
GET $B/v1/list/wiki?space_id=019f5b5c-3911-7c87-80bb-f383d1230384  -H "$AUTH"
→ HTTP=200
{"items":[{"has_children":false,"id":"019f5b5f-e376-7493-8fbe-4f083654c2c7",
  "parent_id":"","slug_id":"byHsmm3xHS","space_id":"019f5b5c-3911-…",
  "title":"API Rebaseline Verify Page"}]}
```

### C5 — Write actually landed through the engine chokepoint + no partial write — PASS
Three independent read-backs after the CAS sequence (last successful write = "EDITED beta-2 (fresh-cas)"; the two rejected stale edits must NOT be present):

```
A) wiki-api  GET /v1/wiki/{id}          → "content":"EDITED beta-2 (fresh-cas)\n"
B) engine    GET /internal/pages/{id}/export?tenant={ws}  (Bearer INTERNAL token, NOT via wiki-api)
             → {"text_repr":"# API Rebaseline Verify Page\n\nEDITED beta-2 (fresh-cas)"}
C) engine DB  select p.title, m.version from pages p left join orvex_page_meta m on m.page_id=p.id …
             → API Rebaseline Verify Page | version = 3
```
The write is present in the engine store via the engine's own internal read path (B, independent of the wiki-api verb layer), `orvex_page_meta.version=3` matches the last accepted CAS write, and the rejected stale edits left no residue. No partial write.

---

## 3. Overall verdict

**PASS.** The api surface — `save`, `get`, `edit` (block-patch + `ifVersion` CAS, both the 409-on-stale and the receipt-on-fresh legs), `list`, and confirmation that the write commits through the engine chokepoint — works end-to-end on the dev cell against a fresh disposable tenant with a real token. Every verdict above is backed by captured HTTP status + body.

---

## 4. Observations / risks (not surface failures — no ticket filed, but flag downstream)

1. **Engine-pod hung-readiness failure mode recurred (transient, self-cleared).** At the start of this run the engine pod `orvex-wiki-7668bd7b6d-csdsn` (0/1) had its app started and was materialising workspaces, but its readiness probe `GET /api/health` hung (8s timeout; `/api/health/live`=200 in 14ms). With the readiness probe failing the Service had **zero endpoints**, so every wiki-api verb returned `502 UPSTREAM_UNAVAILABLE … dial … connection refused`. This is exactly the documented "hung docmost pod bricks the surface" symptom (memory `m9-gate-closed.md`). It self-resolved when a **new** ReplicaSet (`orvex-wiki-54ddf466dd`) rolled out mid-run and came up 1/1 with a live endpoint. **Risk:** the deep-health hang is a real, recurring liveness gap (the previous pod had already been `rollout restart`ed 16m earlier and came back hung) — a `/api/health` that hangs instead of failing fast can strand the entire api surface behind an endpoint-less Service. Worth a separate reliability ticket against the engine, independent of this acceptance pass.

2. **`version` token type differs across verbs (by design, but an ergonomic seam).** `save`/`get` return `version` = engine `updatedAt` (ISO-8601 timestamp); `edit`/block-patch requires and returns `version` = the numeric `orvex_page_meta.version`. A caller cannot feed a `save` receipt's timestamp `version` straight into an `edit` `If-Match` — it must first `outline`/read to obtain the numeric ydoc version (the engine's `if-version.util` accepts both an integer and an ISO instant, but the wiki-api section-edit path forces numeric via `strconv.ParseInt`). Documented in code (pages table has no integer version column); calling it out so downstream clients don't assume a single opaque version token across the grammar.

---

## 5. DEFECTS (ready-to-file ticket stubs)

None blocking the api surface. One reliability stub for the engine health hang seen in transit (§Observations 1):

### DEFECT-api-obs-1 (reliability, engine — not an api-surface failure)
- **Title:** Engine `/api/health` deep-readiness probe hangs instead of failing fast → endpoint-less Service strands the whole `/v1` surface (502 UPSTREAM_UNAVAILABLE)
- **Evidence:** engine pod `orvex-wiki-7668bd7b6d-csdsn` in `orvex-wiki-dev`: `/api/health/live` = 200 in 0.014s, `/api/health` = timeout at 8s (`http=000`); pod 0/1, `Readiness probe failed: … context deadline exceeded` x21/3m; `svc/orvex-wiki` had 0 endpoints; wiki-api `/v1/whoami` returned `502 {"code":"UPSTREAM_UNAVAILABLE","message":"… dial … connection refused"}`. A prior `kubectl rollout restart` (16m earlier) had already produced the same hang; a fresh ReplicaSet rollout later cleared it.
- **Suspected owner service:** orvex-wiki engine (AGPL) — the `/api/health` readiness controller / its deep-dependency check; secondary: the app binds `Listening on http://127.0.0.1:3000` in logs (verify the readiness probe target vs bind address).
- **Repro:** observe `orvex-wiki-dev` engine pod readiness; `curl` pod-IP `:3000/api/health` with a short timeout.
