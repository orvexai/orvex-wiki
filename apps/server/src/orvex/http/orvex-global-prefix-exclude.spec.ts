import {
  resolveGlobalPrefixExclude,
  UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
} from './orvex-global-prefix-exclude';

describe('resolveGlobalPrefixExclude (ENG-1604 AC8.4)', () => {
  it('defaults to the upstream exclusions + mcp + health/orvex when unset', () => {
    expect(resolveGlobalPrefixExclude({})).toEqual([
      ...UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
      'mcp',
      'health/orvex',
    ]);
  });

  it('reads ORVEX_GLOBAL_PREFIX_EXCLUDE and still keeps the upstream exclusions', () => {
    // 'metrics' (ENG-1360 AC6) is now a hardcoded UPSTREAM exclusion, not an
    // env-configurable one, so this uses a different placeholder path to
    // exercise the env-merge behavior without colliding with it.
    const result = resolveGlobalPrefixExclude({
      ORVEX_GLOBAL_PREFIX_EXCLUDE: 'mcp,health/orvex',
    });
    expect(result).toEqual([
      ...UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
      'mcp',
      'health/orvex',
    ]);
  });

  it('deduplicates when the env repeats an already-hardcoded value', () => {
    const result = resolveGlobalPrefixExclude({
      ORVEX_GLOBAL_PREFIX_EXCLUDE: 'robots.txt,mcp',
    });
    expect(result).toEqual([...UPSTREAM_GLOBAL_PREFIX_EXCLUDE, 'mcp']);
  });
});
