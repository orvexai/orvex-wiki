# Recheck: orvexstudioworkflows vs Product Brief: Orvex Studio

Scope: pages read — INDEX.md, `PRD: orvex-studio-workflows` (4IF3xjIdAs), `Architecture: orvex-studio-workflows` (JiIyp0RLLJ), `Architecture Audit — SE-Arch review` (7LGGFR5tGE). Skipped `G1SoUl6FDe` (archived table round-trip test artifact, no product content) and `.docmost-*.json`. Prior sweep already covers this space's service mandate/contracts/delivery state — not repeated here. Filtering applied: this space is overwhelmingly engineering/architecture (Temporal topology, retry classes, CE contracts, cell posture) — correctly out of brief scope; only product-facing concepts are flagged below.

## Candidate gaps

- **Page:** PRD: orvex-studio-workflows (4IF3xjIdAs), FR-W13 / D-S17
  **Missed concept:** the personal→Teams "upgrade pass" — a named, user-facing product transition where a solo (user-keyed, no-Clerk-org) tenant converts to a Team by minting a real org, re-keying the tenant in place, and carrying all data + entitlements across, with an explicit access-transition guarantee that new team members do NOT retroactively gain access to the user's pre-conversion private content.
  **Quote:** "a personal user has no Clerk org, so the upgrade mints the Clerk org at upgrade, re-keys the user-keyed tenant to the org in place... new members must NOT retroactively gain pre-conversion private content"
  **Why it matters:** this is a concrete product/packaging feature (how a single-player user becomes a paying team) that sits squarely in the brief's "three-surface arc" (consumer → business/teams → enterprise) but the brief never describes the upgrade mechanism, the data-carries-over promise, or the privacy guarantee on conversion — it is neither included nor consciously excluded.

- **Page:** PRD: orvex-studio-workflows (4IF3xjIdAs), FR-W18
  **Missed concept:** concrete Free-tier packaging caps are already locked as product decisions: 200 pages / 1 GiB / 10 MB per file / 2,000 files / 25 members / history retention min(10, 180 days).
  **Quote:** "carrying the locked Free caps: 200 pages / 1 GiB / 10 MB-file / 2,000 files / 25 members / history min(10,180d)"
  **Why it matters:** the brief discusses the free-tier *cost doctrine* (no frontier models, cheap models only) and the £5–7 price point, but omits these already-decided concrete packaging limits — a reader of the brief would not know the Free tier has locked quantitative limits at all, let alone their values; this is packaging detail at the same altitude the brief already operates at (it names specific price points), so the omission is inconsistent rather than a deliberate abstraction choice.

- **Page:** PRD: orvex-studio-workflows (4IF3xjIdAs), D-S17 / non-goals
  **Missed concept:** polymorphic tenancy is a product-level identity model, not just infra — a solo user is provisioned with *no* organization at all (a "user-keyed tenant"), distinct from a Team which is always a real org; this determines what a user experiences as an individual account vs. a team account from day one.
  **Quote:** "a solo user gets NO Clerk org: a personal signup is provisioned as a user-keyed tenant... with a full wiki workspace + entitlements... org provisioning is Teams-only"
  **Why it matters:** the brief's "three-surface arc" asserts business/teams and enterprise differ from consumer mainly in UI and entitlements, but doesn't surface that the underlying account model itself bifurcates (no-org vs org) at signup — a persona/packaging detail relevant to how the free-forever individual tier is actually structured.

No other product-level material found in this space: the rest of the PRD/architecture/audit content (Temporal topology, retry taxonomies, CloudEvent contracts, cell posture, CI/build-state honesty, rename/namespace debt) is engineering/program detail below the brief's altitude and correctly not restated there.
