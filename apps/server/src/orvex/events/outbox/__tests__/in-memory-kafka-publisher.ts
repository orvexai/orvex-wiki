// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import {
  KafkaPublishMessage,
  KafkaPublisherPort,
} from '../kafka-publisher.port';

/**
 * ENG-1383 4f — "in-memory/embedded broker substitute" for
 * `KafkaPublisherPort` in tests. Dedupes by `${topic}:${key}` — the outbox
 * row id is the message key, mirroring how a real idempotent-consumer /
 * dedupe-key architecture would treat a redelivered message as a no-op
 * (AC3: "Kafka receives N distinct messages ... idempotent by outbox id /
 * dedupe key"). `publishCallCount` still counts every `publish()` INVOCATION
 * (including ones that hit an existing key) so a test can assert on relay
 * behaviour separately from broker-observed distinct messages.
 */
export class InMemoryKafkaPublisher implements KafkaPublisherPort {
  private readonly messages = new Map<string, KafkaPublishMessage>();
  publishCallCount = 0;
  private failNextCount = 0;

  /**
   * ENG-2496 AC2 — the in-memory broker's topic-metadata leg. Defaults to
   * a single-partition topic (cell-contract rule #5's correct shape); a
   * test overrides `partitionCountByTopic` to simulate a mis-partitioned
   * or missing (`null`) topic. `metadataFetchCount` lets the AC5 solo test
   * assert the metadata call was NOT made.
   */
  partitionCountByTopic = new Map<string, number | null>();
  metadataFetchCount = 0;

  async fetchTopicPartitionCount(topic: string): Promise<number | null> {
    this.metadataFetchCount++;
    return this.partitionCountByTopic.has(topic)
      ? this.partitionCountByTopic.get(topic)!
      : 1;
  }

  async publish(message: KafkaPublishMessage): Promise<void> {
    this.publishCallCount++;
    if (this.failNextCount > 0) {
      this.failNextCount--;
      throw new Error('InMemoryKafkaPublisher: simulated publish failure');
    }
    this.messages.set(`${message.topic}:${message.key}`, message);
  }

  /** Make the next N publish() calls throw (simulates a relay crash mid-batch). */
  failNext(n: number): void {
    this.failNextCount = n;
  }

  getDistinctMessages(topic: string): KafkaPublishMessage[] {
    return [...this.messages.values()].filter((m) => m.topic === topic);
  }

  /**
   * ENG-2495 — topic-agnostic view for envelope-conformance assertions
   * (the topic NAME itself is ENG-2496's own concern; the golden-fixture
   * tests must not spuriously break on a topic-naming change).
   */
  getAllDistinctMessages(): KafkaPublishMessage[] {
    return [...this.messages.values()];
  }
}
