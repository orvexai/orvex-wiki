# orvexstudioai — digest

## 1. Mandate

`orvex-studio-ai` is the AI brain of the Orvex Studio family: a Go rewrite (ground-up, clean-room, no AGPL port) that supersedes the in-fork TypeScript AI code — chat, ask (cited RAG loop), inline AI, drafts, prompts, memories, image generation, and AI cost metering/enforcement. It is the family's only door to LLMs (LiteLLM is the sole model gateway) and owns the full cited-ask loop end-to-end, but owns no retrieval index (knowledge's) and no write primitives (wiki-api's block chokepoint).

## 2. Inventory

- Architecture: orvex-studio-ai (canonical) — slug Cb0XBkNezd
  - Architecture Audit — SE-Arch review (2026-07-05) (canonical) — slug oaD5XUHqfb
- PRD: orvex-studio-ai (draft) — slug pbKI3BpQmY

Only 3 pages; no ADR pages exist yet in this space (registry TBD, CS §9, Act-1).

## 3. Decided vs draft

**Decided/locked (canonical, ratified 2026-07-06):**
- D-P3/D-AI11: billing owns the plan→cap entitlement value (SoR); ai reads + enforces via LiteLLM per-caller scoped keys/budgets (call-site ceiling, D-S5/D-P5) over a per-tenant `max_budget` backstop; console **displays** only. Supersedes the earlier ai-as-SoR D-CAP/D-AI7 posture.
- D-S7: Free = 10-lifetime-AI-action trial; £7 Personal = spend cap.
- D-ASK: cited-ask/RAG loop moved from wiki-api to ai, fully owned, agentic multi-hop, K5 answer shape `{answer, citations[], confidence, unanswered, gapNote, followups}`. wiki-api's `ask` verb removed; ai is a third MCP upstream.
- D-S12: Mongo struck platform-wide — usage/event journal + step-ledger are Postgres range-partitioned append tables.
- D-S13: Redis→Kafka bridge retired; engine outbox+relay publishes straight to Kafka (launch prerequisite).
- D-S14: ranking is knowledge's permanent home (U13 closed) — ai never re-ranks.
- D-S15: embedding spend is a **separate nested budget** (not a sub-line of user cap) via an ai-provisioned sibling scoped LiteLLM key; content-hash skip mandatory (OQ-AI2 resolved).
- D-S11: Linear removed family-wide, not deferred — no tool set, no dependency.
- D-S4: in-editor AI is thin-UI; all logic (prompting, mermaid→drawio/excalidraw conversion) server-side in ai.
- D-WF-1: no in-service Temporal worker; durable loops are central workflows in orvex-studio-workflows calling ai step-APIs.
- D-S6: orvex-studio-control renamed orvex-studio-console.

**Still draft / open (PRD itself is status=draft, "not ratified"):**
- The PRD document status is draft even though most content decisions above are individually locked via Daniel-mandated fold-ins.
- OQ-AI3: model-config admin ownership (embedding model/dimension half) — owner Daniel, unresolved.
- OQ-AI4: browser-path cutover timing vs identity ship order (token-first launch is the interim).
- OQ-AI5: durable-loop live-stream mechanism — Redis-stream relay (A-RELAY) is "a sketch not decision," poll-only fallback.
- OQ-AI7: chat-state ETL approach (one-shot preserving branch topology vs fresh-start) — ASSUMPTION leaning one-shot.
- FR-AI21 delegation-token shape is an explicit [ASSUMPTION].
- F6/F8 (from the audit): LLM-confinement carve-out and cap-override break-glass are both open ADR-required governance decisions, not silently resolved.
- ADR registry parent/numbering itself TBD (Act-1, family-level, blocks filing F6/F7/F8 ADRs).
- Billing WS-14: billing entitlement store + `billing.entitlement.changed` not yet landed — interim hardcoded Free caps until swapped to billing SoR.

## 4. API/contract surface

Authored in orvex-studio-contracts (ai conforms), not yet frozen there per this page's own text ("Exact spellings freeze in contracts").

- **Client surface** (byte-compatible, ingress-routed, zero client rewrite goal G3): `POST /api/ai/chat` (SSE data-stream), `/api/ai/ask`, `/api/ai/inline`, `GET /api/ai/models`, chats CRUD+fork+branches, drafts, memories CRUD, prompts CRUD, `GET /api/ai/usage`, `POST /api/ai/images/generate`, bake-payload, settings, `POST /api/ai/tools/retry`, `GET /api/ai/health`.
- FR-AI19a: settings surface has a named G3 exception — base-URL/virtual-key fields are read-only post-cutover (typed rejection on write).
- **Agent surface:** MCP's AI tools (ask/chat/inline/generate) call `/api/ai/*` directly with forwarded bearer — ai is "a third MCP upstream."
- **Internal surface:** `POST /internal/v1/steps/{model-call,tool-exec,result-sink}` — workflows-only, workload identity, idempotent (lib FR-L19), typed retryable/terminal error envelope. This is the step-API contract that orvex-studio-workflows' FR-W11/OQ-W4 is blocked on.
- No `/internal/v1/synthesize` route (deleted with D-ASK); no dual-auth route class.
- CloudEvents: `ai.usage.recorded`, `ai.cap.reached`, `ai.cap.warning`, `ai.job.*` — Kafka topics on `studio-spine`, outbox-backed on the producer side (A-OUTBOX), `ce-id` idempotent + `orvexcell` fail-closed on the consumer side.
- Maturity: contract shapes are architecturally specified in detail but "authored in contracts; ai conforms" — the actual contracts-repo artifacts are deltas still to file (step-API shapes, delegation-token shape, K5 shape, `QUOTA_EXCEEDED` code, billing entitlement-read seam, MCP→ai tool surface). No OpenAPI/swagger mentioned anywhere in either page.

## 5. Delivery state

Per the SE-Arch audit's explicit **build-state statement** (verified against the clone, 2026-07-05):

- Repo is a **SCAFFOLD**. `go.mod` has zero deps. Real Go = 3 files / ~193 LOC: `cmd/server/main.go` (`/healthz` static 200 + `/v1/chat` → **501**), `cmd/metering/main.go` (HTTP CloudEvents receiver → 202), `internal/config/config.go`.
- "There is **no tier skeleton** — no `internal/{domain,store,event,workflow,cache}`, no SQL migrations, no store layer."
- Deploy/kustomize tree and Tekton→Harbor CI exist and were actively updated 2026-07-05, but drifted from the architecture in several ways at audit time.
- Findings disposition (from the audit's summary): **fixed-in-draft** in the arch page — F2 (producer outbox added), F3 (consumer ce-id idempotency + cell guard), F4 (A-DATA cap-state contradiction struck), F9 (liveness/readiness split added as A-OPS), F10 (`ARG CMD_NAME` corrected). F1 (metering topology) reported as "fixed" — repo-side deploy correction landed 2026-07-06 replacing Knative scale-to-zero with a plain Deployment. **Open-decision/build-time-correction, not yet done:** F5 (write-door still names old engine model in config, not wiki-api), F-JOURNAL (deploy wires S3 + stale Mongo comment, no `DATABASE_URL` — journal store is 3-way divergent across arch/deploy/comments), F11 (README stale, out of wiki scope).
- No handoff/checklist/gate-result page in this space beyond the audit itself; the audit functions as the closest thing to a Done-gate record, verdict "needs-tightening" not "contradicts-canon."

## 6. Gaps & tensions

- PRD document is still status=draft ("not ratified") while the architecture page built against it is canonical — a status mismatch between the two governing pages of the same service.
- Phantom "ADR-0002" citation lives uncorrected in the PRD itself (FR-AI12) — the audit flagged it as out of its own write scope; the correction only landed in the architecture page's citation.
- No ADR pages/registry exist yet in this space at all, despite the architecture page listing five mandatory ADR triggers to file "once the registry lands" — a program-level dependency this space cannot self-resolve.
- F6 (LLM-confinement carve-out): D-S15 has knowledge calling LiteLLM directly with an ai-provisioned key, which CS §6/§10 "currently declare a build failure" — flagged explicitly as unreconciled, ADR required, not resolved.
- F8 (break-glass): the PRD/arch's "separate audited workload-identity path" for cap override is flagged as contradicting canon P4 (single console-admin-plane break-glass) and is explicitly "retracted pending" an ADR.
- Three-way store divergence for the usage journal at audit time: arch says Postgres, deploy wires S3, code comments say Mongo — named "ARCHITECTURE MISMATCH FLAG" in the audit, not yet confirmed fixed in code (only the metering topology fix, F1, is confirmed landed).
- OQ-AI5 (durable-loop streaming relay) explicitly named "a sketch not decision" — architecture ships without resolving it, partially blocking workflows' OQ-W4.
- Billing dependency risk: cap enforcement's authoritative entitlement source (billing SoR, WS-14) is not yet built — interim hardcoded Free caps are a named stopgap with an explicit fail-closed requirement if billing is unreachable.
