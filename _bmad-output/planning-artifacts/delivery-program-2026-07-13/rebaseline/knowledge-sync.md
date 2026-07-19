# Surface re-baseline — knowledge-sync (THE linchpin)

**Program:** Orvex Studio six-surface acceptance re-baseline (ENG-2033)
**Surface:** knowledge-sync (outbox → Kafka → knowledge index → searchable)
**Verifier:** rebaseline subagent · **Date:** 2026-07-13 · **Cell:** standing dev cell
**Overall verdict: FAIL** (core pipeline demonstrably flows end-to-end for a create, but multiple required behaviors are broken — see verdict + DEFECTS).

Honesty note: every command and its (trimmed) output below was actually executed against the live dev cell. Nothing here is inferred from code-reading or Linear/CI state alone, except where explicitly labeled "genuine CI history".

---

## 1. Environment facts established

| Fact | Value (verified) |
|---|---|
| kube context | `kubernetes-admin@eu-central-1` |
| Engine (modules-ON) | deploy `orvex-wiki` in ns `orvex-wiki-dev`, image `…/orvex-wiki:dev`, `ORVEX_MODULES_ENABLED=true` |
| Engine public URL | `https://wiki.eu1.orvex.dev` (HTTPRoute in orvex-wiki-dev) |
| Engine Kafka cfg | `KAFKA_BROKERS=platform-kafka-kafka-bootstrap.kafka…:9092`, `KAFKA_OUTBOX_TOPIC=wiki-events.eu-central-1`, `EVENT_TOPIC_SUFFIX=solo`, cell=`solo` |
| Outbox table | `orvex-wiki` pg (`postgres-orvex-wiki-postgres-1`), table `public.orvex_event_outbox` (818 rows at start, 812 relayed) |
| Kafka | ns `kafka`, cluster `platform-kafka`, topics incl. `wiki-events.eu-central-1` (+ `wiki-events-dlq.eu-central-1`) |
| Knowledge indexer | deploy `orvex-studio-knowledge-indexer` in ns `orvex-studio-knowledge-dev`, consumes topic `wiki-events.eu-central-1`, `CELL_ID=solo` |
| Knowledge metadata store | pg `orvex-studio-knowledge`, table `public.documents` |
| Vector store | Turbopuffer BYOC `https://api.turbopuffer.com`, namespace = tenant id (empty prefix) |
| NOTE — the *old* vanilla engine | deploy `docmost` in ns `docmost-dev` (`dev-docmost.eu-central-1.myidp.cloud`) — NO modules/outbox; the `DOCMOST_DEV_API_TOKEN` targets THIS, not the linchpin engine. Not used. |
| Tenant used | disposable m5-gate tenant `f799e55a-478a-4ca7-9b0e-6e1324b6c6a7` (users owner-a@m5-gate.test / scoped-a@m5-gate.test), space `019f5711-c9c5-7302-89fd-76972edacacb` (`m5-gate-space-a`). No real user tenant mutated. |
| Auth used to drive a mutation | a throwaway engine API-key JWT (HS256/APP_SECRET) minted for the disposable tenant's owner + matching `api_keys` row; **deleted after the run**. |

Recovery action taken: the engine pod was 0/1 not-ready on arrival (`/api` wedged, empty Service endpoints). Performed `kubectl rollout restart deploy/orvex-wiki` — a standard, sanctioned recovery (m9-gate memory), on dev infra, not a user tenant.

---

## 2. Checks

### Check A — Transactional outbox is real and populated
```
psql orvex-wiki -c "\d orvex_event_outbox"   # id uuid, type, aggregate_id, workspace_id, payload jsonb,
                                              # created_at, relayed_at, traceparent, correlation_id
psql -c "select count(*) total, count(*) filter (where relayed_at is null) unrelayed from orvex_event_outbox"
 total | unrelayed
   818 |         6
```
Type distribution: page.created 182, page.content_updated 135, space.member_added 233, workspace.* etc.
**Verdict: PASS** — a genuine transactional outbox with per-event traceparent, mostly relayed.

