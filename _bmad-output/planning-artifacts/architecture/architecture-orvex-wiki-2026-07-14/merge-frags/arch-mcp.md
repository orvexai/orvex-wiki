
## Memory gap-closure — architecture decisions (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned decisions: **AD-5 delivery model**.

**AD-5 — Delivery is three distinct surfaces, not one port.** *Binds:* how memory reaches any AI. *Prevents:* three incompatible mechanisms (push-write / read-pull / persistent-sync) crammed behind one signature. *Rule:* memory reaches an AI by exactly one of:
- **(a) Client compose port** — `composeInto(target, text) -> {ok | needs-manual-paste}`, paradigm **user-triggered, write-only, single-session compose-box insertion** (browser-extension for ChatGPT/Gemini web; copy-paste fallback). The mechanism binding is **deferred** to the F1 viability spike; the port is fixed now.
- **(b) MCP retrieval surface** — for MCP-capable clients, memory is *read* as a `knowledge` tool call under the caller's delegated principal, governed by **I-4** (ACL ∩ scope), **not** by this port. MCP is not a compose adapter.
- **(c) Stateful sync surface** — writes a vendor's *persistent* memory (Claude adapter). It MUST NOT start until the outbound-sync conflict policy (OQ3) is resolved — that Deferred item is load-bearing for any v1 that ships surface (c).
