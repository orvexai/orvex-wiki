#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
//
// ENG-3167 — the engine's OWN audit-type generation lane (AD-8 / AD-5).
//
// The AGPL engine imports NO closed package (AD-8): it generates its audit
// constants ITSELF from a pinned extraction of the Apache-2.0
// orvex-studio-contracts declaration plane
// (src/common/events/contracts-pin/wiki-audit-types.json — provenance in
// that file's $comment). Every emitted audit type is a contracts-registered
// `audit.<category>.<verb>` constant (AD-23 register-before-emit); a
// hand-typed audit literal is a build failure (AD-5).
//
// The legacy->type mapping is DERIVED, never tabulated: the contracts-side
// verb is the engine's legacy two-segment action with '.'/'_' hyphenated
// (injective over the engine's set), so this script resolves each legacy
// action to EXACTLY ONE pinned type and fails loud (AD-3) on zero or
// multiple matches. Adding a newly registered type to the pin flows through
// with no change to this script or to any emit body (AC11).
//
// Usage:  node scripts/generate-audit-events.mjs           (regenerate)
//         node scripts/generate-audit-events.mjs --check   (AD-5 regen-diff)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(HERE, '..');
const PIN_PATH = join(
  SERVER_ROOT,
  'src/common/events/contracts-pin/wiki-audit-types.json',
);
const OUT_PATH = join(SERVER_ROOT, 'src/common/events/audit-events.gen.ts');

