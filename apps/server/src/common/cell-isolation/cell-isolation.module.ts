// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TokenModule } from '../../core/auth/token.module';
import { OrvexConfigModule } from '../../orvex/config/orvex-config.module';
import { WebSocketCellGuard } from './websocket-cell.guard';
import { WorkspaceCellAssertionService } from './workspace-cell-assertion.service';
import { CollaborationCellExtension } from './collaboration-cell.extension';
import { ShareSeoCellInterceptor } from './share-seo-cell.interceptor';
import { SocketIoCellAdmissionInstaller } from './socket-io-cell-admission.installer';

@Global()
@Module({
  imports: [TokenModule, OrvexConfigModule],
  providers: [
    WorkspaceCellAssertionService,
    WebSocketCellGuard,
    CollaborationCellExtension,
    ShareSeoCellInterceptor,
    SocketIoCellAdmissionInstaller,
    { provide: APP_INTERCEPTOR, useExisting: ShareSeoCellInterceptor },
  ],
  exports: [
    WorkspaceCellAssertionService,
    WebSocketCellGuard,
    CollaborationCellExtension,
  ],
})
export class CellIsolationModule {}
