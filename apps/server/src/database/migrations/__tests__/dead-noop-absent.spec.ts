import { readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * ENG-2479 T6 — `TestDeadNoOpAbsentFromMigrationChain` (AC5).
 *
 * Honest-finding note (CS §11, R11 "not found under this name"): the PRD
 * names a dead `r5-pages-tsv-keyword-fastlane` no-op that AC5 asks to be
 * "dropped". A repo-root grep for that name (and the looser
 * `pages-tsv-keyword-fastlane` substring) across `apps/server/src` returns
 * zero hits at this HEAD — no file, migration or otherwise, matches that
 * name anywhere in the tree, not only in the migrations folder. AC5's own
 * literal "Then it is dropped" outcome is satisfied by absence, so this
 * spec asserts that absence directly. This is recorded as an honest
 * "not found under this name" finding, not a fabricated file reference: if
 * a differently-named dead no-op is later identified as the one FR-W22
 * actually refers to, that is a separate finding to escalate, not something
 * this spec can verify from the current tree.
 *
 * `20260710T090000-drop-pages-tsvector.ts` (ENG-1451) is a REAL, non-dead
 * migration (it drops the Postgres tsvector search trigger/index/columns
 * now that search lives in Turbopuffer) and is explicitly NOT the no-op
 * AC5 describes — this spec asserts it is NOT mistaken for one by name.
 */
describe('DeadNoOpAbsentFromMigrationChainSpec', () => {
  const migrationsDir = join(__dirname, '..');
  const migrationFiles = readdirSync(migrationsDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== '__tests__',
  );
  const repoServerSrc = join(__dirname, '../../../');

  it('has no migration file named (or containing) r5-pages-tsv-keyword-fastlane', () => {
    const matches = migrationFiles.filter((f) =>
      /r5-pages-tsv-keyword-fastlane|pages-tsv-keyword-fastlane/i.test(f),
    );
    expect(matches).toEqual([]);
  });

  it('has zero hits anywhere under apps/server/src for the dead no-op name (repo-wide, not just the migrations folder)', () => {
    // Excludes this spec file itself (`--exclude`), which necessarily
    // names the string in its own docstring/assertions above.
    const output = execSync(
      `grep -rl --exclude="dead-noop-absent.spec.ts" "r5-pages-tsv-keyword-fastlane\\|pages-tsv-keyword-fastlane" "${repoServerSrc}" || true`,
      { encoding: 'utf8' },
    ).trim();
    expect(output).toBe('');
  });

  it('does not confuse the real drop-pages-tsvector migration (ENG-1451) with the dead no-op', () => {
    expect(migrationFiles).toContain('20260710T090000-drop-pages-tsvector.ts');
  });
});
