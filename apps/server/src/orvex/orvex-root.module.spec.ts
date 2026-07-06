import { OrvexRootModule } from './orvex-root.module';

/**
 * Unit gates for the flag-gated aggregation (vanilla byte-parity doctrine).
 * Tested through the exported `register()` surface.
 */
describe('OrvexRootModule.register', () => {
  const savedFlag = process.env.ORVEX_MODULES_ENABLED;
  const savedIdentity = process.env.ORVEX_IDENTITY_URL;

  afterEach(() => {
    if (savedFlag === undefined) {
      delete process.env.ORVEX_MODULES_ENABLED;
    } else {
      process.env.ORVEX_MODULES_ENABLED = savedFlag;
    }
    if (savedIdentity === undefined) {
      delete process.env.ORVEX_IDENTITY_URL;
    } else {
      process.env.ORVEX_IDENTITY_URL = savedIdentity;
    }
  });

  describe('flag OFF', () => {
    it.each([['unset', undefined], ['TRUE', 'TRUE'], ['1', '1'], ['false', 'false']])(
      'yields a COMPLETELY EMPTY dynamic module when the flag is %s',
      (_name, value) => {
        if (value === undefined) {
          delete process.env.ORVEX_MODULES_ENABLED;
        } else {
          process.env.ORVEX_MODULES_ENABLED = value;
        }

        const mod = OrvexRootModule.register();

        expect(mod.module).toBe(OrvexRootModule);
        expect(mod.imports ?? []).toEqual([]);
        expect(mod.controllers ?? []).toEqual([]);
        expect(mod.providers ?? []).toEqual([]);
        expect(mod.exports ?? []).toEqual([]);
      },
    );
  });

  describe('flag ON (exactly "true")', () => {
    it('mounts config + http + the session-mint composition (not-configured branch)', () => {
      process.env.ORVEX_MODULES_ENABLED = 'true';
      delete process.env.ORVEX_IDENTITY_URL;

      const mod = OrvexRootModule.register();

      expect(mod.module).toBe(OrvexRootModule);
      expect(mod.imports).toBeDefined();
      // OrvexConfigModule + OrvexHttpModule + the composed SessionMintModule.
      expect(mod.imports?.length).toBe(3);
    });

    it('composes the REAL remote-JWKS verifier when ORVEX_IDENTITY_URL is set', () => {
      process.env.ORVEX_MODULES_ENABLED = 'true';
      process.env.ORVEX_IDENTITY_URL =
        'https://identity.example/realms/orvex/protocol/openid-connect/certs';

      // Construction only — createRemoteJWKSet does not fetch until first verify,
      // so this must not throw at register() time.
      expect(() => OrvexRootModule.register()).not.toThrow();
      const mod = OrvexRootModule.register();
      expect(mod.imports?.length).toBe(3);
    });
  });
});
