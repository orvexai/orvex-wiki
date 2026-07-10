// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  bearerTokenMatches,
  ipMatchesAny,
  ipMatchesCidr,
  isMetricsRequestAuthorized,
  readMetricsAuthConfig,
} from './metrics-auth';

describe('isMetricsRequestAuthorized (AC4 — fail-closed)', () => {
  it('denies when neither allowedCidrs nor bearerToken is configured', () => {
    expect(
      isMetricsRequestAuthorized(
        { allowedCidrs: [], bearerToken: null },
        '10.1.2.3',
        undefined,
      ),
    ).toBe(false);
  });

  it('denies an unconfigured request even with a bearer header present', () => {
    expect(
      isMetricsRequestAuthorized(
        { allowedCidrs: [], bearerToken: null },
        '10.1.2.3',
        'Bearer whatever',
      ),
    ).toBe(false);
  });
});

describe('isMetricsRequestAuthorized (AC1 — bearer path)', () => {
  it('authorizes a matching bearer token', () => {
    expect(
      isMetricsRequestAuthorized(
        { allowedCidrs: [], bearerToken: 'secret' },
        '203.0.113.9',
        'Bearer secret',
      ),
    ).toBe(true);
  });

  it('denies a mismatched bearer token', () => {
    expect(
      isMetricsRequestAuthorized(
        { allowedCidrs: [], bearerToken: 'secret' },
        '203.0.113.9',
        'Bearer nope',
      ),
    ).toBe(false);
  });
});

describe('isMetricsRequestAuthorized (AC5 — CIDR path)', () => {
  const config = { allowedCidrs: ['10.0.0.0/8'], bearerToken: null };

  it('authorizes an in-range source IP', () => {
    expect(isMetricsRequestAuthorized(config, '10.1.2.3', undefined)).toBe(
      true,
    );
  });

  it('denies an out-of-range source IP', () => {
    expect(isMetricsRequestAuthorized(config, '192.168.0.1', undefined)).toBe(
      false,
    );
  });
});

describe('ipMatchesCidr', () => {
  it('matches an IPv4 address within range', () => {
    expect(ipMatchesCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
  });

  it('rejects an IPv4 address outside range', () => {
    expect(ipMatchesCidr('192.168.0.1', '10.0.0.0/8')).toBe(false);
  });

  it('matches an IPv4-mapped IPv6 address (::ffff:) within range', () => {
    expect(ipMatchesCidr('::ffff:10.1.2.3', '10.0.0.0/8')).toBe(true);
  });

  it('rejects an IPv4-mapped IPv6 address outside range', () => {
    expect(ipMatchesCidr('::ffff:192.168.0.1', '10.0.0.0/8')).toBe(false);
  });

  it('returns false for a malformed CIDR', () => {
    expect(ipMatchesCidr('10.1.2.3', 'not-a-cidr')).toBe(false);
  });

  it('returns false for a malformed IP', () => {
    expect(ipMatchesCidr('not-an-ip', '10.0.0.0/8')).toBe(false);
  });
});

describe('ipMatchesAny', () => {
  it('returns true if the IP matches any CIDR in the list', () => {
    expect(
      ipMatchesAny('10.1.2.3', ['192.168.0.0/16', '10.0.0.0/8']),
    ).toBe(true);
  });

  it('returns false if the IP matches none of the CIDRs', () => {
    expect(
      ipMatchesAny('172.16.0.1', ['192.168.0.0/16', '10.0.0.0/8']),
    ).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(ipMatchesAny('10.1.2.3', [])).toBe(false);
  });
});

describe('bearerTokenMatches', () => {
  it('matches when header carries the configured token', () => {
    expect(bearerTokenMatches('Bearer secret', 'secret')).toBe(true);
  });

  it('does not match a different-length token (length-checked compare)', () => {
    expect(bearerTokenMatches('Bearer secre', 'secret')).toBe(false);
  });

  it('does not match when no token is configured', () => {
    expect(bearerTokenMatches('Bearer secret', null)).toBe(false);
  });

  it('does not match a missing Authorization header', () => {
    expect(bearerTokenMatches(undefined, 'secret')).toBe(false);
  });

  it('does not match a non-Bearer scheme', () => {
    expect(bearerTokenMatches('Basic secret', 'secret')).toBe(false);
  });
});

describe('readMetricsAuthConfig', () => {
  it('reads bearer token and CIDRs from env', () => {
    const config = readMetricsAuthConfig({
      METRICS_BEARER_TOKEN: 'secret',
      METRICS_ALLOWED_CIDRS: '10.0.0.0/8, 192.168.0.0/16',
    });
    expect(config).toEqual({
      allowedCidrs: ['10.0.0.0/8', '192.168.0.0/16'],
      bearerToken: 'secret',
    });
  });

  it('defaults to fail-closed (empty CIDRs, null token) when unset', () => {
    const config = readMetricsAuthConfig({});
    expect(config).toEqual({ allowedCidrs: [], bearerToken: null });
  });
});