### Check B — Engine `/api` router wedges → Service loses endpoints (on arrival)
```
# pod orvex-wiki-7668bd7b6d-csdsn: 0/1 for ~14min; process alive + emitting Kafka, but:
node http GET 127.0.0.1:3000/api/health   -> TIMEOUT ms 20023 / socket hang up
curl -m6  127.0.0.1:3000/api/health       -> http=000 time=6.00s
curl -m6  127.0.0.1:3000/api/             -> http=000 time=6.00s
curl -m6  127.0.0.1:3000/                 -> http=200 time=0.014s   (static bundle OK; whole /api hung)
kubectl get endpoints orvex-wiki -n orvex-wiki-dev   ->  ENDPOINTS <none>   (empty!)
```
**Verdict: FAIL** — the entire NestJS `/api` router hangs while static assets serve; readiness probe `/api/health` times out → 0/1 → Service has **zero** endpoints. See DEFECT-1.

### Check C — Indexer consumes Kafka but page-body resolve fails when engine not-ready
```
kubectl logs deploy/orvex-studio-knowledge-indexer …
… type="wiki.page.created": workflow: ingest resolve body for 019f5b53-2e1d…:
   engine ResolveBody: Get "http://orvex-wiki.orvex-wiki-dev.svc.cluster.local:3000/internal/pages/…/export?tenant=…":
   dial tcp 10.96.203.225:3000: connect: connection refused
```
The indexer receives the event from Kafka fine; its callback to the engine `/internal/pages/{id}/export` is refused because the engine Service has no ready endpoint (Check B). Non-page events log `pipeline not implemented (scaffold)` (expected scaffold).
**Verdict: FAIL (while engine not-ready)** — page content is NOT indexed during engine-wedge/rollout windows. See DEFECT-1.

### Check D — LINCHPIN end-to-end trace (engine healthy after restart)
Drove a real page create via the engine's write chokepoint (`POST /api/pages/create`, bearer = minted API-key JWT), unique needle `ZEBRALINCHPIN1783944180`:
```
POST https://wiki.eu1.orvex.dev/api/pages/create  -> HTTP 200
  page id = 019f5b5b-f539-745e-9770-b013c7442597, title "Rebaseline probe ZEBRALINCHPIN1783944180"
```
Full message trace (outbox row id → Kafka offset → index doc → vector):
```
1) OUTBOX  (pg orvex_event_outbox, aggregate_id=019f5b5b-f539…):
     id=019f5b5b-f53a…  type=page.created        created 12:03:01.026  relayed=t
     id=019f5b5b-f541…  type=page.status_changed created 12:03:01.026  relayed=t
2) KAFKA   (topic wiki-events.eu-central-1):
     Partition:0  Offset:863
     {"id":"019f5b5b-f53a-7d54-81cd-b361ae6d98e3","type":"wiki.page.created",
      "subject":"019f5b5b-f539-745e-9770-b013c7442597","orvexcell":"solo",
      "orvextenant":"f799e55a-478a-4ca7-9b0e-6e1324b6c6a7",
      "traceparent":"00-3c01152502cb994be448c7b5150455e7-359ef8ee9b18ca4d-01", …}
3) KNOWLEDGE INDEX (pg documents):
     id=019f5b5b-f539…  tenant=f799e55a…  source_type=wiki-page  status=published
     content_hash=7e70bfa6…  (body resolved)
4) VECTOR STORE (Turbopuffer ns f799e55a…):
     row id=019f5b5b-f539…  vector=[1024]f32 (populated)
     text="# Rebaseline probe ZEBRALINCHPIN1783944180"   <-- the needle, embedded
     namespace updated_at = 2026-07-13T12:03:34.681Z
```
**Measured end-to-end latency:** outbox commit `12:03:01.026Z` → Turbopuffer upsert visible `12:03:34.681Z` ≈ **33.6 s** (dominated by relay + consume + engine ResolveBody + LiteLLM embedding). NFR-K12 (50 ms) applies only to the final TP upsert-visibility hop, not this whole path, so it is not the right SLA comparator.
**Verdict: PASS (for the create path, engine healthy)** — the pipeline genuinely flows mutation → outbox → Kafka → index → vector-searchable, with a coherent message trace.

