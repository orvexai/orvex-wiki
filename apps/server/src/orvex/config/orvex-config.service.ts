// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Optional } from '@nestjs/common';

/**
 * OrvexConfigService — a REAL, pure environment reader for the additive orvex
 * surface.
 *
 * MINIMIZE-SURFACE (CS §3.6 / ❌#6, applied at foundation M8 review): this
 * service exposes ONLY the values that have a live consumer today —
 *   - gitSha / sourceRepo   -> OrvexSourceController (FR-W19 source offer)
 *   - identityUrl           -> SessionMintModule composition (RS256/JWKS)
 * The rest of the A-PORTABLE env surface (ORVEX_KNOWLEDGE/AI/BILLING/MCP/
 * CONSOLE/WIKI_API_URL, CELL_ID, CLUSTER_NAME, EVENT_TOPIC_SUFFIX) is already
 * deploy-documented in deploy/kustomize/app-manifests/configmap-env.yaml; each
 * getter is added HERE together with its first consumer at delivery — never
 * speculatively. (ORVEX_MODULES_ENABLED is read directly by
 * OrvexRootModule.register(), which runs before DI exists.)
 *
 * PURE: it reads only from an environment bag (defaults to `process.env`) and
 * holds no I/O, no network and no caching. A missing / blank optional value is
 * surfaced as `null`, NEVER as a fabricated placeholder. Tests construct it
 * with an explicit bag; Nest constructs it with `process.env` (the
 * `@Optional()` param resolves to `undefined`, so the default applies).
 */
@Injectable()
export class OrvexConfigService {
  private readonly env: NodeJS.ProcessEnv;

  constructor(@Optional() env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  /** Trim-and-nullify: undefined / blank -> null; otherwise the trimmed value. */
  private read(name: string): string | null {
    const raw = this.env[name];
    if (raw === undefined) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  /** ORVEX_IDENTITY_URL — the identity service (RS256/JWKS issuer) base URL. */
  get identityUrl(): string | null {
    return this.read('ORVEX_IDENTITY_URL');
  }

  /**
   * ORVEX_GIT_SHA — the exact commit the running binary was built from. Powers
   * the AGPL section 13 written-source offer (FR-W19). Null when unset (the
   * controller turns that into a LOUD 500) — never a fabricated SHA.
   */
  get gitSha(): string | null {
    return this.read('ORVEX_GIT_SHA');
  }

  /** ORVEX_SOURCE_REPO — the corresponding-source repository URL (AGPL section 13). */
  get sourceRepo(): string | null {
    return this.read('ORVEX_SOURCE_REPO');
  }

  /**
   * OTEL_EXPORTER_OTLP_ENDPOINT — the OTLP collector base URL (A-PORTABLE
   * configured-URL env surface). First consumer: `initOrvexTracing`
   * (ENG-1599 `orvex-tracing.bootstrap.ts`), which constructs this service
   * directly from the pre-DI env bag (the SDK must init before Nest DI
   * exists, same pattern as `OrvexRootModule.register()`'s
   * `new OrvexConfigService()`). A configured URL, never a credential;
   * blank/unset -> `null`, never a fabricated default endpoint (CS
   * §3.4/§10, ❌#8).
   */
  get otelExporterOtlpEndpoint(): string | null {
    return this.read('OTEL_EXPORTER_OTLP_ENDPOINT');
  }

  /**
   * ENG-1604 AC8 — `health/orvex` dependency probes. `OrvexHealthService` is
   * mounted inside `OrvexRootModule.register()`, so (same constraint as the
   * rest of this service) these getters may ONLY read a plain env bag — no
   * `EnvironmentModule`/`ConfigService` DI, no `DatabaseModule`/`@InjectKysely()` —
   * the DB-free `orvex-http.e2e.spec.ts` harness boots `register()` without
   * either (AC8.6).
   */

  /** DATABASE_URL — the postgres probe's connection string. Null when unset (never fabricated). */
  get databaseUrl(): string | null {
    return this.read('DATABASE_URL');
  }

  /** REDIS_URL — mirrors `EnvironmentService.getRedisUrl()`'s default. */
  get redisUrl(): string {
    return this.read('REDIS_URL') ?? 'redis://localhost:6379';
  }

  /** STORAGE_DRIVER — mirrors `EnvironmentService.getStorageDriver()`'s default. */
  get storageDriver(): string {
    return this.read('STORAGE_DRIVER') ?? 'local';
  }

  get awsS3Region(): string | null {
    return this.read('AWS_S3_REGION');
  }

  get awsS3Bucket(): string | null {
    return this.read('AWS_S3_BUCKET');
  }

  get awsS3Endpoint(): string | null {
    return this.read('AWS_S3_ENDPOINT');
  }

  get awsS3ForcePathStyle(): boolean {
    return this.read('AWS_S3_FORCE_PATH_STYLE')?.toLowerCase() === 'true';
  }

  /** KAFKA_BROKERS presence — the FAMILY-HEALTH-RULING "wired" signal (AC8.2). */
  get kafkaBrokersConfigured(): boolean {
    return this.read('KAFKA_BROKERS') !== null;
  }

  get kafkaBrokers(): string[] {
    const raw = this.read('KAFKA_BROKERS');
    return raw === null
      ? []
      : raw
          .split(',')
          .map((b) => b.trim())
          .filter(Boolean);
  }

  /**
   * ORVEX_GLOBAL_PREFIX_EXCLUDE (AC8.4) — routes excluded from the `/api`
   * global prefix, read by `main.ts`. Defaults to `mcp` (the only
   * Orvex-added exclusion real at HEAD before this ticket) PLUS `health/orvex`
   * (added to the default by this ticket, per AC8's own spec text (b) — its
   * endpoint now exists via AC8(a)).
   */
  get globalPrefixExclude(): string[] {
    const raw = this.read('ORVEX_GLOBAL_PREFIX_EXCLUDE');
    if (raw === null) {
      return ['mcp', 'health/orvex'];
    }
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
}
