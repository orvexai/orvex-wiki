import { Module } from '@nestjs/common';
import { OrvexMailAdminController } from './orvex-mail-admin.controller';
import {
  ORVEX_SMTP_PROBE_TRANSPORT_FACTORY,
  RealSmtpProbeTransportFactory,
} from './orvex-smtp-probe-transport.factory';

/**
 * Mounts the SMTP mail operational-config admin surface
 * (`/api/integrations/mail/*`, AC4-AC7). Guarded per-handler by
 * {@link JwtAuthGuard} + the workspace-settings CASL check. Additive, and
 * wired unconditionally into {@link AppModule} (independent of the
 * `ORVEX_MODULES_ENABLED` master flag, which only gates
 * {@link OrvexRootModule}) — storage/mail admin ships even solo per PO
 * ruling 5.
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
