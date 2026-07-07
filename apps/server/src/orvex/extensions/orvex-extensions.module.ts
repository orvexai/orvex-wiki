import { Module, OnApplicationBootstrap } from '@nestjs/common';

import { OrvexMigratorService } from './orvex-migrator.service';

/**
 * ENG-1411 — package-local orvex migrations run once at boot, serialized
 * across replicas by OrvexMigratorService's single pg_advisory_xact_lock.
 * Skipped under NODE_ENV=test so unit/e2e suites control migration timing
 * explicitly (matches the dev-context file table: "skip under NODE_ENV=test").
 */
@Module({
  providers: [OrvexMigratorService],
  exports: [OrvexMigratorService],
})
export class OrvexMigratorModule implements OnApplicationBootstrap {
  constructor(private readonly migrator: OrvexMigratorService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.migrator.migrateToLatest();
  }
}
