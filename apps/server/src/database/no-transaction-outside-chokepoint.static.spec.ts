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
 * `OrvexPageProvenanceService` did. Proven (not asserted) by
 * `test/integration/eng3569-tenant-scope-propagation.integration-spec.ts`:
 * a request whose ambient tenant scope IS established (the organic,
 * Host-resolved browser-session path — `subdomain.wiki.eu1.orvex.ai` — the
 * one that has produced zero new wiki pages since 2026-07-14) reaches the
 * handler with a real `workspaceId`, and the bare-`.transaction()` sites
 * above still opened the transaction with the GUC unset because nothing in
 * the call path consulted that scope. `executeTx(db, cb)` fixes exactly
 * that reachable, evidenced failure.
 *
 * MF-4 correction (reports/p1b/wiki-167-review.md): an earlier version of
 * this comment additionally attributed a wiki-api `502 ENGINE_UNAVAILABLE`
 * symptom to this same bug. That attribution was UNPROVEN — no test here
 * drives a wiki-api-shaped (Host-less, bearer-only) request — and is very
 * likely WRONG: before ENG-3504, a Host-less request never reached these
 * handlers at all (`registerWorkspaceExemptPreHandler` 404'd it first), so
 * it could not have hit this transaction code to 42501 inside it. Whether
 * wiki-api's composition-tier calls need scoping once ENG-3504 exempts them
 * is a question for ENG-3504/#164, not this gate — see MF-2 there.
 *
 * A comment cannot hold that line — a future transaction site added by hand
 * would reintroduce it silently, and the symptom (a deny) looks like working
 * isolation. This gate makes the boundary mechanical.
 *
 * The allow-list is deliberately tiny and each entry states WHY the path is
 * genuinely un-tenanted. Adding an entry is a reviewable act.
 */
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
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

/**
 * A `git grep` line that is itself a FULL comment line (`//`, block-comment
 * prose, or a jsdoc `*` continuation) is prose ABOUT the hazard, not a call
 * site — every converted site's explanatory comment says things like "NOT a
 * bare `this.db.transaction()`", which would otherwise self-trip this guard.
 * Trailing/inline comments are deliberately NOT stripped: a real call site is
 * never legitimately preceded by code on the same line before a `//`.
 */
function isFullCommentLine(text: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(text);
}

describe('TestNoTransactionOutsideTheChokepoint (ENG-3569)', () => {
  const serverRoot = path.join(__dirname, '..', '..');

  // `git grep` over tracked files only — no node_modules, no build output, no
  // stale artefacts; deterministic and fast. Shared across the tests below so
  // the "guards the guard" checks below observe the SAME raw scan the
  // offender assertion does, rather than a second independent invocation.
  function gitGrepTransactionOpens(): string {
    try {
      return execFileSync(
        'git',
        ['grep', '-n', '--', '\\.transaction(', 'src'],
        { cwd: serverRoot, encoding: 'utf8' },
      );
    } catch (err: any) {
      // git grep exits 1 with no output when there are no matches at all.
      if (err.status !== 1) throw err;
      return err.stdout ?? '';
    }
  }

  it('every production transaction site is `executeTx`, except the documented un-tenanted allow-list', () => {
    const raw = gitGrepTransactionOpens();

    const offenders = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [file, lineNo, ...rest] = line.split(':');
        return { file, lineNo, text: rest.join(':') };
      })
      // Test files police themselves; this gate is about shipped code.
      .filter(({ file }) => !/\.spec\.ts$/.test(file))
      // A line that merely NAMES the hazard in prose is not a call site. Kept
      // deliberately broad — `.transaction(` with no end-anchor, so a split
      // shape (`const tx = this.db.transaction();` opened on one line and
      // `.execute(...)`'d on another) is still caught, not just the inline
      // `.transaction().execute(` form.
      .filter(({ text }) => !isFullCommentLine(text))
      .filter(({ file }) => !ALLOWED.some((entry) => entry.file === file));

    expect(
      offenders.map((o) => `${o.file}:${o.lineNo}${o.text}`),
    ).toStrictEqual([]);
  });

  // Folded from PR #169's `rls-tx-chokepoint.spec.ts` (D6 fold onto #167) —
  // two checks that harden the guard ITSELF against going green for the
  // wrong reason, rather than adding coverage of the production invariant
  // above.
  it('has a chokepoint that actually applies the tenant GUC', async () => {
    const source = await fs.readFile(
      path.join(serverRoot, 'src/database/utils.ts'),
      'utf8',
    );
    // The chokepoint must read the ambient scope and hand a non-null one to
    // the GUC hook — the two halves that make every site above tenant-scoped
    // by construction. If either goes missing, `executeTx` itself is broken
    // and the whole guard is vacuous regardless of what it scans for.
    expect(source).toContain('currentTenantScope()');
    expect(source).toContain('withTenantScopedTransaction');
  });

  it('scans a source tree that really contains the page write routes', () => {
    // Guards the guard: a `git grep` invocation that silently found nothing
    // (wrong cwd, `src` renamed, run outside a git checkout) would make the
    // offender assertion above vacuously green — it would report zero
    // offenders because it saw NO transaction sites at all, not because every
    // site is compliant. Assert the scan actually reaches a known call site
    // (the chokepoint itself, which necessarily opens a transaction) before
    // trusting an empty offender list.
    const raw = gitGrepTransactionOpens();
    const filesSeen = new Set(raw.split('\n').map((l) => l.split(':')[0]));
    expect(filesSeen.has('src/database/utils.ts')).toBe(true);
  });
});
