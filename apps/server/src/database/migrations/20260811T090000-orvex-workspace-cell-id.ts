import { type Kysely, sql } from 'kysely';

import { CELL_SOLO } from '../../orvex/config/orvex-config.service';

/**
 * A-TENANCY / A-CELL — the per-workspace cell assignment.
 *
 * Until now the engine held NO record of which cell a tenant belongs to.
 * `DomainMiddleware`'s cell assertion had to GUESS one from the `Host`
 * header's label count, which (a) no-opped on every host with fewer than
 * four labels and (b) never fired at all in the real deploy, where
 * `materializeWorkspace` deliberately mints hostname-less tenants so the
 * hostname branch that guard lived inside is dead. This column replaces the
 * guess with an authoritative per-row fact.
 *
 * `cell_id` is NOT NULL so "this tenant's cell is unknown" is unrepresentable.
 * The `solo` DEFAULT is a FAIL-CLOSED sentinel, not a permissive fallback:
 * both real provisioning paths (`WorkspaceService.create` and
 * `PrincipalProvisioningService.materializeWorkspace`) stamp the deployment's
 * own `CELL_ID` explicitly, so the default is only ever reached by a row this
 * engine did not mint — and in a real (non-solo) cell such a row reads as a
 * definite mismatch and is REJECTED, which is the correct outcome for a
 * workspace of unknown provenance. In solo mode the sentinel is simply the
 * true value.
 *
 * BACKFILL — existing rows take THIS deployment's `CELL_ID`, not the sentinel.
 * Each cell migrates its own database, and every row already in it was, by
 * construction, being served by this cell and no other: the engine has never
 * had a second cell serving the same database, and identity's global registry
 * (the cross-cell source of truth) has always been the only thing that could
 * have said otherwise. Reading the env HERE rather than hardcoding a literal
 * is what makes the backfill correct in every cell instead of only in one.
 *
 * WHY READING `process.env` HERE IS SOUND, and the constraint that makes it
 * so: migrations run IN-PROCESS, from `DatabaseModule.onApplicationBootstrap`
 * -> `MigrationService.migrateToLatest()`, on the app container's own boot
 * (deploy/kustomize/app-manifests/configmap-env.yaml documents this — there is
 * deliberately no migration Job or initContainer). So this reads the very same
 * `process.env.CELL_ID` that `OrvexConfigService` hands the request-time check
 * moments later, in the same process. The backfilled value cannot disagree
 * with the enforcing pod's cell, because they are one variable.
 *
 * OPERATOR HAZARD (deliberately NOT guarded in code — it cannot be): run this
 * migration from anywhere that does NOT share the app's environment — a
 * separate Job/initContainer without the app's `envFrom`, or a manual
 * `pnpm migration:latest` from a shell — with `CELL_ID` unset, and every
 * tenant is backfilled `solo` while the pods keep enforcing `eu1`. The result
 * is a total outage wearing the costume of a correctly fail-closed gate.
 *
 * There is no check that can catch this from inside `up()`: a misconfigured
 * Job and a legitimate solo/self-hosted upgrade are indistinguishable here —
 * both are "unset CELL_ID, non-empty workspaces" — and the solo case is
 * entirely benign (unset CELL_ID also disables enforcement, in this same
 * process, so `solo` rows and a `solo` pod agree). Refusing on that shape
 * would break every self-hosted upgrade to catch a deploy mistake it cannot
 * actually identify. Keep migrations in-process, and this cannot arise.
 *
 * NOT the cross-cell source of truth: identity's global tenant→cell registry
 * (`IdentityRegistryClient`) remains the sole authority and sole writer. This
 * column is the cell-local materialization of that truth, so the request path
 * can enforce it without making identity a hard per-request dependency.
 */
function deploymentCellId(): string {
  const raw = process.env.CELL_ID?.trim();
  return raw === undefined || raw === '' ? CELL_SOLO : raw;
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('cell_id', 'varchar', (col) => col.defaultTo(CELL_SOLO))
    .execute();

  await sql`UPDATE workspaces SET cell_id = ${sql.lit(deploymentCellId())}`.execute(
    db,
  );

  await db.schema
    .alterTable('workspaces')
    .alterColumn('cell_id', (col) => col.setNotNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('workspaces').dropColumn('cell_id').execute();
}
