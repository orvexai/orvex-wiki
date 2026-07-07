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
}
