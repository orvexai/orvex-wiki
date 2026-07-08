import { OrvexMigrationProvider } from '@orvex/extensions';

import type { OrvexMigrationMap } from './orvex-migrator.service';
import type { KyselyTransaction } from '../../database/types/kysely.types';

/**
 * ENG-1411 (PD-4d 2026-07-08 reconciliation) — feeds the package-local
 * `OrvexMigrationProvider` registry (packages/@orvex/extensions, engine-only
 * package set: `orvex-extensions`) into the MERGED ENG-1389
 * `OrvexMigratorService`'s `ORVEX_MIGRATIONS` shape.
 *
 * One migrator (ENG-1389, `pg_advisory_xact_lock` / `ORVEX_MIGRATION_LOCK_KEY`
 * 823_477_001), one lock key, one provider (this file is the seam between
 * them) — no second competing migrator implementation.
 *
 * The provider's migration bodies are typed against `Kysely<OrvexDb>`
 * (`OrvexDb = object`) because `@orvex/extensions` sits behind the AGPL
 * import guard (A-BOUNDARY) and may never statically import `@docmost/*`
 * types such as `KyselyTransaction`. Every migration body in that package
 * uses only the raw `sql` tag (never the schema-typed query builder), so the
 * cast below is a documented, deliberate narrowing at this app-side seam —
 * not a laundered `any` (CS ❌#12; no literal `any` appears in this file).
 */
export async function buildOrvexMigrations(
  provider: OrvexMigrationProvider = new OrvexMigrationProvider(),
): Promise<OrvexMigrationMap> {
  const migrations = await provider.getMigrations();
  const map: OrvexMigrationMap = {};

  for (const [name, migration] of Object.entries(migrations)) {
    const [pkg] = name.split('/');
    map[name] = {
      package: pkg,
      up: migration.up as unknown as (
        trx: KyselyTransaction,
      ) => Promise<void>,
    };
  }

  return map;
}
