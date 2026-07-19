## 🎯 Story

As a **user**, I want **the task-first wizard interview surface — say the task in plain language, answer a short guided "do you want this?" Q&A, see live marketplace scan hits, then hand off the composed context into the Builder/Composer** so that **I can go from a raw task to a real prompt without knowing how to author one, and never hit a dead-end blank interview** (task-first wizard, Brief `rgBOQh31p3`).

**Definition of Done:** ONE named test `TestWizardInterviewToComposeHandoff` — an integration test asserting the full interview render path: task capture accepts free-text and starts the Q&A, each "do you want this?" question renders and records an answer, marketplace scan hits render as-you-answer (skeleton→hit cards, honest no-hit guidance, never blank), and Compose hands the assembled task + answers + selected hits into the Builder/Composer with no loss, verified through rendered states + the handoff payload. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2109); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given the wizard entry, When the user types a task in plain language, Then task capture accepts free-text and starts the guided Q&A (no prompt-authoring knowledge required). *Assertion: free-text task starts Q&A; no blank interview.* [Source: Brief `rgBOQh31p3` — task-first wizard prompt builder]
- [ ] **AC2** — Given the Q&A, When each "do you want this?" question renders, Then the answer is recorded and steers the next question. *Assertion: each answer persisted in wizard state; next question reflects it.* [Source: Brief `rgBOQh31p3` — guided Q&A]
- [ ] **AC3** — Given answered questions, When the marketplace scan runs, Then scan hits render as-you-answer (skeleton→hit cards) sourced from the marketplace surface. *Assertion: hits render; retrieval is the BFF's, the SPA owns perceived latency only.* [Source: Brief `rgBOQh31p3` — marketplace scan hits]
- [ ] **AC4** — Given a scan with hits selected, When the user hits Compose, Then the assembled task + answers + selected hits hand off into the Builder/Composer with no loss. *Assertion: `TestWizardInterviewToComposeHandoff` — handoff payload complete; Composer receives it.* [Source: Brief `rgBOQh31p3` — compose handoff into Builder/Composer]
- [ ] **AC5 (error)** — Given a scan that returns no hits, When it settles, Then guidance + a compose-from-scratch path render — never a blank screen. *Assertion: no-hit path shows guidance; Compose still reachable.* [Source: Brief `rgBOQh31p3`; honest-states house rule]
- [ ] **AC6 (seam)** — Given the ai wizard AI-assist backend is unavailable, When the wizard runs, Then the interview degrades honestly (surfaces the unsupported state, never fabricates Q&A/hits). *Assertion: backend-down renders honest unsupported state, no fabricated content.* [Source: Brief `rgBOQh31p3` — ai carries the AI-assist backend]

## 🔨 Tasks

- [ ] RED: `TestWizardInterviewToComposeHandoff` (AC1/AC4). *(AC1, AC4)*
- [ ] GREEN: task-capture entry (AC1); guided Q&A state machine (AC2); marketplace scan-hits pane over the BFF (AC3); Compose handoff into Builder/Composer (AC4); no-hit guidance (AC5); honest backend-down degrade (AC6). *(AC1–AC6)*

## 🧠 Context

The interview front-end for the task-first wizard: the user says the task, the wizard runs a guided Q&A and a live marketplace scan, then composes into the Base+Delta Builder (E4-S3). React-front only (CS §6 — the AI-assist reasoning is the ai backend's; the SPA owns capture, sequencing, and perceived latency). Seam: ai "Wizard task-first prompt-builder AI-assist backend" (Q&A/scan reasoning) + the BFF/marketplace search surface (E4-S1) for hits. Compose target: E4-S3 Builder/Composer.

**🧾 Gap provenance (2026-07-14):** This story was filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed: the wizard was decomposed as a single AI-assist feature and its AI half landed on `ai`, so the decomposition treated the whole wizard as owned — but the user-facing interview surface (task capture → Q&A → scan → compose handoff) was never storied on `ui`; the census-brief confirmed the UI half unowned. This is the missing rendering half, not a rebuild of the ai backend.

## 🧪 Testing

`TestWizardInterviewToComposeHandoff` (integration) + unit tests on the Q&A state machine + the handoff payload assembler. CS §5 mocking: ai AI-assist + BFF scan fixtures; never mock the own Q&A state machine or the compose handoff.

## 📏 Guidance

- CS `6aMAzsYeQb`: §6 shallow view (no client-side AI reasoning) · §11 honest (no blank interview, honest backend-down) · §3 naming · §5 fixture the seams.
- SE-Arch `8sYi523i4t`: honesty lens (no fabricated Q&A/hits); no-data-loss lens (compose handoff is lossless).
- Cell-lint `JGAUQRsw2g`: N/A runtime.

## 🔗 References

Brief `rgBOQh31p3` (task-first wizard prompt builder — headline feature) · PRD `xsRMrju3D1` · sibling `ai` Wizard task-first prompt-builder AI-assist backend · E4-S1 (marketplace search) · E4-S3 (Builder/Composer).

## 🔗 Dependencies

- [ ] **Blocked by:** ENG-2109 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] **Project / milestone:** Orvex Studio UI · B6 — Phase-2 curation surfaces (Demo World, Import, Chat History, Curator).
- [ ] **Cross-service seam:** the `ai` Wizard task-first prompt-builder AI-assist backend (Q&A/scan reasoning) must expose its contract at pack certification; the BFF/marketplace search surface (E4-S1) supplies scan hits.
- [ ] **Intra-service order:** after E4-S1 (search) and E4-S3 (Builder/Composer) — the wizard scans the former and composes into the latter.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
