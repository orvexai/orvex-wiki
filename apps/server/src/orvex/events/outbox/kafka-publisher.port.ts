// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
/**
 * ENG-1383 4d — the justified network seam: `Service ↔ Kafka (studio-spine)`.
 * The port is deliberately minimal (one method) — the relay is the only
 * caller, and it needs nothing more than "publish this message, tell me if
 * it failed". Topic/partition/CloudEvent-envelope shaping belongs to the
 * separate catalog leg; this port carries a bare typed message.
 */
export interface KafkaPublishMessage {
  /** Kafka topic. */
  topic: string;
  /** Dedupe/idempotency key — the outbox row id. */
  key: string;
  /** Serialized message value (JSON string). */
  value: string;
}

export const KAFKA_PUBLISHER_PORT = Symbol('KAFKA_PUBLISHER_PORT');

export interface KafkaPublisherPort {
  publish(message: KafkaPublishMessage): Promise<void>;
}
