// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  FetchLike,
  HttpIdentityIntrospector,
  NotConfiguredIntrospector,
  OrvexIntrospectionNotConfiguredError,
} from './identity-introspector';

/**
 * Build a fake fetch that records the last call and returns a canned response.
 * The introspection endpoint is a NETWORK SEAM, so faking it here is the seam
 * (ACCEPT-DON'T-CREATE) — no real HTTP.
 */
function fakeFetch(response: {
  status: number;
  json: unknown;
}): { fetch: FetchLike; calls: Array<{ url: string; init: unknown }> } {
  const calls: Array<{ url: string; init: unknown }> = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({
      status: response.status,
      json: () => Promise.resolve(response.json),
    });
  };
  return { fetch, calls };
}

const ACTIVE = {
  active: true,
  principal: { subject: 'sub-abc', tenant: 'ws-uuid-1', idp: 'clerk' },
};

describe('HttpIdentityIntrospector', () => {
  it('resolves an ACTIVE token to {subject, workspaceId=tenant}', async () => {
    const { fetch, calls } = fakeFetch({ status: 200, json: ACTIVE });
    const introspector = new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local',
      introspectionAuth: null,
      timeoutMs: 1000,
      fetch,
    });

    const principal = await introspector.introspect('opaque-token');

    expect(principal).toEqual({ subject: 'sub-abc', workspaceId: 'ws-uuid-1' });
    // Hits the identity introspect path with the token in the body.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://identity.local/v1/introspect');
    expect(JSON.parse((calls[0].init as { body: string }).body)).toEqual({
      token: 'opaque-token',
    });
  });

  it('trims a trailing slash on the base URL (never doubles the path)', async () => {
    const { fetch, calls } = fakeFetch({ status: 200, json: ACTIVE });
    const introspector = new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local/',
      introspectionAuth: null,
      timeoutMs: 1000,
      fetch,
    });
    await introspector.introspect('t');
    expect(calls[0].url).toBe('http://identity.local/v1/introspect');
  });

  it('sends the optional introspection bearer only when configured', async () => {
    const withAuth = fakeFetch({ status: 200, json: ACTIVE });
    await new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local',
      introspectionAuth: 'introspect-secret',
      timeoutMs: 1000,
      fetch: withAuth.fetch,
    }).introspect('t');
    expect(
      (withAuth.calls[0].init as { headers: Record<string, string> }).headers
        .Authorization,
    ).toBe('Bearer introspect-secret');

    const noAuth = fakeFetch({ status: 200, json: ACTIVE });
    await new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local',
      introspectionAuth: null,
      timeoutMs: 1000,
      fetch: noAuth.fetch,
    }).introspect('t');
    expect(
      (noAuth.calls[0].init as { headers: Record<string, string> }).headers
        .Authorization,
    ).toBeUndefined();
  });

  it('DENIES (null) an inactive token', async () => {
    const { fetch } = fakeFetch({ status: 200, json: { active: false } });
    const introspector = new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local',
      introspectionAuth: null,
      timeoutMs: 1000,
      fetch,
    });
    expect(await introspector.introspect('t')).toBeNull();
  });

  it('DENIES (null) an active response with no principal', async () => {
    const { fetch } = fakeFetch({ status: 200, json: { active: true } });
    const introspector = new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local',
      introspectionAuth: null,
      timeoutMs: 1000,
      fetch,
    });
    expect(await introspector.introspect('t')).toBeNull();
  });

  it('DENIES (null) an active principal missing subject or tenant', async () => {
    const make = (principal: unknown) =>
      new HttpIdentityIntrospector({
        baseUrl: 'http://identity.local',
        introspectionAuth: null,
        timeoutMs: 1000,
        fetch: fakeFetch({ status: 200, json: { active: true, principal } })
          .fetch,
      });
    expect(await make({ tenant: 'ws-1' }).introspect('t')).toBeNull(); // no subject
    expect(await make({ subject: 'sub-1' }).introspect('t')).toBeNull(); // no tenant
    expect(
      await make({ subject: '  ', tenant: 'ws-1' }).introspect('t'),
    ).toBeNull(); // blank subject
    expect(
      await make({ subject: 'sub-1', tenant: '' }).introspect('t'),
    ).toBeNull(); // blank tenant
  });

  it('THROWS on a non-2xx (dependency/defect, never a silent deny or accept)', async () => {
    const { fetch } = fakeFetch({ status: 500, json: {} });
    const introspector = new HttpIdentityIntrospector({
      baseUrl: 'http://identity.local',
      introspectionAuth: null,
      timeoutMs: 1000,
      fetch,
    });
    await expect(introspector.introspect('t')).rejects.toThrow('HTTP 500');
  });
});

describe('NotConfiguredIntrospector', () => {
  it('fails closed with the typed NOT_CONFIGURED error (never a fabricated principal)', async () => {
    await expect(
      new NotConfiguredIntrospector().introspect('t'),
    ).rejects.toBeInstanceOf(OrvexIntrospectionNotConfiguredError);
  });
});
