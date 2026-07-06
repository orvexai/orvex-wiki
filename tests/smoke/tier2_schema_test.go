package smoke

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// minAppliedMigrations is the floor for applied engine migrations. The M2
// prod-parity boot auto-migrates the full Docmost v0.95.0 schema; bump this
// only when a new migration is genuinely added to the engine.
const minAppliedMigrations = 48

// tableExists reports whether a public-schema table is present. Parameterised
// to keep it injection-safe across the table-driven core-table checks.
func tableExists(t *testing.T, name string) bool {
	t.Helper()
	ctx := opContext(t)
	conn := connectPostgres(t)

	var exists bool
	err := conn.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = $1
		)`, name).Scan(&exists)
	require.NoError(t, err, "schema: existence probe for table %q failed", name)
	return exists
}

// TestTier2Schema asserts the migration ledger ran and the core product tables
// exist. Addressable via `go test -run TestTier2`.
func TestTier2Schema(t *testing.T) {
	t.Run("kysely_migration_table_exists", func(t *testing.T) {
		require.True(t, tableExists(t, "kysely_migration"),
			"schema: kysely_migration ledger is missing — engine migrations never ran")
	})

	t.Run("applied_migrations_at_least_min", func(t *testing.T) {
		ctx := opContext(t)
		conn := connectPostgres(t)

		var count int
		err := conn.QueryRow(ctx, `SELECT count(*) FROM kysely_migration`).Scan(&count)
		require.NoError(t, err, "schema: counting kysely_migration rows failed")
		require.GreaterOrEqualf(t, count, minAppliedMigrations,
			"schema: expected >= %d applied migrations, found %d", minAppliedMigrations, count)
	})

	t.Run("core_tables_exist", func(t *testing.T) {
		coreTables := []string{
			"workspaces",
			"users",
			"spaces",
			"pages",
			"attachments",
		}
		for _, name := range coreTables {
			t.Run(name, func(t *testing.T) {
				require.Truef(t, tableExists(t, name),
					"schema: core table %q is missing", name)
			})
		}
	})
}
