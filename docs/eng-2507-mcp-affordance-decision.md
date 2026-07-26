# ENG-2507 — MCP-affordance decision record (AC4 ownership + T4 MCP-settings-page resolution)

Part of ENG-2507. This is the dispatch-time decision log the story's AC4 and T4
require: the mcp-affordance SSE ownership question resolved explicitly, and the
AC1 "MCP … settings pages" sub-clause resolved explicitly — neither silently
assumed nor silently dropped. Asserted by
`apps/client/src/ee/ai-chat/__tests__/thin-ui-sse-reader.integration.spec.tsx`
(`TestThinUiSseReaderHasNoServerAiLogic`).

## AC4 — mcp-affordance SSE ownership finding (recorded, not assumed)

**Finding: no affordance in this repo calls mcp directly over SSE.** Every
AI-affordance transport in the client bundle routes through the `ai`
satellite's own ingress surfaces, whose SSE wire is owned by
`orvex-studio-ai`'s frozen contract (ENG-2097 AC7/AC8; chat vocabulary pinned
as `orvex-studio-contracts` `sse/AI-CHAT.md`, cited in
`apps/client/src/ee/ai-chat/hooks/use-chat-stream.ts`):

| Affordance | Transport (verified in source) | Owning contract |
| -- | -- | -- |
| Chat panel / bubble-menu → chat (`ee/ai-chat`) | `fetch("/api/ai/chats/send")` — `services/ai-chat-service.ts` | `ai` — `sse/AI-CHAT.md` (ENG-2097) |
| Cmd+J AI palette inline transform (`ai-palette.tsx`) | `fetch("/api/ai/generate/stream")` — `ee/ai/services/ai-service.ts` | `ai` (ENG-2097) |
| Cmd+K Ask-search box (`search-spotlight.tsx` → `useAiSearch`) | `fetch("/api/ai/answers")` — `ee/ai/services/ai-search-service.ts` | `ai` (ENG-2097) |
| AI-diagram rendering (`chat-mermaid-block.tsx`) | none — pure client-side mermaid renderer, no network call | n/a |
| API-key settings pages (`ee/api-key/pages/*`) | engine's own `core/api-key` REST (`/api-keys*`), no SSE | engine REST — not an AI/MCP surface |

There is **no MCP-native SSE affordance** in the client bundle, so nothing here
rides an unowned contract and no escalation is required. An MCP settings
surface, when it exists, is a config-CRUD surface with **no SSE at all** (the
mcp pack's own contract, ENG-2102, tags no SSE surface of its own).

## T4 — MCP-settings-page sub-clause: DEFERRED (nothing real to surface)

**Resolution: deferral, not build.** A live scan
(`grep -rliE "\bmcp\b" apps/client/src`) confirms the client bundle contains no
MCP-configuration settings surface — the only hit is the incidental
OSS-attribution string in `ee/licence/components/oss-details.tsx`. There is no
real MCP-facing configuration for a page to display or edit:

- `apps/server/src/orvex/config/orvex-config.service.ts` deliberately exposes
  **no** `mcpUrl` getter (MINIMIZE-SURFACE, CS §3.6 / ❌#6: a getter is added
  together with its first consumer, never speculatively). `ORVEX_MCP_URL`
  exists only as a deploy-manifest scaffold
  (`deploy/kustomize/app-manifests/configmap-env.yaml`) with no client-facing
  consumer.
- The engine itself carries zero live MCP surface
  (`apps/server/src/orvex/mcp-surface-shed-at-parity.spec.ts`, ENG-1481); the
  MCP server lives in the separate `orvex-studio-mcp` repo.

Building a settings page now would fabricate a surface with nothing real to
show (CS §11 ALL-REAL; ❌#6 no speculative fields). Per the story's own T4
framing, this sub-clause is therefore **named follow-up work**: *file a
follow-up Issue ("client MCP-settings surface") when a real client-facing MCP
configuration op exists — i.e. when `OrvexConfigService` grows an MCP getter
with a real consumer, or the mcp pack ratifies a client-facing config CRUD
contract.* Filing that Issue is a live Linear write owned by the Studio
delivery orchestrator (story §9), not by the implementing worktree.

## Disclosure — AC1's "/ai slash-menu commands" clause (honesty, CS §11)

At this baseline (dev @ 5b60f464) the slash menu
(`features/editor/components/slash-menu/menu-items.ts`) contains **no
dedicated AI action item** — typing `/ai` only fuzzy-matches unrelated items
(e.g. "Airtable"). The editor-embedded AI entry points that ARE live: the
bubble-menu `AskAiGroup` ("Ask AI") and the Cmd+J `AiPalette` (both open the
same palette), plus the Cmd+K Ask-search box. AC1's slash-menu clause is
disclosed as not-present rather than claimed; the slash menu itself remains a
thin, AI-logic-free insertion menu (its "Mermaid diagram" item inserts an
editable block — no AI call).
