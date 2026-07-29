// ENG-3167 — the hand-typed two-segment AuditEvent map is REPLACED by the
// engine's own generation lane (AD-5/AD-8): every audit type is a
// contracts-registered `audit.<category>.<verb>` constant generated from the
// pinned orvex-studio-contracts declaration (publisher orvex-wiki, AD-23
// register-before-emit). See scripts/generate-audit-events.mjs and
// contracts-pin/wiki-audit-types.json (provenance + regen-diff gate).
export {
  AuditEvent,
  ALL_WIKI_AUDIT_TYPES,
  AUDIT_EVENT_SOURCE,
  WIKI_AUDIT_PAYLOAD_CONTRACT,
} from './audit-events.gen';
export type { AuditEventType } from './audit-events.gen';
import { AuditEvent } from './audit-events.gen';
import type { AuditEventType } from './audit-events.gen';


export const EXCLUDED_AUDIT_EVENTS: Set<string> = new Set([
  AuditEvent.PAGE_CREATED,
  AuditEvent.PAGE_MOVED_TO_SPACE,
  AuditEvent.PAGE_DUPLICATED,
  AuditEvent.COMMENT_CREATED,
  AuditEvent.COMMENT_UPDATED,
  AuditEvent.COMMENT_RESOLVED,
  AuditEvent.COMMENT_REOPENED,
  AuditEvent.ATTACHMENT_UPLOADED
]);

export const AuditResource = {
  WORKSPACE: 'workspace',
  USER: 'user',
  PAGE: 'page',
  SPACE: 'space',
  SPACE_MEMBER: 'space_member',
  GROUP: 'group',
  COMMENT: 'comment',
  SHARE: 'share',
  API_KEY: 'api_key',
  SCIM_TOKEN: 'scim_token',
  SSO_PROVIDER: 'sso_provider',
  WORKSPACE_INVITATION: 'workspace_invitation',
  ATTACHMENT: 'attachment',
  LICENSE: 'license',
} as const;

export type AuditResourceType =
  (typeof AuditResource)[keyof typeof AuditResource];

// ENG-1396 (AC6): `external_agent` classifies an API-key-authenticated
// caller (distinct from `api_key`, which is unused by any call site and
// kept only for back-compat of the exported union).
export type ActorType = 'user' | 'system' | 'api_key' | 'external_agent';

export interface AuditLogPayload {
  event: AuditEventType;
  resourceType: AuditResourceType;
  resourceId?: string;
  spaceId?: string;
  // ENG-3167 (AC4) — the closed outcome code carried in the staged outbox
  // payload ('success' when omitted; a deny/failure lane site passes
  // 'denied'/'blocked'/...). A reference code, never prose (AD-39).
  outcome?: string;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  metadata?: Record<string, any>;
  // ENG-3167: INERT. The ENG-1396 critical/deferred durability split was
  // deleted with the hard-cut (AD-24: every write rides the caller's runner
  // synchronously — no deferred/best-effort mode exists). The field is
  // retained ONLY so pre-existing logAndCommit callers still compile; the
  // writer ignores it. Scheduled for removal with the AC9 local-audit-table
  // leg.
  critical?: boolean;
}

export interface AuditLogData extends AuditLogPayload {
  workspaceId: string;
  actorId?: string;
  actorType: ActorType;
  ipAddress?: string;
  userAgent?: string;
  // ENG-1396 (AC7): the API-key UUID for an `external_agent` actor. Never
  // set for `user`/`system` rows.
  clientId?: string;
}
