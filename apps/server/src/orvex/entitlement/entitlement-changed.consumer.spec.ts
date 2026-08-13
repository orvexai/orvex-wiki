// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { EntitlementService } from './entitlement.service';
import {
  BillingEntitlementPort,
  BillingUnconfiguredError,
} from './entitlement-billing.port';
import {
  Clock,
  EntitlementCache,
  InMemoryEntitlementCache,
} from './entitlement-cache';
import {
  EntitlementChangedConsumer,
  BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
} from './entitlement-changed.consumer';
import { OrvexConfigService } from '../config/orvex-config.service';
import {
  assertNoPaidPlanSellableWhileInterimFree,
  EntitlementCaps,
  EntitlementCheckResponse,
  INTERIM_FREE_ENTITLEMENT,
  Principal,
  SELLABLE_PLAN_IDS,
} from './entitlement.types';
import {
  EntitlementUnavailableException,
  QuotaExceededException,
} from './quota.exception';

/**
 * ENG-2489 — `TestEntitlementReaderEvictsOnBillingChange` (the named DoD
 * gate) plus the AC1/AC3/AC4/AC5 sibling suite.
 *
 * Behaviour-through-interface only (CS §4.2): everything is driven through
 * `EntitlementService`'s exported methods, the `EntitlementCache` port, and
 * the consumer's wire entry point (`handleRawMessage` — the exact function
 * the kafkajs `eachMessage` handler calls with a real message value). The
 * cache double is `InMemoryEntitlementCache` — a real behavioural
 * implementation of the port with an injected fake clock + the real
 * 300-second TTL semantics, never a mock of the reader's own cache-read
 * logic (CS §5, ❌#4). No wall-clock TTL race: the clock is advanced
 * explicitly (❌#9).
 */

const CACHE_TTL_SECONDS = 300; // mirrors entitlement-cache.ts (fixture knob)

function replayedCatalog(pageCap: number): EntitlementCheckResponse {
  const caps: EntitlementCaps = {
    ai_monthly_budget_gbp: 0,
    embedding_monthly_budget_gbp: 0,
    curator_distillation_monthly: 0,
    trial_weekly_actions_advisory: 0,
    trial_weekly_actions_throttle: 0,
    demo_ai_actions: 0,
    wiki_max_pages: pageCap,
    wiki_storage_bytes_aggregate: 5_000_000,
    wiki_max_file_bytes: 1_000_000,
    wiki_max_files: 50,
    wiki_max_members: 5,
    wiki_history_retention_versions: 10,
    wiki_history_retention_days: 180,
  };
  return {
    plan: 'free',
    plan_version: 'v1',
    features: [],
    caps,
    trial: { state: 'none' },
    throttle: { state: 'none' },
    version: 'entitlement-v1',
    evaluatedAt: '2026-07-01T00:00:00.000Z',
  };
}

class FakeClock implements Clock {
  private t = 1_000_000;
  now(): number {
    return this.t;
  }
  advanceSeconds(seconds: number): void {
    this.t += seconds * 1000;
  }
}

class StubBillingPort implements BillingEntitlementPort {
  calls: Principal[] = [];
  catalog: EntitlementCheckResponse;
  failWith: Error | null = null;

  constructor(catalog: EntitlementCheckResponse) {
    this.catalog = catalog;
  }

  async checkEntitlement(principal: Principal): Promise<EntitlementCheckResponse> {
    this.calls.push(principal);
    if (this.failWith) {
      throw this.failWith;
    }
    return this.catalog;
  }
}

function cloudEvent(
  type: string,
  data: Record<string, unknown>,
  orvexcell?: string,
): string {
  // A real CloudEvents 1.0 structured-mode envelope (ADR-0007 shape — the
  // same structure OutboxRelayService emits on the wiki.* side). `orvexcell`
  // is OPTIONAL here on purpose: several C-cell cases below exercise the
  // extension's genuine absence, not a stubbed-in default.
  return JSON.stringify({
    specversion: '1.0',
    id: 'evt-0001',
    source: '//orvex-studio-billing',
    type,
    subject: 'entitlement',
    time: '2026-07-01T00:00:00.000Z',
    datacontenttype: 'application/json',
    ...(orvexcell !== undefined ? { orvexcell } : {}),
    data,
  });
}

