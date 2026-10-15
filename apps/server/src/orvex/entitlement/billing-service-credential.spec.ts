// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { OrvexConfigService } from '../config/orvex-config.service';
import {
  BILLING_SERVICE_TARGET,
  BillingServiceCredentialProvider,
} from './billing-service-credential';

const SEAM = 'seam-secret-fixture';

function jws(exp: number): string {
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'ES256' })}.${enc({ exp, tenant: 'ws-1' })}.sig`;
}

function config(identityUrl: string | null, token: string | null) {
  return {
    identityUrl,
    internalApiBearerToken: token,
  } as unknown as OrvexConfigService;
}

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    });
  }
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

describe('BillingServiceCredentialProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requests a tenant-bound billing assertion from identity with the seam secret', async () => {
    const now = 1_000_000_000_000;
    const token = jws(now / 1000 + 120);
    const fetchMock = mockFetch({ status: 200, body: { assertion: token } });
    const p = new BillingServiceCredentialProvider(
      config('https://identity.internal/', SEAM),
      () => now,
    );

    await expect(p.assertionFor('ws-1')).resolves.toBe(token);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://identity.internal/internal/service-assertion');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${SEAM}`);
    // No scope is ever requested — identity fixes it.
    expect(JSON.parse(init.body)).toEqual({
      tenant: 'ws-1',
      target: BILLING_SERVICE_TARGET,
    });
  });

  it('caches per tenant until shortly before exp, then refreshes', async () => {
    let now = 1_000_000_000_000;
    const first = jws(now / 1000 + 120);
    const second = jws(now / 1000 + 240);
    const fetchMock = mockFetch(
      { status: 200, body: { assertion: first } },
      { status: 200, body: { assertion: second } },
    );
    const p = new BillingServiceCredentialProvider(
      config('https://id', SEAM),
      () => now,
    );

    expect(await p.assertionFor('ws-1')).toBe(first);
    now += 89_000;
    expect(await p.assertionFor('ws-1')).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 1_000; // the 90-second reuse ceiling refreshes before this 120s TTL
    expect(await p.assertionFor('ws-1')).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never shares an assertion across tenants', async () => {
    const now = 1_000_000_000_000;
    const a = jws(now / 1000 + 120);
    const b = jws(now / 1000 + 121);
    const fetchMock = mockFetch(
      { status: 200, body: { assertion: a } },
      { status: 200, body: { assertion: b } },
    );
    const p = new BillingServiceCredentialProvider(
      config('https://id', SEAM),
      () => now,
    );
    expect(await p.assertionFor('ws-a')).toBe(a);
    expect(await p.assertionFor('ws-b')).toBe(b);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tenant).toBe('ws-b');
  });

  it('evict forces a fresh mint', async () => {
    const now = 1_000_000_000_000;
    const fetchMock = mockFetch(
      { status: 200, body: { assertion: jws(now / 1000 + 120) } },
      { status: 200, body: { assertion: jws(now / 1000 + 120) } },
    );
    const p = new BillingServiceCredentialProvider(
      config('https://id', SEAM),
      () => now,
    );
    await p.assertionFor('ws-1');
    p.evict('ws-1');
    await p.assertionFor('ws-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws (never returns empty) when identity refuses or answers garbage', async () => {
    mockFetch({ status: 401, body: { error: 'unauthorized' } });
    const p = new BillingServiceCredentialProvider(config('https://id', SEAM));
    await expect(p.assertionFor('ws-1')).rejects.toThrow(/status 401/);

    mockFetch({ status: 200, body: { nope: true } });
    await expect(p.assertionFor('ws-1')).rejects.toThrow(/no assertion/);
  });

  it('reports unconfigured and refuses without identity URL or seam secret', async () => {
    const fetchMock = mockFetch();
    for (const c of [config(null, SEAM), config('https://id', null)]) {
      const p = new BillingServiceCredentialProvider(c);
      expect(p.isConfigured()).toBe(false);
      await expect(p.assertionFor('ws-1')).rejects.toThrow(/not configured/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
