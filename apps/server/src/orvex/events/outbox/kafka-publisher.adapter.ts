// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  KafkaPublishMessage,
  KafkaPublisherPort,
} from './kafka-publisher.port';

/**
 * ENG-1383 4d/❌#8 — the one Kafka adapter (one-adapter rule, CS §3e). The
 * `kafkajs` client is constructed here, at the seam, never inline in a
 * domain function. Broker list comes from env (ruling 3).
 */
@Injectable()
export class KafkaPublisherAdapter
  implements KafkaPublisherPort, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaPublisherAdapter.name);
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private connecting: Promise<Producer> | null = null;

  constructor(private readonly environmentService: EnvironmentService) {
    this.kafka = new Kafka({
      clientId: 'orvex-wiki-outbox-relay',
      brokers: this.environmentService.getKafkaBrokers(),
    });
  }

  private async getProducer(): Promise<Producer> {
    if (this.producer) return this.producer;
    if (!this.connecting) {
      this.connecting = (async () => {
        const producer = this.kafka.producer({ idempotent: true });
        await producer.connect();
        this.producer = producer;
        return producer;
      })();
    }
    return this.connecting;
  }

  async publish(message: KafkaPublishMessage): Promise<void> {
    const producer = await this.getProducer();
    await producer.send({
      topic: message.topic,
      messages: [
        {
          key: message.key,
          value: message.value,
          ...(message.headers ? { headers: message.headers } : {}),
        },
      ],
    });
  }

  /**
   * ENG-2496 AC2 — the boot-time topic-shape check's metadata read, on the
   * SAME adapter/client the relay already publishes through (❌#8 — never a
   * second inline Kafka client). Returns `null` when the broker reports the
   * topic as unknown; rethrows any other failure (the relay's own
   * try/catch logs loudly without blocking startup).
   */
  async fetchTopicPartitionCount(topic: string): Promise<number | null> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      const entry = metadata.topics.find((t) => t.name === topic);
      return entry ? entry.partitions.length : null;
    } catch (err) {
      if (
        (err as { type?: string })?.type === 'UNKNOWN_TOPIC_OR_PARTITION'
      ) {
        return null;
      }
      throw err;
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      try {
        await this.producer.disconnect();
      } catch (err) {
        this.logger.warn(`Kafka producer disconnect failed: ${err}`);
      }
    }
  }
}
