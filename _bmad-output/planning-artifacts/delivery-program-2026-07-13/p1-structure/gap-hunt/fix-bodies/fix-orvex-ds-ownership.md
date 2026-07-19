## 🎯 Decision

As the **program PO**, I must **rule where the `orvex-ds` design system (the `orvex-ds.css` token layer — light+dark, dual-skin, exact-match fidelity) lives, who versions it, and how satellites consume it** so that **a first-class shippable dependency of `ui` stops being an ownerless artifact referenced by canon but owned by no repo/space/project**.

This is a **must-resolve decision issue, not a build story.** Canon (A-DS) treats `orvex-ds` as a ship-gate dependency of `ui`, and the rewrite-same-stack ruling makes the tokens the Tailwind styling contract — yet `orvex-ds` has no owning repo, space, or program project. Standing up a component unilaterally is explicitly out of scope.

**Definition of Done:** the ruling is **recorded** (a decision-record in po-decisions with the chosen option, versioning owner, and satellite-consumption mechanism) **and ratified by pack review (ENG-2109)**. There is no `Test<Name>` — the deliverable is a ratified decision, not code. *This issue is carried by pack certification (ENG-2109); no downstream `ui` DS-consumption story dispatches until the ownership home is ruled.*

## ✅ The question

**Where does `orvex-ds` live, who versions it, and how do satellites consume it?**

Three coupled sub-questions must all be answered by the ruling:
1. **Home** — fold into `orvex-studio-ui` (a subpackage/dir inside the UI repo) **vs** stand up an 18th first-class component (own repo/space/project) that `ui` and satellites depend on.
2. **Versioning owner** — who cuts `orvex-ds` versions and on what cadence (UI-owned inline vs independent component release train).
3. **Consumption** — how satellites pull the tokens (vendored `orvex-ds.css` inside `ui` vs a published, version-pinned artifact every satellite consumes).

## ⚖️ Options

- **Option A — Fold into `orvex-studio-ui`.** `orvex-ds.css` ships as a dir/subpackage inside the UI repo; UI owns versioning; satellites that need tokens vendor or import from UI. *Pro:* zero new infra, matches today's audited reality (tokens already live in `ui`). *Con:* couples every token consumer to the UI release train; a satellite pulling tokens pulls a front-end repo.
- **Option B — Separate 18th component.** `orvex-ds` gets its own repo/space/project with an independent release train; `ui` and satellites depend on a version-pinned published artifact. *Pro:* clean ownership, satellite-friendly, honest first-class dependency. *Con:* new repo/space/project + release plumbing; one more thing to maintain and gate.

## 🔎 Evidence

- [ ] *Audit fact:* `orvex-ds.css` + the dual-theme/dual-skin token substrate already exist and are unit-tested **inside `ui`** (per E1-S3 audit: `src/lib/theme.ts`, `skin.ts`, `index.html`). Today's default-state is effectively Option A. [Source: A-DS, NFR-UI3]
- [ ] *Canon fact:* A-DS treats the DS as a ship-gate dependency and the rewrite-same-stack ruling makes tokens the Tailwind styling contract — so ownership is load-bearing, not cosmetic. [Source: Architecture `DmJsnB5Z9Y` §2 (A-DS)]
- [ ] *Consumer fact:* the token-fidelity lint (E1-S1) and every surface's look-good bar depend on a single source of DS truth; a fork/drift between UI-vendored and satellite-vendored copies would break exact-match fidelity. [Source: NFR-UI3, DS `C9ufBCuXsy` / tokens `j8ZO0NAB2A`]
- [ ] *No-fallback fact:* per program stance, no silent baked-in default — the home must be an explicit ruling, not "wherever the file happens to sit today." [Source: A-DS]

## ✅ Decision record (PO decides; pack review carries it)

- [ ] **DR1 — Home ruled:** Option A (fold into `orvex-studio-ui`) **or** Option B (separate 18th component) is selected and written to po-decisions with rationale.
- [ ] **DR2 — Versioning owner named:** the ruling names who cuts `orvex-ds` versions and the cadence.
- [ ] **DR3 — Consumption mechanism named:** the ruling states exactly how `ui` and satellites consume the tokens (vendored vs version-pinned artifact) with the fidelity guarantee that prevents drift.
- [ ] **DR4 — Downstream impact captured:** if Option B, the follow-on to stand up the repo/space/project is filed; if Option A, the "no 18th component" note is recorded so no agent stands one up unilaterally.
- [ ] **DR5 — Ratified:** pack review (ENG-2109) ratifies the decision-record and links it from the pack certification.

## 🧠 Context

Ownership layer, not code (CS §6 view boundary is irrelevant here — nothing renders from this issue). The `orvex-ds` DS is visual truth for every surface (DS `C9ufBCuXsy` / tokens `j8ZO0NAB2A`); leaving it ownerless means no one is accountable for its version, its drift, or its satellite fan-out.

**🧾 Gap provenance (2026-07-14):** this issue was filed by the post-decomposition gap-hunt (adversarially verified). **Why it was missed:** decomposition scoped `ui` as a single repo and treated `orvex-ds.css` as an internal file of that repo, so the census never asked whether a canon-declared first-class *dependency* needs its own owner/version/consumption contract — the ownership question fell between the `ui` epic and the component census. This is a **must-resolve decision**, so there is no code to audit; the deliverable is a ratified ruling.

## 🧪 Testing

None — the DoD is a ratified decision-record, not a test. Verification is procedural: the po-decisions entry exists with DR1–DR4 answered, and pack review (ENG-2109) has ratified it (DR5). Any resulting build work (e.g. standing up the component under Option B) is a *separate* story with its own `Test<Name>`.

## 📏 Guidance

- CS `6aMAzsYeQb`: §0 adversarial-review gate (the ruling must survive review) · §11 honest states (no baked default masquerading as a decision) · no-fallback stance (explicit ownership, not "wherever it sits today").
- SE-Arch `8sYi523i4t`: ownership lens — a first-class dependency with no owner is a latent drift source; the review carries this decision, it is not self-ratified.

## 🔗 References

Architecture `DmJsnB5Z9Y` §2 (A-DS) · PRD `xsRMrju3D1` (NFR-UI3) · DS `C9ufBCuXsy` / tokens `j8ZO0NAB2A` · cell contract `JGAUQRsw2g` · sibling substrate story E1-S3 (current audited home of `orvex-ds.css`).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — pack review is the body that carries and ratifies this ruling).
- [ ] **Project:** Orvex Studio UI.
- [ ] **Milestone:** B1 — Foundation, tooling & shared rendering substrate.
- [ ] **Must-resolve before:** any `ui` DS-consumption or satellite token-consumption story dispatches — those inherit the home/versioning/consumption contract this issue rules.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ author) → TICK → DONE (orchestrator-only) → ESCALATE.
