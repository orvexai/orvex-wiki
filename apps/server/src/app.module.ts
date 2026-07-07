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
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { LoggerModule } from './common/logger/logger.module';
import { ClsModule } from 'nestjs-cls';
import { NoopAuditModule } from './integrations/audit/audit.module';
import { ThrottleModule } from './integrations/throttle/throttle.module';
import { OrvexRootModule } from './orvex/orvex-root.module';
import { OrvexAttachmentsHostModule } from './orvex/attachments/orvex-attachments-host.module';
import { OrvexMailModule } from './orvex/mail/orvex-mail.module';

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
    StorageModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    MailModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    OrvexAttachmentsHostModule,
    OrvexMailModule,
    EventEmitterModule.forRoot(),
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