// ── the engine's legacy audit-action surface (constant name -> legacy action).
// This enumerates the ENGINE's own emit surface (the pre-ENG-3167 hand-typed
// AuditEvent map) — engine-owned data, not contract data. The contract data
// (which audit.<category>.<verb> types exist, and under which category) lives
// ONLY in the pin; this list never names a category.
const LEGACY_ACTIONS = {
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  WORKSPACE_INVITE_CREATED: 'workspace.invite_created',
  WORKSPACE_INVITE_RESENT: 'workspace.invite_resent',
  WORKSPACE_INVITE_REVOKED: 'workspace.invite_revoked',
  USER_CREATED: 'user.created',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_PASSWORD_RESET: 'user.password_reset',
  USER_UPDATED: 'user.updated',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ACTIVATED: 'user.activated',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_UPDATED: 'api_key.updated',
  API_KEY_DELETED: 'api_key.deleted',
  API_KEY_REVOKED: 'api_key.revoked',
  AUTH_FAILED: 'auth.failed',
  SCIM_TOKEN_CREATED: 'scim_token.created',
  SCIM_TOKEN_UPDATED: 'scim_token.updated',
  SCIM_TOKEN_DELETED: 'scim_token.deleted',
  SPACE_CREATED: 'space.created',
  SPACE_UPDATED: 'space.updated',
  SPACE_DELETED: 'space.deleted',
  SPACE_MEMBER_ADDED: 'space.member_added',
  SPACE_MEMBER_REMOVED: 'space.member_removed',
  SPACE_MEMBER_ROLE_CHANGED: 'space.member_role_changed',
  GROUP_CREATED: 'group.created',
  GROUP_UPDATED: 'group.updated',
  GROUP_DELETED: 'group.deleted',
  GROUP_MEMBER_ADDED: 'group.member_added',
  GROUP_MEMBER_REMOVED: 'group.member_removed',
  COMMENT_CREATED: 'comment.created',
  COMMENT_DELETED: 'comment.deleted',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_RESOLVED: 'comment.resolved',
  COMMENT_REOPENED: 'comment.reopened',
  PAGE_CREATED: 'page.created',
  PAGE_TRASHED: 'page.trashed',
  PAGE_DELETED: 'page.deleted',
  PAGE_RESTORED: 'page.restored',
  PAGE_HISTORY_RESTORED: 'page.history_restored',
  PAGE_MOVED_TO_SPACE: 'page.moved_to_space',
  PAGE_DUPLICATED: 'page.duplicated',
  PAGE_RESTRICTED: 'page.restricted',
  PAGE_RESTRICTION_REMOVED: 'page.restriction_removed',
  PAGE_PERMISSION_ADDED: 'page.permission_added',
  PAGE_PERMISSION_REMOVED: 'page.permission_removed',
  PAGE_PERMISSION_ROLE_UPDATED: 'page.permission_role_updated',
  PAGE_VERIFICATION_CREATED: 'page.verification_created',
  PAGE_VERIFICATION_UPDATED: 'page.verification_updated',
  PAGE_VERIFICATION_REMOVED: 'page.verification_removed',
  PAGE_VERIFIED: 'page.verified',
  PAGE_APPROVAL_REQUESTED: 'page.approval_requested',
  PAGE_APPROVAL_REJECTED: 'page.approval_rejected',
  PAGE_MARKED_OBSOLETE: 'page.marked_obsolete',
  PAGE_PROVENANCE_CHANGED: 'page.provenance_changed',
  SHARE_CREATED: 'share.created',
  SHARE_DELETED: 'share.deleted',
  PAGE_IMPORTED: 'page.imported',
  PAGE_EXPORTED: 'page.exported',
  SPACE_EXPORTED: 'space.exported',
  SSO_PROVIDER_CREATED: 'sso.provider_created',
  SSO_PROVIDER_UPDATED: 'sso.provider_updated',
  SSO_PROVIDER_DELETED: 'sso.provider_deleted',
  USER_MFA_ENABLED: 'user.mfa_enabled',
  USER_MFA_DISABLED: 'user.mfa_disabled',
  USER_MFA_BACKUP_CODE_GENERATED: 'user.mfa_backup_code_generated',
  LICENSE_ACTIVATED: 'license.activated',
  LICENSE_REMOVED: 'license.removed',
  ATTACHMENT_UPLOADED: 'attachment.uploaded',
  OIDC_LOGIN_BLOCKED_BY_ENFORCE_SSO: 'oidc.login_blocked_by_enforce_sso',
  OIDC_ENFORCE_SSO_TOGGLED: 'oidc.enforce_sso_toggled',
  RATIFY_GATE_SETTING_UPDATED: 'ratify_gate.setting_updated',
  RATIFY_GATE_FORCE_SELF_RATIFY: 'ratify_gate.force_self_ratify',
  PAGE_SUPERSEDED: 'page.superseded',
  PAGE_UNSUPERSEDED: 'page.unsuperseded',
  SUPERSEDE_FORCED_BYPASS: 'page.supersede_forced_bypass',
  FORCE_SUPERSEDE_SETTING_UPDATED: 'force_supersede.setting_updated',
  TRANSCLUSION_REFERENCE_UNSYNCED: 'transclusion.reference_unsynced',
  TRANSCLUSION_FORCE_DELETE: 'transclusion.force_delete',
};

function fail(msg) {
  console.error(`generate-audit-events: ${msg}`);
  process.exit(1);
}

const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8'));
if (!Array.isArray(pin.types) || pin.types.length === 0) {
  fail(`pin ${PIN_PATH} carries no types`);
}
if (typeof pin.serviceToken !== 'string' || pin.serviceToken === '') {
  fail(`pin ${PIN_PATH} carries no serviceToken`);
}
const GRAMMAR = /^audit\.[a-z-]+\.[a-z-]+$/;
for (const t of pin.types) {
  if (!GRAMMAR.test(t)) fail(`pinned type ${t} violates the audit grammar`);
}

// verb -> full type (loud on a grammar collision inside the pin).
const byVerb = new Map();
for (const t of pin.types) {
  const verb = t.split('.').slice(2).join('.');
  if (byVerb.has(verb)) {
    fail(`pinned types ${byVerb.get(verb)} and ${t} share verb ${verb}`);
  }
  byVerb.set(verb, t);
}

const entries = [];
for (const [name, legacy] of Object.entries(LEGACY_ACTIONS)) {
  const verb = legacy.replace(/[._]/g, '-');
  const type = byVerb.get(verb);
  if (!type) {
    fail(
      `legacy action ${legacy} (${name}) resolves to no pinned contracts type ` +
        `(verb ${verb}) — register it in orvex-studio-contracts events/catalog.yaml ` +
        `FIRST (AD-23 register-before-emit), then re-extract the pin.`,
    );
  }
  entries.push([name, type]);
}

