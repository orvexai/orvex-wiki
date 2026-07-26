# Vendored contracts golden fixtures (ENG-2495)

Hermetic, committed copies of the `orvexai/orvex-studio-contracts` (Apache-2.0)
golden fixtures this repo's relay conformance tests compare against. Vendored
as TEST FIXTURES only — never imported by production code (the AGPL engine
builds its CloudEvent envelope with its OWN TypeScript in
`outbox-relay.service.ts`; importing a contracts helper across the license
boundary is forbidden, A-SEAMS / A-CELL rule #2).

Provenance (single source of truth is the contracts repo — on drift, the
contracts repo wins and these copies are refreshed, never edited one-sided):

| File | Source (orvex-studio-contracts) | Commit | Method |
| -- | -- | -- | -- |
| `_envelope.json` | `events/schemas/_envelope.json` | `be4d2b1da583155a6dc2cce8a7fc7d974dbbd330` | verbatim copy |
| `wiki-source-registry.json` | `sources/wiki.yaml` | `be4d2b1da583155a6dc2cce8a7fc7d974dbbd330` | YAML→JSON transcription (field-for-field: `source_id`, `event_types[].type`, `purge_events`) |

Refresh rule: re-copy/re-transcribe from a pinned contracts commit and update
this table. If a conformance test starts failing because the relay and the
contracts fixture disagree, that is a cross-repo reconciliation decision
(escalate per ENG-2495 §9) — do NOT silently edit either side.
