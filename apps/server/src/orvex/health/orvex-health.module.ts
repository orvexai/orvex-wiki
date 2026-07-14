// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { OrvexConfigModule } from '../config/orvex-config.module';
import { OrvexHealthController } from './orvex-health.controller';
import { OrvexHealthService } from './orvex-health.service';
import {
  ORVEX_HEALTH_KAFKA_PROBE,
  ORVEX_HEALTH_POSTGRES_PROBE,
  ORVEX_HEALTH_REDIS_PROBE,
  ORVEX_HEALTH_STORAGE_PROBE,
  defaultKafkaProbe,
  defaultPostgresProbe,
  defaultRedisProbe,
  defaultStorageProbe,
} from './orvex-health.probes';

/**
 * OrvexHealthModule (ENG-1604 AC8) — mounts `GET /health/orvex` inside
 * `OrvexRootModule.register()`. Deliberately declares NO dependency on
 * `DatabaseModule`/`@InjectKysely()` or any other app-level Global module
 * (AC8.6) — see {@link OrvexHealthService}'s docstring. Only imports
 * `OrvexConfigModule` for the pure env reader.
 *
 * The four probes are registered as ordinary DI-token providers (rather than
 * only relying on `OrvexHealthService`'s `@Optional()` constructor defaults)
 * so tests can `overrideProvider()` them at the module boundary without any
 * real network/DB I/O (see `orvex-health.e2e.spec.ts`).
 */
@Module({
  imports: [OrvexConfigModule],
  controllers: [OrvexHealthController],
  providers: [
    OrvexHealthService,
    { provide: ORVEX_HEALTH_POSTGRES_PROBE, useValue: defaultPostgresProbe },
    { provide: ORVEX_HEALTH_REDIS_PROBE, useValue: defaultRedisProbe },
    { provide: ORVEX_HEALTH_STORAGE_PROBE, useValue: defaultStorageProbe },
    { provide: ORVEX_HEALTH_KAFKA_PROBE, useValue: defaultKafkaProbe },
  ],
})
export class OrvexHealthModule {}
