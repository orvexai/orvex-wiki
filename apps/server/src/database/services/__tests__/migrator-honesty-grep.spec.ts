import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ENG-2479 NFR honesty (CS §11 ALL-REAL) —
 * `TestNoPlaceholderOrTodoInMigrators`.
 *
 * Mirrors the pack's own §5c grep gate:
 *   grep -rn "TODO|FIXME|placeholder" \
 *     apps/server/src/orvex/extensions/orvex-migrator.service.ts \
 *     apps/server/src/database/services/migration.service.ts
 * as an executable test instead of a manual CI grep step, so a future edit
 * to either file can't silently reintroduce a stub/placeholder without
 * failing the suite.
 */
describe('MigratorHonestyGrepSpec', () => {
  const bannedPattern = /TODO|FIXME|placeholder/i;

  const files = [
    join(
      __dirname,
      '../../../orvex/extensions/orvex-migrator.service.ts',
    ),
    join(__dirname, '../migration.service.ts'),
  ];

  it.each(files)('%s contains no TODO/FIXME/placeholder markers', (file) => {
    const content = readFileSync(file, 'utf8');
    expect(content).not.toMatch(bannedPattern);
  });
});
