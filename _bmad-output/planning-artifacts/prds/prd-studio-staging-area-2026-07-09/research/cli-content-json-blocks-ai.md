## Fork report: content-json path, `page block` surface, `ai` commands

**1. CONTENT-JSON PATH**

- Flag: `--content-json` registered `cmd/page/update.go:440`. Mutually exclusive with `--content` (`update.go:271-278`); only valid with `--operation replace` (`update.go:279-286`).
- Resolution: `content.Resolve(opts.contentJSON, ...)` reads `@file`/`@-`/literal bytes — `update.go:485-488`.
- **Client-side validation is syntax-only**: `json.Unmarshal(contentJSONBytes, &probe)` into a bare `map[string]interface{}` — `update.go:498-506`. This confirms "is valid JSON object", nothing more. No ProseMirror schema/structural validation, no canonicalization.
- Bytes stored verbatim (`opts.contentJSONBytes`, `update.go:507`) → assigned unmodified to `finalJSONContent` (`update.go:1186-1189`) → becomes the write body with **zero transformation**.
- Wire format switch: `update.go:1426-1428` — `wireFormat := "dfm"`, overridden to `"json"` only if `finalJSONContent != ""`. So the raw caller-supplied JSON string is sent as-is with `format:"json"`.
- **`internal/content/prosemirror.go` is not in this outbound path at all.** It's read/convert-side only: `ProseToMarkdown`/`ProseToMarkdownViaServer`/`proseToMarkdownLocal` (`prosemirror.go:24-67`) convert PM JSON *received from* the server into markdown for display (`page get`); `ParsePMDoc` (`prosemirror.go:731-737`) and `ExtractAttachmentReferences` (`prosemirror.go:541-563`) parse PM JSON for read-side analysis (orphan-attachment detection). None are called when building a `--content-json` request.
- **Verdict**: an agent can submit full ProseMirror JSON directly; the only gate is "does this parse as a JSON object" — no schema enforcement, no normalization before send.

**2. PAGE BLOCK SURFACE**

(a) `page block <type> <slug>` (`cmd/page/block/block.go:36-61`, aliased as top-level `pb`, `block.go:66-83`) inserts a typed embed/rich-content node via a dedicated per-type server endpoint (e.g. `POST /api/pages/:id/blocks/mermaid`, declared in the EmbedSpec at `mermaid.go:27`).

(b) No batching — each invocation does its own round-trips. Traced concretely via `runMermaidBlock` (`mermaid.go:74-172`): slug resolve via `slug.ResolvePageSlugLive` (`mermaid.go:122`, live API call) + `client.Do(ctx, "/pages/"+pageID+"/blocks/mermaid", payload, &receipt)` (`mermaid.go:143-144`) = **minimum 2 round-trips per block invocation**, same one-shot-per-process pattern as `page update`/`patch`/`create`. Note: `cmd/page/block/writehelpers.go` is **not** the write function — it only contains `renderBlockConflictReceiptToStdout` (`writehelpers.go:56-69`), a shared stdout-conflict-receipt helper. The actual HTTP write is duplicated per embed-type file, each calling `httperror.New(...).Do(...)` directly (e.g. `mermaid.go:143`).

(c) Block subcommand types found (28 files, one per type, minus infra `block.go`/`writehelpers.go`/`helpers.go`): attachment, audio, callout, chart, columns, details, diagram, drawio, embed, excalidraw, image_from_prompt, linear_entity, linear_graph, linear_issue, linear_view, math_block, math_inline, mermaid, orvex_dashboard, pdf, rm, status, subpages, table, task_list, transclusion, video.

**3. AI COMMANDS**

`cmd/ai/ai.go:7-18` registers 4 subcommands (`avail.go` is not a command — it's a shared unavailability-probe helper, `avail.go:36-180`, used by all four below):

- `ai ask <question>` — "Ask a question answered from your wiki (RAG)" (`ask.go:53-54`). **Discovery-relevant**: could help an agent check if something already exists before authoring a duplicate.
- `ai image generate <prompt>` — "Generate an AI image and attach it to a page" (`image.go:57-59`). **Authoring-relevant** (pairs with the `image_from_prompt` block type found above).
- `ai reembed` — "Trigger a bulk re-embedding of all pages for semantic search" (`reembed.go:35-37`). A server-side pipeline trigger, not a per-page client op. **Discovery-infrastructure-relevant** (keeps embeddings fresh for `ai ask` / semantic search).
- `ai cost` — "Show AI token cost dashboard" (`cost.go:41-43`). Observability only, not authoring/discovery.

One out-of-scope note for the parent: `reembed`'s "semantic search" / embedding language suggests a possible link to dup-guard's matching mechanism — worth the create.go/duplicate.go fork confirming whether `internal/duplicate` actually calls an embedding endpoint, since `AI_EMBED_PROVIDER_NOT_CONFIGURED` appears in `avail.go:122`.
