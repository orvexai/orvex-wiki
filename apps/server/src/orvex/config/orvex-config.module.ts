import { Global, Module } from '@nestjs/common';
import { OrvexConfigService } from './orvex-config.service';

/**
 * Global so every orvex/* module reads the endpoint seam + cell contract from
 * one place. Env-only, no I/O — safe to instantiate.
 */
@Global()
@Module({
  providers: [OrvexConfigService],
  exports: [OrvexConfigService],
})
export class OrvexConfigModule {}
