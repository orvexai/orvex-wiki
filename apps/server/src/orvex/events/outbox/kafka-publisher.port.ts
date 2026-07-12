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
  /**
   * ENG-1559 M5 AC8 — optional Kafka record headers. Carries the CloudEvents
   * Kafka Protocol Binding structured-mode marker
   * (`content-type: application/cloudevents+json`, matching orvex-studio-lib
   * `pkg/events.BrokerPublisher`'s own precedent) so a downstream bridge
   * that DOES speak Knative KafkaSource still recognises the record as a
   * real CloudEvent; the direct Kafka consumer this repo's own satellites
   * use (segmentio/kafka-go `ParseEnvelope`) reads the JSON body directly
   * and does not require it. Omitted entirely when unset (undefined, never
   * an empty object) — the adapter only sends a `headers` array when this is
   * present.
   */
  headers?: Record<string, string>;
}

export const KAFKA_PUBLISHER_PORT = Symbol('KAFKA_PUBLISHER_PORT');

export interface KafkaPublisherPort {
  publish(message: KafkaPublishMessage): Promise<void>;
}
