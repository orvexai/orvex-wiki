import { Logger } from '@nestjs/common';

/**
 * CLOUD-clean boot decouple (FR-W20 / A-BOUNDARY task #1) — SCAFFOLD HELPER,
 * NOT WIRED.
 *
 * The deployed `app.module.ts` today does `process.exit(1)` when `CLOUD=true`
 * and the deliberately-absent `ee/ee.module` fails to load. Publishing AGPL
 * source that hard-crashes without the closed `ee/` tree is an AGPL-cleanliness
 * problem: nothing on the multi-tenant hot path may depend on `ee/`.
 *
 * This helper is the documented REPLACEMENT for that gate — it loads any
 * optional enterprise module WITHOUT exiting the process when it is absent. It
 * is intentionally left UNWIRED: swapping the `app.module.ts` try/catch is an
 * inline allow-list edit to the vanilla boot path and is out of scope for the
 * additive skeleton (leave-as-TODO rule).
 *
 * The multi-tenant hostname resolver itself is AGPL core and already present
 * (`domain.middleware.ts` `isCloud()` → `workspaceRepo.findByHostname`); only
 * the `ee.module` gate blocks enabling `CLOUD=true`.
 */
export function loadOptionalEnterpriseModules(): unknown[] {
  const logger = new Logger('OrvexBootstrap');
  const modules: unknown[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ee = require('../../ee/ee.module');
    if (ee?.EeModule) {
      modules.push(ee.EeModule);
    }
  } catch {
    // CLOUD-clean: absent `ee/` must NOT crash the process (unlike the vanilla
    // gate). Multi-tenant boot depends only on AGPL core.
    logger.log('No enterprise modules present — continuing (CLOUD-clean boot).');
  }
  return modules;
}

/**
 * `applyOrvexBootstrap` (A-THIN allow-list `main.ts` `applyOrvexBootstrap`) —
 * the single main.ts touch-point where future orvex bootstrapping (cell-topic
 * assertion, §13 source-offer route, boot-migrate advisory lock) will hang.
 * SCAFFOLD no-op so it is safe to reference; not called from the vanilla boot.
 */
export function applyOrvexBootstrap(_app: unknown): void {
  // TODO(fold-in): assert single-partition topics exist (A-CELL rule #5),
  // register the @Public §13 source-offer route (FR-W19), and take the
  // pg_advisory_xact_lock around boot-migrate (FR-W22) — or move migration
  // out-of-band to an ArgoCD PreSync Job.
}
