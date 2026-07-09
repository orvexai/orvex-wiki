import { forwardRef, Module } from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageController } from './page.controller';
import { PageHistoryService } from './services/page-history.service';
import { TrashCleanupService } from './services/trash-cleanup.service';
import { BacklinkService } from './services/backlink.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { WatcherModule } from '../watcher/watcher.module';
import { TransclusionModule } from './transclusion/transclusion.module';
import { LabelModule } from '../label/label.module';
import { OrvexPageProvenanceModule } from '../page-provenance/orvex-page-provenance.module';
import { OrvexPageMetadataModule } from '../../orvex/page-metadata/orvex-page-metadata.module';
import { OrvexLlmsModule } from '../../orvex/llms/orvex-llms.module';
import { CaslModule } from '../casl/casl.module';
import { PageVerificationController } from './page-verification.controller';
import { PageVerificationService } from './page-verification.service';
import { PageVerificationRepo } from './page-verification.repo';
import { PageVerificationEntitlementGuard } from './page-verification-entitlement.guard';

@Module({
  controllers: [PageController, PageVerificationController],
  providers: [
    PageService,
    PageHistoryService,
    TrashCleanupService,
    BacklinkService,
    // ENG-1459 — QMS page-verification (entitlement-gated, D-EE-1 defer).
    PageVerificationService,
    PageVerificationRepo,
    PageVerificationEntitlementGuard,
  ],
  exports: [PageService, PageHistoryService],
  imports: [
    StorageModule,
    // ENG-1459 — SpaceAbilityFactory for the verification controller's
    // read/edit page-access checks.
    CaslModule,
    // ENG-1603 (F2 fix) — forwardRef: CollaborationModule now (transitively,
    // via OrvexPageProvenanceModule) requires this file at module-load time
    // before this class's exports binding is set. A direct (non-deferred)
    // reference here would decorate PageModule with `undefined` in its
    // imports array instead of the CollaborationModule class.
    forwardRef(() => CollaborationModule),
    WatcherModule,
    TransclusionModule,
    LabelModule,
    // ENG-1447 — REST-write provenance stamping (AC5). forwardRef: the
    // provenance module needs PageService (verify's content persist) back.
    forwardRef(() => OrvexPageProvenanceModule),
    // ENG-1371 (AC8, review1 F1/F2) — request-edge frontmatter interceptor,
    // bound on PageController.create/.update.
    OrvexPageMetadataModule,
    // ENG-1492 — token-scope-filtered LLM discovery surface (llms.txt /
    // llms-full.txt / pages/:id/page.md). Unconditional import (DB-aware
    // home, mirroring OrvexPageMetadataModule above); OrvexModulesEnabledGuard
    // reproduces ORVEX_MODULES_ENABLED at the request edge (AC6).
    OrvexLlmsModule,
  ],
})
export class PageModule {}
