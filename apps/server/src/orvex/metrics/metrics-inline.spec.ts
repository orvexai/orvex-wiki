// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Registry } from 'prom-client';

import {
  MAX_WORKSPACE_CARDINALITY,
  OrvexMetricsService,
} from './metrics-service';
import type { WarnHook } from './metrics-service';

/**
 * ENG-3149 — the inline DoD gate. The retired shared metrics package
 * (AGPL-3.0-only, the last AGPL artifact in the closed-family package
 * space — AD-8/AD-9, CS ❌#7) is inlined into the engine at
 * `apps/server/src/orvex/metrics/`. These specs construct the INLINED
 * `OrvexMetricsService` from the LOCAL engine path (`./metrics-service`),
 * never from the retired npm package.
 *
 * Honesty (CS §11): every exposition asserted below is the output of the
 * real `prom-client` `Registry` (`registry.metrics()`), never a
 * hand-authored fixture string. Determinism (❌#9): latency values are
 * supplied by the test; no wall clock is read in any assertion path.
 * Behaviour-through-interface (CS §4.2): only the exported surface is
 * exercised — internal field renames must not break these tests.
 */
describe('MetricsInlineExposition (ENG-3149 DoD, AC1)', () => {
  it('records an MCP tool call through the inlined service and renders it in the real Prometheus exposition', async () => {
    const svc = new OrvexMetricsService();

    // Deterministic: latency is SUPPLIED (❌#9) — no wall-clock read.
    svc.recordMcpToolCall('ws-1', 'search', 0.05);

    const body = await svc.getMetrics();

    // Isolate the one sample line for the frozen mcpToolCallsTotal family
    // and assert each label independently (order-agnostic — prom-client
    // emits labels in labelNames definition order, not alphabetical).
    const line = body
      .split('\n')
      .find((l) => l.startsWith('orvex_mcp_tool_calls_total{'));
    expect(line).toBeDefined();
    expect(line).toMatch(/workspace_id="ws-1"/);
    expect(line).toMatch(/tool_name="search"/);
    expect(line).toMatch(/\}\s+1\s*$/);

    // Content type is the real prom-client text exposition type.
    expect(svc.getContentType()).toContain('text/plain');
  });

  it('keeps the shared `registry` field public — the outbox relay heartbeat registers its gauges on it (po-ruling 10, one shared registry)', () => {
    const svc = new OrvexMetricsService();
    expect(svc.registry).toBeInstanceOf(Registry);
  });
});

describe('MetricsFrozenNameSet (ENG-3149, AC5)', () => {
  it('metricNames() returns exactly the 9 frozen family names, byte-for-byte, sorted (ENG-1610 contract)', () => {
    const svc = new OrvexMetricsService();

    // The frozen set (ENG-1610 — mirrors the ratified Go pkg/metrics),
    // snapshot-equal to the pre-inline shared-package output. A renamed
    // or dropped metric MUST fail here (Mimir/PromQL key on these names).
    expect(svc.metricNames()).toEqual(
      [
        'orvex_ai_cost_usd_total',
        'orvex_linear_api_success_rate',
        'orvex_mcp_tool_calls_total',
        'orvex_mcp_tool_call_latency_seconds',
        'orvex_embedding_queue_depth',
        'orvex_openbao_op_latency_seconds',
        'orvex_socket_io_events_total',
        'orvex_linear_cache_hit_total',
        'orvex_linear_cache_miss_total',
      ].sort(),
    );
  });
});

describe('MetricsCardinalityGuard (ENG-3149, AC6 / NFR23)', () => {
  it('the ratified workspace-cardinality ceiling is 500, inlined unchanged (❌#10)', () => {
    expect(MAX_WORKSPACE_CARDINALITY).toBe(500);
  });

  it('drops the 501st workspace, caps the count at 500, and warns exactly once under sustained overflow', async () => {
    const warnings: string[] = [];
    const capture: WarnHook = (msg) => {
      warnings.push(msg);
    };
    const svc = new OrvexMetricsService(capture);

    // Fill the budget: all MAX_WORKSPACE_CARDINALITY distinct ids admit.
    for (let i = 0; i < MAX_WORKSPACE_CARDINALITY; i++) {
      expect(svc.trackWorkspace(`ws-${i}`)).toBe(true);
    }
    expect(svc.workspaceLabelCount()).toBe(MAX_WORKSPACE_CARDINALITY);
    expect(warnings).toHaveLength(0);

    // 501st distinct id: rejected, count capped, ONE warn emitted.
    expect(svc.trackWorkspace('ws-overflow-1')).toBe(false);
    expect(svc.workspaceLabelCount()).toBe(MAX_WORKSPACE_CARDINALITY);
    expect(warnings).toHaveLength(1);

    // Sustained overflow: recorders silently drop (no throw), and the warn
    // stays one-shot — never a log flood.
    expect(() =>
      svc.recordMcpToolCall('ws-overflow-2', 'search', 0.01),
    ).not.toThrow();
    expect(svc.trackWorkspace('ws-overflow-3')).toBe(false);
    expect(warnings).toHaveLength(1);

    // An already-admitted workspace keeps recording normally past overflow.
    expect(svc.trackWorkspace('ws-0')).toBe(true);

    // The dropped workspace produced NO sample series on the real
    // exposition (verified against registry output, not internals).
    const body = await svc.getMetrics();
    expect(body).not.toContain('workspace_id="ws-overflow-2"');
  });
});
