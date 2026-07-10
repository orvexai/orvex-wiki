// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { promises as fs } from 'fs';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { OrvexConfigService } from '../config/orvex-config.service';
import { LOCAL_STORAGE_PATH } from '../../common/helpers';
import type {
  KafkaProbe,
  KafkaResult,
  PostgresProbe,
  PostgresResult,
  RedisProbe,
  RedisResult,
  StorageProbe,
  StorageResult,
} from './orvex-health.service';

export const ORVEX_HEALTH_POSTGRES_PROBE = Symbol(
  'ORVEX_HEALTH_POSTGRES_PROBE',
);
export const ORVEX_HEALTH_REDIS_PROBE = Symbol('ORVEX_HEALTH_REDIS_PROBE');
export const ORVEX_HEALTH_STORAGE_PROBE = Symbol(
  'ORVEX_HEALTH_STORAGE_PROBE',
);
export const ORVEX_HEALTH_KAFKA_PROBE = Symbol('ORVEX_HEALTH_KAFKA_PROBE');

const PROBE_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('probe timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Real postgres probe (AC8(a)) — a raw `pg.Pool`, NOT Kysely/`DatabaseModule`
 * (AC8.6: `OrvexHealthService` must not require DB DI at module init). The
 * pool is constructed lazily per call, never at module init, and always
 * ended — no connection leak across probes.
 */
export const defaultPostgresProbe: PostgresProbe = async (
  config: OrvexConfigService,
): Promise<PostgresResult> => {
  const connectionString = config.databaseUrl;
  if (connectionString === null) {
    return { ok: false, error: 'DATABASE_URL not configured' };
  }

  const pool = new Pool({ connectionString, max: 1 });
  const start = Date.now();
  try {
    await withTimeout(pool.query('SELECT 1'), PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await pool.end().catch(() => undefined);
  }
};

/** Real redis probe (AC8(a)) — mirrors `RedisHealthIndicator`'s per-call client pattern. */
export const defaultRedisProbe: RedisProbe = async (
  config: OrvexConfigService,
): Promise<RedisResult> => {
  const start = Date.now();
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: PROBE_TIMEOUT_MS,
  });
  try {
    await withTimeout(redis.connect(), PROBE_TIMEOUT_MS);
    await withTimeout(redis.ping(), PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    redis.disconnect();
  }
};

/** Real storage probe (AC8(a)) — stat the local data dir, or HeadBucket for s3. */
export const defaultStorageProbe: StorageProbe = async (
  config: OrvexConfigService,
): Promise<StorageResult> => {
  const driver = config.storageDriver;

  if (driver === 's3') {
    const bucket = config.awsS3Bucket;
    if (bucket === null) {
      return { ok: false, driver, error: 'AWS_S3_BUCKET not configured' };
    }
    const client = new S3Client({
      region: config.awsS3Region ?? undefined,
      endpoint: config.awsS3Endpoint ?? undefined,
      forcePathStyle: config.awsS3ForcePathStyle,
    });
    try {
      await withTimeout(
        client.send(new HeadBucketCommand({ Bucket: bucket })),
        PROBE_TIMEOUT_MS,
      );
      return { ok: true, driver };
    } catch (e) {
      return { ok: false, driver, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // local (default) driver — the storage tree must exist and be stat-able.
  try {
    await withTimeout(fs.stat(LOCAL_STORAGE_PATH), PROBE_TIMEOUT_MS);
    return { ok: true, driver: 'local' };
  } catch (e) {
    return {
      ok: false,
      driver: 'local',
      error: e instanceof Error ? e.message : String(e),
    };
  }
};

/**
 * Real kafka probe — ONLY invoked when `kafkaBrokersConfigured` (the service
 * skips this entirely, `wired:false`, on an unconfigured solo boot, AC8.2).
 */
export const defaultKafkaProbe: KafkaProbe = async (
  config: OrvexConfigService,
): Promise<KafkaResult> => {
  const kafka = new Kafka({
    clientId: 'orvex-wiki-health-orvex',
    brokers: config.kafkaBrokers,
  });
  const admin = kafka.admin();
  try {
    await withTimeout(admin.connect(), PROBE_TIMEOUT_MS);
    await withTimeout(admin.listTopics(), PROBE_TIMEOUT_MS);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
};