### Check E — Keyword / BM25 leg of "hybrid" search is broken
```
POST turbopuffer …/query {"rank_by":["text","BM25","ZEBRALINCHPIN"],…}
  -> {"error":"full text search not enabled for attribute 'text'. needs to be specified in the schema","status":"error"} HTTP 400
namespace schema: text -> {"type":"string","filterable":true}   (NO full-text index; only vector ANN)
```
The doc IS retrievable by id-filter and by vector (ANN), but the keyword/BM25 leg the surface advertises as "hybrid keyword+vector" cannot run — `text` is not FTS-enabled in the namespace schema.
**Verdict: FAIL** — hybrid search is vector-only in practice. See DEFECT-4.

### Check F — content_updated write path hangs (could not drive the mission's named event)
```
POST /api/pages/update {operation:replace, format:markdown} -> 400 LOSSY_WRITE_FORMAT_REJECTED (expected guard)
POST /api/pages/update {operation:replace, format:json, content:<PM object>} (engine 1/1 Ready, reads=110ms)
  -> HTTP 000 t=30.002  (hangs full timeout; engine logs show NOTHING for the request)
# a sibling read at the same instant succeeded: POST /api/spaces/info -> HTTP 200 time=0.110s
```
So `wiki.page.content_updated` (the mission's target single-event) could not be produced through the write surface — the apply-ops content-replace chokepoint hangs indefinitely while reads and page.create work.
**Verdict: FAIL** — the primary content-mutation write path is non-functional. See DEFECT-3.

### Check G — Failed events do NOT self-heal after engine recovers
```
# 019f5b53-2e1d… failed ResolveBody at 11:57 (connection refused). Engine healthy since ~11:58.
psql documents -c "select … where id='019f5b53-2e1d-72fa-a15f-9f6d587747e9'"  -> (0 rows)
```
**Verdict: FAIL** — an event that failed during an engine-not-ready window was never re-indexed; it is silently absent from the index (no observed redelivery/DLQ recovery). See DEFECT-2.

### Check H — TestM5KnowledgeE2E (the closing gate) genuine result
```
git cat-file -e origin/main:tests/e2e/m5_knowledge_e2e_test.go  -> ABSENT on main
git ls-tree -r origin/main -- tests/e2e/                        -> (empty: no e2e dir on main)
git rev-list --count origin/main..origin/dev                    -> 73   (dev is 73 commits ahead)
```
The test exists ONLY on branch `dev`; **merged main has zero M5 knowledge-sync E2E coverage** — so "run it on merged main" is impossible.

Genuine CI history (workflow `m5-knowledge-e2e.yml`, branch dev): **12 of 12 recent runs = failure** (one cancelled). Latest run `29239761497` (2026-07-13 09:36 UTC):
```
m5_knowledge_e2e_test.go:150: [M5-GATE-RED reason=decode] step query (m5-e2e-query-):
    decode response: unexpected end of JSON input
--- FAIL: TestM5KnowledgeE2E (5.86s)
```
Genuine local run (this session, dev checkout, no ESO secrets):
```
go test -run '^TestM5KnowledgeE2E$' ./tests/e2e
  M5 gate config incomplete — 7 required env key(s) absent (CLERK_SECRET_KEY, ENGINE_INTERNAL_AUTH, …)
  --- FAIL: TestM5KnowledgeE2E (0.00s)   (FAIL-never-SKIP guard; real backbone not exercised locally)
```
**Verdict: FAIL** — the closing gate has never gone green, is red at the search-query step in CI, and does not exist on the shipped (main) branch.

---

## 3. Overall verdict — FAIL

The linchpin pipeline **can** carry a mutation end-to-end to a vector-searchable document — I drove one create and captured a full outbox→Kafka(offset 863)→documents→Turbopuffer trace with the needle embedded (Check D), ~33.6 s. That is real, and better than the "essentially zero" prior assessment implied.

But the surface is **not acceptance-passable**:
- The engine's `/api` router wedges / the deployment rolls every ~10 min, and during those windows the engine Service has no ready endpoint, so the indexer's body-resolve is refused and pages silently fail to index (Checks B, C).
- Events that fail in those windows are **not recovered** — one is permanently missing from the index (Check G).
- The **content_updated write path hangs** — the mission's own named event cannot be produced through the write surface (Check F).
- The advertised **hybrid keyword search is non-functional** (BM25/FTS not enabled); only vector search works (Check E).
- The **closing E2E gate is red in every CI run and absent from main** (Check H).

Not "blocked": I exercised the pipeline and observed these failures directly.

---

## 4. DEFECTS — ready-to-file ticket stubs

### DEFECT-1 — Engine `/api` router wedges → knowledge-sync stalls (connection refused)
- **Title:** orvex-wiki engine `/api` router hangs (readiness `/api/health` times out) → empty Service endpoints → indexer ResolveBody `connection refused`
- **Evidence:** pod `orvex-wiki-7668bd7b6d-csdsn` 0/1 for ~14 min; `curl 127.0.0.1:3000/api/health` http=000/6s while `/` returns 200; `endpoints orvex-wiki` empty; indexer logs `dial tcp …:3000: connect: connection refused` for `wiki.page.created` (11:57 batch). Recovered only by `rollout restart`.
- **Suspected owner:** orvex-wiki (engine) — NestJS `/api` bootstrap / event-loop block; and deploy/GitOps causing ~10-min re-rolls.

### DEFECT-2 — Index-ingest failures are not recovered (no redelivery/DLQ heal)
- **Title:** knowledge indexer drops page events that fail body-resolve; no self-heal after engine recovers
- **Evidence:** event `019f5b53-2e1d…` failed ResolveBody at 11:57; engine healthy from ~11:58; `documents` still has 0 rows for it 15+ min later. `wiki-events-dlq.eu-central-1` topic exists but the doc never became indexed.
- **Suspected owner:** orvex-studio-knowledge (indexer) — offset-commit / retry semantics on ResolveBody error (`cmd/indexer/main.go` Subscribe handler).

### DEFECT-3 — content_updated write path (apply-ops replace) hangs indefinitely
- **Title:** `POST /api/pages/update {operation:replace,format:json}` hangs (HTTP 000, 30 s) with no engine log while reads/creates succeed
- **Evidence:** valid PM-JSON body hung full 30 s twice; concurrent `POST /api/spaces/info` returned 200 in 110 ms; engine logs show nothing for the update. Blocks emission of `wiki.page.content_updated`.
- **Suspected owner:** orvex-wiki (engine) — `orvex/page-blocks/apply-ops` content-replace chokepoint.

### DEFECT-4 — Hybrid search keyword/BM25 leg disabled in Turbopuffer schema
- **Title:** Turbopuffer namespace `text` attribute is not full-text-indexed → BM25/keyword search returns 400; "hybrid" search is vector-only
- **Evidence:** `rank_by:["text","BM25",…]` → `{"error":"full text search not enabled for attribute 'text'…"}`; namespace schema `text:{type:string,filterable:true}` (no FTS).
- **Suspected owner:** orvex-studio-knowledge — Turbopuffer namespace schema / upsert config.

### DEFECT-5 — M5 closing gate red and absent from main
- **Title:** TestM5KnowledgeE2E has never passed (12/12 CI failures, latest RED at query-decode) and does not exist on `main`
- **Evidence:** `origin/main` has no `tests/e2e/`; dev is 73 commits ahead; CI run `29239761497` RED `[M5-GATE-RED reason=decode] unexpected end of JSON input`. Prior fake-done history (po-decisions/fake-done-forensics.md).
- **Suspected owner:** orvex-studio-knowledge — gate green-path (query step) + the in-cluster dispatch/DNS residue documented in the workflow; and a merge-to-main coverage gap.

---

## 5. Trace artifacts (for reproduction)
- Needle: `ZEBRALINCHPIN1783944180` · Page: `019f5b5b-f539-745e-9770-b013c7442597` · Tenant: `f799e55a-478a-4ca7-9b0e-6e1324b6c6a7`
- Outbox event id / Kafka msg id: `019f5b5b-f53a-7d54-81cd-b361ae6d98e3` · Kafka partition/offset: `0 / 863`
- Turbopuffer namespace `updated_at`: `2026-07-13T12:03:34.681Z`
- The probe page + its Turbopuffer/documents rows remain in the disposable m5-gate tenant as evidence; the minted API key was deleted.
