I now have a complete picture across all 6 areas. Here are my findings.

---

# Engine-side scale audit: agent→wiki write path (`/home/daniel/repos/docmost`)

Repo is a NestJS + Kysely + Hocuspocus/Yjs + TipTap fork. **Bottom line: there is NO atomic multi-page write primitive; 100 docs = 100 independent REST calls, and each content update writes a full-content `page_history` snapshot into an unbounded, never-pruned table while fanning out ~5–7 async jobs. The DB content write itself is debounced 10–45s through Hocuspocus.**

## 1. PAGE WRITE PATH (single REST content update)

REST entry: `POST /api/pages/update` → `page.controller.ts:639-801`. One call does, in order:
1. `pageRepo.findById(pageId)` — load page (no content) `page.controller.ts:647`.
2. `pageAccessService.validateCanEdit` `page.controller.ts:653`.
3. Actor/provenance resolution (`resolveActor`, `markAiAuthored`) `page.controller.ts:761-767`.
4. `pageService.update(page, dto, user, actor, contentOpts, idempotencyKey)` `page.controller.ts:773`.
5. If API-key write: `stampApiProvenance` (extra write) `page.controller.ts:783-785`.

Inside `pageService.update` (`page.service.ts:556-880`):
- **Metadata write** (title/icon/lastUpdatedById/contributorIds, `version+1`) via `pageRepo.updatePage(...)` — synchronous Kysely UPDATE `page.service.ts:656/666/675/685`. CAS variant `updatePageCas` when integer `ifVersion` supplied `page.service.ts:597-631`, repo at `page.repo.ts:258-287`.
- **Idempotency claim** (Redis SET-NX-EX) `page.service.ts:699-719`.
- **Synchronous pre-image history snapshot** `page.service.ts:770-782` (see §2).
- **Content write** via `updatePageContent(...)` `page.service.ts:796` → routes through the Yjs gateway (see §3), NOT a direct column write.

`pageRepo.updatePage` → `updatePages` `page.repo.ts:200-241`: single `UPDATE pages SET ... [version=version+1], updatedAt=now WHERE id IN (...)`, then emits in-process `EventName.PAGE_UPDATED` `page.repo.ts:235-238`.

## 2. PAGE HISTORY MECHANICS — the key question

**Two independent history-writing paths, and the REST/agent path is per-save and NOT diff-gated:**

**(a) REST path — synchronous, per content update, non-diff-gated** — `page.service.ts:770-782`:
```
if (writeContent && updatePageDto.operation && this.pageHistoryRepo) {
  const pageForHistory = await this.pageRepo.findById(page.id, { includeContent: true });
  if (pageForHistory && pageForHistory.content && !isEmptyParagraphDoc(pageForHistory.content)) {
    await this.pageHistoryRepo.saveHistory(pageForHistory, { contributorIds: [user.id] });
```
Trigger condition: content present + an `operation` (append/prepend/replace) + prior content non-empty. It snapshots the **pre-image unconditionally** — there is **no comparison to prior history or to the new content**. So **100 REST content updates ⇒ 100 `page_history` rows** (each a full copy of `content`, `title`, `icon`, `coverPhoto`). `saveHistory` → `insertPageHistory` INSERT at `page-history.repo.ts:53-84`. (Gated on optional `pageHistoryRepo` injection; present in this build per `page.controller.ts:117` comment.)

**(b) Yjs/collab path — debounced + diff-gated** — `persistence.extension.ts:283` `enqueuePageHistory` → BullMQ `PAGE_HISTORY` job with `jobId = page.id` and `delay` = 5 min (`HISTORY_INTERVAL`) or 1 min for pages < 5 min old (`persistence.extension.ts:313-325`, constants `constants.ts:1-3`). `jobId=pageId` de-dupes rapid edits into one job. Processor `history.processor.ts:46-154` is diff-gated: writes only if `!lastHistory || !isDeepStrictEqual(lastHistory.content, page.content)` `history.processor.ts:75-78`.

**Net for the 100-doc scenario:** the REST agent path alone writes ≥100 full-content history rows synchronously in-request; the debounced Yjs path adds up to ~100 more (diff-gated) as each ydoc flushes. Up to ~200 history rows for 100 single-doc updates.

**Retention/cleanup: NONE.** Grep for any `deleteFrom('pageHistory')` / prune / cron / retention touching `page_history` returns nothing. Retention services exist only for **audit** (`audit.service.ts:24-59`) and the **orvex Redis event stream** (`environment.service.ts:361-370`, 24h default/72h max). **`page_history` grows unbounded** — a primary scale hazard.

