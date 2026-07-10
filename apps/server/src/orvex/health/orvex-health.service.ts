// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Inject, Injectable, Optional } from '@nestjs/common';
import { OrvexConfigService } from '../config/orvex-config.service';
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

export interface PostgresResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}
export type PostgresProbe = (config: OrvexConfigService) => Promise<PostgresResult>;

export interface RedisResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}
export type RedisProbe = (config: OrvexConfigService) => Promise<RedisResult>;

export interface StorageResult {
  ok: boolean;
  driver: string;
  error?: string;
}
export type StorageProbe = (config: OrvexConfigService) => Promise<StorageResult>;

export interface KafkaResult {
  ok: boolean;
  error?: string;
}
export type KafkaProbe = (config: OrvexConfigService) => Promise<KafkaResult>;

export interface OrvexHealthBody {
  status: 'ok' | 'degraded';
  checks: {
    postgres: PostgresResult;
    redis: RedisResult;
    storage: StorageResult;
    kafka: { ok: boolean; wired: boolean; error?: string };
  };
  ts: string;
}

/**
 * OrvexHealthService (ENG-1604 AC8) — the FAMILY HEALTH RULING aggregation
 * for `GET /health/orvex`.
 *
 * FAMILY HEALTH RULING (`tools/act3/po-decisions-2026-07-07.md`; Houston
 * ADR-0020): a transient dependency blip must NEVER make Kubernetes restart
 * the pod, so `check()` NEVER throws and its result always maps to HTTP 200
 * at the controller — only the JSON body's `status`/`checks[...].ok` carry
 * degradation. Kafka is reported `wired:false, ok:true` (never degraded)
 * when `KAFKA_BROKERS` is unset — an unconfigured solo boot is not a failure
 * (AC8.2) — and its probe is not even invoked in that case.
 *
 * ACCEPT-DON'T-CREATE (CS): every probe is INJECTED as a typed function
 * (ports) rather than constructed here, so this service — and therefore
 * `OrvexRootModule.register()`, which mounts it — has ZERO compile-time or
 * construction-time dependency on `DatabaseModule`/`@InjectKysely()` or any
 * other app-level Global module. That is what keeps the DB-free
 * `orvex-http.e2e.spec.ts` harness (which boots `register()` alone via
 * `@nestjs/testing`, without `DatabaseModule`) green — the same class of
 * regression already reverted once for `OrvexPageMetadataModule`/ENG-1371,
 * and the reason `OrvexMigratorService`/`OrvexLlmsModule` are NOT mounted
 * here either (AC8.6).
 */
@Injectable()
export class OrvexHealthService {
  constructor(
    private readonly config: OrvexConfigService,
    @Optional()
    @Inject(ORVEX_HEALTH_POSTGRES_PROBE)
    private readonly postgresProbe: PostgresProbe = defaultPostgresProbe,
    @Optional()
    @Inject(ORVEX_HEALTH_REDIS_PROBE)
    private readonly redisProbe: RedisProbe = defaultRedisProbe,
    @Optional()
    @Inject(ORVEX_HEALTH_STORAGE_PROBE)
    private readonly storageProbe: StorageProbe = defaultStorageProbe,
    @Optional()
    @Inject(ORVEX_HEALTH_KAFKA_PROBE)
    private readonly kafkaProbe: KafkaProbe = defaultKafkaProbe,
  ) {}

  async check(): Promise<OrvexHealthBody> {
    const [postgres, redis, storage] = await Promise.all([
      this.postgresProbe(this.config),
      this.redisProbe(this.config),
      this.storageProbe(this.config),
    ]);

    const wired = this.config.kafkaBrokersConfigured;
    const kafka = wired
      ? { wired: true, ...(await this.kafkaProbe(this.config)) }
      : { ok: true, wired: false };

    const anyWiredDown = !postgres.ok || !redis.ok || !storage.ok || !kafka.ok;

    return {
      status: anyWiredDown ? 'degraded' : 'ok',
      checks: { postgres, redis, storage, kafka },
      ts: new Date().toISOString(),
    };
  }
}
