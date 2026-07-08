/**
 * ENG-1603 (AC4, review1 F2) — `CollaborationModule` now imports
 * `OrvexPageProvenanceModule` (via `forwardRef`) so `PersistenceExtension`
 * can inject `OrvexPageProvenanceService` and stamp collab AI-authored
 * provenance in the same transaction as the content write.
 *
 * That import closes a real module cycle: `PageModule` imports
 * `CollaborationModule` -> `CollaborationModule` (now) imports
 * `OrvexPageProvenanceModule` -> `OrvexPageProvenanceModule` forwardRefs
 * `PageModule`. A metadata-only check that merely asserts "the array
 * contains a forwardRef object" would NOT have caught the actual bug this
 * test was written against: with the cycle newly closed, requiring
 * `collaboration.module.ts` transitively requires `page.module.ts` BEFORE
 * `collaboration.module.ts` finishes evaluating, so any DIRECT (non-
 * `forwardRef`) reference to `CollaborationModule` inside `page.module.ts`'s
 * `@Module({ imports: [...] })` array is captured as `undefined` at
 * decoration time (CommonJS circular-require semantics — confirmed via a
 * real `Test.createTestingModule({ imports: [CollaborationModule] }).compile()`
 * during development, which threw exactly
 * "The module at index [1] of the PageModule imports array is undefined"
 * until `page.module.ts`'s `CollaborationModule` entry was wrapped in
 * `forwardRef` too). A full DI compile is impractical here (it transitively
 * needs the real `@Global()` `DatabaseModule`/live Postgres for repos like
 * `PagePermissionRepo`), so this test instead calls every `forwardRef`
 * factory in both modules' `imports` metadata — exactly what Nest's
 * `DependenciesScanner` does before instantiating anything — and asserts
 * every resolved entry is a defined class, never `undefined`.
 */
import { MODULE_METADATA } from '@nestjs/common/constants';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  APP_SECRET: 'x'.repeat(32),
};

function resolveImport(entry: unknown): unknown {
  if (
    entry &&
    typeof entry === 'object' &&
    'forwardRef' in (entry as any) &&
    typeof (entry as any).forwardRef === 'function'
  ) {
    return (entry as any).forwardRef();
  }
  return entry;
}

describe('CollaborationModule <-> PageModule <-> OrvexPageProvenanceModule cycle (ENG-1603 F2)', () => {
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

  it('every resolved import on CollaborationModule and PageModule is a defined class (no circular-require undefined)', async () => {
    const { CollaborationModule } = await import('../collaboration.module');
    const { PageModule } = await import('../../core/page/page.module');
    const { OrvexPageProvenanceModule } = await import(
      '../../core/page-provenance/orvex-page-provenance.module'
    );

    const collabImports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CollaborationModule,
    );
    const pageImports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      PageModule,
    );

    expect(collabImports).toBeDefined();
    expect(pageImports).toBeDefined();

    for (const entry of collabImports) {
      expect(resolveImport(entry)).toBeDefined();
    }
    for (const entry of pageImports) {
      expect(resolveImport(entry)).toBeDefined();
    }

    // Pin the two ends of the cycle this ticket closed.
    expect(collabImports.map(resolveImport)).toContain(
      OrvexPageProvenanceModule,
    );
    expect(pageImports.map(resolveImport)).toContain(CollaborationModule);
  });
});
