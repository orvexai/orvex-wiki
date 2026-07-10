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

  // ENG-1604 AC8 — health/orvex dependency probes (no DatabaseModule/Kysely,
  // no EnvironmentModule DI: OrvexHealthService is constructed inside
  // OrvexRootModule.register(), the same pre-DI/DI-free seam as the rest of
  // this service; see the service docstring).
  describe('database URL (AC8 postgres probe)', () => {
    it('reads DATABASE_URL', () => {
      expect(
        svc({ DATABASE_URL: 'postgresql://u:p@host:5432/db' }).databaseUrl,
      ).toBe('postgresql://u:p@host:5432/db');
    });

    it('surfaces an unset DATABASE_URL as null (never a fabricated URL)', () => {
      expect(svc({}).databaseUrl).toBeNull();
    });
  });

  describe('redis URL (AC8 redis probe)', () => {
    it('reads REDIS_URL', () => {
      expect(svc({ REDIS_URL: 'redis://cache:6380' }).redisUrl).toBe(
        'redis://cache:6380',
      );
    });

    it('defaults to redis://localhost:6379 when unset (mirrors EnvironmentService)', () => {
      expect(svc({}).redisUrl).toBe('redis://localhost:6379');
    });
  });

  describe('storage driver (AC8 storage probe)', () => {
    it('reads STORAGE_DRIVER', () => {
      expect(svc({ STORAGE_DRIVER: 's3' }).storageDriver).toBe('s3');
    });

    it('defaults to local when unset (mirrors EnvironmentService)', () => {
      expect(svc({}).storageDriver).toBe('local');
    });
  });

  describe('AWS S3 config (AC8 storage probe, s3 driver)', () => {
    it('reads the AWS_S3_* values', () => {
      const c = svc({
        AWS_S3_REGION: 'eu-central-1',
        AWS_S3_BUCKET: 'orvex-wiki',
        AWS_S3_ENDPOINT: 'https://s3.example',
        AWS_S3_FORCE_PATH_STYLE: 'true',
      });
      expect(c.awsS3Region).toBe('eu-central-1');
      expect(c.awsS3Bucket).toBe('orvex-wiki');
      expect(c.awsS3Endpoint).toBe('https://s3.example');
      expect(c.awsS3ForcePathStyle).toBe(true);
    });

    it('surfaces unset values as null / false', () => {
      const c = svc({});
      expect(c.awsS3Region).toBeNull();
      expect(c.awsS3Bucket).toBeNull();
      expect(c.awsS3Endpoint).toBeNull();
      expect(c.awsS3ForcePathStyle).toBe(false);
    });
  });

  describe('kafka wiring (AC8 kafka probe — "wired" per the FAMILY HEALTH RULING)', () => {
    it('is wired when KAFKA_BROKERS is set', () => {
      expect(
        svc({ KAFKA_BROKERS: 'broker:9092' }).kafkaBrokersConfigured,
      ).toBe(true);
    });

    it('is not wired when KAFKA_BROKERS is unset (solo boot, AC8.2)', () => {
      expect(svc({}).kafkaBrokersConfigured).toBe(false);
    });

    it('reads the broker list', () => {
      expect(
        svc({ KAFKA_BROKERS: 'a:9092, b:9092' }).kafkaBrokers,
      ).toEqual(['a:9092', 'b:9092']);
    });
  });

  describe('ORVEX_GLOBAL_PREFIX_EXCLUDE (AC8.4)', () => {
    it('defaults to mcp + health/orvex when unset', () => {
      expect(svc({}).globalPrefixExclude).toEqual(['mcp', 'health/orvex']);
    });

    it('reads a comma-separated override, trimmed', () => {
      expect(
        svc({ ORVEX_GLOBAL_PREFIX_EXCLUDE: ' mcp, metrics ,health/orvex ' })
          .globalPrefixExclude,
      ).toEqual(['mcp', 'metrics', 'health/orvex']);
    });
  });

  describe('ORVEX_LOADED_INTEGRATIONS (AC1/AC3 — never includes linear)', () => {
    it('reads a comma-separated list', () => {
      expect(
        svc({ ORVEX_LOADED_INTEGRATIONS: 'kafka,s3' }).loadedIntegrations,
      ).toEqual(['kafka', 's3']);
    });

    it('defaults to an empty list when unset', () => {
      expect(svc({}).loadedIntegrations).toEqual([]);
    });

    it('strips linear even if present in the raw env (exclusions D-S11 / po-ruling 2)', () => {
      expect(
        svc({ ORVEX_LOADED_INTEGRATIONS: 'linear,kafka' }).loadedIntegrations,
      ).toEqual(['kafka']);
    });
  });
});
