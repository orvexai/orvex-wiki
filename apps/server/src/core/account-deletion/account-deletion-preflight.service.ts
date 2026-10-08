// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { UserRepo } from '@docmost/db/repos/user/user.repo';

export interface AccountDeletionPreflightResult {
  result: 'proceed' | 'ownership_transfer_required';
  blockingWorkspaces: Array<{ workspaceId: string; name: string }>;
}

/** Read-only, user-context check before Identity revokes sessions or starts deletion. */
@Injectable()
export class AccountDeletionPreflightService {
  constructor(private readonly userRepo: UserRepo) {}

  async check(
    subject: string,
    personalWorkspaceId: string,
  ): Promise<AccountDeletionPreflightResult> {
    if (!isUUID(personalWorkspaceId)) {
      throw new UnauthorizedException('principal not provisioned');
    }

    // The assertion's personal-workspace tenant proves that this is a locally
    // provisioned principal before the principal-scoped cross-workspace check.
    const userId = await this.userRepo.findUserIdByProviderUserId(
      subject,
      personalWorkspaceId,
    );
    if (!userId) {
      throw new UnauthorizedException('principal not provisioned');
    }

    const workspaces =
      await this.userRepo.findDeletionBlockingWorkspaces(subject);
    // The legacy workspace schema permits NULL names, while the pinned wire
    // contract requires a string. Keep the response shape stable for those
    // historical rows without exposing any member identity data.
    const blockingWorkspaces = workspaces.map(({ workspaceId, name }) => ({
      workspaceId,
      name: name ?? 'Untitled workspace',
    }));
    return {
      result: blockingWorkspaces.length
        ? 'ownership_transfer_required'
        : 'proceed',
      blockingWorkspaces,
    };
  }
}
