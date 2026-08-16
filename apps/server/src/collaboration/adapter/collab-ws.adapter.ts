import { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { WorkspaceCellMismatchException } from '../../common/cell-isolation/workspace-cell-assertion.service';

export class CollabWsAdapter {
  private readonly wss: WebSocketServer;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
  }

  handleUpgrade(
    path: string,
    httpServer: any,
    authorizeUpgrade?: (request: IncomingMessage) => Promise<void>,
  ) {
    httpServer.on('upgrade', async (request: any, socket: any, head: any) => {
      try {
        const baseUrl = 'ws://' + request.headers.host + '/';
        const pathname = new URL(request.url, baseUrl).pathname;

        if (pathname === path) {
          await authorizeUpgrade?.(request);
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
          });
        } else if (pathname === '/socket.io/') {
          return;
        } else {
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
    });

    return this.wss;
  }

  public close() {
    try {
      this.wss.close();
    } catch (err) {
      console.error(err);
    }
  }

  public destroy() {
    try {
      this.wss.close();
      this.wss.clients.forEach((client) => {
        client.terminate();
      });
    } catch (err) {
      console.error(err);
    }
  }
}
