import { Injectable, Logger } from '@nestjs/common';

/**
 * ApiKeyService — the AGPL-clean, CLEAN-ROOM api-key rebuild (FR-W7 / A-AUTH).
 *
 * HIGH LICENSING RISK / LAUNCH GATE: today's live api-key path is EE-derived
 * (`apps/server/src/ee/api-key`, runtime-required by `jwt.strategy.ts:83`) and
 * `packages/orvex-api-key` is an empty placeholder. FR-11 is unfinished until a
 * clean-room rebuild under `orvex/api-key` lands with behavioural parity and
 * `jwt.strategy.ts` is repointed off `ee/api-key`. A COPY of the EE code is NOT
 * acceptable — this must be authored from the documented behaviour only.
 *
 * SCAFFOLD: the verify/mint/hash bodies are TODO. No `ee/*` import (guard).
 */
@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  /** Validate a presented api-key token and resolve its principal + scope. */
  async verify(_token: string): Promise<null> {
    // TODO(fold-in WS-6): clean-room verify — hash lookup, tenant binding,
    // deny-by-default scope. Returns the resolved principal or null.
    return null;
  }

  /** Mint a new api-key for a tenant principal (returns the one-time secret). */
  async mint(_workspaceId: string, _scopes: string[]): Promise<null> {
    // TODO(fold-in WS-6): clean-room mint — generate, hash-at-rest, persist.
    this.logger.debug('mint() is a scaffold no-op');
    return null;
  }
}
