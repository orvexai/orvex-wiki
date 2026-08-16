// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Extension, onAuthenticatePayload } from '@hocuspocus/server';
import { JwtCollabPayload, JwtType } from '../../core/auth/dto/jwt-payload';
import { TokenService } from '../../core/auth/services/token.service';
import { WorkspaceCellAssertionService } from './workspace-cell-assertion.service';

/** Orvex additive Hocuspocus gate, ordered before upstream authentication. */
@Injectable()
export class CollaborationCellExtension implements Extension {
  constructor(
    private readonly tokenService: TokenService,
    private readonly cellAssertion: WorkspaceCellAssertionService,
  ) {}

  async onAuthenticate(data: onAuthenticatePayload): Promise<void> {
    let payload: JwtCollabPayload;
    try {
      payload = (await this.tokenService.verifyJwt(
        data.token,
        JwtType.COLLAB,
      )) as JwtCollabPayload;
    } catch {
      throw new UnauthorizedException('Invalid collab token');
    }
    await this.cellAssertion.assertWorkspaceId(
      payload.workspaceId,
      'collaboration authentication',
    );
  }
}
