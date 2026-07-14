import { Global, Module } from '@nestjs/common';
import { OrvexAuditService } from './orvex-audit.service';
import { OrvexAuditActorResolver } from '../../orvex/audit/orvex-audit-actor.resolver';

@Global()
@Module({
  providers: [OrvexAuditService, OrvexAuditActorResolver],
  exports: [OrvexAuditService, OrvexAuditActorResolver],
})
export class OrvexAuditModule {}
