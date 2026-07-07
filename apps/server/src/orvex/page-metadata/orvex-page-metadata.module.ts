import { Module } from '@nestjs/common';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';

/**
 * ENG-1371 — the page-metadata domain module. `WorkspaceRepo`/`KyselyDB` are
 * provided by the `@Global()` `DatabaseModule`, so this module only needs to
 * declare + export the service itself.
 */
@Module({
  providers: [OrvexPageMetadataService],
  exports: [OrvexPageMetadataService],
})
export class OrvexPageMetadataModule {}
