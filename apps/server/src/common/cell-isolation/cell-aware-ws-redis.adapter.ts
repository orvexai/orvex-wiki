// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { ServerOptions } from 'socket.io';
import { WsRedisIoAdapter } from '../../ws/adapter/ws-redis.adapter';
import { WebSocketCellGuard } from './websocket-cell.guard';

/** Orvex additive wrapper: cell admission runs in Engine.IO before HTTP 101. */
export class CellAwareWsRedisIoAdapter extends WsRedisIoAdapter {
  constructor(
    app: any,
    private readonly webSocketCellGuard: WebSocketCellGuard,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      allowRequest: (request, callback) =>
        this.webSocketCellGuard.allowSocketIoRequest(request, callback),
    });
  }
}
