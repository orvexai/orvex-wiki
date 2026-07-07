/**
 * Ported (narrow slice) from orvexai/docmost@050187676624f2395c55b36ec60e365f87fd4a9f
 * `apps/server/src/orvex/events/constants/orvex-event-types.ts`.
 *
 * These are the outbox row `type` column values (ENG-1383 AC9 — a typed
 * {type, aggregateId, workspaceId, payload} row, no CloudEvent envelope).
 * The stream-sentinel constants (EVT_STREAM_GAP etc.) and the Redis stream
 * prefix from the fork source are SSE-fan-out concerns (a separate leg —
 * ENG-1476) and are deliberately NOT ported here.
 */

// Page events
export const EVT_PAGE_CREATED = 'page.created';
export const EVT_PAGE_UPDATED = 'page.updated';
export const EVT_PAGE_CONTENT_UPDATED = 'page.content_updated';
export const EVT_PAGE_MOVED = 'page.moved';
export const EVT_PAGE_DELETED = 'page.deleted';
export const EVT_PAGE_RESTORED = 'page.restored';
export const EVT_PAGE_PURGED = 'page.purged';
export const EVT_PAGE_STATUS_CHANGED = 'page.status_changed';

// Comment events
export const EVT_COMMENT_CREATED = 'comment.created';
export const EVT_COMMENT_UPDATED = 'comment.updated';
export const EVT_COMMENT_DELETED = 'comment.deleted';
export const EVT_COMMENT_RESOLVED = 'comment.resolved';

// Attachment events
export const EVT_ATTACHMENT_CREATED = 'attachment.created';
export const EVT_ATTACHMENT_DELETED = 'attachment.deleted';

// Workspace events
export const EVT_WORKSPACE_CREATED = 'workspace.created';
export const EVT_WORKSPACE_UPDATED = 'workspace.updated';
export const EVT_WORKSPACE_DELETED = 'workspace.deleted';
export const EVT_WORKSPACE_MEMBER_ADDED = 'workspace.member_added';
export const EVT_WORKSPACE_MEMBER_ROLE_CHANGED = 'workspace.member_role_changed';
export const EVT_WORKSPACE_MEMBER_DEACTIVATED = 'workspace.member_deactivated';
export const EVT_WORKSPACE_MEMBER_DELETED = 'workspace.member_deleted';

// Space events
export const EVT_SPACE_CREATED = 'space.created';
export const EVT_SPACE_UPDATED = 'space.updated';
export const EVT_SPACE_DELETED = 'space.deleted';
export const EVT_SPACE_MEMBER_ADDED = 'space.member_added';
export const EVT_SPACE_MEMBER_REMOVED = 'space.member_removed';
export const EVT_SPACE_MEMBER_ROLE_CHANGED = 'space.member_role_changed';
