# Six-surface re-baseline — Surface: CLI (docmost-cli)

**Program:** Orvex Wiki six-surface acceptance re-baseline (Linear ENG-2033)
**Surface:** `cli` — DfM markdown round-trip fidelity via `docmost-cli`
**Date:** 2026-07-13
**Verifier discipline:** every verdict below is backed by a command I personally ran against the standing dev cell and its captured output (trimmed). No verdict is extrapolated from code reading or Linear state.

**OVERALL VERDICT: FAIL** — the ergonomic CLI markdown write path (`page create --content @file.md`, `format:"dfm"`) is **not** byte-faithful. It **silently drops the entire text content of every list item** (bullet and ordered) and **truncates table cells at an unescaped `|`**. The known nested-bold+code concern is **disproven** on this path (marks round-trip cleanly). The faithful `--content-json` path round-trips correctly.

---

## 1. Environment facts established

| Fact | Value | How established |
|---|---|---|
| CLI binary | `/home/daniel/go/bin/docmost-cli` v1.4.3-4-g9ca0829-dirty (built 2026-07-07) | `docmost-cli --version` |
| Dev endpoint used | `https://dev-docmost.eu-central-1.myidp.cloud` (env `DOCMOST_DEV_URL`) | `docmost-cli auth status` after `export DOCMOST_URL=$DOCMOST_DEV_URL` |
| Dev token | env `DOCMOST_DEV_API_TOKEN` (workspace `019e3bc2-…`, distinct from prod `019e1776-…`) | `auth status`, JWT decode |
| Dev cell workload behind endpoint | HTTPRoute `docmost` in ns `docmost-dev` → image `repos.eu-central-1.myidp.cloud/docmost/docmost-dev:dev` (the **legacy Docmost monolith fork**) | `kubectl get httproute -A`, `kubectl get deploy docmost -n docmost-dev -o jsonpath=…` |
| Tenant used | disposable space `rebaselinecli1783943679` ("rebaseline-cli rt"), created for this run; dev workspace is a throwaway (peers: "Phase3 Test", "throwaway") | `space create` |
| Real user tenants mutated | **none** — all writes confined to the disposable space | — |
| `orvex-cli` / `orvex` present? | **no** (`which orvex orvex-cli` → not found) — CLI surface exercised via `docmost-cli` only | `which` |

### API path: /v1 grammar or legacy engine path? → **LEGACY engine path**

Determined three independent ways:

1. **Binary route table** — every page route string in the binary is `/api/…` (legacy Docmost NestJS controllers), e.g. `/api/pages/create`, `/api/pages/update`, `/api/pages/info`, `/api/spaces/info`, `/api/markdown/to-prosemirror`, plus orvex extensions `/api/orvex/audit`, `/api/orvex/drift`, `/orvex/pages/supersede`. **No `/v1/` route exists in the binary.**
2. **Live request capture** — pointing the CLI at a logging mock, `page create` issued `POST /api/spaces/info` → `POST /api/orvex/pages/duplicate-check` → `POST /api/pages/create`.
3. **DNS/route mapping** — `dev-docmost…` → `docmost-dev` ns → legacy `docmost/docmost-dev:dev` image. The split thin engine (`orvex-wiki-api`, hosts `wiki-api.orvex.dev`) exists in ns `orvex-wiki-api-dev` but **the CLI does not talk to it.**

**Captured create request body (from mock):**
```
POST /api/pages/create
{"content":"# Cap\n\n- apple\n- banana\n","format":"dfm","spaceId":"…","title":"Cap"}
```
So "DfM" is a server-side format tag: the CLI forwards raw markdown and the **legacy engine** performs the markdown→ProseMirror conversion. The CLI does **not** convert client-side.

---

## 2. Checks

### Check A — DfM round-trip of rich content (`page create --content @file.md`)

Fixture written (`rt.md`): heading, a paragraph with `**bold**`, `` `code` ``, and nested ``**bold `capped` code**``; a bullet list (3 items, each mark-bearing); an ordered list (3 items); a markdown table whose middle cell contains `` `{user|org}` `` (deliberate unescaped pipe to probe the known corruption); sentinel `ZZZ-9271-END`.

**Command:**
```
docmost-cli page create "RT fixture" --space rebaselinecli1783943679 --content @rt.md
# → slug arVkr1HYzw  (exit 0)
docmost-cli page get arVkr1HYzw --prosemirror --no-daemon   # raw stored PM-JSON
```

