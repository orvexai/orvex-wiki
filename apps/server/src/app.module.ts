import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvironmentService } from './integrations/environment/environment.service';
import { AuditActorInterceptor } from './common/interceptors/audit-actor.interceptor';
import { CoreModule } from './core/core.module';
import { EnvironmentModule } from './integrations/environment/environment.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { WsModule } from './ws/ws.module';
import { DatabaseModule } from '@docmost/db/database.module';
import { StorageModule } from './integrations/storage/storage.module';
import { MailModule } from './integrations/mail/mail.module';
import { QueueModule } from './integrations/queue/queue.module';
import { StaticModule } from './integrations/static/static.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './integrations/health/health.module';
import { ExportModule } from './integrations/export/export.module';
import { ImportModule } from './integrations/import/import.module';
import { SecurityModule } from './integrations/security/security.module';
import { TelemetryModule } from './integrations/telemetry/telemetry.module';
import { RedisModule } from '@nestjs-labs/nestjs-ioredis';
import { RedisConfigService } from './integrations/redis/redis-config.service';
import { IdempotencyStoreModule } from './integrations/redis/idempotency-store.module';
import { EntitlementModule } from './orvex/entitlement/entitlement.module';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { LoggerModule } from './common/logger/logger.module';
import { ClsModule } from 'nestjs-cls';
import { NoopAuditModule } from './integrations/audit/audit.module';
import { ThrottleModule } from './integrations/throttle/throttle.module';
import { OrvexRootModule } from './orvex/orvex-root.module';
import { OrvexAttachmentsHostModule } from './orvex/attachments/orvex-attachments-host.module';
import { OrvexMailModule } from './orvex/mail/orvex-mail.module';
import { OrvexPageProvenanceModule } from './core/page-provenance/orvex-page-provenance.module';
import { OrvexPageVisualsModule } from './orvex/page-visuals/orvex-page-visuals.module';
import { OrvexTransclusionSafeguardModule } from './orvex/transclusion-safeguard/orvex-transclusion-safeguard.module';
import { OrvexEventsModule } from './orvex/events/orvex-events.module';
import { OrvexMigratorModule } from './orvex/extensions/orvex-migrator.module';
import { InternalApiModule } from './core/internal-api/internal-api.module';
import { OrvexSessionMintModule } from './core/session-mint/orvex-session-mint.module';

const enterpriseModules = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (require('./ee/ee.module')?.EeModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    enterpriseModules.push(require('./ee/ee.module')?.EeModule);
  }
} catch (err) {
  if (process.env.CLOUD === 'true') {
    // FR-W20 CLOUD-clean boot decouple: the multi-tenant hot path must NOT depend
    // on ee/. A missing ee/ under CLOUD=true is a loud warning, NEVER a
    // boot-killing process.exit — the engine continues.
    console.warn(
      'CLOUD=true but ee/ absent — continuing; multi-tenant hot path must not depend on ee/ (FR-W20)',
      err,
    );
  }
}

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggerModule,
    NoopAuditModule,
    CoreModule,
    DatabaseModule,
    EnvironmentModule,
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
    IdempotencyStoreModule,
    EntitlementModule,
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (environmentService: EnvironmentService) => {
        const redisUrl = environmentService.getRedisUrl();

        return {
          ttl: 5 * 1000,
          stores: [new KeyvRedis(redisUrl)],
        };
      },
      inject: [EnvironmentService],
    }),
    CollaborationModule,
    WsModule,
    QueueModule,
    StaticModule,
    HealthModule,
    ImportModule,
    ExportModule,
    // ENG-1957 — the engine-internal `/internal/*` HTTP surface (ACL
    // filter / page export / page resolve / AI-search settings). Mounted
    // unconditionally (not gated behind ORVEX_MODULES_ENABLED) — its own
    // InternalApiAuthGuard is fail-closed by default (denies until
    // INTERNAL_API_BEARER_TOKEN is configured), so mounting it costs
    // nothing when unused.
    InternalApiModule,
    // FR-W6 / A-AUTH — the real `POST /api/orvex/session/exchange` session-mint
    // (consume an identity exchange token → mint an engine session). Mounted
    // unconditionally for the SAME reason as InternalApiModule: it is fail-closed
    // by default (no ORVEX_IDENTITY_URL ⇒ its composed introspector rejects every
    // mint), and it is DB-backed (UserRepo/SessionService), so — the A-BOUNDARY
    // fence forbids orvex/* from importing @docmost/* — it lives under core/ (the
    // internal-api / orvex-page-provenance precedent), not the flag-gated
    // OrvexRootModule tree. See core/session-mint/orvex-session-mint.module.ts.
    OrvexSessionMintModule,
    StorageModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    MailModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    OrvexAttachmentsHostModule,
    OrvexMailModule,
    OrvexPageProvenanceModule,
    OrvexPageVisualsModule,
    OrvexTransclusionSafeguardModule,
    // ENG-1604 AC1 DoD — wires the already-shipped OrvexMigratorService
    // (ENG-1389/ENG-1411) into the boot path. Unconditional + outside
    // OrvexRootModule, same carve-out-(b) precedent as the DB-backed
    // modules above (@InjectKysely() would break the DB-free
    // orvex-http.e2e.spec.ts harness if mounted in the gated root — see
    // orvex-root.module.ts / orvex-migrator.module.ts docstrings).
    OrvexMigratorModule,
    EventEmitterModule.forRoot(),
    OrvexEventsModule,
    SecurityModule,
    TelemetryModule,
    ThrottleModule,
    ...enterpriseModules,
    OrvexRootModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditActorInterceptor,
    },
  ],
})
export class AppModule {}
