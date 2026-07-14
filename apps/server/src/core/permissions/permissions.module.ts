import { Module } from '@nestjs/common';
import { OrvexAuditModule } from '../audit/orvex-audit.module';
import { OrvexPermissionsService } from './orvex-permissions.service';
import { PagePermissionController } from './page-permission.controller';
import { PagePermissionService } from './page-permission.service';

@Module({
  imports: [OrvexAuditModule],
  controllers: [PagePermissionController],
  providers: [OrvexPermissionsService, PagePermissionService],
  exports: [OrvexPermissionsService, PagePermissionService],
})
export class PermissionsModule {}
