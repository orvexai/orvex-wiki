import * as path from 'path';
import { existsSync, promises as fs } from 'fs';
import { Kysely, sql } from 'kysely';

/**
 * Migrations run against the live engine's full, unbounded Postgres schema —
 * they are not scoped to one typed `Database` interface. CS ❌#12 (no `any`
 * laundering) forbids the literal `any` keyword in this package's exported
 * surface, so this alias stands in for "some Kysely instance, schema not
 * statically known" instead: every migration body uses the raw `sql` tag
 * (DDL/parameterized DML), never the schema-typed query builder.
 */
export type OrvexDb = object;

/**
 * Package-local migration tracking table (ENG-1411 AC4/AC5). Deliberately
 * minimal — {name, applied_at, package} only (CS ❌#6: no speculative
 * columns; the migration registry lists only packages that ship migrations
 * today).
 */
export async function ensureOrvexMigrationsTable(
  db: Kysely<OrvexDb>,
): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS orvex_migrations (
      name        varchar     PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      package     varchar     NOT NULL
    )
  `.execute(db);
}

export interface OrvexMigration {
  up: (db: Kysely<OrvexDb>) => Promise<void>;
  down?: (db: Kysely<OrvexDb>) => Promise<void>;
}

export interface OrvexPackageMigrationEntry {
  package: string;
  migrationsDir: string;
}

// __dirname resolves to `packages/@orvex/extensions/src` under ts-jest/vitest
// and `packages/@orvex/extensions/dist` after compilation. Sibling packages
// (orvex-oidc, orvex-ai) may not exist yet in this repo (they land via their
// own extraction legs per po-ruling 10) — resolveSiblingMigrationsDir only
// computes the path; getMigrations() below tolerates a missing directory by
// skipping it, never throwing (ENG-1411 AC5).
function resolveSiblingMigrationsDir(pkg: string): string {
  const root = path.join(__dirname, '..', '..', pkg);
  const distDir = path.join(root, 'dist', 'orvex-migrations');
  if (existsSync(distDir)) return distDir;
  return path.join(root, 'src', 'orvex-migrations');
}

// Static registry — one entry per orvex package that ships migrations.
// `orvex-linear` is deliberately ABSENT (D-S11 / po-ruling 2: Linear is
// excluded from this engine leg; ORVEX_LOADED_INTEGRATIONS must not contain
// `linear`). `orvex-oidc` and `orvex-ai` are listed for forward-compat with
// their own extraction legs; until those packages exist their directories are
// simply skipped (see resolveSiblingMigrationsDir + getMigrations).
export const ORVEX_MIGRATION_PACKAGES: OrvexPackageMigrationEntry[] = [
  {
    package: 'orvex-extensions',
    migrationsDir: path.join(__dirname, 'orvex-migrations'),
  },
  {
    package: 'orvex-oidc',
    migrationsDir: resolveSiblingMigrationsDir('orvex-oidc'),
  },
  {
    package: 'orvex-ai',
    migrationsDir: resolveSiblingMigrationsDir('orvex-ai'),
  },
];

export class OrvexMigrationProvider {
  constructor(
    private readonly packages: OrvexPackageMigrationEntry[] = ORVEX_MIGRATION_PACKAGES,
  ) {}

  async getMigrations(): Promise<Record<string, OrvexMigration>> {
    const result: Record<string, OrvexMigration> = {};

    for (const entry of this.packages) {
      let files: string[];
      try {
        files = await fs.readdir(entry.migrationsDir);
      } catch {
        continue;
      }

      const migrationFiles = files.filter((f) =>
        /^\d{3}-[^.]+\.(js|ts)$/.test(f),
      );

      for (const file of migrationFiles) {
        const stem = file.replace(/\.(ts|js)$/, '');
        const key = `${entry.package}/${stem}`;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(path.join(entry.migrationsDir, file));
        result[key] = { up: mod.up, down: mod.down };
      }
    }

    // Deterministic lexicographic order so the migrator applies migrations in
    // a stable, reproducible sequence across replicas.
    return Object.fromEntries(
      Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
}