const unmapped = pin.types.filter((t) => !entries.some(([, v]) => v === t));

let b = '';
b += '// Code generated by scripts/generate-audit-events.mjs from the pinned\n';
b += '// orvex-studio-contracts audit declaration — DO NOT EDIT (AD-5: generated,\n';
b += '// never transcribed; the regen-diff gate reds on drift).\n';
b += `// Pin: ${pin.pin.repo}@${pin.pin.commit} (${pin.pin.branch})\n`;
b += '// SPDX-License-Identifier: AGPL-3.0-only\n';
b += '// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).\n';
b += '\n';
b += "/** The engine's AD-31 service token — the CloudEvents `source` of every\n";
b += ' *  audit emission (AD-23: exactly the token, no scheme prefix, no path\n';
b += ' *  suffix, no alias). */\n';
b += `export const AUDIT_EVENT_SOURCE = ${JSON.stringify(pin.serviceToken)} as const;\n`;
b += '\n';
b += '/** The contracts-registered `audit.<category>.<verb>` type for every one of\n';
b += " *  the engine's audit actions (publisher orvex-wiki; AD-23\n";
b += ' *  register-before-emit). Constant NAMES are the engine emit surface;\n';
b += ' *  VALUES are generated contract data. */\n';
b += 'export const AuditEvent = {\n';
for (const [name, type] of entries) {
  b += `  ${name}: ${JSON.stringify(type)},\n`;
}
b += '} as const;\n';
b += '\n';
b += 'export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent];\n';
b += '\n';
b += '/** Every pinned engine audit type, in pin order — includes types registered\n';
b += ' *  ahead of an engine constant (AD-23 permits register-before-emit). */\n';
b += 'export const ALL_WIKI_AUDIT_TYPES = [\n';
for (const t of pin.types) {
  b += `  ${JSON.stringify(t)},\n`;
}
b += '] as const;\n';
b += '\n';
b += "/** The CLOSED payload field contract per type, from each type's registered\n";
b += ' *  events/schemas/<type>.json (additionalProperties:false — AD-39\n';
b += ' *  references-not-content). The writer builds and VALIDATES every staged\n';
b += ' *  payload against this generated data: required ⊆ keys ⊆ properties, or a\n';
b += ' *  loud typed error (AD-3) — schema drift can never emit silently. */\n';
b += 'export const WIKI_AUDIT_PAYLOAD_CONTRACT: Readonly<\n';
b += '  Record<string, { required: readonly string[]; properties: readonly string[] }>\n';
b += '> = {\n';
if (!pin.payloads || typeof pin.payloads !== 'object') {
  fail('pin carries no payloads contract block — re-run the extraction');
}
for (const t of pin.types) {
  const c = pin.payloads[t];
  if (!c) fail(`pinned type ${t} has no payload contract — re-run the extraction`);
  b += `  ${JSON.stringify(t)}: {\n`;
  b += `    required: ${JSON.stringify(c.required)},\n`;
  b += `    properties: ${JSON.stringify(c.properties)},\n`;
  b += '  },\n';
}
b += '};\n';
if (unmapped.length > 0) {
  b += '\n';
  b += '// Registered ahead of an engine constant (no live emit site yet):\n';
  for (const t of unmapped) {
    b += `//   ${t}\n`;
  }
}

if (process.argv.includes('--check')) {
  const committed = readFileSync(OUT_PATH, 'utf8');
  if (committed !== b) {
    fail(
      'regen-diff: src/common/events/audit-events.gen.ts drifted from the pinned ' +
        'declaration — run `node scripts/generate-audit-events.mjs` (AD-5).',
    );
  }
  console.log('generate-audit-events --check: byte-identical (AD-5 regen-diff clean).');
} else {
  writeFileSync(OUT_PATH, b);
  console.log(
    `generate-audit-events: emitted ${entries.length} constants (+${unmapped.length} ` +
      `registered-ahead) from pin ${pin.pin.commit.slice(0, 7)}.`,
  );
}