## 3. YJS / REST-WRITE INTERPLAY — critical, and it's SAFE (no divergence)

REST content writes do **not** touch `page.content` directly. `updatePageContent` `page.service.ts:906-933` parses to ProseMirror JSON then calls `collaborationGateway.handleYjsEvent('updatePageContent', 'page.<id>', {...})` `page.service.ts:920-925`. That dispatches (via Redis sync or local) `collaboration.gateway.ts:154-166` to a handler that applies the op **inside the live ydoc** through `hocuspocus.openDirectConnection(documentName).transact(fn)` `collaboration.handler.ts:174-189` / gateway `transactDoc` `collaboration.gateway.ts:172-183`.

So **the REST path IS the ydoc path** — an agent write mutates the same CRDT the editor uses; no separate column write to diverge, no reset. The single `connection.transact` is the atomicity boundary (`collaboration.handler.ts:160-167`).

**But the DB persist is DEBOUNCED.** The ydoc→DB flush happens in `persistence.extension.ts:onStoreDocument` (100-285), fired by Hocuspocus with **`debounce: 10000`, `maxDebounce: 45000`, `unloadImmediately: false`** `collaboration.gateway.ts:54-56`. `onStoreDocument` re-reads the page `FOR UPDATE` (`withLock`, `persistence.extension.ts:120-125`), diffs new-vs-stored with a phantom-key guard (`persistence.extension.ts:137-140`), and only then writes `content/textContent/ydoc` via `pageRepo.updatePage` `persistence.extension.ts:170-185`.

**Consequences at volume:** (i) a read of `page.content` immediately after a REST write can be **stale for up to 45s** until the debounce flushes (the ydoc is authoritative, the column lags); (ii) 100 docs each opened via `openDirectConnection` hold 100 ydocs in Hocuspocus memory (`unloadImmediately:false`) with 100 pending debounced flushes → memory pressure + a deferred write burst. The `FOR UPDATE` lock in `onStoreDocument` serializes only per-page, not globally.

## 4. SEARCH INDEXING PER WRITE — synchronous Postgres trigger (default driver)

Default search is Postgres tsvector on `pages.tsv` (GIN index `pages_tsv_idx`, `migrations/20240324T086300-pages.ts:17,44-47`). Maintained by a **synchronous BEFORE trigger**: `CREATE TRIGGER pages_tsvector_update BEFORE INSERT OR UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION pages_tsvector_trigger()` recomputing `setweight(to_tsvector(title),'A') || setweight(to_tsvector(text_content),'B')` `migrations/20240324T086800-pages-tsvector-trigger.ts:4-16`. Query side uses `tsv @@ to_tsquery` `search.service.ts:54,124-125`.

So reindex cost is paid **synchronously inside each `pages` row UPDATE** — and since `text_content` is only written by the debounced `onStoreDocument`, tsv refresh rides that debounced write, not the REST request. Separately, `PAGE_UPDATED` **unconditionally** enqueues a `SEARCH_QUEUE` job `page.listener.ts:46` (only consumed as real work under the Typesense driver `page.listener.ts:93-95`; a no-op enqueue otherwise).

## 5. TRANSACTION SCOPE + BATCH ATOMICITY

**Single update:** metadata + optional orvex-metadata land in one Kysely tx (`executeTx`, `page.service.ts:654-664/673-683`). **But the content write is NOT in that transaction** — it goes through the async ydoc gateway (`page.service.ts:796`, §3). The synchronous history snapshot (`page.service.ts:775`) is also its own separate statement. So one logical "update" spans: a Kysely metadata tx + a separate history INSERT + an out-of-band debounced ydoc/content write. A crash mid-way can bump `version` with content unflushed.

**Bulk/atomic multi-page primitive: does NOT exist for content.** The only bulk endpoint is `POST /api/pages/bulk` `bulk-page.controller.ts:83-169`, and `BULK_OPS = ['status','move','metadata','delete']` `bulk-page.dto.ts:26` — **no content op**. It caps at `MAX_BULK_PAGES = 100` `bulk-page.dto.ts:30`, and executes pages via **`Promise.all(pageIds.map(processOnePage))`** `bulk-page.controller.ts:133-146` — i.e. **N independent operations, each its own transaction, NOT one atomic batch** (per-id receipts, partial success expected). Repo has `updatePages` (multi-id) `page.repo.ts:209` but it's used only for same-value moves (`movePageToSpace` `page.service.ts:1124`), never content.

**Therefore: 100 doc content updates = 100 independent `/update` HTTP calls, 100 separate metadata txns, 100 history INSERTs, 100 debounced ydoc writes. No cross-page atomicity anywhere.**

