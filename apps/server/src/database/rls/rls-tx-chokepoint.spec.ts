// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * The regression guard for the ENG-2502 (FR-W8) transaction chokepoint.
 *
 * `rls-transaction-scoped.integration.spec.ts` already proves that
 * `executeTx` -> `withTenantScopedTransaction` sets `app.workspace_id`
 * transaction-locally and that RLS denies by default without it. What no
 * test covered — and what shipped broken — is the OTHER half of the
 * invariant: that every request-path transaction is actually OPENED through
 * that chokepoint.
 *
 * WHAT WENT WRONG. `page.controller.ts`'s create/update routes opened their
 * own transaction with a raw `this.db.transaction().execute(...)` and passed
 * the resulting `trx` down. Every nested `executeTx` beneath them
 * (`PageService.create`, `PageRepo.insertPage`) therefore received it as
 * `existingTrx` and — correctly, by design — did NOT re-scope a transaction
 * it did not own. The result was an outermost transaction that never issued
 * `set_config('app.workspace_id', …, true)`, so the FORCE-RLS policy on
 * `pages` denied the insert with PostgresError 42501, "new row violates
 * row-level security policy for table \"pages\"" — on EVERY page create, for
 * every caller, however the tenant was resolved. The ambient tenant scope was
 * present and correct throughout; it was simply discarded.
 *
 * This is exactly the "a 31st site can silently forget" failure
 * `database/utils.ts` predicts in its own header. A comment cannot enforce
 * it; this test can.
 *
 * WHY A SOURCE SCAN AND NOT A BEHAVIOURAL TEST. The behavioural half is
 * already covered against a real Postgres + pgBouncer by the integration
 * spec above. What is missing is a WHOLE-TREE property — "no site anywhere
 * opens a request-path transaction outside the chokepoint" — which no
 * single behavioural test can express, because the next offender is by
 * definition a site that does not exist yet. So this asserts the property
 * over the source tree, with a small, explicitly-justified allow-list.
 */
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * The ONE sanctioned place a Kysely transaction may be opened directly: the
 * chokepoint itself, which reads the ambient tenant scope and applies the
 * GUC.
 */
const CHOKEPOINT = 'database/utils.ts';

/**
 * Sites deliberately allowed to open a raw transaction, each because it runs
 * OUTSIDE any request and therefore has no tenant to scope to. `executeTx`
 * with a null ambient scope is behaviourally identical for them; they are
 * listed rather than converted so that adding a NEW exemption is a visible,
 * reviewed diff to this list and not an accident.
 *
 * - `orvex/extensions/orvex-migrator.service.ts` — boot-time schema
 *   migrations, run before any request exists and deliberately not
 *   tenant-scoped (they operate across every workspace).
 */
const ALLOWED: readonly string[] = [
  'orvex/extensions/orvex-migrator.service.ts',
];

/**
 * Matches an opened Kysely transaction: `<something>.transaction()`. Kept
 * deliberately broad (any receiver, not just `this.db`) so a site that
 * aliases the db handle first is still caught.
 */
const OPENS_TRANSACTION = /\.transaction\(\s*\)/;

const SRC_ROOT = path.resolve(__dirname, '..', '..');

async function* walkTsFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

/**
 * A `.transaction()` occurrence that is NOT inside a line comment. Block
 * comments and prose are not stripped exhaustively — the point is only to
 * stop this guard tripping on the explanatory comments the fix itself added
 * next to each converted site.
 */
function opensTransactionOutsideAComment(line: string): boolean {
  const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
  return OPENS_TRANSACTION.test(code);
}

describe('RLS transaction chokepoint (ENG-2502 FR-W8)', () => {
  let offenders: string[];

  beforeAll(async () => {
    offenders = [];
    for await (const file of walkTsFiles(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
      if (rel === CHOKEPOINT || ALLOWED.includes(rel)) continue;
      if (rel.endsWith('.spec.ts')) continue;

      const lines = (await fs.readFile(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (opensTransactionOutsideAComment(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  });

  it('is the only place production code opens a transaction', () => {
    expect(offenders).toEqual([]);
  });

  it('has a chokepoint that actually applies the tenant GUC', async () => {
    const source = await fs.readFile(path.join(SRC_ROOT, CHOKEPOINT), 'utf8');
    // The chokepoint must read the ambient scope and hand a non-null one to
    // the GUC hook — the two halves that make every site above tenant-scoped
    // by construction.
    expect(source).toContain('currentTenantScope()');
    expect(source).toContain('withTenantScopedTransaction');
  });

  it('scans a source tree that really contains the page write routes', async () => {
    // Guards the guard: a walker that silently found nothing (a bad root, a
    // renamed tree) would make the offender assertion vacuously green.
    const seen: string[] = [];
    for await (const file of walkTsFiles(SRC_ROOT)) {
      seen.push(path.relative(SRC_ROOT, file).split(path.sep).join('/'));
    }
    expect(seen).toContain('core/page/page.controller.ts');
    expect(seen).toContain(CHOKEPOINT);
  });
});
