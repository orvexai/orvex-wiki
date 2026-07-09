export enum EventName {
  COLLAB_PAGE_UPDATED = 'collab.page.updated',
  PAGE_CREATED = 'page.created',
  PAGE_UPDATED = 'page.updated',
  PAGE_CONTENT_UPDATED = 'page-content-updated',
  PAGE_MOVED_TO_SPACE = 'page-moved-to-space',
  PAGE_DELETED = 'page.deleted',
  PAGE_SOFT_DELETED = 'page.soft_deleted',
  PAGE_RESTORED = 'page.restored',

  SPACE_CREATED = 'space.created',
  SPACE_UPDATED = 'space.updated',
  SPACE_DELETED = 'space.deleted',

  WORKSPACE_CREATED = 'workspace.created',
  WORKSPACE_UPDATED = 'workspace.updated',
  WORKSPACE_DELETED = 'workspace.deleted',

  BASE_CREATED = 'base.created',
  BASE_UPDATED = 'base.updated',
  BASE_DELETED = 'base.deleted',

  BASE_ROW_CREATED = 'base.row.created',
  BASE_ROW_UPDATED = 'base.row.updated',
  BASE_ROW_DELETED = 'base.row.deleted',
  BASE_ROWS_DELETED = 'base.rows.deleted',
  BASE_ROW_RESTORED = 'base.row.restored',
  BASE_ROW_REORDERED = 'base.row.reordered',

  BASE_PROPERTY_CREATED = 'base.property.created',
  BASE_PROPERTY_UPDATED = 'base.property.updated',
  BASE_PROPERTY_DELETED = 'base.property.deleted',
  BASE_PROPERTY_REORDERED = 'base.property.reordered',

  BASE_VIEW_CREATED = 'base.view.created',
  BASE_VIEW_UPDATED = 'base.view.updated',
  BASE_VIEW_DELETED = 'base.view.deleted',

  BASE_SCHEMA_BUMPED = 'base.schema.bumped',
  BASE_ROWS_UPDATED = 'base.rows.updated',
  BASE_FORMULA_RECOMPUTE_STARTED = 'base.formula.recompute.started',
  BASE_FORMULA_RECOMPUTE_COMPLETED = 'base.formula.recompute.completed',
}

// ENG-1383 fix-pass-1 (F1): the workspace/space/comment/attachment
// `orvex-events` lifecycle-family EventName members (and the dedicated
// PAGE_STATUS_CHANGED / PAGE_CONTENT_BLOCKS_CHANGED members) that were
// ported in for the now-removed `OrvexEventBusService` were deleted here —
// nothing in this repo ever emitted them, and PD-4d descoped that family to
// ENG-1609. The one real lifecycle-status producer, `page.status_changed`,
// is written directly by `OrvexPageProvenanceService.writeStatus` via the
// dedicated `EVT_PAGE_STATUS_CHANGED` outbox-type constant — it never went
// through `EventEmitter2`/`EventName` at all.
