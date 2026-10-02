// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpBillingEntitlementPort } from './entitlement-http-billing.port';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OrvexConfigService } from '../config/orvex-config.service';

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

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetchSequence(...responses: Response[]) {
  const fetchMock = jest.fn();
  for (const item of responses) fetchMock.mockResolvedValueOnce(item);
  (global as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function mockFetchOnce(status: number, body: unknown) {
  return mockFetchSequence(
    response(200, { assertion: 'delegated-billing-assertion' }),
    response(status, body),
  );
}

function configServiceStub(
  identityUrl: string | null = 'http://identity.internal.test',
) {
  return new OrvexConfigService(
    identityUrl ? { ORVEX_IDENTITY_URL: identityUrl } : {},
  );
}

describe('HttpBillingEntitlementPort', () => {
  const principal = { principal_type: 'org' as const, principal_id: 'ws-1' };
  const inboundAssertion = 'verified-wiki-assertion';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves a well-formed 200 catalog response', async () => {
    mockFetchOnce(200, fixtureBody());
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(
      port.checkEntitlement(principal, inboundAssertion),
    ).resolves.toMatchObject({
      plan: 'free',
      caps: fixtureCaps(),
    });
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://identity.internal.test/internal/edge-delegate',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: {
        'X-Orvex-Assertion': inboundAssertion,
        'X-Orvex-Target-Service': 'orvex-studio-billing',
      },
    });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://billing.internal.test/v1/entitlements/org/ws-1',
    );
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      'X-Orvex-Assertion': 'delegated-billing-assertion',
    });
  });

  it('F2: throws (fails closed) on a 200 whose body has no `caps` field at all', async () => {
    const { caps: _drop, ...withoutCaps } = fixtureBody();
    mockFetchOnce(200, withoutCaps);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(
      port.checkEntitlement(principal, inboundAssertion),
    ).rejects.toThrow();
  });

  it('F2: throws (fails closed) on a 200 whose `caps` is missing a required cap field', async () => {
    const body = fixtureBody();
    delete (body.caps as Record<string, unknown>).wiki_max_pages;
    mockFetchOnce(200, body);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(
      port.checkEntitlement(principal, inboundAssertion),
    ).rejects.toThrow();
  });

  it('F2: throws (fails closed) on a 200 whose `caps` field is non-numeric', async () => {
    const body = fixtureBody({
      caps: { ...fixtureCaps(), wiki_max_members: 'unlimited' },
    });
    mockFetchOnce(200, body);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(
      port.checkEntitlement(principal, inboundAssertion),
    ).rejects.toThrow();
  });

  it('F2: throws (fails closed) on a 200 that is not even an object (e.g. null)', async () => {
    mockFetchOnce(200, null);
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(
      port.checkEntitlement(principal, inboundAssertion),
    ).rejects.toThrow();
  });

  it('requires the verified inbound assertion when billing is configured', async () => {
    const fetchMock = mockFetchSequence();
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(port.checkEntitlement(principal)).rejects.toThrow(
      'Wiki edge assertion is required',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call billing when identity refuses the edge delegation', async () => {
    const fetchMock = mockFetchSequence(
      response(401, { error: 'unauthorized' }),
    );
    const port = new HttpBillingEntitlementPort(
      environmentServiceStub(),
      configServiceStub(),
    );

    await expect(
      port.checkEntitlement(principal, inboundAssertion),
    ).rejects.toThrow('edge delegation failed with status 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
