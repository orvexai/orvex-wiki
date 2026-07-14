import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventName } from '../../common/events/event.contants';
import { WorkspaceEvent } from '../../database/listeners/workspace.listener';
import { ApiKeyRepo } from './api-key.repo';

/**
 * ENG-1380 / AC10, ruling 7 — cross-DB delete reconcile.
 *
 * Today `api_keys.workspace_id` has an in-DB `ON DELETE CASCADE` FK, so a
 * same-database workspace row delete already removes these rows. This
 * listener is the forward-compatible reconcile path for when api-key
 * storage moves cross-DB (no CASCADE FK survives that move) — it is
 * idempotent (a targeted delete for an already-empty workspace is a
 * harmless no-op) and pairs with {@link ApiKeyRepo.sweepOrphans} as the
 * backstop for any row the event-driven path ever misses.
 */
@Injectable()
export class ApiKeyOrphanReconcileListener {
  private readonly logger = new Logger(ApiKeyOrphanReconcileListener.name);

  constructor(private readonly apiKeyRepo: ApiKeyRepo) {}

  @OnEvent(EventName.WORKSPACE_DELETED)
  async handleWorkspaceDeleted(event: WorkspaceEvent): Promise<void> {
    const deleted = await this.apiKeyRepo.hardDeleteAllForWorkspace(
      event.workspaceId,
    );
    if (deleted > 0) {
      this.logger.debug(
        `Reconciled ${deleted} orphaned api-key row(s) for deleted workspace ${event.workspaceId}`,
      );
    }
  }
}
