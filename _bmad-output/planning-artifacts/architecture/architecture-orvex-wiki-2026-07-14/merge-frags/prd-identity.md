
## Memory gap-closure — requirements (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned slice: **F6 security & compliance**.

- **FR-S1** Orvex MUST offer **BYOK** (customer-managed encryption keys) for Memory + wiki content, at least for Teams / regulated users.
- **FR-S2** Orvex MUST have a path to **SOC 2 Type II** and **HIPAA (BAA)**.
- **FR-S3** A **self-host / BYOC** option MUST be available for data-residency/air-gap needs. `[ASSUMPTION]` aligns with the Turbopuffer BYOC-per-cell posture.
- **FR-S4** Per-user/tenant isolation MUST hold at the memory-corpus level; the attribute-vs-namespace isolation grade (open in R-9, OQ2) MUST resolve to the **stronger wall for regulated tenants**.
- **FR-S5** The personal↔employer **firewall and per-use consent** MUST be enforced end-to-end — capture, storage, retrieval, delivery, and sync-out.
- **FR-S6** The memory pipeline MUST resist **memory-poisoning and stored prompt-injection**: no captured content becomes canon without passing the human-confirm gate; provenance and sensitivity are recorded per memory; and injected/retrieved memory is treated as untrusted data, not instructions.
