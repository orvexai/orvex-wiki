// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IncomingMessage } from 'http';
import { WebSocketServer } from 'ws';
import { WebSocketCellGuard } from './websocket-cell.guard';
import { WorkspaceCellMismatchException } from './workspace-cell-assertion.service';

/**
 * Orvex additive counterpart to the upstream collab adapter. It preserves the
 * path routing while refusing a credentialed wrong-cell request before 101.
 */
export class CellAwareCollabWsAdapter {
  private readonly wss = new WebSocketServer({ noServer: true });

  constructor(private readonly webSocketCellGuard: WebSocketCellGuard) {}

  handleUpgrade(path: string, httpServer: any): WebSocketServer {
    httpServer.on(
      'upgrade',
      async (request: IncomingMessage, socket: any, head: Buffer) => {
        try {
          const baseUrl = `ws://${request.headers.host}/`;
          const pathname = new URL(request.url ?? '/', baseUrl).pathname;

          if (pathname === path) {
            await this.webSocketCellGuard.assertCollabUpgradeIfCredentialed(
              request,
            );
            this.wss.handleUpgrade(request, socket, head, (ws) => {
              this.wss.emit('connection', ws, request);
            });
          } else if (pathname !== '/socket.io/') {
            socket.destroy();
          }
        } catch (error) {
          if (error instanceof WorkspaceCellMismatchException) {
            const body = JSON.stringify(error.getResponse());
            socket.end(
              'HTTP/1.1 421 Misdirected Request\r\n' +
                'Content-Type: application/json\r\n' +
                `Content-Length: ${Buffer.byteLength(body)}\r\n` +
                'Connection: close\r\n\r\n' +
                body,
            );
            return;
          }
          socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        }
      },
    );
    return this.wss;
  }

  close(): void {
    try {
      this.wss.close();
    } catch (error) {
      console.error(error);
    }
  }

  destroy(): void {
    try {
      this.wss.close();
      this.wss.clients.forEach((client) => client.terminate());
    } catch (error) {
      console.error(error);
    }
  }
}
