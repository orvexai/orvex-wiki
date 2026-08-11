import { Module } from '@nestjs/common';
import { WorkspaceService } from './services/workspace.service';
import { WorkspaceController } from './controllers/workspace.controller';
import { SpaceModule } from '../space/space.module';
import { WorkspaceInvitationService } from './services/workspace-invitation.service';
import { WorkspaceUpgradeService } from './services/workspace-upgrade.service';
import { TokenModule } from '../auth/token.module';
import { OrvexConfigModule } from '../../orvex/config/orvex-config.module';

@Module({
  // A-CELL — `OrvexConfigService` supplies the `CELL_ID` that
  // `WorkspaceService.create` stamps onto every workspace it mints.
  imports: [SpaceModule, TokenModule, OrvexConfigModule],
  controllers: [WorkspaceController],
  providers: [
    WorkspaceService,
    WorkspaceInvitationService,
    // ENG-2503 — the personal→Teams upgrade-pass (in-place re-key, D-S17).
    WorkspaceUpgradeService,
  ],
  exports: [WorkspaceService, WorkspaceUpgradeService],
})
export class WorkspaceModule {}
