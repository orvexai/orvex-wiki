import { type Kysely, sql } from 'kysely';

/**
 * ENG-2504 (FR-W21 / A-BOUNDARY) — retire the in-engine billing store.
 *
 * The upstream fork's own `billing` table (`20250106T195516-billing.ts`) and
 * the Stripe-keyed `workspaces.stripe_customer_id` column are the in-engine
 * billing-migration artifacts FR-W21 severs: orvex-studio-billing is the
 * SOLE billing system-of-record (it owns Stripe end-to-end); this AGPL
 * engine enforces entitlements via the read-only billing entitlement seam
 * (ENG-1382) and emits `workspace.seats_changed` outbox events — it never
 * stores a Stripe subscription row and never talks to Stripe.
 *
 * Zero live callers were verified before this drop: no
 * `selectFrom/insertInto/updateTable/deleteFrom('billing')` anywhere in
 * `apps/server/src`, and `workspaces.stripe_customer_id` was only a passive
 * repo select field. The ORIGINAL migration files stay in the migration
 * history (the Kysely migrator requires the executed set to remain
 * enumerable) — this forward migration is the retirement act; the store is
 * gone, not merely unused.
 *
 * Workspace columns `status`, `plan`, `billing_email`, `trial_end_at` (added
 * by the same original migration) are NOT dropped: they are engine-owned
 * workspace lifecycle/plan metadata with live readers, not Stripe artifacts.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('billing').ifExists().execute();

  await db.schema
    .alterTable('workspaces')
    .dropColumn('stripe_customer_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Best-effort restore of the retired store's shape (mirrors
  // `20250106T195516-billing.ts` + `20250623T215045-more-billing-columns.ts`);
  // data is NOT restorable — billing is the system-of-record.
  await db.schema
    .alterTable('workspaces')
    .addColumn('stripe_customer_id', 'varchar', (col) => col)
    .execute();
  await db.schema
    .alterTable('workspaces')
    .addUniqueConstraint('workspaces_stripe_customer_id_unique', [
      'stripe_customer_id',
    ])
    .execute();

  await db.schema
    .createTable('billing')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('stripe_subscription_id', 'varchar', (col) => col.notNull())
    .addColumn('stripe_customer_id', 'varchar', (col) => col)
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('quantity', 'int8', (col) => col)
    .addColumn('amount', 'int8', (col) => col)
    .addColumn('interval', 'varchar', (col) => col)
    .addColumn('currency', 'varchar', (col) => col)
    .addColumn('metadata', 'jsonb', (col) => col)
    .addColumn('stripe_price_id', 'varchar', (col) => col)
    .addColumn('stripe_item_id', 'varchar', (col) => col)
    .addColumn('stripe_product_id', 'varchar', (col) => col)
    .addColumn('period_start_at', 'timestamptz', (col) => col.notNull())
    .addColumn('period_end_at', 'timestamptz', (col) => col)
    .addColumn('cancel_at_period_end', 'boolean', (col) => col)
    .addColumn('cancel_at', 'timestamptz', (col) => col)
    .addColumn('canceled_at', 'timestamptz', (col) => col)
    .addColumn('ended_at', 'timestamptz', (col) => col)
    .addColumn('billing_scheme', 'varchar', (col) => col)
    .addColumn('tiered_up_to', 'varchar', (col) => col)
    .addColumn('tiered_flat_amount', 'int8', (col) => col)
    .addColumn('tiered_unit_amount', 'int8', (col) => col)
    .addColumn('plan_name', 'varchar', (col) => col)
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz', (col) => col)
    .execute();

  await db.schema
    .alterTable('billing')
    .addUniqueConstraint('billing_stripe_subscription_id_unique', [
      'stripe_subscription_id',
    ])
    .execute();
}