describe('TestEntitlementReaderEvictsOnBillingChange (ENG-2489 DoD gate)', () => {
  const WORKSPACE_ID = 'ws-entitlement-evict';
  let clock: FakeClock;
  let cache: InMemoryEntitlementCache;
  let port: StubBillingPort;
  let service: EntitlementService;
  let consumer: EntitlementChangedConsumer;

  beforeEach(() => {
    clock = new FakeClock();
    cache = new InMemoryEntitlementCache(clock, CACHE_TTL_SECONDS);
    port = new StubBillingPort(replayedCatalog(100));
    service = new EntitlementService(port, cache);
    consumer = new EntitlementChangedConsumer(cache as EntitlementCache);
  });

  it('AC1 — serves the entitlement from the short-TTL cache on a repeat read (one billing call for two reads)', async () => {
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(1);

    clock.advanceSeconds(10); // well within the 300s TTL
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(1); // cache hit — no second billing call

    // All effective entitlement fields present via the cache port.
    const cached = await cache.get({
      principal_type: 'org',
      principal_id: WORKSPACE_ID,
    });
    expect(cached).toBeDefined();
    expect(cached!.caps.wiki_max_pages).toBe(100);
    expect(cached!.caps.wiki_storage_bytes_aggregate).toBeDefined();
    expect(cached!.caps.wiki_max_file_bytes).toBeDefined();
    expect(cached!.caps.wiki_max_files).toBeDefined();
    expect(cached!.caps.wiki_max_members).toBeDefined();
    expect(cached!.caps.wiki_history_retention_versions).toBeDefined();
    expect(cached!.caps.wiki_history_retention_days).toBeDefined();
    expect(cached!.caps.ai_monthly_budget_gbp).toBeDefined();
  });

  it('DoD — a billing.entitlement.changed event evicts the cached entitlement and the next read re-fetches fresh values', async () => {
    // 1. Cached read within TTL (no re-fetch).
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    clock.advanceSeconds(5);
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(1);

    // 2. Billing changes the plan (cap shrinks 100 -> 10) and emits the
    //    CloudEvent. Drive the REAL wire payload through the consumer's
    //    message entry point — the same function the kafkajs eachMessage
    //    handler calls.
    port.catalog = replayedCatalog(10);
    const handled = await consumer.handleRawMessage(
      cloudEvent(BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE, {
        principal_type: 'org',
        principal_id: WORKSPACE_ID,
      }),
    );
    expect(handled).toBe(true);

    // 3. Next read re-fetches from the billing port (NOT the stale cache):
    //    usage 50 was fine under the old cap (100) but violates the new cap
    //    (10) — the rejection proves the fresh value is being enforced.
    await expect(
      service.assertWithinQuota(WORKSPACE_ID, 'pages', 50),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    expect(port.calls).toHaveLength(2);
  });

  it('security — the event is an eviction TRIGGER only: payload value fields are never trusted as the entitlement', async () => {
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(1);

    // A forged event smuggling a fabricated unlimited cap in its payload.
    const handled = await consumer.handleRawMessage(
      cloudEvent(BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE, {
        principal_type: 'org',
        principal_id: WORKSPACE_ID,
        caps: { wiki_max_pages: 0 }, // "uncapped" — must be ignored
        plan: 'enterprise',
      }),
    );
    expect(handled).toBe(true);

    // The next read comes from the authenticated billing port (cap 100),
    // never from the forged payload: usage 100 is AT the real cap → 402.
    await expect(
      service.assertWithinQuota(WORKSPACE_ID, 'pages', 100),
    ).rejects.toBeInstanceOf(QuotaExceededException);
    expect(port.calls).toHaveLength(2);
  });

  it('robustness — an unrelated/malformed event neither evicts nor crashes', async () => {
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(1);

    expect(
      await consumer.handleRawMessage(
        cloudEvent('billing.invoice.created', {
          principal_type: 'org',
          principal_id: WORKSPACE_ID,
        }),
      ),
    ).toBe(false);
    expect(
      await consumer.handleRawMessage(
        cloudEvent(BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE, {
          principal_type: 'martian', // invalid principal type
          principal_id: WORKSPACE_ID,
        }),
      ),
    ).toBe(false);
    expect(
      await consumer.handleRawMessage(
        cloudEvent(BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE, {}),
      ),
    ).toBe(false);
    expect(await consumer.handleRawMessage('this is not json')).toBe(false);

    // Cache untouched — the repeat read is still a hit (no second port call).
    clock.advanceSeconds(1);
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(1);
  });

  it('accepts the nested data.principal envelope shape', async () => {
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    const handled = await consumer.handleRawMessage(
      cloudEvent(BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE, {
        principal: { principal_type: 'org', principal_id: WORKSPACE_ID },
      }),
    );
    expect(handled).toBe(true);
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(2); // evicted → re-fetched
  });

  it('AC3 — the interim hardcode-Free constant is served behind the interface when the billing SoR is ABSENT', async () => {
    port.failWith = new BillingUnconfiguredError(
      'ORVEX_BILLING_API_URL is not configured',
    );

    // Under the interim Free page cap (200) — allowed.
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 199);

    // At the interim Free page cap — rejected with the constant's limit,
    // proving the fixed literal is what the interface serves.
    let caught: unknown;
    try {
      await service.assertWithinQuota(WORKSPACE_ID, 'pages', 200);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuotaExceededException);
    const body = (caught as QuotaExceededException).getResponse() as {
      limit: number;
    };
    expect(body.limit).toBe(INTERIM_FREE_ENTITLEMENT.caps.wiki_max_pages);
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_max_pages).toBe(200);
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_storage_bytes_aggregate).toBe(
      1_073_741_824,
    );
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_max_file_bytes).toBe(10_485_760);
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_max_files).toBe(2_000);
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_max_members).toBe(25);
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_history_retention_versions).toBe(
      10,
    );
    expect(INTERIM_FREE_ENTITLEMENT.caps.wiki_history_retention_days).toBe(180);
  });

  it('NFR operability — BOTH billing failing AND no cached projection fails CLOSED with the typed 503 (never an unbounded allow)', async () => {
    port.failWith = new Error('connection refused'); // unreachable ≠ absent

    let caught: unknown;
    try {
      await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EntitlementUnavailableException);
    expect((caught as EntitlementUnavailableException).getStatus()).toBe(503);
    expect((caught as EntitlementUnavailableException).getResponse()).toEqual({
      error: 'ENTITLEMENT_UNAVAILABLE',
    });
  });

  it('survives an internal rename — asserts only observable read/evict behaviour through exported surfaces', async () => {
    // This test intentionally references NO private helper (no buildKey, no
    // toPrincipal): evict through the exported port, observe through the
    // exported service methods.
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    await cache.evict({ principal_type: 'org', principal_id: WORKSPACE_ID });
    await service.assertWithinQuota(WORKSPACE_ID, 'pages', 0);
    expect(port.calls).toHaveLength(2);
  });
});

