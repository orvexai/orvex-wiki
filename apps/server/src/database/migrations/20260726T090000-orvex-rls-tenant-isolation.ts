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
 *  - `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` per table —
 *    FORCE binds even the table-owning role, closing the common "owner
 *    silently bypasses policy" RLS gap. (Superusers/BYPASSRLS roles still
 *    bypass by Postgres design — migrations and test harnesses run there.)
 *  - One `FOR ALL` policy per table:
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
 * Deployment note (escalated in the Issue, not silently resolved here):
 * enforcement bites only for non-BYPASSRLS roles. The production cutover to
 * a non-superuser app role, and the request-lifecycle adoption of the GUC
 * hook across all repo call sites, are sequenced by the ENG-2502 rollout —
 * this migration makes the policy layer real and provable (see
 * `rls-transaction-scoped.integration.spec.ts`).
 */

const RLS_TABLES = ['pages', 'spaces', 'comments', 'attachments'] as const;

export async function up(db: Kysely<any>): Promise<void> {
  for (const table of RLS_TABLES) {
    await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );
    await sql`ALTER TABLE ${sql.table(table)} FORCE ROW LEVEL SECURITY`.execute(
      db,
    );
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
