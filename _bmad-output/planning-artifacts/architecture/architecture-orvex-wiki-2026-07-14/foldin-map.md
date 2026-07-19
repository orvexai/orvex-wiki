> **tl;dr** — The authoritative assignment of the memory gap-closure requirements to their owning services. Each service PRD carries a pointer back here; this page is the single source for *who builds what*. Sources: PRD `g9vWbSYplh` (features F0–F8) and Architecture Spine `iiCcKhGptV` (AD-1…12). Ruling of record: **AD-1 adopted — `orvex-studio-api` owns the Memory system-of-record** (Daniel, 2026-07-14).

This is the fold-in plan for the memory gap-closure. It maps every feature and architecture decision to the service that owns it, so the work can become epics/stories without re-litigating ownership.

## Ownership assignment

- **orvex-studio-api** — F3 data model (FR-M1–4) · F4 lifecycle (FR-L1–5) · the Memory SoR `/v1/memory`. Spine: AD-1a · AD-2 · AD-3 · AD-4 (commit + atomic supersede) · AD-8 (mint). *System of record for the card + lifecycle; the sole mutation path is the confirm gate.*
- **orvex-studio-knowledge** — F5 retrieval eval (FR-E1–4) · the memory retrieval projection · F4 projection consistency. Spine: AD-1c · AD-7 (per-user namespace keyed by owner_scope) · AD-9 (eval) · AD-11 (per-card ordering + read-your-writes). *Read-only projection; owns the eval harness + regression gate.*
- **orvex-studio-ai** — F2 proposal/extraction quality (FR-X1–6) · F5 proposal eval · F8 token-cost (FR-C1–3) · chat-recall (FR-AI11). Spine: AD-1b · AD-4 (async) · AD-10 (budget). *Owns extraction compute + chat-recall; `ai_memories` is chat-recall, NOT the product Memory SoR (AD-1).*
- **orvex-studio-identity** — F6 BYOK (FR-S1–3) · firewall + consent (FR-S5). Spine: AD-8 (consent binds at mint; short-TTL delivery token) · AD-6. *Mints the single-target, single-use delivery token; manages BYOK/KMS.*
- **orvex-studio-mcp** — F1 MCP retrieval surface · the DeliveryAdapter contract. Spine: AD-5b (MCP = read under I-4, not a delivery adapter). *Exposes memory as a knowledge-retrieval tool, governed by I-4.*
- **New component — Delivery client (F1)** — F0 delivery UX · F1 client compose port (FR-D1–7). Spine: AD-5a · AD-6 (ToS-clean invariant). *The browser-extension/compose-box adapter — no existing service owns it; needs a new repo. Gated on the F1 viability spike (OQ8, incl. the CWS 2026-08-01 re-check).*
- **orvex-studio-contracts** — the pinned seam: card schema, DeliveryAdapter port, MCP additions, `memory.*` CloudEvent catalog. Spine: AD-2 · AD-5a · AD-11.
- **orvex-studio-staging** — F2 review queue (the Librarian ChangeSets). Spine: AD-4. *Hosts the propose→confirm queue; the confirm gate is the sole mutation path.*

## Cross-cutting (every owner honors)

- **NFR-1–7** (latency, consent, neutrality, graceful degradation, non-technical accessibility, auditability, i18n) from the PRD.
- **F7 team memory** is phased: only the `owner_scope`-nullable data shape (AD-12) is a v1 MUST across api + knowledge; RBAC/moderation is deferred.

## Deferred / gating (not startable yet)

- **F1 mechanism** (AD-5a) — blocked on the legal + technical viability spike (OQ8).
- **Delivery surface (c) stateful sync** (AD-5c) — blocked on the outbound-sync conflict policy (OQ3).
- **Retrieval benchmark** (AD-9) — harness fixed; benchmark choice open (OQ4).

## Status

Fold-in threaded into the five service PRDs (pointer + owned slice) and the delivery phases updated. Next: `bmad-create-epics-and-stories` over this map.
