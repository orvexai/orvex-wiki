// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { trace } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';

const TRACER_NAME = 'orvex-wiki-postgres';

/**
 * A best-effort human label for a query kind (e.g. `SelectQueryNode`) — never
 * throws, never inspects table/column identifiers or literal values, so no
 * query content (and therefore no PII, AC6) ever reaches a span name.
 */
function describeOperation(node: RootOperationNode): string {
  return node.kind ?? 'query';
}

/**
 * OrvexKyselySpanPlugin — a thin store-edge span wrapper (CS §4c tier: thin
 * adapter, no query logic added) around the kysely query pipeline.
 *
 * WHY THIS EXISTS (§4h ❌#6): the engine's Postgres driver is `postgres`
 * (postgres.js) via `kysely`/`kysely-postgres-js`, NOT node-`pg` —
 * `@opentelemetry/instrumentation-pg` patches the `pg` client and does not
 * apply here. This plugin is the sanctioned Postgres seam for ENG-1599 AC1
 * seam coverage, using kysely's own documented pattern for correlating its
 * two lifecycle hooks around one query's real execution window: a query-
 * scoped span is opened in `transformQuery` and closed in `transformResult`,
 * keyed by the query's own `queryId` object (a `WeakMap`, exactly as kysely's
 * `KyselyPlugin` doc recommends, to avoid leaking a strong reference).
 *
 * `transformQuery` returns `args.node` UNCHANGED — this plugin adds tracing
 * only, never a query transformation.
 *
 * KNOWN GAP (documented, not silently ignored — CS §11 honesty): if the
 * underlying query throws, kysely does not call `transformResult`, so the
 * span started in `transformQuery` is never explicitly ended in that path.
 * This matches the upstream plugin contract's only extension point; closing
 * that gap would require wrapping the connection/executor beneath kysely,
 * which is out of scope for this leg (no query logic/executor change, ❌#2).
 * Tracked for the tracing ADR as a follow-up, not a regression against
 * today's zero-span baseline.
 */
export class OrvexKyselySpanPlugin implements KyselyPlugin {
  private readonly spans = new WeakMap<object, Span>();
  private readonly tracer: Tracer;

  constructor(tracer: Tracer = trace.getTracer(TRACER_NAME)) {
    this.tracer = tracer;
  }

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const span = this.tracer.startSpan(`postgres.${describeOperation(args.node)}`, {
      attributes: { 'db.system': 'postgresql' },
    });
    this.spans.set(args.queryId, span);
    return args.node;
  }

  async transformResult(
    args: PluginTransformResultArgs,
  ): Promise<QueryResult<UnknownRow>> {
    const span = this.spans.get(args.queryId);
    if (span) {
      this.spans.delete(args.queryId);
      span.end();
    }
    return args.result;
  }
}
