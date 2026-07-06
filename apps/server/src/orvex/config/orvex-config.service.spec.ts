import { OrvexConfigService } from './orvex-config.service';

/**
 * Unit gates for the pure {@link OrvexConfigService} env reader. Constructed with
 * an explicit env bag (the injectable seam), so no `process.env` mutation and no
 * I/O — the reader is exercised as a pure function of its environment.
 *
 * The surface is deliberately minimal (CS §3.6 — foundation M8 review): only
 * getters with a live consumer exist; new env getters arrive WITH their first
 * consumer at delivery.
 */
describe('OrvexConfigService', () => {
  const svc = (env: NodeJS.ProcessEnv): OrvexConfigService =>
    new OrvexConfigService(env);

  describe('identity endpoint (A-PORTABLE, session-mint composition)', () => {
    it('reads ORVEX_IDENTITY_URL', () => {
      expect(
        svc({ ORVEX_IDENTITY_URL: 'https://identity.example/realms/orvex' })
          .identityUrl,
      ).toBe('https://identity.example/realms/orvex');
    });

    it('surfaces an unset endpoint as null (never a fabricated URL)', () => {
      expect(svc({}).identityUrl).toBeNull();
    });
  });

  describe('AGPL section 13 source offer values', () => {
    it('reads ORVEX_GIT_SHA and ORVEX_SOURCE_REPO', () => {
      const c = svc({
        ORVEX_GIT_SHA: 'deadbeef',
        ORVEX_SOURCE_REPO: 'https://github.com/orvexai/orvex-wiki',
      });
      expect(c.gitSha).toBe('deadbeef');
      expect(c.sourceRepo).toBe('https://github.com/orvexai/orvex-wiki');
    });

    it('surfaces unset source values as null (never a fabricated SHA)', () => {
      const c = svc({});
      expect(c.gitSha).toBeNull();
      expect(c.sourceRepo).toBeNull();
    });
  });

  describe('blank / whitespace values are treated as unset', () => {
    it('trims and nullifies blank strings', () => {
      const c = svc({ ORVEX_GIT_SHA: '   ', ORVEX_SOURCE_REPO: '' });
      expect(c.gitSha).toBeNull();
      expect(c.sourceRepo).toBeNull();
    });

    it('trims surrounding whitespace on real values', () => {
      expect(svc({ ORVEX_GIT_SHA: '  abc123  ' }).gitSha).toBe('abc123');
    });
  });
});
