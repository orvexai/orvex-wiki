// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpBillingEntitlementPort } from './entitlement-http-billing.port';
import { BillingServiceCredentialProvider } from './billing-service-credential';
import { EnvironmentService } from '../../integrations/environment/environment.service';

/**
 * ENG-1382 fix pass 1 (F2, review1) — `HttpBillingEntitlementPort` must
 * fail CLOSED (throw, so `EntitlementService.resolve` falls back to cache
 * or the 503 `EntitlementUnavailableException`) on a 2xx response that does
 * NOT carry a well-formed `caps` object. Before this fix, a 200 missing
 * `caps` produced `capValueForResource(...) === undefined`, which made
 * `assertWithinQuota`'s `currentUsage >= limit` compare against `undefined`
 * and silently ALLOW — an unbounded-allow zero-trust gap (ruling 5 / CS §10).
 * Only `fetch` (a true external — billing's live HTTP API) is mocked here;
 * everything else runs through the real port.
 */
function fixtureCaps() {
  return {
    ai_monthly_budget_gbp: 0,
    embedding_monthly_budget_gbp: 0,
    curator_distillation_monthly: 0,
    trial_weekly_actions_advisory: 0,
    trial_weekly_actions_throttle: 0,
    demo_ai_actions: 20,
    wiki_max_pages: 200,
    wiki_storage_bytes_aggregate: 1_000_000_000,
    wiki_max_file_bytes: 10_000_000,
    wiki_max_files: 2000,
    wiki_max_members: 25,
    wiki_history_retention_versions: 10,
    wiki_history_retention_days: 180,
  };
}

function fixtureBody(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'free',
    plan_version: 'v1',
    features: [],
    caps: fixtureCaps(),
    trial: { state: 'none' },
    throttle: { state: 'none' },
    version: 'v1',
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function environmentServiceStub(): EnvironmentService {
  return {
    getBillingApiUrl: () => 'https://billing.internal.test',
  } as unknown as EnvironmentService;
}

function mockFetchOnce(status: number, body: unknown) {
  (global as unknown as { fetch: typeof fetch }).fetch = jest
    .fn()
    .mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
}

describe('HttpBillingEntitlementPort', () => {
  const principal = { principal_type: 'org' as const, principal_id: 'ws-1' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves a well-formed 200 catalog response', async () => {
    mockFetchOnce(200, fixtureBody());
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      {
        isConfigured: () => true,
        assertionFor: async () => 'header.payload.signature',
        evict: () => undefined,
      } as unknown as BillingServiceCredentialProvider,
    );

    await expect(port.checkEntitlement(principal)).resolves.toMatchObject({
      plan: 'free',
      caps: fixtureCaps(),
    });
  });

  it('F2: throws (fails closed) on a 200 whose body has no `caps` field at all', async () => {
    const { caps: _drop, ...withoutCaps } = fixtureBody();
    mockFetchOnce(200, withoutCaps);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      {
        isConfigured: () => true,
        assertionFor: async () => 'header.payload.signature',
        evict: () => undefined,
      } as unknown as BillingServiceCredentialProvider,
    );

    await expect(port.checkEntitlement(principal)).rejects.toThrow();
  });

  it('F2: throws (fails closed) on a 200 whose `caps` is missing a required cap field', async () => {
    const body = fixtureBody();
    delete (body.caps as Record<string, unknown>).wiki_max_pages;
    mockFetchOnce(200, body);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      {
        isConfigured: () => true,
        assertionFor: async () => 'header.payload.signature',
        evict: () => undefined,
      } as unknown as BillingServiceCredentialProvider,
    );

    await expect(port.checkEntitlement(principal)).rejects.toThrow();
  });

  it('F2: throws (fails closed) on a 200 whose `caps` field is non-numeric', async () => {
    const body = fixtureBody({
      caps: { ...fixtureCaps(), wiki_max_members: 'unlimited' },
    });
    mockFetchOnce(200, body);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      {
        isConfigured: () => true,
        assertionFor: async () => 'header.payload.signature',
        evict: () => undefined,
      } as unknown as BillingServiceCredentialProvider,
    );

    await expect(port.checkEntitlement(principal)).rejects.toThrow();
  });

  it('F2: throws (fails closed) on a 200 that is not even an object (e.g. null)', async () => {
    mockFetchOnce(200, null);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      {
        isConfigured: () => true,
        assertionFor: async () => 'header.payload.signature',
        evict: () => undefined,
      } as unknown as BillingServiceCredentialProvider,
    );

    await expect(port.checkEntitlement(principal)).rejects.toThrow();
  });
});

// fix/wiki-billing-delegated-credential — billing requires a billing:read
// X-Orvex-Assertion since d2d459b; an anonymous call 401s (new-user setup).
describe('HttpBillingEntitlementPort service credential', () => {
  const org = { principal_type: 'org' as const, principal_id: 'ws-1' };

  function creds(
    over: Partial<
      Record<'isConfigured' | 'assertionFor' | 'evict', jest.Mock>
    > = {},
  ) {
    return {
      isConfigured: over.isConfigured ?? jest.fn().mockReturnValue(true),
      assertionFor: over.assertionFor ?? jest.fn().mockResolvedValue('h.p.s'),
      evict: over.evict ?? jest.fn(),
    } as unknown as BillingServiceCredentialProvider &
      Record<string, jest.Mock>;
  }

  afterEach(() => jest.restoreAllMocks());

  it('fails closed without identity credential configuration', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    const c = creds({ isConfigured: jest.fn().mockReturnValue(false) });
    const port = new HttpBillingEntitlementPort(environmentServiceStub(), c);
    await expect(port.checkEntitlement(org)).rejects.toThrow(
      'identity credentials are not configured',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the tenant-bound assertion for an org principal', async () => {
    mockFetchOnce(200, fixtureBody());
    const c = creds();
    const port = new HttpBillingEntitlementPort(environmentServiceStub(), c);
    await port.checkEntitlement(org);
    expect(c.assertionFor).toHaveBeenCalledWith('ws-1');
    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers['x-orvex-assertion']).toBe('h.p.s');
    expect(init.headers.authorization).toBeUndefined();
  });

  it('does not request a service credential for a user principal', async () => {
    mockFetchOnce(200, fixtureBody());
    const c = creds();
    const port = new HttpBillingEntitlementPort(environmentServiceStub(), c);
    await port.checkEntitlement({
      principal_type: 'user',
      principal_id: 'u-1',
    });
    expect(c.assertionFor).not.toHaveBeenCalled();
  });

  it('fails (no anonymous billing call) when identity refuses the credential', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    const c = creds({
      assertionFor: jest.fn().mockRejectedValue(new Error('refused')),
    });
    const port = new HttpBillingEntitlementPort(environmentServiceStub(), c);
    await expect(port.checkEntitlement(org)).rejects.toThrow('refused');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([401, 403, 421])(
    'evicts the cached assertion when billing answers %i',
    async (status) => {
      mockFetchOnce(status, {});
      const c = creds();
      const port = new HttpBillingEntitlementPort(environmentServiceStub(), c);
      await expect(port.checkEntitlement(org)).rejects.toThrow(String(status));
      expect(c.evict).toHaveBeenCalledWith('ws-1');
    },
  );
});
