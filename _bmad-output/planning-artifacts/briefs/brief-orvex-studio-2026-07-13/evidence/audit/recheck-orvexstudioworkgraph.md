# Recheck: orvexstudioworkgraph vs brief.md

Scope: product-level concepts, user-facing behavior, pricing/packaging, persona
insight, or scope rulings in the space that the brief neither includes nor
consciously excludes. Program/engineering detail already covered by a prior
sweep is excluded.

## Candidate gaps

- **Page:** PRD: orvex-studio-workgraph (`Kgp6JT3IOR`) — §2.1/§2.4 Target User
  **Missed concept:** The workgraph has its own distinct customer-facing value
  proposition and personas — "cut per-session token spend," agent-fleet
  operators who need visibility into what agents are doing — entirely separate
  from the brief's consumer memory story.
  **Quote:** "Customers' finance/eng leads: 'cut per-session token spend —
  context reconstruction is our biggest hidden cost.'" / "Agent fleet
  operators: 'see what my agents are working on, what's blocked, and what got
  dropped — without reading transcripts.'"
  **Why it matters:** The brief frames Orvex Studio's audience purely as
  non-technical consumers (Priya/Laura) plus a business/enterprise tier that
  differs only in UI and entitlements. It never surfaces that one of the
  16 services has its own JTBD and buyer (agent-fleet operators / eng-finance
  leads optimizing token spend) — a materially different value prop that the
  brief doesn't include or consciously scope out.

- **Page:** PRD: orvex-studio-workgraph (`Kgp6JT3IOR`) — §4.4 FR-MEM17 Console
  fleet view
  **Missed concept:** A user-facing operations dashboard (per-tenant work-graph
  state, lease freshness, blocked-with-blockers, anomaly detectors) is a
  planned, in-scope UI surface with its own persona (Rhea, "operations lead").
  **Quote:** "Rhea, operations lead, opens the workgraph view in the Studio
  console: 7 in-progress items ... She spots a blocked cluster, reprioritizes,
  and pins a tenant fact."
  **Why it matters:** This is a concrete user-facing feature/persona for the
  business/enterprise surface that the brief's "three-surface arc" gestures at
  only abstractly ("differences live primarily in the UI... and
  entitlements") — the brief never names this dashboard or its persona as a
  planned deliverable, and it isn't in the Scope Out list either.

- **Page:** PRD: orvex-studio-workgraph (`Kgp6JT3IOR`) — §4.7 FR-MEM27 Claude
  memory-tool backend
  **Missed concept:** A planned adapter serves Anthropic's native memory-tool
  API directly from the workgraph store, giving Claude API agents "native"
  memory backed by Orvex — a distinct inbound integration from the brief's
  "outbound sync" framing (Orvex syncing out TO native memories).
  **Quote:** "An adapter that serves Anthropic's API memory-tool file protocol
  (`/memories` file ops) from the workgraph store ... so Claude API agents get
  native memory backed by Orvex with the same namespaces, grants and audit."
  **Why it matters:** The brief's outbound-sync narrative ("Orvex is the
  master copy... every other AI's memory becomes a replica") describes syncing
  Memory content into other systems, but this is a different mechanism — Orvex
  becoming the literal storage backend behind a vendor's native memory
  protocol — and it isn't mentioned or excluded anywhere in the brief.

- **Page:** PRD: orvex-studio-workgraph (`Kgp6JT3IOR`) — §4.4 FR-MEM16 Interop
  adapter (MCP KG reference shape)
  **Missed concept:** A read/write compatibility adapter lets any MCP host
  built against the community "memory" reference server ground against (and
  write into) the Orvex workgraph — an ecosystem-interop/product-positioning
  angle.
  **Quote:** "so hosts/tools expecting the de-facto baseline can ground
  against — and write into — the Orvex workgraph."
  **Why it matters:** This is a competitive/product-positioning capability
  (compatibility with the most common third-party memory tool shape) that
  could matter for adoption messaging; the brief doesn't mention this
  interoperability angle and doesn't scope it out.

Note: the pricing/quota-dimension open questions for workgraph (§11.2, §A5)
are already acknowledged by the brief's Scope §Open ("workgraph/staging
pricing dimensions") as consciously deferred — not flagged as a gap.
