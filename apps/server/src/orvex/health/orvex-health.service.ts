// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Inject, Injectable, Optional } from '@nestjs/common';
import { OrvexConfigService } from '../config/orvex-config.service';
import {
  ORVEX_HEALTH_COLLAB_WS_PROBE,
  ORVEX_HEALTH_KAFKA_PROBE,
  ORVEX_HEALTH_POSTGRES_PROBE,
  ORVEX_HEALTH_REDIS_PROBE,
  ORVEX_HEALTH_RELAY_PROBE,
  ORVEX_HEALTH_STORAGE_PROBE,
  defaultCollabWsProbe,
  defaultKafkaProbe,
  defaultPostgresProbe,
  defaultRedisProbe,
  defaultRelayOutboxProbe,
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

export interface CollabWsResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}
export type CollabWsProbe = (
  config: OrvexConfigService,
) => Promise<CollabWsResult>;

/**
 * ENG-2510 AC1/AC3 — the PER-ROLE / HEALTH-ECHO framing this story adds on
 * top of the individual role signals (ENG-2496's relay heartbeat, this
 * story's own collab WS probe). Every health surface the engine exposes —
 * the `api` aggregate and each role-scoped endpoint — names WHICH ROLE it
 * speaks for and echoes BOTH cell params (cell-contract rule #4).
 *
 * Why this is the framing and not the signal: without `role`, three probe
 * bodies scraped off one pod are indistinguishable, so a kubelet/operator
 * cannot tell "the worker relay is dead" from "the api can't reach
 * Postgres" — the exact false-positive-healthy state this story's own "so
 * that" clause names. Without the cell echo on the ROLE-scoped bodies (not
 * only the api aggregate), a red role signal cannot be attributed to a cell
 * when several cells scrape into one console.
 *
 * `cellId`/`clusterName` follow `OrvexConfigService`'s trim-and-nullify
 * contract: unset surfaces as `null`, never a fabricated value (CS §11).
 */
export interface OrvexRoleEcho {
  role: 'api' | 'worker' | 'collab';
  cellId: string | null;
  clusterName: string | null;
}

/** ENG-2510 AC2 — the collab role's own liveness body (role-scoped). */
export interface OrvexCollabHealthBody extends CollabWsResult, OrvexRoleEcho {
  role: 'collab';
  ts: string;
}

/** ENG-2496 AC4 — the outbox relay liveness/lag heartbeat probe result. */
export interface RelayOutboxResult {
  ok: boolean;
  unrelayedCount?: number;
  oldestUnrelayedAgeSeconds?: number | null;
  thresholdSeconds: number;
  error?: string;
}
export type RelayOutboxProbe = (
  config: OrvexConfigService,
) => Promise<RelayOutboxResult>;

/**
 * ENG-2496 AC4 — the `GET /health/orvex/relay` body, wearing ENG-2510 AC1's
 * per-role/health-echo framing ({@link OrvexRoleEcho}): the WORKER role's
 * own signal, self-identified and cell-attributed. ENG-2496 owns the
 * heartbeat SIGNAL underneath (`relay`); this story owns only the
 * `role`/`cellId`/`clusterName` framing around it (§5d — the base heartbeat
 * is deliberately not rebuilt here).
 */
export interface RelayHeartbeatBody extends OrvexRoleEcho {
  role: 'worker';
  status: 'pass' | 'fail';
  relay: RelayOutboxResult;
  ts: string;
}

export interface OrvexHealthBody extends OrvexRoleEcho {
  role: 'api';
  status: 'ok' | 'degraded';
  checks: {
    postgres: PostgresResult;
    redis: RedisResult;
    storage: StorageResult;
    kafka: { ok: boolean; wired: boolean; error?: string };
  };
  ts: string;
  // ENG-2510 AC3 — cell contract rule #4: `cellId`/`clusterName` arrive via
  // {@link OrvexRoleEcho}, shared with every role-scoped body. Unset env
  // surfaces as `null`, never a thrown error (the never-throw/HTTP-200
  // contract below is unchanged by these fields).
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
    @Optional()
    @Inject(ORVEX_HEALTH_COLLAB_WS_PROBE)
    private readonly collabWsProbe: CollabWsProbe = defaultCollabWsProbe,
    @Optional()
    @Inject(ORVEX_HEALTH_RELAY_PROBE)
    private readonly relayProbe: RelayOutboxProbe = defaultRelayOutboxProbe,
  ) {}

  /**
   * ENG-2496 AC4 — `GET /health/orvex/relay`: the outbox relay
   * liveness/lag heartbeat. Same FAMILY HEALTH RULING as `check()`: NEVER
   * throws, always HTTP 200 at the controller — degradation is carried in
   * the body's `status`/`relay.ok`. A DEAD relay (rows unrelayed past the
   * staleness bound) reads `fail` — never silently green — and a probe
   * error is itself a typed `fail`, never an unhandled rejection.
   */
  async relayHeartbeat(): Promise<RelayHeartbeatBody> {
    let relay: RelayOutboxResult;
    try {
      relay = await this.relayProbe(this.config);
    } catch (e) {
      relay = {
        ok: false,
        thresholdSeconds: this.config.outboxHeartbeatStalenessSeconds,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    return {
      ...this.roleEcho('worker'),
      status: relay.ok ? 'pass' : 'fail',
      relay,
      ts: new Date().toISOString(),
    };
  }

  /**
   * ENG-2510 AC1/AC3 — the ONE place the per-role/health-echo framing is
   * built, so all three role surfaces carry an identical, config-sourced
   * `role`/`cellId`/`clusterName` triple and cannot drift apart.
   */
  private roleEcho<R extends OrvexRoleEcho['role']>(
    role: R,
  ): OrvexRoleEcho & { role: R } {
    return {
      role,
      cellId: this.config.cellId,
      clusterName: this.config.clusterName,
    };
  }

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
      ...this.roleEcho('api'),
      status: anyWiredDown ? 'degraded' : 'ok',
      checks: { postgres, redis, storage, kafka },
      ts: new Date().toISOString(),
    };
  }

  /**
   * ENG-2510 AC2 — the collab ROLE's own liveness signal: a REAL WebSocket
   * handshake against the Hocuspocus `/collab` upgrade path. Unlike
   * {@link check} (the ADR-0020 dependency aggregate, HTTP-200-unconditional
   * because a DEPENDENCY blip must never restart the pod), a dead in-process
   * collab WS listener is the pod's OWN component being dead — the exact
   * "dead component reads green" state per-role liveness exists to make
   * visible — so the controller maps `ok:false` here to a non-2xx a
   * kubelet probe can act on. This method itself never throws.
   */
  async checkCollab(): Promise<OrvexCollabHealthBody> {
    let result: CollabWsResult;
    try {
      result = await this.collabWsProbe(this.config);
    } catch (e) {
      // Probe contract is never-throw, but a misbehaving injected probe must
      // surface as an honest failure, not a crashed handler.
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return {
      ...result,
      ...this.roleEcho('collab'),
      ts: new Date().toISOString(),
    };
  }
}
