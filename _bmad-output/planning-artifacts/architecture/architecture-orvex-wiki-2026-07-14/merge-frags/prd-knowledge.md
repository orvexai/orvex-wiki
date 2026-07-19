
## Memory gap-closure — requirements (fold-in)

> Source of record: PRD `g9vWbSYplh` + Architecture Spine `iiCcKhGptV` + Fold-in Map `vBvVDFklZo`. Merged verbatim (no loss). Owned slice: **F5 retrieval quality & evaluation**.

- **FR-E1** An **offline eval harness** MUST measure memory retrieval quality on representative task sets, reporting **recall@10 and answer-correctness** with a committed baseline (see Success Metrics: recall@10 ≥ 0.80 `[ASSUMPTION]`) — a number Orvex can stand behind.
- **FR-E2** Orvex SHOULD track a **public-comparable benchmark** (LongMemEval / LoCoMo-style) for external credibility. `[ASSUMPTION]` benchmark selection in OQ4.
- **FR-E3** Retrieval changes MUST pass a **regression gate** before ship.
- **FR-E4** The raw kept-content store (wiki) MUST remain **searchable alongside** distilled Memory — honoring the industry ablation that verbatim retrieval beats extracted-fact memory for long-context QA.
