import { Global, Module } from '@nestjs/common';
import { OrvexPermissionsService } from './orvex-permissions.service';

@Global()
@Module({
  providers: [OrvexPermissionsService],
  exports: [OrvexPermissionsService],
})
export class OrvexPermissionsModule {}
