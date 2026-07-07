import { type Kysely, sql } from 'kysely';

// ENG-1385: space/workspace-scoped labels.
//
// Upstream (v0.95) created a single global unique index on
// (workspace_id, type, name) -- `labels_workspace_id_type_name_unique` --
// which forbids the same label name existing independently per space. This
// migration reconciles that: it adds a nullable `space_id` column (NULL =
// workspace-scoped, set = space-scoped) and replaces the single global
// index with two partial unique indexes, one per scope. The `DROP INDEX IF
// EXISTS` makes the reconcile idempotent whether the base schema is a fresh
// v0.95 install (index present) or a re-run of this migration (index
// already gone).
export async function up(db: Kysely<any>): Promise<void> {
  const hasSpaceIdColumn = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'labels' AND column_name = 'space_id'
    ) AS exists
  `.execute(db);

  if (!hasSpaceIdColumn.rows[0]?.exists) {
    await db.schema
      .alterTable('labels')
      .addColumn('space_id', 'uuid', (col) =>
        col.references('spaces.id').onDelete('cascade'),
      )
      .execute();
  }

  // Reconcile against upstream v0.95: drop the old global unique index
  // (idempotent -- absent on a second run of this migration).
  await sql`DROP INDEX IF EXISTS labels_workspace_id_type_name_unique`.execute(
    db,
  );

  // Workspace-scoped labels (space_id IS NULL): unique per
  // (workspace, type, name).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS labels_workspace_type_name_no_space_uq
    ON labels (workspace_id, type, name)
    WHERE space_id IS NULL
  `.execute(db);

  // Space-scoped labels (space_id IS NOT NULL): unique per
  // (workspace, type, space, name) -- the same name is free to exist
  // independently in a different space.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS labels_workspace_type_space_name_uq
    ON labels (workspace_id, type, space_id, name)
    WHERE space_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS labels_workspace_type_name_no_space_uq`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS labels_workspace_type_space_name_uq`.execute(
    db,
  );

  // Restoring the global (workspace_id, type, name) unique index requires
  // the data to be collision-free first. Two space-scoped rows can share a
  // name across different spaces -- that's the whole point of this
  // feature -- so we must dedupe (keep the oldest row per
  // (workspace, type, name), drop the rest) and null out space_id before
  // the global constraint goes back on, otherwise the CREATE UNIQUE INDEX
  // below throws a unique-violation on rollback.
  await sql`
    DELETE FROM labels a
    USING labels b
    WHERE a.workspace_id = b.workspace_id
      AND a.type = b.type
      AND a.name = b.name
      AND a.id <> b.id
      AND (a.created_at, a.id) > (b.created_at, b.id)
  `.execute(db);

  await db.schema
    .alterTable('labels')
    .dropColumn('space_id')
    .execute();

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS labels_workspace_id_type_name_unique
    ON labels (workspace_id, type, name)
  `.execute(db);
}
