import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OrvexMigratorModule } from './orvex-migrator.module';
import { OrvexMigratorService } from './orvex-migrator.service';

/**
 * ENG-1604 AC1 DoD — `OrvexMigratorModule` wires the already-shipped
 * `OrvexMigratorService` into the boot path, mirroring `DatabaseModule`'s own
 * migration gate (production only). `OrvexMigratorService` and
 * `EnvironmentService` are overridden with test doubles — this spec proves
 * the WIRING (which method is called, under which env), not the migrator's
 * own transactional behaviour (covered end-to-end, real Postgres, by
 * `orvex-migrator.spec.ts`).
 *
 * `EnvironmentService` is supplied via a throwaway `@Global()` test module
 * (mirroring the real `EnvironmentModule`'s own `@Global()` scope) rather
 * than `EnvironmentModule` itself — that module's `ConfigModule.forRoot`
 * validates the REAL process env and `process.exit(1)`s when it is
 * incomplete, which it always is under `jest` (no `.env` loaded).
 */
describe('OrvexMigratorModule', () => {
  function fakeEnvironmentModule(nodeEnv: string) {
    @Global()
    @Module({
      providers: [
        { provide: EnvironmentService, useValue: { getNodeEnv: () => nodeEnv } },
      ],
      exports: [EnvironmentService],
    })
    class FakeEnvironmentModule {}
    return FakeEnvironmentModule;
  }

  it('runs migrateToLatest on bootstrap when NODE_ENV=production', async () => {
    const migrateToLatest = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [fakeEnvironmentModule('production'), OrvexMigratorModule],
    })
      .overrideProvider(OrvexMigratorService)
      .useValue({ migrateToLatest })
      .compile();

    const app = await moduleRef.init();
    expect(migrateToLatest).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('does NOT run migrations outside production (mirrors DatabaseModule)', async () => {
    const migrateToLatest = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [fakeEnvironmentModule('development'), OrvexMigratorModule],
    })
      .overrideProvider(OrvexMigratorService)
      .useValue({ migrateToLatest })
      .compile();

    const app = await moduleRef.init();
    expect(migrateToLatest).not.toHaveBeenCalled();
    await app.close();
  });
});
