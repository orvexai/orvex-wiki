// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ForbiddenException } from '@nestjs/common';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';

/**
 * Types derived from the already-imported (relative-path) {@link
 * WorkspaceAbilityFactory} rather than a fresh `@docmost/db/*` import — the
 * A-BOUNDARY AGPL import-guard forbids `orvex/**` from statically importing
 * `@docmost/*` (additive columns go through the single declaration-merge
 * file, orvex/types). `@AuthUser()`/`@AuthWorkspace()` resolve the same
 * runtime shape `WorkspaceAbilityFactory.createForUser` expects, so this
 * keeps both surfaces exactly type-safe without a forbidden import.
 */
export type OrvexAuthedUser = Parameters<
  WorkspaceAbilityFactory['createForUser']
>[0];
export type OrvexAuthedWorkspace = Parameters<
  WorkspaceAbilityFactory['createForUser']
>[1];

/**
 * Shared pure authz gate (CS §6 handler-tier helper) for both operational
 * config admin surfaces (storage AC2, mail AC5): reject non-admins with the
 * literal `{error:'INSUFFICIENT_PERMISSIONS'}` body, 403.
 */
export function assertWorkspaceAdmin(
  workspaceAbility: WorkspaceAbilityFactory,
  user: OrvexAuthedUser,
  workspace: OrvexAuthedWorkspace,
): void {
  const ability = workspaceAbility.createForUser(user, workspace);
  if (
    ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
  ) {
    throw new ForbiddenException({ error: 'INSUFFICIENT_PERMISSIONS' });
  }
}
