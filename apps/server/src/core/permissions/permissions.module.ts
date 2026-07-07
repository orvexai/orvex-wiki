import { Module } from '@nestjs/common';
import { OrvexAuditModule } from '../audit/orvex-audit.module';
import { OrvexPermissionsService } from './orvex-permissions.service';
import { PagePermissionController } from './page-permission.controller';

@Module({
  imports: [OrvexAuditModule],
  controllers: [PagePermissionController],
  providers: [OrvexPermissionsService],
  exports: [OrvexPermissionsService],
})
export class PermissionsModule {}
