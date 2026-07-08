/**
 * ENG-1371 review1 F2 — "OrvexPageMetadataModule imported nowhere;
 * OrvexRootModule.register() omits it... port is dead code at runtime."
 * Asserts `PageModule`'s own `@Module` metadata (read the same way Nest's
 * module scanner reads it) lists `OrvexPageMetadataModule` among its
 * imports, so `OrvexMarkdownInterceptor` (which that module provides/
 * exports) is actually resolvable by `PageController`'s DI context.
 */
import { MODULE_METADATA } from '@nestjs/common/constants';

// `page.module.ts` transitively imports `CollaborationModule` ->
// `EnvironmentModule`, whose `ConfigModule.forRoot` validates
// `process.env` at import time and calls `process.exit(1)` if required
// vars (DATABASE_URL/REDIS_URL/APP_SECRET) are missing. Set fake-but-valid
// values BEFORE the dynamic import below so this stays a plain unit test
// (no real Postgres/Redis needed) rather than pulling in the full
// integration harness just to read one module's decorator metadata.
const REQUIRED_ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  APP_SECRET: 'x'.repeat(32),
};

describe('PageModule imports OrvexPageMetadataModule (ENG-1371 AC8/F2)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const [key, value] of Object.entries(REQUIRED_ENV)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('lists OrvexPageMetadataModule in its imports', async () => {
    const { PageModule } = await import('./page.module');
    const { OrvexPageMetadataModule } = await import(
      '../../orvex/page-metadata/orvex-page-metadata.module'
    );

    const imports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      PageModule,
    );

    expect(imports).toBeDefined();
    expect(imports).toContain(OrvexPageMetadataModule);
  });
});
