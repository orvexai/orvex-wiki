/**
 * The `orvex_page_meta` side table (FR-W3) — the FIRST schema move of the
 * fold-in. Today the fork injects 18 product columns physically onto upstream
 * `pages`; this side table moves them off so upstream `pages` stays pristine and
 * the FR-30 divergence gate can forbid new product columns on `pages`.
 *
 * A-CELL rule #7: new orvex schemas use UUIDv7 PKs, are workspace-keyed, and
 * carry NO `cell_id` column on tenant rows (tenant → cell lives in the registry).
 *
 * OPEN DECISION (FR-W3): whether `version` / `content_hash` stay on upstream
 * `pages` (arguably core concurrency columns) or move here — deferred to build;
 * it also decides the A-MOVE TenantMoveManifest store list.
 */
export interface OrvexPageMeta {
  /** UUIDv7. */
  id: string;
  /** FK → pages.id (the join key; upstream `pages` stays pristine). */
  pageId: string;
  /** RLS tenant key. */
  workspaceId: string;

  // ── Drift / spec-gate STAMP fields (D-S8) — the engine keeps only these;
  //    the drift + spec-gate SERVICES live in orvex-wiki-api. ──────────────
  verifiedAgainst: string | null;
  verifiedAt: Date | null;
  specConfirmed: boolean;

  // ── Concurrency / provenance (placement per FR-W3 open decision) ────────
  version: number | null;
  contentHash: string | null;
  externalId: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/** The drift/spec-gate stamp subset wiki-api writes through the engine seam. */
export type OrvexPageStamp = Pick<
  OrvexPageMeta,
  'verifiedAgainst' | 'verifiedAt' | 'specConfirmed'
>;
