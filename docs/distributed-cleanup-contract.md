# Distributed-cleanup contract (FR-37) — `user.deleted`

Part of ENG-2497. This note is AC4's documentation half: engine-side cleanup
is **event-driven**, not a cross-service FK cascade. Once the brains
(knowledge, billing, the event service) live outside this engine, the only
cleanup channel is the durable outbox event described here — the event is
part of the GDPR-deletion guarantee, not a nicety.

## The event

| Field | Value |
| -- | -- |
| Outbox row `type` | `user.deleted` (`EVT_USER_DELETED`, `apps/server/src/orvex/events/constants/orvex-event-types.ts`) |
| Published CloudEvent `type` | `wiki.user.deleted` — a registered `purge_event` in the contracts registry (`orvex-studio-contracts` `sources/wiki.yaml`) |
| Trigger | `WorkspaceService.deleteUser` (`apps/server/src/core/workspace/services/workspace.service.ts`) — the ONE real user-removal path, `POST /api/workspace/members/delete` |
| Transactionality | The outbox row commits in the SAME database transaction as the member removal (FR-17). A rolled-back removal broadcasts nothing. |
| Payload | `{ userId, workspaceId, schemaVersion }` — identifier-only (the purge SIGNAL, never a data export). `schemaVersion` is explicit per FR-36 (`USER_DELETED_SCHEMA_VERSION`, currently `1`). |
| Transport | The standard outbox relay (`OutboxRelayService`) → Kafka topic `wiki-events.{cell}` (or `wiki-events.solo`), CloudEvents 1.0 structured mode, `orvextenant = workspaceId`, at-least-once, deduped by the row id (Kafka key = CloudEvents `id`). |

`user.deleted` is emitted **alongside** `workspace.member_deleted`
("membership changed" is not "purge this user's data") and is distinct from
the audit-log-only `AuditEvent.USER_DELETED`, which the relay never drains.

## Who deletes what off `user.deleted`

Each consumer owns deleting its OWN copy of the user's data — this engine
never reaches into an external store, and no cross-service foreign-key
cascade exists (the monolith's FK-cascade cleanup is gone; there is nothing
to cascade into once the stores are external).

| Consumer | Deletes on `wiki.user.deleted` |
| -- | -- |
| knowledge | Vectors/embeddings and index entries derived from the user's content or identity |
| billing | Seat assignment for the user; ledger/quota attribution rows keyed to the user |
| event service | Per-user stream/subscription state |

Consumers dedupe by the CloudEvents `id` (at-least-once delivery) and must
treat an unknown `schemaVersion` as an error, never a silent skip.

## `workspace.deleted` — reserved, NOT emitted

`EVT_WORKSPACE_DELETED` (`workspace.deleted`) is declared but deliberately
unwired: no whole-workspace removal flow exists in this repo, and whether
the engine ever owns that trigger (vs. reacting to an external deprovision
signal) is OPEN-4 / R-WIKI-7 — contested and unruled. Do not wire an
emission for it, and do not invent a delete-workspace route, until OPEN-4
resolves. The whole-tenant cleanup contract will be documented here when a
real trigger exists.
