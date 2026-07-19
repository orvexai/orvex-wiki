# Recheck: orvexstudioarch vs brief-orvex-studio-2026-07-13

Scope: product-level concepts/features/behaviors/pricing/persona/scope rulings in
`orvexstudioarch` not covered and not consciously excluded by the brief. Engineering
minutiae (contracts, gates, tiers, service topology, build-state) excluded per
instructions — already covered by a prior sweep.

## Candidate gaps

- **Page:** PRD: Agent Staging Area (`MyS79tK0k7`) / PRD: Workgraph (`HTExyRFHhs`)
  **Missed concept:** The staging/workgraph PRDs define distinct **admin/operator
  personas with materially different JTBD** — knowledge managers/curators clearing
  a review queue, customer admins tuning the per-space Autonomy Dial, and agent
  fleet operators watching the console fleet view — not just "the same UI at a
  different scale."
  **Quote:** "Knowledge managers / curators (customer humans): 'let me review a
  morning's worth of agent proposals in minutes, not per-page archaeology; show me
  diffs, not dumps.'" / "Orvex operators: 'agent write bursts must never degrade
  the wiki product or other tenants.'"
  **Why it matters:** The brief's "Who This Serves" section is entirely
  consumer-persona (teacher/marketer/SMB owner) and treats business/enterprise as
  only "UI + entitlements" variants of the same consumer product; it never
  acknowledges that the admin/curator/operator role is a first-class JTBD with its
  own bulk-review, dial-tuning, and fleet-dashboard workflows — a materially
  different product surface than "your AI finally knows you," and a gap the brief
  neither states nor excludes.

- **Page:** PRD: Workgraph — cross-agent coordination service (`HTExyRFHhs`), §4.7
  FR-MEM27
  **Missed concept:** A concrete outbound-sync mechanism — a **Claude
  memory-tool backend adapter** serving Anthropic's native `/memories` file
  protocol from the workgraph store — is v1 scope, paired with an explicit,
  load-bearing **platform-blocked caveat**: no equivalent ChatGPT-native memory
  bridge is possible because OpenAI exposes no memory API/MCP surface.
  **Quote:** "FR-MEM27: Claude memory-tool backend... (A ChatGPT-native-memory
  bridge is **platform-blocked** — OpenAI exposes no memory API/MCP surface;
  recorded as an external constraint, not an Orvex deferral.)"
  **Why it matters:** The brief's outbound-sync promise ("Orvex syncs your Memory
  to the native memories of the chat systems you use") is stated as a general
  capability with no caveat; the concrete mechanism and — more importantly — the
  hard platform limitation that the flagship "ChatGPT" case cannot be natively
  synced is a scope-defining fact the brief should either state or consciously
  scope out, not silently omit, since it directly qualifies a headline claim.

- **Page:** PRD: Workgraph (`HTExyRFHhs`), §4.4 FR-MEM16 / addendum A5
  **Missed concept:** An **MCP knowledge-graph interop adapter** (read+write)
  compatible with the de-facto `modelcontextprotocol/servers` memory reference
  shape, letting third-party MCP hosts/tools ground on — and write into — a
  user's Orvex workgraph without going through Orvex's own surfaces.
  **Quote:** "FR-MEM16: Interop adapter (read + write)... so hosts/tools expecting
  the de-facto baseline can ground against — and write into — the Orvex
  workgraph... v1 per PO decision (2026-07-10)."
  **Why it matters:** This is a distinctive "un-lock-in" positioning capability
  (any MCP-compliant tool can plug into Orvex's context store, not just
  Orvex-composed prompts) that reinforces the brief's own north star but is
  wholly absent from the brief's knowledge-loop or outbound-sync narrative —
  worth an explicit include-or-exclude call.

No other candidates survived: pricing figures (Free/£7/Teams/hidden-Enterprise),
tier mechanics, and the persona-wedge ruling all already appear in the brief
consistent with canon; engineering/delivery-state pages (Architecture &
Principles, Deployment Status, Foundation Rollup, Questions for Daniel, Index)
were checked but contain no unaddressed product-level content beyond the above.
