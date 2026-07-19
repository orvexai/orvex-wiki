## 🎯 Story

As the **workflows event-ingest plane**, I want to **migrate the namespace-local `default` Knative Broker (in `studio-clerk-webhook-dev`) onto the shared `studio-spine` Broker (in `studio-events`), give all five Triggers a `spec.delivery` retry/backoff + `deadLetterSink` DLQ with DLQ-depth alerting, and route events onto `orvexcell`-stamped, cell-suffixed `{domain}-events.{cell}` topics**, so that a poison or transiently-failing CloudEvent lands in a DLQ of record instead of silently redelivering forever, and the service joins the family spine as a Kafka-first launch prerequisite (D-S13) rather than an isolated per-namespace bus.

**Definition of Done:** `TestTriggersOnSharedSpineWithDlqAndCellTopics` (integration / manifest-conformance) — `kubectl kustomize` renders the Broker as the shared `studio-spine` in `studio-events`; each of the five Triggers carries `spec.delivery` (retry/backoff) + a `deadLetterSink`; a DLQ-depth alert rule is present and fires on nonzero depth; and published events carry the `orvexcell` extension on cell-suffixed `{domain}-events.{cell}` topics.
*Final topic-schema + retry parameters are pinned at pack certification (ENG-2107); this story is dispatch-blocked until that tag exists. Topic-schema / event-taxonomy change ⇒ ADR + contracts.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given the rendered deploy manifests, When built, Then the Broker is the **shared `studio-spine` in namespace `studio-events`** — not the namespace-local `default` Broker in `studio-clerk-webhook-dev`. *assert: `kubectl kustomize` renders the Trigger `broker` ref = `studio-spine`/`studio-events`.* [Source: 7LGGFR5tGE F-BROKER]
- [ ] **AC2** — Given the five Triggers, When rendered, Then **each** carries `spec.delivery` (retry/backoff) **and** a `deadLetterSink` DLQ. *assert: all 5 Triggers have `spec.delivery.deadLetterSink` + retry; zero Triggers are DLQ-less.* [Source: 7LGGFR5tGE F-BROKER; FR-W6]
- [ ] **AC3** — Given the DLQ, When dead-lettered events accumulate, Then a **DLQ-depth alert** fires. *assert: an alert rule on DLQ depth exists and triggers on nonzero depth.* [Source: 7LGGFR5tGE F-BROKER]
- [ ] **AC4** — Given event publication, When an event is emitted, Then it rides a **cell-suffixed `{domain}-events.{cell}` topic** and carries the **`orvexcell`** extension (not a broker-default topic). *assert: topic name matches `{domain}-events.{cell}`; the published CloudEvent carries `orvexcell`.* [Source: 7LGGFR5tGE F-BROKER; F-CELL]

## 🔨 Tasks

- [ ] RED: `TestTriggersOnSharedSpineWithDlqAndCellTopics` (AC1, AC2, AC4).
- [ ] GREEN: re-point Broker/Triggers from the namespace-local `default` (`studio-clerk-webhook-dev`) to shared `studio-spine` (`studio-events`) (AC1).
- [ ] GREEN: add `spec.delivery` retry/backoff + `deadLetterSink` to all five Triggers + a DLQ-depth alert (AC2, AC3).
- [ ] GREEN: cell-suffixed `{domain}-events.{cell}` topics + `orvexcell` stamping on publish (AC4).

## 🧠 Context

**🧾 Gap provenance (2026-07-15):** traceability-matrix sweep (225 canon pages, id-level join). F-BROKER surfaced uncovered: the audit's fixed-in-draft disposition (A-W7 + §4 Trigger hardening + §5) makes the studio-spine migration a Kafka-first launch prerequisite (D-S13), but no story bound the **broker/namespace migration + cell-suffixed topics** to the corpus.

The **DLQ/retry reliability half** (AC2/AC3) overlaps the delivery-hardening epic's Trigger work (E3-S3, FR-W6/NFR-W7) and the `orvexcell` stamping (AC4) overlaps the cell-contract work (E4-S2, F-CELL); the **distinct, uncovered delta** this ticket owns is the Broker/namespace migration off the namespace-local `default` onto shared `studio-spine`/`studio-events` with cell-suffixed topics. The overlapping DLQ + orvexcell ACs are included for a self-contained fix but flagged as a **pack-review must-resolve** so the shared work is single-owned. Tier: deploy manifests (`knative-broker.yaml`, `trigger.yaml`) + `events.PublishData`.

## 🧪 Testing

`TestTriggersOnSharedSpineWithDlqAndCellTopics` (integration / manifest-conformance via `kubectl kustomize` + an `events` publish round-trip). CS §5: assert against the real rendered manifests + a real publish, not a hand-written fixture.

## 📏 Guidance

CS `6aMAzsYeQb` §§0/10/11 (event non-conflation; config-as-code; honesty). SE-Arch `8sYi523i4t`: Reliability (DLQ-as-record, no silent redelivery loop), Security/data-residency (cell-suffixed topics + `orvexcell`). cell-lint `JGAUQRsw2g` (rules 6, 11).

## 🔗 References

Architecture Audit — SE-Arch review `7LGGFR5tGE` — **F-BROKER** (namespace-local `default` Broker → shared `studio-spine`; five Triggers with no `spec.delivery`/`deadLetterSink`; broker-default topics not `{domain}-events.{cell}`; fixed-in-draft as a Kafka-first launch prerequisite, D-S13). Ties **F-CELL** (`orvexcell` stamping) and **F-DEDUP**.

## 🔗 Dependencies

Blocked by: **ENG-2107** (workflows pack — topic-schema + retry contract). Project **Orvex Studio Workflows**, milestone **B3 — Retry taxonomy & delivery hardening (G2 loss-window fixes)**. Pack-review must-resolve: reconcile the shared DLQ (E3-S3) + `orvexcell` (E4-S2) ownership so the overlapping ACs are single-owned.

## 📡 Protocol

CLAIM → PLAN → PROGRESS → COMMITS ("Part of ENG-NNN", never closes) → HANDOFF → REVIEW (reviewer ≠ implementer) → TICK → DONE (orchestrator-only) → ESCALATE.
