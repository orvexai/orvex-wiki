import * as path from 'path';
import { promises as fs } from 'fs';
import { Kysely } from 'kysely';

/**
 * Migrations run against the live engine's full, unbounded Postgres schema —
 * they are not scoped to one typed `Database` interface. CS ❌#12 (no `any`
 * laundering) forbids the literal `any` keyword in this package's exported
 * surface, so this alias stands in for "some Kysely instance, schema not
 * statically known" instead: every migration body uses the raw `sql` tag
 * (DDL/parameterized DML), never the schema-typed query builder.
 */
export type OrvexDb = object;

export interface OrvexMigration {
  up: (db: Kysely<OrvexDb>) => Promise<void>;
  down?: (db: Kysely<OrvexDb>) => Promise<void>;
}

export interface OrvexPackageMigrationEntry {
  package: string;
  migrationsDir: string;
}

// __dirname resolves to `packages/@orvex/extensions/src` under ts-jest/vitest
// and `packages/@orvex/extensions/dist` after compilation.
//
// PD-4d (2026-07-08) orchestrator ruling: the registry lists ONLY the
// engine-shipped `orvex-extensions` package. It previously also listed
// `orvex-oidc`/`orvex-ai` "for forward-compat", but those packages are
// satellite directories the AGPL engine will never ship — registering them
// here is dead config (CS ❌#6 no speculative scaffolding). `orvex-linear` is
// deliberately absent (D-S11 / po-ruling 2: Linear is excluded from this
// engine leg). When `orvex-oidc`/`orvex-ai` land as their own satellites,
// each owns its own migration ledger — they are not folded into this one.
export const ORVEX_MIGRATION_PACKAGES: OrvexPackageMigrationEntry[] = [
  {
    package: 'orvex-extensions',
    migrationsDir: path.join(__dirname, 'orvex-migrations'),
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