describe('C-cell — event-path cell guard on EntitlementChangedConsumer (fleet AD-4/AD-13)', () => {
  // The mirror of DomainMiddleware's HTTP-path guard, on the event path: an
  // absent/empty/foreign `orvexcell` extension must be DROPPED before any
  // eviction is issued, never dispatched to the handler on trust. No-op
  // under the `solo` sentinel or an unconfigured CELL_ID — matching every
  // other cell check in this repo (`OrvexConfigService` built with an
  // EXPLICIT env bag, never ambient `process.env`, mirroring
  // domain.middleware.spec.ts's own convention).
  const WORKSPACE_ID = 'ws-entitlement-cell-guard';

  function buildConsumer(cellId?: string): {
    consumer: EntitlementChangedConsumer;
    cache: InMemoryEntitlementCache;
  } {
    const clock = new FakeClock();
    const cache = new InMemoryEntitlementCache(clock, CACHE_TTL_SECONDS);
    const orvexConfig = new OrvexConfigService(
      (cellId === undefined ? {} : { CELL_ID: cellId }) as NodeJS.ProcessEnv,
    );
    const consumer = new EntitlementChangedConsumer(
      cache as EntitlementCache,
      undefined,
      orvexConfig,
    );
    return { consumer, cache };
  }

  it('evicts when the event orvexcell matches this deployment cell', async () => {
    const { consumer } = buildConsumer('eu1');
    const handled = await consumer.handleRawMessage(
      cloudEvent(
        BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
        { principal_type: 'org', principal_id: WORKSPACE_ID },
        'eu1',
      ),
    );
    expect(handled).toBe(true);
  });

  it('drops the event when orvexcell is a FOREIGN cell — no eviction', async () => {
    const { consumer } = buildConsumer('eu1');
    const handled = await consumer.handleRawMessage(
      cloudEvent(
        BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
        { principal_type: 'org', principal_id: WORKSPACE_ID },
        'us1',
      ),
    );
    expect(handled).toBe(false);
  });

  it('drops the event when orvexcell is ABSENT entirely — no eviction (the gap this guard closes)', async () => {
    const { consumer } = buildConsumer('eu1');
    const handled = await consumer.handleRawMessage(
      cloudEvent(
        BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
        { principal_type: 'org', principal_id: WORKSPACE_ID },
        // no orvexcell arg — genuinely absent from the envelope
      ),
    );
    expect(handled).toBe(false);
  });

  it('drops the event when orvexcell is an empty/whitespace-only string', async () => {
    const { consumer } = buildConsumer('eu1');
    for (const blank of ['', '   ']) {
      const handled = await consumer.handleRawMessage(
        cloudEvent(
          BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
          { principal_type: 'org', principal_id: WORKSPACE_ID },
          blank,
        ),
      );
      expect(handled).toBe(false);
    }
  });

  it('is a no-op under the `solo` sentinel — a foreign/absent orvexcell still evicts (enforcement off entirely)', async () => {
    const { consumer } = buildConsumer('solo');
    for (const orvexcell of [undefined, '', 'us1'] as const) {
      const handled = await consumer.handleRawMessage(
        cloudEvent(
          BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
          { principal_type: 'org', principal_id: WORKSPACE_ID },
          orvexcell,
        ),
      );
      expect(handled).toBe(true);
    }
  });

  it('is a no-op with CELL_ID unset (null-on-unset semantics, matching DomainMiddleware)', async () => {
    const { consumer } = buildConsumer(undefined);
    const handled = await consumer.handleRawMessage(
      cloudEvent(
        BILLING_ENTITLEMENT_CHANGED_EVENT_TYPE,
        { principal_type: 'org', principal_id: WORKSPACE_ID },
        // absent orvexcell too — still passes, enforcement is off
      ),
    );
    expect(handled).toBe(true);
  });
});

