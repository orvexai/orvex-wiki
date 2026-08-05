// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3569 — `TestNoTransactionOutsideTheChokepoint`, the structural half of
 * the request-tier RLS backstop.
 *
 * `executeTx` (`database/utils.ts`) is the SHARED TRANSACTION CHOKEPOINT: it
 * is the only place that reads the ambient tenant scope and issues
 * `set_config('app.workspace_id', $1, true)` as the transaction's first
 * statement. A `db.transaction().execute(...)` opened anywhere else is
 * therefore an UNSCOPED transaction — and, because `executeTx(db, cb, trx)`
 * deliberately does not re-scope a transaction it did not open, every nested
 * repo/service call handed that `trx` inherits the hole. Under the deployed
 * RLS posture (`relforcerowsecurity=t`, engine role NOBYPASSRLS) every
 * statement inside it is evaluated with no tenant GUC and is DENIED — writes
 * fail `42501`, reads silently return zero rows.
 *
 * That is not a hypothetical: it is exactly what
 * `PageController.create`/`update`, `PageVerificationService` and
 * `OrvexPageProvenanceService` did, and exactly what made
 * `POST /api/pages/create` surface as a wiki-api `502 ENGINE_UNAVAILABLE`
 * while `GET /v1/spaces` returned a false-empty `{"items":[]}`.
 *
 * A comment cannot hold that line — a future transaction site added by hand
 * would reintroduce it silently, and the symptom (a deny) looks like working
 * isolation. This gate makes the boundary mechanical.
 *
 * The allow-list is deliberately tiny and each entry states WHY the path is
 * genuinely un-tenanted. Adding an entry is a reviewable act.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * Paths permitted to open a transaction outside `executeTx`, each because it
 * runs with NO request tenant by construction.
 */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'src/database/utils.ts',
    why: 'IS the chokepoint — this is the one transaction site that scopes.',
  },
  {
    file: 'src/orvex/extensions/orvex-migrator.service.ts',
    why:
      'boot-time DDL for the extensions schema: runs before/outside any request, ' +
      'owns no tenant rows, and must not be tenant-scoped.',
  },
];

describe('TestNoTransactionOutsideTheChokepoint (ENG-3569)', () => {
  it('every production transaction site is `executeTx`, except the documented un-tenanted allow-list', () => {
    const serverRoot = path.join(__dirname, '..', '..');

    // `git grep` over tracked files only — no node_modules, no build output,
    // no stale artefacts; deterministic and fast.
    let raw = '';
    try {
      raw = execFileSync(
        'git',
        ['grep', '-n', '--', '\\.transaction()', 'src'],
        { cwd: serverRoot, encoding: 'utf8' },
      );
    } catch (err: any) {
      // git grep exits 1 with no output when there are no matches at all.
      if (err.status !== 1) throw err;
      raw = err.stdout ?? '';
    }

    const offenders = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [file, lineNo, ...rest] = line.split(':');
        return { file, lineNo, text: rest.join(':') };
      })
      // Test files police themselves; this gate is about shipped code.
      .filter(({ file }) => !/\.spec\.ts$/.test(file))
      // A line that merely NAMES the hazard in prose is not a call site.
      .filter(({ text }) => /\.transaction\(\)\s*$|\.transaction\(\)\./.test(text))
      .filter(({ file }) => !ALLOWED.some((entry) => entry.file === file));

    expect(
      offenders.map((o) => `${o.file}:${o.lineNo}${o.text}`),
    ).toStrictEqual([]);
  });
});
