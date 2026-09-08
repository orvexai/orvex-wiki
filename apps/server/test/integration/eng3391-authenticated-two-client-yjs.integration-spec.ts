// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3391 — remedy-independent transport proof.
 *
 * This is deliberately a real two-client WebSocket test: the Hocuspocus
 * server, its no-server HTTP upgrade wiring, both provider sockets, the
 * production AuthenticationExtension, JWT verification, and the ACL reads
 * all run for real. Postgres is a testcontainers substitute for local
 * infrastructure, not an in-memory fake. The test proves that two
 * authenticated clients can sync a Yjs update through the `/collab` path;
 * the live idle-edge probe remains an external deployment concern.
 */
import { Hocuspocus } from '@hocuspocus/server';
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from '@hocuspocus/provider';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createServer, Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import * as Y from 'yjs';

import { EnvironmentService } from 'src/integrations/environment/environment.service';
import { TokenService } from 'src/core/auth/services/token.service';
import { AuthenticationExtension } from 'src/collaboration/extensions/authentication.extension';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { SpaceRole } from 'src/common/helpers/types/permission';
import {
  seedPage,
  seedSpace,
  seedSpaceMember,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

jest.setTimeout(120_000);

const APP_SECRET = 'eng3391-integration-secret';
const DOCUMENT_UPDATE = 'ENG-3391 authenticated Yjs update';

type Client = {
  document: Y.Doc;
  provider: HocuspocusProvider;
  websocket: HocuspocusProviderWebsocket;
};

function cacheWithoutPersistence() {
  return {
    get: async () => undefined,
    set: async () => undefined,
  } as any;
}

async function listen(server: HttpServer): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function closeServer(server: HttpServer | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('TestAuthenticatedTwoClientYjsSyncOverRealWebSocket (ENG-3391)', () => {
  let testDb: TestDb;
  let httpServer: HttpServer;
  let websocketServer: WebSocketServer;
  let hocuspocus: Hocuspocus;
  let clients: Client[] = [];

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const db = testDb.db as any;
    const eventEmitter = new EventEmitter2();
    const cache = cacheWithoutPersistence();
    const groupRepo = new GroupRepo(db);
    const spaceRepo = new SpaceRepo(db, eventEmitter);
    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepo,
      spaceRepo,
      cache,
    );
    const pagePermissionRepo = new PagePermissionRepo(db, groupRepo, cache);
    const pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      eventEmitter,
      new OutboxWriter(db),
      {} as any,
    );

    const workspace = await seedWorkspace(testDb.db);
    const firstUser = await seedUser(testDb.db, workspace.id);
    const secondUser = await seedUser(testDb.db, workspace.id);
    const space = await seedSpace(testDb.db, workspace.id, firstUser.id);
    await seedSpaceMember(testDb.db, {
      spaceId: space.id,
      userId: firstUser.id,
      role: SpaceRole.WRITER,
    });
    await seedSpaceMember(testDb.db, {
      spaceId: space.id,
      userId: secondUser.id,
      role: SpaceRole.WRITER,
    });
    const page = await seedPage(testDb.db, {
      spaceId: space.id,
      workspaceId: workspace.id,
      creatorId: firstUser.id,
      position: null,
      title: 'ENG-3391 authenticated collab proof',
      content: { type: 'doc', content: [] },
    });

    const configService = new ConfigService({ APP_SECRET });
    const environmentService = new EnvironmentService(configService);
    const tokenService = new TokenService(
      new JwtService({ secret: APP_SECRET }),
      environmentService,
    );
    const authenticationExtension = new AuthenticationExtension(
      tokenService,
      new UserRepo(db),
      pageRepo,
      spaceMemberRepo,
      pagePermissionRepo,
    );

    hocuspocus = new Hocuspocus({ extensions: [authenticationExtension] });
    httpServer = createServer();
    websocketServer = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(
        request.url ?? '/',
        `ws://${request.headers.host ?? '127.0.0.1'}`,
      );
      if (url.pathname !== '/collab') {
        socket.destroy();
        return;
      }
      websocketServer.handleUpgrade(request, socket, head, (client) => {
        hocuspocus.handleConnection(client, request);
      });
    });
    const port = await listen(httpServer);
    const url = `ws://127.0.0.1:${port}/collab`;
    const documentName = `page.${page.id}`;

    const firstToken = await tokenService.generateCollabToken(
      firstUser,
      workspace.id,
    );
    const secondToken = await tokenService.generateCollabToken(
      secondUser,
      workspace.id,
    );

    clients = await Promise.all([
      connectClient(url, documentName, firstToken),
      connectClient(url, documentName, secondToken),
    ]);
  }, 120_000);

  afterAll(async () => {
    for (const client of clients) {
      client.provider.destroy();
      client.websocket.destroy();
      client.document.destroy();
    }
    clients = [];
    hocuspocus?.closeConnections();
    websocketServer?.close();
    await closeServer(httpServer);
    await testDb?.teardown();
  });

  it('authenticates both sockets and propagates a Yjs edit from client one to client two', async () => {
    expect(clients).toHaveLength(2);
    expect(clients[0].provider.isAuthenticated).toBe(true);
    expect(clients[1].provider.isAuthenticated).toBe(true);
    expect(clients[0].provider.synced).toBe(true);
    expect(clients[1].provider.synced).toBe(true);

    const receiver = clients[1].document.getXmlFragment('default');
    const updateArrived = new Promise<void>((resolve) => {
      const onUpdate = () => {
        if (receiver.toString().includes(DOCUMENT_UPDATE)) {
          clients[1].document.off('update', onUpdate);
          resolve();
        }
      };
      clients[1].document.on('update', onUpdate);
    });

    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(DOCUMENT_UPDATE)]);
    clients[0].document.getXmlFragment('default').push([paragraph]);

    await updateArrived;
    expect(receiver.toString()).toContain(DOCUMENT_UPDATE);
  });
});

async function connectClient(
  url: string,
  documentName: string,
  token: string,
): Promise<Client> {
  let resolveSync: () => void = () => undefined;
  let rejectSync: (reason?: unknown) => void = () => undefined;
  const synced = new Promise<void>((resolve, reject) => {
    resolveSync = resolve;
    rejectSync = reject;
  });
  const document = new Y.Doc();
  const websocket = new HocuspocusProviderWebsocket({
    url,
    WebSocketPolyfill: WebSocket,
    autoConnect: false,
    maxAttempts: 1,
  });
  const provider = new HocuspocusProvider({
    name: documentName,
    document,
    token,
    websocketProvider: websocket,
    onSynced: () => resolveSync(),
    onAuthenticationFailed: ({ reason }) => {
      rejectSync(new Error(`collab authentication failed: ${reason}`));
    },
  });

  // A provider supplied with an explicit websocket must be attached before
  // the socket connects; this is the same provider/socket split used by the
  // production editor when multiple documents share a transport.
  provider.attach();
  await websocket.connect();
  await synced;

  return { document, provider, websocket };
}
