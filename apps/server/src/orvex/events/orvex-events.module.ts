// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { OrvexConfigModule } from '../config/orvex-config.module';
import { OutboxRelayService } from './outbox/outbox-relay.service';
import { KafkaPublisherAdapter } from './outbox/kafka-publisher.adapter';
import { KAFKA_PUBLISHER_PORT } from './outbox/kafka-publisher.port';

/**
 * ENG-1383 — the outbox deep module. `OutboxWriter` itself is registered
 * globally by `DatabaseModule` (so any repo/service can enqueue in its own
 * transaction without importing this module) and is injected here, not
 * re-provided. `KAFKA_PUBLISHER_PORT` is bound to the real kafkajs adapter
 * here; tests override this provider with an in-memory/embedded broker
 * substitute (4f mocking strategy) rather than mocking
 * `OutboxWriter`/`OutboxRelayService` themselves (❌#4).
 *
 * ENG-1383 fix-pass-1 (F1): the `@OnEvent`-based `OrvexEventBusService`
 * lifecycle-handler scaffolding (workspace/space/comment/attachment family)
 * was removed here — nothing in this repo emits those `EventName`s, and
 * PD-4d descoped that family to ENG-1609. The real, live producers are
 * `PageRepo` (page.created / page.content_updated) and
 * `OrvexPageProvenanceService.writeStatus` (page.status_changed), both of
 * which enqueue directly, in-transaction, with no bus in between.
 */
@Module({
  imports: [EnvironmentModule, OrvexConfigModule],
  providers: [
    OutboxRelayService,
    { provide: KAFKA_PUBLISHER_PORT, useClass: KafkaPublisherAdapter },
  ],
  exports: [OutboxRelayService],
})
export class OrvexEventsModule {}
