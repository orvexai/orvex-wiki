/**
 * orvex-db.d.ts — the SINGLE declaration-merge file for every additive orvex
 * column/table (A-BOUNDARY task #4, "type hygiene").
 *
 * Doctrine: v0.95's `db.d.ts` is taken VERBATIM (it restores the SCIM EE columns
 * the fork stripped + `is_base`/`base_schema_version`), and EVERY additive orvex
 * column is routed through THIS one file — never edited into the generated
 * `db.d.ts` — so importing upstream Docmost stays a mechanical overlay-rebase
 * and the `orvex_page_meta` move keeps upstream `pages` pristine.
 *
 * These interfaces are the Kysely row shapes for the new orvex tables (A-CELL
 * rule #7: UUIDv7 PK, workspace-keyed, NO `cell_id` column). They are kept
 * self-contained (no import of the engine `DB` type) so the skeleton compiles
 * standalone; the intended merge into the engine's Kysely `DB` is:
 *
 *   // in the engine's kysely setup (fold-in WS-2):
 *   //   import type { OrvexTables } from '../orvex/types/orvex-db';
 *   //   type DB = StockDB & OrvexTables;
 */

export interface OrvexPageMetaTable {
  id: string; // uuidv7, PK
  page_id: string; // FK → pages.id
  workspace_id: string; // RLS tenant key
  verified_against: string | null;
  verified_at: Date | null;
  spec_confirmed: boolean;
  version: number | null;
  content_hash: string | null;
  external_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrvexOutboxTable {
  id: string; // uuidv7, PK
  workspace_id: string;
  event_type: string;
  payload: unknown; // jsonb
  published_at: Date | null;
  created_at: Date;
}

export interface OrvexMigrationsTable {
  name: string; // migration filename (the separate orvex ledger)
  applied_at: Date;
}

/** The additive tables to intersect with the stock Kysely `DB` type. */
export interface OrvexTables {
  orvex_page_meta: OrvexPageMetaTable;
  orvex_outbox: OrvexOutboxTable;
  orvex_migrations: OrvexMigrationsTable;
}
