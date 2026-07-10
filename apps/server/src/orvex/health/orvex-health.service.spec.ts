import { OrvexConfigService } from '../config/orvex-config.service';
import { OrvexHealthService } from './orvex-health.service';
import type {
  KafkaProbe,
  PostgresProbe,
  RedisProbe,
  StorageProbe,
} from './orvex-health.service';

/**
 * ENG-1604 AC8 — unit gates for the FAMILY-HEALTH-RULING `health/orvex`
 * check aggregation. Every probe is INJECTED as a typed function (ports),
 * never a real network/DB call in these tests, and never touching
 * DatabaseModule/Kysely — see the service docstring for the AC8.6 rationale.
 */
describe('OrvexHealthService', () => {
  const config = (env: NodeJS.ProcessEnv = {}): OrvexConfigService =>
    new OrvexConfigService(env);

  const okPostgres: PostgresProbe = async () => ({ ok: true, latencyMs: 1 });
  const okRedis: RedisProbe = async () => ({ ok: true, latencyMs: 1 });
  const okStorage: StorageProbe = async () => ({ ok: true, driver: 'local' });
  const okKafka: KafkaProbe = async () => ({ ok: true });

  it('AC8.1/AC8.2 — returns status ok, HTTP-200-worthy body when every dep is healthy', async () => {
    const svc = new OrvexHealthService(
      config({}),
      okPostgres,
      okRedis,
      okStorage,
      okKafka,
    );

    const body = await svc.check();

    expect(body.status).toBe('ok');
    expect(body.checks.postgres.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
    expect(body.checks.storage.ok).toBe(true);
    expect(body.checks.kafka).toEqual({ ok: true, wired: false });
    expect(typeof body.ts).toBe('string');
  });

  it('AC8.1 — reports status degraded (never throws) when postgres is down', async () => {
    const failingPostgres: PostgresProbe = async () => ({
      ok: false,
      error: 'connection refused',
    });
    const svc = new OrvexHealthService(
      config({}),
      failingPostgres,
      okRedis,
      okStorage,
      okKafka,
    );

    const body = await svc.check();

    expect(body.status).toBe('degraded');
    expect(body.checks.postgres.ok).toBe(false);
    // sibling deps stay healthy and reported independently
    expect(body.checks.redis.ok).toBe(true);
  });

  it('AC8.1 — reports status degraded when redis is down', async () => {
    const failingRedis: RedisProbe = async () => ({
      ok: false,
      error: 'ECONNREFUSED',
    });
    const svc = new OrvexHealthService(
      config({}),
      okPostgres,
      failingRedis,
      okStorage,
      okKafka,
    );

    const body = await svc.check();
    expect(body.status).toBe('degraded');
    expect(body.checks.redis.ok).toBe(false);
  });

  it('AC8.1 — reports status degraded when storage is down', async () => {
    const failingStorage: StorageProbe = async () => ({
      ok: false,
      driver: 'local',
      error: 'ENOENT',
    });
    const svc = new OrvexHealthService(
      config({}),
      okPostgres,
      okRedis,
      failingStorage,
      okKafka,
    );

    const body = await svc.check();
    expect(body.status).toBe('degraded');
    expect(body.checks.storage.ok).toBe(false);
  });

  it('AC8.2 — a wired-but-failing kafka degrades status; unwired never calls the probe', async () => {
    const explodingKafka: KafkaProbe = async () => {
      throw new Error('must not be called when unwired');
    };
    const svc = new OrvexHealthService(
      config({}), // KAFKA_BROKERS unset -> unwired
      okPostgres,
      okRedis,
      okStorage,
      explodingKafka,
    );

    const body = await svc.check();
    expect(body.status).toBe('ok');
    expect(body.checks.kafka).toEqual({ ok: true, wired: false });
  });

  it('AC8.2 — solo boot (no KAFKA_BROKERS) reports kafka wired:false, ok:true, overall ok', async () => {
    const svc = new OrvexHealthService(
      config({}),
      okPostgres,
      okRedis,
      okStorage,
      okKafka,
    );
    const body = await svc.check();
    expect(body.checks.kafka).toEqual({ ok: true, wired: false });
    expect(body.status).toBe('ok');
  });

  it('a wired kafka that reports down degrades status', async () => {
    const downKafka: KafkaProbe = async () => ({
      ok: false,
      error: 'no brokers reachable',
    });
    const svc = new OrvexHealthService(
      config({ KAFKA_BROKERS: 'broker:9092' }),
      okPostgres,
      okRedis,
      okStorage,
      downKafka,
    );
    const body = await svc.check();
    expect(body.checks.kafka.ok).toBe(false);
    expect(body.status).toBe('degraded');
  });

  it('AC8.2 — body enumerates postgres, redis, storage, kafka', async () => {
    const svc = new OrvexHealthService(
      config({}),
      okPostgres,
      okRedis,
      okStorage,
      okKafka,
    );
    const body = await svc.check();
    expect(Object.keys(body.checks).sort()).toEqual([
      'kafka',
      'postgres',
      'redis',
      'storage',
    ]);
  });
});
