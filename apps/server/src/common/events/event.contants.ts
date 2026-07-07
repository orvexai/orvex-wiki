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

  // ENG-1383: orvex-events lifecycle family ported from
  // orvexai/docmost@050187676624f2395c55b36ec60e365f87fd4a9f
  // (union, additive — dev's BASE_* family is untouched). AC7 needs these
  // for outbox lifecycle coverage.
  WORKSPACE_MEMBER_ADDED = 'workspace.member.added', // orvex-events
  WORKSPACE_MEMBER_ROLE_CHANGED = 'workspace.member.role_changed', // orvex-events
  WORKSPACE_MEMBER_DEACTIVATED = 'workspace.member.deactivated', // orvex-events
  WORKSPACE_MEMBER_DELETED = 'workspace.member.deleted', // orvex-events

  COMMENT_CREATED = 'comment.created', // orvex-events
  COMMENT_UPDATED = 'comment.updated', // orvex-events
  COMMENT_DELETED = 'comment.deleted', // orvex-events
  COMMENT_RESOLVED = 'comment.resolved', // orvex-events
  ATTACHMENT_CREATED = 'attachment.created', // orvex-events
  ATTACHMENT_DELETED = 'attachment.deleted', // orvex-events
  SPACE_MEMBER_ADDED = 'space.member.added', // orvex-events
  SPACE_MEMBER_REMOVED = 'space.member.removed', // orvex-events
  SPACE_MEMBER_ROLE_CHANGED = 'space.member.role_changed', // orvex-events
  PAGE_PURGED = 'page.purged', // orvex-events
  PAGE_STATUS_CHANGED = 'page.status_changed', // orvex-events: dedicated lifecycle status event

  // R6: in-process event emitted by the REST write path carrying the
  // block-level delta; OutboxEventBusService consumes it to enrich the next
  // PAGE_CONTENT_UPDATED outbox row with changedBlockIds (AC5/AC8).
  PAGE_CONTENT_BLOCKS_CHANGED = 'page-content-blocks-changed',
}
