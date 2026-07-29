// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type {
  AiFeatureLabelValue,
  CacheTierValue,
  OpenBaoOpLabelValue,
} from './labels';

// Engine-resident shared metrics registry (ENG-3149) — inlined from the
// retired AGPL shared metrics package (its only consumer was this engine;
// AD-8/AD-9, CS ❌#7), which was itself the TS-consumable mirror of the
// ratified Go pkg/metrics shared Prometheus registry (ENG-1610, PD-4d).
//
// Charter (mirrors pkg/metrics/doc.go): every TS/NestJS engine-tier leg
// instruments through ONE OrvexMetricsService, so metric names and label
// sets stay consistent with the Go side and the NFR23 workspace-cardinality
// budget is enforced in exactly one place per language runtime. Metric
// NAMES and label names are preserved byte-for-byte from the original TS
// fork (packages/orvex-extensions/src/metrics/metrics.service.ts, pinned at
// HEAD 050187676624f2395c55b36ec60e365f87fd4a9f of orvexai/docmost) and
// cross-checked against contracts/metrics-family-names.json (CS §12).
//
// This module ships ONLY the registry. The Prometheus scrape endpoint
// (/metrics) lives in metrics.controller.ts (ENG-1360) — no HTTP surface
// lives here.

/** The NFR23 workspace-cardinality budget, preserved byte-for-byte from the
 * Go fork's MaxWorkspaceCardinality / MAX_WORKSPACE_CARDINALITY. Not to be
 * silently raised (❌#10). */
export const MAX_WORKSPACE_CARDINALITY = 500;

/** The canonical metric-family name set this service registers, captured
 * once from the same literals passed to each metric's options below (the
 * single source of truth — not a second hand-maintained list). */
const METRIC_NAMES = {
  aiCostUsdTotal: 'orvex_ai_cost_usd_total',
  linearApiSuccessRate: 'orvex_linear_api_success_rate',
  mcpToolCallsTotal: 'orvex_mcp_tool_calls_total',
  mcpToolCallLatencySeconds: 'orvex_mcp_tool_call_latency_seconds',
  embeddingQueueDepth: 'orvex_embedding_queue_depth',
  openbaoOpLatencySeconds: 'orvex_openbao_op_latency_seconds',
  socketIoEventsTotal: 'orvex_socket_io_events_total',
  linearCacheHitTotal: 'orvex_linear_cache_hit_total',
  linearCacheMissTotal: 'orvex_linear_cache_miss_total',
} as const;

/** Injectable seam for the one-shot cardinality warn. Tests inject a hook to
 * observe warn emission without mocking the service itself (CS §5 — the
 * registry and its cardinality logic stay real). */
export type WarnHook = (msg: string) => void;

const defaultWarnHook: WarnHook = (msg) => {
  console.warn(msg);
};

/**
 * OrvexMetricsService is the shared Prometheus metric registry for TS/
 * NestJS engine-tier legs (CS §3 deep module): a small typed-recorder
 * surface backed by a single private prom-client Registry. Deletion would
 * scatter metric definitions and the cardinality guard across every
 * service, exactly as the Go doc comment warns.
 */
export class OrvexMetricsService {
  /** The single shared prom-client Registry instance (AC1). PUBLIC on
   * purpose — the outbox relay heartbeat (ENG-2496) registers its gauges on
   * this one shared registry (po-ruling 10: never a second Registry). */
  public readonly registry: Registry;

  private readonly aiCostUsdTotal: Counter<string>;
  private readonly linearApiSuccessRate: Gauge<string>;
  private readonly mcpToolCallsTotal: Counter<string>;
  private readonly mcpToolCallLatencySeconds: Histogram<string>;
  private readonly embeddingQueueDepth: Gauge<string>;
  private readonly openbaoOpLatencySeconds: Histogram<string>;
  private readonly socketIoEventsTotal: Counter<string>;
  private readonly linearCacheHitTotal: Counter<string>;
  private readonly linearCacheMissTotal: Counter<string>;

  private readonly knownWorkspaces = new Set<string>();
  private warnedOnCardinality = false;
  private readonly warn: WarnHook;

