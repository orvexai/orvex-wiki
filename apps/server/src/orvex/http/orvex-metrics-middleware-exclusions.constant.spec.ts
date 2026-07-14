import { ORVEX_METRICS_MIDDLEWARE_EXCLUDED_ROUTES } from './orvex-metrics-middleware-exclusions.constant';

/**
 * ENG-1604 AC8.5 — asserted as a unit test over the constant, not an
 * integration hit (the middleware itself doesn't exist yet — ENG-1360).
 */
describe('ORVEX_METRICS_MIDDLEWARE_EXCLUDED_ROUTES', () => {
  it('excludes metrics, health, health/orvex, health/live, mcp, robots.txt, share/:shareId/p/:pageSlug', () => {
    expect([...ORVEX_METRICS_MIDDLEWARE_EXCLUDED_ROUTES].sort()).toEqual(
      [
        'health',
        'health/live',
        'health/orvex',
        'mcp',
        'metrics',
        'robots.txt',
        'share/:shareId/p/:pageSlug',
      ].sort(),
    );
  });
});
