# Foundation Orchestrator

> 📖 **Pointer to the Foundation Orchestrator prompt in the Houston wiki.**
> This command fetches the authoritative copy on every invocation — never stale.

## How to use

This slash command pulls the **Foundation Orchestrator** prompt from the wiki.
The prompt documents the eight-stage repeatable process (M1–M8) for establishing
a production-grade, test-driven foundation: zero-mock tidy, Docker prod-parity
environment, smoke suite, CI, Kubernetes deploy, crew structure, enterprise
hardening, and the OpenAPI-contracted no-op app skeleton.

**Wiki page:** Foundation Orchestrator · space `houston` · slug **`skCyy79mCF`**
**URL:** https://docs.eu-central-1.myidp.cloud/s/houston/p/foundation-orchestrator-skCyy79mCF

## Fetch the prompt

```bash
# Faithful copy with full content:
docmost-cli page mirror pull /tmp/houston-foundation --space houston --slug skCyy79mCF
cat /tmp/houston-foundation/**/skCyy79mCF.md

# Quick text:
docmost-cli page get skCyy79mCF
```

## How to launch

1. Open a **fresh Claude Code session** with CWD `/home/daniel/repos/houston`.
2. Set `/model` → **Opus 4.8 (1M context)** and `/effort ultracode`.
3. Run the fetch command above to get the latest prompt content.
4. Paste the prompt body into the session with the kickoff line as directed.

---
*This loader is a pointer. The authoritative prompt lives in the wiki at slug `skCyy79mCF`.*