  constructor(warn: WarnHook = defaultWarnHook) {
    this.registry = new Registry();
    this.warn = warn;

    this.aiCostUsdTotal = new Counter({
      name: METRIC_NAMES.aiCostUsdTotal,
      help: 'Total AI provider cost in USD per workspace + feature.',
      labelNames: ['workspace_id', 'feature'],
      registers: [this.registry],
    });
    this.linearApiSuccessRate = new Gauge({
      name: METRIC_NAMES.linearApiSuccessRate,
      help: 'Linear API success rate (0.0-1.0) per workspace + linear org over a 24h rolling window.',
      labelNames: ['workspace_id', 'linear_org'],
      registers: [this.registry],
    });
    this.mcpToolCallsTotal = new Counter({
      name: METRIC_NAMES.mcpToolCallsTotal,
      help: 'Total MCP tool invocations per workspace + tool name.',
      labelNames: ['workspace_id', 'tool_name'],
      registers: [this.registry],
    });
    this.mcpToolCallLatencySeconds = new Histogram({
      name: METRIC_NAMES.mcpToolCallLatencySeconds,
      help: 'MCP tool call latency in seconds per workspace + tool name.',
      labelNames: ['workspace_id', 'tool_name'],
      registers: [this.registry],
    });
    this.embeddingQueueDepth = new Gauge({
      name: METRIC_NAMES.embeddingQueueDepth,
      help: 'Pending embedding queue depth per workspace.',
      labelNames: ['workspace_id'],
      registers: [this.registry],
    });
    this.openbaoOpLatencySeconds = new Histogram({
      name: METRIC_NAMES.openbaoOpLatencySeconds,
      help: 'Secret encryption operation latency in seconds (name kept for metric continuity; OpenBao removed).',
      labelNames: ['op'],
      registers: [this.registry],
    });
    this.socketIoEventsTotal = new Counter({
      name: METRIC_NAMES.socketIoEventsTotal,
      help: 'Socket.IO events received per workspace + event type.',
      labelNames: ['workspace_id', 'event_type'],
      registers: [this.registry],
    });
    this.linearCacheHitTotal = new Counter({
      name: METRIC_NAMES.linearCacheHitTotal,
      help: 'Linear entity cache hits by tier (l1=in-process LRU, l2=Redis, l3=Postgres).',
      labelNames: ['workspace_id', 'tier'],
      registers: [this.registry],
    });
    this.linearCacheMissTotal = new Counter({
      name: METRIC_NAMES.linearCacheMissTotal,
      help: 'Linear entity cache misses (fell through to live API call).',
      labelNames: ['workspace_id'],
      registers: [this.registry],
    });
  }

  /** Returns the sorted set of registered metric family names — used by the
   * AC1/AC5 name-set gates. */
  metricNames(): string[] {
    return Object.values(METRIC_NAMES).slice().sort();
  }

  /** Returns the current Prometheus text-exposition body. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Returns the Prometheus exposition content type for the body returned
   * by getMetrics(). */
  getContentType(): string {
    return this.registry.contentType;
  }

  /** Returns true if the workspace_id label may be used. Enforces the
   * NFR23 cardinality budget (<= MAX_WORKSPACE_CARDINALITY active
   * workspaces): once the budget is exhausted, new workspace label
   * combinations are dropped and exactly one warn is emitted (one-shot, to
   * avoid log flooding under sustained overflow). Mirrors
   * pkg/metrics/cardinality.go TrackWorkspace. */
  trackWorkspace(workspaceId: string): boolean {
    if (this.knownWorkspaces.has(workspaceId)) {
      return true;
    }
    if (this.knownWorkspaces.size >= MAX_WORKSPACE_CARDINALITY) {
      if (!this.warnedOnCardinality) {
        this.warn(
          'Metrics workspace cardinality limit reached (500); dropping new workspace label combinations.',
        );
        this.warnedOnCardinality = true;
      }
      return false;
    }
    this.knownWorkspaces.add(workspaceId);
    return true;
  }

  /** Returns the number of distinct workspaces currently tracked against
   * the cardinality budget. */
  workspaceLabelCount(): number {
    return this.knownWorkspaces.size;
  }

  /** Records AI provider cost in USD for a workspace + feature. Silently
   * dropped (no throw) if the workspace is past the cardinality budget. */
  recordAiCost(
    workspaceId: string,
    feature: AiFeatureLabelValue,
    costUsd: number,
  ): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.aiCostUsdTotal.labels(workspaceId, feature).inc(costUsd);
  }

  /** Records one MCP tool invocation and its latency for a workspace + tool
   * name. */
  recordMcpToolCall(
    workspaceId: string,
    toolName: string,
    latencySeconds: number,
  ): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.mcpToolCallsTotal.labels(workspaceId, toolName).inc();
    this.mcpToolCallLatencySeconds
      .labels(workspaceId, toolName)
      .observe(latencySeconds);
  }

  /** Records a secret-encryption-operation latency sample. Not
   * workspace-scoped (matches the fork: no cardinality gate on this family
   * since its only label is the fixed `op` enum). */
  recordOpenBaoOp(op: OpenBaoOpLabelValue, latencySeconds: number): void {
    this.openbaoOpLatencySeconds.labels(op).observe(latencySeconds);
  }

  /** Sets the rolling Linear API success rate gauge for a workspace +
   * Linear org. */
  setLinearApiSuccessRate(
    workspaceId: string,
    linearOrg: string,
    rate: number,
  ): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.linearApiSuccessRate.labels(workspaceId, linearOrg).set(rate);
  }

  /** Sets the pending embedding queue depth for a workspace. */
  setEmbeddingQueueDepth(workspaceId: string, depth: number): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.embeddingQueueDepth.labels(workspaceId).set(depth);
  }

  /** Records one received Socket.IO event for a workspace + event type. */
  recordSocketIoEvent(workspaceId: string, eventType: string): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.socketIoEventsTotal.labels(workspaceId, eventType).inc();
  }

  /** Records a Linear entity cache hit at the given tier (l1=in-process
   * LRU, l2=Redis, l3=Postgres). */
  recordLinearCacheHit(workspaceId: string, tier: CacheTierValue): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.linearCacheHitTotal.labels(workspaceId, tier).inc();
  }

  /** Records a Linear entity cache miss (fell through to a live API
   * call). */
  recordLinearCacheMiss(workspaceId: string): void {
    if (!this.trackWorkspace(workspaceId)) {
      return;
    }
    this.linearCacheMissTotal.labels(workspaceId).inc();
  }
}
