---
description: Run the Houston Delivery Orchestrator (improved draft prompt lives in the wiki).
argument-hint: [kickoff directive, e.g. "Act 1 only"]
---
The Delivery Orchestrator prompt is the Houston wiki page (single source of truth) — **not** this file. This loader only fetches and adopts it; never paste a local copy, never edit the prompt here — edit the wiki page.

- Page: **Orchestrator Prompt — Delivery (improved draft)** · space `houston` · slug **`GIVaz0PxuS`** · status **canonical**
- URL: https://docs.eu-central-1.myidp.cloud/s/houston/p/orchestrator-prompt-delivery-improved-draft-givaz0pxus
- Supersedes slug `moBctRFhUm` (now `status: superseded` in the wiki — kept for history only, never fetch it).

Run it:
1. Fetch the authoritative prompt: `docmost-cli page mirror pull /tmp/houston-delivery --space houston --slug GIVaz0PxuS`
2. Read `/tmp/houston-delivery/**/GIVaz0PxuS.md` in full.
3. Adopt it as your operating prompt and execute it, honoring its **two-act protocol** (investigate → PLAN, STOP for PO approval, then EXECUTE). Treat **$ARGUMENTS** as the kickoff directive.

Never run a stale local copy — the wiki page is authoritative; this command always re-fetches it.
