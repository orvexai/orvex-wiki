
## Memory gap-closure — architecture decisions (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned decisions: **AD-10 (AD-1 boundary already merged)**.

**AD-10 — Memory AI-cost rides the inherited budget spine.** *Binds:* how memory compute is capped. *Prevents:* bulk capture exhausting a user's AI allowance. *Rule:* memory LLM calls use `ai`'s per-caller scoped LiteLLM keys+budgets over the per-tenant `max_budget` (D-S5); **extraction/embedding runs on a separate nested budget** sized from the page quota (D-S15). Token-budgeted injection (F8) is an invariant; measurement specifics deferred. `[ADOPTED]`
