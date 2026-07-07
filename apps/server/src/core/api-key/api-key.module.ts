import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { OrvexAuditModule } from '../audit/orvex-audit.module';
import { ApiKeyRepo } from './api-key.repo';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { OrvexBearerAuthGuard } from './orvex-bearer-auth.guard';
import { ApiKeyOrphanReconcileListener } from './api-key-orphan-reconcile.listener';

/**
 * ENG-1380 — the clean-room AGPL api-key primitive, replacing the
 * dynamic-`require()`d EE module (jwt.strategy.ts).
 *
 * PLACEMENT DEVIATION (A-BOUNDARY #4, same precedent as
 * `UserExportModule`/ENG-1473): the ticket's file table names
 * `orvex/api-key`, but this module owns real Kysely/`@docmost/db` access
 * (repo, entity types, `TokenService`) — the repo-root `no-restricted-imports`
 * boundary fence (`eslint.config.mjs`) forbids ANY `apps/server/src/orvex/**`
 * file from statically importing `@docmost/*`, with no per-file escape
 * hatch. It therefore lives in `core/api-key/` (alongside the other
 * DB-backed core verticals), while the class names it exposes stay
 * `Orvex`-prefixed per the ticket's naming ask (`OrvexBearerAuthGuard`).
 * Exported providers are consumed by `AuthModule` (JwtStrategy DI) and by
 * anything mounting the HTTP surface.
 */
@Module({
  imports: [TokenModule, OrvexAuditModule],
  controllers: [ApiKeyController],
  providers: [
    ApiKeyRepo,
    ApiKeyService,
    OrvexBearerAuthGuard,
    ApiKeyOrphanReconcileListener,
  ],
  exports: [ApiKeyRepo, ApiKeyService],
})
export class ApiKeyModule {}
