// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WsGateway } from '../../ws/ws.gateway';
import { WebSocketCellGuard } from './websocket-cell.guard';

/** Installs the cell assertion on Engine.IO's HTTP-upgrade admission hook. */
@Injectable()
export class SocketIoCellAdmissionInstaller implements OnApplicationBootstrap {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly webSocketCellGuard: WebSocketCellGuard,
  ) {}

  onApplicationBootstrap(): void {
    let gateway: WsGateway;
    try {
      gateway = this.moduleRef.get(WsGateway, { strict: false });
    } catch {
      // The standalone collaboration binary deliberately has no WsGateway.
      return;
    }

    const engine = gateway.server?.engine;
    if (!engine) {
      return;
    }

    engine.opts.allowRequest = (request, callback) =>
      this.webSocketCellGuard.allowSocketIoRequest(request, callback);
  }
}
