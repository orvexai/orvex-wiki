
## Memory gap-closure — owned slice (fold-in)

Per PRD `g9vWbSYplh` + spine `iiCcKhGptV` (map `vBvVDFklZo`), orvex-studio-api is the **Memory system-of-record** (`/v1/memory`, AD-1a): **F3 card schema** (FR-M1–4 — versioned, human-editable) and **F4 lifecycle** (FR-L1–5 — bi-temporal, state machine, reconcile-invalidates, retention, scoped erasure). **AD-4** — the confirm gate is the sole mutation path (create/edit/delete/reconcile via staging ChangeSets); api applies the supersede atomically on commit and never reconciles independently.
