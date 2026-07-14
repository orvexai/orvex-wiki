import { Module } from '@nestjs/common';
import { OrvexLabelService, ORVEX_LABEL_SERVICE } from './orvex-label.service';

/**
 * Provides the space/workspace-scoped label service (ENG-1385) to the orvex
 * tree. `SpaceMemberRepo` and the Kysely `db` are already registered by the
 * (global) DatabaseModule, so this module only wires the service itself.
 */
@Module({
  providers: [
    OrvexLabelService,
    { provide: ORVEX_LABEL_SERVICE, useExisting: OrvexLabelService },
  ],
  exports: [OrvexLabelService, ORVEX_LABEL_SERVICE],
})
export class OrvexLabelModule {}
