// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { TokenModule } from '../../core/auth/token.module';
import { OrvexConfigModule } from '../../orvex/config/orvex-config.module';
import { WebSocketCellGuard } from './websocket-cell.guard';
import { WorkspaceCellAssertionService } from './workspace-cell-assertion.service';

@Module({
  imports: [TokenModule, OrvexConfigModule],
  providers: [WorkspaceCellAssertionService, WebSocketCellGuard],
  exports: [WorkspaceCellAssertionService, WebSocketCellGuard],
})
export class CellIsolationModule {}
