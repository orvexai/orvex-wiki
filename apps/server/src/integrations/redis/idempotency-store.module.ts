import { Global, Module } from '@nestjs/common';
import { IdempotencyStore } from './idempotency-store.service';

/**
 * ENG-1413 — `@Global` so every module (page, and future write paths that
 * need cross-replica idempotency) can inject `IdempotencyStore` without
 * re-importing this module everywhere. Depends only on the already-global
 * `RedisModule` registration in `app.module.ts`.
 */
@Global()
@Module({
  providers: [IdempotencyStore],
  exports: [IdempotencyStore],
})
export class IdempotencyStoreModule {}
