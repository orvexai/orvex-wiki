// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * TestEntitlementClientFailConsistentSemantics (TS leg) — ENG-2377 T4/T5.
 *
 * The named DoD gate: drives the SAME committed gates/entitlements/
 * fixtures (vendored byte-for-byte content from orvex-studio-contracts, as
 * JSON — see entitlement-gates-loader.ts and gates/PIN) against
 * EntitlementService's own exported public surface
 * (`hasFeature`/`assertWithinQuota`/`hasFeatureFor`, which route through
 * `resolve()`) — never against the service's private cache/billing-port
 * internals (CS §4.2 behaviour-through-interface). The fake billing server
 * is a real in-process HTTP server (Node's own `http` module) implementing
 * `BillingEntitlementPort` — never a mock of `EntitlementService`'s own
 * resolve/cache logic (CS ❌#4). Every staleness-bound assertion uses an
 * injected `Clock`, never a real `setTimeout`/wall-clock wait (CS ❌#9).
 *
 * This is a VERIFY+harden pass for AC1-AC4 (the existing trio already
 * implements cache-first/LKG-fallback/fail-closed-only-when-both-miss,
 * entitlement.service.ts:57-81) and a genuinely NEW leg for AC5
 * (delegated-principal keying via the new `hasFeatureFor` entry point).
 */

import * as http from 'http';
import { AddressInfo } from 'net';
import { EntitlementService } from './entitlement.service';
import {
  InMemoryEntitlementCache,
  Clock as CacheClock,
} from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import { EntitlementCheckResponse, GatedFeature } from './entitlement.types';
import {
  loadAllGateCases,
  GateCase,
  FixtureStep,
} from './entitlement-gates-loader';

/** A fake clock test double — advanced explicitly, never a real timer. */
class FakeClock implements CacheClock {
  private ms: number;
  constructor(baseIso = '2026-07-20T10:00:00.000Z') {
    this.ms = Date.parse(baseIso);
  }
  now(): number {
    return this.ms;
  }
  advanceTo(offsetSeconds: number): void {
    this.ms = Date.parse('2026-07-20T10:00:00.000Z') + offsetSeconds * 1000;
  }
}

/**
 * A real in-process HTTP server standing in for billing (CS §5 Row 4 —
 * true-external boundary). scriptedStatus/scriptedBody are mutated by the
 * test to change behaviour mid-case (e.g. "succeed once then fail").
 */
class FakeBillingServer {
  private server: http.Server;
  public url = '';
  public requestPaths: string[] = [];
  public responder: (path: string) => { status: number; body?: unknown } = () => ({
    status: 503,
  });

  constructor() {
    this.server = http.createServer((req, res) => {
      const p = req.url ?? '';
      this.requestPaths.push(p);
      const { status, body } = this.responder(p);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body !== undefined ? JSON.stringify(body) : undefined);
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, resolve));
    const addr = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${addr.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

/** Builds a BillingEntitlementPort that calls a FakeBillingServer over real HTTP. */
function portFor(fake: FakeBillingServer): BillingEntitlementPort {
  return {
    async checkEntitlement(principal) {
      const url = `${fake.url}/v1/entitlements/${principal.principal_type}/${principal.principal_id}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`billing entitlement check failed: ${res.status}`);
      }
      return (await res.json()) as EntitlementCheckResponse;
    },
  };
}

describe('TestEntitlementClientFailConsistentSemantics (TS)', () => {
  let cases: GateCase[];

  beforeAll(() => {
    cases = loadAllGateCases();
  });

  it('loads exactly the 5 AC1-AC5 fixture cases (❌#6 — no speculative case)', () => {
    expect(cases).toHaveLength(5);
    expect(cases.map((c) => c.id).sort()).toEqual(
      [
        'reachable-warm-hit',
        'unreachable-within-bound',
        'unreachable-past-bound',
        'never-seen-free-default',
        'delegated-principal',
      ].sort(),
    );
  });

  it('AC1: reachable-warm-hit — cache-hit with zero further HTTP calls, refill on TTL/evict', async () => {
    const gc = cases.find((c) => c.id === 'reachable-warm-hit')!;
    const fake = new FakeBillingServer();
    await fake.start();
    fake.responder = () => ({ status: 200, body: gc.billing_server.response });

    const clock = new FakeClock();
    // TTL is enforced by the SAME staleness_bound_seconds this fixture set
    // is authored against (the manifest's own figure) — never a hardcoded
    // tighter number (5d — do not snapshot a tighter magic value).
    const ttlSeconds = 300;
    const cache = new InMemoryEntitlementCache(clock, ttlSeconds);
    const service = new EntitlementService(portFor(fake), cache);
    const workspaceId = gc.principal!.principal_id;

    let prevCalls = 0;
    for (const step of gc.steps) {
      if (step.at_clock_offset_seconds !== undefined) {
        clock.advanceTo(step.at_clock_offset_seconds);
      }
      if (step.action === 'evict') {
        await cache.evict({
          principal_type: gc.principal!.principal_type,
          principal_id: workspaceId,
        });
        continue;
      }
      if (step.action === 'resolve') {
        const ok = await service.hasFeature(workspaceId, 'composer' as GatedFeature);
        expect(ok).toBe(true); // reachable-warm-hit's fixture grants 'composer'
        const wantBillingCall = step.expect?.billing_call as boolean;
        const madeCall = fake.requestPaths.length > prevCalls;
        expect(madeCall).toBe(wantBillingCall);
        prevCalls = fake.requestPaths.length;
      }
    }
    await fake.stop();
  });

  it('AC2 (1/2): unreachable-within-bound — LKG honored within the staleness bound', async () => {
    const gc = cases.find((c) => c.id === 'unreachable-within-bound')!;
    const fake = new FakeBillingServer();
    await fake.start();
    let billingUp = true;
    fake.responder = () =>
      billingUp ? { status: 200, body: gc.billing_server.response } : { status: 503 };

    const clock = new FakeClock();
    const cache = new InMemoryEntitlementCache(clock, 300);
    const service = new EntitlementService(portFor(fake), cache);
    const workspaceId = gc.principal!.principal_id;

    for (let i = 0; i < gc.steps.length; i++) {
      const step: FixtureStep = gc.steps[i];
      if (step.at_clock_offset_seconds !== undefined) {
        clock.advanceTo(step.at_clock_offset_seconds);
      }
      if (i === 1) {
        billingUp = false; // billing "becomes unreachable" from step 2 onward
      }
      await expect(
        service.assertWithinQuota(workspaceId, 'members', 0),
      ).resolves.toBeUndefined();
    }
    await fake.stop();
  });

  it('AC2 (2/2): unreachable-past-bound — honest degrade past the staleness bound', async () => {
    const gc = cases.find((c) => c.id === 'unreachable-past-bound')!;
    const fake = new FakeBillingServer();
    await fake.start();
    let billingUp = true;
    fake.responder = () =>
      billingUp ? { status: 200, body: gc.billing_server.response } : { status: 503 };

    const clock = new FakeClock();
    const cache = new InMemoryEntitlementCache(clock, 300);
    const service = new EntitlementService(portFor(fake), cache);
    const workspaceId = gc.principal!.principal_id;

    for (let i = 0; i < gc.steps.length; i++) {
      const step: FixtureStep = gc.steps[i];
      if (step.at_clock_offset_seconds !== undefined) {
        clock.advanceTo(step.at_clock_offset_seconds);
      }
      if (i === 1) {
        billingUp = false;
      }
      if (step.action === 'evict') {
        await cache.evict({
          principal_type: gc.principal!.principal_type,
          principal_id: workspaceId,
        });
        continue;
      }
      const wantResult = step.expect?.result as string;
      if (wantResult === 'success') {
        await expect(
          service.assertWithinQuota(workspaceId, 'members', 0),
        ).resolves.toBeUndefined();
      } else if (wantResult === 'typed_unavailable_error') {
        await expect(
          service.assertWithinQuota(workspaceId, 'members', 0),
        ).rejects.toMatchObject({ status: 503 });
      }
    }
    await fake.stop();
  });

  it('AC3: never-seen-free-default — a 200 Free body resolves Free with every gated feature denied', async () => {
    const gc = cases.find((c) => c.id === 'never-seen-free-default')!;
    const fake = new FakeBillingServer();
    await fake.start();
    fake.responder = () => ({ status: 200, body: gc.billing_server.response });

    const service = new EntitlementService(
      portFor(fake),
      new InMemoryEntitlementCache(),
    );
    const workspaceId = gc.principal!.principal_id;

    for (const feature of [
      'composer',
      'ask_wiki',
      'improve_with_ai',
      'memory_coach',
      'curator_distillation',
    ] as GatedFeature[]) {
      await expect(service.hasFeature(workspaceId, feature)).resolves.toBe(
        false,
      );
    }
    await fake.stop();
  });

  it('AC5: delegated-principal — the request + cache key on the acted-for principal, never the caller', async () => {
    const gc = cases.find((c) => c.id === 'delegated-principal')!;
    const fake = new FakeBillingServer();
    await fake.start();
    fake.responder = () => ({ status: 200, body: gc.billing_server.response });

    const service = new EntitlementService(
      portFor(fake),
      new InMemoryEntitlementCache(),
    );

    const actingFor = {
      principal_type: gc.acting_for_principal!.principal_type,
      principal_id: gc.acting_for_principal!.principal_id,
    };
    const callerPrincipalId = gc.caller_principal!.principal_id;

    const ok = await service.hasFeatureFor(actingFor, 'composer' as GatedFeature);
    expect(ok).toBe(true);

    expect(fake.requestPaths).toEqual([
      `/v1/entitlements/${actingFor.principal_type}/${actingFor.principal_id}`,
    ]);
    for (const p of fake.requestPaths) {
      expect(p).not.toContain(callerPrincipalId);
    }
    await fake.stop();
  });
});
