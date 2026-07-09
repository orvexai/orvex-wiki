---
description: Run the Orvex Studio Delivery Orchestrator (authoritative prompt lives in the wiki).
argument-hint: [kickoff directive, e.g. "Act 1 only"]
---
The Studio Delivery Orchestrator prompt is the wiki page (single source of truth) — **not** this file. This loader is a POINTER (per the prompt's own §3.21): it only fetches and adopts the live page; never paste a local copy here, never edit the prompt here — edit the wiki page.

- Page: **Orchestrator Prompt — Delivery** · space `orvexstudioarch` · slug **`gkkUDzn277`** · status **canonical** (ratified 2026-07-06, PO batch approval)
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/orchestrator-prompt-delivery-gkkUDzn277
- Lineage: adapted from Houston's Delivery Orchestrator (space `houston`, slug `GIVaz0PxuS`) — Houston stays pattern source only; never fetch it as the Studio prompt.

Run it:
1. **Run-mode gate (§0):** `/effort ultracode` must be active before adopting the prompt. If it is not on, STOP and ask the operator to enable it (or to explicitly authorize Agent-only fan-out) — do not start in normal mode.
2. Fetch the authoritative prompt (faithful mirror read):
   `docmost-cli page mirror pull /tmp/orvex-studio-delivery --space orvexstudioarch --slug gkkUDzn277`
   then read `/tmp/orvex-studio-delivery/**/gkkUDzn277.md` **in full** and verify it is non-empty and contains "## 0. Run mode" (a stale daemon lock can make `mirror pull` silently produce an empty dir — Houston ENG-1232). If the pull is empty or hangs, fall back to `docmost-cli page get gkkUDzn277 --no-daemon` (reliable, but drops embeds).
3. Adopt it as your operating prompt and execute it, honoring its **three-act protocol** (Act 1 investigate → PLAN, STOP for PO approval; Act 2 EXECUTE the reconciled canon + Linear structure; Act 3 AUTONOMOUSLY DELIVER the frontier to Done) and its **pure-orchestrator contract** (§0: decompose → dispatch → synthesize → verify; all substantive work via `Workflow` sub-agents). Treat **$ARGUMENTS** as the kickoff directive.

Never run a stale local copy — the wiki page is authoritative; this command always re-fetches it.
