import { DynamicModule, Logger, Module } from '@nestjs/common';
import { OrvexConfigModule } from './config/orvex-config.module';
import { PageMetaModule } from './page-meta/page-meta.module';
import { QuotaModule } from './quota/quota.module';
import { OutboxModule } from './outbox/outbox.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { SessionMintModule } from './session-mint/session-mint.module';

/**
 * OrvexRootModule — the single, inert aggregation point for every additive
 * `orvex/*` module (Architecture A-THIN: the one permitted `app.module.ts`
 * import).
 *
 * OFF BY DEFAULT. `register()` reads `ORVEX_MODULES_ENABLED` and, unless it is
 * exactly `"true"`, returns an EMPTY module — no submodule is imported, so no
 * orvex provider is ever constructed and the engine's runtime behaviour is
 * byte-for-byte vanilla Docmost v0.95.0. This is what lets the skeleton land in
 * `app.module.ts` without touching the vanilla boot path.
 *
 * When the flag is on the modules load as compiling stubs (not production
 * behaviour) — see each submodule's TODOs and the fold-in plan `qJojHbWJni`.
 */
@Module({})
export class OrvexRootModule {
  private static readonly logger = new Logger(OrvexRootModule.name);

  static register(): DynamicModule {
    const enabled = process.env.ORVEX_MODULES_ENABLED === 'true';

    if (!enabled) {
      // Inert: runtime stays vanilla. No providers, no submodules, no hooks.
      return { module: OrvexRootModule, imports: [] };
    }

    OrvexRootModule.logger.warn(
      'ORVEX_MODULES_ENABLED=true — loading additive orvex/* modules ' +
        '(scaffold seams, NOT production-ready).',
    );

    return {
      module: OrvexRootModule,
      imports: [
        OrvexConfigModule,
        PageMetaModule,
        QuotaModule,
        OutboxModule,
        ApiKeyModule,
        SessionMintModule,
      ],
    };
  }
}
