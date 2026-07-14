// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable } from '@nestjs/common';
import { WsService } from '../../ws/ws.service';
import { IPageLifecycleBroadcaster } from './supersede.types';

/**
 * ENG-1434 AC13 — the real, `WsService`-backed adapter for
 * `IPageLifecycleBroadcaster`. Thin: no domain logic, just the transport
 * call. Tests substitute an in-memory fake implementing the same
 * interface (CS §5 4f — injected port + in-memory fake, never a
 * `jest.mock` of an owned package).
 */
@Injectable()
export class WsPageLifecycleBroadcaster implements IPageLifecycleBroadcaster {
  constructor(private readonly wsService: WsService) {}

  broadcastLifecycleChange(event: {
    workspaceId: string;
    spaceId: string;
    pageId: string;
    status: string;
  }): void {
    this.wsService.emitPageLifecycleEvent(event.spaceId, {
      pageId: event.pageId,
      status: event.status,
      workspaceId: event.workspaceId,
    });
  }
}
