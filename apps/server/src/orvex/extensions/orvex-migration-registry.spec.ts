import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OrvexMigrationProvider } from '@orvex/extensions';

import { buildOrvexMigrations } from './orvex-migration-registry';

/**
 * ENG-1411 (PD-4d reconciliation) — the provider-to-ENG-1389-migrator seam.
 * `buildOrvexMigrations` must reshape the package-local
 * `OrvexMigrationProvider` output (`{ up, down }` keyed by `package/NNN-stem`)
 * into ENG-1389's `OrvexMigrationMap` shape (`{ package, up }`), preserving
 * the deterministic lexicographic key order (AC5) and the owning package name
 * recorded per migration (feeds the `orvex_migrations` ledger's `package`
 * column).
 */
describe('buildOrvexMigrations', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'orvex-migration-registry-'),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function writeMigration(dir: string, file: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, file),
      'exports.up = async () => {}; exports.down = async () => {};',
      'utf8',
    );
  }

  it('reshapes provider migrations into ENG-1389 OrvexMigrationMap, keyed and ordered by package/NNN-stem, with the owning package recorded', async () => {
    const pkgBDir = path.join(tmpRoot, 'orvex-extensions');
    const pkgADir = path.join(tmpRoot, 'orvex-earlier');
    await writeMigration(pkgBDir, '001-second.js');
    await writeMigration(pkgADir, '001-first.js');

    const provider = new OrvexMigrationProvider([
      { package: 'orvex-extensions', migrationsDir: pkgBDir },
      { package: 'orvex-earlier', migrationsDir: pkgADir },
    ]);

    const map = await buildOrvexMigrations(provider);

    expect(Object.keys(map)).toEqual([
      'orvex-earlier/001-first',
      'orvex-extensions/001-second',
    ]);
    expect(map['orvex-earlier/001-first'].package).toBe('orvex-earlier');
    expect(map['orvex-extensions/001-second'].package).toBe(
      'orvex-extensions',
    );
    expect(typeof map['orvex-earlier/001-first'].up).toBe('function');
  });

  it('defaults to the engine-only ORVEX_MIGRATION_PACKAGES registry (orvex-extensions) when no provider is supplied', async () => {
    const map = await buildOrvexMigrations();

    for (const key of Object.keys(map)) {
      expect(key.startsWith('orvex-extensions/')).toBe(true);
      expect(map[key].package).toBe('orvex-extensions');
    }
  });
});
