import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ORVEX_MIGRATION_PACKAGES,
  OrvexMigrationProvider,
} from './orvex-migration-provider';

/**
 * AC5 (deterministic order): getMigrations() keys are sorted lexicographically
 * by `package/NNN-stem`, scanning real files on disk (no own-package mock —
 * CS ❌#4). A package directory that does not exist yet (a sibling not ported
 * to this repo) is skipped, never thrown.
 */
describe('OrvexMigrationProvider.getMigrations', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orvex-migration-provider-'));
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

  it('returns migrations sorted lexicographically by package/stem across multiple packages', async () => {
    const pkgBDir = path.join(tmpRoot, 'pkg-b');
    const pkgADir = path.join(tmpRoot, 'pkg-a');
    await writeMigration(pkgBDir, '002-second.js');
    await writeMigration(pkgBDir, '001-first.js');
    await writeMigration(pkgADir, '001-only.js');

    const provider = new OrvexMigrationProvider([
      { package: 'pkg-b', migrationsDir: pkgBDir },
      { package: 'pkg-a', migrationsDir: pkgADir },
    ]);

    const migrations = await provider.getMigrations();

    expect(Object.keys(migrations)).toEqual([
      'pkg-a/001-only',
      'pkg-b/001-first',
      'pkg-b/002-second',
    ]);
    expect(typeof migrations['pkg-a/001-only'].up).toBe('function');
  });

  it('ignores files that do not match the NNN-stem naming convention', async () => {
    const dir = path.join(tmpRoot, 'pkg-c');
    await writeMigration(dir, '001-valid.js');
    await writeMigration(dir, 'README.md');
    await writeMigration(dir, 'not-numbered.js');

    const provider = new OrvexMigrationProvider([
      { package: 'pkg-c', migrationsDir: dir },
    ]);

    const migrations = await provider.getMigrations();

    expect(Object.keys(migrations)).toEqual(['pkg-c/001-valid']);
  });

  it('skips a package whose migrations directory does not exist (not-yet-ported satellite)', async () => {
    const provider = new OrvexMigrationProvider([
      { package: 'orvex-oidc', migrationsDir: path.join(tmpRoot, 'does-not-exist') },
    ]);

    await expect(provider.getMigrations()).resolves.toEqual({});
  });

  it('the default registry (ORVEX_MIGRATION_PACKAGES) is engine-only — orvex-extensions alone (PD-4d 2026-07-08)', () => {
    // orvex-oidc/orvex-ai are satellite packages the AGPL engine never
    // ships (dead config, CS ❌#6); orvex-linear is excluded per D-S11.
    expect(ORVEX_MIGRATION_PACKAGES.map((entry) => entry.package)).toEqual([
      'orvex-extensions',
    ]);
  });
});
