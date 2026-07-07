import { Module } from '@nestjs/common';
import { OrvexMailAdminController } from './orvex-mail-admin.controller';
import {
  ORVEX_SMTP_PROBE_TRANSPORT_FACTORY,
  RealSmtpProbeTransportFactory,
} from './orvex-smtp-probe-transport.factory';

/**
 * Mounts the SMTP mail operational-config admin surface
 * (`/api/integrations/mail/*`, AC4-AC7). Guarded per-handler by
 * {@link JwtAuthGuard} + the workspace-settings CASL check. Additive,
 * mounted by {@link OrvexRootModule} only when the master flag is on.
 */
@Module({
  controllers: [OrvexMailAdminController],
  providers: [
    {
      provide: ORVEX_SMTP_PROBE_TRANSPORT_FACTORY,
      useClass: RealSmtpProbeTransportFactory,
    },
  ],
})
export class OrvexMailModule {}