**Read-back (stored PM-JSON, marks shown, block-ids stripped):**
```
<paragraph>
  text []      'This paragraph has a '
  text [bold]  'bold word'
  text []      ', an '
  text [code]  'inline code'
  text []      ' span, and a nested '
  text [bold]        'bold '
  text [code,bold]   'capped'      ← nested bold+code PRESERVED
  text [bold]        ' code'
  ...
<bulletList>
  <listItem>   (empty — NO content)
  <listItem>   (empty — NO content)
  <listItem>   (empty — NO content)
<orderedList>
  <listItem>   (empty)  <listItem> (empty)  <listItem> (empty)
<table> …
  tableCell → 'value with a pipe `{user'   ← truncated at the pipe; `org}` inside` DROPPED, code mark lost
```

**Stored full-text token presence check:**
```
present 'first item': False   present 'second item': False   present 'third': False
present 'alpha':      False   present 'beta':        False   present 'gamma': False
present 'org}':       False   present 'ZZZ-9271-END': True
```

**Verdict: FAIL.** Nested bold+code round-trips faithfully (old concern disproven on the create path), but **all six list-item texts are gone** and the table cell is truncated at the unescaped pipe. Confirmed against raw `--prosemirror`, so this is real stored data loss, not the known `page get` markdown re-render artifact.

### Check B — minimal reproduction of the list-drop (isolate from fixture interaction)

**Command:**
```
printf '# List only\n\n- apple\n- banana\n- cherry\n\nAfter list.\n' > list.md
docmost-cli page create "List only" --space … --content @list.md   # → Hxs7E50Wcz
docmost-cli page get Hxs7E50Wcz --prosemirror --no-daemon
```
**Read-back:**
```
<bulletList> <listItem/> <listItem/> <listItem/>   (all three EMPTY)
<paragraph> 'After list.'                          (survives — parser resumes after the list)
```
**Verdict: FAIL, reproduced.** A bare three-item bullet list loses 100% of its visible text. The trailing paragraph proves the parser continues past the list rather than aborting.

### Check C — owner attribution: is it the CLI or the engine?

The CLI forwards raw markdown (Check A capture). Compare the two server-side converters in the same legacy engine:

**C1 — server `/api/markdown/to-prosemirror` with the same list:**
```
curl -X POST …/api/markdown/to-prosemirror -d '{"markdown":"# H\n\n- apple\n- banana\n- cherry\n\nafter\n"}'
→ listItem→paragraph→text "apple" / "banana" / "cherry"   (CORRECT)
```
**C2 — server `/api/pages/create` with `format:"dfm"` (the create path):** empty listItems (Checks A & B).

**Verdict:** the legacy engine contains **two divergent markdown→PM converters**. `/api/markdown/to-prosemirror` is correct; the **`format:"dfm"` ingestion path used by `page create`/`page update` drops list content.** Owner = engine (legacy docmost fork / `docmost-dev` image), not the CLI. The CLI is a faithful transport.

**C3 — table pipe, both converters:** `/api/markdown/to-prosemirror` **also** truncates `value with a pipe `{user…` at the unescaped `|`. So the table-cell truncation is shared (a GFM pipe-escaping gap), present in both converters.

**C4 — nested bold+code via `/api/markdown/to-prosemirror`:** returns `bold `/`capped`(code)/` code` split correctly — matches stored output. Bold+code is fine on all paths.

### Check D — faithful path (`page update --content-json`) as contrast

**Command:**
```
# build proper bulletList PM-JSON (apple/banana/cherry inside paragraphs), then:
docmost-cli page update Hxs7E50Wcz --content-json @cj.json --if-version "<live updated_at>"
docmost-cli page get Hxs7E50Wcz --prosemirror --no-daemon
```
**Read-back:**
```
<bulletList>
  <listItem><paragraph> 'apple'
  <listItem><paragraph> 'banana'
  <listItem><paragraph> 'cherry'
```
**Verdict: PASS.** The `--content-json` path (ProseMirror-JSON, bypassing the DfM converter) round-trips faithfully — storage is fine; the defect is strictly in the DfM markdown ingestion. (Note: the write required an explicit `--if-version`; the first attempt returned a CAS `outcome:"conflict"` — the documented auto-CAS baseline lag; branch on exit code, do not trust a parsed field.)

---

## 3. Overall verdict

**FAIL.** The CLI surface does **not** deliver a byte-faithful DfM markdown round-trip. The most-used authoring shape — a markdown list — is silently emptied on write via `page create/update --content @file.md`. Tables with unescaped pipes silently lose cell text. The only faithful write path is `--content-json` (ProseMirror JSON), which is not the ergonomic markdown workflow the surface advertises. The known nested-bold+code corruption is **disproven** on the create path (it round-trips cleanly). The CLI talks to the **legacy Docmost engine** (`/api/*`), **not** the split `/v1` orvex-wiki-api.

---

## 4. DEFECTS (ready-to-file ticket stubs)

### DEFECT-1 (P1 / high) — DfM markdown ingestion drops ALL list-item text on page create/update
- **Title:** DfM converter (`/api/pages/create` `format:"dfm"`) silently drops all list-item content — bullet and ordered lists ingest as empty `listItem` nodes
- **Evidence:** dev cell `dev-docmost` (image `docmost/docmost-dev:dev`). `docmost-cli page create "List only" --content @list.md` where list.md = `# List only\n\n- apple\n- banana\n- cherry\n\nAfter list.\n` → stored PM (`page get --prosemirror`, page `Hxs7E50Wcz`) = `bulletList` with three EMPTY `listItem`s; trailing paragraph "After list." survives. The engine's *other* converter `POST /api/markdown/to-prosemirror` converts the identical markdown correctly (listItems contain "apple"/"banana"/"cherry"). So two server converters diverge; the `format:"dfm"` create/update path is the broken one. Reproduced twice (rich fixture `arVkr1HYzw` lost first/second/third/alpha/beta/gamma; minimal fixture `Hxs7E50Wcz`).
- **Suspected owner service:** orvex-wiki engine — legacy Docmost fork, the server-side DfM (markdown→ProseMirror) ingestion used by `/api/pages/create` and `/api/pages/update`. Fix: route DfM ingestion through the same converter as `/api/markdown/to-prosemirror`, or fix the DfM list handler; add a read-back parity assertion on write.

### DEFECT-2 (P2 / medium) — Table cell silently truncated at unescaped `|` (incl. inside inline code), overflow + code mark dropped
- **Title:** DfM/markdown table parser truncates cell text at an unescaped `|` even inside a `` ` `` code span; overflow text and the code mark are silently lost
- **Evidence:** cell source `` value with a pipe `{user|org}` inside `` → stored as plain text `value with a pipe `{user` (backtick literalized, code mark lost, `` org}` inside`` dropped). Reproduced on both `/api/pages/create` (`format:"dfm"`, page `arVkr1HYzw`) and `POST /api/markdown/to-prosemirror`. Matches the documented EMBED_DEGRADATION rationale for tables.
- **Suspected owner service:** orvex-wiki engine — markdown table tokenizer (GFM pipe-escaping). Either auto-escape literal pipes inside code spans/cells, or reject with a loud error. Silent truncation is data loss.

### DEFECT-3 (P3 / low) — `page create --content` does not trip the EMBED_DEGRADATION guard that `page patch` trips on table-bearing markdown
- **Title:** CLI `page create/update --content @md` accepts table-bearing markdown and silently corrupts it, while `page patch` refuses the same content via the EMBED_DEGRADATION guard — inconsistent, silent-corruption path
- **Evidence:** the fixture table wrote through `page create` with exit 0 and no warning, producing DEFECT-2 corruption; per project memory `page patch` refuses table-bearing pages with EMBED_DEGRADATION. The guard should cover the create/update markdown path too (or the CLI should escape before send).
- **Suspected owner service:** `docmost-cli` (client-side pre-send guard / escaping) — secondary once DEFECT-1/2 are fixed engine-side.

### Program observation (not a defect, flag for triage)
The `cli` surface is still bound to the **legacy Docmost monolith** (`/api/*` on `dev-docmost` → `docmost/docmost-dev:dev`), not the split thin `/v1` engine (`orvex-wiki-api`, `wiki-api.orvex.dev`). If phase-1 "done" requires the CLI to operate against the split engine's `/v1` grammar (per the microservices mandate), this binding is itself a gap to confirm with the PO.

---

## Appendix — disposable artifacts (dev cell, safe to delete)
- Space `rebaselinecli1783943679`; pages `arVkr1HYzw` (RT fixture), `Hxs7E50Wcz` (List only, later content-json-corrected). Left in place (disposable dev workspace); no real tenant touched.
