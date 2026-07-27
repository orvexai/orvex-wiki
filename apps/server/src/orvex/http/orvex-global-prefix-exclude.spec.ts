import {
  resolveGlobalPrefixExclude,
  UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
} from './orvex-global-prefix-exclude';

describe('resolveGlobalPrefixExclude (ENG-1604 AC8.4)', () => {
  it('defaults to the upstream exclusions + health/orvex AND its sub-probes when unset', () => {
    expect(resolveGlobalPrefixExclude({})).toEqual([
      ...UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
      'health/orvex',
      'health/orvex/(.*)',
    ]);
  });

  // REGRESSION (found by live E2E, not by this suite): the default was
  // `['health/orvex']` alone, which excludes ONLY the exact aggregate route.
  // The per-role sub-probes then fell through to the SPA catch-all and
  // answered with index.html — verified live: a GET on
  // /health/orvex/collab returned the HTML shell, so the collab kubelet
  // probe in deploy/kustomize/app-manifests/deployment.yaml could never
  // fire, and a dead collab listener would have read green forever.
  //
  // Asserting the WILDCARD (not just the literal) is what makes this
  // catch a regression: the old value satisfied a naive `toContain`.
  it('excludes the per-role sub-probes so /health/orvex/{collab,relay} escape the /api prefix', () => {
    const result = resolveGlobalPrefixExclude({});
    expect(result).toContain('health/orvex/(.*)');

    // The wildcard must be a real prefix-wildcard, not a literal path: it is
    // what Nest matches `health/orvex/collab` and `health/orvex/relay`
    // against.
    const wildcard = result.find((r) => r.startsWith('health/orvex/'));
    expect(wildcard).toBeDefined();
    const pattern = new RegExp(`^${wildcard!.replace('(.*)', '.*')}$`);
    expect(pattern.test('health/orvex/collab')).toBe(true);
    expect(pattern.test('health/orvex/relay')).toBe(true);
  });

  it('reads ORVEX_GLOBAL_PREFIX_EXCLUDE and still keeps the upstream exclusions', () => {
    // 'metrics' (ENG-1360 AC6) is now a hardcoded UPSTREAM exclusion, not an
    // env-configurable one, so this uses a different placeholder path to
    // exercise the env-merge behavior without colliding with it.
    const result = resolveGlobalPrefixExclude({
      ORVEX_GLOBAL_PREFIX_EXCLUDE: 'custom,health/orvex',
    });
    expect(result).toEqual([
      ...UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
      'custom',
      'health/orvex',
    ]);
  });

  it('deduplicates when the env repeats an already-hardcoded value', () => {
    const result = resolveGlobalPrefixExclude({
      ORVEX_GLOBAL_PREFIX_EXCLUDE: 'robots.txt,custom',
    });
    expect(result).toEqual([...UPSTREAM_GLOBAL_PREFIX_EXCLUDE, 'custom']);
  });
});
