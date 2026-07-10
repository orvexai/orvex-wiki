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
    const result = resolveGlobalPrefixExclude({
      ORVEX_GLOBAL_PREFIX_EXCLUDE: 'mcp,metrics',
    });
    expect(result).toEqual([
      ...UPSTREAM_GLOBAL_PREFIX_EXCLUDE,
      'mcp',
      'metrics',
    ]);
  });

  it('deduplicates when the env repeats an already-hardcoded value', () => {
    const result = resolveGlobalPrefixExclude({
      ORVEX_GLOBAL_PREFIX_EXCLUDE: 'robots.txt,mcp',
    });
    expect(result).toEqual([...UPSTREAM_GLOBAL_PREFIX_EXCLUDE, 'mcp']);
  });
});
