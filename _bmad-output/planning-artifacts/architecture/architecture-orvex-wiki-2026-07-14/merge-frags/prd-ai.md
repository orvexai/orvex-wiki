
## Memory gap-closure — requirements (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned slice: **F2 proposal quality + F8 token-cost + F0 import**.

- **FR-X1** The Librarian MUST propose memory candidates (from the beads stream, save-this-thread, and imports) at a measurable quality bar: **proposal precision ≥ 0.75 and recall ≥ 0.60** `[ASSUMPTION baseline]` against a labeled human-judged proposal eval set, so confirming is a light touch. *Method:* a maintained golden set of sessions with human-marked "should-keep" memories.
- **FR-X2** The **beads→staging capture edge** (today flagged "not yet in canon") MUST be specified and delivered as the reliable capture path.
- **FR-X3** Proposals MUST be de-duplicated and reconciled against existing Memory before display: **≤ 5%** `[ASSUMPTION]` near-duplicate rate in surfaced proposals, measured against the confirmed Memory set.
- **FR-X6** The extraction/proposal pipeline MUST defend against **memory-poisoning / prompt-injection** carried in captured content: the human-confirm gate is the structural defense, backed by provenance capture and sensitivity screening so a malicious source cannot silently write canon. *(See FR-S6.)*
- **FR-X4** Proposal quality MUST be **continuously measured** (accept / edit / discard rates) and regressions gated.
- **FR-X5** Extraction MUST run **asynchronously off the write path** (never inline) to preserve the instant feel.
- **FR-C1** Memory injection MUST be **token-budgeted** — only the most relevant memories enter a prompt — with **≥ 50%** `[ASSUMPTION]` token reduction vs. naive full-context injection on the eval set, at no measurable loss of answer-correctness (FR-E1).
- **FR-C2** Orvex SHOULD **measure and optionally surface** the token/cost reduction its memory delivers.
- **FR-C3** User memory profiles SHOULD be **precomputed / warm-cached** to hold both latency and cost. `[ASSUMPTION]`
- **FR-O2** **Inbound import** MUST be a first-class capture path: bulk import from sanctioned ChatGPT / Claude / Gemini / Grok export files, screened by the Personal-Data Guard and routed through the propose-and-confirm gate. `[ASSUMPTION]` provider export is async/lossy (upload-archive is the only ToS-clean path); the UX MUST handle "request → come back when it lands → re-request."
