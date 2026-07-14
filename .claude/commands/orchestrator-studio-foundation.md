---
description: Run the Orvex Studio Foundation Orchestrator (authoritative prompt lives in the wiki).
argument-hint: [target repo, e.g. "orvex-studio-identity"]
---
The Studio Foundation Orchestrator prompt is the wiki page (single source of truth) — **not** this file. This loader is a POINTER (per the delivery prompt's §3.21): it always fetches the latest copy from the studio architecture space and adopts it; never paste a local copy here, never edit the prompt here — edit the wiki page.

- Page: **Orchestrator Prompt — Foundation** · space `orvexstudioarch` · slug **`UKanXYLCQD`** · status **draft** (pending human doc-ratify; it is nonetheless the only and authoritative Studio copy)
- URL: https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/orchestrator-prompt-foundation-UKanXYLCQD
- Lineage: adapted from Houston's Foundation Orchestrator (space `houston`, slug `skCyy79mCF`) — Houston stays pattern source only; never fetch it as the Studio prompt.
- Companion: the Delivery Orchestrator (`/orchestrator-studio-delivery`, slug `gkkUDzn277`) builds on the foundation this prompt establishes.

Run it:
1. **Run-mode gate:** `/effort ultracode` must be active before adopting the prompt. If it is not on, STOP and ask the operator to enable it — do not start in normal mode.
2. Fetch the authoritative prompt (faithful mirror read):
   `docmost-cli page mirror pull /tmp/orvex-studio-foundation --space orvexstudioarch --slug UKanXYLCQD`
   then read `/tmp/orvex-studio-foundation/**/UKanXYLCQD.md` **in full** and verify it is non-empty and contains "## Stage M1" (a stale daemon lock can make `mirror pull` silently produce an empty dir — Houston ENG-1232). If the pull is empty or hangs, fall back to `docmost-cli page get UKanXYLCQD --no-daemon` (reliable, but drops embeds).
3. Adopt it as your operating prompt and execute it against **ONE target repo per run**, honoring its rules: all eight stages **M1–M8 strictly in order**, ALL-REAL / BUILD-EVERYTHING / ZERO-MOCK, **never set wiki pages canonical** (draft only), **never apply Kubernetes manifests** (build-only validation), document lessons-learned in the handoff. Treat **$ARGUMENTS** as the kickoff directive naming the target repo.

Never run a stale local copy — the wiki page is authoritative; this command always re-fetches it.
