**Task:** Trace `cmd/page/patch.go`'s HTTP round-trip flow for a single `page patch` invocation (happy path), CAS/if-version mechanics, and whether content is re-read over HTTP.

**(1) Round-trip list for single-page `page patch <slug> --find X --replace Y` (non-dry-run):**

1. `db.Open`/`db.GetPage(ctx, slug)` — **local SQLite cache read, not HTTP** (patch.go:876-884).
2. `patchLiveUpdatedAt(ctx, profile, slug)` → `POST /pages/info` (patch.go:798-818, called unconditionally at patch.go:945 whenever `!opts.dryRun && !isLiveStub`) — fetches only `updatedAt`; content is explicitly discarded (patch.go:794-797 comment). Purpose: rebase the body used for `--find` matching against the live version, **not** CAS (patch.go:932-963). Runs regardless of whether `--if-version` was passed.
3. **Conditional:** embed-degradation guard `apiClient.GetPageInfoPM(ctx, cached.UUID)` → `POST /pages/info` (patch.go:1051-1052) — only fires when `patched != original && content.CachedMarkdownMightHaveEmbeds(original)` (cached markdown contains embed-fence syntax like `:::excalidraw`/`​```mermaid`). Skipped for plain-prose pages (explicit optimisation, patch.go:1046-1049).
4. `callUpdatePageAPI(ctx, profile, payload, slug, cached.UpdatedAt)` → `POST /api/pages/update` (defined update.go:1870-1875, called patch.go:1175) — the actual write. Unconditional.
5. `db.UpsertPage` — local cache write (patch.go:1254), not HTTP.
6. `postWriteCacheRefresh` (writehelpers.go:231-233, called patch.go:1261) → `daemon.Connect` + `dc.RefreshPage(WithContent)` (writehelpers.go:264-287) — **local Unix-socket IPC to the CLI's own daemon, not an HTTP call to the Docmost server**. Best-effort/fire-and-forget: silently no-ops if the daemon isn't running (writehelpers.go:265-272).
7. `audit.LogWithFields` calls throughout (e.g. patch.go:1255, 1263) — not traced here (separate audit-internals slice); call sites only.

**(2) Definitive round-trip count, happy path (page in cache, no embed markers, no drift, no conflict):**
**2 HTTP round-trips to the Docmost server**: `/pages/info` (freshness probe, step 2) + `/pages/update` (write, step 4).
If the cached body contains embed-fence markers: **3 round-trips** (adds step 3's `/pages/info` GetPageInfoPM call).
Edge cases add more: cache-miss live fallback (`resolveLivePatchStub`, patch.go:890/903) costs 2 HTTP calls on its own (resolve UUID + GetPageInfoPM) before the above even starts; a 404-on-rename or benign-bump 409 triggers exactly one retry of the write (patch.go:1176-1195).

**(3) CAS/if-version mechanics:**
- Default (no `--if-version`): `casBaseline = cached.UpdatedAt` (patch.go:1073-1075), sent as `payload["ifVersion"]` (patch.go:1171-1174).
- Explicit `--if-version`: used as `casBaseline` (patch.go:1076-1078) and sent verbatim (patch.go:1168-1170) — server-arbitrated, no local pre-reject (the old client-side equality pre-check was deliberately removed, patch.go:919-930).
- `--no-cas`: `ifVersion` omitted entirely (patch.go:1165-1167).
- `cas_gate.go`'s `classifyWrite` (the three-baseline `cas.Gate`/`Reconcile`/`Classify` machinery) is invoked at patch.go:1081-1087, but **only when `liveBody != "" && casBaseline != ""`** (patch.go:1080), and `liveBody` is populated **only** by step 3's embed-guard fetch (patch.go:1054). So the classifier never triggers its own round-trip — it piggybacks on the embed-guard read when that read already happened (explicit comment, patch.go:1029-1032: "the embed-guard block below already performs the live read... we reuse its result rather than adding a round-trip"). With no embed markers, `liveBody` stays empty, the classifier is skipped entirely, and the server's own 409 is the sole CAS arbiter.
- Net: `--if-version` does **not** let a caller skip the pre-read — step 2's `/pages/info` call runs unconditionally on the live path regardless of whether `--if-version` was supplied (it's for content freshness, not CAS).

**(4) Pre-read distinctness:** Yes — step 2 (`/pages/info`, updatedAt only) is a distinct round-trip from step 4 (the write), and from step 3 (`/pages/info` again, this time with full PM body, embed-guard only). The actual find/replace text computation (`applyPatch`, patch.go:990) runs against the **local cache's** `ContentBlob` (patch.go:985), not a fresh HTTP body — no separate "read full content" round-trip is needed for that unless the freshness probe (step 2) detects drift, in which case `resolveLivePatchStub` re-fetches the body live (2 more HTTP calls: resolve UUID + GetPageInfoPM, patch.go:954).
