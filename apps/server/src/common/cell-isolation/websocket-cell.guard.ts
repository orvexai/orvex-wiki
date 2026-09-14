// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IncomingMessage } from 'http';
import * as cookie from 'cookie';
import { JwtPayload, JwtType } from '../../core/auth/dto/jwt-payload';
import { TokenService } from '../../core/auth/services/token.service';
import {
  WorkspaceCellAssertionService,
  WorkspaceCellMismatchException,
} from './workspace-cell-assertion.service';

type CellCheckedRequest = IncomingMessage & {
  orvexCellCheckedAccessToken?: JwtPayload;
};

@Injectable()
export class WebSocketCellGuard {
  constructor(
    private readonly tokenService: TokenService,
    private readonly cellAssertion: WorkspaceCellAssertionService,
  ) {}

  async assertAccessRequest(
    request: IncomingMessage,
    surface: string,
  ): Promise<JwtPayload> {
    const checked = request as CellCheckedRequest;
    if (checked.orvexCellCheckedAccessToken) {
      return checked.orvexCellCheckedAccessToken;
    }

    const cookies = cookie.parse(request.headers.cookie ?? '');
    const rawToken = cookies.authToken;
    if (!rawToken) {
      throw new UnauthorizedException('Missing WebSocket access token');
    }
    const token = (await this.tokenService.verifyJwt(
      rawToken,
      JwtType.ACCESS,
    )) as JwtPayload;
    if (!token.workspaceId) {
      throw new UnauthorizedException('WebSocket token has no workspace');
    }

    await this.cellAssertion.assertWorkspaceId(token.workspaceId, surface);
    checked.orvexCellCheckedAccessToken = token;
    return token;
  }

  /** Socket.IO/Engine.IO admission hook: denial happens before HTTP 101. */
  allowSocketIoRequest(
    request: IncomingMessage,
    callback: (error: string | null, success: boolean) => void,
  ): void {
    void this.assertAccessRequest(request, 'socket.io upgrade').then(
      () => callback(null, true),
      (error: unknown) =>
        callback(
          error instanceof WorkspaceCellMismatchException
            ? 'CELL_MISMATCH'
            : 'Unauthorized',
          false,
        ),
    );
  }

  /**
   * The browser's Hocuspocus transport authenticates each document after the
   * raw upgrade. If the same-origin access cookie is present, reject a wrong
   * cell before HTTP 101 as defense in depth; if it is absent (supported by
   * the standalone collab host), AuthenticationExtension remains the
   * mandatory tenant-aware gate as soon as the collab token arrives.
   */
  async assertCollabUpgradeIfCredentialed(
    request: IncomingMessage,
  ): Promise<void> {
    const cookies = cookie.parse(request.headers.cookie ?? '');
    if (!cookies.authToken) {
      return;
    }
    await this.assertAccessRequest(request, 'collaboration upgrade');
  }
}
