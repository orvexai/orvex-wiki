import { Module } from '@nestjs/common';
import { OrvexStorageAdminController } from './orvex-storage-admin.controller';
import {
  ORVEX_S3_PROBE_CLIENT_FACTORY,
  RealS3ProbeClientFactory,
} from './orvex-s3-probe-client.factory';

/**
 * Mounts the S3 storage operational-config admin surface
 * (`/api/integrations/storage/*`, AC1-AC3/AC10). Guarded per-handler by
 * {@link JwtAuthGuard} + the workspace-settings CASL check; the engine
 * binary attachment up/down path itself (AC8/AC9) lives at
 * `core/attachment` and is unaffected — this module is additive, and wired
 * unconditionally into {@link AppModule} (independent of the
 * `ORVEX_MODULES_ENABLED` master flag, which only gates
 * {@link OrvexRootModule}) — storage/mail admin ships even solo per PO
 * ruling 5.
 */
@Module({
  controllers: [OrvexStorageAdminController],
  providers: [
    {
      provide: ORVEX_S3_PROBE_CLIENT_FACTORY,
      useClass: RealS3ProbeClientFactory,
    },
  ],
})
export class OrvexAttachmentsHostModule {}
