import { Module } from '@nestjs/common';
import { LabelController } from './label.controller';
import { LabelService } from './label.service';
import { OrvexLabelModule } from './orvex-label.module';
import { OrvexLabelService, ORVEX_LABEL_SERVICE } from './orvex-label.service';

@Module({
  controllers: [LabelController],
  providers: [LabelService],
  // ENG-1650 — `OrvexLabelModule` (ENG-1385's space/workspace-scoped label
  // service) had zero importers anywhere in the tree and was therefore
  // unreachable via DI. `LabelModule` is its owning module (po-ruling-10
  // pattern, cf. `PageModule` carrying `OrvexPageProvenanceModule` /
  // `OrvexPageMetadataModule`); wiring it here makes `OrvexLabelService`
  // resolvable everywhere `LabelModule` is imported (already `PageModule`).
  imports: [OrvexLabelModule],
  exports: [LabelService, OrvexLabelService, ORVEX_LABEL_SERVICE],
})
export class LabelModule {}
