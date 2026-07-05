import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

@Module({
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