describe('TestPaidPlanSwapGuardBlocksWhileHardcoded (ENG-2489 AC4)', () => {
  it('the shipped sellable-plan set is exactly free-only while the interim constant is active', () => {
    expect([...SELLABLE_PLAN_IDS]).toEqual(['free']);
    expect(() => assertNoPaidPlanSellableWhileInterimFree()).not.toThrow();
  });

  it('marking a paid plan sellable while the interim fallback is active fails the guard loudly', () => {
    expect(() =>
      assertNoPaidPlanSellableWhileInterimFree(['free', 'teams']),
    ).toThrow(/swap-point guard/);
    expect(() =>
      assertNoPaidPlanSellableWhileInterimFree(['enterprise']),
    ).toThrow(/paid plan/);
  });
});

describe('TestNoPlanNumberOutsideEntitlementReader (ENG-2489 AC5)', () => {
  // Targeted grep for the DISTINCTIVE interim-Free literal values (the byte
  // caps — unambiguous, unlike `200`/`25` which legitimately appear as HTTP
  // statuses etc.) plus the constant's own symbol name, anywhere outside
  // orvex/entitlement/ and non-spec code.
  const SRC_ROOT = join(__dirname, '..', '..');
  const FORBIDDEN = [/1073741824/, /1_073_741_824/, /10485760/, /10_485_760/, /INTERIM_FREE_ENTITLEMENT/];

  function walk(dir: string, hits: string[]): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (full.includes(join('orvex', 'entitlement'))) continue;
        walk(full, hits);
      } else if (
        full.endsWith('.ts') &&
        !full.endsWith('.spec.ts') &&
        !full.endsWith('.itest.ts')
      ) {
        const content = readFileSync(full, 'utf8');
        if (FORBIDDEN.some((re) => re.test(content))) {
          hits.push(full);
        }
      }
    }
  }

  it('no interim-Free plan literal appears outside orvex/entitlement', () => {
    const hits: string[] = [];
    walk(SRC_ROOT, hits);
    expect(hits).toEqual([]);
  });
});
