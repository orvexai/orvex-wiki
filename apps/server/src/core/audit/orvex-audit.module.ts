import { Global, Module } from '@nestjs/common';
import { OrvexAuditService } from './orvex-audit.service';
import { OrvexAuditActorResolver } from '../../orvex/audit/orvex-audit-actor.resolver';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';

/**
 * ENG-3167 hard-cut — `AUDIT_SERVICE` binds ONLY the real transactional
 * writer. The former global `NoopAuditModule` (which bound the deleted
 * silent-swallow `NoopAuditService`) no longer exists; this module is the
 * one global audit binding: every `@Inject(AUDIT_SERVICE)` site now stages a
 * real `orvexEventOutbox` row (in the caller's own transaction when one is
 * passed — AD-24).
 */
@Global()
@Module({
  providers: [
    OutboxWriter,
    OrvexAuditService,
    OrvexAuditActorResolver,
    {
      provide: AUDIT_SERVICE,
      useExisting: OrvexAuditService,
    },
  ],
  exports: [OrvexAuditService, OrvexAuditActorResolver, AUDIT_SERVICE],
})
export class OrvexAuditModule {}
