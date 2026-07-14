import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    if (entry === '__tests__') return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? collectFiles(full) : [full];
  });
}

describe('AC7: forward-compat / decoupling', () => {
  it('has zero Linear product references under multi-select/', () => {
    const files = collectFiles(ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (/linear/i.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('exposes the documented public API shape from index.ts', async () => {
    const mod = await import('../index');
    expect(Object.keys(mod).sort()).toEqual(
      [
        'multiSelectAtomFamily',
        'EMPTY_SET',
        'useOrvexMultiSelect',
        'useOrvexMultiSelectAnnouncer',
        'useEditorId',
        'OrvexContextMenu',
      ].sort(),
    );
  });
});