## 6. LIMITS / THROTTLING

- **Body limit:** ~**5 MiB** per request, `DEFAULT_REQUEST_BODY_LIMIT = 5*1024*1024`, env-overridable, applied as Fastify `bodyLimit` `request-body-limit.ts:7,18-23`, `main.ts:31-39`. Per single page (no batch content endpoint exists).
- **Throttling:** named throttlers configured in `throttle.module.ts:29-42` (MCP_TOOL 120/min `:32`, DESTRUCTIVE_OP 15/min `:42`, etc.). Guards are **per-route** (`UserThrottlerGuard`/`WorkspaceThrottlerGuard`), **not a global APP_GUARD** (grep for `APP_GUARD` throttler = none; `orvex-throttler-names.ts:21-28` confirms per-route model). **The content `/update` route has NO throttle guard** — only `/delete` `page.controller.ts:805-807` and `/bulk` `bulk-page.controller.ts:85-87` carry `DESTRUCTIVE_OP_THROTTLER`. MCP-routed writes hit MCP_TOOL_THROTTLER (120/min); direct REST `/update` is **unthrottled** at the engine → no backpressure on a 100-doc burst.
- **Per-write locks:** only the per-page `FOR UPDATE` inside `onStoreDocument` `persistence.extension.ts:121`, and Redis idempotency claim `page.service.ts:699-719`. No global write lock.

## orvex/* per-write side-effect fan-out (adds work per save)

Per content save the fan-out is large (all async, in-process EventEmitter2 + BullMQ + Redis):
- `PAGE_UPDATED` listener enqueues a **search** job + an **AI embedding** job `page.listener.ts:42-60`.
- `onStoreDocument` additionally enqueues a **`PAGE_CONTENT_UPDATED` embedding** job (attempts:3) `persistence.extension.ts:264-281`, a **history** job `:283`, a **mention-notification** job `:209-219`, and syncs **transclusions** (2 writes) `:194,333-362`.
- History processor then enqueues **backlinks** `history.processor.ts:123-129` + **page-update notification** `:137-143` + **audit** event `:92-113`.
- **Orvex event bus** (`orvex-event-bus.service.ts`): on `PAGE_UPDATED` it does a `fetchPage` **extra DB read** + `append` = **Redis XADD** to the workspace event stream `:172-173,127-149` (gated on per-workspace `settings.enabled`; `MAXLEN` trimmed, default 1,000,000 `:141`). **No Kafka/outbox in the engine** — grep for `kafka`/`outbox`/`producer.send` across `apps/server/src` returns nothing; the outbox→Kafka seam referenced elsewhere is not in this write path.

**Net: one content save ⇒ ~5–7 queued jobs + ≥1 extra DB read + 1 Redis XADD. 100 docs ⇒ ~500–700 background jobs.** Note the AI content-embed job uses `removeOnFail:false` with `jobId` keyed by `Date.now()` `persistence.extension.ts:279` — 100 saves mint 100 non-coalescing embed jobs.

---

## Top scale hazards for the 100-doc scenario (ranked)

1. **Unbounded `page_history` with a full-content row per REST save, non-diff-gated** (`page.service.ts:770-782`) + **zero retention/cleanup** anywhere. Storage grows linearly and forever; 100 updates = ≥100 full-doc copies.
2. **No atomic/bulk content-write primitive** (`bulk-page.dto.ts:26`, `Promise.all` at `bulk-page.controller.ts:133`). 100 docs = 100 independent unthrottled HTTP calls, no cross-page transaction, partial-failure by design.
3. **Debounced ydoc→DB persist (10s/45s)** with `unloadImmediately:false` (`collaboration.gateway.ts:54-56`): 100 concurrently-opened ydocs held in Hocuspocus memory + a deferred write/flush burst; read-after-write staleness on `page.content` up to 45s.
4. **Non-transactional metadata-vs-content split** (`page.service.ts:656` sync vs `:796` async ydoc): version can bump with content unflushed on crash.
5. **Heavy per-save async fan-out** (~5–7 jobs + extra DB read + Redis XADD per doc; non-coalescing embed jobs) → ~500–700 jobs for 100 docs, pressuring BullMQ/Redis and the AI queue.
6. **No throttle/backpressure on `/update`** (only destructive ops are limited) — a runaway 100-doc agent burst is unbounded at the engine edge.

Minor: synchronous tsvector trigger cost per `pages` UPDATE (`migrations/...086800:4-16`) scales with doc size but is per-row bounded; 5 MiB body cap is per-page only.
