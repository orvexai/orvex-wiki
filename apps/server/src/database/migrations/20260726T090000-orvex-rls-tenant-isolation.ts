import { type Kysely, sql } from 'kysely';

/**
 * ENG-2502 (FR-W8) — transaction-scoped, fail-closed Row-Level Security on
 * the tenant-scoped tables the engine's repos query today: `pages`, `spaces`,
 * `comments`, `attachments`.
 *
 * This RLS layer is a BACKSTOP beneath the FR-13 app-layer ACL
 * (`OrvexPermissionsService.evalPage`/`evalSpace`) — it is NEVER a
 * replacement for app-layer permission checks. RLS enforces only the
 * WORKSPACE/TENANT boundary (no cross-tenant read at all); page-level and
 * space-level restriction (restricted-ancestor chains, member roles) stays
 * app-layer. Both controls must independently deny.
 *
 * Mechanism:
 *  - `ENABLE ROW LEVEL SECURITY` + one `FOR ALL` policy per table:
 *      USING / WITH CHECK
 *        (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
 *    The GUC is set TRANSACTION-LOCALLY via
 *    `set_config('app.workspace_id', $1, true)` (`is_local=true`) as the
 *    first statement of a tenant-scoped transaction — see
 *    `apps/server/src/database/rls/rls-guc-hook.ts`. A session-level `SET`
 *    is never used anywhere: under pgBouncer transaction pooling
 *    (deploy/kustomize/platform-resources/postgres-claim.yaml,
 *    `pgBouncer: {enabled: true, mode: transaction}`) a session-level GUC
 *    would leak across tenants sharing a pooled backend connection.
 *  - Deny-by-default: with no GUC set, `current_setting(..., true)` is
 *    NULL (or '' after a prior transaction-local value was popped), so the
 *    predicate never matches any row — zero rows, never all rows. The
 *    `NULLIF(..., '')` guard keeps the popped-to-empty-string state from
 *    erroring on the uuid cast and keeps it fail-closed.
 *
 * ══════════════════════════════════════════════════════════════════════
 * SAFE-BY-CONSTRUCTION `FORCE`: why this migration cannot strand production
 * ══════════════════════════════════════════════════════════════════════
 *
 * `FORCE ROW LEVEL SECURITY` binds even the TABLE-OWNING role. Production
 * connects as `orvex-wiki`, which `postgres-claim.yaml`
 * (`databaseOwner: orvex-wiki`) makes the owner of every table here, and
 * `DatabaseModule.onApplicationBootstrap()` runs `migrateToLatest()`
 * unconditionally on production boot. An unconditional `FORCE` would
 * therefore fail-CLOSE every not-yet-GUC-scoped read/write path on the very
 * next deploy — the app locked out of its own tables. That is not an
 * acceptable way to ship a backstop.
 *
 * So `FORCE` is applied only when it is provably SAFE, decided IN SQL at
 * apply time (never by prose, never by an operator remembering a runbook):
 *
 *   FORCE is applied  ⇔  the role applying this migration is NOT the table
 *                        owner  ∨  `ORVEX_RLS_FORCE=true` is set explicitly.
 *
 * - Owner-applied (today's production, and every dev/CI boot): `FORCE` is
 *   SKIPPED. RLS is still ENABLEd and the policies still exist, so the
 *   moment the app cuts over to a non-owner, NOBYPASSRLS role the boundary
 *   is enforced with no further DDL. Until then the owner bypasses the
 *   policy exactly as Postgres documents — the schema change is INERT for
 *   the running app, and no existing read/write path can regress.
 * - Non-owner-applied (the enforcement-visible posture the DoD test runs,
 *   and the intended production end-state): `FORCE` is applied, closing the
 *   "owner silently bypasses policy" gap.
 * - `ORVEX_RLS_FORCE=true`: the deliberate operator opt-in for the cutover
 *   deploy, once every tenant-scoped transaction is GUC-scoped. It is an
 *   explicit act, and its consequence (owner bound by the policy) is the
 *   whole point of setting it.
 *
 * `20260726T091000-orvex-rls-force-*` is deliberately NOT a follow-up
 * migration: `migrateToLatest()` runs once per migration name, so a second
 * "now FORCE it" migration would be equally unconditional and equally
 * unsafe. The guard has to live at apply time, here.
 *
 * (Superusers/BYPASSRLS roles bypass RLS by Postgres design regardless —
 * migrations and test harnesses run there.)
 *
 * Adoption note (escalated in the Issue, not silently resolved here): the
 * request-lifecycle adoption of the GUC hook rides `executeTx`
 * (`apps/server/src/database/utils.ts`), the shared transaction chokepoint
 * every tenant-scoped service transaction funnels through. See
 * `rls-transaction-scoped.integration.spec.ts` and
 * `rls/rls-force-safety.integration.spec.ts` for the proofs.
 */

const RLS_TABLES = ['pages', 'spaces', 'comments', 'attachments'] as const;

/**
 * True when `FORCE ROW LEVEL SECURITY` is safe to apply right now.
 *
 * Safe means: the role applying this migration is not the role that would
 * be locked out by it. `pg_class.relowner` vs `current_user` is the exact
 * question Postgres itself asks when deciding whether FORCE bites, so the
 * guard is asked in the same terms rather than inferred from config.
 *
 * Exported for the safety test — the decision is behaviour, not prose.
 */
export async function shouldForceRls(
  db: Kysely<any>,
  table: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (env.ORVEX_RLS_FORCE === 'true') return true;

  const result = await sql<{ isOwner: boolean }>`
    SELECT pg_get_userbyid(c.relowner) = current_user AS "isOwner"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ${table} AND n.nspname = current_schema()
  `.execute(db);

  const row = result.rows[0];
  // Table not found in the current schema is not a licence to FORCE.
  if (!row) return false;
  return row.isOwner === false;
}

export async function up(db: Kysely<any>): Promise<void> {
  for (const table of RLS_TABLES) {
    await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );

    if (await shouldForceRls(db, table)) {
      await sql`ALTER TABLE ${sql.table(table)} FORCE ROW LEVEL SECURITY`.execute(
        db,
      );
    }

    await sql`
      CREATE POLICY ${sql.raw(`orvex_rls_tenant_isolation_${table}`)}
      ON ${sql.table(table)}
      FOR ALL
      USING (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
      )
      WITH CHECK (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
      )
    `.execute(db);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of RLS_TABLES) {
    await sql`DROP POLICY IF EXISTS ${sql.raw(
      `orvex_rls_tenant_isolation_${table}`,
    )} ON ${sql.table(table)}`.execute(db);
    await sql`ALTER TABLE ${sql.table(table)} NO FORCE ROW LEVEL SECURITY`.execute(
      db,
    );
    await sql`ALTER TABLE ${sql.table(table)} DISABLE ROW LEVEL SECURITY`.execute(
      db,
    );
  }
}
