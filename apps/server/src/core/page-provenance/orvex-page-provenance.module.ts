import { forwardRef, Module } from '@nestjs/common';
import { OrvexPageProvenanceService } from './orvex-page-provenance.service';
import { OrvexPageProvenanceController } from './orvex-page-provenance.controller';
import { CaslModule } from '../../core/casl/casl.module';
import { PageModule } from '../../core/page/page.module';
import { OrvexAuditModule } from '../../core/audit/orvex-audit.module';

/**
 * ENG-1447 — AI-provenance orchestration.
 *
 * Provides {@link OrvexPageProvenanceService} (the status-row writer + audit
 * emitter) and the human-verify controller.
 *
 * `PageRepo` (DatabaseModule) and `OrvexAuditService` (OrvexAuditModule) are
 * both `@Global()`-provided, so no explicit import is needed for either.
 *
 * `PageModule` is imported (via `forwardRef`, since `PageModule` does not
 * import this module back — but `PageService` is needed here to persist the
 * mark-stripped content through the canonical collab write path on verify,
 * never a raw `page.content` column write) for `PageService`.
 */
@Module({
  imports: [CaslModule, OrvexAuditModule, forwardRef(() => PageModule)],
  controllers: [OrvexPageProvenanceController],
  providers: [OrvexPageProvenanceService],
  exports: [OrvexPageProvenanceService],
})
export class OrvexPageProvenanceModule {}
