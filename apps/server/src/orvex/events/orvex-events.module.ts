import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { OutboxRelayService } from './outbox/outbox-relay.service';
import { KafkaPublisherAdapter } from './outbox/kafka-publisher.adapter';
import { KAFKA_PUBLISHER_PORT } from './outbox/kafka-publisher.port';
import { OrvexEventBusService } from './services/orvex-event-bus.service';

/**
 * ENG-1383 — the outbox deep module. `OutboxWriter` itself is registered
 * globally by `DatabaseModule` (so any repo/service can enqueue in its own
 * transaction without importing this module) and is injected here, not
 * re-provided. `KAFKA_PUBLISHER_PORT` is bound to the real kafkajs adapter
 * here; tests override this provider with an in-memory/embedded broker
 * substitute (4f mocking strategy) rather than mocking
 * `OutboxWriter`/`OutboxRelayService` themselves (❌#4).
 */
@Module({
  imports: [EnvironmentModule],
  providers: [
    OutboxRelayService,
    OrvexEventBusService,
    { provide: KAFKA_PUBLISHER_PORT, useClass: KafkaPublisherAdapter },
  ],
  exports: [OutboxRelayService],
})
export class OrvexEventsModule {}
