// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
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
// ENG-2497 AC1 — RESERVED, deliberately unwired: whole-tenant workspace
// removal has NO trigger in this repo today, and whether the engine ever
// owns that trigger (vs. reacting to an external deprovision signal) is
// OPEN-4 / R-WIKI-7 — contested and unruled. Do NOT wire an emission for
// this constant (or invent a delete-workspace route) until OPEN-4 resolves.
export const EVT_WORKSPACE_DELETED = 'workspace.deleted';
export const EVT_WORKSPACE_MEMBER_ADDED = 'workspace.member_added';
// ENG-2504 (FR-W21) — the Stripe seat-sync severance event: a seat change
// (invitation acceptance) writes this outbox row in the SAME transaction as
// the member insert; orvex-studio-billing consumes it downstream. NOTE the
// relay hard-codes the `wiki.` CloudEvent prefix (outbox-relay.service.ts),
// so on the wire this is `wiki.workspace.seats_changed` — NEVER a literal
// `billing.*`-domain CloudEvent (that taxonomy tension is escalated in
// ENG-2504's §4d, not silently resolved here).
export const EVT_WORKSPACE_SEATS_CHANGED = 'workspace.seats_changed';
export const EVT_WORKSPACE_MEMBER_ROLE_CHANGED = 'workspace.member_role_changed';
export const EVT_WORKSPACE_MEMBER_DEACTIVATED = 'workspace.member_deactivated';
export const EVT_WORKSPACE_MEMBER_DELETED = 'workspace.member_deleted';

// User events — FR-37 distributed-cleanup contract (ENG-2497).
// `user.deleted` is the durable, cross-service GDPR-deletion SIGNAL every
// external consumer (knowledge, billing, the event service) deletes its own
// copy off — distinct from `workspace.member_deleted` ("membership changed")
// and from the audit-log-only AuditEvent.USER_DELETED. Publishes over the
// relay as `wiki.user.deleted`, a registered purge_event in the contracts
// sources/wiki.yaml registry.
export const EVT_USER_DELETED = 'user.deleted';
/** FR-36 — the explicit schema version carried in every `user.deleted` payload. */
export const USER_DELETED_SCHEMA_VERSION = 1;

// Space events
export const EVT_SPACE_CREATED = 'space.created';
export const EVT_SPACE_UPDATED = 'space.updated';
export const EVT_SPACE_DELETED = 'space.deleted';
export const EVT_SPACE_MEMBER_ADDED = 'space.member_added';
export const EVT_SPACE_MEMBER_REMOVED = 'space.member_removed';
export const EVT_SPACE_MEMBER_ROLE_CHANGED = 'space.member_role_changed';
