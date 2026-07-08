// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * ENG-1599 AC4 — static gate. No file under `apps/server/src/orvex/obs/**`
 * may statically import `@docmost/*`, `ee/*`, or a Go `pkg/obs` path (the
 * AGPL boundary; A-SEAMS conform-not-import). This is a NARROWER, more
 * literal restatement of the repo-wide `engine-only-import-guard.sh` (which
 * bans closed-satellite packages + `@docmost/ee`/`@docmost/cloud` but
 * permits plain `@docmost/*`) — the story's AC4 explicitly widens the ban to
 * ALL `@docmost/*` for this leg's own files, so this spec enforces that
 * literal wording directly (not by relying on the broader repo-wide script).
 */
const BANNED_IMPORT_REGEX = /from\s+['"](@docmost\/|ee\/|pkg\/obs)/;

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...listTsFiles(join(dir, entry.name)));
      continue;
    }
    if (entry.name.endsWith('.ts') && entry.name !== 'orvex-obs-import-guard.spec.ts') {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe('orvex/obs import guard (AC4)', () => {
  it('no file under apps/server/src/orvex/obs/** imports @docmost/*, ee/*, or pkg/obs', () => {
    const obsDir = join(__dirname);
    const files = listTsFiles(obsDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      if (BANNED_IMPORT_REGEX.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it('(fixture) the regex itself DOES catch a forbidden import, proving the guard is not vacuous', () => {
    const fixture = `import { Thing } from '@docmost/db/repos/thing';\nexport {};\n`;
    expect(BANNED_IMPORT_REGEX.test(fixture)).toBe(true);
  });
});
