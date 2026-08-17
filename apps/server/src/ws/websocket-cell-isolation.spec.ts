// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { Server as SocketIoServer } from 'socket.io';
import { WebSocket } from 'ws';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../integrations/environment/environment.service';
import { OrvexConfigService } from '../orvex/config/orvex-config.service';
import { TokenService } from '../core/auth/services/token.service';
import { JwtType } from '../core/auth/dto/jwt-payload';
import { WebSocketCellGuard } from '../common/cell-isolation/websocket-cell.guard';
import {
  WorkspaceCellAssertionService,
  WorkspaceCellMismatchException,
} from '../common/cell-isolation/workspace-cell-assertion.service';
import { CellIsolationModule } from '../common/cell-isolation/cell-isolation.module';
import { CellAwareCollabWsAdapter } from '../common/cell-isolation/cell-aware-collab-ws.adapter';
import { CollaborationCellExtension } from '../common/cell-isolation/collaboration-cell.extension';
import { SocketIoCellAdmissionInstaller } from '../common/cell-isolation/socket-io-cell-admission.installer';

const SECRET = 'websocket-cell-test-secret-at-least-32-characters';
const WORKSPACE_ID = 'f799e55a-478a-4ca7-9b0e-6e1324b6c6a7';

function buildGuard(workspaceCellId = 'us1') {
  const jwtService = new JwtService();
  const environmentService = {
    isCloud: () => true,
    getAppSecret: () => SECRET,
  } as unknown as EnvironmentService;
  const tokenService = new TokenService(jwtService, environmentService);
  const workspaceRepo = {
    findById: jest.fn().mockResolvedValue({
      id: WORKSPACE_ID,
      cellId: workspaceCellId,
    }),
  } as unknown as WorkspaceRepo;
  const assertion = new WorkspaceCellAssertionService(
    workspaceRepo,
    environmentService,
    new OrvexConfigService({ CELL_ID: 'eu1' } as NodeJS.ProcessEnv),
  );
  return {
    jwtService,
    tokenService,
    assertion,
    guard: new WebSocketCellGuard(tokenService, assertion),
  };
}

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function refusedUpgrade(
  url: string,
  authToken: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url, {
      headers: { Cookie: `authToken=${authToken}` },
    });
    client.once('open', () => reject(new Error('foreign-cell upgrade opened')));
    client.once('unexpected-response', (_request, response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () =>
        resolve({ statusCode: response.statusCode ?? 0, body }),
      );
    });
    client.once('error', () => undefined);
  });
}

function installSocketIoAdmission(guard: WebSocketCellGuard) {
  const opts: {
    allowRequest?: SocketIoServer['engine']['opts']['allowRequest'];
  } = {};
  const gateway = { server: { engine: { opts } } };
  const moduleRef = { get: () => gateway };
  new SocketIoCellAdmissionInstaller(
    moduleRef as any,
    guard,
  ).onApplicationBootstrap();
  return opts.allowRequest;
}

describe('live WebSocket cell isolation', () => {
  it('refuses a foreign-cell Socket.IO WebSocket upgrade before connection', async () => {
    const { jwtService, guard } = buildGuard();
    const token = jwtService.sign(
      {
        sub: 'user-1',
        workspaceId: WORKSPACE_ID,
        type: JwtType.ACCESS,
      },
      { secret: SECRET },
    );
    const httpServer = createServer();
    const io = new SocketIoServer(httpServer, {
      transports: ['websocket'],
      allowRequest: installSocketIoAdmission(guard),
    });
    const connected = jest.fn();
    io.on('connection', connected);
    const port = await listen(httpServer);

    try {
      const refusal = await refusedUpgrade(
        `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`,
        token,
      );
      // Engine.IO projects an allowRequest=false WebSocket handshake as 400;
      // the material assertion is that HTTP 101 never occurs and no Socket.IO
      // connection callback runs.
      expect(refusal.statusCode).toBe(400);
      expect(connected).not.toHaveBeenCalled();
    } finally {
      io.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }
  });

  it('admits the same Socket.IO upgrade shape when the workspace belongs to this cell', async () => {
    const { jwtService, guard } = buildGuard('eu1');
    const token = jwtService.sign(
      {
        sub: 'user-1',
        workspaceId: WORKSPACE_ID,
        type: JwtType.ACCESS,
      },
      { secret: SECRET },
    );
    const httpServer = createServer();
    const io = new SocketIoServer(httpServer, {
      transports: ['websocket'],
      allowRequest: installSocketIoAdmission(guard),
    });
    const port = await listen(httpServer);

    try {
      await new Promise<void>((resolve, reject) => {
        const client = new WebSocket(
          `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`,
          { headers: { Cookie: `authToken=${token}` } },
        );
        client.once('open', () => {
          client.close();
          resolve();
        });
        client.once('unexpected-response', (_request, response) =>
          reject(
            new Error(`matching-cell upgrade returned ${response.statusCode}`),
          ),
        );
        client.once('error', reject);
      });
    } finally {
      io.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }
  });

  it('refuses a foreign-cell collaboration upgrade with the canonical 421 envelope', async () => {
    const { jwtService, guard } = buildGuard();
    const token = jwtService.sign(
      {
        sub: 'user-1',
        workspaceId: WORKSPACE_ID,
        type: JwtType.ACCESS,
      },
      { secret: SECRET },
    );
    const httpServer = createServer();
    const adapter = new CellAwareCollabWsAdapter(guard);
    adapter.handleUpgrade('/collab', httpServer);
    const port = await listen(httpServer);

    try {
      const refusal = await refusedUpgrade(
        `ws://127.0.0.1:${port}/collab`,
        token,
      );
      expect(refusal.statusCode).toBe(421);
      expect(JSON.parse(refusal.body)).toEqual({
        errorCode: 'CELL_MISMATCH',
        message:
          'This host does not serve the requested workspace; re-discover.',
        details: { cell: 'eu1', reResolve: { action: 'rediscover' } },
      });
    } finally {
      adapter.destroy();
      if (httpServer.listening) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
    }
  });

  it('rejects a foreign-cell collab token when the standalone host has no access cookie', async () => {
    const { jwtService, tokenService, assertion } = buildGuard();
    const extension = new CollaborationCellExtension(tokenService, assertion);
    const collabToken = jwtService.sign(
      {
        sub: 'user-1',
        workspaceId: WORKSPACE_ID,
        type: JwtType.COLLAB,
      },
      { secret: SECRET },
    );

    await expect(
      extension.onAuthenticate({
        documentName: 'page.f47ac10b-58cc-4372-a567-0e02b2c3d479',
        token: collabToken,
        connectionConfig: {},
      } as any),
    ).rejects.toBeInstanceOf(WorkspaceCellMismatchException);
  });

  it('composes the assertion module into the standalone collaboration binary', async () => {
    const requiredEnv = {
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      APP_SECRET: SECRET,
    };
    const saved = Object.fromEntries(
      Object.keys(requiredEnv).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, requiredEnv);

    try {
      const { CollaborationModule } =
        await import('../collaboration/collaboration.module');
      const { CollabAppModule } =
        await import('../collaboration/server/collab-app.module');
      const standaloneImports: unknown[] = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        CollabAppModule,
      );
      const collaborationImports: unknown[] = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        CollaborationModule,
      );
      expect(standaloneImports).toContain(CollaborationModule);
      expect(collaborationImports).toContain(CellIsolationModule);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
