import { Global, Module } from '@nestjs/common';
import { OrvexAuditService } from './orvex-audit.service';

@Global()
@Module({
  providers: [OrvexAuditService],
  exports: [OrvexAuditService],
})
export class OrvexAuditModule {}
