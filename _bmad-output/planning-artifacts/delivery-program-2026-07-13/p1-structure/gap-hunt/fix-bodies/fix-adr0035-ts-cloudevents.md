## 🎯 Story
As the api event consumer and the mcp revocation consumer (closed TS satellites), I want the **second codegen toolchain** — TS CloudEvent envelope type + one TS payload type per event type generated from `events/schemas/*.json` via `json-schema-to-typescript`, plus `ajv` runtime validators — so that TS consumers get typed, runtime-validated events off the JSON-Schema surface, generated and shipped NOW, without hand-writing shapes and without waiting on the unshipped orvex-studio-lib TS Kafka binding.

**Definition of Done:** ONE named test `TestEventCodegenMatchesSchemas` — a CI-layer test asserting, through the codegen tooling, that `json-schema-to-typescript` emits exactly one exported TS payload type per `events/schemas/*.json` plus one generic CloudEvent envelope type, that the generated `ajv` validator REJECTS an event omitting required `version`, and that a second offline run is byte-identical to the first. *Final H1–H17 elaboration + exact contract tag/versions are pinned at pack certification (ENG-2091); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria
- [ ] **AC1** — Given `events/schemas/*.json`, When the TS event codegen runs, Then `json-schema-to-typescript` emits exactly one exported TS payload type per schema file. *Assert: TS-payload-type count == `events/schemas/` file count; every type resolves* [Source: ADR-0035 §1].
- [ ] **AC2** — Given the CloudEvents envelope, When codegen runs, Then a single generic envelope type (`CloudEvent<T>`) carrying the FR-C8 obligation attributes (tenant extension, `version`, ordering-key binding) is generated and each payload type parameterizes it. *Assert: envelope type present; every payload type parameterizes `CloudEvent<T>`* [Source: ADR-0035 §1, FR-C8].
- [ ] **AC3** — Given a generated `ajv` validator, When an event omitting required `version` is validated (negative path), Then validation fails red. *Assert: `ajv` rejects the missing-`version` event; accepts a well-formed one* [Source: ADR-0035 §1, FR-C9].
- [ ] **AC4** — Given the toolchain, When it runs, Then it is the JSON-Schema toolchain (`json-schema-to-typescript` + `ajv`), DISTINCT from the REST `openapi-typescript`+`openapi-fetch` toolchain — no OpenAPI TS generator emits event types. *Assert: event types sourced only from `events/schemas/`, never from `openapi/`* [Source: ADR-0035 §6, A-CODEGEN].
- [ ] **AC5** — Given the orvex-studio-lib TS Kafka binding is unshipped (negative path), When this codegen lands, Then it does NOT depend on it — types + validators generate and ship now. *Assert: no import/reference to orvex-studio-lib in the generated output or the toolchain config* [Source: ADR-0035 §6].
- [ ] **AC6** — Given the codegen, When run twice offline, Then output is byte-identical. *Assert: `sha256(run1) == sha256(run2)`, no network syscalls* [Source: NFR-C2].

## 🔨 Tasks
- [ ] RED: `TestEventCodegenMatchesSchemas` over `events/schemas/*.json` — fails until the toolchain + generated output exist (AC1, AC3, AC6).
- [ ] GREEN: wire the `json-schema-to-typescript` generator (envelope `CloudEvent<T>` + one payload type per schema) as a make/CI target distinct from the REST codegen (AC1, AC2, AC4).
- [ ] GREEN: emit the `ajv` runtime validators; assert the FR-C8 attributes + `version`-required behaviour (AC2, AC3).
- [ ] RED: negative paths — missing-`version` validation fails; no orvex-studio-lib dependency; no event type from `openapi/` (AC3, AC4, AC5).

## 🧠 Context
Expected tier placement: **none — CS §6 non-service repo**; the analogue is the closed TS satellites' event-consumption code (api event consumer, mcp revocation consumer) that today hand-write these shapes. Seam crossed: `events/schemas/` → every TS event consumer. Sibling deps: generates FROM E3-S4 (per-type JSON schemas) + honours E3-S3 (publisher-obligations header); it is the event-side counterpart of the REST `openapi-typescript` client codegen (E1-S4 consumption unit).

**🧾 Gap provenance (2026-07-14):** Filed by the post-decomposition gap-hunt (adversarially verified). Why it was missed: every existing codegen story/pack AC scoped TS generation to the OpenAPI/REST toolchain (`openapi-typescript`+`openapi-fetch`) only, so the JSON-Schema TS toolchain (`json-schema-to-typescript` + `ajv`) named verbatim by ADR-0035 §1/§6 was owned by no story — a whole second codegen toolchain fell through the seam between the REST-client stories and the event-schema stories.

## 🧪 Testing
Named DoD test `TestEventCodegenMatchesSchemas` (CI/codegen layer). CS §5 mocking: none — real JSON-Schema → TS generation + real `ajv` validation over golden event fixtures; never mock own contract packages. Deterministic, offline (NFR-C2/C5).

## 📏 Guidance
CS 6aMAzsYeQb §0, §5 (gates — codegen is a gated artifact), §11 (honesty — generate now, do not stub against the unshipped Kafka binding), §12 (contract-shape law — the required `version`); SE-Arch 8sYi523i4t reliability lens (fail-closed validators) + honesty lens (second toolchain not silently folded into the REST one); cell-lint JGAUQRsw2g. §6 tiers N/A.

## 🔗 References
- ADR-0035 (QbEBPuKcGR, Accepted) §1 (generation), §6 (lands now, independent of the TS Kafka binding)
- PRD (jwF4VLHfNs) FR-C8, FR-C9, NFR-C2; Architecture (o2waDNw3ix) A-CODEGEN, A-CATALOG; SE-Arch review (nngOgO0CGO) T4
- E3-S4 (per-type event schemas — the codegen input), E3-S3 (publisher-obligations header)

## 🔗 Dependencies
- [ ] Blocked by: ENG-2091 (Definition Pack — the contract TAG is the dispatch gate).
- [ ] Project: Orvex Studio Contracts · Milestone: B3 — Event catalog, envelope profiles & SSE wire contract.
- [ ] Depends on: E3-S4 (JSON schemas to generate from), E3-S3 (obligations header); parallels E1-S4 (REST consumption unit). Feeds: api event consumption + mcp revocation consumer (the two TS consumers ADR-0035 §6 names).

## 📡 Protocol
CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-2091", never `closes`) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE if the built relay/publisher output cannot satisfy the generated `ajv` validators (contract-revision moment, A-CODEGEN).
