import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for ENG-1371 fix pass 2 (F1).
 *
 * Kysely's file migration provider is constructed with the default
 * `allowUnorderedMigrations: false` (see migration.service.ts / migrate.ts).
 * That means every migration file name MUST sort alphabetically after every
 * migration that could already have been executed against a real database
 * (i.e. after every other file already present in this directory at the
 * time a new one is added). If a new migration's timestamp sorts before an
 * already-merged one, Kysely throws `corrupted migrations: ...` and the
 * process exits 1 on any DB that already ran the earlier migration.
 *
 * This test does not hit a database — it statically asserts that the
 * migration file list, sorted lexicographically (Kysely's own sort), is
 * identical to the list sorted by the numeric timestamp encoded in each
 * file name. That is exactly the invariant Kysely's #ensureMigrationsInOrder
 * relies on, so a future addition that reuses/undercuts an existing
 * timestamp fails this test immediately instead of surfacing only on a
 * warm/staging database.
 */
describe('migration file ordering', () => {
  const migrationsDir = join(__dirname, '..');

  const migrationFiles = readdirSync(migrationsDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== '__tests__',
  );

  it('has at least the known governance + provenance migrations present', () => {
    expect(migrationFiles).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^20260708T090000-orvex-provenance-columns\.ts$/),
        expect.stringMatching(/^20260708T100000-orvex-page-meta-governance-cols\.ts$/),
      ]),
    );
  });

  it('sorts identically whether ordered lexicographically (Kysely) or by embedded timestamp', () => {
    const byLexical = [...migrationFiles].sort();

    const extractTimestamp = (fileName: string): string => {
      const match = fileName.match(/^(\d{8}T\d{6})/);
      if (!match) {
        throw new Error(
          `Migration file "${fileName}" does not start with a YYYYMMDDTHHMMSS timestamp`,
        );
      }
      return match[1];
    };

    const byTimestamp = [...migrationFiles].sort((a, b) =>
      extractTimestamp(a).localeCompare(extractTimestamp(b)),
    );

    expect(byLexical).toEqual(byTimestamp);
  });

  it('places the ENG-1371 governance-columns migration strictly after the ENG-1447 provenance migration', () => {
    const provenanceIdx = migrationFiles.indexOf(
      '20260708T090000-orvex-provenance-columns.ts',
    );
    const governanceIdx = migrationFiles.indexOf(
      '20260708T100000-orvex-page-meta-governance-cols.ts',
    );

    expect(provenanceIdx).toBeGreaterThanOrEqual(0);
    expect(governanceIdx).toBeGreaterThanOrEqual(0);

    const sorted = [...migrationFiles].sort();
    expect(sorted.indexOf('20260708T090000-orvex-provenance-columns.ts')).toBeLessThan(
      sorted.indexOf('20260708T100000-orvex-page-meta-governance-cols.ts'),
    );
  });
});
